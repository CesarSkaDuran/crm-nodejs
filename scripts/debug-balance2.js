const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: 'crm_db',
  });

  // Buscar movimientos en cuentas no auxiliares de clase 2
  const [movsNoAux] = await conn.query(`
    SELECT p.id, p.codigo, p.nombre, p.clasificacion,
      CAST(SUM(c.debito) AS DECIMAL(15,2)) as d,
      CAST(SUM(c.credito) AS DECIMAL(15,2)) as cr
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    WHERE p.clase = '2' AND p.clasificacion != 4
    GROUP BY p.id
    ORDER BY p.codigo
  `);
  console.log('=== Movimientos en cuentas NO auxiliares de clase 2 ===');
  let totalD = 0, totalC = 0;
  for (const m of movsNoAux) {
    console.log(`  ${m.codigo} (id=${m.id}) clasif=${m.clasificacion}: D=${m.d} C=${m.cr}`);
    totalD += Number(m.d);
    totalC += Number(m.cr);
  }
  console.log(`Total: D=${totalD} C=${totalC} saldo=${totalC - totalD}`);

  // Verificar TODAS las cuentas de clase 2 con movimientos
  const [todosMovs] = await conn.query(`
    SELECT p.id, p.codigo, p.nombre, p.clasificacion, p.cuenta_padre_id,
      CAST(SUM(c.debito) AS DECIMAL(15,2)) as d,
      CAST(SUM(c.credito) AS DECIMAL(15,2)) as cr
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    WHERE p.clase = '2'
    GROUP BY p.id
    ORDER BY p.codigo
  `);
  console.log('\n=== TODAS las cuentas de clase 2 con movimientos ===');
  for (const m of todosMovs) {
    const flag = Number(m.clasificacion) !== 4 ? ' [NO AUX]' : '';
    console.log(`  ${m.codigo} (id=${m.id}) clasif=${m.clasificacion} padre=${m.cuenta_padre_id}: D=${m.d} C=${m.cr}${flag}`);
  }

  await conn.end();
}

main().catch(console.error);
