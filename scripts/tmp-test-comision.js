const http = require('http');
const m = require('mysql2/promise');
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host:'localhost', port:3000, path:'/api/v1'+path, method,
        headers:{'Content-Type':'application/json',
          ...(token?{Authorization:`Bearer ${token}`}:{}) ,
          ...(data?{'Content-Length':Buffer.byteLength(data)}:{}) }},
      (res)=>{let b='';res.on('data',c=>b+=c);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(b||'{}')})}catch{resolve({status:res.statusCode,body:b})}});});
    r.on('error',reject); if(data)r.write(data); r.end();
  });
}
(async () => {
  const login = await req('POST','/autenticacion/iniciar-sesion',{email:'admin@demo.com',password:'admin123',codigo_empresa:'DEMO'});
  const token = login.body.access_token;
  const db = await m.createConnection({host:'localhost',user:'root',password:'',database:'crm_db'});

  // Crédito manual COP 100.000
  const cred = await req('POST','/cartera/credito',{
    tercero_id: 8, fecha: '2026-09-15', monto_total: 100000, numero_cuotas: 1, periodo: 3,
    observacion: 'test comision', tasa_mora: 0,
  }, token);
  console.log('credito:', cred.status, JSON.stringify(cred.body).slice(0,300));
  const credId = cred.body.credito?.id || cred.body.id;
  if (!credId) { await db.end(); return; }

  const [[banco]] = await db.query("SELECT id, monto FROM bancos WHERE empresa_id=1 AND estado=1 LIMIT 1");
  const tipos = await req('GET','/tipo-comprobantes',null,token);
  const tipo = (tipos.body.data ?? tipos.body ?? [])[0];

  // Cobro 100.000 con comisión 0.5% gravada + GMF
  const cobro = await req('POST','/cartera/cobro',{
    credito_id: credId, fecha: '2026-09-15', tipo_comprobante_id: tipo.id, banco_id: banco.id,
    valor: 100000, descripcion: 'Cobro test comisión', pagar_todo: false,
    comision_porcentaje: 0.5, comision_gravada: true, aplicar_gmf: true,
  }, token);
  console.log('cobro:', cobro.status, JSON.stringify(cobro.body).slice(0,500));

  const [lin] = await db.query(
    "SELECT pc.codigo, pc.nombre, l.debito, l.credito FROM contabilidad l JOIN plan_cuentas pc ON pc.id=l.cuenta_contable_id WHERE l.asentado_id=? ORDER BY l.id",
    [cobro.body.asentado?.id]);
  console.log('lineas:', JSON.stringify(lin));

  const [[b2]] = await db.query("SELECT monto FROM bancos WHERE id=?", [banco.id]);
  console.log('banco:', banco.monto, '->', b2.monto, '(esperado +99005)');

  // Anular para limpiar
  await db.query('UPDATE asentados SET estado=0 WHERE id IN (SELECT asentado_id FROM creditos WHERE id=?)', [credId]);
  await db.end();
})().catch(e=>{console.error(e);process.exit(1);});
