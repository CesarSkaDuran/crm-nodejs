const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  const [desbalanceados] = await c.query(`
    SELECT a.id, a.consecutivo, a.total_debito, a.total_credito,
           SUM(l.debito) sd, SUM(l.credito) sc
    FROM asentados a
    JOIN contabilidad l ON l.asentado_id = a.id
    GROUP BY a.id
    HAVING ABS(SUM(l.debito) - SUM(l.credito)) > 0.01
        OR ABS(SUM(l.debito) - a.total_debito) > 0.01
    ORDER BY a.id DESC
    LIMIT 20
  `);
  console.log('desbalanceados', desbalanceados);

  const [cuentas] = await c.query(`
    SELECT id, codigo, nombre
    FROM cuentas
    WHERE id IN (1,558,559) OR codigo IN ('1105','1')
  `);
  console.log('cuentas', cuentas);

  const [productos] = await c.query(`
    SELECT id, codigo, nombre, cuenta_inventarios_id, cuenta_costos_id, cuenta_ingresos_id, stock, promedio
    FROM productos
  `);
  console.log('productos', productos);

  const [lineasRecientes] = await c.query(`
    SELECT l.asentado_id, a.consecutivo, l.cuenta_contable_id, cu.codigo, cu.nombre,
           l.tercero_id, l.descripcion, l.debito, l.credito
    FROM contabilidad l
    JOIN asentados a ON a.id = l.asentado_id
    LEFT JOIN cuentas cu ON cu.id = l.cuenta_contable_id
    WHERE a.id IN (26,27)
    ORDER BY l.id
  `);
  console.log('lineas compras nuevas', lineasRecientes);

  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
