/**
 * Diagnóstico: por qué el nodo raíz "3" no aparece en el balance.
 */
const BASE = 'http://localhost:3000/api/v1';

async function main() {
  const loginRes = await fetch(`${BASE}/autenticacion/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo_empresa: 'DEMO', email: 'admin@demo.com', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.access_token || loginData.token;
  const auth = { Authorization: `Bearer ${token}` };

  const cuentasRes = await fetch(`${BASE}/cuentas`, { headers: auth });
  const cuentasData = await cuentasRes.json();
  const lista = Array.isArray(cuentasData) ? cuentasData : (cuentasData.data || []);

  // Filtrar cuentas de clase 3
  const clase3 = lista.filter((c) => String(c.clase) === '3');
  console.log(`=== Cuentas de clase 3 (Patrimonio): ${clase3.length} ===`);
  for (const c of clase3) {
    console.log(`  id=${c.id} codigo=${c.codigo} padre=${c.cuenta_padre_id ?? 'null'} nombre=${c.nombre}`);
  }

  // Verificar si hay nodo raíz "3"
  const raiz3 = clase3.find((c) => c.codigo === '3' && !c.cuenta_padre_id);
  console.log(`\nNodo raíz "3" con cuenta_padre_id=null: ${raiz3 ? `SÍ (id=${raiz3.id})` : 'NO'}`);

  // Cuentas de clase 3 sin padre
  const sinPadre = clase3.filter((c) => !c.cuenta_padre_id);
  console.log(`Cuentas de clase 3 sin padre: ${sinPadre.length}`);
  for (const c of sinPadre) {
    console.log(`  id=${c.id} codigo=${c.codigo} nombre=${c.nombre}`);
  }

  // Cuentas de clase 3 con padre
  const conPadre = clase3.filter((c) => c.cuenta_padre_id);
  console.log(`Cuentas de clase 3 con padre: ${conPadre.length}`);
  for (const c of conPadre) {
    const padre = lista.find((p) => p.id === c.cuenta_padre_id);
    console.log(`  id=${c.id} codigo=${c.codigo} padre_id=${c.cuenta_padre_id} padre_codigo=${padre?.codigo ?? '??'} nombre=${c.nombre}`);
  }

  // Ahora mirar el balance
  const balRes = await fetch(`${BASE}/informes/balance`, { headers: auth });
  const balance = await balRes.json();
  const balData = balance.data || [];

  // Buscar todas las cuentas de clase 3 en el balance
  const balClase3 = balData.filter((d) => String(d.clase) === '3');
  console.log(`\n=== Cuentas de clase 3 en el balance: ${balClase3.length} ===`);
  for (const d of balClase3) {
    console.log(`  codigo=${d.codigo} nivel=${d.nivel} saldo=${d.saldo} debito=${d.debito} credito=${d.credito} esVirtual=${d.esVirtual} esPadre=${d.esPadre}`);
  }

  // Buscar nodo "3"
  const nodo3 = balData.find((d) => d.codigo === '3');
  console.log(`\nNodo "3" en balance: ${nodo3 ? `SÍ (saldo=${nodo3.saldo}, esVirtual=${nodo3.esVirtual})` : 'NO'}`);
}

main().catch(console.error);
