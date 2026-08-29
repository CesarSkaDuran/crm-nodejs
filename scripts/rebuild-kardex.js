/**
 * Reconstruye el kardex y el costo promedio ponderado de todos los productos.
 * Usa promedio ponderado perpetuo, ordenado por fecha ASC y luego por id ASC.
 */
const mysql = require('mysql2/promise');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  try {
    console.log('Reconstruyendo kardex...');

    // 1. Limpiar kardex existente
    await c.query('DELETE FROM kardex');
    console.log('Kardex actual limpiado.');

    // 2. Reiniciar saldo_inventario y stock de productos
    // Importante: NO tocamos promedio aún, lo recalculamos
    await c.query('UPDATE productos SET saldo_inventario = 0, stock = 0, promedio = 0');
    console.log('Productos reseteados.');

    // 3. Obtener todas las compras y ventas con sus detalles y fechas
    const [compras] = await c.query(`
      SELECT cd.id, cd.producto_id, cd.cantidad, cd.costo_unitario, cd.descuento, cd.impuesto, c.fecha, c.id AS documento_id, c.codigo AS consecutivo, c.empresa_id
      FROM detalle_compras cd
      JOIN compras c ON c.id = cd.compra_id
      WHERE c.estado = 1
      ORDER BY c.fecha ASC, c.id ASC, cd.id ASC
    `);

    const [ventas] = await c.query(`
      SELECT vd.id, vd.producto_id, vd.cantidad, vd.precio_unitario, vd.costo_unitario, vd.descuento, vd.impuesto, v.fecha, v.id AS documento_id, v.codigo AS consecutivo, v.empresa_id
      FROM detalle_ventas vd
      JOIN ventas v ON v.id = vd.venta_id
      WHERE v.estado = 1
      ORDER BY v.fecha ASC, v.id ASC, vd.id ASC
    `);

    // 4. Combinar todos los movimientos (forzar conversión a número)
    const movimientos = [
      ...compras.map((m) => ({
        id: Number(m.id),
        producto_id: Number(m.producto_id),
        cantidad: Number(m.cantidad),
        costo_unitario: Number(m.costo_unitario),
        descuento: Number(m.descuento || 0),
        impuesto: Number(m.impuesto || 0),
        fecha: m.fecha,
        documento_id: Number(m.documento_id),
        consecutivo: m.consecutivo,
        empresa_id: Number(m.empresa_id),
        tipo: 'compra',
      })),
      ...ventas.map((m) => ({
        id: Number(m.id),
        producto_id: Number(m.producto_id),
        cantidad: Number(m.cantidad),
        precio_unitario: Number(m.precio_unitario),
        costo_unitario: Number(m.costo_unitario),
        descuento: Number(m.descuento || 0),
        impuesto: Number(m.impuesto || 0),
        fecha: m.fecha,
        documento_id: Number(m.documento_id),
        consecutivo: m.consecutivo,
        empresa_id: Number(m.empresa_id),
        tipo: 'venta',
      })),
    ];

    // 5. Ordenar por fecha, luego tipo (compras antes que ventas), luego documento_id, luego detalle id
    movimientos.sort((a, b) => {
      if (a.fecha < b.fecha) return -1;
      if (a.fecha > b.fecha) return 1;
      // Compras antes que ventas en la misma fecha
      if (a.tipo === 'compra' && b.tipo === 'venta') return -1;
      if (a.tipo === 'venta' && b.tipo === 'compra') return 1;
      if (a.documento_id < b.documento_id) return -1;
      if (a.documento_id > b.documento_id) return 1;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });

    // 6. Procesar secuencialmente por producto
    const estados = {}; // producto_id -> { cantidad, valor }

    for (const m of movimientos) {
      const pid = m.producto_id;
      if (!estados[pid]) {
        estados[pid] = { cantidad: 0, valor: 0 };
      }

      const estado = estados[pid];
      const cantidadAnterior = round2(estado.cantidad);
      const saldoAnterior = round2(estado.valor);
      const promedioAnterior = cantidadAnterior > 0 ? round4(saldoAnterior / cantidadAnterior) : 0;

      let cantidadActual, saldoActual, promedioActual, valorUnitario, total, entradas = 0, salidas = 0, valorEntradas = 0, valorSalidas = 0, precioVenta = 0;

      if (m.tipo === 'compra') {
        const bruto = round2(Number(m.cantidad) * Number(m.costo_unitario));
        const descuento = round2((bruto * Number(m.descuento || 0)) / 100);
        const neto = round2(bruto - descuento);

        cantidadActual = round2(cantidadAnterior + Number(m.cantidad));
        saldoActual = round2(saldoAnterior + neto);
        promedioActual = cantidadActual > 0 ? round4(saldoActual / cantidadActual) : round4(Number(m.costo_unitario));
        valorUnitario = round4(Number(m.costo_unitario));
        total = neto;
        entradas = Number(m.cantidad);
        valorEntradas = neto;
      } else {
        // Venta
        const costoUnitario = promedioAnterior;
        const costoTotal = round2(Number(m.cantidad) * costoUnitario);

        if (Number(m.cantidad) > cantidadAnterior) {
          console.warn(`Venta ${m.consecutivo} del producto ${pid} excede stock: ${m.cantidad} > ${cantidadAnterior}`);
        }

        cantidadActual = round2(Math.max(0, cantidadAnterior - Number(m.cantidad)));
        saldoActual = round2(Math.max(0, saldoAnterior - costoTotal));
        promedioActual = cantidadActual > 0 ? round4(saldoActual / cantidadActual) : 0;
        valorUnitario = round4(costoUnitario);
        total = costoTotal;
        salidas = Number(m.cantidad);
        valorSalidas = costoTotal;
        precioVenta = round4(Number(m.precio_unitario));
      }

      // Insertar kardex
      await c.query(`
        INSERT INTO kardex
        (empresa_id, producto_id, tipo_documento, documento_id, consecutivo, fecha, cantidad_anterior, saldo_anterior, promedio_anterior, valor_unitario, entradas, salidas, valor_entradas, valor_salidas, total, cantidad_actual, saldo_actual, promedio_actual, precio_venta, estado)
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        m.empresa_id || 1,
        pid,
        m.tipo,
        m.documento_id,
        m.consecutivo,
        m.fecha,
        cantidadAnterior,
        saldoAnterior,
        promedioAnterior,
        valorUnitario,
        entradas,
        salidas,
        valorEntradas,
        valorSalidas,
        total,
        cantidadActual,
        saldoActual,
        promedioActual,
        precioVenta,
      ]);

      // Actualizar estado
      estado.cantidad = cantidadActual;
      estado.valor = saldoActual;

      // Actualizar producto
      await c.query(
        'UPDATE productos SET stock = ?, saldo_inventario = ?, promedio = ? WHERE id = ?',
        [cantidadActual, saldoActual, promedioActual, pid]
      );
    }

    console.log('Kardex reconstruido correctamente. Registros:', movimientos.length);
    console.log('Productos actualizados:', Object.keys(estados).length);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await c.end();
  }
})();
