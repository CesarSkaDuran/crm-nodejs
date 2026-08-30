/**
 * AUDITORÍA TOTAL DEL SISTEMA CRM v2
 * Rutas y campos correctos según los controladores reales.
 */

const BASE = 'http://localhost:3000/api/v1';

const results = [];
let token = '';
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

function log(modulo, op, status, detail = '') {
  const ok = status === 'OK';
  const icon = ok ? '✓' : '✗';
  results.push({ modulo, op, status: ok ? 'OK' : 'FAIL', detail });
  console.log(`  ${icon} [${modulo}] ${op}: ${ok ? 'OK' : 'FAIL'}${detail ? ' → ' + detail : ''}`);
}

async function api(method, path, body) {
  try {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(`${BASE}${path}`, opts);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

async function testCRUD(modulo, path, createBody, updateBody, idField = 'id') {
  console.log(`\n=== ${modulo.toUpperCase()} ===`);

  // 1. LIST
  const list = await api('GET', path);
  const listCount = Array.isArray(list.data) ? list.data.length : (list.data?.data?.length ?? (list.data?.total ?? '?'));
  log(modulo, 'LIST', list.ok ? 'OK' : 'FAIL',
    list.ok ? `${listCount} items` : `${list.status} ${JSON.stringify(list.data?.message || '').slice(0, 80)}`);

  // 2. CREATE
  const created = await api('POST', path, createBody);
  log(modulo, 'CREATE', created.ok ? 'OK' : 'FAIL',
    created.ok ? `ID ${created.data?.[idField]}` : `${created.status} ${JSON.stringify(created.data?.message || '').slice(0, 120)}`);

  let createdId = created.data?.[idField];

  // 3. READ ONE
  if (createdId) {
    const one = await api('GET', `${path}/${createdId}`);
    log(modulo, 'READ_ONE', one.ok ? 'OK' : 'FAIL',
      one.ok ? `ID ${one.data?.[idField]}` : `${one.status} ${JSON.stringify(one.data?.message || '').slice(0, 80)}`);
  } else {
    log(modulo, 'READ_ONE', 'FAIL', 'No se pudo crear');
  }

  // 4. UPDATE
  if (createdId) {
    const updated = await api('PATCH', `${path}/${createdId}`, updateBody);
    log(modulo, 'UPDATE', updated.ok ? 'OK' : 'FAIL',
      updated.ok ? `ID ${createdId}` : `${updated.status} ${JSON.stringify(updated.data?.message || '').slice(0, 120)}`);
  } else {
    log(modulo, 'UPDATE', 'FAIL', 'No se pudo crear');
  }

  // 5. DELETE
  if (createdId) {
    const deleted = await api('DELETE', `${path}/${createdId}`);
    log(modulo, 'DELETE', deleted.ok ? 'OK' : 'FAIL',
      deleted.ok ? `ID ${createdId}` : `${deleted.status} ${JSON.stringify(deleted.data?.message || '').slice(0, 80)}`);
  } else {
    log(modulo, 'DELETE', 'FAIL', 'No se pudo crear');
  }

  return createdId;
}

async function testReadonly(modulo, path, label) {
  console.log(`\n=== ${modulo.toUpperCase()} (solo lectura) ===`);
  const r = await api('GET', path);
  log(modulo, label || 'GET', r.ok ? 'OK' : 'FAIL',
    r.ok ? 'OK' : `${r.status} ${JSON.stringify(r.data?.message || '').slice(0, 80)}`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       AUDITORÍA TOTAL DEL SISTEMA CRM v2                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // LOGIN
  console.log('\n=== AUTENTICACIÓN ===');
  const loginResp = await fetch(`${BASE}/autenticacion/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo_empresa: 'DEMO', email: 'admin@demo.com', password: 'admin123' }),
  });
  const loginData = await loginResp.json();
  if (!loginResp.ok) {
    console.log('  ✗ LOGIN FALLÓ:', JSON.stringify(loginData));
    return;
  }
  token = loginData.access_token;
  log('Auth', 'LOGIN', 'OK', 'Token obtenido');

  // ============ MÓDULOS CRUD ============

  // 1. MONEDAS (código max 3 chars)
  const codMoneda = 'T' + Date.now().toString().slice(-2);
  await testCRUD('Monedas', '/monedas',
    { codigo: codMoneda, nombre: 'Moneda Test', simbolo: 'T$', tasa: 1.5, es_local: 0, orden: 99 },
    { nombre: 'Moneda Test Actualizada' }
  );

  // 2. TIPOS DE DOCUMENTO
  await testCRUD('TiposDocumento', '/tipos-documento',
    { codigo: 'TST' + Date.now().toString().slice(-4), nombre: 'Tipo Test', descripcion: 'Test', orden: 99 },
    { nombre: 'Tipo Test Actualizado' }
  );

  // 3. CATEGORÍAS
  await testCRUD('Categorias', '/categorias',
    { nombre: 'Cat Test Audit ' + Date.now(), descripcion: 'Test', tipo: 1 },
    { descripcion: 'Test actualizado' }
  );

  // 4. BANCOS (campos correctos: nombre, monto, monto_dia, tipo, cuenta_id, estado)
  await testCRUD('Bancos', '/bancos',
    { nombre: 'Banco Test Audit', monto: 1000, monto_dia: 0, tipo: 1, estado: 1 },
    { nombre: 'Banco Test Actualizado' }
  );

  // 5. TERCEROS (campos correctos: tipo_terceros, nombre, documento, etc.)
  await testCRUD('Terceros', '/terceros',
    { tipo_terceros: 1, nombre: 'Tercero Test Audit', documento: '99999999', tipo_documento: 1, ciudad: 'Cúcuta' },
    { nombre: 'Tercero Test Actualizado' }
  );

  // 6. PRODUCTOS
  await testCRUD('Productos', '/productos',
    { codigo: 'TSTAUD' + Date.now().toString().slice(-4), nombre: 'Producto Test Audit', tipo: 1, ultimo_precio: 100, margen: 30, stock_min: 5 },
    { nombre: 'Producto Test Actualizado' }
  );

  // 7. CUENTAS (plan de cuentas) - naturaleza: 'D' o 'C'
  await testCRUD('Cuentas', '/cuentas',
    { codigo: '9999', nombre: 'Cuenta Test Audit', clasificacion: 4, naturaleza: 'D', tipo: 1 },
    { nombre: 'Cuenta Test Actualizada' }
  );

  // 8. TIPOS DE COMPROBANTES (campo correcto: nombre, simple, prefijo - NO codigo)
  await testCRUD('TiposComprobantes', '/tipo-comprobantes',
    { nombre: 'Comprobante Test Audit', simple: 'TST', prefijo: 'TST', consecutivo: 1, tipo: 1 },
    { nombre: 'Comprobante Test Actualizado' }
  );

  // ============ MÓDULOS DE SOLO LECTURA / ESPECIALES ============

  // 9. INFORMES
  console.log('\n=== INFORMES (solo lectura) ===');
  const cuentas = await api('GET', '/cuentas');
  const todasCuentas = cuentas.ok ? (Array.isArray(cuentas.data) ? cuentas.data : cuentas.data?.data || []) : [];
  const cuentaHoja = todasCuentas.find(c => Number(c.clasificacion) === 4 || Number(c.clasificacion) === 5);
  if (cuentaHoja) {
    const lm = await api('GET', `/informes/libro?cuenta_id=${cuentaHoja.id}&modo=resumido`);
    log('Informes', 'LIBRO_MAYOR', lm.ok ? 'OK' : 'FAIL', lm.ok ? 'OK' : `${lm.status} ${JSON.stringify(lm.data?.message || '').slice(0, 80)}`);
  } else {
    log('Informes', 'LIBRO_MAYOR', 'FAIL', 'No hay cuenta hoja');
  }

  const bal = await api('GET', '/informes/balance');
  log('Informes', 'BALANCE', bal.ok ? 'OK' : 'FAIL', bal.ok ? 'OK' : `${bal.status} ${JSON.stringify(bal.data?.message || '').slice(0, 80)}`);

  const pyg = await api('GET', '/informes/pyg');
  log('Informes', 'PYG', pyg.ok ? 'OK' : 'FAIL', pyg.ok ? 'OK' : `${pyg.status} ${JSON.stringify(pyg.data?.message || '').slice(0, 80)}`);

  // 10. CARTERA (ruta: /cartera)
  await testReadonly('Cartera', '/cartera', 'LIST');

  // 11. CUENTAS POR PAGAR
  await testReadonly('CuentasPorPagar', '/cuentas-por-pagar', 'LIST');

  // 12. KARDEX
  await testReadonly('Kardex', '/kardex', 'LIST');

  // 13. TESORERÍA
  await testReadonly('Tesoreria', '/tesoreria', 'LIST');

  // 14. INVENTARIO FÍSICO
  await testReadonly('InventarioFisico', '/inventario-fisico', 'LIST');

  // 15. FACTURACIÓN ELECTRÓNICA
  await testReadonly('FacturacionElectronica', '/facturacion-electronica', 'ESTADO');

  // 16. COMPRAS (ruta correcta: /compras)
  await testReadonly('Compras', '/compras', 'LIST');

  // 17. VENTAS (ruta correcta: /ventas)
  await testReadonly('Ventas', '/ventas', 'LIST');

  // 18. EMPRESAS (ruta correcta: /empresas)
  await testReadonly('Empresas', '/empresas', 'LIST');

  // 19. USUARIOS (ruta correcta: /usuarios)
  await testReadonly('Usuarios', '/usuarios', 'LIST');

  // 20. MOVIMIENTOS (asentados)
  await testReadonly('Movimientos', '/movimientos', 'LIST');

  // ============ REPORTE FINAL ============
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                  REPORTE DE AUDITORÍA                    ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const modulos = {};
  for (const r of results) {
    if (!modulos[r.modulo]) modulos[r.modulo] = { ok: 0, fail: 0, ops: [] };
    if (r.status === 'OK') modulos[r.modulo].ok++;
    else modulos[r.modulo].fail++;
    modulos[r.modulo].ops.push(r);
  }

  let totalOk = 0, totalFail = 0;

  console.log('┌─────────────────────────┬──────┬──────┬──────┬───────────┐');
  console.log('│ Módulo                  │  OK  │ FAIL │ Total│  % OK     │');
  console.log('├─────────────────────────┼──────┼──────┼──────┼───────────┤');

  for (const [mod, data] of Object.entries(modulos)) {
    const total = data.ok + data.fail;
    const pct = total > 0 ? Math.round((data.ok / total) * 100) : 0;
    totalOk += data.ok;
    totalFail += data.fail;
    const modPadded = mod.padEnd(23).slice(0, 23);
    console.log(`│ ${modPadded}│${String(data.ok).padStart(4)}  │${String(data.fail).padStart(4)}  │${String(total).padStart(4)}  │${`${pct}%`.padStart(9)}│`);
  }

  console.log('├─────────────────────────┼──────┼──────┼──────┼───────────┤');
  const grandTotal = totalOk + totalFail;
  const grandPct = grandTotal > 0 ? Math.round((totalOk / grandTotal) * 100) : 0;
  console.log(`│ TOTAL                   │${String(totalOk).padStart(4)}  │${String(totalFail).padStart(4)}  │${String(grandTotal).padStart(4)}  │${`${grandPct}%`.padStart(9)}│`);
  console.log('└─────────────────────────┴──────┴──────┴──────┴───────────┘');

  const fallos = results.filter(r => r.status === 'FAIL');
  if (fallos.length > 0) {
    console.log('\n\n=== DETALLE DE FALLOS ===\n');
    for (const f of fallos) {
      console.log(`  ✗ [${f.modulo}] ${f.op}: ${f.detail}`);
    }
  }

  console.log(`\n📊 RESULTADO GLOBAL: ${grandPct}% (${totalOk}/${grandTotal} operaciones OK)`);
  console.log(`   Módulos probados: ${Object.keys(modulos).length}`);
  console.log(`   Operaciones exitosas: ${totalOk}`);
  console.log(`   Operaciones fallidas: ${totalFail}`);
}

main().catch(console.error);
