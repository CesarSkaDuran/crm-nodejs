/**
 * Auditoría de módulos de configuración y su sincronización
 * con los módulos que los consumen.
 */
const BASE = 'http://localhost:3000/api/v1';
const LOGIN = { codigo_empresa: 'DEMO', email: 'admin@demo.com', password: 'admin123' };

const resultados = [];
const creados = []; // para limpieza

function log(modulo, prueba, ok, detalle = '') {
  resultados.push({ modulo, prueba, ok, detalle });
  console.log(`${ok ? '✅' : '❌'} [${modulo}] ${prueba}${detalle ? ' — ' + detalle : ''}`);
}

async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function main() {
  // ===== LOGIN =====
  const login = await req('POST', '/autenticacion/iniciar-sesion', LOGIN);
  if (login.status !== 200 && login.status !== 201) {
    console.log('❌ Login falló'); process.exit(1);
  }
  const token = login.data.access_token;
  log('AUTH', 'Login', true);

  const sinToken = await req('GET', '/tipos-tercero');
  log('AUTH', 'Sin token rechazado (401)', sinToken.status === 401, `status=${sinToken.status}`);

  // ===== TIPOS DE TERCERO =====
  const tt = await req('GET', '/tipos-tercero?limit=100', null, token);
  const ttList = tt.data?.data ?? [];
  log('TIPOS-TERCERO', 'Listar predeterminados', ttList.length === 5, `${ttList.length} registros`);

  const ttNew = await req('POST', '/tipos-tercero', { nombre: 'Test Auditoría', descripcion: 'temporal' }, token);
  log('TIPOS-TERCERO', 'Crear', ttNew.status === 201 && ttNew.data.id, `id=${ttNew.data?.id}`);

  const ttDup = await req('POST', '/tipos-tercero', { nombre: 'Test Auditoría' }, token);
  log('TIPOS-TERCERO', 'Rechaza duplicado (409)', ttDup.status === 409, `status=${ttDup.status}`);

  const ttUpd = await req('PATCH', `/tipos-tercero/${ttNew.data.id}`, { nombre: 'Test Auditoría EDIT' }, token);
  log('TIPOS-TERCERO', 'Editar', ttUpd.status === 200 && ttUpd.data.nombre === 'Test Auditoría EDIT');

  const ttDel = await req('DELETE', `/tipos-tercero/${ttNew.data.id}`, null, token);
  log('TIPOS-TERCERO', 'Eliminar', ttDel.status === 200, `status=${ttDel.status}`);

  // ===== IMPUESTOS =====
  const im = await req('GET', '/impuestos?limit=100', null, token);
  const imList = im.data?.data ?? [];
  log('IMPUESTOS', 'Listar predeterminados', imList.length === 6, `${imList.length} registros`);

  const imNew = await req('POST', '/impuestos', { codigo: 'TEST_AUD', nombre: 'Impuesto Auditoría', porcentaje: 7.5 }, token);
  log('IMPUESTOS', 'Crear', imNew.status === 201 && imNew.data.id, `id=${imNew.data?.id}`);

  const imDup = await req('POST', '/impuestos', { codigo: 'TEST_AUD', nombre: 'Duplicado', porcentaje: 1 }, token);
  log('IMPUESTOS', 'Rechaza duplicado (409)', imDup.status === 409, `status=${imDup.status}`);

  const imUpd = await req('PATCH', `/impuestos/${imNew.data.id}`, { porcentaje: 8.5 }, token);
  log('IMPUESTOS', 'Editar', imUpd.status === 200 && Number(imUpd.data.porcentaje) === 8.5, `pct=${imUpd.data?.porcentaje}`);

  // ===== UNIDADES DE MEDIDA =====
  const um = await req('GET', '/unidades-medida?limit=100', null, token);
  const umList = um.data?.data ?? [];
  log('UNIDADES', 'Listar predeterminadas', umList.length === 10, `${umList.length} registros`);

  const umNew = await req('POST', '/unidades-medida', { codigo: 'TEST_U', nombre: 'Unidad Test', descripcion: 'temporal' }, token);
  log('UNIDADES', 'Crear', umNew.status === 201 && umNew.data.id, `id=${umNew.data?.id}`);

  const umDup = await req('POST', '/unidades-medida', { codigo: 'TEST_U', nombre: 'Dup' }, token);
  log('UNIDADES', 'Rechaza duplicado (409)', umDup.status === 409, `status=${umDup.status}`);

  const umUpd = await req('PATCH', `/unidades-medida/${umNew.data.id}`, { descripcion: 'editado' }, token);
  log('UNIDADES', 'Editar', umUpd.status === 200 && umUpd.data.descripcion === 'editado');

  // ===== MONEDAS =====
  const mo = await req('GET', '/monedas', null, token);
  const moList = mo.data?.data ?? mo.data ?? [];
  log('MONEDAS', 'Listar', moList.length > 0, `${moList.length} monedas`);

  const moLocal = await req('GET', '/monedas/local', null, token);
  log('MONEDAS', 'Moneda local disponible', moLocal.status === 200, moLocal.data?.codigo || '');

  // ===== TIPOS DE DOCUMENTO =====
  const td = await req('GET', '/tipos-documento', null, token);
  const tdList = td.data?.data ?? td.data ?? [];
  log('TIPOS-DOC', 'Listar', td.status === 200 && tdList.length > 0, `${tdList.length} registros`);

  // ===== PERIODOS DE PAGO =====
  const pp = await req('GET', '/periodos-pago', null, token);
  const ppList = pp.data?.data ?? pp.data ?? [];
  log('PERIODOS-PAGO', 'Listar', pp.status === 200, `${ppList.length} registros`);

  // ===== TIPOS DE COMPROBANTES =====
  const tc = await req('GET', '/tipo-comprobantes', null, token);
  const tcList = tc.data?.data ?? tc.data ?? [];
  log('TIPOS-COMPROBANTES', 'Listar', tc.status === 200 && tcList.length > 0, `${tcList.length} registros`);

  // ===== EMPRESA (MI-EMPRESA) =====
  const emp = await req('GET', '/empresas/mi-empresa', null, token);
  log('EMPRESA', 'GET mi-empresa', emp.status === 200 && emp.data.id === 1, emp.data?.nombre);

  const empUpd = await req('PATCH', '/empresas/mi-empresa', { regimen: 'Responsable de IVA', pais: 'Colombia' }, token);
  log('EMPRESA', 'PATCH mi-empresa', empUpd.status === 200 && empUpd.data.regimen === 'Responsable de IVA');

  const empCodigo = await req('PATCH', '/empresas/mi-empresa', { codigo: 'HACK' }, token);
  const empAfter = await req('GET', '/empresas/mi-empresa', null, token);
  log('EMPRESA', 'No permite cambiar codigo', empAfter.data.codigo === 'DEMO', `codigo=${empAfter.data.codigo}`);

  // ===== SINCRONIZACIÓN: TERCERO con tipo de tercero del catálogo =====
  const tipoCliente = ttList.find(t => t.nombre === 'Cliente');
  const ter = await req('POST', '/terceros', { nombre: 'Cliente Auditoría', tipo_terceros: tipoCliente.id, tipo_naturaleza: 1 }, token);
  log('SYNC TERCEROS', 'Crear tercero con tipo del catálogo', ter.status === 201 && Number(ter.data.tipo_terceros) === tipoCliente.id, `tipo=${ter.data?.tipo_terceros}`);
  if (ter.data?.id) creados.push(['/terceros', ter.data.id]);

  // ===== SINCRONIZACIÓN: PRODUCTO con unidad + impuesto del catálogo =====
  const prod = await req('POST', '/productos', {
    nombre: 'Producto Auditoría Sync',
    unidad_medida: umNew.data.codigo,
    impuesto: Number(imNew.data.porcentaje),
    ultimo_precio: 1000,
    tipo: 1,
  }, token);
  const prodOk = prod.status === 201 && prod.data.unidad_medida === 'TEST_U' && Number(prod.data.impuesto) === 8.5;
  log('SYNC PRODUCTOS', 'Crear producto con unidad+impuesto del catálogo', prodOk, `codigo=${prod.data?.codigo} unidad=${prod.data?.unidad_medida} impuesto=${prod.data?.impuesto}`);
  if (prod.data?.id) creados.push(['/productos', prod.data.id]);

  // Producto sin código -> autogenerado
  const prod2 = await req('POST', '/productos', { nombre: 'Producto Sin Codigo Audit', tipo: 1 }, token);
  log('SYNC PRODUCTOS', 'Autogenera código', prod2.status === 201 && /^PDT\d+$/.test(prod2.data.codigo), `codigo=${prod2.data?.codigo}`);
  if (prod2.data?.id) creados.push(['/productos', prod2.data.id]);

  // ===== SINCRONIZACIÓN: VENTA con impuesto del producto =====
  if (prod.data?.id && ter.data?.id) {
    const venta = await req('POST', '/ventas', {
      cliente_id: ter.data.id,
      fecha: '2026-09-08',
      modo: 1,
      forma: 1,
      concepto: 'Auditoría',
      detalles: [{ producto_id: prod.data.id, cantidad: 1, precio_unitario: 1000, descuento: 0, impuesto: 8.5 }],
    }, token);
    const vOk = venta.status === 201 && Number(venta.data.impuesto) === 8.5;
    log('SYNC VENTAS', 'Venta usa impuesto del catálogo (8.5%)', vOk, `impuesto=${venta.data?.impuesto} total=${venta.data?.total}`);
    if (venta.data?.id) creados.push(['/ventas/anular', venta.data.id, 'venta']);
  }

  // ===== SINCRONIZACIÓN: COMPRA =====
  const tipoProveedor = ttList.find(t => t.nombre === 'Proveedor');
  const prov = await req('POST', '/terceros', { nombre: 'Proveedor Auditoría', tipo_terceros: tipoProveedor.id, tipo_naturaleza: 2 }, token);
  if (prov.data?.id) creados.push(['/terceros', prov.data.id]);

  if (prod.data?.id && prov.data?.id) {
    const compra = await req('POST', '/compras', {
      proveedor_id: prov.data.id,
      fecha: '2026-09-08',
      modo: 1,
      forma: 1,
      concepto: 'Auditoría',
      detalles: [{ producto_id: prod.data.id, cantidad: 1, costo_unitario: 500, descuento: 0, impuesto: 8.5 }],
    }, token);
    const cOk = compra.status === 201 && Number(compra.data.impuesto) === 8.5;
    log('SYNC COMPRAS', 'Compra usa impuesto del catálogo (8.5%)', cOk, `impuesto=${compra.data?.impuesto}`);
    if (compra.data?.id) creados.push(['/compras/anular', compra.data.id, 'compra']);
  }

  // ===== LIMPIEZA =====
  console.log('\n--- Limpieza de registros de prueba ---');
  for (const [path, id, tipo] of creados) {
    if (tipo === 'venta' || tipo === 'compra') {
      const r = await req('POST', `${path}/${id}`, {}, token);
      console.log(`  ${tipo} ${id}: ${r.status === 200 || r.status === 201 ? 'anulado' : 'no se pudo anular (' + r.status + ')'}`);
    } else {
      const r = await req('DELETE', `${path}/${id}`, null, token);
      console.log(`  ${path} ${id}: ${r.status === 200 ? 'eliminado' : 'no se pudo eliminar (' + r.status + ')'}`);
    }
  }
  // limpiar unidad e impuesto de prueba
  await req('DELETE', `/unidades-medida/${umNew.data.id}`, null, token);
  await req('DELETE', `/impuestos/${imNew.data.id}`, null, token);

  // ===== RESUMEN =====
  const ok = resultados.filter(r => r.ok).length;
  const fail = resultados.filter(r => !r.ok);
  console.log(`\n${'='.repeat(50)}\nRESULTADO: ${ok}/${resultados.length} pruebas OK`);
  if (fail.length) {
    console.log('FALLAS:');
    fail.forEach(f => console.log(`  ❌ [${f.modulo}] ${f.prueba} — ${f.detalle}`));
  }
}

main().catch(e => { console.log('ERROR FATAL:', e.message); process.exit(1); });
