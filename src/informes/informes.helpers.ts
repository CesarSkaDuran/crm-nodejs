/**
 * Funciones utilitarias puras para el módulo de Informes Contables.
 *
 * Estas funciones no dependen de ningún servicio, repositorio ni estado:
 * son funciones puras que reciben entradas y devuelven salidas deterministas.
 * Esto permite testearlas de forma aislada y reutilizarlas en otros módulos.
 */

/**
 * Redondea un número a 2 decimales.
 *
 * REGLA DE PRECISIÓN NUMÉRICA:
 *   Esta función debe aplicarse SOLO al presentar el resultado final
 *   (saldo_final, totales de balanceGeneral, KPIs de pyg), NUNCA
 *   dentro de un acumulador intermedio como saldoPorCuenta en modo
 *   'detallado' o saldoConsolidado en modo 'resumido'. Redondear en
 *   cada paso de una acumulación larga introduce error de redondeo
 *   compuesto y rompe la exactitud centavo a centavo del saldo corrido.
 *
 * @param x - Número a redondear
 * @returns Número redondeado a 2 decimales
 */
export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Construye el filtro SQL de fechas y el array de parámetros asociado.
 *
 * TypeORM's `lineRepo.query()` para SQL raw NO soporta parámetros nombrados
 * (`:param`); solo soporta marcadores posicionales (`?`). Este helper mitiga
 * el riesgo real de mantenibilidad: si alguien agrega o quita un filtro,
 * el string SQL y el array de parámetros se construyen juntos en un solo
 * lugar, evitando desincronización.
 *
 * @param date - Fecha inicial (inclusive)
 * @param date2 - Fecha final (inclusive)
 * @param campoFecha - Nombre de la columna de fecha en SQL (default 'c.fecha')
 * @returns { sql: string; params: (string | number)[] }
 */
export function construirFiltroFechas(
  date?: string,
  date2?: string,
  campoFecha: string = 'c.fecha',
): { sql: string; params: (string | number)[] } {
  const params: (string | number)[] = [];
  let sql = '';
  if (date) {
    sql += ` AND ${campoFecha} >= ? `;
    params.push(date);
  }
  if (date2) {
    sql += ` AND ${campoFecha} <= ? `;
    params.push(date2);
  }
  return { sql, params };
}

/**
 * Construye el filtro SQL de corte para reportes de saldo acumulado
 * (Balance General).
 *
 * A diferencia de construirFiltroFechas, que genera un rango [date, date2]
 * para reportes de flujo, esta función genera SOLO un límite superior
 * `c.fecha <= date2`, que es la semántica correcta de un saldo acumulado
 * a una fecha de corte. No incluye límite inferior porque un balance
 * general debe reflejar TODO el histórico hasta la fecha de corte,
 * no solo los movimientos de un periodo.
 *
 * @param date2 - Fecha de corte (inclusive)
 * @param campoFecha - Nombre de la columna de fecha en SQL (default 'c.fecha')
 * @returns { sql: string; params: (string | number)[] }
 */
export function construirFiltroFechaCorte(
  date2?: string,
  campoFecha: string = 'c.fecha',
): { sql: string; params: (string | number)[] } {
  const params: (string | number)[] = [];
  let sql = '';
  if (date2) {
    sql += ` AND ${campoFecha} <= ? `;
    params.push(date2);
  }
  return { sql, params };
}

/**
 * Normaliza un código de cuenta removiendo puntos y ceros innecesarios.
 * Ej: '1.1.05' -> '1105', '1.1.05.05' -> '110505'
 * Esto permite comparar códigos con/sin puntos de forma consistente.
 */
export function normalizarCodigo(codigo: string | null | undefined): string {
  if (!codigo) return '';
  return codigo.replace(/\./g, '');
}

/**
 * Calcula el saldo según la naturaleza contable de la cuenta.
 * - Naturaleza Débito (D): Activos, Costos, Gastos -> Saldo = Débito - Crédito
 * - Naturaleza Crédito (C): Pasivos, Patrimonio, Ingresos -> Saldo = Crédito - Débito
 *
 * @param debito - Monto total de débitos
 * @param credito - Monto total de créditos
 * @param naturaleza - 'D' para naturaleza Débito, 'C' para naturaleza Crédito
 * @returns Saldo calculado según la naturaleza
 */
export function saldoPorNaturaleza(
  debito: number,
  credito: number,
  naturaleza: string,
): number {
  return naturaleza === 'C' ? credito - debito : debito - credito;
}

/**
 * Determina si un saldo es anómalo para una cuenta dada.
 * - Cuenta de naturaleza Débito con saldo negativo (ej: caja negativa, banco sobregirado)
 * - Cuenta de naturaleza Crédito con saldo negativo (ej: pasivo negativo)
 *
 * NOTA: El parámetro `naturaleza` se recibe pero no se usa en la lógica actual
 * porque el criterio de "anómalo" es simplemente saldo < 0 independientemente
 * de la naturaleza. Se conserva en la firma para:
 *   1) Mantener compatibilidad con los callers existentes
 *   2) Permitir futura lógica diferenciada (ej: marcar como anómalo solo
 *      cuentas de naturaleza D con saldo negativo, pero no cuentas de
 *      naturaleza C con saldo negativo que podrían ser anticipos válidos)
 *
 * @param saldo - Saldo de la cuenta
 * @param _naturaleza - Naturaleza de la cuenta (no usada actualmente, ver NOTA)
 * @returns true si el saldo es anómalo (negativo y distinto de 0)
 */
