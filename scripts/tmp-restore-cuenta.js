const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({ host:'localhost', user:'root', password:'', database:'crm_db' });
  const [ex] = await c.query("SELECT id FROM plan_cuentas WHERE empresa_id=1 AND codigo='1.1.05.10'");
  if (ex.length) { console.log('ya existe'); await c.end(); return; }
  const [[padre]] = await c.query("SELECT id FROM plan_cuentas WHERE empresa_id=1 AND codigo='1.1.05'");
  await c.query(
    "INSERT INTO plan_cuentas (empresa_id,codigo,nombre,clasificacion,clase,grupo,cuenta,naturaleza,tipo,axl,cuenta_padre_id,estado) VALUES (1,'1.1.05.10','CAJAS MENORES',4,'1','11','1105','D',2,'',?,1)",
    [padre ? padre.id : null]);
  console.log('restaurada, padre:', padre?.id);
  await c.end();
})();
