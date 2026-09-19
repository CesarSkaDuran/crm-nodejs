import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PartidaRecurrente } from './entities/partida-recurrente.entity';
import {
  CreatePartidaRecurrenteDto,
  UpdatePartidaRecurrenteDto,
} from './dto/partida-recurrente.dto';

@Injectable()
export class PartidasRecurrentesService {
  constructor(
    @InjectRepository(PartidaRecurrente)
    private readonly repo: Repository<PartidaRecurrente>,
  ) {}

  findAll(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId },
      order: { tipo: 'ASC', nombre: 'ASC' },
    });
  }

  async create(dto: CreatePartidaRecurrenteDto, empresaId: number) {
    const partida = this.repo.create({ ...dto, empresa_id: empresaId });
    return this.repo.save(partida);
  }

  async update(id: number, dto: UpdatePartidaRecurrenteDto, empresaId: number) {
    const partida = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!partida) throw new NotFoundException('Partida recurrente no encontrada');
    Object.assign(partida, dto);
    return this.repo.save(partida);
  }

  async remove(id: number, empresaId: number) {
    const partida = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!partida) throw new NotFoundException('Partida recurrente no encontrada');
    await this.repo.delete(id);
    return { ok: true };
  }
}
