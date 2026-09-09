import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoTercero } from './entities/tipo-tercero.entity';
import { CreateTipoTerceroDto } from './dto/create-tipo-tercero.dto';
import { UpdateTipoTerceroDto } from './dto/update-tipo-tercero.dto';

@Injectable()
export class TiposTerceroService {
  constructor(
    @InjectRepository(TipoTercero)
    private readonly repo: Repository<TipoTercero>,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.empresa_id = :empresaId', { empresaId })
      .orderBy('t.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere('t.nombre LIKE :search', { search: `%${query.search}%` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!item) {
      throw new NotFoundException('Tipo de tercero no encontrado');
    }
    return item;
  }

  async create(dto: CreateTipoTerceroDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { nombre: dto.nombre, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException(
        'Ya existe un tipo de tercero con ese nombre',
      );
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
    dto: UpdateTipoTerceroDto,
  ) {
    const item = await this.findOne(id, empresaId);

    if (dto.nombre && dto.nombre !== item.nombre) {
      const exists = await this.repo.findOne({
        where: { nombre: dto.nombre, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException(
          'Ya existe un tipo de tercero con ese nombre',
        );
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
