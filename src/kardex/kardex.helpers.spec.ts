/**
 * Tests unitarios del algoritmo de costo promedio ponderado perpetuo.
 * No requieren base de datos.
 */
import {
  round2,
  round4,
  calcularPromedio,
  procesarCompra,
  procesarVenta,
  procesarSecuencia,
  EstadoInventario,
} from './kardex.helpers';

describe('Costo Promedio Ponderado Perpetuo', () => {
  // ---------------------------------------------------------------------------
  // round2 / round4
  // ---------------------------------------------------------------------------
  describe('round2 / round4', () => {
    it('round2 redondea a 2 decimales', () => {
      expect(round2(100.125)).toBe(100.13);
      expect(round2(100.124)).toBe(100.12);
      expect(round2(0)).toBe(0);
    });

    it('round4 redondea a 4 decimales', () => {
      expect(round4(137.50505)).toBe(137.5051);
      expect(round4(0)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // calcularPromedio
  // ---------------------------------------------------------------------------
  describe('calcularPromedio', () => {
    it('calcula el promedio correctamente', () => {
      expect(calcularPromedio(10, 1000)).toBe(100);
      expect(calcularPromedio(8, 1100)).toBe(137.5);
    });

    it('retorna 0 cuando cantidad es 0', () => {
      expect(calcularPromedio(0, 0)).toBe(0);
      expect(calcularPromedio(0, 100)).toBe(0);
    });

    it('retorna 0 cuando cantidad es negativa', () => {
      expect(calcularPromedio(-5, 500)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // procesarCompra
  // ---------------------------------------------------------------------------
  describe('procesarCompra', () => {
    it('debe calcular el promedio correcto después de una compra', () => {
      const estado: EstadoInventario = { cantidad: 0, saldo: 0 };
      const r = procesarCompra(estado, 10, 100);

      expect(r.cantidadActual).toBe(10);
      expect(r.saldoActual).toBe(1000);
      expect(r.promedioActual).toBe(100);
      expect(r.entradas).toBe(10);
      expect(r.valorEntradas).toBe(1000);
      expect(r.total).toBe(1000);
    });

    it('debe calcular el promedio correcto después de múltiples compras', () => {
      let estado: EstadoInventario = { cantidad: 0, saldo: 0 };

      const r1 = procesarCompra(estado, 5, 100);
      estado = { cantidad: r1.cantidadActual, saldo: r1.saldoActual };

      const r2 = procesarCompra(estado, 3, 200);

      expect(r2.cantidadActual).toBe(8);
      expect(r2.saldoActual).toBe(1100);
      expect(r2.promedioActual).toBe(137.5);
    });

    it('debe recalcular el promedio después de una compra posterior a una venta', () => {
      // Estado: 6 unidades, saldo=825, promedio=137.50
      let estado: EstadoInventario = { cantidad: 6, saldo: 825 };
      const r = procesarCompra(estado, 4, 150);

      expect(r.cantidadActual).toBe(10);
      expect(r.saldoActual).toBe(1425);
      expect(r.promedioActual).toBe(142.5);
    });

    it('debe aplicar descuento correctamente', () => {
      const estado: EstadoInventario = { cantidad: 0, saldo: 0 };
      const r = procesarCompra(estado, 10, 100, 10); // 10% descuento

      // bruto = 1000, descuento = 100, neto = 900
      expect(r.total).toBe(900);
      expect(r.saldoActual).toBe(900);
      expect(r.promedioActual).toBe(90);
    });
  });

  // ---------------------------------------------------------------------------
  // procesarVenta
  // ---------------------------------------------------------------------------
  describe('procesarVenta', () => {
    it('debe usar el promedio correcto en una venta', () => {
      // Estado: 8 unidades, saldo=1100, promedio=137.50
      const estado: EstadoInventario = { cantidad: 8, saldo: 1100 };
      const r = procesarVenta(estado, 2, 300);

      expect(r.costoUnitario).toBe(137.5);
      expect(r.costoTotal).toBe(275);
      expect(r.cantidadActual).toBe(6);
      expect(r.saldoActual).toBe(825);
      expect(r.promedioActual).toBe(137.5);
      expect(r.precioVenta).toBe(300);
    });

    it('debe mantener el promedio constante en una venta (no cambia)', () => {
      const estado: EstadoInventario = { cantidad: 10, saldo: 1000 };
      const r = procesarVenta(estado, 5, 200);

      expect(r.promedioActual).toBe(100); // igual al promedio anterior
      expect(r.cantidadActual).toBe(5);
      expect(r.saldoActual).toBe(500);
    });

    it('debe manejar stock 0 correctamente (error)', () => {
      const estado: EstadoInventario = { cantidad: 0, saldo: 0 };

      expect(() => procesarVenta(estado, 1, 100)).toThrow(
        'Stock insuficiente',
      );
    });

    it('debe lanzar error si la cantidad vendida excede el stock', () => {
      const estado: EstadoInventario = { cantidad: 5, saldo: 500 };

      expect(() => procesarVenta(estado, 10, 100)).toThrow(
        'Stock insuficiente',
      );
    });

    it('debe dejar saldo 0 y promedio 0 al vender todo el stock', () => {
      const estado: EstadoInventario = { cantidad: 5, saldo: 500 };
      const r = procesarVenta(estado, 5, 200);

      expect(r.cantidadActual).toBe(0);
      expect(r.saldoActual).toBe(0);
      expect(r.promedioActual).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // procesarSecuencia (integración del algoritmo)
  // ---------------------------------------------------------------------------
  describe('procesarSecuencia', () => {
    it('flujo completo: 2 compras + 1 venta + 1 compra + 2 ventas', () => {
      const estado = procesarSecuencia([
        { tipo: 'compra', cantidad: 5, valorUnitario: 100 }, // stock=5, saldo=500, prom=100
        { tipo: 'compra', cantidad: 3, valorUnitario: 200 }, // stock=8, saldo=1100, prom=137.5
        { tipo: 'venta', cantidad: 2, valorUnitario: 300 }, // stock=6, saldo=825, prom=137.5
        { tipo: 'compra', cantidad: 4, valorUnitario: 150 }, // stock=10, saldo=1425, prom=142.5
        { tipo: 'venta', cantidad: 3, valorUnitario: 250 }, // stock=7, saldo=997.5, prom=142.5
        { tipo: 'venta', cantidad: 2, valorUnitario: 250 }, // stock=5, saldo=712.5, prom=142.5
      ]);

      expect(estado.cantidad).toBe(5);
      expect(estado.saldo).toBe(712.5);
    });

    it('flujo con stock llegando a 0 y recompra', () => {
      const estado = procesarSecuencia([
        { tipo: 'compra', cantidad: 10, valorUnitario: 100 }, // stock=10, saldo=1000
        { tipo: 'venta', cantidad: 10, valorUnitario: 200 }, // stock=0, saldo=0
        { tipo: 'compra', cantidad: 5, valorUnitario: 250 }, // stock=5, saldo=1250, prom=250
      ]);

      expect(estado.cantidad).toBe(5);
      expect(estado.saldo).toBe(1250);
    });

    it('debe fallar si intenta vender más de lo disponible', () => {
      expect(() =>
        procesarSecuencia([
          { tipo: 'compra', cantidad: 5, valorUnitario: 100 },
          { tipo: 'venta', cantidad: 10, valorUnitario: 200 },
        ]),
      ).toThrow('Stock insuficiente');
    });
  });
});
