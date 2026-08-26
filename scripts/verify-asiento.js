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
  const auth = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${access_token}`,
  };

  // Verificar asiento de la compra FC000003
  const asientosRes = await fetch(`${BASE}/asentados?limit=5`, {
    headers: auth,
  });
  const asientosBody = await asientosRes.json();
  const asientos = asientosBody.data || [];
  console.log('Asientos recientes:', asientos.map((a) => `${a.id}:${a.consecutivo}`).join(', '));

  for (const a of asientos.slice(0, 3)) {
    const detalleRes = await fetch(`${BASE}/asentados/${a.id}`, {
      headers: auth,
    });
    const detalle = await detalleRes.json();
    const debito = detalle.detalles.reduce((s, d) => s + Number(d.debito), 0);
    const credito = detalle.detalles.reduce((s, d) => s + Number(d.credito), 0);
    const cuadra = Math.abs(debito - credito) < 0.01;
    console.log(`\nAsiento ${a.consecutivo}: D=${debito} C=${credito} ${cuadra ? '✓ CUADRA' : '✗ DESCUADRE'}`);
    for (const d of detalle.detalles) {
      console.log(`  ${d.cuenta_contable?.codigo || '?'} ${d.cuenta_contable?.nombre || '?'}: D=${d.debito} C=${d.credito} - ${d.descripcion}`);
    }
  }

  // Verificar saldo del banco
  const bancosRes = await fetch(`${BASE}/bancos?limit=10`, { headers: auth });
  const bancosBody = await bancosRes.json();
  const bancos = bancosBody.data || [];
  for (const b of bancos) {
    console.log(`\nBanco ${b.nombre}: saldo=${b.monto} cuenta_id=${b.cuenta_id}`);
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
