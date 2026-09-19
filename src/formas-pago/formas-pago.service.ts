import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormaPago } from './entities/forma-pago.entity';
import { CreateFormaPagoDto } from './dto/create-forma-pago.dto';
import { UpdateFormaPagoDto } from './dto/update-forma-pago.dto';

const DEFAULTS = [
  { codigo_dian: 10, nombre: 'Efectivo' },
  { codigo_dian: 20, nombre: 'Cheque' },
  { codigo_dian: 42, nombre: 'Consignación bancaria' },
  { codigo_dian: 47, nombre: 'Transferencia débito bancaria' },
  { codigo_dian: 48, nombre: 'Transferencia crédito bancaria' },
  { codigo_dian: 49, nombre: 'Tarjeta débito' },
  { codigo_dian: 50, nombre: 'Tarjeta crédito' },
  { codigo_dian: 1, nombre: 'Otro (Billeteras digitales)' },
];

@Injectable()
export class FormasPagoService {
  constructor(
    @InjectRepository(FormaPago)
    private readonly repo: Repository<FormaPago>,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const count = await this.repo.count({ where: { empresa_id: empresaId } });
    if (count === 0) {
      await this.seedDefaults(empresaId);
    }

    const qb = this.repo
      .createQueryBuilder('f')
      .where('f.empresa_id = :empresaId', { empresaId })
      .orderBy('f.codigo_dian', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(f.nombre LIKE :search OR f.codigo_dian LIKE :search)',
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
      throw new NotFoundException('Forma de pago no encontrada');
    }
    return item;
  }

  async create(dto: CreateFormaPagoDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { codigo_dian: dto.codigo_dian, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('Ya existe una forma de pago con ese código DIAN');
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
    dto: UpdateFormaPagoDto,
  ) {
    const item = await this.findOne(id, empresaId);

    if (dto.codigo_dian && dto.codigo_dian !== item.codigo_dian) {
      const exists = await this.repo.findOne({
        where: { codigo_dian: dto.codigo_dian, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe una forma de pago con ese código DIAN');
      }
    }

    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    await this.repo.remove(item);
  }

  private async seedDefaults(empresaId: number) {
    const items = DEFAULTS.map((d) =>
      this.repo.create({ ...d, empresa_id: empresaId, estado: 1 }),
    );
    await this.repo.save(items);
  }
}
