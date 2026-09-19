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

  // Nueva venta USD a crédito
  const venta = await req('POST', '/ventas', {
    cliente_id: 1,
    fecha: '2026-09-15',
    modo: 2,
    numero_cuotas: 1,
    periodo_cuotas: 3,
    moneda_id: 5,
    detalles: [{ producto_id: 2, cantidad: 2, precio_unitario: 100, descuento: 0, impuesto: 0 }],
    observacion: 'TEST USD perdida',
  }, token);
  const v = venta.body.venta || venta.body;
  console.log('venta:', v.codigo, 'USD', v.valor_moneda_extranjera, 'COP', v.total);

  const [cr] = await db.query('SELECT id, saldo FROM creditos WHERE documento_origen=?', [v.codigo]);
  const credId = cr[0].id;

  // Cobro a TRM 3000 (menor → pérdida). Sin cuenta 5.3.05 diferencia → debe rechazar.
  const cobro = await req('POST', '/cartera/cobro', {
    credito_id: credId,
    fecha: '2026-09-15',
    tipo_comprobante_id: 1,
    banco_id: 2,
    valor: 600000,
    tasa_pago: 3000,
  }, token);
  console.log('cobro sin cuenta:', cobro.status, JSON.stringify(cobro.body.message));

  // Crear las dos cuentas auxiliares de diferencia en cambio
  const [[padreI]] = await db.query("SELECT id FROM plan_cuentas WHERE empresa_id=1 AND codigo='4.2.10'");
  const [[padreG]] = await db.query("SELECT id FROM plan_cuentas WHERE empresa_id=1 AND codigo='5.3.05'");
  const [[exI]] = await db.query("SELECT id FROM plan_cuentas WHERE empresa_id=1 AND codigo='4.2.10.50'");
  const [[exG]] = await db.query("SELECT id FROM plan_cuentas WHERE empresa_id=1 AND codigo='5.3.05.50'");
  if (!exI) {
    await db.query(
      "INSERT INTO plan_cuentas (empresa_id, codigo, nombre, clasificacion, naturaleza, cuenta_padre_id, estado, created_at, updated_at) VALUES (1,'4.2.10.50','DIFERENCIA EN CAMBIO INGRESO',4,'C',?,1,NOW(),NOW())",
      [padreI.id],
    );
    console.log('creada 4.2.10.50');
  }
  if (!exG) {
    await db.query(
      "INSERT INTO plan_cuentas (empresa_id, codigo, nombre, clasificacion, naturaleza, cuenta_padre_id, estado, created_at, updated_at) VALUES (1,'5.3.05.50','DIFERENCIA EN CAMBIO GASTO',4,'D',?,1,NOW(),NOW())",
      [padreG.id],
    );
    console.log('creada 5.3.05.50');
  }

  // Reintentar cobro
  const cobro2 = await req('POST', '/cartera/cobro', {
    credito_id: credId,
    fecha: '2026-09-15',
    tipo_comprobante_id: 1,
    banco_id: 2,
    valor: 600000,
    tasa_pago: 3000,
  }, token);
  console.log('cobro con cuenta:', cobro2.status, cobro2.body.asentado?.consecutivo || cobro2.body.message);

  const [lin] = await db.query(
    'SELECT p.codigo, l.debito, l.credito, l.descripcion FROM contabilidad l JOIN plan_cuentas p ON p.id=l.cuenta_contable_id WHERE l.asentado_id=?',
    [cobro2.body.asentado?.id],
  );
  console.log(JSON.stringify(lin, null, 1));

  // Guardar ids para limpieza posterior
  const fs = require('fs');
  fs.writeFileSync(
    'scripts/tmp-usd-ids.json',
    JSON.stringify({ ventaId: v.id, codigo: v.codigo, creditoId: credId, asientoCobro: cobro2.body.asentado?.id, asientoVentaDesc: `Venta ${v.codigo}` }),
  );
  await db.end();
})();
