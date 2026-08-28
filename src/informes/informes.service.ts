import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';

// Fase 2: Funciones utilitarias extraídas a informes.helpers.ts
import {
  round2,
  normalizarCodigo,
  saldoPorNaturaleza,
  esSaldoAnomalo,
  esSaldoContrario,
  compararCodigoJerarquico,
  calcularNivel,
  construirFiltroFechas,
  construirFiltroFechaCorte,
} from './informes.helpers';

// Fase 2: Interfaces y tipos extraídos a informes.interface.ts
import {
  ID_RESULTADO_EJERCICIO,
  ID_PATRIMONIO_RAIZ,
  ID_ACTIVO_RAIZ,
  ID_PASIVO_RAIZ,
  idRaizPyg,
  type CuentaRawResult,
  type BalanceMovimientoRawResult,
  type SaldoAnteriorRawResult,
  type ResultadoEjercicioRawResult,
  type PygDetalleRawResult,
  type PygFila,
  type CuentaMemoria,
  type LibroLineaResultado,
} from './informes.interface';

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

  /**
   * Genera el Libro Auxiliar (Libro Mayor) para una cuenta específica.
   *
   * @param query - Parámetros de consulta:
   *   - cuenta_id: ID de la cuenta a consultar (obligatorio)
   *   - modo: 'detallado' | 'resumido' | 'porComprobante' | 'discriminado'
   *   - date: fecha inicial (opcional, formato ISO)
   *   - date2: fecha final (opcional, formato ISO)
   *   - tercero_id: filtrar por tercero (opcional)
   * @param empresaId - ID de la empresa
   * @returns Estructura con cuenta, data (filas según modo), totales y saldo_final
   *
   * Lógica contable clave:
   *   - En modo 'detallado', el saldo se acumula POR CUENTA de forma
   *     independiente, no como un acumulado global. Esto evita que
   *     movimientos de cuentas distintas se mezclen.
   *   - El saldo se calcula según naturaleza: D -> Deb-Cre, C -> Cre-Deb
   */
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

  /**
   * Genera el Libro Auxiliar para un rango de cuentas (por código PUC).
   *
   * @param query - Parámetros: desde_id, hasta_id, modo, date, date2
   * @param empresaId - ID de la empresa
   * @returns Estructura del libro con todas las cuentas en el rango jerárquico
   *
   * Lógica contable clave:
   *   - El rango se filtra jerárquicamente (no lexicográficamente) usando
   *     compararCodigoJerarquico, para que "1.4.5" y "1.4.05" se comparen
   *     correctamente por segmentos numéricos.
   *   - Se generan LIKE prefixes para TODAS las clases entre la clase inicial
   *     y final, agrupadas con Brackets de TypeORM.
   */
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

  /**
   * Genera el Libro Auxiliar filtrado por tercero y cuenta.
   *
   * @param query - Parámetros: tercero_id, cuenta_id, modo, date, date2
   * @param empresaId - ID de la empresa
   * @returns Estructura del libro con movimientos del tercero en la cuenta
   */
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
    //
    // PROBLEMA CORREGIDO (Fix 1):
    //   Antes se usaba `a.codigo BETWEEN :desde AND :hasta` que compara
    //   strings lexicográficamente, no jerárquicamente. Esto falla con
    //   códigos como "1.4.5" vs "1.4.05" (string "1.4.5" > "1.4.05" pero
    //   jerárquicamente [1,4,5] > [1,4,5] son iguales).
    //
    //   Ahora se traen todas las cuentas de la empresa y se filtran en
    //   memoria usando compararCodigoJerarquico, que descompone el código
    //   en segmentos numéricos y compara número por número.
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
      // Fix 1: Traer todas las cuentas y filtrar por rango jerárquico en memoria.
      //
      // BUG CORREGIDO (Fase 1):
      //   Antes solo se generaba LIKE para las dos clases extremas
      //   (ej. '1%' OR '4%'), excluyendo silenciosamente las clases
      //   intermedias (2 y 3) cuando el rango las abarca.
      //
      //   Ahora se generan LIKE prefixes para TODAS las clases numéricas
      //   entre claseDesde y claseHasta inclusive, agrupadas con brackets
      //   de TypeORM para que el OR no interfiera con los AND existentes.
      //
      //   Manejo de casos borde:
      //   - Rango invertido (desde > hasta): se intercambian automáticamente.
      //   - Códigos mal formados (parseInt devuelve NaN): se trata como
      //     clase 0 y se incluye un LIKE del prefijo original como fallback.
      let claseDesdeNum = parseInt(range[0].split('.')[0], 10);
      let claseHastaNum = parseInt(range[1].split('.')[0], 10);

      // Manejar NaN: si alguno no parsea, usar el string completo como prefijo
      if (Number.isNaN(claseDesdeNum)) claseDesdeNum = 0;
      if (Number.isNaN(claseHastaNum)) claseHastaNum = 0;

      // Manejar rango invertido
      if (claseDesdeNum > claseHastaNum) {
        [claseDesdeNum, claseHastaNum] = [claseHastaNum, claseDesdeNum];
      }

      // Generar LIKE prefixes para todas las clases en el rango
      const clasesEnRango: number[] = [];
      for (let cl = claseDesdeNum; cl <= claseHastaNum; cl++) {
        clasesEnRango.push(cl);
      }

      // Construir la condición OR agrupada con brackets de TypeORM
      if (clasesEnRango.length === 1) {
        qb.andWhere('a.codigo LIKE :prefijoClase', {
          prefijoClase: `${clasesEnRango[0]}%`,
        });
      } else {
        qb.andWhere(
          new Brackets((subQb) => {
            clasesEnRango.forEach((cl, idx) => {
              const paramKey = `clase_${idx}`;
              if (idx === 0) {
                subQb.where('a.codigo LIKE :' + paramKey, {
                  [paramKey]: `${cl}%`,
                });
              } else {
                subQb.orWhere('a.codigo LIKE :' + paramKey, {
                  [paramKey]: `${cl}%`,
                });
              }
            });
          }),
        );
      }
    } else {
      qb.andWhere('a.codigo LIKE :codigo', { codigo: `${cuenta.codigo}%` });
    }

    let todasCuentas: CuentaRawResult[] = await qb.getRawMany();

    // Fix 1: Filtrar por rango jerárquico en memoria
    // Manejar rango invertido: si desde > hasta jerárquicamente, intercambiar
    if (range) {
      let [desde, hasta] = range;
      if (compararCodigoJerarquico(desde, hasta) > 0) {
        [desde, hasta] = [hasta, desde];
      }
      todasCuentas = todasCuentas.filter((c) => {
        const cmpDesde = compararCodigoJerarquico(c.codigo, desde);
        const cmpHasta = compararCodigoJerarquico(c.codigo, hasta);
        return cmpDesde >= 0 && cmpHasta <= 0;
      });
    }
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

    // --- 2b. Calcular saldo anterior por cuenta (movimientos antes de `date`) ---
    //
    // Prioridad 1: El Libro Auxiliar puede filtrar por un periodo [date, date2].
    // Cuando se aplica date (límite inferior), el saldo corrido por cuenta debe
    // arrancar desde el saldo acumulado ANTES de esa fecha, no desde cero.
    // Si no se provee `date`, no se ejecuta esta query y saldoAnterior = 0.
    //
    // Usamos un mapa auxiliar de naturalezas porque cuentasMap aún no está
    // construido en este punto (se construye en el paso 3).
    const naturalezaPorCuentaId = new Map<number, string>();
    for (const c of todasCuentas) {
      naturalezaPorCuentaId.set(c.id, c.naturaleza);
    }

    const saldosAnteriores = new Map<number, number>();
    if (date && ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const saldoAnteriorRaw: SaldoAnteriorRawResult[] = await this.lineRepo.query(
        `
        SELECT
          c.cuenta_contable_id AS id,
          CAST(COALESCE(SUM(c.debito), 0)  AS DECIMAL(15,2)) AS debito,
          CAST(COALESCE(SUM(c.credito), 0) AS DECIMAL(15,2)) AS credito
        FROM contabilidad c
        WHERE c.empresa_id = ?
          AND c.cuenta_contable_id IN (${placeholders})
          AND c.fecha < ?
        GROUP BY c.cuenta_contable_id
        `,
        [empresaId, ...ids, date],
      );

      for (const row of saldoAnteriorRaw) {
        const nat = naturalezaPorCuentaId.get(Number(row.id)) || 'D';
        saldosAnteriores.set(Number(row.id), saldoPorNaturaleza(Number(row.debito), Number(row.credito), nat));
      }
    }

    // --- 3. Construir mapa de cuentas con normalización de códigos ---
    const cuentasMap = new Map<number, CuentaMemoria>();
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
        saldo: 0,
        saldoAnterior: saldosAnteriores.get(c.id) ?? 0,
        saldoDirecto: 0,
        saldoConsolidado: 0,
      });
    }

    // Marcar cuentas padre: tienen hijas (vía cuenta_padre_id o por prefijo de código)
    //
    // Fix 7: Antes esto era O(n²) con dos bucles anidados recorriendo
    // todasCuentas por cada cuenta. Ahora se precomputa un Set de IDs
    // que son padres (tienen al menos una hija) en O(n), y luego se
    // marca esPadre en O(n).
    const idsConHijosPorPadreId = new Set<number>();
    for (const c of todasCuentas) {
      if (c.cuenta_padre_id) {
        idsConHijosPorPadreId.add(c.cuenta_padre_id);
      }
    }

    // Fallback por prefijo: si una cuenta no tiene hijas vía cuenta_padre_id,
    // verificar si alguna otra cuenta empieza con su código + "."
    for (const c of todasCuentas) {
      const cuenta = cuentasMap.get(c.id);
      if (!cuenta) continue;
      if (idsConHijosPorPadreId.has(c.id)) {
        cuenta.esPadre = true;
        continue;
      }
      // Fallback: marcar por prefijo de código
      const codigoPunto = (c.codigo || '') + '.';
      for (const otra of todasCuentas) {
        if (otra.id !== c.id && (otra.codigo || '').startsWith(codigoPunto)) {
          cuenta.esPadre = true;
          break;
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
    //
    // Fix 4: El fallback por prefijo de código ya no es "todo o nada".
    //   Antes solo se activaba si NINGUNA cuenta tenía cuenta_padre_id.
    //   Ahora, cuenta por cuenta, si cuenta_padre_id es null, se intenta
    //   resolver el padre por prefijo de código. Esto maneja catálogos
    //   mixtos donde algunas cuentas tienen padre asignado y otras no.
    const hijosPorPadre = new Map<number, number[]>();
    const cuentasSinPadreAsignado: CuentaRawResult[] = [];

    for (const c of todasCuentas) {
      if (c.cuenta_padre_id) {
        const arr = hijosPorPadre.get(c.cuenta_padre_id) || [];
        arr.push(c.id);
        hijosPorPadre.set(c.cuenta_padre_id, arr);
      } else {
        cuentasSinPadreAsignado.push(c);
      }
    }

    // Fix 4: Para cada cuenta sin cuenta_padre_id, inferir hijos por prefijo
    // de código. Solo se agregan hijos que tampoco tengan padre asignado
    // (para no duplicar relaciones ya existentes).
    for (const c of cuentasSinPadreAsignado) {
      const codigoPunto = (c.codigo || '') + '.';
      for (const otra of todasCuentas) {
        // Solo considerar como hija por prefijo si la otra cuenta tampoco
        // tiene cuenta_padre_id asignado (evita duplicar relaciones)
        if (otra.id !== c.id && !otra.cuenta_padre_id && (otra.codigo || '').startsWith(codigoPunto)) {
          // Verificar que sea hijo directo (no nieto)
          const resto = (otra.codigo || '').substring(codigoPunto.length);
          if (!resto.includes('.')) {
            const arr = hijosPorPadre.get(c.id) || [];
            // Evitar duplicados
            if (!arr.includes(otra.id)) {
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
      // Prioridad 1: el saldo consolidado incluye el saldo anterior (acumulado
      // antes del `date` del filtro) más el saldo directo del rango más el
      // saldo consolidado de las hijas.
      c.saldoConsolidado = c.saldoAnterior + c.saldoDirecto + saldoHijos;
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
    let resultado: LibroLineaResultado[] = [];
    let saldo = 0;

    if (modo === 'detallado') {
      // Detallado: muestra cada línea con saldo acumulado POR CUENTA.
      //
      // PROBLEMA CORREGIDO:
      //   Antes se usaba un único `saldo` global que acumulaba linealmente
      //   los movimientos de TODAS las cuentas mezcladas. Cuando el reporte
      //   incluía múltiples cuentas (ej. rango 1.1 a 1.4), los débitos de
      //   Caja se sumaban con los de Inventarios, distorsionando el saldo.
      //
      //   Ahora cada cuenta mantiene su propio saldo acumulado independiente:
      //     - Activo/Costos/Gastos (naturaleza D): Saldo += Débito - Crédito
      //     - Pasivo/Patrimonio/Ingresos (naturaleza C): Saldo += Crédito - Débito
      //
      //   Se incluye:
      //     - saldo: saldo acumulado de la cuenta corriente (para la fila)
      //     - saldo_cuenta: mismo saldo (alias semántico para claridad)
      //     - cuenta_str: string plano "código - nombre" para exportación
      //     - cuenta: objeto {id, codigo, nombre} para el frontend
      // Prioridad 1: el saldo corrido arranca desde el saldo acumulado antes
      // del `date` (si se provee). Si no hay `date`, saldosAnteriores estará
      // vacío y cada cuenta arranca en 0.
      const saldoPorCuenta = new Map<number, number>();
      for (const c of cuentasMap.values()) {
        saldoPorCuenta.set(c.id, c.saldoAnterior);
      }

      for (const row of data) {
        const cuenta = cuentasMap.get(row.cuenta_contable_id);
        const nat = cuenta?.naturaleza || row.cuenta_contable?.naturaleza || 'D';
        const debito = Number(row.debito);
        const credito = Number(row.credito);

        // Saldo acumulado POR CUENTA (independiente de otras cuentas)
        const saldoAnteriorCuenta = saldoPorCuenta.get(row.cuenta_contable_id) ?? 0;
        const valor = saldoPorNaturaleza(debito, credito, nat);
        const saldoCuenta = saldoAnteriorCuenta + valor;
        saldoPorCuenta.set(row.cuenta_contable_id, saldoCuenta);

        // Extraer nombre del tercero sin el objeto JSON completo
        const terceroObj = row.tercero;
        const terceroStr = terceroObj
          ? `${terceroObj.nombre || ''}${terceroObj.documento ? ' - ' + terceroObj.documento : ''}`.trim()
          : '';

        // Objeto cuenta para el frontend (row.cuenta.codigo, row.cuenta.nombre)
        const cuentaObj = row.cuenta_contable
          ? {
              id: row.cuenta_contable.id,
              codigo: row.cuenta_contable.codigo,
              nombre: row.cuenta_contable.nombre,
            }
          : cuenta
            ? { id: cuenta.id, codigo: cuenta.codigo, nombre: cuenta.nombre }
            : null;

        // String plano de cuenta para exportación Excel/PDF/Word
        const cuentaStr = cuentaObj
          ? `${cuentaObj.codigo} - ${cuentaObj.nombre}`
          : '';

        resultado.push({
          id: row.id,
          fecha: row.fecha,
          consecutivo: row.consecutivo,
          // Objeto para el frontend
          cuenta: cuentaObj,
          // String plano para exportación (evita [object Object] en Excel)
          cuenta_str: cuentaStr,
          // Aplanar tercero a string legible
          tercero: terceroStr || 'N/A',
          tercero_id: row.tercero_id,
          descripcion: row.descripcion || '',
          debito,
          credito,
          valor,
          // Saldo acumulado de ESTA cuenta (no global)
          saldo: saldoCuenta,
          saldo_cuenta: saldoCuenta,
          saldo_anomalo: esSaldoAnomalo(saldoCuenta, nat),
        });
      }
    } else if (modo === 'resumido') {
      // Resumido: agrupado por cuenta, muestra saldo consolidado
      //
      // Micro-corrección: una cuenta es relevante si tiene movimientos del
      // período OR si tiene saldoAnterior distinto de cero (saldo histórico
      // antes del `date` del filtro). Esto evita que una cuenta con saldo
      // acumulado pero sin movimientos en el período desaparezca del reporte.
      resultado = todasCuentas
        .filter((c) => {
          const cuenta = cuentasMap.get(c.id);
          if (!cuenta) return false;
          return cuenta.tieneMovimientos || (cuenta.saldoAnterior ?? 0) !== 0;
        })
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
          compararCodigoJerarquico(a.cuenta.codigo, b.cuenta.codigo),
        );
    } else if (modo === 'porComprobante') {
      // Fix 5: Usar saldoPorNaturaleza para consistencia con detallado/resumido.
      // Cada comprobante agrupa movimientos de una o varias cuentas; el saldo
      // se calcula según la naturaleza de la cuenta raíz del informe.
      const natRaiz = cuenta.naturaleza || 'D';
      const map = new Map<string, { consecutivo: string; fecha: string; debito: number; credito: number }>();
      for (const row of data) {
        const con = row.consecutivo || 'S/N';
        if (!map.has(con)) {
          map.set(con, {
            consecutivo: con,
            fecha: row.fecha ? new Date(row.fecha).toISOString().split('T')[0] : '',
            debito: 0,
            credito: 0,
          });
        }
        const item = map.get(con);
        item.debito += Number(row.debito);
        item.credito += Number(row.credito);
      }
      resultado = Array.from(map.values()).map((x) => ({
        ...x,
        saldo: saldoPorNaturaleza(x.debito, x.credito, natRaiz),
      }));
    } else if (modo === 'discriminado') {
      // Fix 5: Usar saldoPorNaturaleza para consistencia con detallado/resumido.
      const natRaiz = cuenta.naturaleza || 'D';
      const map = new Map<number | string, { tercero: string; tercero_id: number | null; debito: number; credito: number }>();
      for (const row of data) {
        const key = row.tercero_id ?? 'SIN_TERCERO';
        if (!map.has(key)) {
          // Aplanar tercero a string legible en lugar del objeto JSON crudo
          const terceroObj = row.tercero;
          const terceroStr = terceroObj
            ? `${terceroObj.nombre || ''}${terceroObj.documento ? ' - ' + terceroObj.documento : ''}`.trim()
            : 'Sin tercero';
          map.set(key, {
            tercero: terceroStr,
            tercero_id: row.tercero_id,
            debito: 0,
            credito: 0,
          });
        }
        const item = map.get(key);
        item.debito += Number(row.debito);
        item.credito += Number(row.credito);
      }
      resultado = Array.from(map.values()).map((x) => ({
        ...x,
        saldo: saldoPorNaturaleza(x.debito, x.credito, natRaiz),
      }));
    }

    // --- 8. Saldo final: suma de saldos finales por cuenta ---
    //
    // PROBLEMA CORREGIDO:
    //   Antes se usaba `cuentaRaiz.saldoConsolidado` que incluye la
    //   jerarquía recursiva (padres + hijos), lo que no coincide con
    //   la suma real de débitos/créditos del rango filtrado cuando hay
    //   cuentas de naturaleza mixta.
    //
    //   Ahora el saldo_final se calcula como la suma de los saldos
    //   finales de cada cuenta individual según su naturaleza:
    //     - Naturaleza D: saldo = débito - crédito
    //     - Naturaleza C: saldo = crédito - débito
    //
    //   Esto garantiza coherencia con los totales_debito y total_credito
    //   del encabezado: si todas las cuentas son de la misma naturaleza,
    //   saldo_final = |total_debito - total_credito| + saldo_inicial. Si son mixtas,
    //   saldo_final = suma de (saldo_inicial + saldo por naturaleza) de cada cuenta.
    //
    //   Prioridad 1: el saldo_final refleja el saldo final acumulado, incluyendo
    //   el saldo anterior (saldoAnterior) más los movimientos del rango.
    let saldoFinalCalculado = 0;
    for (const c of cuentasMap.values()) {
      // Micro-corrección: incluir también cuentas que NO tienen movimientos
      // en el período pero SÍ tienen saldoAnterior (saldo histórico antes
      // del `date`). Sin esto, una cuenta con saldo acumulado pero sin
      // movimientos en el rango aportaría 0 al saldo_final.
      if (c.tieneMovimientos || (c.saldoAnterior ?? 0) !== 0) {
        saldoFinalCalculado += c.saldoAnterior + saldoPorNaturaleza(c.debito, c.credito, c.naturaleza);
      }
    }

    // Redondear a 2 decimales para evitar errores de coma flotante
    const saldoFinal = round2(saldoFinalCalculado);

    // Metadata de saldos iniciales por cuenta (sin filas falsas en data)
    const saldosIniciales: Record<number, number> = {};
    for (const c of cuentasMap.values()) {
      if ((c.saldoAnterior ?? 0) !== 0) {
        saldosIniciales[c.id] = c.saldoAnterior;
      }
    }

    return {
      cuenta,
      modo,
      data: resultado,
      total,
      total_debito: totalDebito,
      total_credito: totalCredito,
      saldo_final: saldoFinal,
      saldos_iniciales: saldosIniciales,
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
  /**
   * Genera el Balance General con jerarquía PUC, naturaleza contable y
   * Resultado del Ejercicio inyectado como cuenta virtual.
   *
   * @param query - Parámetros: date (fecha inicial), date2 (fecha final)
   * @param empresaId - ID de la empresa
   * @returns Estructura con data (filas jerárquicas), totales y saldo_final
   *
   * Lógica contable clave:
   *   - Se inyecta la cuenta virtual "3.9.99 Resultado del Ejercicio" dentro
   *     del Patrimonio (Clase 3) para que la ecuación Activo = Pasivo +
   *     Patrimonio se cumpla. El resultado se calcula como
   *     Ingresos - Costos - Gastos (clases 4, 5, 6).
   *   - Se garantiza que existan nodos raíz virtuales para Activo (1),
   *     Pasivo (2) y Patrimonio (3) si no existen en el plan de cuentas.
   *   - El saldo se calcula según naturaleza: D -> Deb-Cre, C -> Cre-Deb
   *   - Los totales se redondean a 2 decimales SOLO en el objeto de retorno,
   *     nunca en los acumuladores intermedios.
   */
  async balanceGeneral(query: any, empresaId: number) {
    const { date, date2 } = query;

    // =========================================================================
    // 1. Cargar plan de cuentas: clases 1 (Activo), 2 (Pasivo), 3 (Patrimonio)
    // =========================================================================
    const todasCuentas: CuentaRawResult[] = await this.accountRepo
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
    //
    // Prioridad 1: El Balance General es un saldo ACUMULADO a una fecha de
    // corte, no un movimiento de un periodo. Por eso se ignora explícitamente
    // el parámetro `date` y solo se filtra `c.fecha <= :date2`.
    // Si `date` llega en la query, no se usa: no es un descuido, es una
    // decisión de diseño contable.
    //
    // El helper construirFiltroFechaCorte encapsula esta semántica y garantiza
    // que el string SQL y el array de parámetros se generen juntos.
    // =========================================================================
    const { sql: dateFilter, params: dateParams } = construirFiltroFechaCorte(
      date2,
      'c.fecha',
    );
    const params: (string | number)[] = [empresaId, ...dateParams];

    const movimientosRaw: BalanceMovimientoRawResult[] = await this.lineRepo.query(
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
    const cuentasMap = new Map<number, CuentaMemoria>();
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
    //
    // Fix 4: El fallback por prefijo de código ya no es "todo o nada".
    //   Antes solo se activaba si NINGUNA cuenta tenía cuenta_padre_id.
    //   Ahora, cuenta por cuenta, si cuenta_padre_id es null, se intenta
    //   resolver el padre por prefijo de código.
    // =========================================================================
    const hijosPorPadre = new Map<number, number[]>();
    const cuentasSinPadreAsignadoBG: CuentaRawResult[] = [];

    for (const c of todasCuentas) {
      if (c.cuenta_padre_id) {
        const arr = hijosPorPadre.get(c.cuenta_padre_id) || [];
        arr.push(c.id);
        hijosPorPadre.set(c.cuenta_padre_id, arr);
        const padre = cuentasMap.get(c.cuenta_padre_id);
        if (padre) padre.esPadre = true;
      } else {
        cuentasSinPadreAsignadoBG.push(c);
      }
    }

    // Fix 4: Para cada cuenta sin cuenta_padre_id, inferir hijos por prefijo
    for (const c of cuentasSinPadreAsignadoBG) {
      const codigoPunto = (c.codigo || '') + '.';
      for (const otra of todasCuentas) {
        if (otra.id !== c.id && !otra.cuenta_padre_id && (otra.codigo || '').startsWith(codigoPunto)) {
          const resto = (otra.codigo || '').substring(codigoPunto.length);
          if (!resto.includes('.')) {
            const arr = hijosPorPadre.get(c.id) || [];
            if (!arr.includes(otra.id)) {
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
    //
    // Fix 3: Ahora TAMBIÉN se garantiza que existan nodos raíz virtuales para
    //   Activo (clase 1) y Pasivo (clase 2), con el mismo patrón que
    //   Patrimonio. Si el plan de cuentas no tiene una cuenta raíz real con
    //   cuenta_padre_id = null para esas clases, se crea un nodo virtual para
    //   que totales.activo y totales.pasivo no queden en 0 sin aviso.
    // =========================================================================
    // Fase 2: IDs virtuales importados de informes.interface.ts
    // (centralizados en un solo lugar, no repetidos como literales)
    const ID_RESULTADO = ID_RESULTADO_EJERCICIO;

    // Nombres canónicos PUC para las clases del balance
    const NOMBRES_CLASE_BALANCE: Record<string, string> = {
      '1': 'ACTIVO',
      '2': 'PASIVO',
      '3': 'PATRIMONIO',
    };

    // Helper: buscar o crear nodo raíz virtual para una clase
    function buscarOCrearRaizClase(clase: string, naturaleza: string): CuentaMemoria {
      // Buscar si ya existe una cuenta raíz de esta clase sin padre
      let raiz = null;
      for (const c of cuentasMap.values()) {
        if (c.clase === clase && !c.cuenta_padre_id) {
          raiz = c;
          break;
        }
      }
      if (!raiz) {
        // Crear nodo raíz virtual
        const idVirtual = clase === '1' ? ID_ACTIVO_RAIZ : clase === '2' ? ID_PASIVO_RAIZ : ID_PATRIMONIO_RAIZ;
        raiz = {
          id: idVirtual,
          codigo: clase,
          nombre: NOMBRES_CLASE_BALANCE[clase],
          clase,
          naturaleza,
          clasificacion: 1,
          cuenta_padre_id: null,
          esPadre: true,
          esVirtual: true,
          debitoDirecto: 0,
          creditoDirecto: 0,
          debito: 0,
          credito: 0,
          saldo: 0,
        };
        cuentasMap.set(idVirtual, raiz);
      } else {
        raiz.esPadre = true;
      }
      return raiz;
    }

    // Fix 3: Asegurar nodos raíz para Activo, Pasivo y Patrimonio
    const cuentaActivoRaiz = buscarOCrearRaizClase('1', 'D');
    const cuentaPasivoRaiz = buscarOCrearRaizClase('2', 'C');
    const cuentaPatrimonioRaiz = buscarOCrearRaizClase('3', 'C');

    // Si se crearon nodos virtuales para Activo/Pasivo, vincular las cuentas
    // hijas existentes (que no tenían padre asignado o cuyo padre no existe
    // en el plan de cuentas) al nodo raíz virtual.
    //
    // Fix 3 (complemento): Además de cuentas con cuenta_padre_id = null,
    // también se vinculan cuentas cuyo cuenta_padre_id apunta a un ID
    // que no existe en cuentasMap (padre huérfano). Sin esto, las cuentas
    // con padre inexistente nunca se consolidarían en el nodo raíz virtual.
    for (const c of cuentasMap.values()) {
      if (c.esVirtual) continue;
      if (c.id === cuentaActivoRaiz.id || c.id === cuentaPasivoRaiz.id || c.id === cuentaPatrimonioRaiz.id) continue;

      // Es huérfana si cuenta_padre_id es null O si apunta a un ID
      // que no existe en cuentasMap
      const padreExiste = c.cuenta_padre_id !== null && cuentasMap.has(c.cuenta_padre_id);
      if (padreExiste) continue;

      // Vincularla como hija del nodo raíz de su clase (solo si el raíz es virtual)
      let raiz: CuentaMemoria | null = null;
      if (c.clase === '1') raiz = cuentaActivoRaiz;
      else if (c.clase === '2') raiz = cuentaPasivoRaiz;
      else if (c.clase === '3') raiz = cuentaPatrimonioRaiz;
      if (raiz && raiz.esVirtual) {
        c.cuenta_padre_id = raiz.id;
        const arr = hijosPorPadre.get(raiz.id) || [];
        if (!arr.includes(c.id)) {
          arr.push(c.id);
          hijosPorPadre.set(raiz.id, arr);
        }
      }
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
    //
    // Fix 3: También se recalculan los nodos raíz de Activo y Pasivo si
    //   fueron creados virtualmente, para que incluyan los saldos de las
    //   cuentas hijas que se vincularon en el paso anterior.
    {
      const recalcularRaiz = (raiz: CuentaMemoria) => {
        const visitados = new Set<number>();
        const agg = calcularAgregado(raiz.id, visitados);
        raiz.debito = agg.debito;
        raiz.credito = agg.credito;
        raiz.saldo = saldoPorNaturaleza(agg.debito, agg.credito, raiz.naturaleza);
      };
      recalcularRaiz(cuentaPatrimonioRaiz);
      if (cuentaActivoRaiz.esVirtual) recalcularRaiz(cuentaActivoRaiz);
      if (cuentaPasivoRaiz.esVirtual) recalcularRaiz(cuentaPasivoRaiz);
    }

    // =========================================================================
    // 8. Calcular totales por clase
    //
    // Fix 6: Redondear a 2 decimales para evitar artefactos de coma flotante.
    // round2 importado de informes.helpers.ts.
    // =========================================================================
    let totalDebitoGlobal = 0;
    let totalCreditoGlobal = 0;
    const totales = { activo: 0, pasivo: 0, patrimonio: 0 };

    // Sumar débitos/créditos DIRECTOS de cada cuenta con movimientos propios.
    // PROBLEMA CORREGIDO:
    //   Antes se sumaban c.debito y c.credito, que ya son valores agregados
    //   recursivamente (padres incluyen la suma de hijas). Esto duplicaba
    //   el conteo: si una auxiliar tenía 100 y su padre agregaba esos 100,
    //   el total global sumaba 200.
    //
    //   Ahora se usan c.debitoDirecto y c.creditoDirecto (movimientos propios
    //   de cada cuenta). Además, se excluyen los nodos raíz virtuales de
    //   clase (que no tienen movimientos propios) pero se incluye la cuenta
    //   virtual 3.9.99 Resultado del Ejercicio, que SÍ tiene un valor real.
    for (const c of cuentasMap.values()) {
      // Los nodos raíz virtuales de clase (Activo/Pasivo/Patrimonio) no
      // tienen movimientos directos propios; agregan solo a sus hijas.
      // La cuenta 3.9.99 (Resultado del Ejercicio) SÍ tiene un valor
      // directo real y debe incluirse.
      if (c.esVirtual && c.codigo !== '3.9.99') continue;
      totalDebitoGlobal += c.debitoDirecto;
      totalCreditoGlobal += c.creditoDirecto;
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
        activo: round2(totales.activo),
        pasivo: round2(totales.pasivo),
        patrimonio: round2(totales.patrimonio),
        resultado_ejercicio: round2(resultadoEjercicio),
        pasivo_mas_patrimonio: round2(totales.pasivo + totales.patrimonio),
      },
      total_debito: round2(totalDebitoGlobal),
      total_credito: round2(totalCreditoGlobal),
      // El saldo_final debe ser 0 si el balance cuadra correctamente
      saldo_final: round2(totales.activo - (totales.pasivo + totales.patrimonio)),
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
    // Fase 2: Se mantiene parámetros posicionales (?) porque lineRepo.query()
    // de TypeORM no soporta parámetros nombrados en queries raw.
    // El helper construirFiltroFechas garantiza que el string SQL y el array
    // de parámetros se generen juntos, evitando desincronía futura.
    // El tipado fuerte se aplica al resultado (ResultadoEjercicioRawResult[]).
    const { sql: dateFilter, params: dateParams } = construirFiltroFechas(
      date,
      date2,
      'c.fecha',
    );
    const params: (string | number)[] = [empresaId, empresaId, ...dateParams];

    const rows: ResultadoEjercicioRawResult[] = await this.lineRepo.query(
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
  /**
   * Genera el Estado de Resultados (Pérdidas y Ganancias).
   *
   * @param query - Parámetros: date (fecha inicial), date2 (fecha final)
   * @param empresaId - ID de la empresa
   * @returns Estructura con KPIs (totalIngresos, totalCostos, totalGastos,
   *   utilidadPerdida) y detalle (cuentas auxiliares con nodos raíz virtuales)
   *
   * Lógica contable clave:
   *   - Solo se consideran cuentas auxiliares (clasificacion = 4) para
   *     evitar duplicación jerárquica.
   *   - Ingresos (clase 4, naturaleza C): saldo = Crédito - Débito
   *   - Costos (clase 6, naturaleza D) y Gastos (clase 5, naturaleza D):
   *     saldo = Débito - Crédito
   *   - Utilidad/Pérdida = Ingresos - Costos - Gastos
   *   - Se inyectan nodos raíz virtuales "4 INGRESOS", "5 GASTOS",
   *     "6 COSTOS DE VENTAS" para mantener la estructura jerárquica.
   *   - Los KPIs se redondean a 2 decimales SOLO en el objeto de retorno.
   */
  async pyg(query: any, empresaId: number) {
    const { date, date2 } = query;

    // --- 1. Construir filtros de fecha ---
    // Fase 2: Se mantiene parámetros posicionales (?) porque lineRepo.query()
    // de TypeORM no soporta parámetros nombrados en queries raw.
    // El helper construirFiltroFechas garantiza que el string SQL y el array
    // de parámetros se generen juntos, evitando desincronía futura.
    const { sql: dateFilter, params: dateParams } = construirFiltroFechas(
      date,
      date2,
      'c.fecha',
    );
    const params: (string | number)[] = [empresaId, empresaId, ...dateParams];

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
    const detalleRaw: PygDetalleRawResult[] = await this.lineRepo.query(
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
    const detalle = detalleRaw.map((row: PygDetalleRawResult) => {
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

    // --- 4b. Agregar nodos raíz virtuales por clase ---
    //
    // Para mantener la misma estructura jerárquica en árbol que el Balance
    // General, se inyectan nodos raíz de Nivel 1 que consolidan el saldo
    // de todas las cuentas auxiliares de su clase:
    //
    //   "4"  INGRESOS          (nivel 1, naturaleza C) → saldo = totalIngresos
    //   "5"  GASTOS            (nivel 1, naturaleza D) → saldo = totalGastos
    //   "6"  COSTOS DE VENTAS  (nivel 1, naturaleza D) → saldo = totalCostos
    //
    // Estos nodos son virtuales (esVirtual = true) y se marcan como padre
    // (esPadre = true) para que el frontend los formatee con la clase
    // 'fila-clase' (negrita + fondo claro), igual que "1 ACTIVO" y "2 PASIVO".
    //
    // Solo se incluye un nodo si hay cuentas auxiliares de esa clase con
    // movimientos (detalle.length > 0 para esa clase).
    const detalleConRaices: PygFila[] = [];

    // Nombres canónicos PUC para las clases nominales
    const NOMBRES_CLASE_PYG: Record<string, string> = {
      '4': 'INGRESOS',
      '5': 'GASTOS',
      '6': 'COSTOS DE VENTAS',
    };

    // Agrupar auxiliares por clase para saber cuáles raíces incluir
    const clasesPresentes = new Set(detalle.map((d) => d.clase));

    // Insertar en orden: 4, 5, 6 (orden PUC estándar)
    for (const clase of ['4', '5', '6']) {
      if (!clasesPresentes.has(clase)) continue;

      const naturalezaClase = clase === '4' ? 'C' : 'D';
      const saldoClase =
        clase === '4' ? totalIngresos : clase === '6' ? totalCostos : totalGastos;
      const debitoClase =
        clase === '4'
          ? detalle.filter((d) => d.clase === '4').reduce((s, d) => s + d.debito, 0)
          : detalle.filter((d) => d.clase === clase).reduce((s, d) => s + d.debito, 0);
      const creditoClase =
        clase === '4'
          ? detalle.filter((d) => d.clase === '4').reduce((s, d) => s + d.credito, 0)
          : detalle.filter((d) => d.clase === clase).reduce((s, d) => s + d.credito, 0);

      // Nodo raíz virtual de la clase
      detalleConRaices.push({
        cuenta_id: -100 - Number(clase), // ID virtual negativo
        codigo: clase,
        nombre: NOMBRES_CLASE_PYG[clase],
        clase,
        naturaleza: naturalezaClase,
        nivel: 1,
        debito: debitoClase,
        credito: creditoClase,
        saldo: saldoClase,
        esPadre: true,
        esVirtual: true,
        saldo_anomalo: esSaldoAnomalo(saldoClase, naturalezaClase),
        esSaldoContrario: esSaldoContrario(saldoClase, naturalezaClase),
      });

      // Insertar todas las cuentas auxiliares de esta clase, ordenadas por código
      for (const d of detalle) {
        if (d.clase === clase) {
          detalleConRaices.push(d);
        }
      }
    }

    // --- 5. Retornar estructura JSON limpia ---
    //
    // Fix 6: Redondear KPIs a 2 decimales para evitar artefactos de coma flotante.
    // round2 importado de informes.helpers.ts.

    return {
      totalIngresos: round2(totalIngresos),
      totalCostos: round2(totalCostos),
      totalGastos: round2(totalGastos),
      utilidadPerdida: round2(utilidadPerdida),
      detalle: detalleConRaices,
    };
  }
}