export function esSaldoAnomalo(saldo: number, _naturaleza: string): boolean {
  return Math.abs(saldo) > 0.009 && saldo < 0;
}

/**
 * Compara dos códigos de cuenta jerárquicamente por sus segmentos numéricos.
 *
 * A diferencia de localeCompare (lexicográfico), este método descompone
 * el código en segmentos separados por puntos y compara número por número:
 *
 *   "1.2"    -> [1, 2]     va ANTES que
 *   "1.10"   -> [1, 10]    (porque 2 < 10)
 *
 *   "1.1.05" -> [1, 1, 5]  va ANTES que
 *   "1.1.10" -> [1, 1, 10] (porque 5 < 10)
 *
 * Esto garantiza que el orden respete la jerarquía PUC:
 *   1 → 1.1 → 1.1.05 → 1.1.05.05 → 1.2 → 1.10 → 2 → 2.1 → ...
 *
 * @param a - Primer código de cuenta
 * @param b - Segundo código de cuenta
 * @returns negativo si a < b, 0 si son iguales, positivo si a > b
 */
export function compararCodigoJerarquico(a: string, b: string): number {
  const segA = (a || '').split('.').map((s) => parseInt(s, 10) || 0);
  const segB = (b || '').split('.').map((s) => parseInt(s, 10) || 0);
  const maxLen = Math.max(segA.length, segB.length);
  for (let i = 0; i < maxLen; i++) {
    const valA = segA[i] ?? 0;
    const valB = segB[i] ?? 0;
    if (valA !== valB) return valA - valB;
  }
  return 0;
}

/**
 * Calcula el nivel jerárquico de una cuenta basándose en su código.
 *
 * El nivel se determina por la cantidad de segmentos separados por puntos:
 *   "1"          -> nivel 1  (Clase: Activo, Pasivo, Patrimonio)
 *   "1.1"        -> nivel 2  (Grupo: Disponible, Inversiones, etc.)
 *   "1.1.05"     -> nivel 3  (Cuenta: Caja, Bancos, etc.)
 *   "1.1.05.05"  -> nivel 4  (Auxiliar: Caja General, Moneda Nacional, etc.)
 *
 * El frontend usa este nivel para aplicar padding-left dinámico y
 * representar visualmente la jerarquía como un árbol.
 *
 * @param codigo - Código de la cuenta (ej: "1.1.05.05")
 * @returns Nivel jerárquico (1-4)
 */
export function calcularNivel(codigo: string | null | undefined): number {
  if (!codigo) return 1;
  const segmentos = codigo.split('.').filter((s) => s.length > 0);
  return Math.max(1, segmentos.length);
}

/**
 * Determina si el saldo de una cuenta va "en contra" de su naturaleza.
 *
 * Esto es más específico que esSaldoAnomalo: identifica cuando una cuenta
 * de Activo (naturaleza D) tiene saldo Crédito (negativo) o cuando una
 * cuenta de Pasivo/Patrimonio (naturaleza C) tiene saldo Débito (negativo).
 *
 * Casos típicos que activan este flag:
 *   - Caja o Bancos con saldo negativo (sobregiro)
 *   - Proveedores con saldo débito (anticipos a proveedores)
 *   - IVA Descontable con saldo crédito (devoluciones)
 *
 * El frontend usa este flag para mostrar un badge de advertencia rojo.
 *
 * NOTA: El parámetro `naturaleza` se recibe pero no se usa en la lógica actual
 * porque el criterio de "saldo contrario" es simplemente saldo < 0, lo cual
 * es contrario tanto para naturaleza D (saldo Crédito) como para naturaleza C
 * (saldo Débito). Se conserva en la firma para:
 *   1) Mantener compatibilidad con los callers existentes
 *   2) Documentar semánticamente que el concepto depende de la naturaleza
 *   3) Permitir futura lógica diferenciada si se requiere distinguir
 *      entre "saldo contrario aceptable" y "saldo contrario anómalo"
 *
 * @param saldo - Saldo de la cuenta
 * @param _naturaleza - Naturaleza de la cuenta (no usada actualmente, ver NOTA)
 * @returns true si el saldo es contrario a la naturaleza de la cuenta
 */
export function esSaldoContrario(saldo: number, _naturaleza: string): boolean {
  if (Math.abs(saldo) < 0.009) return false;
  // Naturaleza D con saldo negativo = saldo Crédito (contrario)
  // Naturaleza C con saldo negativo = saldo Débito (contrario)
  return saldo < 0;
}
