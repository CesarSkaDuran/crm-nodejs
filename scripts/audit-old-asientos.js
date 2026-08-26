const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  // Buscar asientos descuadrados
  const [asientos] = await c.query(`
    SELECT a.id, a.consecutivo, a.tipo, a.descripcion, a.total_debito, a.total_credito,
           (SELECT ROUND(SUM(l.debito),2) FROM contabilidad l WHERE l.asentado_id=a.id) AS suma_debito,
           (SELECT ROUND(SUM(l.credito),2) FROM contabilidad l WHERE l.asentado_id=a.id) AS suma_credito
    FROM asentados a
    ORDER BY a.id
  `);

  console.log('=== TODOS LOS ASIENTOS ===');
  for (const a of asientos) {
    const descuadre = Math.abs((a.suma_debito || 0) - (a.suma_credito || 0));
    const marca = descuadre > 0.01 ? '✗ DESCUADRE ' + descuadre : '✓';
    console.log(`${a.id} ${a.consecutivo} tipo=${a.tipo} D=${a.suma_debito} C=${a.suma_credito} ${marca} - ${a.descripcion}`);
  }

  // Detalle de los descuadrados
  const descuadrados = asientos.filter((a) => Math.abs((a.suma_debito || 0) - (a.suma_credito || 0)) > 0.01);
  console.log('\n=== DETALLE DESCUADRADOS ===');
  for (const a of descuadrados) {
    const [lineas] = await c.query(
      `SELECT l.id, l.cuenta_contable_id, p.codigo, p.nombre, l.debito, l.credito, l.descripcion
       FROM contabilidad l LEFT JOIN plan_cuentas p ON p.id=l.cuenta_contable_id
       WHERE l.asentado_id=? ORDER BY l.id`,
      [a.id],
    );
    console.log(`\n--- ${a.consecutivo} (tipo ${a.tipo}) ---`);
    for (const l of lineas) {
      console.log(`  ${l.codigo || '?'} ${l.nombre || '?'}: D=${l.debito} C=${l.credito} - ${l.descripcion}`);
    }

    // Si es compra (tipo 1), buscar la compra asociada
    if (a.tipo === 1) {
      const codigoCompra = a.descripcion.match(/FC\d+/)?.[0];
      if (codigoCompra) {
        const [compra] = await c.query('SELECT id, codigo, base_grava, impuesto, retencion, flete, total FROM compras WHERE codigo=?', [codigoCompra]);
        console.log('  Compra:', compra[0]);
      }
    }
  }

  await c.end();
})().catch(console.error);
