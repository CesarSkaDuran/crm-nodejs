import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { existsSync, unlink } from 'fs';
import { join } from 'path';
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

  /**
   * Genera el siguiente código disponible con formato PDT0001, PDT0002...
   * Toma el mayor consecutivo existente que empiece por 'PDT' y suma 1,
   * verificando en un bucle que no exista (evita colisiones).
   */
  private async generarCodigo(empresaId: number): Promise<string> {
    const ultimo = await this.repo
      .createQueryBuilder('p')
      .where('p.empresa_id = :empresaId', { empresaId })
      .andWhere("p.codigo LIKE 'PDT%'")
      .orderBy('p.codigo', 'DESC')
      .getOne();

    let consecutivo = 1;
    if (ultimo?.codigo) {
      const numero = parseInt(ultimo.codigo.replace(/^PDT/i, ''), 10);
      if (!isNaN(numero)) consecutivo = numero + 1;
    }

    let codigo = `PDT${consecutivo.toString().padStart(4, '0')}`;
    while (
      await this.repo.findOne({ where: { codigo, empresa_id: empresaId } })
    ) {
      consecutivo++;
      codigo = `PDT${consecutivo.toString().padStart(4, '0')}`;
    }
    return codigo;
  }

  async create(dto: CreateProductDto, empresaId: number) {
    // Si no viene código, se autogenera
    if (!dto.codigo?.trim()) {
      dto.codigo = await this.generarCodigo(empresaId);
    } else {
      dto.codigo = dto.codigo.trim();
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
    if (dto.categoria_id) {
      await this.validarCategoriaHoja(dto.categoria_id, empresaId);
      // Sincronizar campo categoria (texto) con el nombre
      const cat = await this.categoriaRepo.findOne({ where: { id: dto.categoria_id } });
      if (cat) dto.categoria = cat.nombre;
    }
    this.recalcularPrecios(dto as any);
    await this.asignarCuentasPorDefecto(dto as any, empresaId);
    const producto = this.repo.create({ ...dto, empresa_id: empresaId });
    return this.repo.save(producto);
  }

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 10)));

    const qb = this.repo
      .createQueryBuilder('p')
      .where('p.empresa_id = :empresaId', { empresaId })
      .orderBy('p.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.categoria_id) {
      qb.andWhere('p.categoria_id = :categoriaId', {
        categoriaId: query.categoria_id,
      });
    }

    if (query.search) {
      qb.andWhere(
        '(p.nombre LIKE :search OR p.codigo LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
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

  async updateImagen(
    id: number,
    empresaId: number,
    ruta: string,
    index: number,
  ) {
    const producto = await this.findOne(id, empresaId);
    const campo: 'imagen1' | 'imagen2' = index === 1 ? 'imagen1' : 'imagen2';
    const anterior = producto[campo];

    producto[campo] = ruta;
    const saved = await this.repo.save(producto);

    if (anterior && anterior.startsWith('/uploads/productos/')) {
      const rutaAnterior = join(process.cwd(), anterior);
      if (existsSync(rutaAnterior)) {
        try {
          unlink(rutaAnterior, () => {});
        } catch {}
      }
    }

    return saved;
  }

  async update(id: number, empresaId: number, dto: UpdateProductDto) {
    const producto = await this.findOne(id, empresaId);
    // Si llega código vacío, conservar el existente
    if (dto.codigo !== undefined && !dto.codigo.trim()) {
      delete dto.codigo;
    }
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
    await this.asignarCuentasPorDefecto(merged, empresaId);
    Object.assign(producto, merged);
    // `findOne` carga las relaciones (cuenta_inventarios, cuenta_costos,
    // cuenta_ingresos) junto con sus columnas *_id. Si dejamos los objetos
    // de relación desactualizados, TypeORM los usa para resolver la FK al
    // guardar y termina sobrescribiendo el *_id nuevo con el id de la
    // relación vieja. Los eliminamos para que solo se use la columna *_id.
    delete (producto as any).cuenta_inventarios;
    delete (producto as any).cuenta_costos;
    delete (producto as any).cuenta_ingresos;
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

  /**
   * Asigna cuentas contables por defecto si el producto no las trae.
   * Busca en el PUC por palabras clave relacionadas con inventarios,
   * costos de venta e ingresos por venta.
   */
  private async asignarCuentasPorDefecto(producto: Partial<Product>, empresaId: number) {
    const cuentas = await this.accountRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });
    if (!cuentas.length) return;

    const categoriaLower = (producto.categoria || '').toLowerCase();
    const tipo = producto.tipo ?? 1;

    // Inventarios (solo para productos)
    if (tipo === 1 && !producto.cuenta_inventarios_id) {
      const inv = this.buscarCuenta(cuentas, [
        'inventario',
        'mercancia',
        'existencia',
        'activo corriente',
        '1105',
        '11',
        categoriaLower,
      ]);
      if (inv) producto.cuenta_inventarios_id = inv.id;
    }

    // Costos (solo para productos)
    if (tipo === 1 && !producto.cuenta_costos_id) {
      const costo = this.buscarCuenta(cuentas, [
        'costo de venta',
        'costos de ventas',
        'costo',
        '61',
        categoriaLower,
      ]);
      if (costo) producto.cuenta_costos_id = costo.id;
    }

    // Ingresos (productos y servicios)
    if (!producto.cuenta_ingresos_id) {
      const ingreso = this.buscarCuenta(cuentas, [
        'ingreso',
        'venta',
        'ingresos por venta',
        'ingresos operacionales',
        '41',
        categoriaLower,
      ]);
      if (ingreso) producto.cuenta_ingresos_id = ingreso.id;
    }
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
    // accidentalmente en cuentas raíz del PUC.
    const limpios = (keywords || [])
      .map((k) => (k ?? '').toString().toLowerCase().trim())
      .filter((k) => k.length > 0);

    if (!limpios.length) return undefined;

    const palabras = (nombre: string) =>
      nombre.toLowerCase().split(/[^a-z0-9áéíóúñ]+/).filter((w) => w.length > 0);

    let mejor: { cuenta: Account; score: number } | null = null;

    for (const c of cuentas) {
      // Solo usamos cuentas hoja (clasificacion 4 = auxiliar), salvo que no
      // haya ninguna hoja y una no-hoja tenga un match muy fuerte por código.
      const esHoja = Number(c.clasificacion) === 4;

      let score = 0;
      const words = palabras(c.nombre);

      for (const k of limpios) {
        const nombreLower = c.nombre.toLowerCase();
        const codigoLower = c.codigo.toLowerCase();

        // Coincidencia exacta de palabra completa (mayor prioridad)
        if (words.some((w) => w === k)) {
          score += esHoja ? 100 : 40;
        }
        // Palabra que empiece con la keyword (ej. "ingreso" -> "ingresos")
        else if (words.some((w) => w.startsWith(k) && w.length <= k.length + 3)) {
          score += esHoja ? 70 : 30;
        }
        // Nombre empieza con la keyword
        else if (nombreLower.startsWith(k)) {
          score += esHoja ? 80 : 35;
        }
        // El nombre contiene la keyword pero no como palabra completa
        // (menor prioridad, evita matches accidentales como "retenciones sobre ingresos")
        else if (nombreLower.includes(k)) {
          score += esHoja ? 15 : 5;
        }

        // Coincidencia por código PUC
        if (k.length >= 2) {
          if (codigoLower.startsWith(k)) {
            score += esHoja ? 60 : 20;
          } else if (codigoLower.includes(k)) {
            score += esHoja ? 10 : 2;
          }
        }
      }

      // Penalizar fuertemente cuentas de agrupación que no sean hoja
      if (!esHoja) {
        score -= 25;
      }

      if (score > 0 && (!mejor || score > mejor.score)) {
        mejor = { cuenta: c, score };
      }
    }

    // Solo devolvemos si el score es razonable (evita matches débiles)
    return mejor && mejor.score >= 30 ? mejor.cuenta : undefined;
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
