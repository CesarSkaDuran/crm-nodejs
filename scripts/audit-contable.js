/**
 * AUDITORÍA CONTABLE - Verifica cuadre del plan de cuentas
 * 1. Toma balance actual (débitos vs créditos globales)
 * 2. Crea una venta de prueba
 * 3. Verifica que el asiento cuadre (débito = crédito)
 * 4. Verifica que el balance global siga cuadrando
 * 5. Anula la venta y verifica reversión
 */

const BASE = 'http://localhost:3000/api/v1';
let token = '';
const headers = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${token}`,
});

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

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

async function getBalanceGlobal() {
  // Usar el endpoint de movimientos que devuelve total_debito y total_credito
  const r = await api('GET', '/movimientos?limit=1');
  if (r.ok) {
    const data = r.data;
    return {
      totalDebito: round2(Number(data?.total_debito || 0)),
      totalCredito: round2(Number(data?.total_credito || 0)),
      count: Number(data?.total || 0),
    };
  }
  // Fallback: sumar manualmente
  const r2 = await api('GET', '/movimientos?limit=200');
  const data = r2.ok ? (r2.data?.data || r2.data || []) : [];
  let totalDebito = 0, totalCredito = 0;
  for (const line of data) {
    totalDebito += Number(line.debito || 0);
    totalCredito += Number(line.credito || 0);
  }
  return { totalDebito: round2(totalDebito), totalCredito: round2(totalCredito), count: data.length };
}

async function getBalancePorCuenta() {
  // Traer todas las cuentas con sus saldos usando el informe de balance
  const r = await api('GET', '/informes/balance');
  return r;
}

async function getAsiento(asentadoId) {
  const r = await api('GET', `/asentados/${asentadoId}`);
  return r;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        AUDITORÍA CONTABLE - CUADRE DEL PLAN              ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // LOGIN
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
  console.log('  ✓ Token obtenido\n');

  // ============ 1. BALANCE ANTES ============
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  1. ESTADO CONTABLE ANTES DEL MOVIMIENTO');
  console.log('═══════════════════════════════════════════════════════════\n');

  const balanceAntes = await getBalanceGlobal();
  const diffAntes = round2(balanceAntes.totalDebito - balanceAntes.totalCredito);
  console.log(`  Total Débitos:   $${balanceAntes.totalDebito.toLocaleString()}`);
  console.log(`  Total Créditos:  $${balanceAntes.totalCredito.toLocaleString()}`);
  console.log(`  Diferencia:      $${diffAntes.toLocaleString()}`);
  console.log(`  Líneas contables: ${balanceAntes.count}`);
  console.log(`  ¿Cuadra? ${Math.abs(diffAntes) < 0.01 ? '✓ SÍ' : '✗ NO (descuadre)'}`);

  // Balance general
  const balGen = await getBalancePorCuenta();
  if (balGen.ok) {
    const bg = balGen.data;
    if (bg?.total_debito !== undefined) {
      console.log(`  Balance General - Débitos: $${Number(bg.total_debito).toLocaleString()}`);
      console.log(`  Balance General - Créditos: $${Number(bg.total_credito).toLocaleString()}`);
    }
    if (bg?.clases) {
      console.log(`  Clases contables: ${bg.clases.length}`);
      let cuadraClases = true;
      for (const clase of bg.clases) {
        const dClass = Number(clase.total_debito || 0);
        const cClass = Number(clase.total_credito || 0);
        // Para balance general no necesariamente cuadra por clase
      }
    }
  }

  // ============ 2. PREPARAR DATOS PARA VENTA ============
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  2. PREPARANDO VENTA DE PRUEBA');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Buscar un cliente con cuenta contable asignada
  const terceros = await api('GET', '/terceros');
  const listaTerceros = terceros.ok ? (terceros.data?.data || terceros.data || []) : [];
  const cliente = listaTerceros.find(t => t.cuenta_contable_id) || null;
  if (!cliente) {
    console.log('  ✗ No hay terceros con cuenta contable asignada');
    console.log('  SUGERENCIA: Asigne una cuenta contable a un tercero en el maestro de terceros');
    return;
  }
  console.log(`  ✓ Cliente: ${cliente.nombre} (ID: ${cliente.id}, cuenta: ${cliente.cuenta_contable_id})`);

  // Buscar un producto
  const productos = await api('GET', '/productos');
  const listaProductos = productos.ok ? (productos.data?.data || productos.data || []) : [];
  const producto = listaProductos.find(p => p.cuenta_ingresos_id && p.cuenta_costos_id) || listaProductos[0];
  if (!producto) {
    console.log('  ✗ No hay productos con cuentas contables asignadas');
    return;
  }
  console.log(`  ✓ Producto: ${producto.nombre} (ID: ${producto.id})`);
  console.log(`    PVP1: $${producto.pvp1}, Cuenta ingresos: ${producto.cuenta_ingresos_id}, Cuenta costos: ${producto.cuenta_costos_id}`);

  // Buscar un banco
  const bancos = await api('GET', '/bancos');
  const listaBancos = bancos.ok ? (bancos.data?.data || bancos.data || []) : [];
  const banco = listaBancos[0];
  if (banco) {
    console.log(`  ✓ Banco: ${banco.nombre} (ID: ${banco.id})`);
  }

  // ============ 3. CREAR VENTA ============
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  3. EJECUTANDO VENTA DE PRUEBA');
  console.log('═══════════════════════════════════════════════════════════\n');

  const ventaBody = {
    cliente_id: cliente.id,
    fecha: new Date().toISOString().split('T')[0],
    numero_factura: 'AUDIT-' + Date.now().toString().slice(-6),
    concepto: 'Venta de auditoría contable',
    almacen: 'PRINCIPAL',
    modo: 1, // contado
    forma: 1, // efectivo
    banco_id: banco?.id || null,
    descuento: 0,
    retencion: 0,
    flete: 0,
    observacion: 'AUDITORÍA CONTABLE - ELIMINAR',
    detalles: [
      {
        producto_id: producto.id,
        cantidad: 1,
        precio_unitario: Number(producto.pvp1) || 100,
        descuento: 0,
        impuesto: Number(producto.impuesto) || 19,
      },
    ],
  };

  console.log(`  Enviando venta: ${ventaBody.detalles.length} detalle(s)`);
  console.log(`  Precio unitario: $${ventaBody.detalles[0].precio_unitario}`);
  console.log(`  IVA: ${ventaBody.detalles[0].impuesto}%`);

  const ventaResp = await api('POST', '/ventas', ventaBody);
  if (!ventaResp.ok) {
    console.log(`  ✗ Error al crear venta: ${ventaResp.status}`);
    console.log(`  ${JSON.stringify(ventaResp.data?.message || ventaResp.data).slice(0, 200)}`);
    return;
  }

  const venta = ventaResp.data;
  const ventaId = venta.id || venta.venta?.id;
  const ventaCodigo = venta.codigo || venta.venta?.codigo;
  console.log(`  ✓ Venta creada: ID ${ventaId}, código ${ventaCodigo}`);
  if (venta.total !== undefined) console.log(`  ✓ Total venta: $${venta.total}`);

  // Buscar asiento por descripción (contiene el código de la venta)
  let asentadoId = null;
  const asientoBusqueda = await api('GET', `/asentados?search=${ventaCodigo}`);
  if (asientoBusqueda.ok) {
    const asientos = asientoBusqueda.data?.data || asientoBusqueda.data || [];
    // El asiento de venta tiene tipo=2 y la descripción contiene el código
    const encontrado = asientos.find(a => a.descripcion?.includes(ventaCodigo) && Number(a.tipo) === 2);
    if (encontrado) asentadoId = encontrado.id;
  }
  console.log(`  ✓ Asiento contable ID: ${asentadoId || 'N/A'}`);

  // ============ 4. VERIFICAR ASIENTO CONTABLE ============
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  4. VERIFICANDO ASIENTO CONTABLE');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (asentadoId) {
    const asiento = await getAsiento(asentadoId);
    if (asiento.ok) {
      const a = asiento.data;
      const td = Number(a.total_debito || 0);
      const tc = Number(a.total_credito || 0);
      const diff = round2(td - tc);
      console.log(`  Consecutivo: ${a.consecutivo}`);
      console.log(`  Descripción: ${a.descripcion}`);
      console.log(`  Total Débito:  $${td.toLocaleString()}`);
      console.log(`  Total Crédito: $${tc.toLocaleString()}`);
      console.log(`  Diferencia:    $${diff.toLocaleString()}`);
      console.log(`  ¿Cuadra el asiento? ${Math.abs(diff) < 0.01 ? '✓ SÍ' : '✗ NO'}`);
      console.log(`  Líneas del asiento: ${a.detalles?.length || 0}`);

      if (a.detalles && a.detalles.length > 0) {
        console.log('\n  --- Detalle del asiento ---');
        for (const d of a.detalles) {
          const cuenta = d.cuenta_contable;
          const codigo = cuenta?.codigo || '?';
          const nombre = cuenta?.nombre || '?';
          const deb = Number(d.debito || 0);
          const cred = Number(d.credito || 0);
          console.log(`  ${codigo} ${nombre.slice(0, 30).padEnd(30)} D: $${deb.toFixed(2).padStart(12)}  C: $${cred.toFixed(2).padStart(12)}`);
        }
        console.log(`  ${'─'.repeat(80)}`);
        console.log(`  ${'TOTAL'.padEnd(38)} D: $${td.toFixed(2).padStart(12)}  C: $${tc.toFixed(2).padStart(12)}`);
      }
    } else {
      console.log(`  ✗ No se pudo obtener el asiento: ${asiento.status}`);
    }
  } else {
    console.log('  ⚠ La venta no devolvió asentado_id, buscando por consecutivo...');
    // Buscar en movimientos
    const movs = await api('GET', `/movimientos?limit=5`);
    if (movs.ok) {
      const ultimos = movs.data?.data || movs.data || [];
      console.log(`  Últimos ${ultimos.length} movimientos:`);
      for (const m of ultimos.slice(0, 5)) {
        console.log(`    ID ${m.id} | Asentado ${m.asentado_id} | Cuenta ${m.cuenta_contable?.codigo} | D: ${m.debito} C: ${m.credito}`);
      }
    }
  }

  // ============ 5. BALANCE DESPUÉS ============
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  5. ESTADO CONTABLE DESPUÉS DEL MOVIMIENTO');
  console.log('═══════════════════════════════════════════════════════════\n');

  const balanceDespues = await getBalanceGlobal();
  const diffDespues = round2(balanceDespues.totalDebito - balanceDespues.totalCredito);
  console.log(`  Total Débitos:   $${balanceDespues.totalDebito.toLocaleString()}`);
  console.log(`  Total Créditos:  $${balanceDespues.totalCredito.toLocaleString()}`);
  console.log(`  Diferencia:      $${diffDespues.toLocaleString()}`);
  console.log(`  Líneas contables: ${balanceDespues.count}`);
  console.log(`  ¿Cuadra? ${Math.abs(diffDespues) < 0.01 ? '✓ SÍ' : '✗ NO (descuadre)'}`);

  // Incremento esperado
  const incDebito = round2(balanceDespues.totalDebito - balanceAntes.totalDebito);
  const incCredito = round2(balanceDespues.totalCredito - balanceAntes.totalCredito);
  console.log(`\n  Incremento débitos:  $${incDebito.toLocaleString()}`);
  console.log(`  Incremento créditos: $${incCredito.toLocaleString()}`);
  console.log(`  ¿Incremento cuadra? ${Math.abs(round2(incDebito - incCredito)) < 0.01 ? '✓ SÍ' : '✗ NO'}`);

  // ============ 6. ANULAR VENTA ============
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  6. ANULANDO VENTA DE PRUEBA');
  console.log('═══════════════════════════════════════════════════════════\n');

  let anularOk = false;
  let revDebito = 0;
  let revCredito = 0;
  if (ventaId) {
    const anularResp = await api('POST', `/ventas/${ventaId}/anular`);
    anularOk = anularResp.ok;
    if (anularResp.ok) {
      console.log(`  ✓ Venta ${ventaCodigo} anulada correctamente`);
      if (anularResp.data?.asentado) {
        const a = anularResp.data.asentado;
        revDebito = Number(a.total_debito || 0);
        revCredito = Number(a.total_credito || 0);
        console.log(`  ✓ Asiento de reversión ID: ${a.id}`);
        console.log(`  ✓ Reversión Débito:  $${revDebito.toLocaleString()}`);
        console.log(`  ✓ Reversión Crédito: $${revCredito.toLocaleString()}`);
        const diffRev = round2(revDebito - revCredito);
        console.log(`  ¿Reversión cuadra? ${Math.abs(diffRev) < 0.01 ? '✓ SÍ' : '✗ NO'}`);
      }
    } else {
      console.log(`  ✗ Error al anular: ${anularResp.status} ${JSON.stringify(anularResp.data?.message || '').slice(0, 100)}`);
    }
  }

  // ============ 7. BALANCE TRAS ANULACIÓN ============
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  7. ESTADO CONTABLE TRAS ANULACIÓN');
  console.log('═══════════════════════════════════════════════════════════\n');

  const balanceFinal = await getBalanceGlobal();
  const diffFinal = round2(balanceFinal.totalDebito - balanceFinal.totalCredito);
  console.log(`  Total Débitos:   $${balanceFinal.totalDebito.toLocaleString()}`);
  console.log(`  Total Créditos:  $${balanceFinal.totalCredito.toLocaleString()}`);
  console.log(`  Diferencia:      $${diffFinal.toLocaleString()}`);
  console.log(`  ¿Cuadra? ${Math.abs(diffFinal) < 0.01 ? '✓ SÍ' : '✗ NO'}`);

  // El efecto neto de venta + anulación debe ser cero (D y C aumentan igual)
  const netoDebito = round2(incDebito - revDebito);
  const netoCredito = round2(incCredito - revCredito);
  console.log(`\n  Efecto neto (venta - reversión):`);
  console.log(`    Débitos:  $${netoDebito.toLocaleString()}`);
  console.log(`    Créditos: $${netoCredito.toLocaleString()}`);
  console.log(`    ¿Efecto neto = 0? ${Math.abs(netoDebito) < 0.01 && Math.abs(netoCredito) < 0.01 ? '✓ SÍ' : '✗ NO'}`);

  // ============ REPORTE FINAL ============
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              REPORTE DE CUADRE CONTABLE                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Verificar asiento real
  let asientoCuadra = false;
  if (asentadoId) {
    const asiento = await getAsiento(asentadoId);
    if (asiento.ok) {
      const a = asiento.data;
      const td = Number(a.total_debito || 0);
      const tc = Number(a.total_credito || 0);
      asientoCuadra = Math.abs(round2(td - tc)) < 0.01;
    }
  }

  const checks = [
    { name: 'Balance inicial cuadra', ok: Math.abs(diffAntes) < 0.01 },
    { name: 'Asiento de venta cuadra (D=C)', ok: asientoCuadra },
    { name: 'Balance tras venta cuadra', ok: Math.abs(diffDespues) < 0.01 },
    { name: 'Incremento D=C tras venta', ok: Math.abs(round2(incDebito - incCredito)) < 0.01 },
    { name: 'Venta anulada correctamente', ok: anularOk },
    { name: 'Balance tras anulación cuadra', ok: Math.abs(diffFinal) < 0.01 },
    { name: 'Efecto neto venta+anulación = 0', ok: Math.abs(netoDebito) < 0.01 && Math.abs(netoCredito) < 0.01 },
  ];

  let okCount = 0;
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}`);
    if (c.ok) okCount++;
  }

  const pct = Math.round((okCount / checks.length) * 100);
  console.log(`\n  📊 CUADRE CONTABLE: ${pct}% (${okCount}/${checks.length} verificaciones OK)`);
  console.log(`     Diferencia inicial: $${diffAntes.toLocaleString()}`);
  console.log(`     Diferencia final:   $${diffFinal.toLocaleString()}`);
}

main().catch(console.error);
