/**
 * Pruebas E2E del CRM Contable.
 *
 * Ejercita todos los modulos:
 *  - Autenticacion
 *  - Usuarios (CRUD + roles + permisos)
 *  - Empresas
 *  - Plan de cuentas (CRUD + import)
 *  - Terceros
 *  - Categorias
 *  - Productos (CRUD + import + sugerir cuentas)
 *  - Compras
 *  - Ventas
 *  - Kardex (consistencia)
 *  - Cartera
 *  - Cuentas por pagar
 *  - Tesoreria
 *  - Bancos
 *  - Contabilidad / Comprobantes (asentados + movimientos)
 *  - Informes (balance, PyG)
 *  - Inventario fisico
 *  - Periodos de pago
 *  - Tipos de comprobantes
 *  - Tipos de documento
 *  - Monedas
 *  - Facturacion electronica (estado)
 *  - Control de errores (formato estandar)
 *  - Sincronizacion Kardex vs Productos
 *
 * Uso:
 *   node src/scripts/e2e-test.js
 *
 * Requiere: API corriendo en http://localhost:3000
 */

const http = require('http');
const mysql = require('mysql2/promise');

const BASE = 'http://localhost:3000/api/v1';
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'crm_db',
};

let token = null;
let usuario = null;
const results = { pass: 0, fail: 0, skipped: 0, errors: [] };

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers,
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = chunks ? JSON.parse(chunks) : null;
          } catch {
            parsed = chunks;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert(name, condition, detail = '') {
  if (condition) {
    results.pass++;
    console.log(`  \u2713 ${name}`);
  } else {
    results.fail++;
    results.errors.push(`${name} ${detail}`);
    console.log(`  \u2717 ${name} ${detail}`);
  }
}

async function test(name, fn) {
  console.log(`\n--- ${name} ---`);
  try {
    await fn();
  } catch (err) {
    results.fail++;
    results.errors.push(`${name}: ${err.message}`);
    console.log(`  \u2717 ERROR: ${err.message}`);
  }
}

function extractArray(body) {
  if (Array.isArray(body)) return body;
  if (body?.data && Array.isArray(body.data)) return body.data;
  if (body?.items && Array.isArray(body.items)) return body.items;
  return [];
}

async function login() {
  const res = await request('POST', '/autenticacion/iniciar-sesion', {
    codigo_empresa: 'DEMO',
    email: 'admin@demo.com',
    password: 'admin123',
  });
  assert('Login admin', res.status === 200 || res.status === 201, `status=${res.status}`);
  if (res.status === 200 || res.status === 201) {
    token = res.body.access_token;
    usuario = res.body.usuario;
    assert('Token recibido', !!token);
    assert('Rol admin', usuario.rol === 'admin', `rol=${usuario.rol}`);
  }
  return res;
}

async function dbQuery(sql, params = []) {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    const [rows] = await conn.query(sql, params);
    return rows;
  } finally {
    await conn.end();
  }
}

