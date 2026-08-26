/**
 * Corrige la estructura del plan de cuentas y los movimientos contables:
 *
 * 1. Asigna cuenta_padre_id a todas las cuentas hijas basándose en el código
 * 2. Reasigna movimientos de cuentas duplicadas (1105->1.1.05.05, 2205->2.2.05, 2210->2.2.10)
 * 3. Reasigna movimientos de cuentas padre (no auxiliares) a su auxiliar más cercano
 * 4. Elimina las cuentas duplicadas huérfanas
 *
 * Uso: node scripts/fix-plan-cuentas.js
 */
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'crm_db',
    multipleStatements: false,
  });

  console.log('=== Conectado a la BD ===\n');

  // ===========================================================================
  // 1. ASIGNAR cuenta_padre_id A TODAS LAS CUENTAS HIJAS
  // ===========================================================================
  console.log('=== 1. Asignando cuenta_padre_id ===');
  const [cuentas] = await conn.query('SELECT id, codigo, nombre, cuenta_padre_id, clasificacion FROM plan_cuentas ORDER BY LENGTH(codigo) ASC');

  let padresAsignados = 0;
  for (const c of cuentas) {
    if (c.cuenta_padre_id) continue; // Ya tiene padre
    const codigo = (c.codigo || '').trim();
    if (!codigo.includes('.')) continue; // Es raíz

    // Buscar código padre: quitar último segmento
    const partes = codigo.split('.');
    const codigoPadre = partes.slice(0, -1).join('.');

    // Buscar la cuenta padre por código
    const [padres] = await conn.query(
      'SELECT id FROM plan_cuentas WHERE codigo = ? AND empresa_id = 1 LIMIT 1',
      [codigoPadre],
    );

    if (padres.length > 0) {
      await conn.query('UPDATE plan_cuentas SET cuenta_padre_id = ? WHERE id = ?', [padres[0].id, c.id]);
      padresAsignados++;
    }
  }
  console.log(`  ${padresAsignados} cuentas con cuenta_padre_id asignado\n`);

  // ===========================================================================
  // 2. REASIGNAR MOVIMIENTOS DE CUENTAS DUPLICADAS
  // ===========================================================================
  console.log('=== 2. Reasignando movimientos de cuentas duplicadas ===');

  // Mapeo: código sin puntos -> cuenta correcta (con puntos)
  // 1105 -> 1.1.05.05 (Caja general)
  // 2205 -> 2.2.05 (Proveedores nacionales)
  // 2210 -> 2.2.10 (Proveedores locales)
  const duplicadas = [
    { codigoMal: '1105', codigoBueno: '1.1.05.05' },
    { codigoMal: '2205', codigoBueno: '2.2.05' },
    { codigoMal: '2210', codigoBueno: '2.2.10' },
  ];

  for (const dup of duplicadas) {
    const [cuentaMala] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = ? LIMIT 1', [dup.codigoMal]);
    const [cuentaBuena] = await conn.query('SELECT id FROM plan_cuentas WHERE codigo = ? LIMIT 1', [dup.codigoBueno]);

    if (cuentaMala.length === 0 || cuentaBuena.length === 0) {
      console.log(`  ${dup.codigoMal} -> ${dup.codigoBueno}: una de las cuentas no existe, saltando`);
      continue;
    }

    const idMalo = cuentaMala[0].id;
    const idBueno = cuentaBuena[0].id;

    // Reasignar movimientos contables
    const [result] = await conn.query('UPDATE contabilidad SET cuenta_contable_id = ? WHERE cuenta_contable_id = ?', [idBueno, idMalo]);
    console.log(`  ${dup.codigoMal} (id=${idMalo}) -> ${dup.codigoBueno} (id=${idBueno}): ${result.affectedRows} movimientos reasignados`);

    // Reasignar referencias en productos
    await conn.query('UPDATE productos SET cuenta_inventarios_id = ? WHERE cuenta_inventarios_id = ?', [idBueno, idMalo]);
    await conn.query('UPDATE productos SET cuenta_costos_id = ? WHERE cuenta_costos_id = ?', [idBueno, idMalo]);
    await conn.query('UPDATE productos SET cuenta_ingresos_id = ? WHERE cuenta_ingresos_id = ?', [idBueno, idMalo]);

    // Reasignar referencias en bancos (cuenta_id puede ser string/double)
    try {
      await conn.query('UPDATE bancos SET cuenta_id = ? WHERE cuenta_id = ?', [String(idBueno), String(idMalo)]);
    } catch (e) {
      console.log(`    (bancos: ${e.message})`);
    }

    // Reasignar referencias en terceros
    await conn.query('UPDATE terceros SET cuenta_contable_id = ? WHERE cuenta_contable_id = ?', [idBueno, idMalo]);

    // Eliminar la cuenta duplicada
    await conn.query('DELETE FROM plan_cuentas WHERE id = ?', [idMalo]);
    console.log(`  Cuenta ${dup.codigoMal} (id=${idMalo}) eliminada`);
  }
  console.log('');

  // ===========================================================================
  // 3. REASIGNAR MOVIMIENTOS DE CUENTAS PADRE A AUXILIARES
  // ===========================================================================
  console.log('=== 3. Reasignando movimientos de cuentas padre a auxiliares ===');

  // Recargar cuentas con cuenta_padre_id ya asignado
  const [cuentasActualizadas] = await conn.query('SELECT id, codigo, nombre, clasificacion, cuenta_padre_id FROM plan_cuentas ORDER BY codigo');

  // Construir jerarquía: para cada cuenta, encontrar sus hijas directas
  const hijasPorPadre = new Map();
  for (const c of cuentasActualizadas) {
    if (c.cuenta_padre_id) {
      const arr = hijasPorPadre.get(c.cuenta_padre_id) || [];
      arr.push(c);
      hijasPorPadre.set(c.cuenta_padre_id, arr);
    }
  }

  // Función recursiva: encontrar la primera cuenta auxiliar (clasificacion=4) descendiente
  function encontrarAuxiliar(cuentaId, visitados = new Set()) {
    if (visitados.has(cuentaId)) return null;
    visitados.add(cuentaId);

    const cuenta = cuentasActualizadas.find((c) => c.id === cuentaId);
    if (!cuenta) return null;

    // Si es auxiliar, retornar
    if (Number(cuenta.clasificacion) === 4) return cuentaId;

    // Buscar hijas
    const hijas = hijasPorPadre.get(cuentaId) || [];
    for (const h of hijas) {
      const aux = encontrarAuxiliar(h.id, visitados);
      if (aux) return aux;
    }
    return null;
  }

  let movsReasignados = 0;
  let cuentasPadreConMovs = 0;

  for (const c of cuentasActualizadas) {
    // Solo procesar cuentas NO auxiliares (clasificacion != 4)
    if (Number(c.clasificacion) === 4) continue;

    // Verificar si tiene movimientos
    const [movs] = await conn.query('SELECT COUNT(*) as count FROM contabilidad WHERE cuenta_contable_id = ?', [c.id]);
    const count = movs[0].count;
    if (count === 0) continue;

    cuentasPadreConMovs++;
    console.log(`  ${c.codigo} ${c.nombre} (clasif=${c.clasificacion}): ${count} movimientos`);

    // Encontrar cuenta auxiliar descendiente
    const auxiliarId = encontrarAuxiliar(c.id);
    if (auxiliarId) {
      const auxiliar = cuentasActualizadas.find((x) => x.id === auxiliarId);
      const [result] = await conn.query('UPDATE contabilidad SET cuenta_contable_id = ? WHERE cuenta_contable_id = ?', [auxiliarId, c.id]);
      console.log(`    -> Reasignados a ${auxiliar.codigo} ${auxiliar.nombre} (id=${auxiliarId})`);
      movsReasignados += result.affectedRows;
    } else {
      console.log(`    -> No se encontró auxiliar descendiente, movimientos conservados`);
    }
  }
  console.log(`\n  Total: ${cuentasPadreConMovs} cuentas padre procesadas, ${movsReasignados} movimientos reasignados\n`);

  // ===========================================================================
  // 4. VERIFICACIÓN FINAL
  // ===========================================================================
  console.log('=== 4. Verificación final ===');

  const [sinPadre] = await conn.query('SELECT COUNT(*) as count FROM plan_cuentas WHERE cuenta_padre_id IS NULL AND codigo LIKE "%.%"');
  console.log(`  Cuentas hijas sin cuenta_padre_id: ${sinPadre[0].count}`);

  const [dups] = await conn.query(`
    SELECT REPLACE(codigo, '.', '') as norm, COUNT(*) as count
    FROM plan_cuentas
    GROUP BY REPLACE(codigo, '.', '')
    HAVING count > 1
  `);
  console.log(`  Códigos duplicados (normalizados): ${dups.length}`);

  const [movsPadre] = await conn.query(`
    SELECT COUNT(*) as count
    FROM contabilidad c
    INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
    WHERE p.clasificacion != 4
  `);
  console.log(`  Movimientos en cuentas no auxiliares: ${movsPadre[0].count}`);

  await conn.end();
  console.log('\n=== Corrección completada ===');
}

main().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
