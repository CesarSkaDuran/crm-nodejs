import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kardex } from './entities/kardex.entity';

@Injectable()
export class KardexService {
  constructor(
    @InjectRepository(Kardex)
    private readonly repo: Repository<Kardex>,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.repo
      .createQueryBuilder('k')
      .leftJoinAndSelect('k.producto', 'producto')
      .where('k.empresa_id = :empresaId', { empresaId })
      .orderBy('k.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.producto_id) {
      qb.andWhere('k.producto_id = :productoId', { productoId: query.producto_id });
    }

    if (query.tipo_documento) {
      qb.andWhere('k.tipo_documento = :tipo', { tipo: query.tipo_documento });
    }

    if (query.search) {
      qb.andWhere(
        '(k.consecutivo LIKE :search OR k.producto_id LIKE :search OR producto.nombre LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.date && !query.date2) {
      qb.andWhere('k.fecha >= :date', { date: query.date });
    }

    if (!query.date && query.date2) {
      qb.andWhere('k.fecha <= :date2', { date2: query.date2 });
    }

    if (query.date && query.date2) {
      qb.andWhere('k.fecha BETWEEN :date AND :date2', {
        date: query.date,
        date2: query.date2,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const movimiento = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['producto'],
    });
    if (!movimiento) {
      throw new NotFoundException('Movimiento de kardex no encontrado');
    }
    return movimiento;
  }

  async findByProducto(productoId: number, empresaId: number, query: any) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const [data, total] = await this.repo.findAndCount({
      where: { producto_id: productoId, empresa_id: empresaId },
      relations: ['producto'],
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }
}
