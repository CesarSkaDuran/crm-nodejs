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
  // ESTADO DE RESULTADOS (P&G) - Nueva estructura
  // ============================================
  console.log('=== ESTADO DE RESULTADOS (P&G) ===');
  const pygRes = await fetch(`${BASE}/informes/pyg`, { headers: auth });
  const pyg = await pygRes.json();

  // KPIs superiores
  console.log('\n--- KPIs ---');
  console.log(`totalIngresos:   ${pyg.totalIngresos}`);
  console.log(`totalCostos:     ${pyg.totalCostos}`);
  console.log(`totalGastos:     ${pyg.totalGastos}`);
  console.log(`utilidadPerdida: ${pyg.utilidadPerdida}`);

  // Detalle
  console.log(`\n--- Detalle (${pyg.detalle.length} cuentas auxiliares) ---`);
  for (const row of pyg.detalle) {
    const flag = row.saldo_anomalo ? ' [ANÓMALO]' : '';
    console.log(`  ${row.codigo} | ${row.nombre} | clase=${row.clase} | D=${row.debito} C=${row.credito} | saldo=${row.saldo}${flag}`);
  }

  // ============================================
  // VERIFICACIONES
  // ============================================
  console.log('\n=== VERIFICACIONES ===');

  // 1. No debe haber filas con codigo o nombre vacíos
  const vacios = pyg.detalle.filter((r) => !r.codigo || !r.nombre);
  console.log(`1. Filas con codigo/nombre vacíos: ${vacios.length} ${vacios.length === 0 ? '✓' : '✗'}`);
  if (vacios.length > 0) {
    for (const v of vacios) console.log(`   - id=${v.cuenta_id} codigo="${v.codigo}" nombre="${v.nombre}"`);
  }

  // 2. No debe haber filas duplicadas (triplicación)
  const codigos = pyg.detalle.map((r) => r.codigo);
  const duplicados = codigos.filter((c, i) => codigos.indexOf(c) !== i);
  console.log(`2. Filas duplicadas: ${duplicados.length} ${duplicados.length === 0 ? '✓' : '✗'}`);
  if (duplicados.length > 0) console.log(`   Duplicados: ${[...new Set(duplicados)].join(', ')}`);

  // 3. Solo cuentas auxiliares (clasificacion=4 ya filtrado en SQL)
  console.log(`3. Total filas: ${pyg.detalle.length} (debe ser <= num auxiliares con movimientos)`);

  // 4. Verificar que los KPIs coinciden con la suma del detalle (solo auxiliares, excluyendo raíces virtuales)
  const auxiliares = pyg.detalle.filter((r) => !r.esVirtual);
  const sumIng = auxiliares.filter((r) => r.clase === '4').reduce((s, r) => s + r.saldo, 0);
  const sumCost = auxiliares.filter((r) => r.clase === '6').reduce((s, r) => s + r.saldo, 0);
  const sumGast = auxiliares.filter((r) => r.clase === '5').reduce((s, r) => s + r.saldo, 0);
  console.log(`4. Suma auxiliares ingresos: ${sumIng.toFixed(2)} vs KPI: ${pyg.totalIngresos.toFixed(2)} ${Math.abs(sumIng - pyg.totalIngresos) < 0.01 ? '✓' : '✗'}`);
  console.log(`   Suma auxiliares costos:   ${sumCost.toFixed(2)} vs KPI: ${pyg.totalCostos.toFixed(2)} ${Math.abs(sumCost - pyg.totalCostos) < 0.01 ? '✓' : '✗'}`);
  console.log(`   Suma auxiliares gastos:   ${sumGast.toFixed(2)} vs KPI: ${pyg.totalGastos.toFixed(2)} ${Math.abs(sumGast - pyg.totalGastos) < 0.01 ? '✓' : '✗'}`);

  // 5. Verificar que los nodos raíz virtuales tienen el saldo consolidado correcto
  const raiz4 = pyg.detalle.find((r) => r.codigo === '4' && r.esVirtual);
  const raiz6 = pyg.detalle.find((r) => r.codigo === '6' && r.esVirtual);
  console.log(`5. Raíz "4 INGRESOS" saldo (${raiz4?.saldo}) = KPI (${pyg.totalIngresos}): ${raiz4 && Math.abs(raiz4.saldo - pyg.totalIngresos) < 0.01 ? '✓' : '✗'}`);
  console.log(`   Raíz "6 COSTOS DE VENTAS" saldo (${raiz6?.saldo}) = KPI (${pyg.totalCostos}): ${raiz6 && Math.abs(raiz6.saldo - pyg.totalCostos) < 0.01 ? '✓' : '✗'}`);

  // 6. Utilidad = Ingresos - Costos - Gastos
  const utilCalc = pyg.totalIngresos - pyg.totalCostos - pyg.totalGastos;
  console.log(`6. Utilidad calculada: ${utilCalc.toFixed(2)} vs KPI: ${pyg.utilidadPerdida.toFixed(2)} ${Math.abs(utilCalc - pyg.utilidadPerdida) < 0.01 ? '✓' : '✗'}`);

  // 7. Verificar que los nodos raíz tienen nivel=1 y esPadre=true
  const raices = pyg.detalle.filter((r) => r.esVirtual);
  const raicesOk = raices.every((r) => r.nivel === 1 && r.esPadre === true);
  console.log(`7. Nodos raíz virtuales con nivel=1 y esPadre=true: ${raicesOk ? '✓' : '✗'} (${raices.length} raíces)`);

  // 8. Ecuación contable: el resultado del P&G debe cuadrar con el balance
  const balanceRes = await fetch(`${BASE}/informes/balance`, { headers: auth });
  const balance = await balanceRes.json();
  const diffBalance = balance.saldo_final;
  console.log(`8. Balance saldo_final (debe ser ~0): ${diffBalance.toFixed(4)} ${Math.abs(diffBalance) < 0.01 ? '✓ CUADRA' : '✗ NO CUADRA'}`);
  console.log(`   Balance resultado_ejercicio (${balance.totales.resultado_ejercicio}) vs P&G utilidadPerdida (${pyg.utilidadPerdida}): ${Math.abs(balance.totales.resultado_ejercicio - pyg.utilidadPerdida) < 0.01 ? '✓' : '✗'}`);
}

main().catch(console.error);
