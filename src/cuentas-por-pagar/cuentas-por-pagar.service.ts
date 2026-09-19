import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, LessThanOrEqual, Not, In } from 'typeorm';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine, AccountingEntry } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Company } from '../companies/entities/company.entity';
import { Credito, TipoCredito, PeriodoCredito, EstadoCredito } from '../cartera/entities/credito.entity';
import { CuotaCredito, EstadoCuota } from '../cartera/entities/cuota-credito.entity';
import { CreateCreditoProveedorDto } from './dto/create-credito-proveedor.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { PosfecharPagoDto } from './dto/posfechar-pago.dto';
import { resolveBancoCuenta, round2, assertBalanced, assertPeriodoAbierto, cuentaDiferenciaCambio, cuentaGastoBancario, requireAccountByKeywords } from '../accounting/accounting-helpers';
import { Cierre } from '../cierres/entities/cierre.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { TrmService } from '../trm/trm.service';

const DIAS_POR_PERIODO: Record<number, number> = {
  [PeriodoCredito.SEMANAL]: 7,
  [PeriodoCredito.QUINCENAL]: 15,
  [PeriodoCredito.MENSUAL]: 30,
};

@Injectable()
export class CuentasPorPagarService {
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

  // ============ LISTADO DE CUENTAS POR PAGAR (resumen por proveedor) ============

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.creditoRepo
      .createQueryBuilder('cr')
      .leftJoinAndSelect('cr.tercero', 't')
      .where('cr.empresa_id = :empresaId', { empresaId })
      .andWhere('cr.tipo_credito IN (:...tipos)', {
        tipos: [TipoCredito.COMPRA, TipoCredito.MANUAL],
      })
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO })
      // Créditos manuales solo si el tercero es proveedor (tipo 2)
      .andWhere('(cr.tipo_credito = :compra OR t.tipo_terceros = 2)', {
        compra: TipoCredito.COMPRA,
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

    // Agrupar por proveedor
    const mapa = new Map<number, any>();
    // Datos de moneda de las compras origen (USD)
    const codigos = creditos.map((c) => c.documento_origen).filter(Boolean) as string[];
    const comprasUsd = codigos.length
      ? await this.creditoRepo.manager.getRepository(Purchase).find({
          where: { empresa_id: empresaId, codigo: In(codigos) },
        })
      : [];
    const docsPorCodigo = new Map<string, any>();
    for (const p of comprasUsd) {
      if (p.moneda_codigo && p.moneda_codigo !== 'COP') {
        docsPorCodigo.set(p.codigo, {
          moneda_codigo: p.moneda_codigo,
          tasa_cambio: Number(p.tasa_cambio),
          valor_moneda_extranjera: Number(p.valor_moneda_extranjera),
        });
      }
    }

    for (const cr of creditos) {
      const tid = cr.tercero_id;
      if (!mapa.has(tid)) {
        mapa.set(tid, {
          tercero_id: tid,
          nombre: cr.tercero?.nombre || '',
          documento: cr.tercero?.documento || '',
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
        // Datos de moneda (si la compra origen es en USD)
        ...docsPorCodigo.get(cr.documento_origen || ''),
      });
      entry.saldo_total = round2(entry.saldo_total + Number(cr.saldo));
    }

    // Calcular mora y cuotas vencidas
    const hoy = new Date().toISOString().split('T')[0];
    for (const entry of mapa.values()) {
      const cuotas = await this.cuotaRepo.find({
        where: {
          empresa_id: empresaId,
          credito_id: In(entry.creditos.map((c: any) => c.id)),
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

  // ============ DETALLE DE UN PROVEEDOR ============

  async findOne(terceroId: number, empresaId: number) {
    const proveedor = await this.thirdRepo.findOne({
      where: { id: terceroId, empresa_id: empresaId, tipo_terceros: 2 },
    });
    if (!proveedor) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    const creditos = await this.creditoRepo.find({
      where: {
        empresa_id: empresaId,
        tercero_id: terceroId,
        tipo_credito: In([TipoCredito.COMPRA, TipoCredito.MANUAL]),
      },
      relations: ['cuotas'],
      order: { fecha: 'DESC' },
    });

    const saldoTotal = creditos.reduce((acc, c) => acc + Number(c.saldo), 0);

    // Datos de moneda de las compras origen (USD)
    const codigosDoc = creditos.map((c) => c.documento_origen).filter(Boolean) as string[];
    const comprasDoc = codigosDoc.length
      ? await this.creditoRepo.manager.getRepository(Purchase).find({
          where: { empresa_id: empresaId, codigo: In(codigosDoc) },
        })
      : [];
    const docsMoneda = new Map<string, any>();
    for (const p of comprasDoc) {
      if (p.moneda_codigo && p.moneda_codigo !== 'COP') {
        docsMoneda.set(p.codigo, {
          moneda_codigo: p.moneda_codigo,
          tasa_cambio: Number(p.tasa_cambio),
          valor_moneda_extranjera: Number(p.valor_moneda_extranjera),
        });
      }
    }

    const movimientos = await this.lineRepo.find({
      where: { empresa_id: empresaId, tercero_id: terceroId },
      relations: ['cuenta_contable', 'asentado'],
      order: { id: 'DESC' },
    });

    return {
      tercero: proveedor,
      resumen: {
        saldo_total: round2(saldoTotal),
        creditos_activos: creditos.filter((c) => c.estado === EstadoCredito.ACTIVO).length,
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

    // Datos de moneda si la compra origen es en USD
    let moneda: any = null;
    if (credito.tipo_credito === TipoCredito.COMPRA && credito.documento_origen) {
      const compra = await this.creditoRepo.manager.getRepository(Purchase).findOne({
        where: { empresa_id: empresaId, codigo: credito.documento_origen },
      });
      if (compra && compra.moneda_codigo && compra.moneda_codigo !== 'COP') {
        const tasaFactura = Number(compra.tasa_cambio) || 0;
        const trm = await this.trmService.trmActual(empresaId);
        const tasaHoy = trm.tasa || tasaFactura;
        moneda = {
          codigo: compra.moneda_codigo,
          tasa_factura: tasaFactura,
          valor_moneda_extranjera: Number(compra.valor_moneda_extranjera) || 0,
          tasa_hoy: tasaHoy,
          trm_desactualizada: trm.desactualizada,
          saldo_moneda: tasaFactura > 0 ? round2(Number(credito.saldo) / tasaFactura) : 0,
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

  // ============ CREAR CRÉDITO MANUAL A PROVEEDOR ============

  async crearCredito(dto: CreateCreditoProveedorDto, empresaId: number, usuario: string) {
    const tercero = await this.thirdRepo.findOne({
      where: { id: dto.tercero_id, empresa_id: empresaId, tipo_terceros: 2 },
    });
    if (!tercero) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    if (!tercero.cuenta_contable_id) {
      throw new BadRequestException(
        `El proveedor ${tercero.nombre} no tiene cuenta contable asignada en el PUC`,
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

      // Asiento contable: crédito a cuenta por pagar del proveedor, débito a contrapartida
      const proveedorCuenta = await accountRepo.findOne({
        where: { id: tercero.cuenta_contable_id, empresa_id: empresaId },
      });
      if (!proveedorCuenta) {
        throw new BadRequestException('La cuenta contable del proveedor no existe');
      }

      const contrapartida = await this.buscarCuentaContrapartida(accountRepo, empresaId);
      if (!contrapartida) {
        throw new BadRequestException(
          'No se encontró una cuenta de contrapartida (gasto 5xxx/6xxx, inventario 14xx o banco 11xx) para registrar el crédito.',
        );
      }

      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivo = 'CP' + empresa.consecutivo_asientos.toString().padStart(6, '0');
      const monto = round2(dto.monto_total);

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: 3, // egreso
        fecha: dto.fecha,
        descripcion: dto.observacion || `Crédito manual a proveedor ${tercero.nombre}`,
        total_debito: monto,
        total_credito: monto,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      // En CxP: débito a contrapartida (gasto/banco), crédito a cuenta por pagar
      const lineas: Partial<AccountingEntryLine>[] = [
        {
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: contrapartida.id,
          tercero_id: tercero.id,
          descripcion: `Contrapartida crédito proveedor ${tercero.nombre}`,
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
          cuenta_contable_id: proveedorCuenta.id,
          tercero_id: tercero.id,
          descripcion: `Cuenta por pagar a ${tercero.nombre}`,
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

  // ============ REGISTRAR PAGO A PROVEEDOR ============

  async pagar(dto: RegistrarPagoDto, empresaId: number, usuario: string) {
    return this.dataSource.transaction(async (manager) => {
      const creditoRepo = manager.getRepository(Credito);
      const cuotaRepo = manager.getRepository(CuotaCredito);
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

      const proveedor = credito.tercero;
      if (!proveedor.cuenta_contable_id) {
        throw new BadRequestException(
          `El proveedor ${proveedor.nombre} no tiene cuenta contable asignada`,
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
        throw new BadRequestException('El valor del pago debe ser mayor a cero');
      }

      // Diferencia en cambio (NIIF 21): si la compra origen es en USD, el
      // pago se aplica a las cuotas a la TRM de la factura. La diferencia
      // entre el dinero pagado (a TRM de hoy) y el nominal aplicado va a
      // resultado: pérdida 5.3.05 / ganancia 4.2.10.
      let tasaPago = 0;
      let tasaFactura = 0;
      let montoNominal = monto;
      if (credito.tipo_credito === TipoCredito.COMPRA && credito.documento_origen) {
        const compraOrigen = await manager.getRepository(Purchase).findOne({
          where: { empresa_id: empresaId, codigo: credito.documento_origen },
        });
        if (
          compraOrigen &&
          compraOrigen.moneda_codigo &&
          compraOrigen.moneda_codigo !== 'COP' &&
          Number(compraOrigen.tasa_cambio) > 1
        ) {
          tasaFactura = Number(compraOrigen.tasa_cambio);
          tasaPago =
            Number(dto.tasa_pago) ||
            (await this.trmService.tasaParaFecha(empresaId, dto.fecha)) ||
            tasaFactura;
          montoNominal = round2((monto * tasaFactura) / tasaPago);
        }
      }

      // Descuento recibido: parte del saldo que el proveedor condona sin pago.
      // Contablemente es un ingreso: Cr 4.2.10.40 Descuentos comerciales.
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
            'No se encontró la cuenta de descuento recibido (4.2.10.40 Descuentos comerciales condicionados)',
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

      // Diferencia en cambio: dinero real pagado menos el nominal aplicado
      const diferenciaCambio = tasaFactura > 0 ? round2(monto - montoAplicar) : 0;

      // Comisión bancaria que el banco cobra sobre el pago (Art. 476 E.T.:
      // excluida de IVA por defecto; gravada → IVA 19% descontable) y
      // GMF 4x1000 (0.4%) como gasto bancario. Se pagan ADEMÁS del valor.
      const brutoBanco = round2(montoAplicar + diferenciaCambio); // salida al proveedor
      const comisionPct = Number(dto.comision_porcentaje) || 0;
      if (comisionPct < 0) {
        throw new BadRequestException('La comisión no puede ser negativa');
      }
      const comision = round2(brutoBanco * (comisionPct / 100));
      const ivaComision =
        dto.comision_gravada && comision > 0 ? round2(comision * 0.19) : 0;
      const gmf = dto.aplicar_gmf ? round2(brutoBanco * 0.004) : 0;
      const salidaTotal = round2(brutoBanco + comision + ivaComision + gmf);

      // Validar saldo del banco con la salida real (incluye diferencia y gastos)
      if (salidaTotal > Number(banco.monto)) {
        throw new BadRequestException(
          `El banco ${banco.nombre} no tiene saldo suficiente. Disponible: ${banco.monto}`,
        );
      }

      // Obtener cuotas pendientes
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

      // Distribuir pago entre cuotas
      // Orden: primero se cubre el interés acumulado, luego el saldo de la cuota
      let restante = montoAplicar;
      let interesPagado = 0;
      const cuotasActualizadas: CuotaCredito[] = [];

      for (const cuota of cuotas) {
        if (restante <= 0) break;

        // 1. Cubrir interés acumulado primero
        const interesPendiente = round2(Number(cuota.interes_acumulado || 0));
        if (interesPendiente > 0 && restante > 0) {
          const aplicarInteres = Math.min(restante, interesPendiente);
          cuota.interes_acumulado = round2(interesPendiente - aplicarInteres);
          restante = round2(restante - aplicarInteres);
          interesPagado = round2(interesPagado + aplicarInteres);
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

      // Distribuir el descuento recibido sobre el saldo restante de las cuotas
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

      // Cuenta de gasto financiero para el interés pagado (5.3.05.20 Intereses)
      let cuentaInteres: Account | null = null;
      if (interesPagado > 0) {
        cuentaInteres = await this.buscarCuentaInteresGasto(accountRepo, empresaId);
        if (!cuentaInteres) {
          throw new BadRequestException(
            'Se pagó interés moratorio pero no se encontró la cuenta de gasto 5.3.05.20 Intereses en el PUC',
          );
        }
        if (cuentaInteres.naturaleza !== 'D') {
          throw new BadRequestException(
            `La cuenta ${cuentaInteres.codigo} ${cuentaInteres.nombre} debe tener naturaleza Débito (es un gasto)`,
          );
        }
      }

      // Actualizar crédito (saldo baja por el pago + el descuento recibido)
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

      // Descontar banco (salida real: valor + comisión + IVA + GMF)
      banco.monto = round2(Number(banco.monto) - salidaTotal);
      await bancoRepo.save(banco);

      // Asiento contable (espejo: débito a cuenta por pagar, crédito a banco)
      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivo = 'PP' + empresa.consecutivo_asientos.toString().padStart(6, '0');
      const descripcion = dto.descripcion || `Pago a ${proveedor.nombre} - Crédito #${credito.id}`;
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

      // Cuenta de diferencia en cambio: pagar de más por TRM mayor es
      // pérdida (5.3.05); pagar de menos es ganancia (4.2.10).
      let cuentaDif: Account | null = null;
      if (diferenciaCambio !== 0) {
        cuentaDif = await cuentaDiferenciaCambio(
          accountRepo,
          empresaId,
          diferenciaCambio < 0, // pagar menos = ganancia → ingreso
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

      const montoTercero = round2(totalAplicado - interesPagado);
      const lineas: Partial<AccountingEntryLine>[] = [];
      if (diferenciaCambio > 0 && cuentaDif) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaDif.id,
          tercero_id: proveedor.id,
          descripcion: `Diferencia en cambio ${credito.documento_origen} (TRM ${tasaFactura} -> ${tasaPago})`,
          valor: diferenciaCambio,
          debito: diferenciaCambio,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (montoTercero > 0) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: proveedor.cuenta_contable_id,
          tercero_id: proveedor.id,
          descripcion: `Pago a ${proveedor.nombre}`,
          valor: montoTercero,
          debito: montoTercero,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (interesPagado > 0 && cuentaInteres) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaInteres.id,
          tercero_id: proveedor.id,
          descripcion: `Interés moratorio pagado a ${proveedor.nombre}`,
          valor: interesPagado,
          debito: interesPagado,
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
          tercero_id: proveedor.id,
          descripcion: `Comisión bancaria ${comisionPct}% pago ${credito.documento_origen || '#' + credito.id}`,
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
          tercero_id: proveedor.id,
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
          tercero_id: proveedor.id,
          descripcion: `GMF 4x1000 pago ${credito.documento_origen || '#' + credito.id}`,
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
      if (salidaTotal > 0) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: bancoCuenta.id,
          tercero_id: proveedor.id,
          descripcion: `Salida banco/caja pago a ${proveedor.nombre}`,
          valor: salidaTotal,
          debito: 0,
          credito: salidaTotal,
          naturaleza: 'C',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }
      if (diferenciaCambio < 0 && cuentaDif) {
        const v = Math.abs(diferenciaCambio);
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cuentaDif.id,
          tercero_id: proveedor.id,
          descripcion: `Diferencia en cambio ${credito.documento_origen} (TRM ${tasaFactura} -> ${tasaPago})`,
          valor: v,
          debito: 0,
          credito: v,
          naturaleza: 'C',
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
          tercero_id: proveedor.id,
          descripcion: `Descuento recibido de ${proveedor.nombre}`,
          valor: descuentoAplicar,
          debito: 0,
          credito: descuentoAplicar,
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
        interes_pagado: interesPagado,
        comision_aplicada: comision,
        iva_comision: ivaComision,
        gmf,
        salida_banco: salidaTotal,
      };
    });
  }

  // ============ POSFECHAR CUOTA ============

  async posfecharCuota(dto: PosfecharPagoDto, empresaId: number) {
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

  // ============ CUOTAS VENCIDAS (proveedores) ============

  async cuotasVencidas(empresaId: number, query?: any) {
    const hoy = new Date().toISOString().split('T')[0];

    const qb = this.cuotaRepo
      .createQueryBuilder('cq')
      .leftJoinAndSelect('cq.credito', 'cr')
      .leftJoinAndSelect('cr.tercero', 't')
      .where('cq.empresa_id = :empresaId', { empresaId })
      .andWhere('cq.estado != :pagada', { pagada: EstadoCuota.PAGADA })
      .andWhere('cr.tipo_credito IN (:...tipos)', { tipos: [TipoCredito.COMPRA, TipoCredito.MANUAL] })
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO })
      .andWhere('(cr.tipo_credito = :compra OR t.tipo_terceros = 2)', { compra: TipoCredito.COMPRA });

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

  // ============ MÉTODO INTERNO: Crear crédito desde compra ============

  async crearCreditoDesdeCompra(
    empresaId: number,
    terceroId: number,
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
      tipo_credito: TipoCredito.COMPRA,
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

    if (hoy <= fechaReferencia) {
      return Number(cuota.interes_acumulado || 0);
    }

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

  private async buscarCuentaContrapartida(
    accountRepo: Repository<Account>,
    empresaId: number,
  ): Promise<Account | null> {
    const cuentas = await accountRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    // Para un crédito manual a proveedor, la contrapartida lógica es:
    // 1. Cuenta de gasto/costo (5xxx, 6xxx) — lo más común al registrar una obligación
    // 2. Cuenta de inventario/mercancías (14xx) — si es por compra de existencias
    // 3. Cuenta de banco/caja (11xx) — si es un préstamo en efectivo del proveedor
    // Nunca una cuenta de pasivo (2xxx) porque sería el mismo lado del asiento
    return (
      cuentas.find((c) => /^5\./.test(c.codigo || '') || /^5\d/.test(c.codigo || '')) ||
      cuentas.find((c) => /^6\./.test(c.codigo || '') || /^6\d/.test(c.codigo || '')) ||
      cuentas.find((c) => /^1\.4/.test(c.codigo || '') || /^14/.test(c.codigo || '')) ||
      cuentas.find((c) => /^1\.1/.test(c.codigo || '') || /^11/.test(c.codigo || '')) ||
      null
    );
  }

  /**
   * Cuenta por defecto para el descuento recibido de proveedores:
   * 1. 4.2.10.40 Descuentos comerciales condicionados (ingreso no operacional)
   * 2. 4.2.10 Financieros / 4210
   */
  private async buscarCuentaDescuento(
    accountRepo: Repository<Account>,
    empresaId: number,
  ): Promise<Account | null> {
    const cuentas = await accountRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    const codigos = ['4.2.10.40', '4.2.10', '421040', '4210'];
    for (const codigo of codigos) {
      const found = cuentas.find(
        (c) => c.codigo === codigo || (c.codigo || '').startsWith(codigo + '.'),
      );
      if (found) return found;
    }
    return null;
  }

  /**
   * Cuenta de gasto financiero para intereses moratorios pagados:
   * 5.3.05.20 Intereses (o la subcuenta 5.3.05.x disponible).
   */
  private async buscarCuentaInteresGasto(
    accountRepo: Repository<Account>,
    empresaId: number,
  ): Promise<Account | null> {
    const cuentas = await accountRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    const codigos = ['5.3.05.20', '5.3.05', '530520', '5305'];
    for (const codigo of codigos) {
      const found = cuentas.find(
        (c) => c.codigo === codigo || (c.codigo || '').startsWith(codigo + '.'),
      );
      if (found) return found;
    }
    return null;
  }

  // ============ ANÁLISIS DE VENCIMIENTO CxP (ficha de vencimiento) ============

  /**
   * Clasifica las obligaciones con proveedores por rangos de días vencidos.
   * A diferencia de cartera, aquí no hay provisión: los pasivos no se
   * deterioran; el reporte sirve para programación de pagos y liquidez.
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
        tipos: [TipoCredito.COMPRA, TipoCredito.MANUAL],
      })
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO })
      .andWhere('(cr.tipo_credito = :compra OR t.tipo_terceros = 2)', {
        compra: TipoCredito.COMPRA,
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

    const data = Array.from(mapa.values()).sort((a, b) => b.total - a.total);

    return {
      data,
      totales,
      total_general: totalGeneral,
      interes_total: interesTotal,
      proveedores: data.length,
      rangos: [
        'al_dia', 'd1_30', 'd31_60', 'd61_90',
        'd91_180', 'd181_360', 'd361_720', 'mas_720',
      ],
    };
  }

  private bucketsVacios() {
    return {
      al_dia: 0,
      d1_30: 0,
      d31_60: 0,
      d61_90: 0,
      d91_180: 0,
      d181_360: 0,
      d361_720: 0,
      mas_720: 0,
    };
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
}
