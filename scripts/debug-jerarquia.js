const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: 'crm_db',
  });

  // Cargar toda la jerarquía de clase 2
  const [cuentas] = await conn.query(`
    SELECT id, codigo, nombre, clasificacion, cuenta_padre_id, naturaleza
    FROM plan_cuentas WHERE clase = '2' ORDER BY codigo
  `);

  // Construir mapa de hijos por padre
  const hijosPorPadre = new Map();
  for (const c of cuentas) {
    if (c.cuenta_padre_id) {
      const arr = hijosPorPadre.get(c.cuenta_padre_id) || [];
      arr.push(c);
      hijosPorPadre.set(c.cuenta_padre_id, arr);
    }
  }

  // Imprimir jerarquía
  function printJerarquia(id, nivel = 0) {
    const cuenta = cuentas.find((c) => c.id === id);
    if (!cuenta) return;
    const indent = '  '.repeat(nivel);
    const [movs] = await_sync(cuenta.id);
    const d = Number(movs.d || 0), cr = Number(movs.c || 0);
    const saldo = cuenta.naturaleza === 'C' ? cr - d : d - cr;
    const flag = Number(cuenta.clasificacion) !== 4 ? ' [PADRE]' : ' [AUX]';
    console.log(`${indent}${cuenta.codigo} (id=${cuenta.id}) clasif=${cuenta.clasificacion} padre=${cuenta.cuenta_padre_id}: D=${d} C=${cr} saldo=${saldo}${flag}`);
    const hijos = hijosPorPadre.get(id) || [];
    for (const h of hijos) {
      printJerarquia(h.id, nivel + 1);
    }
  }

  // Función sincrónica para obtener movimientos (cache)
  const cache = new Map();
  function await_sync(id) {
    if (cache.has(id)) return cache.get(id);
    // Como no podemos hacer async aquí, devolvemos ceros
    return { d: 0, c: 0 };
  }

  // Mejor: cargar todos los movimientos de clase 2 de una vez
  const [movs] = await conn.query(`
    SELECT cuenta_contable_id, CAST(SUM(debito) AS DECIMAL(15,2)) as d, CAST(SUM(credito) AS DECIMAL(15,2)) as c
    FROM contabilidad
    WHERE cuenta_contable_id IN (SELECT id FROM plan_cuentas WHERE clase = '2')
    GROUP BY cuenta_contable_id
  `);
  const movsMap = new Map();
  for (const m of movs) movsMap.set(m.cuenta_contable_id, { d: Number(m.d), c: Number(m.c) });

  // Función recursiva para imprimir
  function printJerarquiaSync(id, nivel = 0) {
    const cuenta = cuentas.find((c) => c.id === id);
    if (!cuenta) return;
    const indent = '  '.repeat(nivel);
    const m = movsMap.get(id) || { d: 0, c: 0 };
    const d = Number(m.d), cr = Number(m.c);
    const saldo = cuenta.naturaleza === 'C' ? cr - d : d - cr;
    const flag = Number(cuenta.clasificacion) !== 4 ? ' [PADRE]' : ' [AUX]';
    console.log(`${indent}${cuenta.codigo} (id=${cuenta.id}) clasif=${cuenta.clasificacion} padre=${cuenta.cuenta_padre_id}: D=${d} C=${cr} saldo=${saldo}${flag}`);
    const hijos = hijosPorPadre.get(id) || [];
    for (const h of hijos) {
      printJerarquiaSync(h.id, nivel + 1);
    }
  }

  // Encontrar raíces (sin padre)
  const raices = cuentas.filter((c) => !c.cuenta_padre_id);
  console.log('=== Jerarquía completa de clase 2 ===');
  for (const r of raices) {
    printJerarquiaSync(r.id);
  }

  // Calcular consolidado recursivamente
  function calcConsolidado(id, visitados) {
    if (visitados.has(id)) return 0;
    visitados.add(id);
    const cuenta = cuentas.find((c) => c.id === id);
    if (!cuenta) return 0;
    const m = movsMap.get(id) || { d: 0, c: 0 };
    const d = Number(m.d), cr = Number(m.c);
    const saldoDirecto = cuenta.naturaleza === 'C' ? cr - d : d - cr;
    let saldoHijos = 0;
    const hijos = hijosPorPadre.get(id) || [];
    for (const h of hijos) {
      saldoHijos += calcConsolidado(h.id, visitados);
    }
    return saldoDirecto + saldoHijos;
  }

  console.log('\n=== Saldos consolidados por raíz ===');
  for (const r of raices) {
    const sc = calcConsolidado(r.id, new Set());
    console.log(`  ${r.codigo} (id=${r.id}): ${sc.toFixed(2)}`);
  }

  // Verificar si hay cuentas con cuenta_padre_id que apuntan a cuentas de OTRA clase
  const [crossClase] = await conn.query(`
    SELECT h.id, h.codigo, h.clase, h.cuenta_padre_id, p.codigo as padre_codigo, p.clase as padre_clase
    FROM plan_cuentas h
    INNER JOIN plan_cuentas p ON p.id = h.cuenta_padre_id
    WHERE h.clase != p.clase
  `);
  console.log(`\n=== Cuentas con padre de otra clase: ${crossClase.length} ===`);
  for (const c of crossClase.slice(0, 20)) {
    console.log(`  ${c.codigo} (clase=${c.clase}) -> padre ${c.padre_codigo} (clase=${c.padre_clase})`);
  }

  await conn.end();
}

main().catch(console.error);
