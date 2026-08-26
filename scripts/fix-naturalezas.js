const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: 'crm_db',
  });

  // 1. Verificar naturaleza de cuentas de clase 2 (todas deberían ser C)
  const [clase2] = await conn.query(`
    SELECT id, codigo, nombre, naturaleza, clasificacion
    FROM plan_cuentas WHERE clase = '2' AND naturaleza = 'D'
    ORDER BY codigo
  `);
  console.log(`=== Cuentas de clase 2 (Pasivo) con naturaleza D (deberían ser C): ${clase2.length} ===`);
  for (const c of clase2) {
    console.log(`  ${c.codigo} (id=${c.id}) ${c.nombre}: naturaleza=${c.naturaleza}`);
  }

  // 2. Corregir: todas las cuentas de clase 2 deben tener naturaleza C
  if (clase2.length > 0) {
    const [result] = await conn.query("UPDATE plan_cuentas SET naturaleza = 'C' WHERE clase = '2' AND naturaleza = 'D'");
    console.log(`\n  ${result.affectedRows} cuentas corregidas a naturaleza C`);
  }

  // 3. Verificar otras clases
  // Clase 1 (Activo) -> D, Clase 2 (Pasivo) -> C, Clase 3 (Patrimonio) -> C
  // Clase 4 (Ingresos) -> C, Clase 5 (Gastos) -> D, Clase 6 (Costos) -> D
  const expectedNat = { '1': 'D', '2': 'C', '3': 'C', '4': 'C', '5': 'D', '6': 'D', '7': 'D', '8': 'D', '9': 'D' };

  for (const [clase, nat] of Object.entries(expectedNat)) {
    const [wrong] = await conn.query(
      'SELECT COUNT(*) as count FROM plan_cuentas WHERE clase = ? AND naturaleza != ?',
      [clase, nat],
    );
    if (wrong[0].count > 0) {
      console.log(`  Clase ${clase}: ${wrong[0].count} cuentas con naturaleza incorrecta (deberían ser ${nat})`);
    }
  }

  // 4. Corregir todas las naturalezas según la clase
  console.log('\n=== Corrigiendo naturalezas por clase ===');
  for (const [clase, nat] of Object.entries(expectedNat)) {
    const [result] = await conn.query(
      'UPDATE plan_cuentas SET naturaleza = ? WHERE clase = ?',
      [nat, clase],
    );
    if (result.affectedRows > 0) {
      console.log(`  Clase ${clase}: ${result.affectedRows} cuentas actualizadas a naturaleza ${nat}`);
    }
  }

  // 5. Verificación final
  console.log('\n=== Verificación final ===');
  const [verify] = await conn.query(`
    SELECT clase, naturaleza, COUNT(*) as count
    FROM plan_cuentas
    GROUP BY clase, naturaleza
    ORDER BY clase
  `);
  for (const v of verify) {
    const expected = expectedNat[v.clase] || '?';
    const ok = v.naturaleza === expected ? '✓' : '✗';
    console.log(`  Clase ${v.clase} nat=${v.naturaleza}: ${v.count} cuentas ${ok}`);
  }

  await conn.end();
  console.log('\n=== Completado ===');
}

main().catch(console.error);
