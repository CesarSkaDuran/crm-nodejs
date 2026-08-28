/**
 * Interfaces y tipos para el módulo de Informes Contables.
 *
 * Este archivo centraliza:
 *   - Tipos de resultados de queries raw de BD
 *   - Estructura de respuesta de cada informe
 *   - Tipos de cuenta en memoria (cuentasMap)
 *   - IDs virtuales negativos para nodos sintéticos
 */

// =============================================================================
// IDs VIRTUALES NEGATIVOS
// =============================================================================
//
// Se usan IDs negativos para nodos virtuales (sintéticos) que no existen
// en la BD pero se inyectan en memoria para mantener la jerarquía PUC.
// Los IDs negativos garantizan que no colisionen con IDs reales de la BD.
//
// Convención:
//   -1  = Resultado del Ejercicio (cuenta virtual 3.9.99)
//   -2  = Nodo raíz virtual de Patrimonio (clase 3)
//   -3  = Nodo raíz virtual de Activo (clase 1)
//   -4  = Nodo raíz virtual de Pasivo (clase 2)
//   -100..-106 = Nodos raíz virtuales de P&G (clases 4, 5, 6)

export const ID_RESULTADO_EJERCICIO = -1;
export const ID_PATRIMONIO_RAIZ = -2;
export const ID_ACTIVO_RAIZ = -3;
export const ID_PASIVO_RAIZ = -4;

/**
 * IDs virtuales para los nodos raíz de P&G (clases 4, 5, 6).
 * Se calculan como -100 - Number(clase) para evitar colisiones.
 */
export function idRaizPyg(clase: string): number {
  return -100 - Number(clase);
}

// =============================================================================
// TIPOS DE RESULTADOS DE QUERIES RAW
// =============================================================================

/**
 * Resultado raw de una cuenta del plan_cuentas (SELECT de accountRepo).
 */
export interface CuentaRawResult {
  id: number;
  codigo: string;
  nombre: string;
  naturaleza: string;
  clasificacion: number;
  clase?: string;
  cuenta_padre_id: number | null;
}

/**
 * Resultado raw de movimientos agregados por cuenta (balanceGeneral).
 * Estructura: [{ id, debito, credito }]
 */
export interface BalanceMovimientoRawResult {
  id: number;
  debito: number;
  credito: number;
}

/**
 * Resultado raw de saldos anteriores por cuenta (movimientos antes de una fecha).
 * Estructura: [{ id, debito, credito }]
 */
export interface SaldoAnteriorRawResult {
  id: number;
  debito: number;
  credito: number;
}

/**
 * Resultado raw del cálculo de Resultado del Ejercicio (agregado por clase).
 * Estructura: [{ clase, naturaleza, debito, credito }]
 */
export interface ResultadoEjercicioRawResult {
  clase: string;
  naturaleza: string;
  debito: number;
  credito: number;
}

/**
 * Resultado raw del detalle de P&G (cuentas auxiliares con movimientos).
 * Estructura: [{ cuenta_id, codigo, nombre, clase, naturaleza, debito, credito }]
 */
export interface PygDetalleRawResult {
  cuenta_id: number;
  codigo: string;
  nombre: string;
  clase: string;
  naturaleza: string;
  debito: number;
  credito: number;
}

// =============================================================================
// TIPOS DE CUENTA EN MEMORIA (cuentasMap)
// =============================================================================

/**
 * Estructura interna de una cuenta en el mapa de cuentas (cuentasMap).
 *
 * Esta estructura se construye en memoria durante el cálculo de informes
 * y contiene tanto datos de la BD como campos calculados (saldos, esPadre, etc.).
 */
export interface CuentaMemoria {
  id: number;
  codigo: string;
  codigoNorm?: string;
  nombre: string;
  naturaleza: string;
  clasificacion: number;
  clase?: string;
  cuenta_padre_id: number | null;
  esPadre: boolean;
  esVirtual?: boolean;
  tieneMovimientos?: boolean;

