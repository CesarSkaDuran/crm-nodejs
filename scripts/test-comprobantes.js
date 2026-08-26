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
  console.log('Login OK');

  // Obtener tipos de comprobantes
  const tiposRes = await fetch(`${BASE}/tipo-comprobantes?limit=10`, { headers: auth });
  const tiposBody = await tiposRes.json();
  const tipos = tiposBody.data || [];
  console.log('Tipos:', tipos.map((t) => `${t.id}:${t.nombre} simple=${t.simple} prefijo=${t.prefijo} consecutivo=${t.consecutivo}`).join('\n  '));

  if (tipos.length === 0) {
    console.log('No hay tipos de comprobante configurados');
    return;
  }

  const tipo = tipos[0];

  // Generar consecutivo
  const consRes = await fetch(`${BASE}/tipo-comprobantes/${tipo.id}/siguiente`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({}),
  });
  const consBody = await consRes.json();
  const consecutivo = consBody.consecutivo;
  console.log('Consecutivo status:', consRes.status, 'body:', consBody);

  // Cuentas
  const cuentasRes = await fetch(`${BASE}/cuentas?limit=200`, { headers: auth });
  const cuentasBody = await cuentasRes.json();
  const cuentas = Array.isArray(cuentasBody) ? cuentasBody : (cuentasBody.data || []);
  console.log('Cuentas sample:', cuentas.slice(0, 3).map((c) => `${c.id}:${c.codigo} ${c.nombre} nat=${c.naturaleza}`).join('\n  '));

  if (cuentas.length < 2) {
    console.log('No hay suficientes cuentas');
    return;
  }

  const c1 = cuentas[0];
  const c2 = cuentas[1];

  // Crear asiento contable
  const asientoRes = await fetch(`${BASE}/asentados`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      consecutivo,
      tipo: tipo.id,
      fecha: '2026-08-25',
      descripcion: 'Prueba comprobante manual',
      detalles: [
        {
          cuenta_contable_id: c1.id,
          descripcion: 'Prueba débito',
          valor: 100,
          naturaleza: 'D',
        },
        {
          cuenta_contable_id: c2.id,
          descripcion: 'Prueba crédito',
          valor: 100,
          naturaleza: 'C',
        },
      ],
    }),
  });
  const asientoBody = await asientoRes.json();
  console.log('Asiento status:', asientoRes.status);
  console.log('Asiento body:', JSON.stringify(asientoBody, null, 2));
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
