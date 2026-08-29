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
import { Account } from '../accounts/entities/account.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
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
    // Calcular pvp4 automáticamente si no se envía: pvp1 + IVA
    if (dto.pvp4 === undefined || dto.pvp4 === null) {
      const iva = Number(dto.impuesto || 19);
      dto.pvp4 = Math.round(Number(dto.pvp1 || 0) * (1 + iva / 100) * 100) / 100;
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
    // Recalcular pvp4 si se actualiza pvp1 o impuesto pero no pvp4
    if ((dto.pvp1 !== undefined || dto.impuesto !== undefined) && dto.pvp4 === undefined) {
      const pvp1 = Number(dto.pvp1 ?? producto.pvp1);
      const iva = Number(dto.impuesto ?? producto.impuesto ?? 19);
      dto.pvp4 = Math.round(pvp1 * (1 + iva / 100) * 100) / 100;
    }
    Object.assign(producto, dto);
    return this.repo.save(producto);
  }

  async remove(id: number, empresaId: number) {
    const producto = await this.findOne(id, empresaId);
    await this.repo.remove(producto);
  }

  private buscarCuenta(cuentas: Account[], keywords: string[]) {
    const porNombre = cuentas.find((c) =>
      keywords.some(
        (k) =>
          c.nombre.toLowerCase().includes(k) ||
          c.codigo.toLowerCase().startsWith(k),
      ),
    );
    if (porNombre) return porNombre;
    return cuentas.find((c) =>
      keywords.some((k) => c.codigo.toLowerCase().startsWith(k)),
    );
  }

  async sugerirCuentas(tipo: number, categoria: string, empresaId: number) {
    const cuentas = await this.accountRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });

    const categoriaLower = (categoria || '').toLowerCase();

    const ingresos = this.buscarCuenta(cuentas, [
      'ingreso',
      'venta',
      'ingresos por venta',
      'ingresos operacionales',
      '41',
      categoriaLower,
    ]);

    if (tipo !== 1) {
      return {
        cuenta_inventarios_id: null,
        cuenta_costos_id: null,
        cuenta_ingresos_id: ingresos?.id ?? null,
      };
    }

    const inventarios = this.buscarCuenta(cuentas, [
      'inventario',
      'mercancia',
      'existencia',
      'activo corriente',
      '1105',
      '11',
      categoriaLower,
    ]);

    const costos = this.buscarCuenta(cuentas, [
      'costo de venta',
      'costos de ventas',
      'costo',
      '61',
      categoriaLower,
    ]);

    return {
      cuenta_inventarios_id: inventarios?.id ?? null,
      cuenta_costos_id: costos?.id ?? null,
      cuenta_ingresos_id: ingresos?.id ?? null,
    };
  }
}
