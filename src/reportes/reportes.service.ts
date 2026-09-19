import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { CuotaCredito, EstadoCuota } from '../cartera/entities/cuota-credito.entity';
import { Credito, TipoCredito, EstadoCredito } from '../cartera/entities/credito.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import {
  PartidaRecurrente,
  TipoPartida,
} from '../partidas-recurrentes/entities/partida-recurrente.entity';
import { round2 } from '../accounting/accounting-helpers';

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(AccountingEntryLine)
    private readonly lineaRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Account)
    private readonly cuentaRepo: Repository<Account>,
    @InjectRepository(CuotaCredito)
    private readonly cuotaRepo: Repository<CuotaCredito>,
    @InjectRepository(Banco)
    private readonly bancoRepo: Repository<Banco>,
    @InjectRepository(PartidaRecurrente)
    private readonly partidaRepo: Repository<PartidaRecurrente>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(Purchase)
    private readonly purchaseRepo: Repository<Purchase>,
  ) {}

  async balancePrueba(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable'],
    });

    if (lineas.length === 0) {
      throw new BadRequestException(
        'No hay movimientos en el período especificado',
      );
    }

    // Agrupar por cuenta
    const mapa = new Map<number, any>();
    let totalDebito = 0;
    let totalCredito = 0;

    for (const linea of lineas) {
      const cuentaId = linea.cuenta_contable_id;
      const debito = Number(linea.debito || 0);
      const credito = Number(linea.credito || 0);

      if (!mapa.has(cuentaId)) {
        mapa.set(cuentaId, {
          cuenta_id: cuentaId,
          codigo: linea.cuenta_contable?.codigo || '',
          nombre: linea.cuenta_contable?.nombre || '',
          debito: 0,
          credito: 0,
        });
      }

      const entry = mapa.get(cuentaId);
      entry.debito = round2(entry.debito + debito);
      entry.credito = round2(entry.credito + credito);
      totalDebito = round2(totalDebito + debito);
      totalCredito = round2(totalCredito + credito);
    }

    const cuentas = Array.from(mapa.values()).sort(
      (a, b) => Number(a.codigo) - Number(b.codigo),
    );

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      cuentas,
      total_debito: totalDebito,
      total_credito: totalCredito,
      diferencia: round2(Math.abs(totalDebito - totalCredito)),
      balanceado: Math.abs(totalDebito - totalCredito) < 0.01,
    };
  }

  async estadoResultados(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable'],
    });

    if (lineas.length === 0) {
      throw new BadRequestException(
        'No hay movimientos en el período especificado',
      );
    }

    // Clasificar por clase de cuenta (4=ingresos, 5=costos, 6=gastos)
    const ingresos = new Map<number, any>();
    const costos = new Map<number, any>();
    const gastos = new Map<number, any>();

    let totalIngresos = 0;
    let totalCostos = 0;
    let totalGastos = 0;

    for (const linea of lineas) {
      const cuenta = linea.cuenta_contable;
      if (!cuenta) continue;

      const clasificacion = Number(cuenta.clasificacion);
      const valor = Number(linea.credito || 0) - Number(linea.debito || 0); // Ingresos y gastos tienen naturaleza inversa

      if (clasificacion === 4) {
        // Ingresos
        if (!ingresos.has(cuenta.id)) {
          ingresos.set(cuenta.id, {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            valor: 0,
          });
        }
        const entry = ingresos.get(cuenta.id);
        entry.valor = round2(entry.valor + valor);
        totalIngresos = round2(totalIngresos + valor);
      } else if (clasificacion === 5) {
        // Costos
        if (!costos.has(cuenta.id)) {
          costos.set(cuenta.id, {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            valor: 0,
          });
        }
        const entry = costos.get(cuenta.id);
        entry.valor = round2(entry.valor + Math.abs(valor));
        totalCostos = round2(totalCostos + Math.abs(valor));
      } else if (clasificacion === 6) {
        // Gastos
        if (!gastos.has(cuenta.id)) {
          gastos.set(cuenta.id, {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            valor: 0,
          });
        }
        const entry = gastos.get(cuenta.id);
        entry.valor = round2(entry.valor + Math.abs(valor));
        totalGastos = round2(totalGastos + Math.abs(valor));
      }
    }

    const utilidadBruta = round2(totalIngresos - totalCostos);
    const utilidadOperacional = round2(utilidadBruta - totalGastos);

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      ingresos: Array.from(ingresos.values()),
      total_ingresos: totalIngresos,
      costos: Array.from(costos.values()),
      total_costos: totalCostos,
      utilidad_bruta: utilidadBruta,
      gastos: Array.from(gastos.values()),
      total_gastos: totalGastos,
      utilidad_operacional: utilidadOperacional,
    };
  }

  async flujoCaja(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable'],
    });

    if (lineas.length === 0) {
      throw new BadRequestException(
        'No hay movimientos en el período especificado',
      );
    }

    // Buscar cuentas de banco/caja (clase 1, subgrupo 1.1)
    const bancos = new Map<number, any>();
    let totalEntradas = 0;
    let totalSalidas = 0;

    for (const linea of lineas) {
      const cuenta = linea.cuenta_contable;
      if (!cuenta) continue;

      // Cuentas de banco/caja: clase 1, código que comienza con 1.1
      if (
        Number(cuenta.clasificacion) === 1 &&
        cuenta.codigo.startsWith('1.1')
      ) {
        const debito = Number(linea.debito || 0);
        const credito = Number(linea.credito || 0);

        if (!bancos.has(cuenta.id)) {
          bancos.set(cuenta.id, {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            entradas: 0,
            salidas: 0,
          });
        }

        const entry = bancos.get(cuenta.id);
        entry.entradas = round2(entry.entradas + debito);
        entry.salidas = round2(entry.salidas + credito);
        totalEntradas = round2(totalEntradas + debito);
        totalSalidas = round2(totalSalidas + credito);
      }
    }

    const flujoBanco = Array.from(bancos.values());
    const flujoNeto = round2(totalEntradas - totalSalidas);

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      movimientos_banco: flujoBanco,
      total_entradas: totalEntradas,
      total_salidas: totalSalidas,
      flujo_neto: flujoNeto,
    };
  }

  async analisisCartera(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    // Buscar movimientos de cuentas por cobrar (clase 1.3)
    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable', 'tercero'],
    });

    if (lineas.length === 0) {
      throw new BadRequestException(
        'No hay movimientos en el período especificado',
      );
    }

    const cartera = new Map<number, any>();
    let totalCartera = 0;

    for (const linea of lineas) {
      const cuenta = linea.cuenta_contable;
      if (!cuenta) continue;

      // Cuentas por cobrar: clase 1, código que comienza con 1.3
      if (
        Number(cuenta.clasificacion) === 1 &&
        cuenta.codigo.startsWith('1.3')
      ) {
        const terceroId = linea.tercero_id;
        const saldo = Number(linea.debito || 0) - Number(linea.credito || 0);

        if (saldo > 0) {
          if (!cartera.has(terceroId)) {
            cartera.set(terceroId, {
              tercero_id: terceroId,
              nombre_tercero: linea.tercero?.nombre || 'Desconocido',
              saldo: 0,
            });
          }

          const entry = cartera.get(terceroId);
          entry.saldo = round2(entry.saldo + saldo);
          totalCartera = round2(totalCartera + saldo);
        }
      }
    }

    const deudores = Array.from(cartera.values()).sort(
      (a, b) => b.saldo - a.saldo,
    );

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      deudores,
      total_cartera: totalCartera,
      cantidad_deudores: deudores.length,
    };
  }

  /**
   * Flujo de Caja Proyectado: saldo actual de bancos/cajas + entradas
   * esperadas (cuotas de cartera pendientes) − salidas esperadas
   * (cuotas de CxP pendientes), agrupado por semana o mes.
   */
  async flujoCajaProyectado(
    empresaId: number,
    horizonteMeses = 3,
    granularidad: 'semana' | 'mes' = 'mes',
    incluirRecurrentes = true,
  ) {
    const meses = Math.min(24, Math.max(1, Number(horizonteMeses) || 3));
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const hoyStr = hoy.toISOString().split('T')[0];

    // Saldo inicial = suma de bancos y cajas
    const bancos = await this.bancoRepo.find({ where: { empresa_id: empresaId } });
    const saldoInicial = round2(
      bancos.reduce((acc, b) => acc + Number(b.monto || 0), 0),
    );

    // Cuotas pendientes de cobro (cartera) y de pago (CxP)
    const cuotas = await this.cuotaRepo
      .createQueryBuilder('cq')
      .leftJoinAndSelect('cq.credito', 'cr')
      .leftJoinAndSelect('cr.tercero', 't')
      .where('cq.empresa_id = :empresaId', { empresaId })
      .andWhere('cq.estado != :pagada', { pagada: EstadoCuota.PAGADA })
      .andWhere('cq.saldo > 0')
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO })
      .getMany();

    // Construir periodos
    interface Periodo {
      desde: string;
      hasta: string;
      etiqueta: string;
      entradas: number;
      salidas: number;
      flujo_neto: number;
      saldo_acumulado: number;
      detalle: any[];
    }
    const periodos: Periodo[] = [];
    const cursor = new Date(hoy);
    const fin = new Date(hoy);
    fin.setMonth(fin.getMonth() + meses);

    while (cursor < fin) {
      const desde = new Date(cursor);
      const hasta = new Date(cursor);
      if (granularidad === 'semana') {
        hasta.setDate(hasta.getDate() + 7);
      } else {
        hasta.setMonth(hasta.getMonth() + 1);
      }
      if (hasta > fin) hasta.setTime(fin.getTime());

      const dStr = desde.toISOString().split('T')[0];
      const hStr = hasta.toISOString().split('T')[0];
      const etiqueta =
        granularidad === 'semana'
          ? `${dStr.split('-').reverse().join('/')} - ${hStr.split('-').reverse().join('/')}`
          : desde.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });

      periodos.push({
        desde: dStr,
        hasta: hStr,
        etiqueta,
        entradas: 0,
        salidas: 0,
        flujo_neto: 0,
        saldo_acumulado: 0,
        detalle: [],
      });
      cursor.setTime(hasta.getTime());
    }

    // Distribuir cuotas en periodos según su fecha de pago esperada
    // (posfechada si existe, si no la oportuna). Vencidas se proyectan
    // como si se cobraran/pagaran de inmediato (primer periodo).
    for (const cq of cuotas) {
      const tipo = cq.credito?.tipo_credito;
      const terceroTipo = Number(cq.credito?.tercero?.tipo_terceros || 0);
      const esCxP =
        tipo === TipoCredito.COMPRA ||
        (tipo === TipoCredito.MANUAL && terceroTipo === 2);
      const esCartera =
        tipo === TipoCredito.VENTA ||
        (tipo === TipoCredito.MANUAL && [1, 8, 10].includes(terceroTipo));
      if (!esCxP && !esCartera) continue;

      const fechaRef = cq.fecha_posfechada || cq.fecha_pago_oportuno;
      const efectiva = fechaRef < hoyStr ? hoyStr : fechaRef;
      const saldo = round2(Number(cq.saldo));
      const item = {
        tipo: esCxP ? 'salida' : 'entrada',
        tercero: cq.credito?.tercero?.nombre || '',
        credito_id: cq.credito_id,
        cuota: cq.numero_cuota,
        fecha: efectiva,
        valor: saldo,
        interes: round2(Number(cq.interes_acumulado || 0)),
      };

      const per = periodos.find((p) => efectiva >= p.desde && efectiva < p.hasta);
      if (!per) continue; // fuera del horizonte

      if (esCxP) {
        per.salidas = round2(per.salidas + saldo + item.interes);
      } else {
        per.entradas = round2(per.entradas + saldo + item.interes);
      }
      per.detalle.push(item);
    }

    // Partidas recurrentes: expandir cada ocurrencia dentro del horizonte
    if (incluirRecurrentes) {
      const partidas = await this.partidaRepo.find({
        where: { empresa_id: empresaId, estado: 1 },
      });
      const DIAS_FREQ: Record<string, number> = {
        semanal: 7,
        quincenal: 15,
      };
      for (const partida of partidas) {
        const esEgreso = partida.tipo === TipoPartida.EGRESO;
        const valor = round2(Number(partida.valor));
        const finRec = partida.fecha_fin ? new Date(partida.fecha_fin) : null;
        const cursor = new Date(partida.fecha_inicio);
        cursor.setHours(0, 0, 0, 0);

        // Avanzar hasta la primera ocurrencia >= hoy (no se proyecta el pasado)
        while (cursor < hoy) {
          this.avanzarOcurrencia(cursor, partida.frecuencia, DIAS_FREQ);
        }

        const finStr = fin.toISOString().split('T')[0];
        while (true) {
          const fStr = cursor.toISOString().split('T')[0];
          if (fStr >= finStr) break;
          if (finRec && cursor > finRec) break;

          const per = periodos.find((p) => fStr >= p.desde && fStr < p.hasta);
          if (per) {
            if (esEgreso) {
              per.salidas = round2(per.salidas + valor);
            } else {
              per.entradas = round2(per.entradas + valor);
            }
            per.detalle.push({
              tipo: esEgreso ? 'salida' : 'entrada',
              tercero: partida.nombre,
              credito_id: null,
              cuota: null,
              fecha: fStr,
              valor,
              interes: 0,
              recurrente: true,
            });
          }
          this.avanzarOcurrencia(cursor, partida.frecuencia, DIAS_FREQ);
        }
      }
    }

    // Saldo acumulado proyectado
    let acumulado = saldoInicial;
    for (const p of periodos) {
      p.flujo_neto = round2(p.entradas - p.salidas);
      acumulado = round2(acumulado + p.flujo_neto);
      p.saldo_acumulado = acumulado;
      p.detalle.sort((a, b) => a.fecha.localeCompare(b.fecha));
    }

    return {
      saldo_inicial: saldoInicial,
      fecha_corte: hoyStr,
      horizonte_meses: meses,
      granularidad,
      periodos: periodos.map(({ detalle, ...p }) => p),
      detalle: periodos.flatMap((p) =>
        p.detalle.map((d) => ({ ...d, periodo: p.etiqueta })),
      ),
      bancos: bancos.map((b) => ({ nombre: b.nombre, monto: Number(b.monto) })),
    };
  }

  private avanzarOcurrencia(
    cursor: Date,
    frecuencia: string,
    diasFreq: Record<string, number>,
  ) {
    const dias = diasFreq[frecuencia];
    if (dias) {
      cursor.setDate(cursor.getDate() + dias);
    } else {
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  /**
   * IVA generado (ventas) vs. IVA descontable (compras) del período.
   * Saldo > 0 → a pagar a la DIAN; < 0 → saldo a favor.
   */
  async reporteIva(empresaId: number, fechaInicio: string, fechaFin: string) {
    const [ventas, compras] = await Promise.all([
      this.saleRepo.find({
        where: {
          empresa_id: empresaId,
          fecha: Between(fechaInicio, fechaFin),
          estado: 1,
        },
        relations: ['cliente'],
      }),
      this.purchaseRepo.find({
        where: {
          empresa_id: empresaId,
          fecha: Between(fechaInicio, fechaFin),
          estado: 1,
        },
        relations: ['proveedor'],
      }),
    ]);

    const sumar = (lista: any[], campo: string) =>
      round2(lista.reduce((s, v) => s + Number(v[campo] || 0), 0));

    const ivaGenerado = sumar(ventas, 'impuesto');
    const ivaDescontable = sumar(compras, 'impuesto');
    const saldo = round2(ivaGenerado - ivaDescontable);

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      ventas: {
        cantidad: ventas.length,
        base_gravable: sumar(ventas, 'base_grava'),
        iva_generado: ivaGenerado,
      },
      compras: {
        cantidad: compras.length,
        base_gravable: sumar(compras, 'base_grava'),
        iva_descontable: ivaDescontable,
      },
      saldo,
      interpretacion:
        saldo > 0
          ? `IVA a pagar a la DIAN: ${saldo.toLocaleString('es-CO')}`
          : saldo < 0
            ? `Saldo a favor: ${Math.abs(saldo).toLocaleString('es-CO')}`
            : 'Sin saldo',
      detalle_ventas: ventas.map((v) => ({
        fecha: v.fecha,
        consecutivo: v.codigo,
        tercero: v.cliente?.nombre,
        base_gravable: Number(v.base_grava || 0),
        iva: Number(v.impuesto || 0),
      })),
      detalle_compras: compras.map((c) => ({
        fecha: c.fecha,
        consecutivo: c.codigo,
        factura: c.numero_factura,
        tercero: c.proveedor?.nombre,
        base_gravable: Number(c.base_grava || 0),
        iva: Number(c.impuesto || 0),
      })),
    };
  }

  /**
   * Retenciones en la fuente practicadas por la empresa en sus compras,
   * agrupadas por tercero. Nota: el modelo actual registra una única
   * retención por factura (sin desagregar fuente/IVA/ICA).
   */
  async reporteRetenciones(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const compras = await this.purchaseRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['proveedor'],
    });

    const conRetencion = compras.filter((c) => Number(c.retencion) > 0);

    const porTercero = new Map<number, any>();
    for (const c of conRetencion) {
      const e =
        porTercero.get(c.proveedor_id) || {
          tercero_id: c.proveedor_id,
          tercero: c.proveedor?.nombre || `#${c.proveedor_id}`,
          documento: c.proveedor?.documento,
          concepto: 'Retención en la fuente',
          compras: 0,
          base_gravable: 0,
          retencion: 0,
        };
      e.compras += 1;
      e.base_gravable = round2(e.base_gravable + Number(c.base_grava || 0));
      e.retencion = round2(e.retencion + Number(c.retencion || 0));
      porTercero.set(c.proveedor_id, e);
    }

    const terceros = Array.from(porTercero.values()).map((t) => ({
      ...t,
      tarifa_efectiva:
        t.base_gravable > 0
          ? round2((t.retencion / t.base_gravable) * 100)
          : 0,
    }));

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      total_retenido: round2(
        terceros.reduce((s, t) => s + t.retencion, 0),
      ),
      total_base: round2(terceros.reduce((s, t) => s + t.base_gravable, 0)),
      terceros,
      detalle: conRetencion.map((c) => ({
        fecha: c.fecha,
        consecutivo: c.codigo,
        factura: c.numero_factura,
        tercero: c.proveedor?.nombre,
        base_gravable: Number(c.base_grava || 0),
        retencion: Number(c.retencion || 0),
      })),
    };
  }

  /**
   * Diferencia en cambio (NIIF 21) por período: líneas contables posteadas
   * en cuentas auxiliares "Diferencia en cambio" (ingreso 4.2.10.x /
   * gasto 5.3.05.x). Útil para la declaración de renta.
   */
  async reporteDiferenciaCambio(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const cuentas = await this.cuentaRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    const idsDif = new Set(
      cuentas
        .filter(
          (c) =>
            Number(c.clasificacion) === 4 &&
            (c.nombre || '').toLowerCase().includes('diferencia en cambio') &&
            ((c.codigo || '').startsWith('4.2.10') ||
              (c.codigo || '').startsWith('5.3.05')),
        )
        .map((c) => c.id),
    );

    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable', 'tercero', 'asentado'],
    });

    const movimientos = lineas
      .filter((l) => idsDif.has(l.cuenta_contable_id))
      .map((l) => ({
        fecha: l.fecha,
        consecutivo: l.consecutivo || l.asentado?.consecutivo,
        tercero: l.tercero?.nombre,
        cuenta: l.cuenta_contable?.codigo,
        tipo:
          (l.cuenta_contable?.codigo || '').startsWith('4.2.10')
            ? 'ganancia'
            : 'perdida',
        valor: Math.abs(Number(l.credito || 0) - Number(l.debito || 0)),
        descripcion: l.descripcion,
      }));

    const ganancias = round2(
      movimientos.filter((m) => m.tipo === 'ganancia').reduce((s, m) => s + m.valor, 0),
    );
    const perdidas = round2(
      movimientos.filter((m) => m.tipo === 'perdida').reduce((s, m) => s + m.valor, 0),
    );

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      ganancias,
      perdidas,
      neto: round2(ganancias - perdidas),
      movimientos,
      nota:
        idsDif.size === 0
          ? 'No hay cuentas auxiliares "Diferencia en cambio" bajo 4.2.10 / 5.3.05 en el PUC.'
          : null,
    };
  }
}