  // Campos de movimientos directos (propios de la cuenta)
  debito: number;
  credito: number;
  debitoDirecto?: number;
  creditoDirecto?: number;

  // Campos de saldos calculados
  saldo: number;
  saldoDirecto?: number;
  saldoConsolidado?: number;
  saldoAnterior?: number;
}

// =============================================================================
// TIPOS DE RESPUESTA DE INFORMES
// =============================================================================

/**
 * Respuesta del Libro Auxiliar (libroMayor, libroRango, libroTerceros).
 */
export interface LibroAuxiliarResponse {
  cuenta: Account;
  modo: string;
  data: LibroFilaDetallada[] | LibroFilaResumida[] | LibroFilaAgrupada[];
  total: number;
  total_debito: number;
  total_credito: number;
  saldo_final: number;
  saldos_iniciales?: Record<number, number>;
}

/**
 * Fila del libro auxiliar en modo 'detallado'.
 */
export interface LibroFilaDetallada {
  id: number;
  fecha: Date;
  consecutivo: string;
  cuenta: { id: number; codigo: string; nombre: string } | null;
  cuenta_str: string;
  tercero: string;
  tercero_id: number | null;
  descripcion: string;
  debito: number;
  credito: number;
  valor: number;
  saldo: number;
  saldo_cuenta: number;
  saldo_anomalo: boolean;
}

/**
 * Fila del libro auxiliar en modo 'resumido'.
 */
export interface LibroFilaResumida {
  cuenta: {
    id: number;
    codigo: string;
    nombre: string;
    naturaleza: string;
    clasificacion: number;
  };
  debito: number;
  credito: number;
  saldo: number;
  saldoDirecto: number;
  esPadre: boolean;
  saldo_anomalo: boolean;
}

/**
 * Fila del libro auxiliar en modos 'porComprobante' y 'discriminado'.
 */
export interface LibroFilaAgrupada {
  [key: string]: any;
  debito: number;
  credito: number;
  saldo: number;
}

/**
 * Tipo unión para el resultado interno de buildLibro.
 * Puede ser detallado, resumido, porComprobante o discriminado.
 */
export type LibroLineaResultado =
  | LibroFilaDetallada
  | LibroFilaResumida
  | LibroFilaAgrupada;


/**
 * Respuesta del Balance General.
 */
export interface BalanceGeneralResponse {
  data: BalanceGeneralFila[];
  totales: {
    activo: number;
    pasivo: number;
    patrimonio: number;
    resultado_ejercicio: number;
    pasivo_mas_patrimonio: number;
  };
  total_debito: number;
  total_credito: number;
  saldo_final: number;
}

/**
 * Fila del Balance General.
 */
export interface BalanceGeneralFila {
  id: number;
  codigo: string;
  nombre: string;
  clase: string;
  naturaleza: string;
  clasificacion: number;
  nivel: number;
  debito: number;
  credito: number;
  saldo: number;
  esPadre: boolean;
  esVirtual: boolean;
  saldo_anomalo: boolean;
  esSaldoContrario: boolean;
}

/**
 * Respuesta del Estado de Resultados (P&G).
 */
export interface PygResponse {
  totalIngresos: number;
  totalCostos: number;
  totalGastos: number;
  utilidadPerdida: number;
  detalle: PygFila[];
}

/**
 * Fila del Estado de Resultados (P&G).
 */
export interface PygFila {
  cuenta_id: number;
  codigo: string;
  nombre: string;
  clase: string;
  naturaleza: string;
  nivel: number;
  debito: number;
  credito: number;
  saldo: number;
  esPadre?: boolean;
  esVirtual?: boolean;
  saldo_anomalo: boolean;
  esSaldoContrario: boolean;
}

// Re-exportar Account para uso en el servicio
import { Account } from '../accounts/entities/account.entity';
