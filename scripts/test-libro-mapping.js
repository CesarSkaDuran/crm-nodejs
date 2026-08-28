/**
 * Valida los fixes 1 y 2: mapeo de cuenta y aplanado de tercero en libro auxiliar detallado.
 */
const BASE = 'http://localhost:3000/api/v1';

async function main() {
  // Login
  const loginRes = await fetch(`${BASE}/autenticacion/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo_empresa: 'DEMO', email: 'admin@demo.com', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  const access_token = loginData.access_token || loginData.token;
  const auth = { Authorization: `Bearer ${access_token}` };
  console.log('=== Login OK ===\n');

  // Obtener cuentas para buscar una con movimientos
  const cuentasRes = await fetch(`${BASE}/cuentas`, { headers: auth });
  const cuentas = await cuentasRes.json();
  const lista = cuentas.data ?? cuentas ?? [];

  // Buscar cuenta auxiliar de caja (1.1.05.05) o similar
  const cuentaAux = lista.find((c) => c.codigo === '1.1.05.05') ||
    lista.find((c) => c.clasificacion === 4) ||
    lista[0];

  if (!cuentaAux) {
    console.log('No hay cuentas disponibles');
    return;
  }
  console.log(`Cuenta seleccionada: ${cuentaAux.codigo} - ${cuentaAux.nombre}\n`);

  // Generar libro auxiliar detallado
  const libroRes = await fetch(
    `${BASE}/informes/libro?cuenta_id=${cuentaAux.id}&modo=detallado`,
    { headers: auth },
  );
  const libro = await libroRes.json();

  console.log(`=== LIBRO AUXILIAR DETALLADO ===`);
  console.log(`Filas: ${libro.data?.length ?? 0}\n`);

  if (!libro.data || libro.data.length === 0) {
    console.log('Sin movimientos para validar. Intentando con cuenta raíz 1.1.05...');
    const cuentaRaiz = lista.find((c) => c.codigo === '1.1.05');
    if (cuentaRaiz) {
      const res2 = await fetch(
        `${BASE}/informes/libro?cuenta_id=${cuentaRaiz.id}&modo=detallado`,
        { headers: auth },
      );
      const libro2 = await res2.json();
      console.log(`Filas con cuenta raíz 1.1.05: ${libro2.data?.length ?? 0}\n`);
      validar(libro2.data ?? []);
    }
    return;
  }

  validar(libro.data);
}

function validar(data) {
  // Fix 1: Verificar que cuenta NO sea null y tenga codigo/nombre
  let cuentaOk = 0;
  let cuentaNull = 0;
  let cuentaVacia = 0;
  for (const row of data) {
    if (row.cuenta === null || row.cuenta === undefined) {
      cuentaNull++;
    } else if (!row.cuenta.codigo && !row.cuenta.nombre) {
      cuentaVacia++;
    } else {
      cuentaOk++;
    }
  }
  console.log(`--- Fix 1: Mapeo de columna Cuenta ---`);
  console.log(`  Filas con cuenta OK (codigo+nombre): ${cuentaOk}`);
  console.log(`  Filas con cuenta null: ${cuentaNull}`);
  console.log(`  Filas con cuenta vacia: ${cuentaVacia}`);
  console.log(`  ${cuentaOk === data.length ? '✓ PASS' : '✗ FAIL'}\n`);

  // Fix 2: Verificar que tercero sea string, no objeto
  let terceroString = 0;
  let terceroObjeto = 0;
  let terceroNull = 0;
  for (const row of data) {
    if (row.tercero === null || row.tercero === undefined || row.tercero === '') {
      terceroNull++;
    } else if (typeof row.tercero === 'object') {
      terceroObjeto++;
    } else if (typeof row.tercero === 'string') {
      terceroString++;
    }
  }
  console.log(`--- Fix 2: Aplanado de columna Tercero ---`);
  console.log(`  Filas con tercero string: ${terceroString}`);
  console.log(`  Filas con tercero objeto (JSON crudo): ${terceroObjeto}`);
  console.log(`  Filas sin tercero: ${terceroNull}`);
  console.log(`  ${terceroObjeto === 0 ? '✓ PASS' : '✗ FAIL'}\n`);

  // Mostrar muestra de las primeras 5 filas
  console.log(`--- Muestra (primeras 5 filas) ---`);
  for (const row of data.slice(0, 5)) {
    const cuenta = row.cuenta ? `${row.cuenta.codigo} - ${row.cuenta.nombre}` : 'NULL';
    const tercero = typeof row.tercero === 'string' ? row.tercero : JSON.stringify(row.tercero);
    console.log(`  ${row.fecha} | ${row.consecutivo} | ${cuenta} | ${tercero} | D=${row.debito} C=${row.credito} | Saldo=${row.saldo}`);
  }
}

main().catch(console.error);
