const m = require('mysql2/promise');
(async () => {
  const db = await m.createConnection({ host: 'localhost', user: 'root', password: '', database: 'crm_db' });

  // 1. Revertir cobro COP de prueba (CB000074, asentado 123) sobre credito 11
  await db.query("UPDATE cuotas_credito SET abonado=0, saldo=valor, estado=1, numero_recibo=NULL, asentado_id=NULL, fecha_pago_efectivo=NULL, banco_id=NULL WHERE credito_id=11 AND asentado_id=123");
  await db.query("UPDATE cuotas_credito SET abonado=100, saldo=215.98, estado=3, fecha_pago_efectivo=NULL, banco_id=NULL WHERE id=15");
  await db.query("UPDATE creditos SET saldo=1163.90, cuotas_pagadas=1, estado=1, fecha_ultimo_pago=NULL WHERE id=11");

  // 2. Asientos de prueba: CB000074, CB000075, CB000077 y los de ventas FV000026/27
  const [asientos] = await db.query(
    "SELECT id FROM asentados WHERE consecutivo IN ('CB000074','CB000075','CB000077') OR descripcion LIKE 'Venta FV000026%' OR descripcion LIKE 'Venta FV000027%'",
  );
  for (const a of asientos) {
    await db.query('DELETE FROM contabilidad WHERE asentado_id=?', [a.id]);
  }
  await db.query("DELETE FROM asentados WHERE consecutivo IN ('CB000074','CB000075','CB000077') OR descripcion LIKE 'Venta FV000026%' OR descripcion LIKE 'Venta FV000027%'");
  console.log('asientos borrados:', asientos.length);

  // 3. Creditos/cuotas de las ventas USD
  const [crs] = await db.query("SELECT id FROM creditos WHERE documento_origen IN ('FV000026','FV000027')");
  for (const c of crs) {
    await db.query('DELETE FROM cuotas_credito WHERE credito_id=?', [c.id]);
  }
  await db.query("DELETE FROM creditos WHERE documento_origen IN ('FV000026','FV000027')");

  // 4. Ventas FV000026/27 + detalles + kardex
  const [vs] = await db.query("SELECT id FROM ventas WHERE codigo IN ('FV000026','FV000027')");
  for (const v of vs) {
    await db.query('DELETE FROM detalle_ventas WHERE venta_id=?', [v.id]);
    await db.query('DELETE FROM kardex WHERE documento_id=? AND tipo_documento="venta"', [v.id]);
  }
  await db.query("DELETE FROM ventas WHERE codigo IN ('FV000026','FV000027')");

  // 5. Restaurar banco y producto
  await db.query('UPDATE bancos SET monto=9938803.98 WHERE id=2');
  const [[p]] = await db.query('SELECT promedio FROM productos WHERE id=2');
  await db.query('UPDATE productos SET stock=36, saldo_inventario=ROUND(36*?,2) WHERE id=2', [p.promedio]);

  // Verificación final
  const [[cr11]] = await db.query('SELECT saldo, cuotas_pagadas FROM creditos WHERE id=11');
  const [[bn]] = await db.query('SELECT monto FROM bancos WHERE id=2');
  const [[pr]] = await db.query('SELECT stock, saldo_inventario FROM productos WHERE id=2');
  const [rem] = await db.query("SELECT id FROM ventas WHERE codigo IN ('FV000026','FV000027')");
  console.log('cr11:', JSON.stringify(cr11), '| banco:', bn.monto, '| prod2:', JSON.stringify(pr), '| ventas test restantes:', rem.length);
  await db.end();
})();
