import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
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
import {
  assertBalanced,
  resolveBancoCuenta,
  round2,
} from '../accounting/accounting-helpers';

const TIPO_ASIENTO_TESORERIA = 4;

@Injectable()
export class TesoreriaService {
  constructor(
    @InjectRepository(Tesoreria)
    private readonly repo: Repository<Tesoreria>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);

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
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivoAsiento =
        'TS' + empresa.consecutivo_asientos.toString().padStart(6, '0');

      const descripcion = dto.nombre_tercero
        ? `Tesorería ${dto.tipo === 1 ? 'ingreso' : 'egreso'} - ${dto.nombre_tercero}`
        : `Tesorería ${dto.tipo === 1 ? 'ingreso' : 'egreso'} ${dto.codigo}`;

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo: consecutivoAsiento,
        tipo: TIPO_ASIENTO_TESORERIA,
        fecha: dto.fecha,
        descripcion,
        total_debito: valor,
        total_credito: valor,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      // Líneas del asiento
      // Ingreso: D Banco / C Contrapartida
      // Egreso: D Contrapartida / C Banco
      const lineas: Partial<AccountingEntryLine>[] = [];

      if (dto.tipo === 1) {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: bancoCuenta.id,
          descripcion: `Entrada ${banco.nombre}`,
          valor,
          debito: valor,
          credito: 0,
          naturaleza: 'D',
          consecutivo: consecutivoAsiento,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: contraCuenta.id,
          descripcion: `Contrapartida ${contraCuenta.nombre}`,
          valor,
          debito: 0,
          credito: valor,
          naturaleza: 'C',
          consecutivo: consecutivoAsiento,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      } else {
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: contraCuenta.id,
          descripcion: `Contrapartida ${contraCuenta.nombre}`,
          valor,
          debito: valor,
          credito: 0,
          naturaleza: 'D',
          consecutivo: consecutivoAsiento,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
        lineas.push({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: bancoCuenta.id,
          descripcion: `Salida ${banco.nombre}`,
          valor,
          debito: 0,
          credito: valor,
          naturaleza: 'C',
          consecutivo: consecutivoAsiento,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }

      // Validar balance
      const balance = assertBalanced(
        lineas.map((l) => ({
          debito: Number(l.debito || 0),
          credito: Number(l.credito || 0),
        })),
      );

      asentadoGuardado.total_debito = balance.debito;
      asentadoGuardado.total_credito = balance.credito;
      await asentadoRepo.save(asentadoGuardado);

      await contabilidadRepo.save(
        lineas.map((l) => contabilidadRepo.create(l)),
      );

      // Vincular asiento al movimiento
      saved.asentado_id = asentadoGuardado.id;
      await tesoreriaRepo.save(saved);

      return saved;
    });
  }

  async update(id: number, empresaId: number, dto: UpdateTesoreriaDto) {
    const item = await this.findOne(id, empresaId);

    if (dto.codigo && dto.codigo !== item.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe un movimiento con ese código');
      }
    }

    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    await this.repo.remove(item);
  }
}
