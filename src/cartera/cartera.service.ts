import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, LessThanOrEqual, Not, In } from 'typeorm';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine, AccountingEntry } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Company } from '../companies/entities/company.entity';
import { Credito, TipoCredito, PeriodoCredito, EstadoCredito } from './entities/credito.entity';
import { CuotaCredito, EstadoCuota } from './entities/cuota-credito.entity';
import { CreateCreditoDto } from './dto/create-credito.dto';
import { GenerarProvisionDto } from './dto/generar-provision.dto';
import { RegistrarCobroDto } from './dto/registrar-cobro.dto';
import { PosfecharCuotaDto } from './dto/posfechar-cuota.dto';
import { resolveBancoCuenta, round2, assertBalanced, assertPeriodoAbierto, cuentaDiferenciaCambio, cuentaGastoBancario, requireAccountByKeywords } from '../accounting/accounting-helpers';
import { Cierre } from '../cierres/entities/cierre.entity';
import { Sale } from '../sales/entities/sale.entity';
import { TrmService } from '../trm/trm.service';

const DIAS_POR_PERIODO: Record<number, number> = {
  [PeriodoCredito.SEMANAL]: 7,
  [PeriodoCredito.QUINCENAL]: 15,
  [PeriodoCredito.MENSUAL]: 30,
};

