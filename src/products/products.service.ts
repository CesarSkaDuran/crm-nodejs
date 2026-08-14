import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { codigo: dto.codigo, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException(
        'El código de producto ya existe en esta empresa',
      );
    }
    const producto = this.repo.create({ ...dto, empresa_id: empresaId });
    return this.repo.save(producto);
  }

  findAll(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const producto = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['cuenta_inventarios', 'cuenta_costos', 'cuenta_ingresos'],
    });
    if (!producto) {
      throw new NotFoundException('Producto no encontrado');
    }
    return producto;
  }

  async update(id: number, empresaId: number, dto: UpdateProductDto) {
    const producto = await this.findOne(id, empresaId);
    if (dto.codigo && dto.codigo !== producto.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException(
          'El código de producto ya existe en esta empresa',
        );
      }
    }
    Object.assign(producto, dto);
    return this.repo.save(producto);
  }

  async remove(id: number, empresaId: number) {
    const producto = await this.findOne(id, empresaId);
    await this.repo.remove(producto);
  }
}
