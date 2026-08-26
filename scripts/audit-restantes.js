const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: 'crm_db',
  });

  // 1. Ver las 40 cuentas hijas sin padre
  const [sinPadre] = await conn.query(`
    SELECT id, codigo, nombre, clasificacion
    FROM plan_cuentas
    WHERE cuenta_padre_id IS NULL AND codigo LIKE '%.%'
    ORDER BY codigo
  `);
  console.log(`=== ${sinPadre.length} cuentas hijas sin padre ===`);
  for (const c of sinPadre) {
    const partes = c.codigo.split('.');
    const codigoPadre = partes.slice(0, -1).join('.');
    const [padre] = await conn.query('SELECT id, codigo FROM plan_cuentas WHERE codigo = ? LIMIT 1', [codigoPadre]);
    console.log(`  ${c.codigo} (id=${c.id}) -> padre esperado: ${codigoPadre} ${padre.length ? `(id=${padre[0].id}) ✓` : '✗ NO EXISTE'}`);
  }

  // 2. Los 7 movimientos en cuentas no auxiliares
  const [movs] = await conn.query(`
    SELECT p.id, p.codigo, p.nombre, p.clasificacion, COUNT(*) as count
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    WHERE p.clasificacion != 4
    GROUP BY p.id
  `);
  console.log(`\n=== ${movs.length} cuentas no auxiliares con movimientos ===`);
  for (const m of movs) {
    console.log(`  ${m.codigo} ${m.nombre} (clasif=${m.clasificacion}): ${m.count} movimientos`);
  }

  await conn.end();
}

main().catch(console.error);
