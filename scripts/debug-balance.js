const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: 'crm_db',
  });

  // Cuentas raíz de clase 2 (sin cuenta_padre_id)
  const [raices2] = await conn.query(`
    SELECT id, codigo, nombre, clasificacion, cuenta_padre_id
    FROM plan_cuentas
    WHERE clase = '2' AND cuenta_padre_id IS NULL
    ORDER BY codigo
  `);
  console.log('=== Cuentas raíz de clase 2 (sin padre) ===');
  for (const r of raices2) {
    console.log(`  ${r.codigo} (id=${r.id}) ${r.nombre} clasif=${r.clasificacion}`);
  }

  // Para cada raíz, calcular saldo consolidado recursivamente
  console.log('\n=== Saldos consolidados por raíz de clase 2 ===');
  for (const raiz of raices2) {
    const saldo = await calcularConsolidado(conn, raiz.id, new Set());
    console.log(`  ${raiz.codigo} (id=${raiz.id}): saldo consolidado = ${saldo.toFixed(2)}`);
  }

  // Suma de saldos directos de auxiliares de clase 2
  const [aux2] = await conn.query(`
    SELECT CAST(SUM(c.debito - c.credito) AS DECIMAL(15,2)) as saldo
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    WHERE p.clase = '2' AND p.clasificacion = 4
  `);
  console.log(`\nSuma real de auxiliares clase 2: ${aux2[0].saldo}`);
  console.log(`Pasivo real (naturaleza C): ${(-Number(aux2[0].saldo)).toFixed(2)}`);

  // Buscar cuentas de clase 2 que NO son hijas de "2." o "2"
  const [huerfanas2] = await conn.query(`
    SELECT id, codigo, nombre, cuenta_padre_id
    FROM plan_cuentas
    WHERE clase = '2' AND cuenta_padre_id IS NULL AND codigo NOT IN ('2', '2.')
    ORDER BY codigo
  `);
  console.log(`\n=== Cuentas raíz huérfanas de clase 2 (no son 2 ni 2.) ===`);
  for (const h of huerfanas2) {
    // Saldo directo
    const [s] = await conn.query('SELECT CAST(SUM(debito - credito) AS DECIMAL(15,2)) as saldo FROM contabilidad WHERE cuenta_contable_id = ?', [h.id]);
    // Saldo consolidado
    const sc = await calcularConsolidado(conn, h.id, new Set());
    console.log(`  ${h.codigo} (id=${h.id}) ${h.nombre}: directo=${s[0].saldo} consolidado=${sc.toFixed(2)}`);
  }

  await conn.end();
}

async function calcularConsolidado(conn, id, visitados) {
  if (visitados.has(id)) return 0;
  visitados.add(id);
  const [c] = await conn.query('SELECT naturaleza, clasificacion FROM plan_cuentas WHERE id = ?', [id]);
  if (c.length === 0) return 0;
  const [movs] = await conn.query('SELECT CAST(SUM(debito) AS DECIMAL(15,2)) as d, CAST(SUM(credito) AS DECIMAL(15,2)) as c FROM contabilidad WHERE cuenta_contable_id = ?', [id]);
  const d = Number(movs[0].d || 0);
  const cr = Number(movs[0].c || 0);
  const saldoDirecto = c[0].naturaleza === 'C' ? cr - d : d - cr;
  const [hijas] = await conn.query('SELECT id FROM plan_cuentas WHERE cuenta_padre_id = ?', [id]);
  let saldoHijos = 0;
  for (const h of hijas) {
    saldoHijos += await calcularConsolidado(conn, h.id, visitados);
  }
  return saldoDirecto + saldoHijos;
}

main().catch(console.error);
