const http = require('http');
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
  const login = await req('POST', '/autenticacion/iniciar-sesion', {
    email: 'admin@demo.com', password: 'admin123', codigo_empresa: 'DEMO',
  });
  const token = login.body.access_token || login.body.token;

  // Crear moneda USD si no existe
  const lista = await req('GET', '/monedas', null, token);
  const usd = (lista.body.data ?? lista.body ?? []).find((m) => m.codigo === 'USD');
  if (!usd) {
    const c = await req('POST', '/monedas', {
      codigo: 'USD', nombre: 'Dólar americano', simbolo: 'US$', tasa: 0, es_local: 0, orden: 2,
    }, token);
    console.log('crear USD:', c.status, c.body.id || c.body.message);
  } else {
    console.log('USD ya existe, id', usd.id);
  }

  const sync = await req('POST', '/trm/sincronizar', null, token);
  console.log('sincronizar:', sync.status, JSON.stringify(sync.body));

  const act = await req('GET', '/trm/actual', null, token);
  console.log('trm actual:', act.status, JSON.stringify(act.body));

  const his = await req('GET', '/trm/historial?limit=3', null, token);
  console.log('historial:', JSON.stringify(his.body).slice(0, 500));
})();
