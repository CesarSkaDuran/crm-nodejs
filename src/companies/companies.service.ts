import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from './entities/company.entity';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company)
    private readonly repo: Repository<Company>,
  ) {}

  async create(dto: CreateCompanyDto) {
    const exists = await this.repo.findOne({ where: { codigo: dto.codigo } });
    if (exists) {
      throw new ConflictException('El código de empresa ya existe');
    }
    const empresa = this.repo.create(dto);
    return this.repo.save(empresa);
  }

  findAll() {
    return this.repo.find({ order: { nombre: 'ASC' } });
  }

  async findOne(id: number) {
    const empresa = await this.repo.findOneBy({ id });
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return empresa;
  }

  async update(id: number, dto: UpdateCompanyDto) {
    const empresa = await this.findOne(id);
    if (dto.codigo && dto.codigo !== empresa.codigo) {
      const exists = await this.repo.findOne({ where: { codigo: dto.codigo } });
      if (exists) {
        throw new ConflictException('El código de empresa ya existe');
      }
    }
    Object.assign(empresa, dto);
    return this.repo.save(empresa);
  }

  async remove(id: number) {
    const empresa = await this.findOne(id);
    await this.repo.remove(empresa);
  }

  async guardarLogo(id: number, ruta: string) {
    const empresa = await this.findOne(id);
    // Eliminar logo anterior si existe
    if (empresa.logo) {
      const fs = await import('fs');
      const path = await import('path');
      const rutaAnterior = path.join(process.cwd(), empresa.logo);
      fs.promises.unlink(rutaAnterior).catch(() => {});
    }
    empresa.logo = ruta;
    return this.repo.save(empresa);
  }
}
