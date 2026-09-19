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
  const login = await req('POST', '/autenticacion/iniciar-sesion', {
    email: 'admin@demo.com', password: 'admin123', codigo_empresa: 'DEMO',
  });
  const token = login.body.access_token || login.body.token;

  const [cr] = await db.query("SELECT id, saldo, documento_origen FROM creditos WHERE documento_origen='FV000026'");
  console.log('credito pendiente:', JSON.stringify(cr));
  if (!cr[0]) { await db.end(); return; }

  const cobro = await req('POST', '/cartera/cobro', {
    credito_id: cr[0].id,
    fecha: '2026-09-15',
    tipo_comprobante_id: 1,
    banco_id: 2,
    valor: 640000,
    tasa_pago: 3200,
  }, token);
  console.log('cobro:', cobro.status, JSON.stringify(cobro.body).slice(0, 500));
  await db.end();
})();
