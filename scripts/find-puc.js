const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  const [sample] = await c.query('SELECT id, codigo, nombre FROM plan_cuentas LIMIT 15');
  console.log('sample', sample);

  const [ingresos] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo LIKE '4%' LIMIT 10");
  console.log('ingresos', ingresos);

  const [costos] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE codigo LIKE '6%' LIMIT 10");
  console.log('costos', costos);

  const [iva] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE nombre LIKE '%iva%' OR codigo LIKE '%2408%' LIMIT 10");
  console.log('iva', iva);

  const [retencion] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE nombre LIKE '%retencion%' OR codigo LIKE '%2365%' LIMIT 10");
  console.log('retencion', retencion);

  const [flete] = await c.query("SELECT id, codigo, nombre FROM plan_cuentas WHERE nombre LIKE '%flete%' OR codigo LIKE '%2335%' OR codigo LIKE '%4235%' LIMIT 10");
  console.log('flete', flete);

  await c.end();
})().catch(console.error);
