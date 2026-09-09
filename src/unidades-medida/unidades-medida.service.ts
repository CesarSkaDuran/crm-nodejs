import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnidadMedida } from './entities/unidad-medida.entity';
import { CreateUnidadMedidaDto } from './dto/create-unidad-medida.dto';
import { UpdateUnidadMedidaDto } from './dto/update-unidad-medida.dto';

@Injectable()
export class UnidadesMedidaService {
  constructor(
    @InjectRepository(UnidadMedida)
    private readonly repo: Repository<UnidadMedida>,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.repo
      .createQueryBuilder('u')
      .where('u.empresa_id = :empresaId', { empresaId })
      .orderBy('u.codigo', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(u.codigo LIKE :search OR u.nombre LIKE :search)',
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
      throw new NotFoundException('Unidad de medida no encontrada');
    }
    return item;
  }

  async create(dto: CreateUnidadMedidaDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { codigo: dto.codigo, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException(
        'Ya existe una unidad de medida con ese código',
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
    dto: UpdateUnidadMedidaDto,
  ) {
    const item = await this.findOne(id, empresaId);

    if (dto.codigo && dto.codigo !== item.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException(
          'Ya existe una unidad de medida con ese código',
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
