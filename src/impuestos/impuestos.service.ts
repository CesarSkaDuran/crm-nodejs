import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Impuesto } from './entities/impuesto.entity';
import { CreateImpuestoDto } from './dto/create-impuesto.dto';
import { UpdateImpuestoDto } from './dto/update-impuesto.dto';

@Injectable()
export class ImpuestosService {
  constructor(
    @InjectRepository(Impuesto)
    private readonly repo: Repository<Impuesto>,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.repo
      .createQueryBuilder('i')
      .where('i.empresa_id = :empresaId', { empresaId })
      .orderBy('i.codigo', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(i.codigo LIKE :search OR i.nombre LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!item) {
      throw new NotFoundException('Impuesto no encontrado');
    }
    return item;
  }

  async create(dto: CreateImpuestoDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { codigo: dto.codigo, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('Ya existe un impuesto con ese código');
    }

    const item = this.repo.create({
      ...dto,
      empresa_id: empresaId,
      estado: dto.estado ?? 1,
    });
    return this.repo.save(item);
  }

  async update(
    id: number,
    empresaId: number,
    dto: UpdateImpuestoDto,
  ) {
    const item = await this.findOne(id, empresaId);

    if (dto.codigo && dto.codigo !== item.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe un impuesto con ese código');
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
