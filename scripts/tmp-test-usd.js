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

  // Datos base
  const [[cli]] = await db.query('SELECT id, nombre FROM terceros WHERE empresa_id=1 AND estado=1 AND cuenta_contable_id IS NOT NULL LIMIT 1');
  const [[prod]] = await db.query('SELECT id, nombre, stock, promedio FROM productos WHERE empresa_id=1 AND estado=1 AND stock > 20 AND cuenta_ingresos_id IS NOT NULL AND cuenta_inventarios_id IS NOT NULL AND cuenta_costos_id IS NOT NULL LIMIT 1');
  const [[banco]] = await db.query('SELECT id, nombre, monto FROM bancos WHERE empresa_id=1 AND estado=1 ORDER BY monto DESC LIMIT 1');
  const [[tc]] = await db.query('SELECT id FROM tipo_comprobantes WHERE empresa_id=1 LIMIT 1');
  console.log('cli:', cli.id, cli.nombre, '| prod:', prod.id, prod.nombre, 'stock', prod.stock, '| banco:', banco.id, banco.nombre, banco.monto, '| tc:', tc?.id);

  // 1. Venta USD a crédito: 2 und × USD 100 → COP 621.860 (TRM 3109.30)
  const venta = await req('POST', '/ventas', {
    cliente_id: cli.id,
    fecha: '2026-09-15',
    modo: 2, // crédito
    numero_cuotas: 1,
    periodo_cuotas: 3,
    moneda_id: 5, // USD
    detalles: [{ producto_id: prod.id, cantidad: 2, precio_unitario: 100, descuento: 0, impuesto: 0 }],
    observacion: 'TEST USD',
  }, token);
  console.log('venta USD:', venta.status, venta.body.codigo || venta.body.message);
  const v = venta.body.venta || venta.body;
  console.log(`   moneda ${v.moneda_codigo} | USD ${v.valor_moneda_extranjera} | tasa ${v.tasa_cambio} | COP ${v.total} / valor_cop ${v.valor_cop}`);
  const ventaId = v.id;

  // 2. Crédito generado
  const [cr] = await db.query('SELECT id, monto_total, saldo FROM creditos WHERE documento_origen=? ORDER BY id DESC LIMIT 1', [v.codigo]);
  console.log('credito:', JSON.stringify(cr[0]));

  // 3. Cobro a TRM 3200 → esperado 200 USD × 3200 = 640.000; nominal 621.860 → ganancia 18.140
  const cobro = await req('POST', '/cartera/cobro', {
    credito_id: cr[0].id,
    fecha: '2026-09-15',
    tipo_comprobante_id: tc.id,
    banco_id: banco.id,
    valor: 640000,
    tasa_pago: 3200,
  }, token);
  console.log('cobro:', cobro.status, cobro.body.asentado?.consecutivo || cobro.body.message, '| aplicado', cobro.body.monto_aplicado);

  const [lin] = await db.query(
    'SELECT p.codigo, l.debito, l.credito, l.descripcion FROM contabilidad l JOIN plan_cuentas p ON p.id=l.cuenta_contable_id WHERE l.asentado_id=?',
    [cobro.body.asentado?.id],
  );
  console.log('asiento cobro:', JSON.stringify(lin, null, 1));
  const [[bn]] = await db.query('SELECT monto FROM bancos WHERE id=?', [banco.id]);
  console.log('banco tras cobro:', bn.monto, '(antes', banco.monto, ')');

  // LIMPIEZA
  const [det] = await db.query('SELECT id FROM ventas_detalle WHERE venta_id=?', [ventaId]);
  await db.query('DELETE FROM ventas_detalle WHERE venta_id=?', [ventaId]);
  await db.query('DELETE FROM kardex WHERE tipo_documento="venta" AND documento_id=?', [ventaId]);
  const [asientos] = await db.query('SELECT a.id FROM asentados a JOIN ventas v2 ON a.descripcion LIKE CONCAT("Venta ", v2.codigo, "%") WHERE v2.id=?', [ventaId]);
  for (const a of asientos) {
    await db.query('DELETE FROM contabilidad WHERE asentado_id=?', [a.id]);
    await db.query('DELETE FROM asentados WHERE id=?', [a.id]);
  }
  await db.query('DELETE FROM contabilidad WHERE asentado_id=?', [cobro.body.asentado?.id]);
  await db.query('DELETE FROM asentados WHERE id=?', [cobro.body.asentado?.id]);
  await db.query('UPDATE cuotas_credito SET asentado_id=NULL, numero_recibo=NULL WHERE credito_id=?', [cr[0].id]);
  await db.query('DELETE FROM cuotas_credito WHERE credito_id=?', [cr[0].id]);
  await db.query('DELETE FROM creditos WHERE id=?', [cr[0].id]);
  await db.query('DELETE FROM ventas WHERE id=?', [ventaId]);
  await db.query('UPDATE bancos SET monto=? WHERE id=?', [banco.monto, banco.id]);
  await db.query('UPDATE productos SET stock=?, saldo_inventario=? WHERE id=?', [prod.stock, prod.stock * prod.promedio, prod.id]);
  console.log('limpieza completa');
  await db.end();
})();
