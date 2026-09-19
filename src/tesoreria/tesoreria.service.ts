import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Tesoreria } from './entities/tesoreria.entity';
import { CreateTesoreriaDto } from './dto/create-tesoreria.dto';
import { UpdateTesoreriaDto } from './dto/update-tesoreria.dto';
import { Banco } from '../bancos/entities/banco.entity';
import { Account } from '../accounts/entities/account.entity';
import { Company } from '../companies/entities/company.entity';
import {
  AccountingEntry,
  AccountingEntryLine,
} from '../accounting/entities/accounting-entry.entity';
import { ConciliacionMovimiento } from '../conciliaciones/entities/conciliacion-movimiento.entity';
import { ConciliacionBancaria } from '../conciliaciones/entities/conciliacion-bancaria.entity';
import {
  assertBalanced,
  resolveBancoCuenta,
  round2,
} from '../accounting/accounting-helpers';
import { assertPeriodoAbierto } from '../accounting/accounting-helpers';
import { Cierre } from '../cierres/entities/cierre.entity';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TipoOperacion } from '../auditoria/entities/auditoria.entity';

const TIPO_ASIENTO_TESORERIA = 4;
const TIPO_ASIENTO_REVERSA = 6;

@Injectable()
export class TesoreriaService {
  constructor(
    @InjectRepository(Tesoreria)
    private readonly repo: Repository<Tesoreria>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.empresa_id = :empresaId', { empresaId })
      .orderBy('t.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(t.nombre_tercero LIKE :search OR t.codigo LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.date && !query.date2) {
      qb.andWhere('t.fecha >= :date', { date: query.date });
    }

    if (!query.date && query.date2) {
      qb.andWhere('t.fecha <= :date2', { date2: query.date2 });
    }

    if (query.date && query.date2) {
      qb.andWhere('t.fecha BETWEEN :date AND :date2', {
        date: query.date,
        date2: query.date2,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!item) {
      throw new NotFoundException('Movimiento de tesorería no encontrado');
    }
    return item;
  }

  async create(dto: CreateTesoreriaDto, empresaId: number, usuario: string) {
    return this.dataSource.transaction(async (manager) => {
      const tesoreriaRepo = manager.getRepository(Tesoreria);
      const bancoRepo = manager.getRepository(Banco);
      const cuentaRepo = manager.getRepository(Account);
      const empresaRepo = manager.getRepository(Company);

      await assertPeriodoAbierto(
        manager.getRepository(Cierre),
        empresaId,
        dto.fecha,
      );

      const exists = await tesoreriaRepo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe un movimiento con ese código');
      }

      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) {
        throw new NotFoundException('Empresa no encontrada');
      }

      const valor = round2(Number(dto.valor));
      if (valor <= 0) {
        throw new BadRequestException('El valor debe ser mayor a cero');
      }

      // Validar banco
      const banco = await bancoRepo.findOne({
        where: { id: dto.banco_id, empresa_id: empresaId },
      });
      if (!banco) {
        throw new NotFoundException('Banco/caja no encontrado');
      }

      const bancoCuenta = await resolveBancoCuenta(
        cuentaRepo,
        empresaId,
        banco.cuenta_id,
        banco.nombre,
      );

      // Validar cuenta de contrapartida
      const contraCuenta = await cuentaRepo.findOne({
        where: { id: dto.cuenta_contrapartida_id, empresa_id: empresaId },
      });
      if (!contraCuenta) {
        throw new BadRequestException(
          'La cuenta contable de contrapartida no existe en el PUC',
        );
      }

      // Afectar saldo del banco
      if (dto.tipo === 1) {
        // Ingreso: suma al banco
        banco.monto = round2(Number(banco.monto) + valor);
      } else {
        // Egreso: resta al banco
        if (Number(banco.monto) < valor) {
          throw new BadRequestException(
            `El banco ${banco.nombre} no tiene saldo suficiente`,
          );
        }
        banco.monto = round2(Number(banco.monto) - valor);
      }
      await bancoRepo.save(banco);

      // Crear movimiento de tesorería
      const item = tesoreriaRepo.create({
        ...dto,
        valor,
        empresa_id: empresaId,
      });
      const saved = await tesoreriaRepo.save(item);

      // Generar asiento contable
      const asentadoGuardado = await this.crearAsientoTesoreria(manager, {
        empresaId,
        usuario,
        fecha: dto.fecha,
        codigo: dto.codigo,
        tipo: dto.tipo,
        valor,
        nombreTercero: dto.nombre_tercero,
        bancoNombre: banco.nombre,
        bancoCuentaId: bancoCuenta.id,
        contraCuentaId: contraCuenta.id,
        contraCuentaNombre: contraCuenta.nombre,
      });

      // Vincular asiento al movimiento
      saved.asentado_id = asentadoGuardado.id;
      await tesoreriaRepo.save(saved);

      return saved;
    });
  }

