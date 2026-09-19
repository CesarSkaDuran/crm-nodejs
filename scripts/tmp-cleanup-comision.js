const m = require('mysql2/promise');
(async () => {
  const c = await m.createConnection({ host:'localhost', user:'root', password:'', database:'crm_db' });
  // Crédito 22 + cuotas
  await c.query("UPDATE creditos SET estado=0, saldo=0 WHERE id=22");
  await c.query("UPDATE cuotas_credito SET estado=0, saldo=0 WHERE credito_id=22");
  // Asientos del crédito manual (CR...) y del cobro CB000086
  const [as] = await c.query(
    "SELECT id, consecutivo FROM asentados WHERE consecutivo='CB000086' OR descripcion='test comision'");
  console.log('asientos:', JSON.stringify(as));
  for (const a of as) {
    await c.query('UPDATE asentados SET estado=0 WHERE id=?', [a.id]);
    await c.query('UPDATE contabilidad SET estado=0 WHERE asentado_id=?', [a.id]);
  }
  // Revertir banco: +99005 del cobro neto
  await c.query('UPDATE bancos SET monto = monto - 99005 WHERE id=1');
  const [[b]] = await c.query('SELECT monto FROM bancos WHERE id=1');
  console.log('banco:', b.monto);
  const [[cr]] = await c.query('SELECT id, estado, saldo FROM creditos WHERE id=22');
  console.log('credito:', JSON.stringify(cr));
  await c.end();
})().catch(e=>{console.error(e);process.exit(1);});
