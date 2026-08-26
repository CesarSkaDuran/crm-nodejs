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

  const cuentasRes = await fetch(`${BASE}/cuentas?limit=600`, { headers: auth });
  const cuentasBody = await cuentasRes.json();
  const cuentas = cuentasBody.data || [];

  // Buscar cuentas tipo ingreso (código 4) y costo (código 6)
  const ingresos = cuentas.filter((c) => (c.codigo || '').startsWith('4'));
  const costos = cuentas.filter((c) => (c.codigo || '').startsWith('6'));
  const iva = cuentas.filter((c) => (c.codigo || '').includes('2408') || (c.nombre || '').toLowerCase().includes('iva'));
  const retencion = cuentas.filter((c) => (c.nombre || '').toLowerCase().includes('retencion') || (c.codigo || '').includes('2365'));
  const flete = cuentas.filter((c) => (c.nombre || '').toLowerCase().includes('flete') || (c.codigo || '').includes('2335') || (c.codigo || '').includes('4235'));

  console.log('=== INGRESOS (código 4) ===');
  ingresos.slice(0, 10).forEach((c) => console.log(`  ${c.id} ${c.codigo} ${c.nombre}`));
  console.log(`  ... total: ${ingresos.length}`);

  console.log('\n=== COSTOS (código 6) ===');
  costos.slice(0, 10).forEach((c) => console.log(`  ${c.id} ${c.codigo} ${c.nombre}`));
  console.log(`  ... total: ${costos.length}`);

  console.log('\n=== IVA ===');
  iva.forEach((c) => console.log(`  ${c.id} ${c.codigo} ${c.nombre}`));

  console.log('\n=== RETENCIÓN ===');
  retencion.forEach((c) => console.log(`  ${c.id} ${c.codigo} ${c.nombre}`));

  console.log('\n=== FLETE ===');
  flete.forEach((c) => console.log(`  ${c.id} ${c.codigo} ${c.nombre}`));
}

main().catch(console.error);
