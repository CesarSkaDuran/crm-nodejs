const http = require('http');
const m = require('mysql2/promise');
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: 'localhost', port: 3000, path: '/api/v1' + path, method,
        headers: { 'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => { let buf=''; res.on('data',c=>buf+=c); res.on('end',()=>resolve({status:res.statusCode,body:buf})); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
(async () => {
  const login = await req('POST', '/autenticacion/iniciar-sesion', { email:'admin@demo.com', password:'admin123', codigo_empresa:'DEMO' });
  const token = JSON.parse(login.body).access_token;
  const db = await m.createConnection({ host:'localhost', user:'root', password:'', database:'crm_db' });

  // Anular ventas USD de prueba (33,34,35)
  const [vts] = await db.query("SELECT id, codigo, estado FROM ventas WHERE concepto='Venta test USD'");
  console.log('ventas test:', JSON.stringify(vts));
  for (const v of vts) {
    if (Number(v.estado) === 1) {
      const r = await req('POST', `/ventas/${v.id}/anular`, { motivo: 'limpieza test' }, token);
      console.log('anular', v.codigo, r.status);
    }
  }

  // Revisar restos de créditos test y asientos de cobro CB000081
  const [crs] = await db.query("SELECT id, saldo, estado FROM creditos WHERE documento_origen IN (SELECT codigo FROM ventas WHERE concepto='Venta test USD')");
  console.log('creditos restantes:', JSON.stringify(crs));
  const [asent] = await db.query("SELECT id, consecutivo, estado FROM asentados WHERE consecutivo='CB000081'");
  console.log('asiento cobro:', JSON.stringify(asent));
  // El asiento de cobro no se anula con la venta; lo dejamos (es historia contable real) o lo anulamos
  // Anular el asiento del cobro para limpiar la prueba
  if (asent.length) {
    await db.query('UPDATE asentados SET estado=0 WHERE id=?', [asent[0].id]);
    await db.query('UPDATE contabilidad SET estado=0 WHERE asentado_id=?', [asent[0].id]);
    // devolver el dinero al banco
    const [lin] = await db.query("SELECT banco_id, debito FROM contabilidad WHERE asentado_id=? AND debito>0", [asent[0].id]);
    console.log('lineas cobro:', JSON.stringify(lin));
  }
  // Restaurar banco (le entraron 320930 de más)
  const [[b]] = await db.query('SELECT id, nombre, monto FROM bancos WHERE id=1');
  console.log('banco antes:', JSON.stringify(b));
  await db.end();
})().catch(e=>{console.error(e);process.exit(1);});
