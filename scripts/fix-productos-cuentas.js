/**
 * Asigna cuentas contables por defecto a productos que no las tengan.
 * - Inventario: 1.4.35.05 (inventario mercancías)
 * - Costos: 6.1.35.20 (costo venta productos)
 * - Ingresos: 4.1.35.20 (ingreso venta productos)
 */
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  // Buscar cuentas por defecto
  const [inv] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo LIKE '1.4.35%' LIMIT 5");
  console.log('Inventario:', inv);

  const [costo] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo='6.1.35.20' LIMIT 1");
  console.log('Costo:', costo);

  const [ingreso] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo='4.1.35.20' LIMIT 1");
  console.log('Ingreso:', ingreso);

  // Fallbacks si no hay cuentas específicas
  const invId = inv[0]?.id;
  const costoId = costo[0]?.id;
  const ingresoId = ingreso[0]?.id;

  if (!invId || !costoId || !ingresoId) {
    console.error('Faltan cuentas por defecto. invId=', invId, 'costoId=', costoId, 'ingresoId=', ingresoId);
    process.exit(1);
  }

  // Productos sin cuentas
  const [sinInv] = await c.query('SELECT id, nombre FROM productos WHERE cuenta_inventarios_id IS NULL OR cuenta_inventarios_id=0');
  const [sinCosto] = await c.query('SELECT id, nombre FROM productos WHERE cuenta_costos_id IS NULL OR cuenta_costos_id=0');
  const [sinIng] = await c.query('SELECT id, nombre FROM productos WHERE cuenta_ingresos_id IS NULL OR cuenta_ingresos_id=0');

  console.log(`\nProductos sin cuenta inventario: ${sinInv.length}`);
  console.log(`Productos sin cuenta costos: ${sinCosto.length}`);
  console.log(`Productos sin cuenta ingresos: ${sinIng.length}`);

  if (sinInv.length > 0) {
    await c.query('UPDATE productos SET cuenta_inventarios_id=? WHERE cuenta_inventarios_id IS NULL OR cuenta_inventarios_id=0', [invId]);
    console.log(`  Asignada cuenta inventario ${invId} a ${sinInv.length} productos`);
  }

  if (sinCosto.length > 0) {
    await c.query('UPDATE productos SET cuenta_costos_id=? WHERE cuenta_costos_id IS NULL OR cuenta_costos_id=0', [costoId]);
    console.log(`  Asignada cuenta costos ${costoId} a ${sinCosto.length} productos`);
  }

  if (sinIng.length > 0) {
    await c.query('UPDATE productos SET cuenta_ingresos_id=? WHERE cuenta_ingresos_id IS NULL OR cuenta_ingresos_id=0', [ingresoId]);
    console.log(`  Asignada cuenta ingresos ${ingresoId} a ${sinIng.length} productos`);
  }

  // Verificar
  const [resumen] = await c.query(`
    SELECT
      SUM(CASE WHEN cuenta_inventarios_id IS NULL OR cuenta_inventarios_id=0 THEN 1 ELSE 0 END) AS sin_inv,
      SUM(CASE WHEN cuenta_costos_id IS NULL OR cuenta_costos_id=0 THEN 1 ELSE 0 END) AS sin_costo,
      SUM(CASE WHEN cuenta_ingresos_id IS NULL OR cuenta_ingresos_id=0 THEN 1 ELSE 0 END) AS sin_ing,
      COUNT(*) AS total
    FROM productos
  `);
  console.log('\nResumen después:', resumen[0]);

  await c.end();
})().catch(console.error);
