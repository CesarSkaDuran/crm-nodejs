import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categoria } from './entities/categoria.entity';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria)
    private readonly repo: Repository<Categoria>,
  ) {}

  async create(dto: CreateCategoriaDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { nombre: dto.nombre, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }
    const item = this.repo.create({ ...dto, empresa_id: empresaId });
    return this.repo.save(item);
  }

  findAll(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId, estado: 1 },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!item) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return item;
  }

  async update(id: number, empresaId: number, dto: UpdateCategoriaDto) {
    const item = await this.findOne(id, empresaId);

    if (dto.nombre && dto.nombre !== item.nombre) {
      const exists = await this.repo.findOne({
        where: { nombre: dto.nombre, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('Ya existe una categoría con ese nombre');
      }
    }

    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    item.estado = 0;
    return this.repo.save(item);
  }
}
