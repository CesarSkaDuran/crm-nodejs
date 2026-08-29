import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Categoria } from './entities/categoria.entity';
import { Product } from '../products/entities/product.entity';
import { CreateCategoriaDto } from './dto/create-categoria.dto';
import { UpdateCategoriaDto } from './dto/update-categoria.dto';

@Injectable()
export class CategoriasService {
  constructor(
    @InjectRepository(Categoria)
    private readonly repo: Repository<Categoria>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
  ) {}

  async create(dto: CreateCategoriaDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { nombre: dto.nombre, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }

    // Validar padre si se especifica
    if (dto.padre_id) {
      const padre = await this.repo.findOne({
        where: { id: dto.padre_id, empresa_id: empresaId, estado: 1 },
      });
      if (!padre) {
        throw new NotFoundException('La categoría padre no existe');
      }
    }

    const item = this.repo.create({ ...dto, empresa_id: empresaId });
    return this.repo.save(item);
  }

  /**
   * Devuelve todas las categorías en estructura jerárquica (árbol)
   */
  async findTree(empresaId: number) {
    const todas = await this.repo.find({
      where: { empresa_id: empresaId, estado: 1 },
      order: { nombre: 'ASC' },
    });

    // Contar productos por categoría
    const categoriasIds = todas.map((c) => c.id);
    const conteo = await this.productRepo
      .createQueryBuilder('p')
      .select('p.categoria_id', 'categoria_id')
      .addSelect('COUNT(*)', 'total')
      .where('p.empresa_id = :empresaId', { empresaId })
      .andWhere('p.categoria_id IN (:...ids)', { ids: categoriasIds.length ? categoriasIds : [0] })
      .andWhere('p.estado = 1')
      .groupBy('p.categoria_id')
      .getRawMany();

    const mapaConteo = new Map<number, number>();
    conteo.forEach((c) => mapaConteo.set(Number(c.categoria_id), Number(c.total)));

    // Construir árbol
    const mapa = new Map<number, any>();
    todas.forEach((c) => {
      mapa.set(c.id, {
        ...c,
        hijos: [],
        total_productos: mapaConteo.get(c.id) || 0,
      });
    });

    const raices: any[] = [];
    todas.forEach((c) => {
      const nodo = mapa.get(c.id);
      if (c.padre_id && mapa.has(c.padre_id)) {
        mapa.get(c.padre_id).hijos.push(nodo);
      } else {
        raices.push(nodo);
      }
    });

    // Calcular total_productos recursivo (incluye hijos)
    const calcularTotal = (nodo: any): number => {
      let total = nodo.total_productos || 0;
      if (nodo.hijos && nodo.hijos.length) {
        for (const h of nodo.hijos) {
          total += calcularTotal(h);
        }
      }
      nodo.total_productos_acum = total;
      return total;
    };
    raices.forEach(calcularTotal);

    return raices;
  }

  /**
   * Devuelve todas las categorías en lista plana (con nombre del padre)
   */
  async findAll(empresaId: number) {
    const todas = await this.repo.find({
      where: { empresa_id: empresaId, estado: 1 },
      relations: ['padre'],
      order: { nombre: 'ASC' },
    });

    // Contar productos
    const categoriasIds = todas.map((c) => c.id);
    const conteo = await this.productRepo
      .createQueryBuilder('p')
      .select('p.categoria_id', 'categoria_id')
      .addSelect('COUNT(*)', 'total')
      .where('p.empresa_id = :empresaId', { empresaId })
      .andWhere('p.categoria_id IN (:...ids)', { ids: categoriasIds.length ? categoriasIds : [0] })
      .andWhere('p.estado = 1')
      .groupBy('p.categoria_id')
      .getRawMany();

    const mapaConteo = new Map<number, number>();
    conteo.forEach((c) => mapaConteo.set(Number(c.categoria_id), Number(c.total)));

    return todas.map((c) => ({
      ...c,
      nombre_padre: c.padre?.nombre || null,
      total_productos: mapaConteo.get(c.id) || 0,
    }));
  }

  /**
   * Devuelve solo las categorías raíz (sin padre)
   */
  findRaices(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId, estado: 1, padre_id: IsNull() },
      order: { nombre: 'ASC' },
    });
  }

  /**
   * Devuelve los hijos directos de una categoría
   */
  findHijos(padreId: number, empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId, estado: 1, padre_id: padreId },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['padre', 'hijos'],
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

    // Validar que no se asigne como padre a sí mismo o a un descendiente (evitar ciclos)
    if (dto.padre_id !== undefined && dto.padre_id !== null) {
      if (dto.padre_id === id) {
        throw new BadRequestException('Una categoría no puede ser su propio padre');
      }
      // Verificar que el nuevo padre no sea descendiente del actual
      const esDescendiente = await this.esDescendiente(dto.padre_id, id, empresaId);
      if (esDescendiente) {
        throw new BadRequestException('No se puede asignar como padre a una subcategoría propia (crearía un ciclo)');
      }
    }

    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);

    // Verificar que no tenga hijos
    const hijos = await this.repo.count({
      where: { padre_id: id, empresa_id: empresaId, estado: 1 },
    });
    if (hijos > 0) {
      throw new BadRequestException('No se puede eliminar una categoría que tiene subcategorías');
    }

    // Verificar que no tenga productos asociados
    const productos = await this.productRepo.count({
      where: { categoria_id: id, empresa_id: empresaId, estado: 1 },
    });
    if (productos > 0) {
      throw new BadRequestException('No se puede eliminar una categoría que tiene productos asociados');
    }

    item.estado = 0;
    return this.repo.save(item);
  }

  /**
   * Verifica si `posibleDescendienteId` es descendiente de `ancestroId`
   */
  private async esDescendiente(posibleDescendienteId: number, ancestroId: number, empresaId: number): Promise<boolean> {
    let actual = posibleDescendienteId;
    const visitados = new Set<number>();

    while (actual && !visitados.has(actual)) {
      visitados.add(actual);
      if (actual === ancestroId) return true;

      const cat = await this.repo.findOne({
        where: { id: actual, empresa_id: empresaId },
      });
      if (!cat || !cat.padre_id) return false;
      actual = cat.padre_id;
    }
    return false;
  }
}
