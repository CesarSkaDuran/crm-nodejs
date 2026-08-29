const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  try {
    console.log('=== LIMPIEZA COMPLETA KARDEX, COMPRAS Y VENTAS ===\n');

    // 1. Eliminar kardex
    await c.query('DELETE FROM kardex');
    console.log('Kardex eliminado.');

    // 2. Eliminar detalles de ventas y ventas
    await c.query('DELETE FROM detalle_ventas');
    await c.query('DELETE FROM ventas');
    console.log('Ventas eliminadas.');

    // 3. Eliminar detalles de compras y compras
    await c.query('DELETE FROM detalle_compras');
    await c.query('DELETE FROM compras');
    console.log('Compras eliminadas.');

    // 4. Resetear productos (stock, saldo, promedio, ultimo_precio)
    await c.query('UPDATE productos SET stock = 0, saldo_inventario = 0, promedio = 0, ultimo_precio = 0');
    console.log('Productos reseteados.');

    // 5. Resetear consecutivos de la empresa
    await c.query('UPDATE empresas SET consecutivo_compras = 0, consecutivo_ventas = 0, consecutivo_asientos = 0');
    console.log('Consecutivos reseteados.');

    // 6. Limpiar asientos contables generados por compras/ventas
    await c.query('DELETE FROM contabilidad');
    await c.query('DELETE FROM asentados');
    console.log('Asientos contables eliminados.');

    // 7. Verificar estado final
    const [prods] = await c.query('SELECT id, codigo, nombre, stock, saldo_inventario, promedio FROM productos ORDER BY id');
    console.log('\nEstado final de productos:');
    console.table(prods);

    console.log('\nLimpieza completa. Listo para hacer compras y ventas de prueba.');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await c.end();
  }
})();
