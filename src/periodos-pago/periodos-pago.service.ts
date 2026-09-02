import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PeriodoPago } from './entities/periodo-pago.entity';
import { CreatePeriodoPagoDto, UpdatePeriodoPagoDto } from './dto/periodo-pago.dto';

@Injectable()
export class PeriodosPagoService {
  constructor(
    @InjectRepository(PeriodoPago)
    private readonly repo: Repository<PeriodoPago>,
  ) {}

  async findAll(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId },
      order: { orden: 'ASC', id: 'ASC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!item) {
      throw new NotFoundException('Periodo de pago no encontrado');
    }
    return item;
  }

  async create(dto: CreatePeriodoPagoDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { nombre: dto.nombre, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('Ya existe un periodo de pago con ese nombre');
    }
    const item = this.repo.create({
      ...dto,
      empresa_id: empresaId,
      orden: dto.orden ?? 0,
      estado: dto.estado ?? 1,
    });
    return this.repo.save(item);
  }

  async update(id: number, empresaId: number, dto: UpdatePeriodoPagoDto) {
    const item = await this.findOne(id, empresaId);
    if (dto.nombre && dto.nombre !== item.nombre) {
      const exists = await this.repo.findOne({
        where: { nombre: dto.nombre, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe un periodo de pago con ese nombre');
      }
    }
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    await this.repo.remove(item);
  }

  /**
   * Inicializa los periodos por defecto si la empresa no tiene ninguno.
   * Se llama automáticamente al obtener el listado si está vacío.
   */
  async asegurarPeriodosPorDefecto(empresaId: number) {
    const count = await this.repo.count({
      where: { empresa_id: empresaId },
    });
    if (count > 0) return;

    const defaults = [
      { nombre: 'Semanal', dias: 7, orden: 1 },
      { nombre: 'Quincenal', dias: 15, orden: 2 },
      { nombre: 'Mensual', dias: 30, orden: 3 },
      { nombre: 'Bimestral', dias: 60, orden: 4 },
      { nombre: 'Trimestral', dias: 90, orden: 5 },
    ];

    for (const d of defaults) {
      const item = this.repo.create({ ...d, empresa_id: empresaId, estado: 1 });
      await this.repo.save(item);
    }
  }
}
