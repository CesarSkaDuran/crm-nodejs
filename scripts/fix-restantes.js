const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: 'crm_db',
  });

  // 1. Las 40 cuentas con punto final (3., 4., etc.) son raíces de clase
  // No necesitan cuenta_padre_id - están bien como están
  console.log('=== 1. Cuentas raíz con punto final (3., 4., etc.) ===');
  const [raices] = await conn.query(`
    SELECT id, codigo FROM plan_cuentas
    WHERE cuenta_padre_id IS NULL AND codigo LIKE '%.'
  `);
  console.log(`  ${raices.length} cuentas son raíces de clase (correcto, no necesitan padre)\n`);

  // 2. Reasignar los 7 movimientos restantes
  console.log('=== 2. Reasignando movimientos restantes ===');

  // 2.2.10 DEL EXTERIOR (clasif=3, 2 movs) -> crear auxiliar o mover a 2.2.05.05
  // Verificar si tiene hijas
  const [hijas2210] = await conn.query('SELECT id, codigo, nombre FROM plan_cuentas WHERE cuenta_padre_id = 143');
  console.log(`  2.2.10 hijas: ${hijas2210.length}`);
  if (hijas2210.length === 0) {
    // No tiene hijas, convertir esta cuenta en auxiliar (clasificacion=4)
    await conn.query('UPDATE plan_cuentas SET clasificacion = 4 WHERE id = 143');
    console.log('  2.2.10 convertida a auxiliar (clasificacion=4)');
  }

  // 2215 Cuentas por pagar proveedores (clasif=1, 2 movs) -> cuenta huérfana
  // Reasignar a 2.2.05.05 (proveedor existente) o eliminar
  const [cuenta2215] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = "2215"');
  if (cuenta2215.length > 0) {
    const id2215 = cuenta2215[0].id;
    // Buscar auxiliar 2.2.05.05
    const [aux2205] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = "2.2.05.05" LIMIT 1');
    if (aux2205.length > 0) {
      await conn.query('UPDATE contabilidad SET cuenta_contable_id = ? WHERE cuenta_contable_id = ?', [aux2205[0].id, id2215]);
      console.log(`  2215: 2 movimientos reasignados a 2.2.05.05`);
      await conn.query('DELETE FROM plan_cuentas WHERE id = ?', [id2215]);
      console.log(`  2215 eliminada`);
    }
  }

  // 61xx Gastos de prueba (clasif=1, 3 movs) -> cuenta de prueba, reasignar a 6.1.35.20
  const [cuenta61xx] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = "61xx"');
  if (cuenta61xx.length > 0) {
    const id61xx = cuenta61xx[0].id;
    // Buscar auxiliar 6.1.35.20 (costo de ventas)
    const [aux6135] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = "6.1.35.20" LIMIT 1');
    if (aux6135.length > 0) {
      await conn.query('UPDATE contabilidad SET cuenta_contable_id = ? WHERE cuenta_contable_id = ?', [aux6135[0].id, id61xx]);
      console.log(`  61xx: 3 movimientos reasignados a 6.1.35.20`);
      await conn.query('DELETE FROM plan_cuentas WHERE id = ?', [id61xx]);
      console.log(`  61xx eliminada`);
    }
  }

  // 3. Verificación final
  console.log('\n=== 3. Verificación final ===');
  const [movsPadre] = await conn.query(`
    SELECT p.codigo, p.nombre, p.clasificacion, COUNT(*) as count
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    WHERE p.clasificacion != 4
    GROUP BY p.id
  `);
  console.log(`  Movimientos en cuentas no auxiliares: ${movs.length}`);
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
  console.log('\n=== Completado ===');
}

main().catch(console.error);
