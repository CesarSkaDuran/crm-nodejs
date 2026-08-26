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

  // Venta de prueba con cuentas correctas
  console.log('=== VENTA CON COGS CORRECTO ===');
  const ventaRes = await fetch(`${BASE}/ventas`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      cliente_id: 1,
      fecha: '2026-08-25',
      numero_factura: 'TEST-VT-FINAL',
      banco_id: 2,
      detalles: [
        { producto_id: 1, cantidad: 1, precio_unitario: 500, descuento: 0, impuesto: 19 },
      ],
      flete: 0,
      retencion: 0,
    }),
  });
  const ventaBody = await ventaRes.json();
  console.log('Venta status:', ventaRes.status);
  if (ventaRes.status >= 400) {
    console.log('Error:', JSON.stringify(ventaBody));
    return;
  }
  console.log('Venta:', ventaBody.id, ventaBody.codigo, 'total:', ventaBody.total);

  // Verificar asiento
  const asientosRes = await fetch(`${BASE}/asentados?limit=1`, { headers: auth });
  const asientos = await asientosRes.json();
  const asiento = asientos.data[0];

  const detalleRes = await fetch(`${BASE}/asentados/${asiento.id}`, { headers: auth });
  const detalle = await detalleRes.json();
  const debito = detalle.detalles.reduce((s, d) => s + Number(d.debito), 0);
  const credito = detalle.detalles.reduce((s, d) => s + Number(d.credito), 0);
  const cuadra = Math.abs(debito - credito) < 0.01;
  console.log(`\nAsiento ${asiento.consecutivo}: D=${debito} C=${credito} ${cuadra ? '✓ CUADRA' : '✗ DESCUADRE'}`);
  for (const d of detalle.detalles) {
    console.log(`  ${d.cuenta_contable?.codigo} ${d.cuenta_contable?.nombre}: D=${d.debito} C=${d.credito} - ${d.descripcion}`);
  }
}

main().catch(console.error);
