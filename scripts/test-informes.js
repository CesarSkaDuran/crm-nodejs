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

  // Cargar cuentas
  const cuentasRes = await fetch(`${BASE}/cuentas?limit=600`, { headers: auth });
  const cuentasBody = await cuentasRes.json();
  const cuentas = Array.isArray(cuentasBody) ? cuentasBody : (cuentasBody.data || []);

  // ============================================
  // 1. LIBRO AUXILIAR - 1.1 Disponible (resumido)
  // ============================================
  const cuentaDisponible = cuentas.find((c) => c.codigo === '1.1');
  console.log('=== LIBRO AUXILIAR 1.1 - Disponible (resumido) ===');
  const libroRes = await fetch(`${BASE}/informes/libro?cuenta_id=${cuentaDisponible.id}&modo=resumido`, { headers: auth });
  const libro = await libroRes.json();
  console.log(`Total débito: ${libro.total_debito}`);
  console.log(`Total crédito: ${libro.total_credito}`);
  console.log(`Saldo final: ${libro.saldo_final}`);
  console.log('Detalle:');
  for (const row of libro.data) {
    const flag = row.saldo_anomalo ? ' [ANÓMALO]' : '';
    const padre = row.esPadre ? ' [PADRE]' : ' [AUX]';
    console.log(`  ${row.cuenta.codigo} ${row.cuenta.nombre} (nat=${row.cuenta.naturaleza}): D=${row.debito} C=${row.credito} saldo=${row.saldo} directo=${row.saldoDirecto}${padre}${flag}`);
  }

  // ============================================
  // 2. BALANCE GENERAL
  // ============================================
  console.log('\n=== BALANCE GENERAL ===');
  const balanceRes = await fetch(`${BASE}/informes/balance`, { headers: auth });
  const balance = await balanceRes.json();
  console.log(`Total débito: ${balance.total_debito}`);
  console.log(`Total crédito: ${balance.total_credito}`);
  console.log(`Activo: ${balance.totales.activo}`);
  console.log(`Pasivo: ${balance.totales.pasivo}`);
  console.log(`Patrimonio: ${balance.totales.patrimonio}`);
  console.log(`Pasivo + Patrimonio: ${balance.totales.pasivo_mas_patrimonio}`);
  console.log(`Saldo final (Activo - P+P): ${balance.saldo_final}`);
  console.log(`Cuentas en data: ${balance.data.length}`);
  // Mostrar primeras 10
  for (const row of balance.data.slice(0, 10)) {
    const flag = row.saldo_anomalo ? ' [ANÓMALO]' : '';
    const padre = row.esPadre ? ' [PADRE]' : ' [AUX]';
    console.log(`  ${row.codigo} ${row.nombre} (clase=${row.clase} nat=${row.naturaleza}): D=${row.debito} C=${row.credito} saldo=${row.saldo}${padre}${flag}`);
  }

  // ============================================
  // 3. ESTADO DE RESULTADOS (P&G)
  // ============================================
  console.log('\n=== ESTADO DE RESULTADOS (P&G) ===');
  const pygRes = await fetch(`${BASE}/informes/pyg`, { headers: auth });
  const pyg = await pygRes.json();
  console.log(`Total débito: ${pyg.total_debito}`);
  console.log(`Total crédito: ${pyg.total_credito}`);
  console.log(`Ingresos: ${pyg.totales.ingresos}`);
  console.log(`Gastos: ${pyg.totales.gastos}`);
  console.log(`Utilidad: ${pyg.totales.utilidad}`);
  console.log(`Cuentas en data: ${pyg.data.length}`);
  for (const row of pyg.data.slice(0, 10)) {
    const flag = row.saldo_anomalo ? ' [ANÓMALO]' : '';
    const padre = row.esPadre ? ' [PADRE]' : ' [AUX]';
    console.log(`  ${row.codigo} ${row.nombre} (clase=${row.clase} nat=${row.naturaleza}): D=${row.debito} C=${row.credito} saldo=${row.saldo}${padre}${flag}`);
  }

  // ============================================
  // 4. VERIFICACIÓN DE CONSISTENCIA
  // ============================================
  console.log('\n=== VERIFICACIÓN DE CONSISTENCIA ===');
  // Balance: Activo debe = Pasivo + Patrimonio (si la contabilidad está cuadrada)
  const diffBalance = Math.abs(balance.totales.activo - balance.totales.pasivo_mas_patrimonio);
  console.log(`Balance: |Activo - (Pasivo+Patrimonio)| = ${diffBalance.toFixed(2)} ${diffBalance < 0.01 ? '✓ CUADRA' : '✗ NO CUADRA'}`);

  // Libro: saldo_final debe = total_debito - total_credito (para naturaleza D)
  const diffLibro = Math.abs(libro.saldo_final - (libro.total_debito - libro.total_credito));
  console.log(`Libro 1.1: |saldo_final - (D-C)| = ${diffLibro.toFixed(2)} ${diffLibro < 0.01 ? '✓ COINCIDE' : '✗ NO COINCIDE'}`);
}

main().catch(console.error);
