const m = require('mysql2/promise');
(async () => {
  const db = await m.createConnection({ host:'localhost', user:'root', password:'', database:'crm_db' });

  // 1. Anular créditos huérfanos de las ventas test anuladas
  const [crs] = await db.query(
    "SELECT c.id, c.saldo, c.estado, v.codigo FROM creditos c JOIN ventas v ON v.codigo=c.documento_origen WHERE v.concepto='Venta test USD'");
  console.log('creditos:', JSON.stringify(crs));
  for (const c of crs) {
    await db.query('UPDATE creditos SET estado=0, saldo=0 WHERE id=?', [c.id]);
    await db.query("UPDATE cuotas_credito SET estado=0, saldo=0 WHERE credito_id=?", [c.id]);
  }

  // 2. Anular asiento de cobro CB000081 y revertir banco
  const [[asent]] = await db.query("SELECT id FROM asentados WHERE consecutivo='CB000081' AND estado=1");
  if (asent) {
    const [lin] = await db.query(
      "SELECT l.id, l.debito, l.credito, pc.codigo FROM contabilidad l JOIN plan_cuentas pc ON pc.id=l.cuenta_contable_id WHERE l.asentado_id=?",
      [asent.id]);
    console.log('lineas asiento:', JSON.stringify(lin));
    const debitoBanco = lin.find((l) => Number(l.debito) > 0);
    await db.query('UPDATE asentados SET estado=0 WHERE id=?', [asent.id]);
    await db.query('UPDATE contabilidad SET estado=0 WHERE asentado_id=?', [asent.id]);
    if (debitoBanco) {
      const [[b]] = await db.query('SELECT id, monto FROM bancos WHERE id=1');
      await db.query('UPDATE bancos SET monto = monto - ? WHERE id=1', [Number(debitoBanco.debito)]);
      const [[b2]] = await db.query('SELECT monto FROM bancos WHERE id=1');
      console.log('banco:', b.monto, '->', b2.monto);
    }
  }

  // 3. Stock: las ventas test consumieron stock; al anularlas se restaura? verificar
  const [[prod]] = await db.query("SELECT id, stock FROM productos WHERE id=(SELECT producto_id FROM detalle_ventas WHERE venta_id IN (33,34,35) LIMIT 1)");
  console.log('producto stock:', JSON.stringify(prod));

  const [resto] = await db.query("SELECT id, codigo, estado FROM ventas WHERE concepto='Venta test USD'");
  console.log('ventas test final:', JSON.stringify(resto));
  await db.end();
})().catch(e=>{console.error(e);process.exit(1);});
