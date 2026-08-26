/**
 * Corrige asientos de compras antiguos que no tenían IVA/flete/retención.
 * Para cada asiento descuadrado de tipo compra (tipo=1):
 *  - Busca la compra asociada (por codigo FC en descripcion)
 *  - Agrega línea de IVA descontable (debito)
 *  - Agrega línea de flete (debito) si aplica
 *  - Agrega línea de retención (credito) si aplica
 *  - Recalcula total_debito/total_credito del asiento
 */
const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_db',
  });

  // Cuentas contables necesarias
  const [[iva]] = await c.query("SELECT id FROM plan_cuentas WHERE codigo='2.4.08.02' LIMIT 1");
  const [[ret]] = await c.query("SELECT id FROM plan_cuentas WHERE codigo='2.3.65' LIMIT 1");
  const [[fle]] = await c.query("SELECT id FROM plan_cuentas WHERE codigo='4.2.35.80' LIMIT 1");
  console.log('Cuentas: IVA=', iva?.id, 'RET=', ret?.id, 'FLE=', fle?.id);

  if (!iva?.id) {
    console.error('Falta cuenta IVA descontable (2.4.08.02)');
    process.exit(1);
  }

  // Buscar asientos de compra descuadrados
  const [asientos] = await c.query(`
    SELECT a.id, a.consecutivo, a.descripcion, a.empresa_id, a.fecha, a.usuario,
           (SELECT ROUND(SUM(l.debito),2) FROM contabilidad l WHERE l.asentado_id=a.id) AS suma_debito,
           (SELECT ROUND(SUM(l.credito),2) FROM contabilidad l WHERE l.asentado_id=a.id) AS suma_credito
    FROM asentados a WHERE a.tipo=1
    HAVING ABS(suma_debito - suma_credito) > 0.01
  `);

  console.log(`Asientos de compra descuadrados: ${asientos.length}`);

  for (const a of asientos) {
    const codigoCompra = a.descripcion.match(/FC\d+/)?.[0];
    if (!codigoCompra) {
      console.log(`  ${a.consecutivo}: no se pudo extraer código de compra, saltando`);
      continue;
    }

    const [compras] = await c.query('SELECT * FROM compras WHERE codigo=?', [codigoCompra]);
    const compra = compras[0];
    if (!compra) {
      console.log(`  ${a.consecutivo}: compra ${codigoCompra} no encontrada, saltando`);
      continue;
    }

    const impuesto = Number(compra.impuesto || 0);
    const flete = Number(compra.flete || 0);
    const retencion = Number(compra.retencion || 0);
    const proveedorId = compra.proveedor_id;

    console.log(`\nCorrigiendo ${a.consecutivo} (compra ${codigoCompra}): IVA=${impuesto} flete=${flete} ret=${retencion}`);

    // Buscar línea existente de inventario para obtener tercero_id
    const [lineas] = await c.query('SELECT tercero_id FROM contabilidad WHERE asentado_id=? LIMIT 1', [a.id]);
    const terceroId = lineas[0]?.tercero_id || proveedorId;

    // Agregar línea IVA (debito)
    if (impuesto > 0) {
      await c.query(
        `INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado)
         VALUES (?,?,?,?,?,?,?,0,'D',?,?,?,1)`,
        [a.empresa_id, a.id, iva.id, terceroId, `IVA descontable compra ${codigoCompra} (migración)`, impuesto, impuesto, a.consecutivo, a.fecha, a.usuario],
      );
      console.log(`  + IVA descontable débito ${impuesto}`);
    }

    // Agregar línea flete (debito)
    if (flete > 0 && fle?.id) {
      await c.query(
        `INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado)
         VALUES (?,?,?,?,?,?,?,0,'D',?,?,?,1)`,
        [a.empresa_id, a.id, fle.id, terceroId, `Flete compra ${codigoCompra} (migración)`, flete, flete, a.consecutivo, a.fecha, a.usuario],
      );
      console.log(`  + Flete débito ${flete}`);
    }

    // Agregar línea retención (crédito) y reducir crédito al proveedor/banco
    if (retencion > 0 && ret?.id) {
      await c.query(
        `INSERT INTO contabilidad (empresa_id, asentado_id, cuenta_contable_id, tercero_id, descripcion, valor, debito, credito, naturaleza, consecutivo, fecha, usuario, estado)
         VALUES (?,?,?,?,?,?,0,?,'C',?,?,?,1)`,
        [a.empresa_id, a.id, ret.id, terceroId, `Retención compra ${codigoCompra} (migración)`, retencion, retencion, a.consecutivo, a.fecha, a.usuario],
      );
      console.log(`  + Retención crédito ${retencion}`);

      // Reducir el crédito de la contrapartida (proveedor o banco)
      await c.query(
        `UPDATE contabilidad SET credito = credito - ?, valor = valor - ?
         WHERE asentado_id=? AND credito > 0 ORDER BY id DESC LIMIT 1`,
        [retencion, retencion, a.id],
      );
      console.log(`  - Contrapartida reducida en ${retencion}`);
    }

    // Recalcular totales
    const [tot] = await c.query(
      'SELECT ROUND(SUM(debito),2) AS d, ROUND(SUM(credito),2) AS c FROM contabilidad WHERE asentado_id=?',
      [a.id],
    );
    await c.query('UPDATE asentados SET total_debito=?, total_credito=? WHERE id=?', [tot[0].d, tot[0].c, a.id]);
    const cuadra = Math.abs(tot[0].d - tot[0].c) < 0.01;
    console.log(`  Totales: D=${tot[0].d} C=${tot[0].c} ${cuadra ? '✓' : '✗ aún descuadra'}`);
  }

  console.log('\nMigración completada.');
  await c.end();
})().catch((e) => {
  console.error('Error:', e);
  process.exit(1);
});
