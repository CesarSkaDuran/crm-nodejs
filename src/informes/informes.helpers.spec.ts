/**
 * Tests unitarios para las funciones utilitarias puras de informes.helpers.ts.
 *
 * Cubre casos borde: código null, naturaleza inválida, saldo en el límite
 * de esSaldoAnomalo, redondeo, comparación jerárquica.
 */
import {
  round2,
  normalizarCodigo,
  saldoPorNaturaleza,
  esSaldoAnomalo,
  esSaldoContrario,
  compararCodigoJerarquico,
  calcularNivel,
} from './informes.helpers';

describe('informes.helpers', () => {
  // ---------------------------------------------------------------------------
  // round2
  // ---------------------------------------------------------------------------
  describe('round2', () => {
    it('redondea a 2 decimales correctamente', () => {
      expect(round2(100.125)).toBe(100.13);
      expect(round2(100.124)).toBe(100.12);
      expect(round2(50)).toBe(50);
      expect(round2(0)).toBe(0);
      expect(round2(-33.34)).toBe(-33.34);
    });

    it('maneja valores negativos', () => {
      expect(round2(-100.12)).toBe(-100.12);
      expect(round2(-50.5)).toBe(-50.5);
    });
  });

  // ---------------------------------------------------------------------------
  // normalizarCodigo
  // ---------------------------------------------------------------------------
  describe('normalizarCodigo', () => {
    it('remueve los puntos del código', () => {
      expect(normalizarCodigo('1.1.05')).toBe('1105');
      expect(normalizarCodigo('1.1.05.05')).toBe('110505');
      expect(normalizarCodigo('4.1.05.05')).toBe('410505');
    });

    it('devuelve string vacío para null/undefined', () => {
      expect(normalizarCodigo(null)).toBe('');
      expect(normalizarCodigo(undefined)).toBe('');
      expect(normalizarCodigo('')).toBe('');
    });

    it('no altera códigos sin puntos', () => {
      expect(normalizarCodigo('1105')).toBe('1105');
    });
  });

  // ---------------------------------------------------------------------------
  // saldoPorNaturaleza
  // ---------------------------------------------------------------------------
  describe('saldoPorNaturaleza', () => {
    it('naturaleza D: saldo = débito - crédito', () => {
      expect(saldoPorNaturaleza(100, 30, 'D')).toBe(70);
      expect(saldoPorNaturaleza(0, 50, 'D')).toBe(-50);
      expect(saldoPorNaturaleza(100, 0, 'D')).toBe(100);
    });

    it('naturaleza C: saldo = crédito - débito', () => {
      expect(saldoPorNaturaleza(30, 100, 'C')).toBe(70);
      expect(saldoPorNaturaleza(50, 0, 'C')).toBe(-50);
      expect(saldoPorNaturaleza(0, 100, 'C')).toBe(100);
    });

    it('naturaleza inválida (no C) se trata como D', () => {
      expect(saldoPorNaturaleza(100, 30, 'X')).toBe(70);
      expect(saldoPorNaturaleza(100, 30, '')).toBe(70);
      expect(saldoPorNaturaleza(100, 30, 'd')).toBe(70);
    });
  });

  // ---------------------------------------------------------------------------
  // esSaldoAnomalo
  // ---------------------------------------------------------------------------
  describe('esSaldoAnomalo', () => {
    it('saldo positivo no es anómalo', () => {
      expect(esSaldoAnomalo(100, 'D')).toBe(false);
      expect(esSaldoAnomalo(0.01, 'C')).toBe(false);
    });

    it('saldo cero no es anómalo', () => {
      expect(esSaldoAnomalo(0, 'D')).toBe(false);
      expect(esSaldoAnomalo(0, 'C')).toBe(false);
    });

    it('saldo negativo es anómalo', () => {
      expect(esSaldoAnomalo(-100, 'D')).toBe(true);
      expect(esSaldoAnomalo(-0.01, 'C')).toBe(true);
    });

    it('saldo en el límite (entre -0.009 y 0) no es anómalo', () => {
      expect(esSaldoAnomalo(-0.005, 'D')).toBe(false);
      expect(esSaldoAnomalo(-0.009, 'C')).toBe(false);
    });

    it('saldo justo en el límite (-0.01) es anómalo', () => {
      expect(esSaldoAnomalo(-0.01, 'D')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // esSaldoContrario
  // ---------------------------------------------------------------------------
  describe('esSaldoContrario', () => {
    it('saldo positivo no es contrario', () => {
      expect(esSaldoContrario(100, 'D')).toBe(false);
      expect(esSaldoContrario(0.01, 'C')).toBe(false);
    });

    it('saldo cero no es contrario', () => {
      expect(esSaldoContrario(0, 'D')).toBe(false);
      expect(esSaldoContrario(0, 'C')).toBe(false);
    });

    it('saldo negativo es contrario', () => {
      expect(esSaldoContrario(-100, 'D')).toBe(true);
      expect(esSaldoContrario(-0.01, 'C')).toBe(true);
    });

    it('saldo en el límite no es contrario', () => {
      expect(esSaldoContrario(-0.005, 'D')).toBe(false);
      expect(esSaldoContrario(-0.008, 'C')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // compararCodigoJerarquico
  // ---------------------------------------------------------------------------
  describe('compararCodigoJerarquico', () => {
    it('códigos iguales retornan 0', () => {
      expect(compararCodigoJerarquico('1.1.05', '1.1.05')).toBe(0);
      expect(compararCodigoJerarquico('1', '1')).toBe(0);
    });

    it('1.2 va antes que 1.10 (jerárquico, no lexicográfico)', () => {
      expect(compararCodigoJerarquico('1.2', '1.10')).toBeLessThan(0);
      expect(compararCodigoJerarquico('1.10', '1.2')).toBeGreaterThan(0);
    });

    it('1.1.05 va antes que 1.1.10', () => {
      expect(compararCodigoJerarquico('1.1.05', '1.1.10')).toBeLessThan(0);
    });

    it('códigos con más segmentos van después si los prefix coinciden', () => {
      expect(compararCodigoJerarquico('1.1', '1.1.05')).toBeLessThan(0);
      expect(compararCodigoJerarquico('1.1.05', '1.1')).toBeGreaterThan(0);
    });

    it('maneja códigos null/undefined/vacíos', () => {
      expect(compararCodigoJerarquico(null as any, '')).toBe(0);
      expect(compararCodigoJerarquico('', '1')).toBeLessThan(0);
      expect(compararCodigoJerarquico('1', undefined as any)).toBeGreaterThan(0);
    });

    it('ordena correctamente una secuencia PUC', () => {
      const codigos = ['1.10', '1.2', '1.1.10', '1.1.05', '1.1.05.05', '1', '1.1', '2', '2.1'];
      const ordenados = [...codigos].sort(compararCodigoJerarquico);
      expect(ordenados).toEqual([
        '1', '1.1', '1.1.05', '1.1.05.05', '1.1.10', '1.2', '1.10', '2', '2.1',
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // calcularNivel
  // ---------------------------------------------------------------------------
  describe('calcularNivel', () => {
    it('nivel 1 para código de un segmento', () => {
      expect(calcularNivel('1')).toBe(1);
      expect(calcularNivel('2')).toBe(1);
    });

    it('nivel 2 para código de dos segmentos', () => {
      expect(calcularNivel('1.1')).toBe(2);
      expect(calcularNivel('2.1')).toBe(2);
    });

    it('nivel 3 para código de tres segmentos', () => {
      expect(calcularNivel('1.1.05')).toBe(3);
    });

    it('nivel 4 para código de cuatro segmentos', () => {
      expect(calcularNivel('1.1.05.05')).toBe(4);
    });

    it('devuelve nivel 1 para null/undefined/vacío', () => {
      expect(calcularNivel(null)).toBe(1);
      expect(calcularNivel(undefined)).toBe(1);
      expect(calcularNivel('')).toBe(1);
    });

    it('maneja códigos con punto al final (ej: "3.")', () => {
      // "3." se splitea en ["3", ""] y el filter elimina el vacío → 1 segmento
      expect(calcularNivel('3.')).toBe(1);
    });
  });
});
