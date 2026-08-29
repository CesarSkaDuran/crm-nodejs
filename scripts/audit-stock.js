const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  try {
    console.log('=== AUDITORIA DE STOCK Y VENTAS ===\n');

    // 1. Estado actual de productos
    const [productos] = await c.query('SELECT id, codigo, nombre, stock, saldo_inventario, promedio, estado FROM productos ORDER BY id');
    console.log('Productos en BD:');
    console.table(productos);

    // 2. Ventas registradas
    const [ventas] = await c.query('SELECT id, codigo, fecha, total, estado FROM ventas ORDER BY id');
    console.log('\nVentas registradas:');
    console.table(ventas);

    // 3. Detalles de ventas
    const [detallesVentas] = await c.query(`
      SELECT vd.id, v.codigo AS venta, vd.producto_id, p.nombre, vd.cantidad, vd.precio_unitario, vd.costo_unitario, vd.subtotal
      FROM detalle_ventas vd
      JOIN ventas v ON v.id = vd.venta_id
      JOIN productos p ON p.id = vd.producto_id
      ORDER BY v.id, vd.id
    `);
    console.log('\nDetalles de ventas:');
    console.table(detallesVentas);

    // 4. Compras registradas
    const [compras] = await c.query('SELECT id, codigo, fecha, total, estado FROM compras ORDER BY id');
    console.log('\nCompras registradas:');
    console.table(compras);

    // 5. Detalles de compras
    const [detallesCompras] = await c.query(`
      SELECT cd.id, c.codigo AS compra, cd.producto_id, p.nombre, cd.cantidad, cd.costo_unitario, cd.subtotal
      FROM detalle_compras cd
      JOIN compras c ON c.id = cd.compra_id
      JOIN productos p ON p.id = cd.producto_id
      ORDER BY c.id, cd.id
    `);
    console.log('\nDetalles de compras:');
    console.table(detallesCompras);

    // 6. Kardex
    const [kardex] = await c.query(`
      SELECT k.id, k.consecutivo, k.tipo_documento, k.fecha, p.nombre AS producto, k.entradas, k.salidas, k.cantidad_actual, k.saldo_actual, k.promedio_actual
      FROM kardex k
      JOIN productos p ON p.id = k.producto_id
      ORDER BY k.fecha, k.id
    `);
    console.log('\nKardex:');
    console.table(kardex);

    // 7. Verificar inconsistencias
    console.log('\n=== VERIFICACION DE INCONSISTENCIAS ===');

    for (const p of productos) {
      // Calcular stock esperado desde kardex
      const [[kardexProd]] = await c.query(
        'SELECT COALESCE(SUM(entradas - salidas), 0) AS stock_calc, COALESCE(SUM(valor_entradas - valor_salidas), 0) AS saldo_calc FROM kardex WHERE producto_id = ?',
        [p.id]
      );
      const stockCalc = Number(kardexProd.stock_calc);
      const saldoCalc = Number(kardexProd.saldo_calc);
      const stockBD = Number(p.stock);
      const saldoBD = Number(p.saldo_inventario);

      if (stockCalc !== stockBD || Math.abs(saldoCalc - saldoBD) > 0.01) {
        console.log(`\nINCONSISTENCIA ${p.nombre} (ID ${p.id}):`);
        console.log(`  Stock BD: ${stockBD} | Stock Kardex: ${stockCalc} ${stockCalc !== stockBD ? '*** DIFIERE ***' : ''}`);
        console.log(`  Saldo BD: ${saldoBD} | Saldo Kardex: ${saldoCalc} ${Math.abs(saldoCalc - saldoBD) > 0.01 ? '*** DIFIERE ***' : ''}`);
      } else {
        console.log(`OK: ${p.nombre} - Stock: ${stockBD}, Saldo: ${saldoBD}`);
      }
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await c.end();
  }
})();
