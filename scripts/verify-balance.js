const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: 'crm_db',
  });

  // 1. Verificar si la contabilidad está cuadrada (D=C global)
  const [totales] = await conn.query(`
    SELECT CAST(SUM(debito) AS DECIMAL(15,2)) as total_d, CAST(SUM(credito) AS DECIMAL(15,2)) as total_c
    FROM contabilidad
  `);
  console.log('=== Contabilidad global ===');
  console.log(`Total débito: ${totales[0].total_d}`);
  console.log(`Total crédito: ${totales[0].total_c}`);
  console.log(`Diferencia: ${(Number(totales[0].total_d) - Number(totales[0].total_c)).toFixed(2)}`);

  // 2. Totales por clase
  const [porClase] = await conn.query(`
    SELECT p.clase,
      CAST(SUM(c.debito) AS DECIMAL(15,2)) as debito,
      CAST(SUM(c.credito) AS DECIMAL(15,2)) as credito,
      p.naturaleza
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    GROUP BY p.clase
    ORDER BY p.clase
  `);
  console.log('\n=== Totales por clase ===');
  for (const r of porClase) {
    const saldo = r.naturaleza === 'C' ? Number(r.credito) - Number(r.debito) : Number(r.debito) - Number(r.credito);
    console.log(`  Clase ${r.clase}: D=${r.debito} C=${r.credito} saldo=${saldo.toFixed(2)}`);
  }

  // 3. Saldos por clase (consolidado)
  const [saldosClase] = await conn.query(`
    SELECT p.clase,
      CAST(SUM(c.debito - c.credito) AS DECIMAL(15,2)) as saldo_neto
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    WHERE p.clasificacion = 4
    GROUP BY p.clase
    ORDER BY p.clase
  `);
  console.log('\n=== Saldos netos por clase (solo auxiliares) ===');
  for (const r of saldosClase) {
    console.log(`  Clase ${r.clase}: ${r.saldo_neto}`);
  }

  // 4. Calcular balance teórico
  let activo = 0, pasivo = 0, patrimonio = 0, ingresos = 0, gastos = 0, costos = 0;
  for (const r of saldosClase) {
    const s = Number(r.saldo_neto);
    if (r.clase === '1') activo = s;
    else if (r.clase === '2') pasivo = -s; // naturaleza C, saldo = C-D, pero neto es D-C
    else if (r.clase === '3') patrimonio = -s;
    else if (r.clase === '4') ingresos = -s;
    else if (r.clase === '5') gastos = s;
    else if (r.clase === '6') costos = s;
  }
  const utilidad = ingresos - gastos - costos;
  console.log('\n=== Balance teórico ===');
  console.log(`Activo: ${activo.toFixed(2)}`);
  console.log(`Pasivo: ${pasivo.toFixed(2)}`);
  console.log(`Patrimonio: ${patrimonio.toFixed(2)}`);
  console.log(`Ingresos: ${ingresos.toFixed(2)}`);
  console.log(`Gastos: ${gastos.toFixed(2)}`);
  console.log(`Costos: ${costos.toFixed(2)}`);
  console.log(`Utilidad (Ing - Gast - Cost): ${utilidad.toFixed(2)}`);
  console.log(`Activo - Pasivo - Patrimonio: ${(activo - pasivo - patrimonio).toFixed(2)}`);
  console.log(`¿Cuadra? ${Math.abs(activo - pasivo - patrimonio - utilidad) < 0.01 ? 'SÍ ✓' : 'NO ✗'}`);

  await conn.end();
}

main().catch(console.error);
