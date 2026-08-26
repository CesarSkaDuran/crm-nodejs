const BASE = 'http://localhost:3000/api/v1';

async function main() {
  const loginRes = await fetch(`${BASE}/autenticacion/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      codigo_empresa: 'DEMO',
      email: 'admin@demo.com',
      password: 'admin123',
    }),
  });
  const { access_token } = await loginRes.json();
  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` };

  const res = await fetch(`${BASE}/cuentas?limit=600`, { headers: auth });
  const body = await res.json();
  console.log('Type:', typeof body);
  console.log('Is array:', Array.isArray(body));
  console.log('Keys:', Object.keys(body));
  if (body.data) {
    console.log('data length:', body.data.length);
    console.log('first 3:', body.data.slice(0, 3).map((c) => `${c.codigo} ${c.nombre}`));
    const ing = body.data.find((c) => (c.codigo || '') === '4.1.35.20');
    console.log('ingreso encontrado:', ing);
  } else if (Array.isArray(body)) {
    console.log('array length:', body.length);
    console.log('first 3:', body.slice(0, 3).map((c) => `${c.codigo} ${c.nombre}`));
  }
}

main().catch(console.error);
