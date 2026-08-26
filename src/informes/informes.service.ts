import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';

/**
 * Normaliza un código de cuenta removiendo puntos y ceros innecesarios.
 * Ej: '1.1.05' -> '1105', '1.1.05.05' -> '110505'
 * Esto permite comparar códigos con/sin puntos de forma consistente.
 */
function normalizarCodigo(codigo: string | null | undefined): string {
  if (!codigo) return '';
  return codigo.replace(/\./g, '');
}

/**
 * Calcula el saldo según la naturaleza contable de la cuenta.
 * - Naturaleza Débito (D): Activos, Costos, Gastos -> Saldo = Débito - Crédito
 * - Naturaleza Crédito (C): Pasivos, Patrimonio, Ingresos -> Saldo = Crédito - Débito
 */
function saldoPorNaturaleza(
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
 */
function esSaldoAnomalo(saldo: number, naturaleza: string): boolean {
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
 * Retorna: negativo si a < b, 0 si son iguales, positivo si a > b
 */
function compararCodigoJerarquico(a: string, b: string): number {
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
 */
function calcularNivel(codigo: string | null | undefined): number {
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
 */
function esSaldoContrario(saldo: number, naturaleza: string): boolean {
  if (Math.abs(saldo) < 0.009) return false;
  // Naturaleza D con saldo negativo = saldo Crédito (contrario)
  // Naturaleza C con saldo negativo = saldo Débito (contrario)
  return saldo < 0;
}

@Injectable()
export class InformesService {
  constructor(
    @InjectRepository(AccountingEntryLine)
    private readonly lineRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  // ===========================================================================
  // LIBROS AUXILIARES
  // ===========================================================================

  async libroMayor(query: any, empresaId: number) {
    const { cuenta_id, modo = 'detallado' } = query;

    if (!cuenta_id) {
      throw new NotFoundException('Debe seleccionar una cuenta');
    }

    const cuenta = await this.accountRepo.findOne({
      where: { id: Number(cuenta_id), empresa_id: empresaId },
    });

    if (!cuenta) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    return this.buildLibro(query, empresaId, cuenta, modo);
  }

  async libroRango(query: any, empresaId: number) {
    const { desde_id, hasta_id, modo = 'detallado' } = query;

    if (!desde_id || !hasta_id) {
      throw new NotFoundException('Debe seleccionar cuenta inicial y final');
    }

    const [desde, hasta] = await Promise.all([
      this.accountRepo.findOne({ where: { id: Number(desde_id), empresa_id: empresaId } }),
      this.accountRepo.findOne({ where: { id: Number(hasta_id), empresa_id: empresaId } }),
    ]);

    if (!desde || !hasta) {
      throw new NotFoundException('Cuentas no encontradas');
    }

    return this.buildLibro(
      { ...query, range: [desde.codigo, hasta.codigo] },
      empresaId,
      desde,
      modo,
    );
  }

  async libroTerceros(query: any, empresaId: number) {
    const { tercero_id, cuenta_id, modo = 'detallado' } = query;

    if (!tercero_id) {
      throw new NotFoundException('Debe seleccionar un tercero');
    }
    if (!cuenta_id) {
      throw new NotFoundException('Debe seleccionar una cuenta');
    }

    const cuenta = await this.accountRepo.findOne({
      where: { id: Number(cuenta_id), empresa_id: empresaId },
    });

    if (!cuenta) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    return this.buildLibro(
      { ...query, tercero_id: Number(tercero_id) },
      empresaId,
      cuenta,
      modo,
    );
  }

  /**
   * Construye el libro auxiliar aplicando jerarquía PUC y naturaleza contable.
   *
   * Reglas:
   * 1. Las cuentas de nivel superior (clasificacion 1=clase, 2=grupo, 3=cuenta)
   *    NO deben tener asientos directos. Su saldo es la suma recursiva de hijas.
   * 2. El saldo se calcula según naturaleza: D -> Deb-Cre, C -> Cre-Deb
   * 3. Los totales suman solo movimientos directos (sin duplicación jerárquica)
   * 4. Se marca `saldo_anomalo` para que el frontend aplique estilos visuales
   */
  private async buildLibro(query: any, empresaId: number, cuentaRef: Account, modo: string) {
    const { date, date2, range, tercero_id } = query;
    const cuenta = cuentaRef;

    // --- 1. Cargar todas las cuentas del rango/jerarquía ---
    const qb = this.accountRepo
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .addSelect('a.codigo', 'codigo')
      .addSelect('a.nombre', 'nombre')
      .addSelect('a.naturaleza', 'naturaleza')
      .addSelect('a.clasificacion', 'clasificacion')
      .addSelect('a.cuenta_padre_id', 'cuenta_padre_id')
      .where('a.empresa_id = :empresaId', { empresaId });

    if (range) {
      qb.andWhere('a.codigo BETWEEN :desde AND :hasta', { desde: range[0], hasta: range[1] });
    } else {
      qb.andWhere('a.codigo LIKE :codigo', { codigo: `${cuenta.codigo}%` });
    }

    const todasCuentas = await qb.getRawMany();
    const ids = todasCuentas.map((c) => c.id);

    if (ids.length === 0) {
      return {
        cuenta,
        modo,
        data: [],
        total: 0,
        total_debito: 0,
        total_credito: 0,
        saldo_final: 0,
      };
    }

    // --- 2. Cargar movimientos detallados ---
    const lineQb = this.lineRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cuenta_contable', 'cuenta')
      .leftJoinAndSelect('c.tercero', 'tercero')
      .where('c.empresa_id = :empresaId', { empresaId })
      .andWhere('c.cuenta_contable_id IN (:...ids)', { ids })
      .orderBy('c.fecha', 'ASC')
      .addOrderBy('c.id', 'ASC');

    if (date) {
      lineQb.andWhere('c.fecha >= :date', { date });
    }
    if (date2) {
      lineQb.andWhere('c.fecha <= :date2', { date2 });
    }
    if (tercero_id) {
      lineQb.andWhere('c.tercero_id = :tercero_id', { tercero_id });
    }

    const [data, total] = await lineQb.getManyAndCount();

    // --- 3. Construir mapa de cuentas con normalización de códigos ---
    const cuentasMap = new Map<number, any>();
    for (const c of todasCuentas) {
      cuentasMap.set(c.id, {
        id: c.id,
        codigo: c.codigo,
        codigoNorm: normalizarCodigo(c.codigo),
        nombre: c.nombre,
        naturaleza: c.naturaleza,
        clasificacion: Number(c.clasificacion ?? 4),
        cuenta_padre_id: c.cuenta_padre_id,
        esPadre: false,
        tieneMovimientos: false,
        debito: 0,
        credito: 0,
        saldoDirecto: 0,
        saldoConsolidado: 0,
      });
    }

    // Marcar cuentas padre: tienen hijas (vía cuenta_padre_id o por prefijo de código)
    for (const c of todasCuentas) {
      const cuenta = cuentasMap.get(c.id);
      if (!cuenta) continue;
      // Es padre si alguna otra cuenta lo tiene como cuenta_padre_id
      for (const otra of todasCuentas) {
        if (otra.id !== c.id && otra.cuenta_padre_id === c.id) {
          cuenta.esPadre = true;
          break;
        }
      }
      // Fallback: si no se marcó por cuenta_padre_id, marcar por prefijo de código
      if (!cuenta.esPadre) {
        const codigoPunto = (c.codigo || '') + '.';
        for (const otra of todasCuentas) {
          if (otra.id !== c.id && (otra.codigo || '').startsWith(codigoPunto)) {
            cuenta.esPadre = true;
            break;
          }
        }
      }
    }

    // --- 4. Sumar movimientos directos por cuenta ---
    for (const row of data) {
      const item = cuentasMap.get(row.cuenta_contable_id);
      if (item) {
        item.debito += Number(row.debito);
        item.credito += Number(row.credito);
        item.tieneMovimientos = true;
      }
    }

    // Calcular saldoDirecto con naturaleza contable
    for (const c of cuentasMap.values()) {
      c.saldoDirecto = saldoPorNaturaleza(c.debito, c.credito, c.naturaleza);
    }

    // --- 5. Calcular saldo consolidado recursivamente (propios + hijos) ---
    // Construir índice de hijos directos por cuenta_padre_id
    const hijosPorPadre = new Map<number, number[]>();
    for (const c of todasCuentas) {
      if (c.cuenta_padre_id) {
        const arr = hijosPorPadre.get(c.cuenta_padre_id) || [];
        arr.push(c.id);
        hijosPorPadre.set(c.cuenta_padre_id, arr);
      }
    }

    // Fallback: si no hay cuenta_padre_id, inferir hijos por prefijo de código
    if ([...hijosPorPadre.values()].every((arr) => arr.length === 0)) {
      hijosPorPadre.clear();
      for (const c of todasCuentas) {
        const codigoPunto = (c.codigo || '') + '.';
        for (const otra of todasCuentas) {
          if (otra.id !== c.id && (otra.codigo || '').startsWith(codigoPunto)) {
            // Verificar que sea hijo directo (no nieto)
            const resto = (otra.codigo || '').substring(codigoPunto.length);
            if (!resto.includes('.')) {
              const arr = hijosPorPadre.get(c.id) || [];
              arr.push(otra.id);
              hijosPorPadre.set(c.id, arr);
            }
          }
        }
      }
    }

    const calcularConsolidado = (cuentaId: number, visitados: Set<number>): number => {
      if (visitados.has(cuentaId)) return 0; // Evitar ciclos
      visitados.add(cuentaId);
      const c = cuentasMap.get(cuentaId);
      if (!c) return 0;

      let saldoHijos = 0;
      const hijos = hijosPorPadre.get(cuentaId) || [];
      for (const hijoId of hijos) {
        saldoHijos += calcularConsolidado(hijoId, visitados);
      }
      c.saldoConsolidado = c.saldoDirecto + saldoHijos;
      return c.saldoConsolidado;
    };

    for (const c of todasCuentas) {
      calcularConsolidado(c.id, new Set());
    }

    // --- 6. Totales: sumar SOLO movimientos directos (sin duplicar jerarquía) ---
    let totalDebito = 0;
    let totalCredito = 0;
    for (const c of cuentasMap.values()) {
      if (c.tieneMovimientos) {
        totalDebito += c.debito;
        totalCredito += c.credito;
      }
    }

    // --- 7. Construir resultado según modo ---
    let resultado: any[] = [];
    let saldo = 0;

    if (modo === 'detallado') {
      // Detallado: muestra cada línea con saldo acumulado según naturaleza
      for (const row of data) {
        const cuenta = cuentasMap.get(row.cuenta_contable_id);
        const nat = cuenta?.naturaleza || row.cuenta_contable?.naturaleza || 'D';
        const valor = saldoPorNaturaleza(Number(row.debito), Number(row.credito), nat);
        saldo += valor;
        resultado.push({
          ...row,
          valor,
          saldo,
          saldo_anomalo: esSaldoAnomalo(saldo, nat),
        });
      }
    } else if (modo === 'resumido') {
      // Resumido: agrupado por cuenta, muestra saldo consolidado
      resultado = todasCuentas
        .filter((c) => cuentasMap.get(c.id)?.tieneMovimientos)
        .map((c) => {
          const cuenta = cuentasMap.get(c.id);
          return {
            cuenta: {
              id: c.id,
              codigo: c.codigo,
              nombre: c.nombre,
              naturaleza: c.naturaleza,
              clasificacion: cuenta.clasificacion,
            },
            debito: cuenta.debito,
            credito: cuenta.credito,
            saldo: cuenta.saldoConsolidado,
            saldoDirecto: cuenta.saldoDirecto,
            esPadre: cuenta.esPadre,
            saldo_anomalo: esSaldoAnomalo(cuenta.saldoConsolidado, c.naturaleza),
          };
        })
        .sort((a, b) =>
          normalizarCodigo(a.cuenta.codigo).localeCompare(
            normalizarCodigo(b.cuenta.codigo),
            undefined,
            { numeric: true },
          ),
        );
    } else if (modo === 'porComprobante') {
      const map = new Map<string, any>();
      for (const row of data) {
        const con = row.consecutivo || 'S/N';
        if (!map.has(con)) {
          map.set(con, {
            consecutivo: con,
            fecha: row.fecha,
            debito: 0,
            credito: 0,
          });
        }
        const item = map.get(con);
        item.debito += Number(row.debito);
        item.credito += Number(row.credito);
      }
      resultado = Array.from(map.values()).map((x: any) => ({
        ...x,
        saldo: x.debito - x.credito,
      }));
    } else if (modo === 'discriminado') {
      const map = new Map<number | string, any>();
      for (const row of data) {
        const key = row.tercero_id ?? 'SIN_TERCERO';
        if (!map.has(key)) {
          map.set(key, {
            tercero: row.tercero ?? { nombre: 'Sin tercero' },
            debito: 0,
            credito: 0,
          });
        }
        const item = map.get(key);
        item.debito += Number(row.debito);
        item.credito += Number(row.credito);
      }
      resultado = Array.from(map.values()).map((x: any) => ({
        ...x,
        saldo: x.debito - x.credito,
      }));
    }

    // --- 8. Saldo final consolidado según naturaleza de la cuenta raíz ---
    const cuentaRaiz = cuentasMap.get(cuenta.id);
    const saldoFinal = cuentaRaiz
      ? cuentaRaiz.saldoConsolidado
      : saldoPorNaturaleza(totalDebito, totalCredito, cuenta.naturaleza);

    return {
      cuenta,
      modo,
      data: resultado,
      total,
      total_debito: totalDebito,
      total_credito: totalCredito,
      saldo_final: saldoFinal,
    };
  }

  // ===========================================================================
  // BALANCE GENERAL
  // ===========================================================================

  /**
   * Balance General con jerarquía PUC, naturaleza contable y Resultado del Ejercicio.
   *
   * PROBLEMAS CORREGIDOS:
   *
   * 1. Resultado del Ejercicio NO incluido:
   *    Antes el balance no cuadraba porque la utilidad/pérdida del periodo
   *    (Ingresos - Costos - Gastos) no se integraba al Patrimonio (Clase 3).
   *    Ahora se calcula dinámicamente y se inyecta como una cuenta virtual
   *    "Resultado del Ejercicio" dentro de la Clase 3, garantizando:
   *        Activo = Pasivo + Patrimonio
   *
   * 2. Cuentas padre con débito/crédito en 0.00:
   *    Antes los padres solo tenían saldoConsolidado pero débito/crédito en 0.
   *    Ahora la recursión propaga TAMBIÉN los totales de débito y crédito
   *    de todos los hijos (directos e indirectos) al padre, de modo que
   *    cada cuenta padre muestra la suma agregada de movimientos de su subárbol.
   *
   * 3. Ordenamiento mezclando niveles jerárquicos:
   *    Antes se usaba localeCompare sobre el código normalizado, lo que
   *    producía orden lexicográfico: "1.10" < "1.2" (incorrecto).
   *    Ahora se ordena por los segmentos numéricos del código:
   *    [1, 10] > [1, 2], de modo que 1.2 va antes que 1.10.
   *
   * Reglas de saldo por naturaleza:
   *   - Clases 1, 5, 6, 7 (naturaleza Débito):  Saldo = Débito - Crédito
   *   - Clases 2, 3, 4    (naturaleza Crédito): Saldo = Crédito - Débito
   */
  async balanceGeneral(query: any, empresaId: number) {
    const { date, date2 } = query;

    // =========================================================================
    // 1. Cargar plan de cuentas: clases 1 (Activo), 2 (Pasivo), 3 (Patrimonio)
    // =========================================================================
    const todasCuentas = await this.accountRepo
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .addSelect('a.codigo', 'codigo')
      .addSelect('a.nombre', 'nombre')
      .addSelect('a.clase', 'clase')
      .addSelect('a.naturaleza', 'naturaleza')
      .addSelect('a.clasificacion', 'clasificacion')
      .addSelect('a.cuenta_padre_id', 'cuenta_padre_id')
      .where('a.empresa_id = :empresaId', { empresaId })
      .andWhere('(a.clase = :c1 OR a.clase = :c2 OR a.clase = :c3)', {
        c1: '1',
        c2: '2',
        c3: '3',
      })
      .orderBy('a.codigo', 'ASC')
      .getRawMany();

    if (todasCuentas.length === 0) {
      return {
        data: [],
        totales: { activo: 0, pasivo: 0, patrimonio: 0, pasivo_mas_patrimonio: 0, resultado_ejercicio: 0 },
        total_debito: 0,
        total_credito: 0,
        saldo_final: 0,
      };
    }

    // =========================================================================
    // 2. Agregación SQL de movimientos por cuenta (solo auxiliares tienen movs)
    // =========================================================================
    const params: any[] = [empresaId];
    let dateFilter = '';
    if (date) {
      dateFilter += ' AND c.fecha >= ? ';
      params.push(date);
    }
    if (date2) {
      dateFilter += ' AND c.fecha <= ? ';
      params.push(date2);
    }

    const movimientosRaw = await this.lineRepo.query(
      `
      SELECT
        c.cuenta_contable_id AS id,
        CAST(COALESCE(SUM(c.debito), 0)  AS DECIMAL(15,2)) AS debito,
        CAST(COALESCE(SUM(c.credito), 0) AS DECIMAL(15,2)) AS credito
      FROM contabilidad c
      WHERE c.empresa_id = ? ${dateFilter}
      GROUP BY c.cuenta_contable_id
      `,
      params,
    );

    // =========================================================================
    // 3. Construir mapa de cuentas con débito/crédito directos
    // =========================================================================
    const cuentasMap = new Map<number, any>();
    for (const c of todasCuentas) {
      cuentasMap.set(c.id, {
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        clase: String(c.clase ?? '').trim(),
        naturaleza: c.naturaleza,
        clasificacion: Number(c.clasificacion ?? 4),
        cuenta_padre_id: c.cuenta_padre_id,
        esPadre: false,
        // Débito/crédito DIRECTOS (propios de la cuenta, no de hijas)
        debitoDirecto: 0,
        creditoDirecto: 0,
        // Débito/crédito AGREGADOS (propios + todos los hijos recursivamente)
        debito: 0,
        credito: 0,
        saldo: 0,
      });
    }

    // Aplicar movimientos directos a las cuentas que los tienen
    for (const m of movimientosRaw) {
      const cuenta = cuentasMap.get(Number(m.id));
      if (cuenta) {
        cuenta.debitoDirecto = Number(m.debito ?? 0);
        cuenta.creditoDirecto = Number(m.credito ?? 0);
      }
    }

    // =========================================================================
    // 4. Construir índice de hijos por padre
    // =========================================================================
    const hijosPorPadre = new Map<number, number[]>();
    for (const c of todasCuentas) {
      if (c.cuenta_padre_id) {
        const arr = hijosPorPadre.get(c.cuenta_padre_id) || [];
        arr.push(c.id);
        hijosPorPadre.set(c.cuenta_padre_id, arr);
        const padre = cuentasMap.get(c.cuenta_padre_id);
        if (padre) padre.esPadre = true;
      }
    }

    // Fallback: si no hay cuenta_padre_id, inferir hijos por prefijo de código
    if ([...hijosPorPadre.values()].every((arr) => arr.length === 0)) {
      hijosPorPadre.clear();
      for (const c of todasCuentas) {
        const codigoPunto = (c.codigo || '') + '.';
        for (const otra of todasCuentas) {
          if (otra.id !== c.id && (otra.codigo || '').startsWith(codigoPunto)) {
            const resto = (otra.codigo || '').substring(codigoPunto.length);
            if (!resto.includes('.')) {
              const arr = hijosPorPadre.get(c.id) || [];
              arr.push(otra.id);
              hijosPorPadre.set(c.id, arr);
              const padre = cuentasMap.get(c.id);
              if (padre) padre.esPadre = true;
            }
          }
        }
      }
    }

    // =========================================================================
    // 5. Agregación jerárquica recursiva
    //
    // Para cada cuenta, calcula:
    //   debito  = debitoDirecto  + SUM(debito  de todos los hijos recursivamente)
    //   credito = creditoDirecto + SUM(credito de todos los hijos recursivamente)
    //
    // Esto asegura que las cuentas padre muestren los totales agregados
    // de débito y crédito de todo su subárbol, no solo sus movimientos propios.
    //
    // El saldo se calcula al final aplicando la naturaleza contable:
    //   - Naturaleza D (clases 1, 5, 6, 7): Saldo = Débito - Crédito
    //   - Naturaleza C (clases 2, 3, 4):    Saldo = Crédito - Débito
    // =========================================================================
    const calcularAgregado = (cuentaId: number, visitados: Set<number>): { debito: number; credito: number } => {
      if (visitados.has(cuentaId)) return { debito: 0, credito: 0 };
      visitados.add(cuentaId);

      const c = cuentasMap.get(cuentaId);
      if (!c) return { debito: 0, credito: 0 };

      // Inicializar con los movimientos directos de esta cuenta
      let totalDebito = c.debitoDirecto;
      let totalCredito = c.creditoDirecto;

      // Sumar recursivamente los agregados de cada hijo directo
      const hijos = hijosPorPadre.get(cuentaId) || [];
      for (const hijoId of hijos) {
        const aggHijo = calcularAgregado(hijoId, visitados);
        totalDebito += aggHijo.debito;
        totalCredito += aggHijo.credito;
      }

      // Guardar los totales agregados en la cuenta
      c.debito = totalDebito;
      c.credito = totalCredito;

      // Calcular el saldo según la naturaleza contable de la cuenta
      c.saldo = saldoPorNaturaleza(totalDebito, totalCredito, c.naturaleza);

      return { debito: totalDebito, credito: totalCredito };
    };

    // Ejecutar la agregación para todas las cuentas (cada una con su propio Set de visitados)
    for (const c of todasCuentas) {
      calcularAgregado(c.id, new Set());
    }

    // =========================================================================
    // 6. Calcular Resultado del Ejercicio (Ingresos - Costos - Gastos)
    //
    // El balance general no incluye las clases 4, 5, 6 (cuentas nominales),
    // pero la utilidad/pérdida del periodo debe reflejarse en el Patrimonio
    // (Clase 3) para que la ecuación patrimonial se cumpla:
    //     Activo = Pasivo + Patrimonio
    // =========================================================================
    const resultadoEjercicio = await this.calcularResultadoEjercicio(empresaId, date, date2);

    // =========================================================================
    // 7. Inyectar el Resultado del Ejercicio como cuenta virtual en Clase 3
    //
    // Se crea una cuenta virtual con código "3.9.99" (convención contable para
    // resultado del ejercicio) que se suma al Patrimonio. Si el resultado es
    // positivo (utilidad), aumenta el patrimonio; si es negativo (pérdida),
    // lo disminuye.
    //
    // IMPORTANTE: La cuenta 3.9.99 debe colgar de un nodo raíz "3 PATRIMONIO"
    // para mantener la misma coherencia jerárquica que "1 ACTIVO" y "2 PASIVO".
    // Si el nodo "3" existe en la DB, se usa ese; si no, se crea virtualmente.
    // =========================================================================
    const ID_RESULTADO = -1; // ID virtual negativo para no colisionar con IDs reales

    // 7a. Buscar si ya existe una cuenta raíz "3" en el plan de cuentas
    let cuentaPatrimonioRaiz = null;
    for (const c of cuentasMap.values()) {
      if (c.clase === '3' && !c.cuenta_padre_id) {
        cuentaPatrimonioRaiz = c;
        break;
      }
    }

    // 7b. Si no existe el nodo "3 PATRIMONIO", crearlo virtualmente
    const ID_PATRIMONIO_RAIZ = -2; // ID virtual negativo para el nodo raíz
    if (!cuentaPatrimonioRaiz) {
      cuentaPatrimonioRaiz = {
        id: ID_PATRIMONIO_RAIZ,
        codigo: '3',
        nombre: 'PATRIMONIO',
        clase: '3',
        naturaleza: 'C',
        clasificacion: 1, // Clase
        cuenta_padre_id: null,
        esPadre: true,
        esVirtual: true,
        debitoDirecto: 0,
        creditoDirecto: 0,
        debito: 0,
        credito: 0,
        saldo: 0,
      };
      cuentasMap.set(ID_PATRIMONIO_RAIZ, cuentaPatrimonioRaiz);
    } else {
      // Si existe pero es virtual (ya creado arriba), no hacer nada
      // Si existe en DB, marcarlo como padre
      cuentaPatrimonioRaiz.esPadre = true;
    }

    // 7c. Crear la cuenta virtual del Resultado del Ejercicio como hija de "3"
    const cuentaResultado = {
      id: ID_RESULTADO,
      codigo: '3.9.99',
      nombre: resultadoEjercicio >= 0 ? 'UTILIDAD DEL EJERCICIO' : 'PERDIDA DEL EJERCICIO',
      clase: '3',
      naturaleza: 'C', // Patrimonio es naturaleza Crédito
      clasificacion: 4,
      cuenta_padre_id: cuentaPatrimonioRaiz.id, // Colgar del nodo "3 PATRIMONIO"
      esPadre: false,
      esVirtual: true, // Marca para el frontend
      debitoDirecto: resultadoEjercicio < 0 ? Math.abs(resultadoEjercicio) : 0,
      creditoDirecto: resultadoEjercicio >= 0 ? resultadoEjercicio : 0,
      debito: resultadoEjercicio < 0 ? Math.abs(resultadoEjercicio) : 0,
      credito: resultadoEjercicio >= 0 ? resultadoEjercicio : 0,
      saldo: resultadoEjercicio, // Positivo = utilidad, negativo = pérdida
    };
    cuentasMap.set(ID_RESULTADO, cuentaResultado);

    // 7d. Registrar la relación padre-hijo en hijosPorPadre para que la
    //     agregación recursiva encuentre a 3.9.99 como hija de "3 PATRIMONIO".
    //     Esto es crítico porque hijosPorPadre se construyó en el paso 4
    //     ANTES de inyectar las cuentas virtuales.
    {
      const arr = hijosPorPadre.get(cuentaPatrimonioRaiz.id) || [];
      arr.push(ID_RESULTADO);
      hijosPorPadre.set(cuentaPatrimonioRaiz.id, arr);
    }

    // 7e. Recalcular la agregación del nodo "3 PATRIMONIO" para que incluya
    //     el saldo de la cuenta virtual 3.9.99 (y cualquier otra hija real).
    //
    //     Esto es necesario porque la agregación recursiva del paso 5 se
    //     ejecutó ANTES de inyectar la cuenta virtual, por lo que el nodo "3"
    //     no tenía contemplado el resultado del ejercicio en sus totales.
    {
      const idRaiz = cuentaPatrimonioRaiz.id;
      const visitados = new Set<number>();
      const agg = calcularAgregado(idRaiz, visitados);
      cuentaPatrimonioRaiz.debito = agg.debito;
      cuentaPatrimonioRaiz.credito = agg.credito;
      cuentaPatrimonioRaiz.saldo = saldoPorNaturaleza(
        agg.debito,
        agg.credito,
        cuentaPatrimonioRaiz.naturaleza,
      );
    }

    // =========================================================================
    // 8. Calcular totales por clase
    // =========================================================================
    let totalDebitoGlobal = 0;
    let totalCreditoGlobal = 0;
    const totales = { activo: 0, pasivo: 0, patrimonio: 0 };

    // Sumar débitos/créditos de todas las cuentas (incluyendo la virtual)
    for (const c of cuentasMap.values()) {
      totalDebitoGlobal += c.debito;
      totalCreditoGlobal += c.credito;
    }

    // Sumar saldos consolidados de cuentas raíz de cada clase
    for (const c of cuentasMap.values()) {
      if (c.cuenta_padre_id) continue; // Solo cuentas raíz (sin padre)
      if (c.clase === '1') {
        totales.activo += c.saldo;
      } else if (c.clase === '2') {
        totales.pasivo += c.saldo;
      } else if (c.clase === '3') {
        totales.patrimonio += c.saldo;
      }
    }

    // =========================================================================
    // 9. Construir array de respuesta ordenado jerárquicamente por código
    //
    // El ordenamiento NO es lexicográfico simple. Se descompone el código en
    // segmentos numéricos y se compara segmento por segmento:
    //   "1.2"   -> [1, 2]     va ANTES
    //   "1.10"  -> [1, 10]    va DESPUÉS
    //
    // Esto garantiza que los niveles jerárquicos se respeten:
    //   1 → 1.1 → 1.1.05 → 1.1.05.05 → 1.2 → 1.10 → 2 → 2.1 → ...
    // =========================================================================
    const data = Array.from(cuentasMap.values())
      .map((c) => ({
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        clase: c.clase,
        naturaleza: c.naturaleza,
        clasificacion: c.clasificacion,
        nivel: calcularNivel(c.codigo),
        debito: c.debito,
        credito: c.credito,
        saldo: c.saldo,
        esPadre: c.esPadre,
        esVirtual: c.esVirtual ?? false,
        saldo_anomalo: esSaldoAnomalo(c.saldo, c.naturaleza),
        esSaldoContrario: esSaldoContrario(c.saldo, c.naturaleza),
      }))
      .filter((d) => d.debito !== 0 || d.credito !== 0 || d.saldo !== 0)
      .sort((a, b) => compararCodigoJerarquico(a.codigo, b.codigo));

    return {
      data,
      totales: {
        ...totales,
        resultado_ejercicio: resultadoEjercicio,
        pasivo_mas_patrimonio: totales.pasivo + totales.patrimonio,
      },
      total_debito: totalDebitoGlobal,
      total_credito: totalCreditoGlobal,
      // El saldo_final debe ser 0 si el balance cuadra correctamente
      saldo_final: totales.activo - (totales.pasivo + totales.patrimonio),
    };
  }

  /**
   * Calcula el Resultado del Ejercicio (Ingresos - Costos - Gastos).
   *
   * Usa las clases 4 (Ingresos, naturaleza C), 5 (Gastos, naturaleza D)
   * y 6 (Costos, naturaleza D). Solo se consideran cuentas auxiliares
   * (clasificacion = 4) para evitar duplicación jerárquica.
   *
   * Retorna un número: positivo = utilidad, negativo = pérdida.
   */
  private async calcularResultadoEjercicio(
    empresaId: number,
    date?: string,
    date2?: string,
  ): Promise<number> {
    const params: any[] = [empresaId, empresaId];
    let dateFilter = '';
    if (date) {
      dateFilter += ' AND c.fecha >= ? ';
      params.push(date);
    }
    if (date2) {
      dateFilter += ' AND c.fecha <= ? ';
      params.push(date2);
    }

    const rows = await this.lineRepo.query(
      `
      SELECT
        p.clase AS clase,
        p.naturaleza AS naturaleza,
        CAST(COALESCE(SUM(c.debito), 0)  AS DECIMAL(15,2)) AS debito,
        CAST(COALESCE(SUM(c.credito), 0) AS DECIMAL(15,2)) AS credito
      FROM contabilidad c
      INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
      WHERE c.empresa_id = ?
        AND p.empresa_id = ?
        AND p.clase IN ('4', '5', '6')
        AND p.clasificacion = 4
        ${dateFilter}
      GROUP BY p.clase, p.naturaleza
      `,
      params,
    );

    let ingresos = 0;
    let costos = 0;
    let gastos = 0;

    for (const row of rows) {
      const debito = Number(row.debito) || 0;
      const credito = Number(row.credito) || 0;
      const naturaleza = String(row.naturaleza || 'D').trim();
      const saldo = saldoPorNaturaleza(debito, credito, naturaleza);

      if (row.clase === '4') {
        ingresos += saldo;
      } else if (row.clase === '6') {
        costos += saldo;
      } else if (row.clase === '5') {
        gastos += saldo;
      }
    }

    return ingresos - costos - gastos;
  }

  // ===========================================================================
  // ESTADO DE RESULTADOS (P&G)
  // ===========================================================================

  /**
   * Estado de Resultados (Pérdidas y Ganancias).
   *
   * PROBLEMAS CORREGIDOS:
   * 1. Celdas CÓDIGO/NOMBRE vacías: ahora se hace un solo query SQL con JOIN
   *    explícito a plan_cuentas y se incluyen codigo/nombre en el SELECT.
   * 2. Triplicación de filas: antes se mostraban los 3 niveles jerárquicos
   *    (clase → grupo → auxiliar) con el MISMO saldo consolidado, por lo que
   *    cada valor aparecía 3 veces. Ahora el detalle solo incluye cuentas
   *    auxiliares (clasificacion = 4) que tienen movimientos reales.
   * 3. Naturaleza Crédito para Ingresos (clase 4): el saldo se calcula como
   *    Crédito - Débito, manejando devoluciones (débitos) sin romper jerarquía.
   *
   * Estructura JSON de respuesta:
   *   {
   *     totalIngresos, totalCostos, totalGastos, utilidadPerdida  // KPIs
   *     detalle: [{ codigo, nombre, clase, debito, credito, saldo }]  // solo auxiliares
   *   }
   */
  async pyg(query: any, empresaId: number) {
    const { date, date2 } = query;

    // --- 1. Construir filtros de fecha ---
    // Nota: pasamos empresaId dos veces porque el SQL tiene dos ? (uno para
    // contabilidad.empresa_id y otro para plan_cuentas.empresa_id).
    const params: any[] = [empresaId, empresaId];
    let dateFilter = '';
    if (date) {
      dateFilter += ' AND c.fecha >= ? ';
      params.push(date);
    }
    if (date2) {
      dateFilter += ' AND c.fecha <= ? ';
      params.push(date2);
    }

    // --- 2. Query único con JOIN y GROUP BY ---
    //
    // El JOIN entre contabilidad (movimientos) y plan_cuentas (cuentas)
    // se hace por cuenta_contable_id = plan_cuentas.id.
    //
    // El GROUP BY por plan_cuentas.id evita la triplicación:
    // antes, al cargar cuentas y movimientos por separado y luego mapear
    // en memoria, cada nivel jerárquico (clase, grupo, auxiliar) recibía
    // el saldo consolidado de sus hijas, repitiendo el mismo valor N veces.
    //
    // Ahora, al filtrar solo clasificacion = 4 (auxiliares) y agrupar por
    // plan_cuentas.id, cada cuenta aparece exactamente una vez.
    const detalleRaw = await this.lineRepo.query(
      `
      SELECT
        p.id                    AS cuenta_id,
        p.codigo                AS codigo,
        p.nombre                AS nombre,
        p.clase                 AS clase,
        p.naturaleza            AS naturaleza,
        CAST(COALESCE(SUM(c.debito), 0)  AS DECIMAL(15,2)) AS debito,
        CAST(COALESCE(SUM(c.credito), 0) AS DECIMAL(15,2)) AS credito
      FROM contabilidad c
      INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
      WHERE c.empresa_id = ?
        AND p.empresa_id = ?
        AND p.clase IN ('4', '5', '6')
        AND p.clasificacion = 4
        ${dateFilter}
      GROUP BY p.id, p.codigo, p.nombre, p.clase, p.naturaleza
      ORDER BY p.codigo ASC
      `,
      params,
    );

    // --- 3. Mapear resultados a la estructura JSON limpia ---
    //
    // Cada fila del query ya trae codigo, nombre, clase, debito, credito.
    // El saldo se calcula según naturaleza contable:
    //   - Naturaleza C (Ingresos, clase 4): saldo = Crédito - Débito
    //     Esto maneja correctamente las devoluciones (débitos) restando
    //     del total de ingresos sin romper la jerarquía.
    //   - Naturaleza D (Gastos y Costos, clases 5 y 6): saldo = Débito - Crédito
    const detalle = detalleRaw.map((row: any) => {
      const debito = Number(row.debito) || 0;
      const credito = Number(row.credito) || 0;
      const naturaleza = String(row.naturaleza || 'D').trim();
      const saldo = saldoPorNaturaleza(debito, credito, naturaleza);

      return {
        cuenta_id: row.cuenta_id,
        codigo: row.codigo,
        nombre: row.nombre,
        clase: String(row.clase || '').trim(),
        naturaleza,
        nivel: calcularNivel(row.codigo),
        debito,
        credito,
        saldo,
        saldo_anomalo: esSaldoAnomalo(saldo, naturaleza),
        esSaldoContrario: esSaldoContrario(saldo, naturaleza),
      };
    });

    // --- 4. Calcular KPIs superiores ---
    //
    // Los totales se calculan sumando los saldos de las cuentas auxiliares
    // (no hay duplicación porque cada cuenta aparece una sola vez).
    //   - Ingresos (clase 4, nat C): saldo positivo = ingresos netos
    //   - Costos (clase 6, nat D):   saldo positivo = costos de ventas
    //   - Gastos (clase 5, nat D):   saldo positivo = gastos operativos
    //   - Utilidad/Pérdida = Ingresos - Costos - Gastos
    let totalIngresos = 0;
    let totalCostos = 0;
    let totalGastos = 0;

    for (const d of detalle) {
      if (d.clase === '4') {
        totalIngresos += d.saldo;
      } else if (d.clase === '6') {
        totalCostos += d.saldo;
      } else if (d.clase === '5') {
        totalGastos += d.saldo;
      }
    }

    const utilidadPerdida = totalIngresos - totalCostos - totalGastos;

    // --- 5. Retornar estructura JSON limpia ---
    return {
      totalIngresos,
      totalCostos,
      totalGastos,
      utilidadPerdida,
      detalle,
    };
  }
}
