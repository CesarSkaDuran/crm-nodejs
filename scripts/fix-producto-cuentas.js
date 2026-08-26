const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  // Ver cuentas del producto 1
  const [prod] = await c.query('SELECT id, nombre, cuenta_inventarios_id, cuenta_costos_id, cuenta_ingresos_id FROM productos WHERE id=1');
  console.log('producto antes', prod);

  // Cuentas correctas
  const [inv] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo='1.1.43.05' OR nombre LIKE '%inventario mercancia%' LIMIT 5");
  console.log('inventario', inv);

  const [costo] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo='6.1.35.20' LIMIT 5");
  console.log('costo', costo);

  const [ingreso] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo='4.1.35.20' LIMIT 5");
  console.log('ingreso', ingreso);

  // Asignar cuentas correctas
  await c.query('UPDATE productos SET cuenta_inventarios_id=?, cuenta_costos_id=?, cuenta_ingresos_id=? WHERE id=1', [
    inv[0]?.id || 1,
    costo[0]?.id || 3,
    ingreso[0]?.id || 255,
  ]);

  const [prod2] = await c.query('SELECT id, nombre, cuenta_inventarios_id, cuenta_costos_id, cuenta_ingresos_id FROM productos WHERE id=1');
  console.log('producto después', prod2);

  await c.end();
})().catch(console.error);
