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

  // Buscar tipo comprobante
  const tcRes = await fetch(`${BASE}/tipo-comprobantes?limit=10`, { headers: auth });
  const tcBody = await tcRes.json();
  const tipos = tcBody.data || tcBody || [];
  console.log('Tipos comprobante:', tipos.map((t) => `${t.id}:${t.nombre}`).join(', '));
  const tipoComp = tipos[0];

  // Banco antes
  const bancosRes = await fetch(`${BASE}/bancos?limit=10`, { headers: auth });
  const bancosBody = await bancosRes.json();
  const bancos = bancosBody.data || [];
  const caja = bancos.find((b) => b.cuenta_id === '1.1.05.05') || bancos[1];
  console.log(`\nBanco ${caja.nombre} antes: ${caja.monto}`);

  // Pago a proveedor (atomico)
  console.log('\n=== PAGO A PROVEEDOR (atómico) ===');
  const pagoRes = await fetch(`${BASE}/cuentas-por-pagar/pago`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      tercero_id: 11,
      banco_id: caja.id,
      valor: 100,
      fecha: '2026-08-25',
      tipo_comprobante_id: tipoComp.id,
      descripcion: 'Pago test atómico',
    }),
  });
  const pagoBody = await pagoRes.json();
  console.log('Pago status:', pagoRes.status);
  if (pagoRes.status >= 400) {
    console.log('Error:', JSON.stringify(pagoBody));
  } else {
    console.log('Pago creado:', pagoBody.id, pagoBody.consecutivo);
  }

  // Banco después del pago
  const bancosRes2 = await fetch(`${BASE}/bancos?limit=10`, { headers: auth });
  const bancosBody2 = await bancosRes2.json();
  const bancos2 = bancosBody2.data || [];
  const caja2 = bancos2.find((b) => b.cuenta_id === '1.1.05.05') || bancos2[1];
  console.log(`Banco ${caja2.nombre} después pago: ${caja2.monto} (debería ser ${Number(caja.monto) - 100})`);

  // Cobro a cliente (atomico)
  console.log('\n=== COBRO A CLIENTE (atómico) ===');
  const cobroRes = await fetch(`${BASE}/cartera/cobro`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      tercero_id: 1,
      banco_id: caja.id,
      valor: 50,
      fecha: '2026-08-25',
      tipo_comprobante_id: tipoComp.id,
      descripcion: 'Cobro test atómico',
    }),
  });
  const cobroBody = await cobroRes.json();
  console.log('Cobro status:', cobroRes.status);
  if (cobroRes.status >= 400) {
    console.log('Error:', JSON.stringify(cobroBody));
  } else {
    console.log('Cobro creado:', cobroBody.id, cobroBody.consecutivo);
  }

  // Banco después del cobro
  const bancosRes3 = await fetch(`${BASE}/bancos?limit=10`, { headers: auth });
  const bancosBody3 = await bancosRes3.json();
  const bancos3 = bancosBody3.data || [];
  const caja3 = bancos3.find((b) => b.cuenta_id === '1.1.05.05') || bancos3[1];
  console.log(`Banco ${caja3.nombre} después cobro: ${caja3.monto} (debería ser ${Number(caja.monto) - 100 + 50})`);

  // Verificar asientos recientes
  const asientosRes = await fetch(`${BASE}/asentados?limit=3`, { headers: auth });
  const asientos = await asientosRes.json();
  const lista = asientos.data || [];
  for (const a of lista.slice(0, 2)) {
    const dRes = await fetch(`${BASE}/asentados/${a.id}`, { headers: auth });
    const d = await dRes.json();
    const deb = d.detalles.reduce((s, x) => s + Number(x.debito), 0);
    const cre = d.detalles.reduce((s, x) => s + Number(x.credito), 0);
    const ok = Math.abs(deb - cre) < 0.01 ? '✓' : '✗';
    console.log(`\n${a.consecutivo}: D=${deb} C=${cre} ${ok}`);
    for (const l of d.detalles) {
      console.log(`  ${l.cuenta_contable?.codigo} ${l.cuenta_contable?.nombre}: D=${l.debito} C=${l.credito}`);
    }
  }

  // Probar tesorería
  console.log('\n=== TESORERÍA INGRESO (atómico) ===');
  const tesRes = await fetch(`${BASE}/tesoreria`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      fecha: '2026-08-25',
      codigo: 'TS-TEST-001',
      nombre_tercero: 'Cliente varios',
      valor: 200,
      tipo: 1,
      banco_id: caja.id,
      cuenta_contrapartida_id: 255,
    }),
  });
  const tesBody = await tesRes.json();
  console.log('Tesorería status:', tesRes.status);
  if (tesRes.status >= 400) {
    console.log('Error:', JSON.stringify(tesBody));
  } else {
    console.log('Tesorería creada:', tesBody.id, 'asentado_id:', tesBody.asentado_id);
  }

  // Banco después de tesorería
  const bancosRes4 = await fetch(`${BASE}/bancos?limit=10`, { headers: auth });
  const bancosBody4 = await bancosRes4.json();
  const bancos4 = bancosBody4.data || [];
  const caja4 = bancos4.find((b) => b.cuenta_id === '1.1.05.05') || bancos4[1];
  console.log(`Banco después tesorería ingreso: ${caja4.monto} (debería ser ${Number(caja.monto) - 100 + 50 + 200})`);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
