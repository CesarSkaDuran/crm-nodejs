const BASE = 'http://localhost:3000/api/v1';

async function main() {
  // Login
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
  console.log('Login OK');

  // Buscar producto, proveedor, cliente, banco
  const [productos, terceros, bancos, cuentas] = await Promise.all([
    fetch(`${BASE}/productos?limit=100`, { headers: auth }).then((r) => r.json()),
    fetch(`${BASE}/terceros?limit=100`, { headers: auth }).then((r) => r.json()),
    fetch(`${BASE}/bancos?limit=100`, { headers: auth }).then((r) => r.json()),
    fetch(`${BASE}/cuentas?limit=200`, { headers: auth }).then((r) => r.json()),
  ]);

  const producto = (productos.data || productos)[0];
  const proveedor = (terceros.data || terceros).find((t) => t.tipo_terceros === 2);
  const cliente = (terceros.data || terceros).find((t) => t.tipo_terceros === 1) || (terceros.data || terceros).find((t) => t.id !== proveedor?.id);
  const banco = (bancos.data || bancos).find((b) => b.cuenta_id && b.cuenta_id !== '1');

  console.log('Producto:', producto?.id, producto?.nombre);
  console.log('Proveedor:', proveedor?.id, proveedor?.nombre);
  console.log('Cliente:', cliente?.id, cliente?.nombre);
  console.log('Banco:', banco?.id, banco?.nombre, 'cuenta_id:', banco?.cuenta_id);

  // Buscar cuentas de IVA, retención, flete
  const listaCuentas = cuentas.data || cuentas;
  const findCuenta = (keywords) =>
    listaCuentas.find(
      (c) =>
        keywords.some(
          (k) =>
            (c.nombre || '').toLowerCase().includes(k) ||
            (c.codigo || '').toLowerCase().startsWith(k),
        ),
    );

  const ivaCompra = findCuenta(['2408', 'iva descontable', 'iva debito']);
  const ivaVenta = findCuenta(['2408', 'iva generado', 'iva por pagar']);
  const retencion = findCuenta(['2365', 'retencion', 'rte fuente']);
  const flete = findCuenta(['2335', 'flete', 'gastos transporte']);

  console.log('Cuentas IVA compra:', ivaCompra?.id, ivaCompra?.codigo, ivaCompra?.nombre);
  console.log('Cuentas IVA venta:', ivaVenta?.id, ivaVenta?.codigo, ivaVenta?.nombre);
  console.log('Cuentas retención:', retencion?.id, retencion?.codigo, retencion?.nombre);
  console.log('Cuentas flete:', flete?.id, flete?.codigo, flete?.nombre);
  console.log('Total cuentas en PUC:', listaCuentas.length);

  // Probar compra con IVA
  console.log('\n=== PRUEBA COMPRA CON IVA ===');
  const compraRes = await fetch(`${BASE}/compras`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      proveedor_id: proveedor.id,
      fecha: '2026-08-25',
      numero_factura: 'TEST-IVA-001',
      banco_id: banco.id,
      detalles: [
        {
          producto_id: producto.id,
          cantidad: 5,
          costo_unitario: 100,
          descuento: 0,
          impuesto: 19,
        },
      ],
      flete: 50,
      retencion: 0,
    }),
  });
  const compraBody = await compraRes.json();
  console.log('Compra status:', compraRes.status);
  console.log('Compra:', JSON.stringify(compraBody, null, 2));

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
          producto_id: producto.id,
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
  console.log('Venta:', JSON.stringify(ventaBody, null, 2));

  // Verificar asientos recientes
  console.log('\n=== VERIFICACIÓN DE ASIENTOS ===');
  const asientosRes = await fetch(`${BASE}/contabilidad/asientos?limit=5`, {
    headers: auth,
  });
  const asientosBody = await asientosRes.json();
  const asientos = asientosBody.data || asientosBody;
  for (const a of asientos.slice(0, 3)) {
    const detalleRes = await fetch(`${BASE}/contabilidad/asientos/${a.id}`, {
      headers: auth,
    });
    const detalle = await detalleRes.json();
    const debito = detalle.detalles.reduce((s, d) => s + Number(d.debito), 0);
    const credito = detalle.detalles.reduce((s, d) => s + Number(d.credito), 0);
    const cuadra = Math.abs(debito - credito) < 0.01;
    console.log(
      `Asiento ${a.consecutivo}: D=${debito} C=${credito} ${cuadra ? '✓ CUADRA' : '✗ DESCUADRE'}`,
    );
    for (const d of detalle.detalles) {
      console.log(
        `  ${d.cuenta_contable?.codigo || '?'} ${d.cuenta_contable?.nombre || '?'}: D=${d.debito} C=${d.credito} - ${d.descripcion}`,
      );
    }
  }
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
