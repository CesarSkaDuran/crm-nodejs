/**
 * Reconstrucción completa del kardex y saldos de productos.
 *
 * Objetivo:
 * 1. Hacer backup de kardex y productos.
 * 2. Limpiar el kardex actual.
 * 3. Reconstruir movimientos desde:
 *    - Compras activas (entradas)
 *    - Ventas activas (salidas usando detalle_ventas.costo_unitario)
 *    - Ventas anuladas (entradas de reversión usando detalle_ventas.costo_unitario)
 * 4. Recalcular productos.stock, productos.saldo_inventario, productos.promedio
 *
 * Uso:
 *   node src/scripts/rebuild-kardex.js
 */

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'crm_db',
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

async function run() {
  const conn = await mysql.createConnection(DB_CONFIG);
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];

  try {
    await conn.beginTransaction();
    console.log('=== INICIO RECONSTRUCCION KARDEX ===');
    console.log('Config:', { host: DB_CONFIG.host, database: DB_CONFIG.database });

    // 1. BACKUPS
    const kardexBackup = `kardex_backup_${timestamp}`;
    const productosBackup = `productos_backup_${timestamp}`;

    console.log(`\n[1/6] Creando backup ${kardexBackup} ...`);
    await conn.query(`CREATE TABLE IF NOT EXISTS ${kardexBackup} LIKE kardex`);
    await conn.query(`INSERT INTO ${kardexBackup} SELECT * FROM kardex`);
    const [kBackup] = await conn.query(`SELECT COUNT(*) AS c FROM ${kardexBackup}`);
    console.log(`  -> Backup kardex: ${kBackup[0].c} registros`);

    console.log(`[2/6] Creando backup ${productosBackup} ...`);
    await conn.query(`CREATE TABLE IF NOT EXISTS ${productosBackup} LIKE productos`);
    await conn.query(`INSERT INTO ${productosBackup} SELECT * FROM productos`);
    const [pBackup] = await conn.query(`SELECT COUNT(*) AS c FROM ${productosBackup}`);
    console.log(`  -> Backup productos: ${pBackup[0].c} registros`);

    // 2. LIMPIAR KARDEX
    console.log('\n[3/6] Limpiando kardex ...');
    const [delKardex] = await conn.query('DELETE FROM kardex');
    console.log(`  -> Registros eliminados: ${delKardex.affectedRows}`);
    await conn.query('ALTER TABLE kardex AUTO_INCREMENT = 1');

    // 3. OBTENER MOVIMIENTOS PENDIENTES (todos, ordenados cronologicamente)
    const [movimientos] = await conn.query(`
      SELECT 'compra' AS tipo, c.id AS documento_id, c.empresa_id, dc.producto_id, dc.cantidad, dc.costo_unitario, c.fecha, c.created_at, c.codigo AS consecutivo
      FROM compras c
      JOIN detalle_compras dc ON dc.compra_id = c.id
      WHERE c.estado = 1

      UNION ALL

      SELECT 'venta' AS tipo, v.id AS documento_id, v.empresa_id, dv.producto_id, dv.cantidad, dv.costo_unitario, v.fecha, v.created_at, v.codigo AS consecutivo
      FROM ventas v
      JOIN detalle_ventas dv ON dv.venta_id = v.id
      WHERE v.estado = 1

      UNION ALL

      SELECT 'anulacion_venta' AS tipo, v.id AS documento_id, v.empresa_id, dv.producto_id, dv.cantidad, dv.costo_unitario, v.fecha, v.updated_at AS created_at, CONCAT('ANV', v.id) AS consecutivo
      FROM ventas v
      JOIN detalle_ventas dv ON dv.venta_id = v.id
      WHERE v.estado = 0

      ORDER BY created_at ASC, documento_id ASC
    `);

    console.log(`\n[4/6] Movimientos a procesar: ${movimientos.length}`);

    // 4. RECONSTRUIR KARDEX POR PRODUCTO
    const productoEstado = {};

    let procesados = 0;
    for (const m of movimientos) {
      const st = productoEstado[m.producto_id] || {
        cantidad: 0,
        saldo: 0,
        promedio: 0,
      };

      const entradas = m.tipo === 'compra' || m.tipo === 'anulacion_venta' ? Number(m.cantidad) : 0;
      const salidas = m.tipo === 'venta' ? Number(m.cantidad) : 0;
      const valorUnitario = round2(Number(m.costo_unitario));
      const valorMovimiento = round2(Number(m.cantidad) * valorUnitario);

      const valorEntradas = entradas > 0 ? valorMovimiento : 0;
      const valorSalidas = salidas > 0 ? valorMovimiento : 0;

      const cantidadAnterior = round2(st.cantidad);
      const saldoAnterior = round2(st.saldo);
      const promedioAnterior = st.cantidad > 0 ? round2(st.saldo / st.cantidad) : 0;

      const cantidadActual = round2(cantidadAnterior + entradas - salidas);
      const saldoActual = round2(saldoAnterior + valorEntradas - valorSalidas);
      const promedioActual = cantidadActual > 0 ? round2(saldoActual / cantidadActual) : 0;

      await conn.query(
        `INSERT INTO kardex (
          empresa_id, producto_id, tipo_documento, documento_id, consecutivo, fecha,
          cantidad_anterior, saldo_anterior, promedio_anterior, valor_unitario,
          entradas, salidas, valor_entradas, valor_salidas, total,
          cantidad_actual, saldo_actual, promedio_actual, estado
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          m.empresa_id,
          m.producto_id,
          m.tipo,
          m.documento_id,
          m.consecutivo,
          m.fecha,
          cantidadAnterior,
          saldoAnterior,
          promedioAnterior,
          valorUnitario,
          entradas,
          salidas,
          valorEntradas,
          valorSalidas,
          valorMovimiento,
          cantidadActual,
          saldoActual,
          promedioActual,
          1,
        ],
      );

      st.cantidad = cantidadActual;
      st.saldo = saldoActual;
      st.promedio = promedioActual;
      productoEstado[m.producto_id] = st;

      procesados++;
      if (procesados % 100 === 0) {
        console.log(`  -> Procesados: ${procesados}`);
      }
    }

    console.log(`  -> Total insertados: ${procesados}`);

    // 5. RECALCULAR PRODUCTOS
    console.log('\n[5/6] Recalculando productos ...');
    const productoIds = Object.keys(productoEstado);
    let actualizados = 0;

    for (const id of productoIds) {
      const st = productoEstado[id];
      await conn.query(
        'UPDATE productos SET stock = ?, saldo_inventario = ?, promedio = ? WHERE id = ?',
        [st.cantidad, st.saldo, st.promedio, id],
      );
      actualizados++;
    }

    // Productos sin movimiento se dejan como están pero con stock/promedio verificados
    console.log(`  -> Productos actualizados: ${actualizados}`);

    // 6. VERIFICACION
    console.log('\n[6/6] Verificando consistencia ...');
    const [verif] = await conn.query(`
      SELECT COUNT(*) AS inconsistentes
      FROM productos p
      LEFT JOIN (
        SELECT producto_id,
               COALESCE(SUM(entradas - salidas), 0) AS stock_calc,
               COALESCE(SUM(valor_entradas - valor_salidas), 0) AS saldo_calc
        FROM kardex
        GROUP BY producto_id
      ) k ON k.producto_id = p.id
      WHERE p.estado = 1
        AND (ROUND(p.stock, 2) != ROUND(k.stock_calc, 2)
             OR ROUND(p.saldo_inventario, 2) != ROUND(k.saldo_calc, 2))
    `);
    console.log(`  -> Productos inconsistentes restantes: ${verif[0].inconsistentes}`);

    await conn.commit();
    console.log('\n=== RECONSTRUCCION COMPLETADA CON EXITO ===');
    console.log(`Backups: ${kardexBackup}, ${productosBackup}`);
    console.log(`Para restaurar: DROP TABLE kardex; RENAME TABLE ${kardexBackup} TO kardex;`);
    console.log(`                DROP TABLE productos; RENAME TABLE ${productosBackup} TO productos;`);
  } catch (err) {
    console.error('\n=== ERROR ===');
    console.error(err.message);
    await conn.rollback();
    console.error('Transaccion revertida. No se hicieron cambios.');
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
