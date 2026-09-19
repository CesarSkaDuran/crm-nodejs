const http = require('http');
const m = require('mysql2/promise');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: 'localhost', port: 3000, path: '/api/v1' + path, method,
        headers: { 'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(buf || '{}') }); } catch { resolve({ status: res.statusCode, body: buf }); } });
      });
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
  if (!token) { console.log('login fail', login.body); return; }

  const db = await m.createConnection({ host: 'localhost', user: 'root', password: '', database: 'crm_db' });

  // 1. TRM actual
  const trm = await req('GET', '/trm/actual', null, token);
  console.log('trm:', trm.status, JSON.stringify(trm.body));
  const usdId = trm.body.moneda_id;
  const tasaHoy = trm.body.tasa;

  // 2. Venta a crédito en USD 100
  const [[cli]] = await db.query("SELECT id FROM terceros WHERE nombre LIKE '%CLIENTE%' OR tipo_terceros IN (1,10) LIMIT 1");
  const [[prod]] = await db.query("SELECT id FROM productos WHERE estado=1 AND stock>0 LIMIT 1");
  const venta = await req('POST', '/ventas', {
    cliente_id: cli.id, fecha: new Date().toISOString().split('T')[0],
    concepto: 'Venta test USD', almacen: 'PRINCIPAL', modo: 2, forma: 10,
    numero_cuotas: 1, periodo_cuotas: 3,
    moneda_id: usdId, tasa_cambio: tasaHoy,
    detalles: [{ producto_id: prod.id, cantidad: 1, precio_unitario: 100, descuento: 0, impuesto: 0 }],
  }, token);
  console.log('venta USD:', venta.status, JSON.stringify(venta.body).slice(0, 400));
  if (venta.status !== 201) { await db.end(); return; }
  const ventaId = venta.body.id || venta.body.venta?.id;

  // 3. Buscar crédito y verificar info de moneda
  const [[cred]] = await db.query("SELECT id, saldo FROM creditos WHERE documento_origen=? AND tipo_credito=1", [venta.body.codigo]);
  console.log('credito:', JSON.stringify(cred));
  const det = await req('GET', `/cartera/credito/${cred.id}`, null, token);
  console.log('credito detalle moneda:', JSON.stringify(det.body.moneda));

  // 4. Cobro con TRM +100 (ganancia para la empresa)
  const [[banco]] = await db.query("SELECT id FROM bancos WHERE empresa_id=1 AND estado=1 LIMIT 1");
  const tipos = await req('GET', '/tipo-comprobantes', null, token);
  const tipo = (tipos.body.data ?? tipos.body ?? []).find((t) => Number(t.tipo) === 3) || (tipos.body.data ?? tipos.body ?? [])[0];
  console.log('tipo:', JSON.stringify(tipo));
  const tasaPago = tasaHoy + 100; // USD 100 x 100 = 10.000 ganancia
  const cobro = await req('POST', '/cartera/cobro', {
    credito_id: cred.id, fecha: new Date().toISOString().split('T')[0],
    tipo_comprobante_id: tipo.id, banco_id: banco.id,
    valor: 100 * tasaPago, descripcion: 'Cobro test USD', pagar_todo: false, tasa_pago: tasaPago,
  }, token);
  console.log('cobro:', cobro.status, JSON.stringify(cobro.body).slice(0, 400));

  // 5. Verificar línea de diferencia en cambio
  const [lineas] = await db.query(
    "SELECT c.cuenta_contable_id, cc.codigo, cc.nombre, c.debito, c.credito FROM contabilidad c JOIN plan_cuentas cc ON cc.id=c.cuenta_contable_id WHERE c.tercero_id=? ORDER BY c.id DESC LIMIT 5",
    [cli.id]);
  console.log('lineas:', JSON.stringify(lineas));

  // 6. Reporte diferencia en cambio
  const rep = await req('GET', `/reportes/diferencia-cambio?fecha_inicio=2020-01-01&fecha_fin=2099-01-01`, null, token);
  console.log('reporte dif cambio:', rep.status, JSON.stringify(rep.body).slice(0, 600));

  await db.end();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
