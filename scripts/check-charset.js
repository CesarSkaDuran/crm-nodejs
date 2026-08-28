const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  const [r1] = await c.query(
    "SELECT default_character_set_name AS charset, default_collation_name AS collation FROM information_schema.SCHEMATA WHERE schema_name = 'crm_db'",
  );
  console.log('DB charset:', r1);

  const [r2] = await c.query(
    "SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'crm_db' AND TABLE_NAME IN ('terceros','contabilidad','plan_cuentas','ventas','sale_details')",
  );
  console.log('Tables:', r2);

  const [r3] = await c.query(
    "SELECT COLUMN_NAME, CHARACTER_SET_NAME, COLLATION_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'crm_db' AND TABLE_NAME = 'terceros' AND COLUMN_NAME IN ('nombre','apellido','direccion','ciudad')",
  );
  console.log('Columns terceros:', r3);

  // Verificar si hay mojibake en los datos actuales
  const [r4] = await c.query(
    "SELECT id, nombre, ciudad FROM terceros WHERE nombre LIKE '%Ã%' OR nombre LIKE '%Â%' OR ciudad LIKE '%Ã%' OR ciudad LIKE '%Â%' LIMIT 5",
  );
  console.log('Terceros con mojibake:', r4.length, r4);

  await c.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
