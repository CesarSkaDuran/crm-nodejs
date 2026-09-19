const http = require('http');
const m = require('mysql2/promise');
function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      {
        host: 'localhost', port: 3000, path: '/api/v1' + path, method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }));
      },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
(async () => {
  const db = await m.createConnection({ host: 'localhost', user: 'root', password: '', database: 'crm_db' });
  const [monedas] = await db.query('SELECT id, codigo, nombre, tasa, es_local FROM monedas');
  console.log('monedas:', JSON.stringify(monedas));

  const login = await req('POST', '/autenticacion/iniciar-sesion', {
    email: 'admin@demo.com', password: 'admin123', codigo_empresa: 'DEMO',
  });
  const token = login.body.access_token || login.body.token;

  const sync = await req('POST', '/trm/sincronizar', null, token);
  console.log('sincronizar:', sync.status, JSON.stringify(sync.body));

  const act = await req('GET', '/trm/actual', null, token);
  console.log('trm actual:', act.status, JSON.stringify(act.body));

  const his = await req('GET', '/trm/historial?limit=3', null, token);
  console.log('historial:', his.status, JSON.stringify(his.body).slice(0, 400));
  await db.end();
})();
