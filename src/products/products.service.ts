import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, Not } from 'typeorm';
import { Product } from './entities/product.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Account } from '../accounts/entities/account.entity';
import { Categoria } from '../categorias/entities/categoria.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(Categoria)
    private readonly categoriaRepo: Repository<Categoria>,
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
    // Validar que la categoría sea hoja (sin hijos)
    if (dto.categoria_id) {
      await this.validarCategoriaHoja(dto.categoria_id, empresaId);
      // Sincronizar campo categoria (texto) con el nombre
      const cat = await this.categoriaRepo.findOne({ where: { id: dto.categoria_id } });
      if (cat) dto.categoria = cat.nombre;
    }
    this.recalcularPrecios(dto as any);
    const producto = this.repo.create({ ...dto, empresa_id: empresaId });
    return this.repo.save(producto);
  }

  async findAll(empresaId: number, categoriaId?: number) {
    const where: any = { empresa_id: empresaId };
    if (categoriaId) {
      where.categoria_id = categoriaId;
    }
    return this.repo.find({
      where,
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
    // Validar que la categoría sea hoja (sin hijos)
    if (dto.categoria_id !== undefined && dto.categoria_id !== null) {
      await this.validarCategoriaHoja(dto.categoria_id, empresaId);
      const cat = await this.categoriaRepo.findOne({ where: { id: dto.categoria_id } });
      if (cat) dto.categoria = cat.nombre;
    } else if (dto.categoria_id === null) {
      dto.categoria = '';
    }
    // Combinar valores actuales con el DTO para poder recalcular
    const merged: Partial<Product> = { ...producto, ...dto };
    this.recalcularPrecios(merged);
    Object.assign(producto, merged);
    return this.repo.save(producto);
  }

  /**
   * Valida que una categoría sea hoja (no tenga subcategorías).
   * Solo las categorías hoja pueden asignarse a productos.
   */
  private async validarCategoriaHoja(categoriaId: number, empresaId: number) {
    const categoria = await this.categoriaRepo.findOne({
      where: { id: categoriaId, empresa_id: empresaId, estado: 1 },
    });
    if (!categoria) {
      throw new NotFoundException('La categoría seleccionada no existe');
    }
    const hijos = await this.categoriaRepo.count({
      where: { padre_id: categoriaId, empresa_id: empresaId, estado: 1 },
    });
    if (hijos > 0) {
      throw new BadRequestException(
        'Solo se pueden asignar categorías hoja (sin subcategorías) a los productos',
      );
    }
  }

  // ===========================================================================
  // CÁLCULO BIDIRECCIONAL DE MARGEN Y PRECIO DE VENTA
  // ===========================================================================
  // Fórmula de negocio: Precio Venta = Precio Compra / (1 - (Margen / 100))
  // - Si llegan precio_compra (ultimo_precio) y margen -> calcular pvp1
  // - Si llegan precio_compra y pvp1 -> calcular margen
  // - Si llegan pvp1 y margen -> recalcular precio_compra no, se respeta
  //   el precio de compra; en su lugar se recalcula pvp1 si ya hay precio
  //   de compra.
  // ===========================================================================
  private calcularPrecioVenta(precioCompra: number, margen: number): number {
    if (!precioCompra || precioCompra <= 0 || margen === undefined || margen === null) return 0;
    if (margen >= 100) return 0; // Evitar división por cero / valores imposibles
    const pvp = Number(precioCompra) / (1 - Number(margen) / 100);
    return Math.round(pvp * 100) / 100;
  }

  private calcularMargen(precioCompra: number, pvp: number): number {
    if (!precioCompra || precioCompra <= 0 || !pvp || pvp <= 0) return 0;
    // Margen sobre el precio de venta: (1 - precioCompra/pvp) * 100
    const margen = (1 - Number(precioCompra) / Number(pvp)) * 100;
    return Math.round(margen * 100) / 100;
  }

  private recalcularPrecios(producto: Partial<Product>) {
    const ultimo = Number(producto.ultimo_precio || 0);
    const margen = producto.margen !== undefined ? Number(producto.margen) : undefined;
    const pvp1 = producto.pvp1 !== undefined ? Number(producto.pvp1) : undefined;

    if (ultimo > 0 && margen !== undefined && margen >= 0) {
      // Caso 1: tenemos precio de compra y margen -> calcular pvp1
      producto.pvp1 = this.calcularPrecioVenta(ultimo, margen);
    } else if (ultimo > 0 && pvp1 !== undefined && pvp1 > 0) {
      // Caso 2: tenemos precio de compra y pvp1 -> calcular margen
      producto.margen = this.calcularMargen(ultimo, pvp1);
    }
    // Si solo llega margen y pvp1 sin ultimo_precio, no hay suficiente
    // información para recalcular nada (faltaría el costo).

    // Recalcular pvp4 si no se envió explícitamente
    const impuesto = Number(producto.impuesto ?? 19);
    if (producto.pvp4 === undefined || producto.pvp4 === null) {
      producto.pvp4 = Math.round(Number(producto.pvp1 || 0) * (1 + impuesto / 100) * 100) / 100;
    }
  }

  async remove(id: number, empresaId: number) {
    const producto = await this.findOne(id, empresaId);
    await this.repo.remove(producto);
  }

  /**
   * Importación masiva de productos desde Excel/CSV.
   *
   * Cada fila puede traer:
   *  - codigo (requerido)
   *  - nombre (requerido)
   *  - categoria (nombre de la categoría — se busca/crea automáticamente)
   *  - grupo (texto libre, opcional)
   *  - stock, ultimo_precio, margen, pvp1..pvp3, impuesto, etc.
   *
   * Si el producto ya existe (mismo codigo), se actualiza (upsert).
   * Si la categoría no existe, se crea como categoría hoja.
   *
   * Retorna: { creados, actualizados, errores, total }
   */
  async importar(
    filas: any[],
    empresaId: number,
  ): Promise<{ creados: number; actualizados: number; errores: any[]; total: number }> {
    const errores: any[] = [];
    let creados = 0;
    let actualizados = 0;

    // Pre-cargar todas las categorías de la empresa para evitar N queries
    const categoriasExistentes = await this.categoriaRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    const catMap = new Map<string, Categoria>();
    for (const c of categoriasExistentes) {
      catMap.set(c.nombre.toLowerCase().trim(), c);
    }

    // Pre-cargar productos existentes por código
    const codigos = filas
      .map((f) => (f.codigo ?? '').toString().trim())
      .filter((c) => c.length > 0);
    const productosExistentes = codigos.length
      ? await this.repo.find({
          where: codigos.map((codigo) => ({ codigo, empresa_id: empresaId })),
        })
      : [];
    const prodMap = new Map<string, Product>();
    for (const p of productosExistentes) {
      prodMap.set(p.codigo, p);
    }

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const filaNum = i + 2; // +2 porque la fila 1 es el header
      try {
        const codigo = (fila.codigo ?? '').toString().trim();
        const nombre = (fila.nombre ?? '').toString().trim();

        if (!codigo || !nombre) {
          errores.push({
            fila: filaNum,
            error: 'Código y nombre son obligatorios',
          });
          continue;
        }

        // Resolver categoría por nombre
        let categoriaId: number | undefined;
        const catNombre = (fila.categoria ?? '').toString().trim();
        if (catNombre) {
          const key = catNombre.toLowerCase();
          let cat = catMap.get(key);
          if (!cat) {
            // Crear la categoría como hoja
            cat = this.categoriaRepo.create({
              nombre: catNombre,
              empresa_id: empresaId,
              tipo: 1,
              estado: 1,
            });
            cat = await this.categoriaRepo.save(cat);
            catMap.set(key, cat);
          }
          categoriaId = cat.id;
        }

        // Construir DTO
        const dto: any = {
          codigo,
          nombre,
          descripcion: (fila.descripcion ?? '').toString().trim() || undefined,
          cod_barra: (fila.cod_barra ?? '').toString().trim() || undefined,
          referencia: (fila.referencia ?? '').toString().trim() || undefined,
          unidad_medida: (fila.unidad_medida ?? '').toString().trim() || undefined,
          grupo: (fila.grupo ?? '').toString().trim() || undefined,
          stock: Number(fila.stock || 0),
          stock_min: Number(fila.stock_min || 0),
          ultimo_precio: Number(fila.ultimo_precio || 0),
          margen: Number(fila.margen || 0),
          pvp1: Number(fila.pvp1 || 0),
          pvp2: Number(fila.pvp2 || 0),
          pvp3: Number(fila.pvp3 || 0),
          impuesto: Number(fila.impuesto ?? 19),
          descuento: Number(fila.descuento || 0),
          comision: Number(fila.comision || 0),
          peso: Number(fila.peso || 0),
          tipo: Number(fila.tipo || 1),
          estado: 1,
        };
        if (categoriaId) {
          dto.categoria_id = categoriaId;
        }

        this.recalcularPrecios(dto);

        const existente = prodMap.get(codigo);
        if (existente) {
          // Actualizar
          Object.assign(existente, dto);
          await this.repo.save(existente);
          actualizados++;
        } else {
          // Crear
          const producto = this.repo.create({ ...dto, empresa_id: empresaId } as any) as unknown as Product;
          const guardado = await this.repo.save(producto);
          prodMap.set(codigo, guardado);
          creados++;
        }
      } catch (err: any) {
        errores.push({
          fila: filaNum,
          error: err?.message || 'Error desconocido',
        });
      }
    }

    return { creados, actualizados, errores, total: filas.length };
  }

  private buscarCuenta(cuentas: Account[], keywords: string[]) {
    // Filtramos keywords vacíos/nulos y evitamos que valores muy cortos
    // (ej. IDs de categoría convertidos a string como "1", "2") colapsen
    // accidentalmente en cuentas raíz del PUC (ej. "1" = ACTIVO) al usar
    // codigo.startsWith(k). Solo se permite el match por código cuando el
    // keyword tiene al menos 2 caracteres (un prefijo real de código PUC).
    const limpios = (keywords || [])
      .map((k) => (k ?? '').toString().toLowerCase().trim())
      .filter((k) => k.length > 0);

    const coincide = (c: Account) =>
      limpios.some(
        (k) =>
          c.nombre.toLowerCase().includes(k) ||
          (k.length >= 2 && c.codigo.toLowerCase().startsWith(k)),
      );
    const coincidePorCodigo = (c: Account) =>
      limpios.some((k) => k.length >= 2 && c.codigo.toLowerCase().startsWith(k));

    // Preferimos SIEMPRE cuentas hoja (clasificacion 4 = auxiliar), ya que
    // son las únicas que deben recibir movimientos contables directos. Las
    // cuentas de clase/grupo/cuenta (1,2,3) suelen tener nombres genéricos
    // (ej. "INGRESOS", "COSTOS DE VENTA") que coinciden por texto con las
    // mismas palabras clave, causando que se sugiera por error una cuenta
    // de agrupación en vez de una auxiliar.
    const hojas = cuentas.filter((c) => Number(c.clasificacion) === 4);
    const noHojas = cuentas.filter((c) => Number(c.clasificacion) !== 4);

    return (
      hojas.find(coincide) ||
      hojas.find(coincidePorCodigo) ||
      noHojas.find(coincide) ||
      noHojas.find(coincidePorCodigo)
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
