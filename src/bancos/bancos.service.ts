import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Banco } from './entities/banco.entity';
import { CreateBancoDto } from './dto/create-banco.dto';
import { UpdateBancoDto } from './dto/update-banco.dto';

@Injectable()
export class BancosService {
  constructor(
    @InjectRepository(Banco)
    private readonly repo: Repository<Banco>,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.repo
      .createQueryBuilder('b')
      .where('b.empresa_id = :empresaId', { empresaId })
      .orderBy('b.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere('b.nombre LIKE :search', { search: `%${query.search}%` });
    }

    if (query.tipo) {
      qb.andWhere('b.tipo = :tipo', { tipo: query.tipo });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!item) {
      throw new NotFoundException('Banco no encontrado');
    }
    return item;
  }

  async create(dto: CreateBancoDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { nombre: dto.nombre, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('Ya existe un banco con ese nombre');
    }

    const item = this.repo.create({
      ...dto,
      empresa_id: empresaId,
    });
    return this.repo.save(item);
  }

  async update(id: number, empresaId: number, dto: UpdateBancoDto) {
    const item = await this.findOne(id, empresaId);

    if (dto.nombre && dto.nombre !== item.nombre) {
      const exists = await this.repo.findOne({
        where: { nombre: dto.nombre, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe un banco con ese nombre');
      }
    }

    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    await this.repo.remove(item);
  }

  async descontar(id: number, monto: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    item.monto = Number(item.monto) - monto;
    return this.repo.save(item);
  }

  async agregar(id: number, monto: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    item.monto = Number(item.monto) + monto;
    return this.repo.save(item);
  }
}