@Injectable()
export class CarteraService {
  constructor(
    @InjectRepository(Third)
    private readonly thirdRepo: Repository<Third>,
    @InjectRepository(AccountingEntryLine)
    private readonly lineRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Credito)
    private readonly creditoRepo: Repository<Credito>,
    @InjectRepository(CuotaCredito)
    private readonly cuotaRepo: Repository<CuotaCredito>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly trmService: TrmService,
  ) {}

  // ============ LISTADO DE CARTERA (resumen por tercero) ============

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.creditoRepo
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.tercero', 't')
      .where('cr.empresa_id = :empresaId', { empresaId })
      .andWhere('cr.tipo_credito IN (:...tipos)', {
        tipos: [TipoCredito.VENTA, TipoCredito.MANUAL],
      })
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO })
      // Créditos manuales solo si el tercero es cliente (tipos 1, 8, 10)
      .andWhere('(cr.tipo_credito = :venta OR t.tipo_terceros IN (1, 8, 10))', {
        venta: TipoCredito.VENTA,
      });

    if (query.solo_saldo_positivo) {
      qb.andWhere('cr.saldo > 0');
    }

    if (query.tercero_id) {
      qb.andWhere('cr.tercero_id = :terceroId', { terceroId: query.tercero_id });
    }

    if (query.search) {
      qb.andWhere('(t.nombre LIKE :search OR t.documento LIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    // Totales globales (sin paginación)
    const resumen = await qb
      .clone()
      .select('COALESCE(SUM(cr.saldo), 0)', 'saldo_total')
      .addSelect('COUNT(DISTINCT cr.tercero_id)', 'terceros')
      .orderBy()
      .getRawOne();

    qb.orderBy('t.nombre', 'ASC').skip((page - 1) * limit).take(limit);

    const [creditos, total] = await qb.getManyAndCount();

    // Datos de moneda de las facturas origen (USD → tasa y valor extranjero)
    const docsPorCodigo = await this.mapaDocumentosMoneda(
      this.creditoRepo.manager,
      empresaId,
      TipoCredito.VENTA,
      creditos.map((c) => c.documento_origen),
    );

    // Agrupar por tercero
    const mapa = new Map<number, any>();
    for (const cr of creditos) {
      const tid = cr.tercero_id;
      if (!mapa.has(tid)) {
        mapa.set(tid, {
          tercero_id: tid,
          nombre: cr.tercero?.nombre || '',
          documento: cr.tercero?.documento || '',
          cupo: Number(cr.tercero?.cupo || 0),
          creditos: [],
          saldo_total: 0,
          cuotas_vencidas: 0,
          dias_mora_max: 0,
        });
      }
      const entry = mapa.get(tid);
      entry.creditos.push({
        id: cr.id,
        documento_origen: cr.documento_origen,
        fecha: cr.fecha,
        monto_total: Number(cr.monto_total),
        saldo: Number(cr.saldo),
        cuotas_pagadas: cr.cuotas_pagadas,
        numero_cuotas: cr.numero_cuotas,
        periodo: cr.periodo,
        estado: cr.estado,
        // Datos de moneda (si la factura origen es en USD)
        ...docsPorCodigo.get(cr.documento_origen || ''),
      });
      entry.saldo_total = round2(entry.saldo_total + Number(cr.saldo));
    }

    // Calcular mora y cuotas vencidas por tercero
    const hoy = new Date().toISOString().split('T')[0];
    for (const entry of mapa.values()) {
      const creditoIds = entry.creditos.map((c: any) => c.id);
      if (creditoIds.length === 0) continue;
      const cuotas = await this.cuotaRepo.find({
        where: {
          empresa_id: empresaId,
          credito_id: In(creditoIds),
          estado: Not(EstadoCuota.PAGADA),
          fecha_pago_oportuno: LessThanOrEqual(hoy),
        },
      });
      entry.cuotas_vencidas = cuotas.length;
      for (const cq of cuotas) {
        const dias = this.calcularDiasMora(cq.fecha_pago_oportuno, cq.fecha_posfechada);
        if (dias > entry.dias_mora_max) entry.dias_mora_max = dias;
      }
    }

    const data = Array.from(mapa.values());

    return {
      data,
      total,
      page,
      limit,
      resumen: {
        saldo_total: round2(Number(resumen?.saldo_total) || 0),
        terceros: Number(resumen?.terceros) || 0,
      },
    };
  }

  /**
   * Mapa código de documento → datos de moneda para las facturas origen
   * en moneda extranjera (las COP no se incluyen).
   */
  private async mapaDocumentosMoneda(
    manager: any,
    empresaId: number,
    tipo: TipoCredito,
    codigos: (string | null)[],
  ) {
    const mapa = new Map<string, any>();
    const lista = [...new Set((codigos || []).filter(Boolean))] as string[];
    if (lista.length === 0) return mapa;

    if (tipo === TipoCredito.VENTA) {
      const ventas = await manager.getRepository(Sale).find({
        where: { empresa_id: empresaId, codigo: In(lista) },
      });
      for (const v of ventas) {
        if (v.moneda_codigo && v.moneda_codigo !== 'COP') {
          mapa.set(v.codigo, {
            moneda_codigo: v.moneda_codigo,
            tasa_cambio: Number(v.tasa_cambio),
            valor_moneda_extranjera: Number(v.valor_moneda_extranjera),
          });
        }
      }
    }
    return mapa;
  }

  // ============ DETALLE DE UN TERCERO (todos sus créditos y cuotas) ============

  async findOne(terceroId: number, empresaId: number) {
    const cliente = await this.thirdRepo.findOne({
      where: { id: terceroId, empresa_id: empresaId, tipo_terceros: In([1, 8, 10]) },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const creditos = await this.creditoRepo.find({
      where: {
        empresa_id: empresaId,
        tercero_id: terceroId,
        tipo_credito: In([TipoCredito.VENTA, TipoCredito.MANUAL]),
      },
      relations: ['cuotas'],
      order: { fecha: 'DESC' },
    });

    const saldoTotal = creditos.reduce((acc, c) => acc + Number(c.saldo), 0);

    const docsMoneda = await this.mapaDocumentosMoneda(
      this.creditoRepo.manager,
      empresaId,
      TipoCredito.VENTA,
      creditos.map((c) => c.documento_origen),
    );

    // Movimientos contables del tercero
    const movimientos = await this.lineRepo.find({
      where: { empresa_id: empresaId, tercero_id: terceroId },
      relations: ['cuenta_contable', 'asentado'],
      order: { id: 'DESC' },
    });

    return {
      tercero: cliente,
      resumen: {
        saldo_total: round2(saldoTotal),
        creditos_activos: creditos.filter((c) => c.estado === EstadoCredito.ACTIVO).length,
        cupo: Number(cliente.cupo),
        cupo_disponible: round2(Number(cliente.cupo) - saldoTotal),
      },
      creditos: creditos.map((c) => ({
        ...c,
        ...docsMoneda.get(c.documento_origen || ''),
        cuotas: c.cuotas?.sort((a, b) => a.numero_cuota - b.numero_cuota),
      })),
      movimientos,
    };
  }

  // ============ DETALLE DE UN CRÉDITO ESPECÍFICO ============

  async findCredito(creditoId: number, empresaId: number) {
    const credito = await this.creditoRepo.findOne({
      where: { id: creditoId, empresa_id: empresaId },
      relations: ['tercero', 'cuotas'],
    });
    if (!credito) {
      throw new NotFoundException('Crédito no encontrado');
    }

    const cuotas = (credito.cuotas || []).sort((a, b) => a.numero_cuota - b.numero_cuota);
    const hoy = new Date().toISOString().split('T')[0];
    const tasaMora = Number(credito.tasa_mora) || 0;

    // Acumular interés moratorio persistente en cada cuota pendiente/parcial
    const cuotasConMora = [];
    for (const cq of cuotas) {
      const dias_mora = cq.estado !== EstadoCuota.PAGADA
        ? this.calcularDiasMora(cq.fecha_pago_oportuno, cq.fecha_posfechada)
        : 0;

      // Acumular interés en el campo persistente
      const interes_acumulado = await this.acumularInteres(cq, tasaMora);

      cuotasConMora.push({
        ...cq,
        dias_mora,
        interes_mora: interes_acumulado,
        interes_acumulado,
        total_pagar: round2(Number(cq.saldo) + interes_acumulado),
        vencida: cq.estado !== EstadoCuota.PAGADA && cq.fecha_pago_oportuno <= hoy,
      });
    }

    // Datos de moneda si la factura origen es en USD
    let moneda: any = null;
    if (credito.tipo_credito === TipoCredito.VENTA && credito.documento_origen) {
      const venta = await this.creditoRepo.manager.getRepository(Sale).findOne({
        where: { empresa_id: empresaId, codigo: credito.documento_origen },
      });
      if (venta && venta.moneda_codigo && venta.moneda_codigo !== 'COP') {
        const tasaFactura = Number(venta.tasa_cambio) || 0;
        const trm = await this.trmService.trmActual(empresaId);
        const tasaHoy = trm.tasa || tasaFactura;
        moneda = {
          codigo: venta.moneda_codigo,
          tasa_factura: tasaFactura,
          valor_moneda_extranjera: Number(venta.valor_moneda_extranjera) || 0,
          tasa_hoy: tasaHoy,
          trm_desactualizada: trm.desactualizada,
          // Saldo del crédito expresado en USD a la TRM de la factura
          saldo_moneda: tasaFactura > 0 ? round2(Number(credito.saldo) / tasaFactura) : 0,
          // Valor esperado del saldo a la TRM de hoy
          saldo_esperado_cop:
            tasaFactura > 0
              ? round2((Number(credito.saldo) / tasaFactura) * tasaHoy)
              : Number(credito.saldo),
        };
      }
    }

    return {
      ...credito,
      cuotas: cuotasConMora,
      pago_minimo: this.calcularPagoMinimo(credito),
      moneda,
    };
  }

  // ============ CREAR CRÉDITO MANUAL ============

  async crearCredito(dto: CreateCreditoDto, empresaId: number, usuario: string) {
    const tercero = await this.thirdRepo.findOne({
      where: { id: dto.tercero_id, empresa_id: empresaId, tipo_terceros: In([1, 8, 10]) },
    });
    if (!tercero) {
      throw new NotFoundException('Cliente no encontrado');
    }
    if (!tercero.cuenta_contable_id) {
      throw new BadRequestException(
        `El cliente ${tercero.nombre} no tiene cuenta contable asignada en el Plan Único de Cuentas`,
      );
    }

    // Validar cupo
    const saldoActual = await this.obtenerSaldoTercero(dto.tercero_id, empresaId);
    if (Number(tercero.cupo) > 0 && round2(saldoActual + dto.monto_total) > Number(tercero.cupo)) {
      throw new BadRequestException(
        `El monto excede el cupo del cliente. Cupo: ${tercero.cupo}, Saldo actual: ${saldoActual}, Disponible: ${round2(Number(tercero.cupo) - saldoActual)}`,
      );
    }

    const creditoId = await this.dataSource.transaction(async (manager) => {
      const creditoRepo = manager.getRepository(Credito);
      const cuotaRepo = manager.getRepository(CuotaCredito);
      const accountRepo = manager.getRepository(Account);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);
      const empresaRepo = manager.getRepository(Company);

      await assertPeriodoAbierto(
        manager.getRepository(Cierre),
        empresaId,
        dto.fecha,
      );

      const valorCuota = round2(dto.monto_total / dto.numero_cuotas);
      const dias = DIAS_POR_PERIODO[dto.periodo] || 30;

      const credito = creditoRepo.create({
        empresa_id: empresaId,
        tercero_id: dto.tercero_id,
        tipo_credito: TipoCredito.MANUAL,
        fecha: dto.fecha,
        monto_total: round2(dto.monto_total),
        saldo: round2(dto.monto_total),
        valor_cuota: valorCuota,
        numero_cuotas: dto.numero_cuotas,
        cuotas_pagadas: 0,
        periodo: dto.periodo,
        mora: 0,
        tasa_mora: dto.tasa_mora || 0,
        estado: EstadoCredito.ACTIVO,
        observacion: dto.observacion,
      });
      const creditoGuardado = await creditoRepo.save(credito);

      // Generar cuotas
      const cuotas: CuotaCredito[] = [];
      const fechaBase = new Date(dto.fecha);
      // Última cuota absorbe el residuo del redondeo para que Σcuotas = monto_total
      const valorUltima = round2(dto.monto_total - valorCuota * (dto.numero_cuotas - 1));
      for (let i = 1; i <= dto.numero_cuotas; i++) {
        const fechaOportuna = new Date(fechaBase);
        if (dto.periodo === PeriodoCredito.MENSUAL) {
          fechaOportuna.setMonth(fechaOportuna.getMonth() + i);
        } else {
          fechaOportuna.setDate(fechaOportuna.getDate() + dias * i);
        }
        const valorI = i === dto.numero_cuotas ? valorUltima : valorCuota;

        cuotas.push(
          cuotaRepo.create({
            empresa_id: empresaId,
            credito_id: creditoGuardado.id,
            numero_cuota: i,
            valor: valorI,
            abonado: 0,
            saldo: valorI,
            fecha_pago_oportuno: fechaOportuna.toISOString().split('T')[0],
            estado: EstadoCuota.PENDIENTE,
          }),
        );
      }
      await cuotaRepo.save(cuotas);

      // Crear asiento contable: débito a cuenta por cobrar del cliente
      const clienteCuenta = await accountRepo.findOne({
        where: { id: tercero.cuenta_contable_id, empresa_id: empresaId },
      });
      if (!clienteCuenta) {
        throw new BadRequestException('La cuenta contable del cliente no existe');
      }

      // Buscar cuenta de contrapartida (egreso/banco/caja general)
      const contrapartida = await this.buscarCuentaContrapartidaCredito(accountRepo, empresaId);
      if (!contrapartida) {
        throw new BadRequestException(
          'No se encontró una cuenta de contrapartida (ingreso 4xxx o banco 11xx) para registrar el crédito manual.',
        );
      }

      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivo = 'CR' + empresa.consecutivo_asientos.toString().padStart(6, '0');
      const monto = round2(dto.monto_total);

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: 4, // ingreso
        fecha: dto.fecha,
        descripcion: dto.observacion || `Crédito manual a ${tercero.nombre}`,
        total_debito: monto,
        total_credito: monto,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      const lineas: Partial<AccountingEntryLine>[] = [
        {
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: clienteCuenta.id,
          tercero_id: tercero.id,
          descripcion: `Crédito a ${tercero.nombre}`,
          valor: monto,
          debito: monto,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        },
        {
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: contrapartida.id,
          tercero_id: tercero.id,
          descripcion: `Contrapartida crédito ${tercero.nombre}`,
          valor: monto,
          debito: 0,
          credito: monto,
          naturaleza: 'C',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        },
      ];

      const balance = assertBalanced(lineas.map((l) => ({ debito: Number(l.debito || 0), credito: Number(l.credito || 0) })));
      asentadoGuardado.total_debito = balance.debito;
      asentadoGuardado.total_credito = balance.credito;
      await asentadoRepo.save(asentadoGuardado);
      await contabilidadRepo.save(lineas.map((l) => contabilidadRepo.create(l)));

      return creditoGuardado.id;
    });

    // findCredito usa el repositorio normal: debe llamarse DESPUÉS del
    // commit, no dentro de la transacción (la fila aún no sería visible).
    return this.findCredito(creditoId, empresaId);
  }

  // ============ REGISTRAR COBRO ============

  async cobrar(dto: RegistrarCobroDto, empresaId: number, usuario: string) {
    return this.dataSource.transaction(async (manager) => {
      const creditoRepo = manager.getRepository(Credito);
      const cuotaRepo = manager.getRepository(CuotaCredito);
      const thirdRepo = manager.getRepository(Third);
      const accountRepo = manager.getRepository(Account);
      const bancoRepo = manager.getRepository(Banco);
      const empresaRepo = manager.getRepository(Company);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);

      await assertPeriodoAbierto(
        manager.getRepository(Cierre),
        empresaId,
        dto.fecha,
      );

      const credito = await creditoRepo.findOne({
        where: { id: dto.credito_id, empresa_id: empresaId },
        relations: ['tercero'],
      });
      if (!credito) {
        throw new NotFoundException('Crédito no encontrado');
      }
      if (credito.estado === EstadoCredito.ANULADO) {
        throw new BadRequestException('El crédito está anulado');
      }
      if (Number(credito.saldo) <= 0) {
        throw new BadRequestException('El crédito no tiene saldo pendiente');
      }

      const cliente = credito.tercero;
      if (!cliente.cuenta_contable_id) {
        throw new BadRequestException(
          `El cliente ${cliente.nombre} no tiene cuenta contable asignada`,
        );
      }

      const banco = await bancoRepo.findOne({
        where: { id: dto.banco_id, empresa_id: empresaId },
      });
      if (!banco) {
        throw new NotFoundException('Banco/caja no encontrado');
      }

      const bancoCuenta = await resolveBancoCuenta(
        accountRepo,
        empresaId,
        banco.cuenta_id,
        banco.nombre,
      );

      const monto = round2(Number(dto.valor));
      if (monto <= 0) {
        throw new BadRequestException('El valor del cobro debe ser mayor a cero');
      }

      // Diferencia en cambio (NIIF 21): si la venta origen es en USD, el
      // cobro se aplica a las cuotas a la TRM de la factura. El excedente/
      // defecto entre el dinero recibido (a TRM de hoy) y el valor nominal
      // aplicado va a resultado: 4.2.10 ingreso / 5.3.05 gasto.
      let tasaPago = 0;
      let tasaFactura = 0;
      let montoNominal = monto;
      if (credito.tipo_credito === TipoCredito.VENTA && credito.documento_origen) {
        const ventaOrigen = await manager.getRepository(Sale).findOne({
          where: { empresa_id: empresaId, codigo: credito.documento_origen },
        });
        if (
          ventaOrigen &&
          ventaOrigen.moneda_codigo &&
          ventaOrigen.moneda_codigo !== 'COP' &&
          Number(ventaOrigen.tasa_cambio) > 1
        ) {
          tasaFactura = Number(ventaOrigen.tasa_cambio);
          tasaPago =
            Number(dto.tasa_pago) ||
            (await this.trmService.tasaParaFecha(empresaId, dto.fecha)) ||
            tasaFactura;
          // El dinero recibido a TRM de hoy equivale a este nominal a la
          // TRM de la factura
          montoNominal = round2((monto * tasaFactura) / tasaPago);
        }
      }

      // Descuento gerencial: parte del saldo condonada sin cobro en efectivo.
      // Contablemente va al débito de una cuenta de descuento (4.1.75 por defecto).
      const descuento = round2(Number(dto.descuento || 0));
      if (descuento < 0) {
        throw new BadRequestException('El descuento no puede ser negativo');
      }

      let cuentaDescuento: Account | null = null;
      if (descuento > 0) {
        cuentaDescuento = dto.cuenta_descuento_id
          ? await accountRepo.findOne({
              where: { id: dto.cuenta_descuento_id, empresa_id: empresaId },
            })
          : await this.buscarCuentaDescuento(accountRepo, empresaId);
        if (!cuentaDescuento) {
          throw new BadRequestException(
            'No se encontró la cuenta de descuento (4.1.75 Devoluciones/rebajas/descuentos en ventas)',
          );
        }
      }

      const saldoCredito = round2(Number(credito.saldo));
      const pagarTodo =
        dto.pagar_todo || round2(montoNominal + descuento) >= saldoCredito;
      const montoAplicar = pagarTodo
        ? round2(Math.max(0, saldoCredito - descuento))
        : montoNominal;
      const descuentoAplicar = Math.min(descuento, round2(saldoCredito - montoAplicar));

      // Diferencia en cambio: dinero real recibido menos el nominal
      // aplicado a la cartera (solo documentos en USD).
      const diferenciaCambio = tasaFactura > 0 ? round2(monto - montoAplicar) : 0;

      // Comisión bancaria que el banco descuenta del cobro (Art. 476 E.T.:
      // excluida de IVA por defecto; si es gravada, el 19% es descontable)
      // y GMF 4x1000 (0.4%) como gasto bancario aparte.
      const brutoBanco = round2(montoAplicar + diferenciaCambio); // dinero que el banco mueve
      const comisionPct = Number(dto.comision_porcentaje) || 0;
      if (comisionPct < 0) {
        throw new BadRequestException('La comisión no puede ser negativa');
      }
      const comision = round2(brutoBanco * (comisionPct / 100));
      const ivaComision =
        dto.comision_gravada && comision > 0 ? round2(comision * 0.19) : 0;
      const gmf = dto.aplicar_gmf ? round2(brutoBanco * 0.004) : 0;
      const netoBanco = round2(brutoBanco - comision - ivaComision - gmf);
      if (brutoBanco > 0 && netoBanco <= 0) {
        throw new BadRequestException(
          'La comisión y el GMF superan el valor del cobro; el neto a banco no puede ser cero o negativo',
        );
      }

      // Obtener cuotas pendientes ordenadas
      let cuotas = await cuotaRepo.find({
        where: { credito_id: credito.id, estado: Not(EstadoCuota.PAGADA) },
        order: { numero_cuota: 'ASC' },
      });

      if (dto.cuota_id) {
        cuotas = cuotas.filter((c) => c.id === dto.cuota_id);
        if (cuotas.length === 0) {
          throw new BadRequestException('La cuota especificada no existe o ya está pagada');
        }
      }

      if (cuotas.length === 0) {
        throw new BadRequestException('No hay cuotas pendientes en este crédito');
      }

      // Distribuir el pago entre las cuotas
      // Orden: primero se cubre el interés acumulado, luego el saldo de la cuota
      let restante = montoAplicar;
      let interesCobrado = 0;
      const cuotasActualizadas: CuotaCredito[] = [];

      for (const cuota of cuotas) {
        if (restante <= 0) break;

        // 1. Cubrir interés acumulado primero
        const interesPendiente = round2(Number(cuota.interes_acumulado || 0));
        if (interesPendiente > 0 && restante > 0) {
          const aplicarInteres = Math.min(restante, interesPendiente);
          cuota.interes_acumulado = round2(interesPendiente - aplicarInteres);
          restante = round2(restante - aplicarInteres);
          interesCobrado = round2(interesCobrado + aplicarInteres);
        }

        if (restante <= 0) {
          cuota.fecha_pago_efectivo = dto.fecha;
          cuota.banco_id = dto.banco_id;
          if (Number(cuota.saldo) > 0) {
            cuota.estado = EstadoCuota.PARCIAL;
          }
          cuotasActualizadas.push(cuota);
          break;
        }

        // 2. Cubrir saldo de la cuota
        const saldoCuota = round2(Number(cuota.saldo));
        const aplicar = Math.min(restante, saldoCuota);
        const nuevoAbonado = round2(Number(cuota.abonado) + aplicar);
        const nuevoSaldo = round2(saldoCuota - aplicar);

        cuota.abonado = nuevoAbonado;
        cuota.saldo = nuevoSaldo;
        cuota.fecha_pago_efectivo = dto.fecha;
        cuota.banco_id = dto.banco_id;
        cuota.estado = nuevoSaldo <= 0 ? EstadoCuota.PAGADA : EstadoCuota.PARCIAL;

        cuotasActualizadas.push(cuota);
        restante = round2(restante - aplicar);
      }

      // Distribuir el descuento gerencial sobre el saldo restante de las cuotas
      // (reduce el saldo sin movimiento de dinero; la cuota queda PAGADA si llega a 0)
      let restanteDescuento = descuentoAplicar;
      for (const cuota of cuotas) {
        if (restanteDescuento <= 0) break;
        const saldoCuota = round2(Number(cuota.saldo));
        if (saldoCuota <= 0) continue;
        const d = Math.min(restanteDescuento, saldoCuota);
        cuota.saldo = round2(saldoCuota - d);
        cuota.fecha_pago_efectivo = dto.fecha;
        if (cuota.saldo <= 0) {
          cuota.estado = EstadoCuota.PAGADA;
        }
        if (!cuotasActualizadas.includes(cuota)) {
          cuotasActualizadas.push(cuota);
        }
        restanteDescuento = round2(restanteDescuento - d);
      }

      await cuotaRepo.save(cuotasActualizadas);

      // Cuenta de ingreso financiero para el interés cobrado (4.2.10.05 Intereses)
      let cuentaInteres: Account | null = null;
      if (interesCobrado > 0) {
        cuentaInteres = await this.buscarCuentaInteresIngreso(accountRepo, empresaId);
        if (!cuentaInteres) {
          throw new BadRequestException(
            'Se cobró interés moratorio pero no se encontró la cuenta de ingreso 4.2.10.05 Intereses en el PUC',
          );
        }
        if (cuentaInteres.naturaleza !== 'C') {
          throw new BadRequestException(
            `La cuenta ${cuentaInteres.codigo} ${cuentaInteres.nombre} debe tener naturaleza Crédito (es un ingreso)`,
          );
        }
      }

      // Actualizar crédito (saldo baja por el cobro + el descuento condonado)
      credito.saldo = round2(saldoCredito - montoAplicar - descuentoAplicar);
      credito.fecha_ultimo_pago = dto.fecha;
      const cuotasPagadasTotal = await cuotaRepo.count({
        where: { credito_id: credito.id, estado: EstadoCuota.PAGADA },
      });
      credito.cuotas_pagadas = cuotasPagadasTotal;

      if (credito.saldo <= 0.01) {
        credito.estado = EstadoCredito.PAGADO;
        credito.saldo = 0;
      }
      await creditoRepo.save(credito);

      // Actualizar banco con el NETO recibido (bruto menos comisión+IVA+GMF)
      banco.monto = round2(Number(banco.monto) + netoBanco);
      await bancoRepo.save(banco);

      // Crear asiento contable
      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivo = 'CB' + empresa.consecutivo_asientos.toString().padStart(6, '0');
      const descripcion = dto.descripcion || `Cobro a ${cliente.nombre} - Crédito #${credito.id}`;
      const totalAplicado = round2(montoAplicar + descuentoAplicar);

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: dto.tipo_comprobante_id,
        fecha: dto.fecha,
        descripcion,
        total_debito: totalAplicado,
        total_credito: totalAplicado,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      // Cuenta de diferencia en cambio (se valida solo si hay diferencia)
      let cuentaDif: Account | null = null;
      if (diferenciaCambio !== 0) {
        cuentaDif = await cuentaDiferenciaCambio(
          accountRepo,
          empresaId,
          diferenciaCambio > 0, // ganancia → ingreso; pérdida → gasto
        );
      }

      // Cuentas de gasto bancario (se validan solo si aplican)
      let cuentaComision: Account | null = null;
      if (comision > 0) {
        cuentaComision = await cuentaGastoBancario(accountRepo, empresaId, 'comision');
      }
      let cuentaIvaDescontable: Account | null = null;
      if (ivaComision > 0) {
        cuentaIvaDescontable = await requireAccountByKeywords(
          accountRepo,
          empresaId,
          ['2408', 'iva descontable', 'iva debito'],
          'IVA descontable sobre comisión bancaria',
        );
      }
      let cuentaGmf: Account | null = null;
      if (gmf > 0) {
        cuentaGmf = await cuentaGastoBancario(accountRepo, empresaId, 'gmf');
      }

      const lineas: Partial<AccountingEntryLine>[] = [];
      if (netoBanco > 0) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: bancoCuenta.id,
          tercero_id: cliente.id,
          descripcion: `Entrada banco/caja cobro a ${cliente.nombre}`,
          valor: netoBanco,
          debito: netoBanco,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (comision > 0 && cuentaComision) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaComision.id,
          tercero_id: cliente.id,
          descripcion: `Comisión bancaria ${comisionPct}% cobro ${credito.documento_origen || '#' + credito.id}`,
          valor: comision,
          debito: comision,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (ivaComision > 0 && cuentaIvaDescontable) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaIvaDescontable.id,
          tercero_id: cliente.id,
          descripcion: `IVA 19% sobre comisión bancaria`,
          valor: ivaComision,
          debito: ivaComision,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (gmf > 0 && cuentaGmf) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaGmf.id,
          tercero_id: cliente.id,
          descripcion: `GMF 4x1000 cobro ${credito.documento_origen || '#' + credito.id}`,
          valor: gmf,
          debito: gmf,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (diferenciaCambio !== 0 && cuentaDif) {
        // Ganancia → Cr ingreso 4.2.10 ; Pérdida → Dr gasto 5.3.05
        const esGanancia = diferenciaCambio > 0;
        const v = Math.abs(diferenciaCambio);
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaDif.id,
          tercero_id: cliente.id,
          descripcion: `Diferencia en cambio ${credito.documento_origen} (TRM ${tasaFactura} -> ${tasaPago})`,
          valor: v,
          debito: esGanancia ? 0 : v,
          credito: esGanancia ? v : 0,
          naturaleza: esGanancia ? 'C' : 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (descuentoAplicar > 0 && cuentaDescuento) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaDescuento.id,
          tercero_id: cliente.id,
          descripcion: `Descuento gerencial concedido a ${cliente.nombre}`,
          valor: descuentoAplicar,
          debito: descuentoAplicar,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (interesCobrado > 0 && cuentaInteres) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaInteres.id,
          tercero_id: cliente.id,
          descripcion: `Interés moratorio cobrado a ${cliente.nombre}`,
          valor: interesCobrado,
          debito: 0,
          credito: interesCobrado,
          naturaleza: 'C',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      const montoTercero = round2(totalAplicado - interesCobrado);
      if (montoTercero > 0) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cliente.cuenta_contable_id,
          tercero_id: cliente.id,
          descripcion: `Cobro a ${cliente.nombre}`,
          valor: montoTercero,
          debito: 0,
          credito: montoTercero,
          naturaleza: 'C',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }

      const balance = assertBalanced(lineas.map((l) => ({ debito: Number(l.debito || 0), credito: Number(l.credito || 0) })));
      asentadoGuardado.total_debito = balance.debito;
      asentadoGuardado.total_credito = balance.credito;
      await asentadoRepo.save(asentadoGuardado);
      await contabilidadRepo.save(lineas.map((l) => contabilidadRepo.create(l)));

      // Vincular asentado a las cuotas pagadas
      for (const cq of cuotasActualizadas) {
        if (cq.estado === EstadoCuota.PAGADA && !cq.asentado_id) {
          cq.asentado_id = asentadoGuardado.id;
          cq.numero_recibo = consecutivo;
          await cuotaRepo.save(cq);
        }
      }

      return {
        asentado: asentadoGuardado,
        credito: { id: credito.id, saldo: credito.saldo, estado: credito.estado },
        cuotas_pagadas: cuotasActualizadas.filter((c) => c.estado === EstadoCuota.PAGADA).length,
        monto_aplicado: montoAplicar,
        descuento_aplicado: descuentoAplicar,
        interes_cobrado: interesCobrado,
        comision_aplicada: comision,
        iva_comision: ivaComision,
        gmf,
        neto_banco: netoBanco,
      };
    });
  }

  // ============ POSFECHAR CUOTA ============

  async posfecharCuota(dto: PosfecharCuotaDto, empresaId: number) {
    const cuota = await this.cuotaRepo.findOne({
      where: { id: dto.cuota_id, empresa_id: empresaId },
      relations: ['credito'],
    });
    if (!cuota) {
      throw new NotFoundException('Cuota no encontrada');
    }
    if (cuota.estado === EstadoCuota.PAGADA) {
      throw new BadRequestException('No se puede posfechar una cuota ya pagada');
    }

    cuota.fecha_posfechada = dto.fecha_posfechada;
    if (dto.observacion) {
      cuota.observacion = dto.observacion;
    }
    await this.cuotaRepo.save(cuota);

    return { ok: true, cuota };
  }

  // ============ CUOTAS VENCIDAS ============

  async cuotasVencidas(empresaId: number, query?: any) {
    const hoy = new Date().toISOString().split('T')[0];

    const qb = this.cuotaRepo
      .createQueryBuilder('cq')
      .leftJoinAndSelect('cq.credito', 'cr')
      .leftJoinAndSelect('cr.tercero', 't')
      .where('cq.empresa_id = :empresaId', { empresaId })
      .andWhere('cq.estado != :pagada', { pagada: EstadoCuota.PAGADA })
      .andWhere('cr.tipo_credito IN (:...tipos)', { tipos: [TipoCredito.VENTA, TipoCredito.MANUAL] })
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO })
      .andWhere('(cr.tipo_credito = :venta OR t.tipo_terceros IN (1, 8, 10))', { venta: TipoCredito.VENTA });

    if (query?.incluir_posfechadas) {
      qb.andWhere(
        '(cq.fecha_pago_oportuno <= :hoy OR (cq.fecha_posfechada IS NOT NULL AND cq.fecha_posfechada <= :hoy))',
        { hoy },
      );
    } else {
      qb.andWhere('cq.fecha_pago_oportuno <= :hoy', { hoy });
      qb.andWhere('(cq.fecha_posfechada IS NULL OR cq.fecha_posfechada > :hoy)', { hoy });
    }

    if (query?.tercero_id) {
      qb.andWhere('cr.tercero_id = :terceroId', { terceroId: query.tercero_id });
    }

    const cuotas = await qb.orderBy('cq.fecha_pago_oportuno', 'ASC').getMany();

    const data = [];
    for (const cq of cuotas) {
      const diasMora = this.calcularDiasMora(cq.fecha_pago_oportuno, cq.fecha_posfechada);
      const tasaMora = Number(cq.credito.tasa_mora) || 0;
      const interes_acumulado = await this.acumularInteres(cq, tasaMora);

      data.push({
        cuota_id: cq.id,
        credito_id: cq.credito_id,
        numero_cuota: cq.numero_cuota,
        tercero_id: cq.credito.tercero_id,
        nombre: cq.credito.tercero?.nombre || '',
        documento: cq.credito.tercero?.documento || '',
        valor: Number(cq.valor),
        saldo: Number(cq.saldo),
        fecha_pago_oportuno: cq.fecha_pago_oportuno,
        fecha_posfechada: cq.fecha_posfechada,
        dias_mora: diasMora,
        interes_mora: interes_acumulado,
        interes_acumulado,
        total_pagar: round2(Number(cq.saldo) + interes_acumulado),
        estado: cq.estado,
      });
    }

    const totalVencido = data.reduce((acc, d) => acc + d.total_pagar, 0);

    return { data, total_vencido: round2(totalVencido), count: data.length };
  }

  // ============ MÉTODO INTERNO: Crear crédito desde venta/compra ============

  async crearCreditoDesdeDocumento(
    empresaId: number,
    terceroId: number,
    tipoCredito: TipoCredito,
    documentoOrigen: string,
    fecha: string,
    monto: number,
    numeroCuotas: number,
    periodo: PeriodoCredito,
    tasaMora: number,
    manager: any,
  ): Promise<Credito> {
    const creditoRepo = manager.getRepository(Credito);
    const cuotaRepo = manager.getRepository(CuotaCredito);

    const valorCuota = round2(monto / numeroCuotas);
    const dias = DIAS_POR_PERIODO[periodo] || 30;

    const credito = creditoRepo.create({
      empresa_id: empresaId,
      tercero_id: terceroId,
      documento_origen: documentoOrigen,
      tipo_credito: tipoCredito,
      fecha,
      monto_total: round2(monto),
      saldo: round2(monto),
      valor_cuota: valorCuota,
      numero_cuotas: numeroCuotas,
      cuotas_pagadas: 0,
      periodo,
      mora: 0,
      tasa_mora: tasaMora || 0,
      estado: EstadoCredito.ACTIVO,
    });
    const creditoGuardado = await creditoRepo.save(credito);

    const cuotas: CuotaCredito[] = [];
    const fechaBase = new Date(fecha);
    // Última cuota absorbe el residuo del redondeo para que Σcuotas = monto
    const valorUltima = round2(monto - valorCuota * (numeroCuotas - 1));
    for (let i = 1; i <= numeroCuotas; i++) {
      const fechaOportuna = new Date(fechaBase);
      if (periodo === PeriodoCredito.MENSUAL) {
        fechaOportuna.setMonth(fechaOportuna.getMonth() + i);
      } else {
        fechaOportuna.setDate(fechaOportuna.getDate() + dias * i);
      }
      const valorI = i === numeroCuotas ? valorUltima : valorCuota;

      cuotas.push(
        cuotaRepo.create({
          empresa_id: empresaId,
          credito_id: creditoGuardado.id,
          numero_cuota: i,
          valor: valorI,
          abonado: 0,
          saldo: valorI,
          fecha_pago_oportuno: fechaOportuna.toISOString().split('T')[0],
          estado: EstadoCuota.PENDIENTE,
        }),
      );
    }
    await cuotaRepo.save(cuotas);

    return creditoGuardado;
  }

  // ============ ANÁLISIS DE VENCIMIENTO (aging / ficha de vencimiento) ============

  /**
   * Clasifica la cartera por rangos de días de mora (estándar NIIF 9
   * simplificado + cartilla colombiana A–E). Cada cuota se ubica en el
   * rango según sus días de mora (considerando posfechamiento).
   */
  async analisisVencimiento(empresaId: number) {
    const cuotas = await this.cuotaRepo
      .createQueryBuilder('cq')
      .leftJoinAndSelect('cq.credito', 'cr')
      .leftJoinAndSelect('cr.tercero', 't')
      .where('cq.empresa_id = :empresaId', { empresaId })
      .andWhere('cq.estado != :pagada', { pagada: EstadoCuota.PAGADA })
      .andWhere('cq.saldo > 0')
      .andWhere('cr.tipo_credito IN (:...tipos)', {
        tipos: [TipoCredito.VENTA, TipoCredito.MANUAL],
      })
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO })
      .andWhere('(cr.tipo_credito = :venta OR t.tipo_terceros IN (1, 8, 10))', {
        venta: TipoCredito.VENTA,
      })
      .getMany();

    const mapa = new Map<number, any>();
    const totales = this.bucketsVacios();
    let totalGeneral = 0;
    let interesTotal = 0;

    for (const cq of cuotas) {
      const tercero = cq.credito?.tercero;
      if (!tercero) continue;

      const diasMora = this.calcularDiasMora(
        cq.fecha_pago_oportuno,
        cq.fecha_posfechada,
      );
      const tasaMora = Number(cq.credito.tasa_mora) || 0;
      const interes = await this.acumularInteres(cq, tasaMora);
      const bucket = this.bucketPorDias(diasMora);
      const saldo = round2(Number(cq.saldo));

      if (!mapa.has(tercero.id)) {
        mapa.set(tercero.id, {
          tercero_id: tercero.id,
          nombre: tercero.nombre || '',
          documento: tercero.documento || '',
          buckets: this.bucketsVacios(),
          interes_mora: 0,
          total: 0,
          dias_mora_max: 0,
          calificacion: 'A',
        });
      }

      const e = mapa.get(tercero.id);
      e.buckets[bucket] = round2(e.buckets[bucket] + saldo);
      e.interes_mora = round2(e.interes_mora + interes);
      e.total = round2(e.total + saldo);
      if (diasMora > e.dias_mora_max) e.dias_mora_max = diasMora;

      totales[bucket] = round2(totales[bucket] + saldo);
      totalGeneral = round2(totalGeneral + saldo);
      interesTotal = round2(interesTotal + interes);
    }

    const data = Array.from(mapa.values())
      .map((e) => ({
        ...e,
        calificacion: this.calificacionPorMora(e.dias_mora_max),
      }))
      .sort((a, b) => b.total - a.total);

    return {
      data,
      totales,
      total_general: totalGeneral,
      interes_total: interesTotal,
      clientes: data.length,
      rangos: [
        'al_dia', 'd1_30', 'd31_60', 'd61_90',
        'd91_180', 'd181_360', 'd361_720', 'mas_720',
      ],
    };
  }

  private bucketsVacios() {
    return {
      al_dia: 0,    // sin vencer
      d1_30: 0,     // 1-30 días
      d31_60: 0,    // 31-60 días
      d61_90: 0,    // 61-90 días
      d91_180: 0,   // 91-180 días
      d181_360: 0,  // 181-360 días
      d361_720: 0,  // 361-720 días
      mas_720: 0,   // más de 720 días
    };
  }

  /**
   * Genera el asiento contable de provisión de cartera según el análisis
   * de vencimiento: Dr 5.2.99 (gasto provisión) / Cr 1.3.99.05 (provisión),
   * con una línea por tercero para trazabilidad.
   */
  async generarAsientoProvision(dto: GenerarProvisionDto, empresaId: number, usuario: string) {
    const analisis = await this.analisisVencimiento(empresaId);

    const tasas = {
      al_dia: 0, d1_30: 1, d31_60: 3, d61_90: 5,
      d91_180: 10, d181_360: 20, d361_720: 50, mas_720: 100,
      ...(dto.tasas || {}),
    };

    // Provisión por tercero
    const provisiones = analisis.data
      .map((row: any) => {
        const provision = Object.keys(tasas).reduce(
          (acc, key) => acc + (Number(row.buckets?.[key] || 0) * Number(tasas[key] || 0)) / 100,
          0,
        );
        return { tercero: row, provision: round2(provision) };
      })
      .filter((p: any) => p.provision > 0);

    const totalProvision = round2(
      provisiones.reduce((acc: number, p: any) => acc + p.provision, 0),
    );

    if (totalProvision <= 0) {
      throw new BadRequestException(
        'La provisión calculada es cero; no hay asiento que generar',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const accountRepo = manager.getRepository(Account);
      const empresaRepo = manager.getRepository(Company);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);

      await assertPeriodoAbierto(
        manager.getRepository(Cierre),
        empresaId,
        dto.fecha,
      );

      const cuentas = await accountRepo.find({
        where: { empresa_id: empresaId, estado: 1 },
      });
      const porCodigo = (codigos: string[]) =>
        cuentas.find((c) => codigos.includes(c.codigo)) ||
        cuentas.find((c) => codigos.some((cod) => (c.codigo || '').startsWith(cod + '.')));

      const cuentaGasto = dto.cuenta_gasto_id
        ? cuentas.find((c) => c.id === dto.cuenta_gasto_id)
        : porCodigo(['5.2.99', '5.1.99', '5299', '5199']);
      const cuentaProvision = dto.cuenta_provision_id
        ? cuentas.find((c) => c.id === dto.cuenta_provision_id)
        : porCodigo(['1.3.99.05', '1.3.99', '1399']);

      if (!cuentaGasto || !cuentaProvision) {
        throw new BadRequestException(
          'No se encontraron las cuentas de provisión (gasto 5.2.99 y provisión 1.3.99.05)',
        );
      }

      // Saldos actuales de la cuenta de provisión por tercero
      // (lo ya provisionado: créditos - débitos en la 1.3.99.05)
      const saldosActuales = await contabilidadRepo
        .createQueryBuilder('l')
        .select('l.tercero_id', 'tercero_id')
        .addSelect('COALESCE(SUM(l.credito) - SUM(l.debito), 0)', 'saldo')
        .where('l.empresa_id = :empresaId', { empresaId })
        .andWhere('l.cuenta_contable_id = :cid', { cid: cuentaProvision.id })
        .andWhere('l.estado = 1')
        .groupBy('l.tercero_id')
        .getRawMany();
      const saldoPorTercero = new Map<number, number>(
        saldosActuales.map((s: any) => [Number(s.tercero_id), round2(Number(s.saldo))]),
      );

      // Ajuste por diferencia: solo se asienta el delta entre la provisión
      // requerida y el saldo ya registrado en la cuenta de provisión.
      // delta > 0 -> se constituye (Dr gasto / Cr provisión)
      // delta < 0 -> se recupera (Dr provisión / Cr gasto)
      const ajustes: { tercero: any; delta: number; requerida: number; actual: number }[] = [];
      for (const p of provisiones) {
        const actual = saldoPorTercero.get(p.tercero.tercero_id) || 0;
        const delta = round2(p.provision - actual);
        if (delta !== 0) {
          ajustes.push({ tercero: p.tercero, delta, requerida: p.provision, actual });
        }
        saldoPorTercero.delete(p.tercero.tercero_id);
      }
      // Terceros que ya no tienen cartera pero conservan saldo de provisión:
      // la provisión sobrante se recupera en su totalidad.
      for (const [terceroId, saldo] of saldoPorTercero) {
        if (saldo > 0) {
          ajustes.push({
            tercero: { tercero_id: terceroId, nombre: `tercero #${terceroId}`, calificacion: '-' },
            delta: round2(-saldo),
            requerida: 0,
            actual: saldo,
          });
        }
      }

      if (ajustes.length === 0) {
        throw new BadRequestException(
          'La provisión ya coincide con el análisis de vencimiento; no hay ajuste que registrar',
        );
      }

      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivo = 'PV' + empresa.consecutivo_asientos.toString().padStart(6, '0');
      const descripcion =
        dto.descripcion ||
        `Provisión de cartera según análisis de vencimiento (${analisis.clientes} clientes)`;

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: dto.tipo_comprobante_id,
        fecha: dto.fecha,
        descripcion,
        total_debito: 0,
        total_credito: 0,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      // Líneas por tercero: delta positivo constituye, delta negativo recupera
      const lineas: Partial<AccountingEntryLine>[] = [];
      let totalConstituido = 0;
      let totalRecuperado = 0;
      for (const a of ajustes) {
        const monto = round2(Math.abs(a.delta));
        const esConstitucion = a.delta > 0;
        if (esConstitucion) totalConstituido = round2(totalConstituido + monto);
        else totalRecuperado = round2(totalRecuperado + monto);

        const descripcionLinea = `${esConstitucion ? 'Provisión' : 'Recuperación'} cartera ${a.tercero.nombre} (req. ${a.requerida} / reg. ${a.actual})`;
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: esConstitucion ? cuentaGasto.id : cuentaProvision.id,
          tercero_id: a.tercero.tercero_id,
          descripcion: descripcionLinea,
          valor: monto,
          debito: monto,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: esConstitucion ? cuentaProvision.id : cuentaGasto.id,
          tercero_id: a.tercero.tercero_id,
          descripcion: descripcionLinea,
          valor: monto,
          debito: 0,
          credito: monto,
          naturaleza: 'C',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }

      const balance = assertBalanced(
        lineas.map((l) => ({ debito: Number(l.debito || 0), credito: Number(l.credito || 0) })),
      );
      asentadoGuardado.total_debito = balance.debito;
      asentadoGuardado.total_credito = balance.credito;
      await asentadoRepo.save(asentadoGuardado);
      await contabilidadRepo.save(lineas.map((l) => contabilidadRepo.create(l)));

      return {
        asentado: asentadoGuardado,
        consecutivo,
        total_provision: totalProvision,
        total_constituido: totalConstituido,
        total_recuperado: totalRecuperado,
        terceros: provisiones.length,
        ajustes: ajustes.length,
        cuenta_gasto: { id: cuentaGasto.id, codigo: cuentaGasto.codigo, nombre: cuentaGasto.nombre },
        cuenta_provision: { id: cuentaProvision.id, codigo: cuentaProvision.codigo, nombre: cuentaProvision.nombre },
      };
    });
  }

  private bucketPorDias(dias: number): string {
    if (dias <= 0) return 'al_dia';
    if (dias <= 30) return 'd1_30';
    if (dias <= 60) return 'd31_60';
    if (dias <= 90) return 'd61_90';
    if (dias <= 180) return 'd91_180';
    if (dias <= 360) return 'd181_360';
    if (dias <= 720) return 'd361_720';
    return 'mas_720';
  }

  /** Calificación cartilla comercial colombiana por días máximos de mora */
  private calificacionPorMora(diasMax: number): string {
    if (diasMax <= 90) return 'A';   // Normal
    if (diasMax <= 180) return 'B';  // Aceptable
    if (diasMax <= 360) return 'C';  // Apreciable
    if (diasMax <= 720) return 'D';  // Medio
    return 'E';                      // Irrecuperable
  }

  // ============ HELPERS ============

  private calcularDiasMora(fechaOportuna: string, fechaPosfechada?: string | null): number {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const referencia = fechaPosfechada ? new Date(fechaPosfechada) : new Date(fechaOportuna);
    referencia.setHours(0, 0, 0, 0);

    if (hoy <= referencia) return 0;

    const diff = hoy.getTime() - referencia.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Acumula el interés moratorio persistente en la cuota.
   * Calcula el interés desde la fecha del último cálculo (o fecha_pago_oportuno)
   * hasta hoy y lo suma al campo `interes_acumulado`.
   * No modifica el saldo de la cuota.
   */
  private async acumularInteres(cuota: CuotaCredito, tasaMora: number): Promise<number> {
    if (cuota.estado === EstadoCuota.PAGADA || tasaMora <= 0) {
      return Number(cuota.interes_acumulado || 0);
    }

    const hoy = new Date().toISOString().split('T')[0];
    const fechaReferencia = cuota.fecha_posfechada || cuota.fecha_pago_oportuno;

    // Si la fecha de pago oportuno aún no ha llegado, no hay mora
    if (hoy <= fechaReferencia) {
      return Number(cuota.interes_acumulado || 0);
    }

    // Calcular desde la fecha del último cálculo o desde la fecha de referencia
    const desde = cuota.fecha_ultimo_calculo_interes || fechaReferencia;
    if (hoy <= desde) {
      return Number(cuota.interes_acumulado || 0);
    }

    const fechaDesde = new Date(desde);
    fechaDesde.setHours(0, 0, 0, 0);
    const fechaHasta = new Date(hoy);
    fechaHasta.setHours(0, 0, 0, 0);

    const diasNuevos = Math.floor(
      (fechaHasta.getTime() - fechaDesde.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diasNuevos <= 0) {
      return Number(cuota.interes_acumulado || 0);
    }

    const interesNuevo = round2(
      Number(cuota.saldo) * (tasaMora / 100) * (diasNuevos / 30),
    );

    const interesTotal = round2(Number(cuota.interes_acumulado || 0) + interesNuevo);

    // Persistir la actualización
    await this.cuotaRepo.update(cuota.id, {
      interes_acumulado: interesTotal,
      fecha_ultimo_calculo_interes: hoy,
    });

    return interesTotal;
  }

  private calcularPagoMinimo(credito: Credito): number {
    const dias = DIAS_POR_PERIODO[credito.periodo] || 30;
    const div = Math.floor(Number(credito.mora) / dias) + 1;
    const pago = div * Number(credito.valor_cuota);
    return Math.min(round2(pago), round2(Number(credito.saldo)));
  }

  private async obtenerSaldoTercero(terceroId: number, empresaId: number): Promise<number> {
    const res = await this.creditoRepo
      .createQueryBuilder('cr')
      .select('COALESCE(SUM(cr.saldo), 0)', 'total')
      .where('cr.empresa_id = :empresaId', { empresaId })
      .andWhere('cr.tercero_id = :terceroId', { terceroId })
      .andWhere('cr.estado = :activo', { activo: EstadoCredito.ACTIVO })
      .andWhere('cr.tipo_credito IN (:...tipos)', { tipos: [TipoCredito.VENTA, TipoCredito.MANUAL] })
      .getRawOne();
    return Number(res?.total ?? 0);
  }

  private async buscarCuentaContrapartidaCredito(
    accountRepo: Repository<Account>,
    empresaId: number,
  ): Promise<Account | null> {
    const cuentas = await accountRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    // Para un crédito manual a cliente, la contrapartida lógica es:
    // 1. Cuenta de ingreso (4xxx) — venta de bienes/servicios a crédito
    // 2. Cuenta de banco/caja (11xx) — préstamo en efectivo al cliente
    return (
      cuentas.find((c) => /^4\./.test(c.codigo || '') || /^4\d/.test(c.codigo || '')) ||
      cuentas.find((c) => /^1\.1/.test(c.codigo || '') || /^11/.test(c.codigo || '')) ||
      null
    );
  }

  /**
   * Cuenta por defecto para el descuento gerencial en cartera:
   * 1. 4.1.75 Devoluciones, rebajas y descuentos en ventas (contra-ingreso)
   * 2. 4.2.75 Descuentos en otras ventas
   * 3. 5.3.05.35 Descuentos comerciales condicionados (gasto)
   */
  private async buscarCuentaDescuento(
    accountRepo: Repository<Account>,
    empresaId: number,
  ): Promise<Account | null> {
    const cuentas = await accountRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    const codigos = ['4.1.75', '4.2.75', '5.3.05.35', '4175', '4275', '530535'];
    for (const codigo of codigos) {
      const found = cuentas.find(
        (c) => c.codigo === codigo || (c.codigo || '').startsWith(codigo + '.'),
      );
      if (found) return found;
    }
    return null;
  }

  /**
   * Cuenta de ingreso financiero para intereses moratorios cobrados:
   * 4.2.10.05 Intereses (o la subcuenta 4.2.10.x disponible).
   */
  private async buscarCuentaInteresIngreso(
    accountRepo: Repository<Account>,
    empresaId: number,
  ): Promise<Account | null> {
    const cuentas = await accountRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    const codigos = ['4.2.10.05', '4.2.10', '421005', '4210'];
    for (const codigo of codigos) {
      const found = cuentas.find(
        (c) => c.codigo === codigo || (c.codigo || '').startsWith(codigo + '.'),
      );
      if (found) return found;
    }
    return null;
  }
}
