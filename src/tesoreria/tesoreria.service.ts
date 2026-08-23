import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tesoreria } from './entities/tesoreria.entity';
import { CreateTesoreriaDto } from './dto/create-tesoreria.dto';
import { UpdateTesoreriaDto } from './dto/update-tesoreria.dto';

@Injectable()
export class TesoreriaService {
  constructor(
    @InjectRepository(Tesoreria)
    private readonly repo: Repository<Tesoreria>,
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
        '(t.nombre_tercero LIKE :search OR t.codigo LIKE :search OR t.cuenta_contable_id LIKE :search)',
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

  async create(dto: CreateTesoreriaDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { codigo: dto.codigo, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('Ya existe un movimiento con ese código');
    }

    const item = this.repo.create({
      ...dto,
      empresa_id: empresaId,
    });
    return this.repo.save(item);
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
