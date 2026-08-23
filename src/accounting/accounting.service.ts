import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AccountingEntry,
  AccountingEntryLine,
} from './entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { CreateAsentadoDto } from './dto/create-accounting-entry.dto';

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(AccountingEntry)
    private readonly entryRepo: Repository<AccountingEntry>,
    @InjectRepository(AccountingEntryLine)
    private readonly lineRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.entryRepo
      .createQueryBuilder('a')
      .where('a.empresa_id = :empresaId', { empresaId })
      .orderBy('a.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.consecutivo) {
      qb.andWhere('a.consecutivo = :consecutivo', { consecutivo: query.consecutivo });
    }

    if (query.search) {
      qb.andWhere(
        '(a.consecutivo LIKE :search OR a.descripcion LIKE :search OR a.usuario LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.date && !query.date2) {
      qb.andWhere('a.fecha >= :date', { date: query.date });
    }

    if (!query.date && query.date2) {
      qb.andWhere('a.fecha <= :date2', { date2: query.date2 });
    }

    if (query.date && query.date2) {
      qb.andWhere('a.fecha BETWEEN :date AND :date2', {
        date: query.date,
        date2: query.date2,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findAllLines(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 50)));

    const qb = this.lineRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cuenta_contable', 'cuenta')
      .leftJoinAndSelect('c.tercero', 'tercero')
      .where('c.empresa_id = :empresaId', { empresaId })
      .orderBy('c.id', 'DESC');

    if (query.search) {
      qb.andWhere(
        '(c.consecutivo LIKE :search OR c.descripcion LIKE :search OR cuenta.codigo LIKE :search OR cuenta.nombre LIKE :search OR tercero.nombre LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.consecutivo) {
      qb.andWhere('c.consecutivo = :consecutivo', {
        consecutivo: query.consecutivo,
      });
    }

    if (query.cuenta_contable_id) {
      qb.andWhere('c.cuenta_contable_id = :cuentaId', {
        cuentaId: query.cuenta_contable_id,
      });
    }

    if (query.tercero_id) {
      qb.andWhere('c.tercero_id = :terceroId', {
        terceroId: query.tercero_id,
      });
    }

    if (query.date && !query.date2) {
      qb.andWhere('c.fecha >= :date', { date: query.date });
    }

    if (!query.date && query.date2) {
      qb.andWhere('c.fecha <= :date2', { date2: query.date2 });
    }

    if (query.date && query.date2) {
      qb.andWhere('c.fecha BETWEEN :date AND :date2', {
        date: query.date,
        date2: query.date2,
      });
    }

    const totales = await qb
      .clone()
      .select('COALESCE(SUM(c.debito), 0)', 'debito')
      .addSelect('COALESCE(SUM(c.credito), 0)', 'credito')
      .orderBy()
      .getRawOne();

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      total_debito: Number(totales?.debito ?? 0),
      total_credito: Number(totales?.credito ?? 0),
    };
  }

  async findOne(id: number, empresaId: number) {
    const entry = await this.entryRepo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['detalles', 'detalles.cuenta_contable', 'detalles.tercero'],
    });
    if (!entry) {
      throw new NotFoundException('Asiento no encontrado');
    }
    return entry;
  }

  async create(dto: CreateAsentadoDto, empresaId: number, usuario: string) {
    const detalles: AccountingEntryLine[] = [];
    let totalDebito = 0;
    let totalCredito = 0;

    for (const d of dto.detalles) {
      const cuenta = await this.accountRepo.findOne({
        where: { id: d.cuenta_contable_id, empresa_id: empresaId },
      });
      if (!cuenta) {
        throw new BadRequestException(
          `La cuenta contable ${d.cuenta_contable_id} no existe`,
        );
      }

      const naturaleza = d.naturaleza ?? cuenta.naturaleza ?? 'D';
      const valor = Number(d.valor) || 0;
      const absValor = Math.abs(valor);

      let debito = 0;
      let credito = 0;

      if (valor >= 0) {
        if (naturaleza === 'D') {
          debito = absValor;
        } else {
          credito = absValor;
        }
      } else {
        if (naturaleza === 'D') {
          credito = absValor;
        } else {
          debito = absValor;
        }
      }

      totalDebito += debito;
      totalCredito += credito;

      detalles.push(
        this.lineRepo.create({
          empresa_id: empresaId,
          cuenta_contable_id: d.cuenta_contable_id,
          tercero_id: d.tercero_id ?? null,
          descripcion: d.descripcion ?? dto.descripcion ?? null,
          valor,
          debito,
          credito,
          naturaleza,
          consecutivo: dto.consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        }),
      );
    }

    if (Math.abs(totalDebito - totalCredito) > 0.001) {
      throw new BadRequestException(
        `El comprobante no cuadra: débito ${totalDebito}, crédito ${totalCredito}`,
      );
    }

    const entry = this.entryRepo.create({
      empresa_id: empresaId,
      consecutivo: dto.consecutivo,
      tipo: dto.tipo,
      fecha: dto.fecha,
      descripcion: dto.descripcion,
      total_debito: totalDebito,
      total_credito: totalCredito,
      usuario,
      detalles,
    });

    return this.entryRepo.save(entry);
  }

  async remove(id: number, empresaId: number) {
    const entry = await this.findOne(id, empresaId);
    await this.entryRepo.remove(entry);
  }
}
