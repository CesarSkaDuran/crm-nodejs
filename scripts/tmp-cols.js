const m = require('mysql2/promise');
(async () => {
  const db = await m.createConnection({ host: 'localhost', user: 'root', password: '', database: 'crm_db' });
  const [c] = await db.query("SHOW COLUMNS FROM contabilidad WHERE Field IN ('descripcion','consecutivo','usuario','naturaleza')");
  console.log(c.map((x) => `${x.Field} ${x.Type}`).join('\n'));
  const [a] = await db.query("SHOW COLUMNS FROM asentados WHERE Field IN ('descripcion','tipo','consecutivo','usuario')");
  console.log(a.map((x) => `${x.Field} ${x.Type}`).join('\n'));
  const [cu] = await db.query("SHOW COLUMNS FROM cuotas_credito");
  console.log(cu.map((x) => `${x.Field} ${x.Type}`).join('\n'));
  await db.end();
})();
