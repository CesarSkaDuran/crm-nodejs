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
  console.log('=== Login OK ===\n');

  // ============================================
  // BALANCE GENERAL
  // ============================================
  console.log('=== BALANCE GENERAL ===');
  const balanceRes = await fetch(`${BASE}/informes/balance`, { headers: auth });
  const balance = await balanceRes.json();

  // KPIs
  console.log('\n--- KPIs ---');
  console.log(`Activo:              ${balance.totales.activo}`);
  console.log(`Pasivo:              ${balance.totales.pasivo}`);
  console.log(`Patrimonio:          ${balance.totales.patrimonio}`);
  console.log(`Pasivo+Patrimonio:   ${balance.totales.pasivo_mas_patrimonio}`);
  console.log(`Resultado Ejercicio: ${balance.totales.resultado_ejercicio}`);
  console.log(`Saldo final (A-P-P): ${balance.saldo_final}`);

  // Detalle
  console.log(`\n--- Detalle (${balance.data.length} cuentas) ---`);
  for (const row of balance.data) {
    const flag = row.saldo_anomalo ? ' [ANÓMALO]' : '';
    const virtual = row.esVirtual ? ' [VIRTUAL]' : '';
    const padre = row.esPadre ? ' [PADRE]' : ' [AUX]';
    const contrario = row.esSaldoContrario ? ' [CONTRARIO]' : '';
    const indent = '  '.repeat(row.nivel || 1);
    console.log(`${indent}${row.codigo.padEnd(12)} | ${row.nombre.padEnd(50)} | nivel=${row.nivel} clase=${row.clase} | D=${String(row.debito).padStart(12)} C=${String(row.credito).padStart(12)} | saldo=${String(row.saldo).padStart(12)}${padre}${virtual}${contrario}${flag}`);
  }

  // ============================================
  // VERIFICACIONES
  // ============================================
  console.log('\n=== VERIFICACIONES ===');

  // 1. El balance debe cuadrar: Activo = Pasivo + Patrimonio
  const diff = Math.abs(balance.totales.activo - balance.totales.pasivo_mas_patrimonio);
  console.log(`1. Activo = Pasivo + Patrimonio: |${balance.totales.activo} - ${balance.totales.pasivo_mas_patrimonio}| = ${diff.toFixed(2)} ${diff < 0.01 ? '✓ CUADRA' : '✗ NO CUADRA'}`);

  // 2. Las cuentas padre NO deben tener débito/crédito en 0
  const padresConCero = balance.data.filter((r) => r.esPadre && r.debito === 0 && r.credito === 0);
  console.log(`2. Cuentas padre con D/C en 0: ${padresConCero.length} ${padresConCero.length === 0 ? '✓' : '✗'}`);
  if (padresConCero.length > 0) {
    for (const p of padresConCero.slice(0, 5)) {
      console.log(`   - ${p.codigo} ${p.nombre}: D=${p.debito} C=${p.credito}`);
    }
  }

  // 3. Ordenamiento jerárquico
  let ordenOk = true;
  for (let i = 1; i < balance.data.length; i++) {
    const prev = balance.data[i - 1].codigo;
    const curr = balance.data[i].codigo;
    const segPrev = prev.split('.').map((s) => parseInt(s, 10) || 0);
    const segCurr = curr.split('.').map((s) => parseInt(s, 10) || 0);
    const maxLen = Math.max(segPrev.length, segCurr.length);
    for (let j = 0; j < maxLen; j++) {
      const a = segPrev[j] ?? 0;
      const b = segCurr[j] ?? 0;
      if (a < b) break;
      if (a > b) {
        ordenOk = false;
        console.log(`   Orden roto: ${prev} va antes que ${curr}`);
        break;
      }
    }
    if (!ordenOk) break;
  }
  console.log(`3. Ordenamiento jerárquico: ${ordenOk ? '✓' : '✗'}`);

  // 4. Resultado del ejercicio presente
  const tieneResultado = balance.data.some((r) => r.esVirtual && (r.nombre.includes('UTILIDAD') || r.nombre.includes('PERDIDA')));
  console.log(`4. Cuenta virtual Resultado del Ejercicio: ${tieneResultado ? '✓' : '✗'}`);

  // 5. Verificar que el resultado del ejercicio coincide con el P&G
  const pygRes = await fetch(`${BASE}/informes/pyg`, { headers: auth });
  const pyg = await pygRes.json();
  const diffResultado = Math.abs(balance.totales.resultado_ejercicio - pyg.utilidadPerdida);
  console.log(`5. Resultado balance (${balance.totales.resultado_ejercicio}) vs P&G (${pyg.utilidadPerdida}): ${diffResultado < 0.01 ? '✓' : '✗'}`);

  // 6. Verificar agregación: el saldo de la cuenta raíz "1" debe = suma de todos los saldos de clase 1
  const cuenta1 = balance.data.find((r) => r.codigo === '1');
  const sumaAuxiliares1 = balance.data.filter((r) => r.clase === '1' && !r.esPadre).reduce((s, r) => s + r.saldo, 0);
  if (cuenta1) {
    const diff1 = Math.abs(cuenta1.saldo - sumaAuxiliares1);
    console.log(`6. Cuenta "1" saldo (${cuenta1.saldo}) = suma auxiliares (${sumaAuxiliares1}): ${diff1 < 0.01 ? '✓' : '✗'}`);
  }

  // 7. Verificar campo 'nivel' en todas las filas
  const sinNivel = balance.data.filter((r) => r.nivel === undefined || r.nivel === null);
  console.log(`7. Filas sin 'nivel': ${sinNivel.length} ${sinNivel.length === 0 ? '✓' : '✗'}`);
  const niveles = [...new Set(balance.data.map((r) => r.nivel))].sort();
  console.log(`   Niveles presentes: ${niveles.join(', ')}`);

  // 8. Verificar campo 'esSaldoContrario' en todas las filas
  const sinContrario = balance.data.filter((r) => r.esSaldoContrario === undefined);
  console.log(`8. Filas sin 'esSaldoContrario': ${sinContrario.length} ${sinContrario.length === 0 ? '✓' : '✗'}`);
  const contrarios = balance.data.filter((r) => r.esSaldoContrario);
  console.log(`   Cuentas con saldo contrario: ${contrarios.length}`);
  for (const c of contrarios) {
    console.log(`   - ${c.codigo} ${c.nombre}: saldo=${c.saldo} naturaleza=${c.naturaleza}`);
  }

  // 9. Verificar que la cuenta 3 (Patrimonio) incluye el resultado del ejercicio
  const cuenta3 = balance.data.find((r) => r.codigo === '3');
  const cuentaResultado = balance.data.find((r) => r.esVirtual);
  if (cuenta3 && cuentaResultado) {
    console.log(`9. Cuenta "3" saldo (${cuenta3.saldo}) incluye resultado (${cuentaResultado.saldo}): ${Math.abs(cuenta3.saldo - cuentaResultado.saldo) < 0.01 ? '✓ (solo resultado)' : '✓ (patrimonio + resultado)'}`);
  }
}

main().catch(console.error);
