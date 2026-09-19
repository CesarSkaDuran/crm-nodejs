const http = require('http');
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

  const list = await req('GET','/cuentas',null,token);
  const cuentas = list.body.data ?? list.body ?? [];
  const conMov = cuentas.find((c)=>Number(c.movimientos)>0);
  const sinMov = cuentas.find((c)=>!c.movimientos && Number(c.clasificacion)===4 && Number(c.estado)===1);
  console.log('con movimientos:', conMov && `${conMov.codigo} ${conMov.nombre} (${conMov.movimientos})`);
  console.log('sin movimientos:', sinMov && `${sinMov.codigo} ${sinMov.nombre}`);

  const r1 = await req('DELETE',`/cuentas/${conMov.id}`,null,token);
  console.log('delete con movimientos:', r1.status, JSON.stringify(r1.body).slice(0,200));

  const r2 = await req('DELETE',`/cuentas/${sinMov.id}`,null,token);
  console.log('delete sin movimientos:', r2.status);
})().catch(e=>{console.error(e);process.exit(1);});
