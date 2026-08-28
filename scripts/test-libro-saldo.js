/**
 * Valida los 3 fixes del Libro Auxiliar:
 * 1. Saldo acumulado independiente por cuenta (no lineal global)
 * 2. Cuenta como string plano (cuenta_str) para exportación
 * 3. Coherencia: saldo_final = suma de saldos por naturaleza de cada cuenta
 */
const BASE = 'http://localhost:3000/api/v1';

async function main() {
  // Login
  const loginRes = await fetch(`${BASE}/autenticacion/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo_empresa: 'DEMO', email: 'admin@demo.com', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.access_token || loginData.token;
  const auth = { Authorization: `Bearer ${token}` };
  console.log('=== Login OK ===\n');

  // Obtener cuentas
  const cuentasRes = await fetch(`${BASE}/cuentas`, { headers: auth });
  const cuentasData = await cuentasRes.json();
  const lista = Array.isArray(cuentasData) ? cuentasData : (cuentasData.data || []);

  // --- Test 1: Libro con UNA sola cuenta (saldo lineal = saldo por cuenta) ---
  const cuentaCaja = lista.find((c) => c.codigo === '1.1.05.05');
  if (cuentaCaja) {
    console.log('=== TEST 1: Libro con cuenta única 1.1.05.05 ===');
    const res = await fetch(`${BASE}/informes/libro?cuenta_id=${cuentaCaja.id}&modo=detallado`, { headers: auth });
    const libro = await res.json();
    validarLibro(libro, 'TEST 1');
  }

  // --- Test 2: Libro con RANGO de cuentas (saldo debe ser independiente por cuenta) ---
  const desde = lista.find((c) => c.codigo === '1.1.05');
  const hasta = lista.find((c) => c.codigo === '1.4.35.99');
  if (desde && hasta) {
    console.log('\n=== TEST 2: Libro rango 1.1.05 a 1.4.35.99 (múltiples cuentas) ===');
    const res = await fetch(`${BASE}/informes/rango?desde_id=${desde.id}&hasta_id=${hasta.id}&modo=detallado`, { headers: auth });
    const libro = await res.json();
    validarLibro(libro, 'TEST 2');
  }

  // --- Test 3: Verificar cuenta_str en cada fila ---
  console.log('\n=== TEST 3: Verificar cuenta_str (string plano para exportación) ===');
  if (cuentaCaja) {
    const res = await fetch(`${BASE}/informes/libro?cuenta_id=${cuentaCaja.id}&modo=detallado`, { headers: auth });
    const libro = await res.json();
    const data = libro.data || [];
    let strOk = 0;
    let strFail = 0;
    for (const row of data) {
      if (typeof row.cuenta_str === 'string' && row.cuenta_str.includes(' - ') && row.cuenta_str.length > 5) {
        strOk++;
      } else {
        strFail++;
      }
    }
    console.log(`  Filas con cuenta_str OK: ${strOk}`);
    console.log(`  Filas con cuenta_str FAIL: ${strFail}`);
    console.log(`  ${strFail === 0 ? '✓ PASS' : '✗ FAIL'}`);
    if (data.length > 0) {
      console.log(`  Muestra: "${data[0].cuenta_str}"`);
    }
  }
}

function validarLibro(libro, label) {
  const data = libro.data || [];
  console.log(`  Filas: ${data.length}`);
  console.log(`  Total Débito: ${libro.total_debito}`);
  console.log(`  Total Crédito: ${libro.total_credito}`);
  console.log(`  Saldo Final: ${libro.saldo_final}`);

  if (data.length === 0) {
    console.log('  Sin datos para validar');
    return;
  }

  // --- Fix 1: Saldo independiente por cuenta ---
  // Agrupar filas por cuenta_contable_id y verificar que el saldo
  // acumulado se reinicia para cada cuenta
  const saldosPorCuenta = new Map();
  let saldoIndependiente = true;

  for (const row of data) {
    const cuentaId = row.cuenta?.id || row.tercero_id; // fallback
    const cuentaKey = row.cuenta?.codigo || 'UNKNOWN';

    if (!saldosPorCuenta.has(cuentaKey)) {
      saldosPorCuenta.set(cuentaKey, { primerSaldo: row.saldo, ultimoSaldo: row.saldo, count: 1 });
    } else {
      const entry = saldosPorCuenta.get(cuentaKey);
      entry.ultimoSaldo = row.saldo;
      entry.count++;
    }
  }

  // Verificar que cada cuenta tiene su propio saldo acumulado
  // (el saldo de la primera fila de cada cuenta debe ser = débito - crédito de esa fila)
  let cuentasConSaldoIndependiente = 0;
  let cuentasConSaldoGlobal = 0;

  for (const [codigo, info] of saldosPorCuenta) {
    // La primera fila de cada cuenta debería tener saldo = valor (no arrastrar saldo anterior)
    const primeraFila = data.find((r) => (r.cuenta?.codigo || '') === codigo);
    if (primeraFila) {
      const valorEsperado = primeraFila.valor;
      if (Math.abs(primeraFila.saldo - valorEsperado) < 0.01) {
        cuentasConSaldoIndependiente++;
      } else {
        cuentasConSaldoGlobal++;
        console.log(`  [WARN] Cuenta ${codigo}: primera fila saldo=${primeraFila.saldo} vs valor=${valorEsperado} (arrastra saldo global)`);
      }
    }
  }

  console.log(`  Cuentas únicas: ${saldosPorCuenta.size}`);
  console.log(`  Cuentas con saldo independiente: ${cuentasConSaldoIndependiente}`);
  console.log(`  Cuentas con saldo global (arrastrado): ${cuentasConSaldoGlobal}`);
  console.log(`  Fix 1 (saldo por cuenta): ${cuentasConSaldoGlobal === 0 ? '✓ PASS' : '✗ FAIL'}`);

  // --- Fix 3: Coherencia saldo_final ---
  // saldo_final debe ser = suma de (débito - crédito) por naturaleza de cada cuenta
  // Simplificado: si todas son naturaleza D, saldo_final = total_debito - total_credito
  const diffTotales = libro.total_debito - libro.total_credito;
  console.log(`  Diferencia total_debito - total_credito: ${diffTotales.toFixed(2)}`);
  console.log(`  saldo_final reportado: ${libro.saldo_final.toFixed(2)}`);

  // Para una sola cuenta de naturaleza D, deberían coincidir
  if (saldosPorCuenta.size === 1) {
    const match = Math.abs(Math.abs(libro.saldo_final) - Math.abs(diffTotales)) < 0.01;
    console.log(`  Fix 3 (coherencia saldo_final): ${match ? '✓ PASS' : '✗ FAIL'}`);
  } else {
    // Para múltiples cuentas, verificar que saldo_final = suma de saldos finales por cuenta
    let sumaSaldosFinales = 0;
    for (const [codigo, info] of saldosPorCuenta) {
      sumaSaldosFinales += info.ultimoSaldo;
    }
    const match = Math.abs(libro.saldo_final - sumaSaldosFinales) < 0.01;
    console.log(`  Suma saldos finales por cuenta: ${sumaSaldosFinales.toFixed(2)}`);
    console.log(`  Fix 3 (coherencia saldo_final): ${match ? '✓ PASS' : '✗ FAIL'}`);
  }

  // Mostrar muestra
  console.log(`\n  --- Muestra (primeras 5 filas) ---`);
  for (const row of data.slice(0, 5)) {
    const cuenta = row.cuenta_str || (row.cuenta ? `${row.cuenta.codigo} - ${row.cuenta.nombre}` : 'N/A');
    console.log(`  ${row.fecha} | ${row.consecutivo} | ${cuenta} | ${row.tercero} | D=${row.debito} C=${row.credito} | V=${row.valor} | Saldo=${row.saldo}`);
  }
}

main().catch(console.error);
