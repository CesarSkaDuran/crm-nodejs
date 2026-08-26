import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoComprobante } from './entities/tipo-comprobante.entity';
import { CreateTipoComprobanteDto } from './dto/create-tipo-comprobante.dto';
import { UpdateTipoComprobanteDto } from './dto/update-tipo-comprobante.dto';

@Injectable()
export class TipoComprobantesService {
  constructor(
    @InjectRepository(TipoComprobante)
    private readonly repo: Repository<TipoComprobante>,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.repo
      .createQueryBuilder('t')
      .where('t.empresa_id = :empresaId', { empresaId })
      .orderBy('t.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(t.nombre LIKE :search OR t.simple LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.tipo) {
      qb.andWhere('t.tipo = :tipo', { tipo: query.tipo });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!item) {
      throw new NotFoundException('Tipo de comprobante no encontrado');
    }
    return item;
  }

  async create(dto: CreateTipoComprobanteDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { nombre: dto.nombre, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException(
        'Ya existe un tipo de comprobante con ese nombre',
      );
    }

    const item = this.repo.create({
      ...dto,
      empresa_id: empresaId,
      consecutivo: dto.consecutivo ?? 1,
      estado: dto.estado ?? 1,
    });
    return this.repo.save(item);
  }

  async update(
    id: number,
    empresaId: number,
    dto: UpdateTipoComprobanteDto,
  ) {
    const item = await this.findOne(id, empresaId);

    if (dto.nombre && dto.nombre !== item.nombre) {
      const exists = await this.repo.findOne({
        where: { nombre: dto.nombre, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException(
          'Ya existe un tipo de comprobante con ese nombre',
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

  async nextConsecutivo(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    const consecutivo = item.consecutivo;
    item.consecutivo = consecutivo + 1;
    await this.repo.save(item);

    const numero = consecutivo.toString().padStart(4, '0');
    const prefijo = (item.prefijo || item.simple || '').trim();
    return { consecutivo: `${prefijo}${numero}` };
  }
}