  /**
   * Genera el asiento contable de un movimiento de tesorería.
   * Ingreso: D Banco / C Contrapartida — Egreso: D Contrapartida / C Banco.
   */
  private async crearAsientoTesoreria(
    manager: EntityManager,
    params: {
      empresaId: number;
      usuario: string;
      fecha: string;
      codigo: string;
      tipo: number;
      valor: number;
      nombreTercero?: string;
      bancoNombre: string;
      bancoCuentaId: number;
      contraCuentaId: number;
      contraCuentaNombre: string;
    },
  ): Promise<AccountingEntry> {
    const empresaRepo = manager.getRepository(Company);
    const asentadoRepo = manager.getRepository(AccountingEntry);
    const contabilidadRepo = manager.getRepository(AccountingEntryLine);

    const empresa = await empresaRepo.findOneBy({ id: params.empresaId });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }
    empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
    await empresaRepo.save(empresa);

    const consecutivoAsiento =
      'TS' + empresa.consecutivo_asientos.toString().padStart(6, '0');

    const esIngreso = params.tipo === 1;
    const descripcion = params.nombreTercero
      ? `Tesorería ${esIngreso ? 'ingreso' : 'egreso'} - ${params.nombreTercero}`
      : `Tesorería ${esIngreso ? 'ingreso' : 'egreso'} ${params.codigo}`;

    const asentado = asentadoRepo.create({
      empresa_id: params.empresaId,
      consecutivo: consecutivoAsiento,
      tipo: TIPO_ASIENTO_TESORERIA,
      fecha: params.fecha,
      descripcion,
      total_debito: params.valor,
      total_credito: params.valor,
      usuario: params.usuario,
      estado: 1,
    });
    const asentadoGuardado = await asentadoRepo.save(asentado);

    const lineas: Partial<AccountingEntryLine>[] = esIngreso
      ? [
          {
            cuenta_contable_id: params.bancoCuentaId,
            descripcion: `Entrada ${params.bancoNombre}`,
            debito: params.valor,
            credito: 0,
            naturaleza: 'D',
          },
          {
            cuenta_contable_id: params.contraCuentaId,
            descripcion: `Contrapartida ${params.contraCuentaNombre}`,
            debito: 0,
            credito: params.valor,
            naturaleza: 'C',
          },
        ]
      : [
          {
            cuenta_contable_id: params.contraCuentaId,
            descripcion: `Contrapartida ${params.contraCuentaNombre}`,
            debito: params.valor,
            credito: 0,
            naturaleza: 'D',
          },
          {
            cuenta_contable_id: params.bancoCuentaId,
            descripcion: `Salida ${params.bancoNombre}`,
            debito: 0,
            credito: params.valor,
            naturaleza: 'C',
          },
        ];

    for (const l of lineas) {
      l.empresa_id = params.empresaId;
      l.asentado_id = asentadoGuardado.id;
      l.valor = params.valor;
      l.consecutivo = consecutivoAsiento;
      l.fecha = params.fecha;
      l.usuario = params.usuario;
      l.estado = 1;
    }

    const balance = assertBalanced(
      lineas.map((l) => ({
        debito: Number(l.debito || 0),
        credito: Number(l.credito || 0),
      })),
    );
    asentadoGuardado.total_debito = balance.debito;
    asentadoGuardado.total_credito = balance.credito;
    await asentadoRepo.save(asentadoGuardado);

