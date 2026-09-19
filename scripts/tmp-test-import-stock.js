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

  const [[p1]] = await db.query("SELECT id, codigo, stock, saldo_inventario, promedio FROM productos WHERE empresa_id=1 AND estado=1 AND stock>0 LIMIT 1");
  console.log('producto existente antes:', JSON.stringify(p1));

  const imp = await req('POST','/productos/import',{ filas: [
    { codigo: 'TESTIMP1', nombre: 'Producto import test', stock: 10, ultimo_precio: 5000 },
    { codigo: p1.codigo, nombre: undefined === p1.codigo ? 'x' : 'Mismo nombre', stock: Number(p1.stock) + 2 },
  ]}, token);
  console.log('import:', imp.status, JSON.stringify(imp.body));

  const [kx] = await db.query("SELECT * FROM kardex WHERE empresa_id=1 AND tipo_documento='importacion' ORDER BY id DESC LIMIT 3");
  console.log('kardex:', JSON.stringify(kx));

  const [[pn]] = await db.query("SELECT id, stock, saldo_inventario, promedio FROM productos WHERE codigo='TESTIMP1' AND empresa_id=1");
  const [[p1b]] = await db.query("SELECT id, stock, saldo_inventario, promedio FROM productos WHERE id=?", [p1.id]);
  console.log('nuevo:', JSON.stringify(pn));
  console.log('existente despues:', JSON.stringify(p1b));

  // Limpieza: anular movimientos kardex de la prueba y restaurar
  for (const k of kx) await db.query('UPDATE kardex SET estado=0 WHERE id=?', [k.id]);
  await db.query('UPDATE productos SET stock=?, saldo_inventario=?, promedio=? WHERE id=?', [p1.stock, p1.saldo_inventario, p1.promedio, p1.id]);
  if (pn) await db.query('DELETE FROM productos WHERE id=?', [pn.id]);
  console.log('limpio');
  await db.end();
})().catch(e=>{console.error(e);process.exit(1);});
