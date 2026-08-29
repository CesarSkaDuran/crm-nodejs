/**
 * Crea 4 productos de prueba y una compra de entrada para cada uno.
 * Luego reconstruye el kardex.
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

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
    console.log('Obteniendo datos base...');

    // Buscar empresa, proveedor y cuentas por defecto
    const [[empresa]] = await c.query('SELECT id FROM empresas LIMIT 1');
    const [[proveedor]] = await c.query('SELECT id FROM terceros WHERE tipo_terceros = 2 AND estado = 1 LIMIT 1');
    const [[productoBase]] = await c.query('SELECT cuenta_inventarios_id, cuenta_costos_id, cuenta_ingresos_id FROM productos WHERE estado = 1 LIMIT 1');

    if (!empresa || !proveedor || !productoBase) {
      throw new Error('Falta empresa, proveedor o producto base con cuentas contables');
    }

    const empresaId = empresa.id;
    const proveedorId = proveedor.id;
    const { cuenta_inventarios_id, cuenta_costos_id, cuenta_ingresos_id } = productoBase;

    const productos = [
      { codigo: 'PROD001', nombre: 'Producto A', costo: 500, cantidad: 10 },
      { codigo: 'PROD002', nombre: 'Producto B', costo: 750, cantidad: 8 },
      { codigo: 'PROD003', nombre: 'Producto C', costo: 250, cantidad: 20 },
      { codigo: 'PROD004', nombre: 'Producto D', costo: 1200, cantidad: 5 },
    ];

    // Insertar productos
    const idsProductos = [];
    for (const p of productos) {
      const [res] = await c.query(
        `INSERT INTO productos
        (empresa_id, codigo, nombre, descripcion, tipo, stock, promedio, saldo_inventario, ultimo_precio, pvp1, pvp2, pvp3, pvp4, pvp5, cuenta_inventarios_id, cuenta_costos_id, cuenta_ingresos_id, estado)
        VALUES (?, ?, ?, '', 1, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [empresaId, p.codigo, p.nombre, p.costo * 1.5, p.costo * 1.4, p.costo * 1.3, p.costo * 1.6, p.costo * 2, cuenta_inventarios_id, cuenta_costos_id, cuenta_ingresos_id]
      );
      idsProductos.push({ id: res.insertId, ...p });
      console.log(`Producto creado: ${p.nombre} (ID: ${res.insertId})`);
    }

    // Crear una compra
    const fecha = new Date().toISOString().split('T')[0];
    const [compraRes] = await c.query(
      `INSERT INTO compras
      (empresa_id, proveedor_id, usuario_id, codigo, fecha, concepto, descuento, retencion, flete, impuesto, subtotal, total, estado)
      VALUES (?, ?, NULL, ?, ?, 'Compra de mercancía de prueba', 0, 0, 0, 0, 0, 0, 1)`,
      [empresaId, proveedorId, `FC${Date.now()}`, fecha]
    );
    const compraId = compraRes.insertId;
    console.log(`Compra creada: ID ${compraId}`);

    let subtotal = 0;
    let impuesto = 0;
    let total = 0;

    // Insertar detalles de compra
    for (const p of idsProductos) {
      const neto = round2(p.cantidad * p.costo);
      subtotal += neto;
      total += neto;

      await c.query(
        `INSERT INTO detalle_compras
        (compra_id, producto_id, cantidad, costo_unitario, descuento, impuesto, subtotal, estado)
        VALUES (?, ?, ?, ?, 0, 0, ?, 1)`,
        [compraId, p.id, p.cantidad, p.costo, neto]
      );
      console.log(`Detalle de compra: ${p.nombre} x ${p.cantidad} @ ${p.costo}`);
    }

    // Actualizar totales de la compra
    await c.query(
      'UPDATE compras SET subtotal = ?, total = ? WHERE id = ?',
      [subtotal, total, compraId]
    );

    console.log('\nReconstruyendo kardex...');
    // Ejecutar el rebuild-kardex
    const rebuildPath = path.join(__dirname, 'rebuild-kardex.js');
    const rebuild = require(rebuildPath);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await c.end();
  }
})();
