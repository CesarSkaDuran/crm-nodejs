const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({ host:'localhost', user:'root', password:'', database:'crm_db' });
  const [rows] = await c.query(
    "SELECT id, codigo, nombre, clasificacion FROM plan_cuentas WHERE empresa_id=1 AND (codigo LIKE '5.3.05%' OR codigo LIKE '2.4.08%' OR LOWER(nombre) LIKE '%comision%' OR LOWER(nombre) LIKE '%1000%' OR LOWER(nombre) LIKE '%gmf%') ORDER BY codigo");
  console.log(JSON.stringify(rows, null, 1));
  await c.end();
})();
