/**
 * Tests de integración que validan la consistencia de datos entre
 * kardex, productos, compras y ventas usando la base de datos real.
 *
 * Requiere: API corriendo y datos de prueba cargados.
 * Ejecutar: npx jest src/kardex/kardex.integration.spec.ts
 */
import * as mysql from 'mysql2/promise';
import {
  procesarSecuencia,
  EstadoInventario,
  Movimiento,
} from './kardex.helpers';

const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'crm_db',
};

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function query(conn: any, sql: string, params?: any[]): Promise<any[]> {
  const [rows] = await conn.query(sql, params);
  return rows as any[];
}

async function queryOne(conn: any, sql: string, params?: any[]): Promise<any> {
  const rows = await query(conn, sql, params);
  return rows[0];
}

describe('Integración Kardex - Consistencia de datos', () => {
  let conn: mysql.Connection;

  beforeAll(async () => {
    conn = await mysql.createConnection(DB_CONFIG);
  });

  afterAll(async () => {
    if (conn) await conn.end();
  });

  // ---------------------------------------------------------------------------
  // 1. Stock de productos = SUM(entradas - salidas) del kardex
  // ---------------------------------------------------------------------------
  it('stock de cada producto debe coincidir con SUM(entradas - salidas) del kardex', async () => {
    const productos = await query(
      conn,
      'SELECT id, codigo, nombre, stock, saldo_inventario FROM productos WHERE estado = 1',
    );

    for (const p of productos) {
      const kardex = await queryOne(
        conn,
        'SELECT COALESCE(SUM(entradas - salidas), 0) AS stock_calc, COALESCE(SUM(valor_entradas - valor_salidas), 0) AS saldo_calc FROM kardex WHERE producto_id = ?',
        [p.id],
      );

      const stockCalc = round2(Number(kardex.stock_calc));
      const saldoCalc = round2(Number(kardex.saldo_calc));
      const stockBD = round2(Number(p.stock));
      const saldoBD = round2(Number(p.saldo_inventario));

      expect(stockBD).toBe(stockCalc);
      expect(saldoBD).toBeCloseTo(saldoCalc, 2);
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Detalles de ventas = movimientos de venta en kardex
  // ---------------------------------------------------------------------------
  it('cada detalle de venta debe tener su movimiento en kardex', async () => {
    const detalles = await query(
      conn,
      `SELECT vd.id, vd.venta_id, vd.producto_id, vd.cantidad, v.codigo, v.empresa_id
       FROM detalle_ventas vd
       JOIN ventas v ON v.id = vd.venta_id
       WHERE v.estado = 1`,
    );

    for (const d of detalles) {
      const kardex = await queryOne(
        conn,
        'SELECT id, salidas, valor_salidas FROM kardex WHERE tipo_documento = ? AND documento_id = ? AND producto_id = ?',
        ['venta', d.venta_id, d.producto_id],
      );

      expect(kardex).toBeDefined();
      expect(Number(kardex.salidas)).toBe(Number(d.cantidad));
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Detalles de compras = movimientos de compra en kardex
  // ---------------------------------------------------------------------------
  it('cada detalle de compra debe tener su movimiento en kardex', async () => {
    const detalles = await query(
      conn,
      `SELECT cd.id, cd.compra_id, cd.producto_id, cd.cantidad, c.codigo
       FROM detalle_compras cd
       JOIN compras c ON c.id = cd.compra_id
       WHERE c.estado = 1`,
    );

    for (const d of detalles) {
      const kardex = await queryOne(
        conn,
        'SELECT id, entradas, valor_entradas FROM kardex WHERE tipo_documento = ? AND documento_id = ? AND producto_id = ?',
        ['compra', d.compra_id, d.producto_id],
      );

      expect(kardex).toBeDefined();
      expect(Number(kardex.entradas)).toBe(Number(d.cantidad));
    }
  });

  // ---------------------------------------------------------------------------
  // 4. No debe haber duplicados en kardex
  // ---------------------------------------------------------------------------
  it('no debe haber duplicados en kardex', async () => {
    const duplicados = await query(
      conn,
      `SELECT tipo_documento, documento_id, producto_id, COUNT(*) as cant
       FROM kardex
       GROUP BY tipo_documento, documento_id, producto_id
       HAVING COUNT(*) > 1`,
    );

    expect(duplicados.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 5. Kardex ordenado cronológicamente debe tener coherencia
  // ---------------------------------------------------------------------------
  it('kardex por producto debe tener cantidades coherentes', async () => {
    const productos = await query(
      conn,
      'SELECT id, nombre FROM productos WHERE estado = 1',
    );

    for (const p of productos) {
      const movs = await query(
        conn,
        'SELECT id, tipo_documento, entradas, salidas, cantidad_actual, saldo_actual FROM kardex WHERE producto_id = ? ORDER BY id ASC',
        [p.id],
      );

      let cantidadEsperada = 0;
      for (const m of movs) {
        const entradas = Number(m.entradas);
        const salidas = Number(m.salidas);
        cantidadEsperada = round2(cantidadEsperada + entradas - salidas);

        expect(Number(m.cantidad_actual)).toBe(cantidadEsperada);
      }
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Validar algoritmo: reconstruir desde movimientos y comparar con BD
  // ---------------------------------------------------------------------------
  it('reconstrucción del algoritmo debe coincidir con el stock final en BD', async () => {
    const productos = await query(
      conn,
      'SELECT id, nombre, stock, saldo_inventario FROM productos WHERE estado = 1',
    );

    for (const p of productos) {
      const movs = await query(
        conn,
        `SELECT tipo_documento, entradas, salidas, valor_entradas, valor_salidas
         FROM kardex WHERE producto_id = ? ORDER BY id ASC`,
        [p.id],
      );

      let cantidad = 0;
      let saldo = 0;

      for (const m of movs) {
        cantidad = round2(cantidad + Number(m.entradas) - Number(m.salidas));
        saldo = round2(saldo + Number(m.valor_entradas) - Number(m.valor_salidas));
      }

      expect(round2(Number(p.stock))).toBe(cantidad);
      expect(round2(Number(p.saldo_inventario))).toBeCloseTo(saldo, 2);
    }
  });
});
