/**
 * Algoritmo de costo promedio ponderado perpetuo.
 * Funciones puras para facilitar testing unitario.
 */

export const round2 = (n: number): number =>
  Math.round((Number(n) || 0) * 100) / 100;

export const round4 = (n: number): number =>
  Math.round((Number(n) || 0) * 10000) / 10000;

export interface EstadoInventario {
  cantidad: number;
  saldo: number;
}

export interface ResultadoCompra {
  cantidadAnterior: number;
  saldoAnterior: number;
  promedioAnterior: number;
  cantidadActual: number;
  saldoActual: number;
  promedioActual: number;
  valorUnitario: number;
  total: number;
  entradas: number;
  valorEntradas: number;
}

export interface ResultadoVenta {
  cantidadAnterior: number;
  saldoAnterior: number;
  promedioAnterior: number;
  costoUnitario: number;
  costoTotal: number;
  cantidadActual: number;
  saldoActual: number;
  promedioActual: number;
  valorUnitario: number;
  total: number;
  salidas: number;
  valorSalidas: number;
  precioVenta: number;
}

/**
 * Calcula el promedio ponderado actual.
 */
export function calcularPromedio(cantidad: number, saldo: number): number {
  if (cantidad <= 0) return 0;
  return round4(saldo / cantidad);
}

/**
 * Procesa una compra y retorna el nuevo estado del inventario.
 */
export function procesarCompra(
  estado: EstadoInventario,
  cantidad: number,
  costoUnitario: number,
  descuentoPct: number = 0,
): ResultadoCompra {
  const cantidadAnterior = round2(estado.cantidad);
  const saldoAnterior = round2(estado.saldo);
  const promedioAnterior = calcularPromedio(cantidadAnterior, saldoAnterior);

  const bruto = round2(cantidad * costoUnitario);
  const valorDescuento = round2((bruto * descuentoPct) / 100);
  const neto = round2(bruto - valorDescuento);

  const cantidadActual = round2(cantidadAnterior + cantidad);
  const saldoActual = round2(saldoAnterior + neto);
  const promedioActual = calcularPromedio(cantidadActual, saldoActual);

  return {
    cantidadAnterior,
    saldoAnterior,
    promedioAnterior,
    cantidadActual,
    saldoActual,
    promedioActual: cantidadActual > 0 ? promedioActual : round4(costoUnitario),
    valorUnitario: round4(costoUnitario),
    total: neto,
    entradas: cantidad,
    valorEntradas: neto,
  };
}

/**
 * Procesa una venta y retorna el nuevo estado del inventario.
 * Lanza error si no hay stock suficiente.
 */
export function procesarVenta(
  estado: EstadoInventario,
  cantidad: number,
  precioVenta: number,
): ResultadoVenta {
  const cantidadAnterior = round2(estado.cantidad);
  const saldoAnterior = round2(estado.saldo);
  const promedioAnterior = calcularPromedio(cantidadAnterior, saldoAnterior);

  if (cantidad > cantidadAnterior) {
    throw new Error(
      `Stock insuficiente: solicitado ${cantidad}, disponible ${cantidadAnterior}`,
    );
  }

  const costoUnitario = round2(promedioAnterior);
  const costoTotal = round2(cantidad * costoUnitario);

  const cantidadActual = round2(cantidadAnterior - cantidad);
  const saldoActual = round2(saldoAnterior - costoTotal);
  const promedioActual = calcularPromedio(cantidadActual, saldoActual);

  return {
    cantidadAnterior,
    saldoAnterior,
    promedioAnterior,
    costoUnitario,
    costoTotal,
    cantidadActual,
    saldoActual,
    promedioActual,
    valorUnitario: round4(costoUnitario),
    total: costoTotal,
    salidas: cantidad,
    valorSalidas: costoTotal,
    precioVenta: round4(precioVenta),
  };
}

/**
 * Procesa una secuencia completa de movimientos y retorna el estado final.
 * Útil para tests de integración del algoritmo.
 */
export interface Movimiento {
  tipo: 'compra' | 'venta';
  cantidad: number;
  valorUnitario: number; // costo (compra) o precio (venta)
  descuentoPct?: number;
}

export function procesarSecuencia(movimientos: Movimiento[]): EstadoInventario {
  let estado: EstadoInventario = { cantidad: 0, saldo: 0 };

  for (const m of movimientos) {
    if (m.tipo === 'compra') {
      const r = procesarCompra(estado, m.cantidad, m.valorUnitario, m.descuentoPct);
      estado = { cantidad: r.cantidadActual, saldo: r.saldoActual };
    } else {
      const r = procesarVenta(estado, m.cantidad, m.valorUnitario);
      estado = { cantidad: r.cantidadActual, saldo: r.saldoActual };
    }
  }

  return estado;
}
