import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipoDocumento } from './entities/tipo-documento.entity';
import { CreateTipoDocumentoDto } from './dto/create-tipo-documento.dto';
import { UpdateTipoDocumentoDto } from './dto/update-tipo-documento.dto';

@Injectable()
export class TiposDocumentoService {
  constructor(
    @InjectRepository(TipoDocumento)
    private readonly repo: Repository<TipoDocumento>,
  ) {}

  create(dto: CreateTipoDocumentoDto, empresaId: number) {
    const entidad = this.repo.create({ ...dto, empresa_id: empresaId });
    return this.repo.save(entidad);
  }

  findAll(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId },
      order: { orden: 'ASC', nombre: 'ASC' },
    });
  }

  findOne(id: number, empresaId: number) {
    return this.repo.findOne({ where: { id, empresa_id: empresaId } });
  }

  async update(id: number, dto: UpdateTipoDocumentoDto, empresaId: number) {
    const entidad = await this.findOne(id, empresaId);
    if (!entidad) throw new NotFoundException('Tipo de documento no encontrado');
    this.repo.merge(entidad, dto);
    return this.repo.save(entidad);
  }

  async remove(id: number, empresaId: number) {
    const entidad = await this.findOne(id, empresaId);
    if (!entidad) throw new NotFoundException('Tipo de documento no encontrado');
    entidad.estado = 0;
    return this.repo.save(entidad);
  }
}
