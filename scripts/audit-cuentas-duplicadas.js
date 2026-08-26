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

  // 1. Cargar todas las cuentas
  const cuentasRes = await fetch(`${BASE}/cuentas?limit=600`, { headers: auth });
  const cuentasBody = await cuentasRes.json();
  const cuentas = Array.isArray(cuentasBody) ? cuentasBody : (cuentasBody.data || []);

  console.log(`=== Total cuentas: ${cuentas.length} ===\n`);

  // 2. Detectar códigos duplicados (con/sin puntos)
  console.log('=== 1. CUENTAS CON CÓDIGO DUPLICADO (con/sin puntos) ===');
  const porNorm = new Map();
  for (const c of cuentas) {
    const norm = (c.codigo || '').replace(/\./g, '');
    if (!porNorm.has(norm)) porNorm.set(norm, []);
    porNorm.get(norm).push(c);
  }
  let duplicadas = 0;
  for (const [norm, arr] of porNorm) {
    if (arr.length > 1) {
      duplicadas++;
      console.log(`  ${norm}: ${arr.map((c) => `${c.codigo}(id=${c.id}, clasif=${c.clasificacion}, padre=${c.cuenta_padre_id ?? 'null'})`).join(' | ')}`);
    }
  }
  if (duplicadas === 0) console.log('  Ninguna');

  // 3. Detectar movimientos en cuentas NO auxiliares (clasificacion != 4)
  console.log('\n=== 2. MOVIMIENTOS EN CUENTAS NO AUXILIARES (padre) ===');
  const noAuxiliares = cuentas.filter((c) => Number(c.clasificacion) !== 4);
  const noAuxIds = noAuxiliares.map((c) => c.id);

  // Obtener movimientos vía informes (no hay endpoint directo, usamos SQL via balance)
  // En su lugar, consultamos el libro mayor por cada cuenta no auxiliar
  let totalMovsNoAux = 0;
  for (const c of noAuxiliares) {
    const res = await fetch(`${BASE}/informes/libro?cuenta_id=${c.id}&modo=resumido`, { headers: auth });
    const data = await res.json();
    if (data.total_debito > 0 || data.total_credito > 0) {
      totalMovsNoAux++;
      console.log(`  ${c.codigo} ${c.nombre} (clasif=${c.clasificacion}): D=${data.total_debito} C=${data.total_credito}`);
    }
  }
  if (totalMovsNoAux === 0) console.log('  Ninguno');

  // 4. Detectar cuentas sin cuenta_padre_id pero que deberían tenerlo
  console.log('\n=== 3. CUENTAS HIJAS SIN cuenta_padre_id ===');
  const sinPadre = cuentas.filter((c) => !c.cuenta_padre_id && (c.codigo || '').includes('.'));
  let count = 0;
  for (const c of sinPadre) {
    // Verificar si existe una cuenta padre potencial
    const partes = (c.codigo || '').split('.');
    if (partes.length > 1) {
      const codigoPadre = partes.slice(0, -1).join('.');
      const padre = cuentas.find((p) => p.codigo === codigoPadre);
      if (padre) {
        count++;
        console.log(`  ${c.codigo} (id=${c.id}) -> padre debería ser ${codigoPadre} (id=${padre.id})`);
      }
    }
  }
  if (count === 0) console.log('  Ninguna (todas las hijas tienen padre asignado)');

  // 5. Resumen
  console.log('\n=== RESUMEN ===');
  console.log(`Cuentas duplicadas por código normalizado: ${duplicadas}`);
  console.log(`Cuentas no auxiliares con movimientos: ${totalMovsNoAux}`);
  console.log(`Cuentas hijas sin cuenta_padre_id: ${count}`);
}

main().catch(console.error);