    await contabilidadRepo.save(lineas.map((l) => contabilidadRepo.create(l)));
    return asentadoGuardado;
  }

  /**
   * Reversa un asiento contable generando el asiento espejo (débitos y
   * créditos invertidos) y marcando el original como anulado. Devuelve el
   * asiento de reversión, o null si el asiento original no existía.
   */
  private async reversarAsiento(
    manager: EntityManager,
    empresaId: number,
    asentadoId: number,
    usuario: string,
    motivo: string,
  ): Promise<AccountingEntry | null> {
    const asentadoRepo = manager.getRepository(AccountingEntry);
    const contabilidadRepo = manager.getRepository(AccountingEntryLine);
    const empresaRepo = manager.getRepository(Company);

    const original = await asentadoRepo.findOne({
      where: { id: asentadoId, empresa_id: empresaId },
    });
    if (!original) return null;

    const lineasOriginales = await contabilidadRepo.find({
      where: { asentado_id: original.id },
    });

    const empresa = await empresaRepo.findOneBy({ id: empresaId });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }
    empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
    await empresaRepo.save(empresa);
    const consecutivo =
      'RT' + empresa.consecutivo_asientos.toString().padStart(6, '0');
    const fechaReversa = new Date().toISOString().split('T')[0];

    const reverso = asentadoRepo.create({
      empresa_id: empresaId,
      consecutivo,
      tipo: TIPO_ASIENTO_REVERSA,
      fecha: fechaReversa,
      descripcion: `${motivo} (reversa ${original.consecutivo})`,
      total_debito: 0,
      total_credito: 0,
      usuario,
      estado: 1,
    });
    const reversoGuardado = await asentadoRepo.save(reverso);

    const lineas = lineasOriginales.map((l) =>
      contabilidadRepo.create({
        empresa_id: empresaId,
        asentado_id: reversoGuardado.id,
        cuenta_contable_id: l.cuenta_contable_id,
        tercero_id: l.tercero_id,
        descripcion: `[REVERSA] ${l.descripcion}`,
        valor: Number(l.valor),
        debito: Number(l.credito),
        credito: Number(l.debito),
        naturaleza: Number(l.credito) > 0 ? 'D' : 'C',
        consecutivo,
        fecha: fechaReversa,
        usuario,
        estado: 1,
      }),
    );

    if (lineas.length) {
      const balance = assertBalanced(
        lineas.map((l) => ({
          debito: Number(l.debito || 0),
          credito: Number(l.credito || 0),
        })),
      );
      reversoGuardado.total_debito = balance.debito;
      reversoGuardado.total_credito = balance.credito;
      await asentadoRepo.save(reversoGuardado);
      await contabilidadRepo.save(lineas);
    }

    original.estado = 0;
    await asentadoRepo.save(original);
    return reversoGuardado;
  }

  /**
   * Edita un movimiento de tesorería manteniendo la integridad contable:
   * - Bloquea si la fecha actual o la nueva fecha caen en período cerrado.
   * - Si cambian datos que afectan la contabilidad (valor, tipo, banco,
   *   contrapartida, fecha), reversa el asiento anterior, restaura el saldo
   *   del banco original, aplica el efecto nuevo y genera un asiento nuevo.
   * El asiento reversado queda en el libro como traza de auditoría.
   */
  async update(
    id: number,
    empresaId: number,
    dto: UpdateTesoreriaDto,
    usuario: string,
  ) {
    const item = await this.findOne(id, empresaId);
    const cierreRepo = this.repo.manager.getRepository(Cierre);
    await assertPeriodoAbierto(cierreRepo, empresaId, item.fecha);
    if (dto.fecha) {
      await assertPeriodoAbierto(cierreRepo, empresaId, dto.fecha);
    }

    if (dto.codigo && dto.codigo !== item.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe un movimiento con ese código');
      }
    }

    // Valores efectivos después del merge
    const nuevoValor =
      dto.valor !== undefined ? round2(Number(dto.valor)) : Number(item.valor);
    const nuevoTipo = dto.tipo !== undefined ? Number(dto.tipo) : Number(item.tipo);
    const nuevoBancoId =
      dto.banco_id !== undefined ? Number(dto.banco_id) : Number(item.banco_id);
    const nuevaContrapartida =
      dto.cuenta_contrapartida_id !== undefined
        ? Number(dto.cuenta_contrapartida_id)
        : Number(item.cuenta_contrapartida_id);
    const nuevaFecha = dto.fecha ?? item.fecha;
    const nuevoTercero =
      dto.nombre_tercero !== undefined ? dto.nombre_tercero : item.nombre_tercero;

    if (nuevoValor <= 0) {
      throw new BadRequestException('El valor debe ser mayor a cero');
    }
    if (nuevoTipo !== 1 && nuevoTipo !== 2) {
      throw new BadRequestException('tipo debe ser 1 (ingreso) o 2 (egreso)');
    }

    const afectaContabilidad =
      nuevoValor !== Number(item.valor) ||
      nuevoTipo !== Number(item.tipo) ||
      nuevoBancoId !== Number(item.banco_id) ||
      nuevaContrapartida !== Number(item.cuenta_contrapartida_id) ||
      String(nuevaFecha).slice(0, 10) !== String(item.fecha).slice(0, 10);

    // Si el movimiento está vinculado a una conciliación bancaria activa,
    // cualquier edición la dessincronizaría: hay que anularla primero.
    await this.assertSinConciliacionActiva(item.id, empresaId);

    // Sin asiento previo ni cambios contables: edición simple (código,
    // nombre de tercero, etc.) sin mover contabilidad ni bancos.
    if (!afectaContabilidad) {
      const anterior = { ...item };
      Object.assign(item, dto);
      const saved = await this.repo.save(item);
      await this.auditoria.registrar(
        empresaId,
        'tesoreria',
        item.id,
        TipoOperacion.ACTUALIZAR,
        usuario,
        anterior,
        saved,
        `Movimiento ${item.codigo} editado (sin cambios contables)`,
      );
      return saved;
    }

    const anterior = { ...item };

    return this.dataSource.transaction(async (manager) => {
      const tesoreriaRepo = manager.getRepository(Tesoreria);
      const bancoRepo = manager.getRepository(Banco);
      const cuentaRepo = manager.getRepository(Account);

      // 1. Revertir el efecto del movimiento viejo en el banco original
      const bancoAnterior = await bancoRepo.findOne({
        where: { id: item.banco_id, empresa_id: empresaId },
      });
      if (bancoAnterior) {
        bancoAnterior.monto =
          Number(item.tipo) === 1
            ? round2(Number(bancoAnterior.monto) - Number(item.valor))
            : round2(Number(bancoAnterior.monto) + Number(item.valor));
        await bancoRepo.save(bancoAnterior);
      }

      // 2. Reversar el asiento anterior (queda la traza en el libro)
      if (item.asentado_id) {
        await this.reversarAsiento(
          manager,
          empresaId,
          item.asentado_id,
          usuario,
          `Reversión por edición del movimiento ${item.codigo}`,
        );
      }

      // 3. Validar banco y contrapartida nuevos, y aplicar el efecto nuevo
      const bancoNuevo = await bancoRepo.findOne({
        where: { id: nuevoBancoId, empresa_id: empresaId },
      });
      if (!bancoNuevo) {
        throw new NotFoundException('Banco/caja no encontrado');
      }
      const bancoCuenta = await resolveBancoCuenta(
        cuentaRepo,
        empresaId,
        bancoNuevo.cuenta_id,
        bancoNuevo.nombre,
      );
      const contraCuenta = await cuentaRepo.findOne({
        where: { id: nuevaContrapartida, empresa_id: empresaId },
      });
      if (!contraCuenta) {
        throw new BadRequestException(
          'La cuenta contable de contrapartida no existe en el PUC',
        );
      }

      if (nuevoTipo === 1) {
        bancoNuevo.monto = round2(Number(bancoNuevo.monto) + nuevoValor);
      } else {
        if (Number(bancoNuevo.monto) < nuevoValor) {
          throw new BadRequestException(
            `El banco ${bancoNuevo.nombre} no tiene saldo suficiente`,
          );
        }
        bancoNuevo.monto = round2(Number(bancoNuevo.monto) - nuevoValor);
      }
      await bancoRepo.save(bancoNuevo);

      // 4. Nuevo asiento con los datos actualizados
      const nuevoAsiento = await this.crearAsientoTesoreria(manager, {
        empresaId,
        usuario,
        fecha: nuevaFecha,
        codigo: dto.codigo ?? item.codigo,
        tipo: nuevoTipo,
        valor: nuevoValor,
        nombreTercero: nuevoTercero,
        bancoNombre: bancoNuevo.nombre,
        bancoCuentaId: bancoCuenta.id,
        contraCuentaId: contraCuenta.id,
        contraCuentaNombre: contraCuenta.nombre,
      });

      // 5. Guardar el movimiento apuntando al asiento nuevo
      Object.assign(item, dto);
      item.valor = nuevoValor;
      item.tipo = nuevoTipo;
      item.banco_id = nuevoBancoId;
      item.cuenta_contrapartida_id = nuevaContrapartida;
      item.fecha = nuevaFecha;
      item.asentado_id = nuevoAsiento.id;
      const saved = await tesoreriaRepo.save(item);

      await this.auditoria.registrar(
        empresaId,
        'tesoreria',
        item.id,
        TipoOperacion.ACTUALIZAR,
        usuario,
        {
          valor: anterior.valor,
          tipo: anterior.tipo,
          banco_id: anterior.banco_id,
          cuenta_contrapartida_id: anterior.cuenta_contrapartida_id,
          fecha: anterior.fecha,
          asentado_id: anterior.asentado_id,
        },
        {
          valor: saved.valor,
          tipo: saved.tipo,
          banco_id: saved.banco_id,
          cuenta_contrapartida_id: saved.cuenta_contrapartida_id,
          fecha: saved.fecha,
          asentado_id: saved.asentado_id,
        },
        `Movimiento ${saved.codigo} editado: asiento reversado y regenerado`,
      );

      return saved;
    });
  }

  /**
   * Elimina un movimiento restaurando el saldo del banco y reversando su
   * asiento contable, para no dejar saldos fantasma en los informes.
   * Bloquea si la fecha cae en un período cerrado.
   */
  async remove(
    id: number,
    empresaId: number,
    usuario = 'sistema',
    omitirBloqueoConciliacion = false,
  ) {
    const item = await this.findOne(id, empresaId);
    await assertPeriodoAbierto(
      this.repo.manager.getRepository(Cierre),
      empresaId,
      item.fecha,
    );

    return this.dataSource.transaction(async (manager) => {
      const tesoreriaRepo = manager.getRepository(Tesoreria);
      const bancoRepo = manager.getRepository(Banco);
      const concMovRepo = manager.getRepository(ConciliacionMovimiento);

      // Bloquear si está vinculado a una conciliación activa (salvo cuando
      // la propia conciliación lo está revirtiendo al anularse)
      if (!omitirBloqueoConciliacion) {
        const vinculo = await concMovRepo.findOne({
          where: { empresa_id: empresaId, tesoreria_id: item.id },
        });
        if (vinculo) {
          const conc = await manager
            .getRepository(ConciliacionBancaria)
            .findOne({
              where: { id: vinculo.conciliacion_id, empresa_id: empresaId },
            });
          if (conc && Number(conc.estado) === 1) {
            throw new BadRequestException(
              'Este movimiento está vinculado a una conciliación bancaria conciliada. Anule la conciliación primero.',
            );
          }
        }
      }

      // Restaurar saldo del banco
      const banco = await bancoRepo.findOne({
        where: { id: item.banco_id, empresa_id: empresaId },
      });
      if (banco) {
        banco.monto =
          Number(item.tipo) === 1
            ? round2(Number(banco.monto) - Number(item.valor))
            : round2(Number(banco.monto) + Number(item.valor));
        await bancoRepo.save(banco);
      }

      // Reversar el asiento contable (queda la traza en el libro)
      if (item.asentado_id) {
        await this.reversarAsiento(
          manager,
          empresaId,
          item.asentado_id,
          usuario,
          `Reversión por eliminación del movimiento ${item.codigo}`,
        );
      }

      // Desvincular partidas de conciliación que referencien este movimiento
      await concMovRepo.update(
        { empresa_id: empresaId, tesoreria_id: item.id },
        { tesoreria_id: null },
      );

      await tesoreriaRepo.remove(item);

      await this.auditoria.registrar(
        empresaId,
        'tesoreria',
        item.id,
        TipoOperacion.ELIMINAR,
        usuario,
        {
          codigo: item.codigo,
          valor: item.valor,
          tipo: item.tipo,
          banco_id: item.banco_id,
          asentado_id: item.asentado_id,
        },
        null,
        `Movimiento ${item.codigo} eliminado con reversa contable`,
      );

      return { ok: true, id };
    });
  }

  /**
   * Bloquea cambios contables sobre movimientos vinculados a una
   * conciliación bancaria ya conciliada: editarlos rompería la relación
   * libro vs extracto. El camino correcto es anular la conciliación.
   */
  private async assertSinConciliacionActiva(
    tesoreriaId: number,
    empresaId: number,
  ) {
    const vinculo = await this.repo.manager
      .getRepository(ConciliacionMovimiento)
      .findOne({
        where: { empresa_id: empresaId, tesoreria_id: tesoreriaId },
      });
    if (!vinculo) return;

    const conc = await this.repo.manager
      .getRepository(ConciliacionBancaria)
      .findOne({
        where: { id: vinculo.conciliacion_id, empresa_id: empresaId },
      });
    if (conc && Number(conc.estado) === 1) {
      throw new BadRequestException(
        'Este movimiento está vinculado a una conciliación bancaria conciliada. Anule la conciliación primero.',
      );
    }
  }
}
