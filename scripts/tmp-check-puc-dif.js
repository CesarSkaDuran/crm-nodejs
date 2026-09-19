const m = require('mysql2/promise');
(async () => {
  const db = await m.createConnection({ host: 'localhost', user: 'root', password: '', database: 'crm_db' });
  const [r] = await db.query(
    "SELECT codigo,nombre,clasificacion FROM plan_cuentas WHERE empresa_id=1 AND (codigo LIKE '5.3.05%' OR codigo LIKE '4.2.10%' OR nombre LIKE '%diferencia%' OR nombre LIKE '%cambio%') ORDER BY codigo",
  );
  console.log(JSON.stringify(r, null, 1));
  await db.end();
})();
