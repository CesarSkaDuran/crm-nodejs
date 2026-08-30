import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Moneda } from './entities/moneda.entity';
import { CreateMonedaDto } from './dto/create-moneda.dto';
import { UpdateMonedaDto } from './dto/update-moneda.dto';

@Injectable()
export class MonedasService {
  constructor(
    @InjectRepository(Moneda)
    private readonly repo: Repository<Moneda>,
  ) {}

  async create(dto: CreateMonedaDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { codigo: dto.codigo.toUpperCase(), empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('Ya existe una moneda con ese código en la empresa');
    }
    const entidad = this.repo.create({
      ...dto,
      codigo: dto.codigo.toUpperCase(),
      empresa_id: empresaId,
    });
    return this.repo.save(entidad);
  }

  findAll(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId },
      order: { es_local: 'DESC', orden: 'ASC', nombre: 'ASC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const entidad = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!entidad) throw new NotFoundException('Moneda no encontrada');
    return entidad;
  }

  async findLocal(empresaId: number) {
    const entidad = await this.repo.findOne({
      where: { empresa_id: empresaId, es_local: 1 },
    });
    if (!entidad) throw new NotFoundException('No hay moneda local configurada');
    return entidad;
  }

  async update(id: number, dto: UpdateMonedaDto, empresaId: number) {
    const entidad = await this.findOne(id, empresaId);
    if (dto.codigo && dto.codigo !== entidad.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo.toUpperCase(), empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe una moneda con ese código en la empresa');
      }
    }
    if (dto.codigo) dto.codigo = dto.codigo.toUpperCase();
    this.repo.merge(entidad, dto);
    return this.repo.save(entidad);
  }

  async remove(id: number, empresaId: number) {
    const entidad = await this.findOne(id, empresaId);
    entidad.estado = 0;
    return this.repo.save(entidad);
  }
}
