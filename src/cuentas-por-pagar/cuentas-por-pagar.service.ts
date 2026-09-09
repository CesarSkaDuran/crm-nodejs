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
import { resolveBancoCuenta, round2, assertBalanced } from '../accounting/accounting-helpers';

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
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO });

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

    return {
      ...credito,
      cuotas: cuotasConMora,
      pago_minimo: this.calcularPagoMinimo(credito),
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

    return this.dataSource.transaction(async (manager) => {
      const creditoRepo = manager.getRepository(Credito);
      const cuotaRepo = manager.getRepository(CuotaCredito);
      const accountRepo = manager.getRepository(Account);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);
      const empresaRepo = manager.getRepository(Company);

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
      for (let i = 1; i <= dto.numero_cuotas; i++) {
        const fechaOportuna = new Date(fechaBase);
        if (dto.periodo === PeriodoCredito.MENSUAL) {
          fechaOportuna.setMonth(fechaOportuna.getMonth() + i);
        } else {
          fechaOportuna.setDate(fechaOportuna.getDate() + dias * i);
        }
        cuotas.push(
          cuotaRepo.create({
            empresa_id: empresaId,
            credito_id: creditoGuardado.id,
            numero_cuota: i,
            valor: valorCuota,
            abonado: 0,
            saldo: valorCuota,
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

      return this.findCredito(creditoGuardado.id, empresaId);
    });
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

      const pagarTodo = dto.pagar_todo || monto >= Number(credito.saldo);
      const montoAplicar = pagarTodo ? round2(Number(credito.saldo)) : monto;

      // Validar saldo del banco
      if (montoAplicar > Number(banco.monto)) {
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
      const cuotasActualizadas: CuotaCredito[] = [];

      for (const cuota of cuotas) {
        if (restante <= 0) break;

        // 1. Cubrir interés acumulado primero
        const interesPendiente = round2(Number(cuota.interes_acumulado || 0));
        if (interesPendiente > 0 && restante > 0) {
          const aplicarInteres = Math.min(restante, interesPendiente);
          cuota.interes_acumulado = round2(interesPendiente - aplicarInteres);
          restante = round2(restante - aplicarInteres);
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

      await cuotaRepo.save(cuotasActualizadas);

      // Actualizar crédito
      credito.saldo = round2(Number(credito.saldo) - montoAplicar);
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

      // Descontar banco
      banco.monto = round2(Number(banco.monto) - montoAplicar);
      await bancoRepo.save(banco);

      // Asiento contable (espejo: débito a cuenta por pagar, crédito a banco)
      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivo = 'PP' + empresa.consecutivo_asientos.toString().padStart(6, '0');
      const descripcion = dto.descripcion || `Pago a ${proveedor.nombre} - Crédito #${credito.id}`;

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: dto.tipo_comprobante_id,
        fecha: dto.fecha,
        descripcion,
        total_debito: montoAplicar,
        total_credito: montoAplicar,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      const lineas: Partial<AccountingEntryLine>[] = [
        {
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: proveedor.cuenta_contable_id,
          tercero_id: proveedor.id,
          descripcion: `Pago a ${proveedor.nombre}`,
          valor: montoAplicar,
          debito: montoAplicar,
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
          cuenta_contable_id: bancoCuenta.id,
          tercero_id: proveedor.id,
          descripcion: `Salida banco/caja pago a ${proveedor.nombre}`,
          valor: montoAplicar,
          debito: 0,
          credito: montoAplicar,
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
      .andWhere('cr.estado != :anulado', { anulado: EstadoCredito.ANULADO });

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
    for (let i = 1; i <= numeroCuotas; i++) {
      const fechaOportuna = new Date(fechaBase);
      if (periodo === PeriodoCredito.MENSUAL) {
        fechaOportuna.setMonth(fechaOportuna.getMonth() + i);
      } else {
        fechaOportuna.setDate(fechaOportuna.getDate() + dias * i);
      }
      cuotas.push(
        cuotaRepo.create({
          empresa_id: empresaId,
          credito_id: creditoGuardado.id,
          numero_cuota: i,
          valor: valorCuota,
          abonado: 0,
          saldo: valorCuota,
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
}
