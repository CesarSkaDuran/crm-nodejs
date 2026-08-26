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

  // Buscar cuenta de ingresos (4.1.35.20 = venta de productos)
  const cuentasRes = await fetch(`${BASE}/cuentas?limit=600`, { headers: auth });
  const cuentasBody = await cuentasRes.json();
  const cuentas = Array.isArray(cuentasBody) ? cuentasBody : (cuentasBody.data || []);
  const cuentaIngresos = cuentas.find(
    (c) => (c.codigo || '') === '4.1.35.20',
  );
  console.log('Cuenta ingresos:', cuentaIngresos?.id, cuentaIngresos?.codigo, cuentaIngresos?.nombre);

  // Asignar cuenta_ingresos_id al producto 1
  const prodRes = await fetch(`${BASE}/productos/1`, { headers: auth });
  const prod = await prodRes.json();
  console.log('Producto antes:', prod.cuenta_ingresos_id, prod.cuenta_costos_id, prod.cuenta_inventarios_id);

  const patchRes = await fetch(`${BASE}/productos/1`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({ cuenta_ingresos_id: cuentaIngresos.id }),
  });
  const prodUpdated = await patchRes.json();
  console.log('Producto después:', prodUpdated.cuenta_ingresos_id);
  console.log('PATCH status:', patchRes.status);

  // Buscar datos para venta
  const [terceros, bancos] = await Promise.all([
    fetch(`${BASE}/terceros?limit=100`, { headers: auth }).then((r) => r.json()),
    fetch(`${BASE}/bancos?limit=100`, { headers: auth }).then((r) => r.json()),
  ]);
  const cliente = (terceros.data || terceros).find((t) => t.id === 1);
  const banco = (bancos.data || bancos).find((b) => b.cuenta_id === '1105');

  // Probar venta con IVA y COGS
  console.log('\n=== PRUEBA VENTA CON IVA Y COGS ===');
  const ventaRes = await fetch(`${BASE}/ventas`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      cliente_id: cliente.id,
      fecha: '2026-08-25',
      numero_factura: 'TEST-VT-001',
      banco_id: banco.id,
      detalles: [
        {
          producto_id: 1,
          cantidad: 2,
          precio_unitario: 200,
          descuento: 0,
          impuesto: 19,
        },
      ],
      flete: 0,
      retencion: 0,
    }),
  });
  const ventaBody = await ventaRes.json();
  console.log('Venta status:', ventaRes.status);
  if (ventaRes.status >= 400) {
    console.log('Error:', JSON.stringify(ventaBody, null, 2));
    return;
  }
  console.log('Venta creada:', ventaBody.id, ventaBody.codigo, 'total:', ventaBody.total);

  // Verificar asiento de la venta
  const asientosRes = await fetch(`${BASE}/asentados?limit=3`, { headers: auth });
  const asientosBody = await asientosRes.json();
  const asientos = asientosBody.data || [];
  const asientoVenta = asientos[0];
  console.log('\nAsiento más reciente:', asientoVenta?.consecutivo);

  const detalleRes = await fetch(`${BASE}/asentados/${asientoVenta.id}`, { headers: auth });
  const detalle = await detalleRes.json();
  const debito = detalle.detalles.reduce((s, d) => s + Number(d.debito), 0);
  const credito = detalle.detalles.reduce((s, d) => s + Number(d.credito), 0);
  const cuadra = Math.abs(debito - credito) < 0.01;
  console.log(`Asiento ${asientoVenta.consecutivo}: D=${debito} C=${credito} ${cuadra ? '✓ CUADRA' : '✗ DESCUADRE'}`);
  for (const d of detalle.detalles) {
    console.log(`  ${d.cuenta_contable?.codigo || '?'} ${d.cuenta_contable?.nombre || '?'}: D=${d.debito} C=${d.credito} - ${d.descripcion}`);
  }

  // Verificar banco después
  const bancoRes2 = await fetch(`${BASE}/bancos?limit=10`, { headers: auth });
  const bancoBody2 = await bancoRes2.json();
  const banco2 = (bancoBody2.data || []).find((b) => b.cuenta_id === '1105');
  console.log(`\nBanco Caja general después de venta: ${banco2.monto}`);
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
