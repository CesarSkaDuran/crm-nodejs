const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({ host:'localhost', user:'root', password:'', database:'crm_db' });
  const [ex] = await c.query("SELECT id FROM plan_cuentas WHERE empresa_id=1 AND codigo='5.3.05.25'");
  if (ex.length) { console.log('ya existe', ex[0].id); await c.end(); return; }
  const [r] = await c.query(
    "INSERT INTO plan_cuentas (empresa_id,codigo,nombre,clasificacion,clase,grupo,cuenta,naturaleza,tipo,axl,cuenta_padre_id,estado) VALUES (1,'5.3.05.25','GMF 4X1000',4,'5','53','5305','D',2,'',498,1)");
  console.log('creada id', r.insertId);
  await c.end();
})();
