const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({ host:'localhost', user:'root', password:'', database:'crm_db' });
  const [cr] = await c.query('SELECT id, estado, saldo FROM creditos WHERE id IN (17,18,19)');
  console.log('creditos:', JSON.stringify(cr));
  const [a] = await c.query("SELECT consecutivo, estado FROM asentados WHERE consecutivo='CB000081'");
  console.log('asiento:', JSON.stringify(a));
  const [l] = await c.query('SELECT COUNT(*) n FROM contabilidad WHERE asentado_id=131 AND estado=1');
  console.log('lineas activas:', JSON.stringify(l));
  const [v] = await c.query("SELECT codigo, estado FROM ventas WHERE concepto='Venta test USD'");
  console.log('ventas:', JSON.stringify(v));
  await c.end();
})().catch(e=>{console.error(e);process.exit(1);});
