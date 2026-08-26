const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: 'crm_db',
  });

  // 2215: reasignar terceros que la referencian
  const [cuenta2215] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = "2215"');
  if (cuenta2215.length > 0) {
    const id2215 = cuenta2215[0].id;
    const [aux2205] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = "2.2.05.05" LIMIT 1');
    if (aux2205.length > 0) {
      await conn.query('UPDATE terceros SET cuenta_contable_id = ? WHERE cuenta_contable_id = ?', [aux2205[0].id, id2215]);
      console.log(`  2215: terceros reasignados a 2.2.05.05`);
      await conn.query('DELETE FROM plan_cuentas WHERE id = ?', [id2215]);
      console.log(`  2215 eliminada`);
    }
  }

  // 61xx: reasignar y eliminar
  const [cuenta61xx] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = "61xx"');
  if (cuenta61xx.length > 0) {
    const id61xx = cuenta61xx[0].id;
    const [aux6135] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = "6.1.35.20" LIMIT 1');
    if (aux6135.length > 0) {
      // Reasignar cualquier referencia
      await conn.query('UPDATE terceros SET cuenta_contable_id = NULL WHERE cuenta_contable_id = ?', [id61xx]);
      await conn.query('UPDATE productos SET cuenta_inventarios_id = NULL WHERE cuenta_inventarios_id = ?', [id61xx]);
      await conn.query('UPDATE productos SET cuenta_costos_id = NULL WHERE cuenta_costos_id = ?', [id61xx]);
      await conn.query('UPDATE productos SET cuenta_ingresos_id = NULL WHERE cuenta_ingresos_id = ?', [id61xx]);
      await conn.query('UPDATE contabilidad SET cuenta_contable_id = ? WHERE cuenta_contable_id = ?', [aux6135[0].id, id61xx]);
      console.log(`  61xx: 3 movimientos reasignados a 6.1.35.20`);
      await conn.query('DELETE FROM plan_cuentas WHERE id = ?', [id61xx]);
      console.log(`  61xx eliminada`);
    }
  }

  // Verificación final
  console.log('\n=== Verificación final ===');
  const [movsPadre] = await conn.query(`
    SELECT p.codigo, p.nombre, p.clasificacion, COUNT(*) as count
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    WHERE p.clasificacion != 4
    GROUP BY p.id
  `);
  console.log(`  Movimientos en cuentas no auxiliares: ${movsPadre.length}`);
  for (const m of movsPadre) {
    console.log(`    ${m.codigo} ${m.nombre} (clasif=${m.clasificacion}): ${m.count}`);
  }

  const [dups] = await conn.query(`
    SELECT REPLACE(codigo, '.', '') as norm, COUNT(*) as count
    FROM plan_cuentas GROUP BY REPLACE(codigo, '.', '')
    HAVING count > 1
  `);
  console.log(`  Códigos duplicados: ${dups.length}`);

  await conn.end();
  console.log('=== Completado ===');
}

main().catch(console.error);
