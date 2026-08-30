const BASE = 'http://localhost:3000/api/v1';

async function main() {
  // Login
  const loginResp = await fetch(`${BASE}/autenticacion/iniciar-sesion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo_empresa: 'DEMO', email: 'admin@demo.com', password: 'admin123' }),
  });
  const { access_token } = await loginResp.json();
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` };
  console.log('Token OK');

  async function crearCat(nombre, descripcion, padreId) {
    const body = { nombre, descripcion, tipo: 1 };
    if (padreId) body.padre_id = padreId;
    const r = await fetch(`${BASE}/categorias`, { method: 'POST', headers: h, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) { console.error(`Error creando "${nombre}":`, data.message); return null; }
    console.log(`✓ ${nombre} (ID: ${data.id})`);
    return data;
  }

  // Categorías mayores (raíz)
  const electronicos = await crearCat('Electrónicos', 'Productos electrónicos');
  const hogar = await crearCat('Hogar y Oficina', 'Artículos para el hogar y oficina');

  // Subcategorías (hijas)
  const computadores = await crearCat('Computadores', 'Desktop y portátiles', electronicos?.id);
  const celulares = await crearCat('Celulares', 'Teléfonos móviles', electronicos?.id);
  const muebles = await crearCat('Muebles', 'Muebles y mobiliario', hogar?.id);

  // Hojas (nietas - categorías hoja donde se enlazan productos)
  await crearCat('Portátiles', 'Computadores portátiles', computadores?.id);
  await crearCat('All-in-One', 'Computadores todo en uno', computadores?.id);
  await crearCat('Smartphones', 'Teléfonos inteligentes', celulares?.id);
  await crearCat('Escritorios', 'Escritorios de oficina', muebles?.id);
  await crearCat('Sillas', 'Sillas de oficina', muebles?.id);

  // Verificar árbol
  console.log('\n=== ÁRBOL DE CATEGORÍAS ===');
  const treeResp = await fetch(`${BASE}/categorias/tree`, { headers: h });
  const tree = await treeResp.json();

  function printTree(nodes, indent = '') {
    for (const n of nodes) {
      const hoja = (!n.hijos || n.hijos.length === 0) ? ' [HOJA]' : '';
      const prods = n.total_productos_acum !== undefined ? ` (${n.total_productos_acum} prod)` : '';
      console.log(`${indent}- ${n.nombre}${hoja}${prods}`);
      if (n.hijos && n.hijos.length > 0) {
        printTree(n.hijos, indent + '  ');
      }
    }
  }
  printTree(tree);
}

main().catch(console.error);