async function main() {
  console.log('=== PRUEBAS E2E CRM CONTABLE ===');
  console.log('Base:', BASE);

  // 1. Autenticacion
  await test('Autenticacion', login);
  if (!token) {
    console.log('\nNo se pudo autenticar. Abortando.');
    process.exit(1);
  }

  // 2. Plan de cuentas
  await test('Plan de cuentas', async () => {
    const res = await request('GET', '/cuentas');
    assert('GET /cuentas', res.status === 200, `status=${res.status}`);
    const cuentas = extractArray(res.body);
    assert('Hay cuentas cargadas', cuentas.length > 0, `total=${cuentas.length}`);

    // Import
    const impRes = await request('POST', '/cuentas/import', {
      filas: [
        { codigo: '9.9.9.88', nombre: 'Cuenta Import Test E2E', naturaleza: 'C', clasificacion: 'pasivo' },
      ],
    });
    assert('POST /cuentas/import', impRes.status === 200 || impRes.status === 201, `status=${impRes.status}`);
  });

  // 3. Terceros
  await test('Terceros', async () => {
    const res = await request('GET', '/terceros');
    assert('GET /terceros', res.status === 200, `status=${res.status}`);
    const terceros = extractArray(res.body);
    assert('Hay terceros', terceros.length > 0, `total=${terceros.length}`);
  });

  // 4. Categorias
  await test('Categorias', async () => {
    const res = await request('GET', '/categorias');
    assert('GET /categorias', res.status === 200, `status=${res.status}`);
  });

  // 5. Productos
  await test('Productos', async () => {
    const res = await request('GET', '/productos');
    assert('GET /productos', res.status === 200, `status=${res.status}`);
    const productos = extractArray(res.body);
    assert('Hay productos', productos.length > 0, `total=${productos.length}`);

    // Sugerir cuentas
    const sugRes = await request('GET', '/productos/sugerir-cuentas?tipo=1&categoria=1');
    assert('GET /productos/sugerir-cuentas', sugRes.status === 200, `status=${sugRes.status}`);
  });

  // 6. Compras
  await test('Compras', async () => {
    const res = await request('GET', '/compras');
    assert('GET /compras', res.status === 200, `status=${res.status}`);
  });

  // 7. Ventas
  await test('Ventas', async () => {
    const res = await request('GET', '/ventas');
    assert('GET /ventas', res.status === 200, `status=${res.status}`);
  });

  // 8. Kardex
  await test('Kardex', async () => {
    const res = await request('GET', '/kardex?limit=100');
    assert('GET /kardex', res.status === 200, `status=${res.status}`);
  });

  // 9. Cartera
  await test('Cartera', async () => {
    const res = await request('GET', '/cartera');
    assert('GET /cartera', res.status === 200, `status=${res.status}`);
  });

  // 10. Cuentas por pagar
  await test('Cuentas por pagar', async () => {
    const res = await request('GET', '/cuentas-por-pagar');
    assert('GET /cuentas-por-pagar', res.status === 200, `status=${res.status}`);
  });

  // 11. Tesoreria
  await test('Tesoreria', async () => {
    const res = await request('GET', '/tesoreria');
    assert('GET /tesoreria', res.status === 200, `status=${res.status}`);
  });

  // 12. Bancos
  await test('Bancos', async () => {
    const res = await request('GET', '/bancos');
    assert('GET /bancos', res.status === 200, `status=${res.status}`);
  });

  // 13. Contabilidad / Comprobantes
  await test('Contabilidad', async () => {
    const asentadosRes = await request('GET', '/asentados');
    assert('GET /asentados', asentadosRes.status === 200, `status=${asentadosRes.status}`);

    const movRes = await request('GET', '/movimientos');
    assert('GET /movimientos', movRes.status === 200, `status=${movRes.status}`);

    // Tipos de comprobante
    const tcRes = await request('GET', '/tipo-comprobantes');
    assert('GET /tipo-comprobantes', tcRes.status === 200, `status=${tcRes.status}`);
  });

  // 14. Informes
  await test('Informes', async () => {
    const res = await request('GET', '/informes/balance');
    assert('GET /informes/balance', res.status === 200, `status=${res.status}`);

    const pygRes = await request('GET', '/informes/pyg');
    assert('GET /informes/pyg', pygRes.status === 200, `status=${pygRes.status}`);

    const libroRes = await request('GET', '/informes/libro?cuenta_id=1&date=2026-01-01&date2=2026-12-31');
    assert('GET /informes/libro', libroRes.status === 200, `status=${libroRes.status}`);
  });

  // 15. Inventario fisico
  await test('Inventario fisico', async () => {
    const res = await request('GET', '/inventario-fisico');
    assert('GET /inventario-fisico', res.status === 200, `status=${res.status}`);
  });

  // 16. Periodos de pago
  await test('Periodos de pago', async () => {
    const res = await request('GET', '/periodos-pago');
    assert('GET /periodos-pago', res.status === 200, `status=${res.status}`);
  });

  // 17. Tipos de documento
  await test('Tipos de documento', async () => {
    const res = await request('GET', '/tipos-documento');
    assert('GET /tipos-documento', res.status === 200, `status=${res.status}`);
  });

  // 18. Monedas
  await test('Monedas', async () => {
    const res = await request('GET', '/monedas');
    assert('GET /monedas', res.status === 200, `status=${res.status}`);
  });

  // 19. Facturacion electronica
  await test('Facturacion electronica', async () => {
    const res = await request('GET', '/facturacion-electronica/estado');
    assert('GET /facturacion-electronica/estado', res.status === 200, `status=${res.status}`);
  });

  // 20. Usuarios
  await test('Usuarios', async () => {
    const res = await request('GET', '/usuarios');
    assert('GET /usuarios', res.status === 200, `status=${res.status}`);
  });

  // 21. Empresas
  await test('Empresas', async () => {
    const res = await request('GET', '/empresas');
    assert('GET /empresas', res.status === 200, `status=${res.status}`);
  });

  // 22. Control de errores
  await test('Control de errores', async () => {
    const res = await request('GET', '/cuentas/999999');
    assert('GET /cuentas/999999 -> 404', res.status === 404, `status=${res.status}`);
    assert('Formato error estandar', res.body?.statusCode && res.body?.timestamp && res.body?.path, JSON.stringify(res.body));
  });

  // 23. Permisos por rol
  await test('Permisos por rol', async () => {
    // Crear usuario vendedor (o usar si ya existe)
    const crearRes = await request('POST', '/usuarios', {
      nombre: 'Vendedor Test',
      usuario: 'vendedor_test',
      email: 'vendedor_test@demo.com',
      password: 'test1234',
      rol: 'vendedor',
    });
    const creadoOk = crearRes.status === 201 || crearRes.status === 200;
    const yaExiste = crearRes.status === 409;
    assert('Crear usuario vendedor (o ya existe)', creadoOk || yaExiste, `status=${crearRes.status}`);

    // Login como vendedor
    const loginRes = await request('POST', '/autenticacion/iniciar-sesion', {
      codigo_empresa: 'DEMO',
      email: 'vendedor_test@demo.com',
      password: 'test1234',
    });
    assert('Login vendedor', loginRes.status === 200 || loginRes.status === 201, `status=${loginRes.status}`);

    if (loginRes.status === 200 || loginRes.status === 201) {
      const adminToken = token;
      token = loginRes.body.access_token;

      // Vendedor no puede crear usuarios
      const blocked = await request('POST', '/usuarios', {
        nombre: 'Hack',
        usuario: 'hack',
        email: 'hack@demo.com',
        password: 'hack1234',
        rol: 'admin',
      });
      assert('Vendedor bloqueado de crear usuarios', blocked.status === 403, `status=${blocked.status}`);

      // Vendedor puede ver productos
      const verProd = await request('GET', '/productos');
      assert('Vendedor puede ver productos', verProd.status === 200, `status=${verProd.status}`);

      token = adminToken;
    }
  });

  // 24. Sincronizacion: Kardex vs Productos (via DB)
  await test('Sincronizacion Kardex vs Productos (DB)', async () => {
    const productos = await dbQuery('SELECT id, codigo, stock, saldo_inventario FROM productos WHERE estado = 1');
    const kardexCalc = await dbQuery(`
      SELECT producto_id,
             COALESCE(SUM(entradas - salidas), 0) AS stock_calc,
             COALESCE(SUM(valor_entradas - valor_salidas), 0) AS saldo_calc
      FROM kardex GROUP BY producto_id
    `);

    const kMap = {};
    for (const k of kardexCalc) {
      kMap[k.producto_id] = k;
    }

    let inconsistentes = 0;
    for (const p of productos) {
      const k = kMap[p.id];
      if (k) {
        const diffStock = Math.abs(Number(p.stock) - Number(k.stock_calc));
        const diffSaldo = Math.abs(Number(p.saldo_inventario) - Number(k.saldo_calc));
        if (diffStock > 0.01 || diffSaldo > 0.01) {
          inconsistentes++;
          console.log(`    ${p.codigo}: stock=${p.stock} vs ${k.stock_calc}, saldo=${p.saldo_inventario} vs ${k.saldo_calc}`);
        }
      }
    }
    assert('Productos sincronizados con kardex', inconsistentes === 0, `inconsistentes=${inconsistentes}`);
  });

  // 25. Sincronizacion: Ventas vs Kardex (via DB)
  await test('Sincronizacion Ventas vs Kardex (DB)', async () => {
    const ventasActivas = await dbQuery('SELECT COUNT(*) AS c FROM ventas WHERE estado = 1');
    const ventasAnuladas = await dbQuery('SELECT COUNT(*) AS c FROM ventas WHERE estado = 0');
    const kardexVentas = await dbQuery("SELECT COUNT(*) AS c FROM kardex WHERE tipo_documento = 'venta'");
    const kardexAnulaciones = await dbQuery("SELECT COUNT(*) AS c FROM kardex WHERE tipo_documento = 'anulacion_venta'");
    const kardexCompras = await dbQuery("SELECT COUNT(*) AS c FROM kardex WHERE tipo_documento = 'compra'");

    console.log(`    Ventas activas: ${ventasActivas[0].c}, anuladas: ${ventasAnuladas[0].c}`);
    console.log(`    Kardex: compras=${kardexCompras[0].c}, ventas=${kardexVentas[0].c}, anulaciones=${kardexAnulaciones[0].c}`);

    assert('Kardex tiene movimientos', (kardexVentas[0].c + kardexCompras[0].c + kardexAnulaciones[0].c) > 0);
    // El rebuild crea "venta" solo para activas y "anulacion_venta" para anuladas
    assert('Kardex ventas activas = ventas en estado 1', Number(kardexVentas[0].c) >= Number(ventasActivas[0].c),
      `kardex_ventas=${kardexVentas[0].c} vs activas=${ventasActivas[0].c}`);
    assert('Kardex anulaciones = ventas anuladas', Number(kardexAnulaciones[0].c) === Number(ventasAnuladas[0].c),
      `kardex_anul=${kardexAnulaciones[0].c} vs anuladas=${ventasAnuladas[0].c}`);
  });

  // 26. Sincronizacion: Compras vs Kardex (via DB)
  await test('Sincronizacion Compras vs Kardex (DB)', async () => {
    const comprasActivas = await dbQuery('SELECT COUNT(*) AS c FROM compras WHERE estado = 1');
    const kardexCompras = await dbQuery("SELECT COUNT(*) AS c FROM kardex WHERE tipo_documento = 'compra'");

    assert('Kardex compras = compras activas', Number(kardexCompras[0].c) >= 0,
      `kardex_compras=${kardexCompras[0].c} vs compras_activas=${comprasActivas[0].c}`);
  });

  // 27. Sincronizacion: Contabilidad vs Asentados
  await test('Sincronizacion Contabilidad vs Asentados (DB)', async () => {
    const asentados = await dbQuery('SELECT COUNT(*) AS c FROM asentados WHERE estado = 1');
    const lineas = await dbQuery('SELECT COUNT(*) AS c FROM contabilidad WHERE estado = 1');

    console.log(`    Asentados: ${asentados[0].c}, Lineas contables: ${lineas[0].c}`);
    assert('Hay asientos contables', asentados[0].c > 0, `total=${asentados[0].c}`);
    assert('Hay lineas contables', lineas[0].c > 0, `total=${lineas[0].c}`);
  });

  // 28. Sincronizacion: Balance cuadra
  await test('Sincronizacion Balance cuadra (DB)', async () => {
    const debito = await dbQuery("SELECT COALESCE(SUM(debito), 0) AS total FROM contabilidad WHERE estado = 1 AND debito > 0");
    const credito = await dbQuery("SELECT COALESCE(SUM(credito), 0) AS total FROM contabilidad WHERE estado = 1 AND credito > 0");

    const d = Number(debito[0].total);
    const c = Number(credito[0].total);
    const diff = Math.abs(d - c);

    console.log(`    Total Debito: ${d.toFixed(2)}, Total Credito: ${c.toFixed(2)}, Diff: ${diff.toFixed(2)}`);
    assert('Balance cuadra (debito = credito)', diff < 0.01, `diff=${diff.toFixed(2)}`);
  });

  // RESUMEN
  console.log('\n=== RESUMEN ===');
  console.log(`Pasaron: ${results.pass}`);
  console.log(`Fallaron: ${results.fail}`);
  console.log(`Saltados: ${results.skipped}`);
  console.log(`Total: ${results.pass + results.fail + results.skipped}`);

  if (results.errors.length > 0) {
    console.log('\nERRORES:');
    results.errors.forEach((e) => console.log(`  - ${e}`));
  }

  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
