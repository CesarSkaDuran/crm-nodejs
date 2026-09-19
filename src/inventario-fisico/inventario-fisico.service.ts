import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { InventarioFisico, EstadoInventario } from './entities/inventario-fisico.entity';
import { DetalleInventarioFisico } from './entities/detalle-inventario-fisico.entity';
import { Product } from '../products/entities/product.entity';
import { Company } from '../companies/entities/company.entity';
import { Kardex } from '../kardex/entities/kardex.entity';
import { AccountingEntry, AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { CreateInventarioDto, ConsolidarInventarioDto, FinalizarInventarioDto } from './dto/inventario-fisico.dto';
import { round2, assertBalanced, assertPeriodoAbierto } from '../accounting/accounting-helpers';
import { Cierre } from '../cierres/entities/cierre.entity';

@Injectable()
export class InventarioFisicoService {
  constructor(
    @InjectRepository(InventarioFisico)
    private readonly invRepo: Repository<InventarioFisico>,
    @InjectRepository(DetalleInventarioFisico)
    private readonly detRepo: Repository<DetalleInventarioFisico>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crea un nuevo inventario físico y genera los detalles con el stock actual del sistema
   */
  async crear(dto: CreateInventarioDto, empresaId: number, usuario: string) {
    // Validar que no haya otro inventario pendiente
    const pendiente = await this.invRepo.findOne({
      where: { empresa_id: empresaId, estado: In([EstadoInventario.PENDIENTE, EstadoInventario.INCOMPLETO]) },
    });
    if (pendiente) {
      throw new BadRequestException(
        `Ya existe un inventario en proceso (${pendiente.codigo}). Debe finalizarlo antes de crear uno nuevo.`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const invRepo = manager.getRepository(InventarioFisico);
      const detRepo = manager.getRepository(DetalleInventarioFisico);
      const productRepo = manager.getRepository(Product);
      const companyRepo = manager.getRepository(Company);

      // Generar consecutivo
      const empresa = await companyRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');

      const consecutivo = (empresa.consecutivo_asientos || 0) + 1;
      const codigo = 'INV' + consecutivo.toString().padStart(6, '0');

      // Crear inventario
      const inventario = invRepo.create({
        empresa_id: empresaId,
        codigo,
        fecha: dto.fecha,
        estado: EstadoInventario.PENDIENTE,
        observacion: dto.observacion,
        usuario,
      });
      const invGuardado = await invRepo.save(inventario);

      // Cargar todos los productos activos con stock
      const productos = await productRepo.find({
        where: { empresa_id: empresaId, estado: 1 },
        order: { nombre: 'ASC' },
      });

      if (productos.length === 0) {
        throw new BadRequestException('No hay productos activos para inventariar');
      }

      // Crear detalles con stock y COSTO PROMEDIO del sistema (el mismo que
      // usa el kardex — NO el precio de venta).
      const detalles = productos.map((p) =>
        detRepo.create({
          inventario_id: invGuardado.id,
          empresa_id: empresaId,
          producto_id: p.id,
          codigo_producto: p.codigo,
          nombre_producto: p.nombre,
          costo_unitario: Number(p.promedio || p.ultimo_precio || 0),
          cantidad_sistema: Number(p.stock || 0),
          conteo: 0,
          diferencia: 0,
          valor_conteo: 0,
          estado: 1, // 1 = pendiente de conteo
        }),
      );
      await detRepo.save(detalles);

      // Actualizar valor_sistema
      const valorSistema = detalles.reduce(
        (acc, d) => acc + Number(d.costo_unitario) * Number(d.cantidad_sistema),
        0,
      );
      invGuardado.valor_sistema = round2(valorSistema);
      await invRepo.save(invGuardado);

      return { ...invGuardado, detalles };
    });
  }

  /**
   * Lista todos los inventarios físicos
   */
  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 10)));

    const qb = this.invRepo
      .createQueryBuilder('i')
      .where('i.empresa_id = :empresaId', { empresaId })
      .orderBy('i.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.date && query.date2) {
      qb.andWhere('i.fecha BETWEEN :date AND :date2', {
        date: query.date,
        date2: `${query.date2} 23:59:59`,
      });
    } else if (query.date) {
      qb.andWhere('i.fecha >= :date', { date: query.date });
    } else if (query.date2) {
      qb.andWhere('i.fecha <= :date2', {
        date2: `${query.date2} 23:59:59`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  /**
   * Obtiene un inventario con sus detalles
   */
  async findOne(id: number, empresaId: number) {
    const inventario = await this.invRepo.findOne({
      where: { id, empresa_id: empresaId },
      relations: [],
    });
    if (!inventario) {
      throw new NotFoundException('Inventario no encontrado');
    }

    const detalles = await this.detRepo.find({
      where: { inventario_id: id, empresa_id: empresaId },
      order: { nombre_producto: 'ASC' },
    });

    return { ...inventario, detalles };
  }

  /**
   * Obtiene el inventario pendiente actual (si existe)
   */
  async findPendiente(empresaId: number) {
    const inventario = await this.invRepo.findOne({
      where: {
        empresa_id: empresaId,
        estado: In([EstadoInventario.PENDIENTE, EstadoInventario.INCOMPLETO]),
      },
      order: { id: 'DESC' },
    });

    if (!inventario) return null;

    const detalles = await this.detRepo.find({
      where: { inventario_id: inventario.id, empresa_id: empresaId },
      order: { nombre_producto: 'ASC' },
    });

    return { ...inventario, detalles };
  }

  /**
   * Registra los conteos físicos (consolidación). Se puede llamar varias
   * veces: cada llamada actualiza los productos enviados y recalcula los
   * totales con TODOS los detalles contados hasta el momento.
   */
  async consolidar(id: number, dto: ConsolidarInventarioDto, empresaId: number) {
    const inventario = await this.invRepo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!inventario) {
      throw new NotFoundException('Inventario no encontrado');
    }
    if (![EstadoInventario.PENDIENTE, EstadoInventario.INCOMPLETO].includes(inventario.estado)) {
      throw new BadRequestException('El inventario no admite conteos (ya fue finalizado o anulado)');
    }

    return this.dataSource.transaction(async (manager) => {
      const detRepo = manager.getRepository(DetalleInventarioFisico);
      const invRepo = manager.getRepository(InventarioFisico);

      for (const c of dto.conteos) {
        const detalle = await detRepo.findOne({
          where: { inventario_id: id, producto_id: c.producto_id, empresa_id: empresaId },
        });
        if (!detalle) continue;

        detalle.conteo = Number(c.conteo);
        detalle.diferencia = round2(Number(detalle.cantidad_sistema) - Number(c.conteo));
        detalle.valor_conteo = round2(Number(detalle.costo_unitario) * Number(c.conteo));
        detalle.estado = 2; // contado
        await detRepo.save(detalle);
      }

      // Totales con TODOS los detalles contados (no solo los de esta llamada)
      const todos = await detRepo.find({
        where: { inventario_id: id, empresa_id: empresaId, estado: 2 },
      });
      const valorConteoTotal = todos.reduce((s, d) => s + Number(d.valor_conteo || 0), 0);

      inventario.valor_conteo = round2(valorConteoTotal);
      inventario.diferencia = round2(Number(inventario.valor_sistema) - valorConteoTotal);
      inventario.estado = EstadoInventario.INCOMPLETO;
      await invRepo.save(inventario);

      return { ...inventario, detalles: await detRepo.find({ where: { inventario_id: id, empresa_id: empresaId }, order: { nombre_producto: 'ASC' } }) };
    });
  }

  /**
   * Guarda los conteos parcialmente sin cambiar el estado del inventario.
   * Permite al usuario ir registrando conteos y continuar después.
   */
  async guardarParcial(id: number, dto: ConsolidarInventarioDto, empresaId: number) {
    const inventario = await this.invRepo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!inventario) {
      throw new NotFoundException('Inventario no encontrado');
    }
    if (![EstadoInventario.PENDIENTE, EstadoInventario.INCOMPLETO].includes(inventario.estado)) {
      throw new BadRequestException('Solo se pueden guardar conteos parciales en inventarios en proceso');
    }

    return this.dataSource.transaction(async (manager) => {
      const detRepo = manager.getRepository(DetalleInventarioFisico);
      const invRepo = manager.getRepository(InventarioFisico);

      for (const c of dto.conteos) {
        const detalle = await detRepo.findOne({
          where: { inventario_id: id, producto_id: c.producto_id, empresa_id: empresaId },
        });
        if (!detalle) continue;

        detalle.conteo = Number(c.conteo);
        detalle.diferencia = round2(Number(detalle.cantidad_sistema) - Number(c.conteo));
        detalle.valor_conteo = round2(Number(detalle.costo_unitario) * Number(c.conteo));
        detalle.estado = 2; // contado
        await detRepo.save(detalle);
      }

      const todos = await detRepo.find({
        where: { inventario_id: id, empresa_id: empresaId, estado: 2 },
      });
      const valorConteoTotal = todos.reduce((s, d) => s + Number(d.valor_conteo || 0), 0);

      // Actualizar totales sin cambiar el estado
      inventario.valor_conteo = round2(valorConteoTotal);
      inventario.diferencia = round2(Number(inventario.valor_sistema) - valorConteoTotal);
      await invRepo.save(inventario);

      return { ...inventario, detalles: await detRepo.find({ where: { inventario_id: id, empresa_id: empresaId }, order: { nombre_producto: 'ASC' } }) };
    });
  }

  /**
   * Finaliza el inventario: ajusta stock, genera asientos contables y kardex
   */
  async finalizar(id: number, dto: FinalizarInventarioDto, empresaId: number, usuario: string) {
    const inventario = await this.invRepo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!inventario) {
      throw new NotFoundException('Inventario no encontrado');
    }
    if (![EstadoInventario.PENDIENTE, EstadoInventario.INCOMPLETO].includes(inventario.estado)) {
      throw new BadRequestException('El inventario ya fue finalizado o anulado');
    }

    return this.dataSource.transaction(async (manager) => {
      const detRepo = manager.getRepository(DetalleInventarioFisico);
      const invRepo = manager.getRepository(InventarioFisico);
      const productRepo = manager.getRepository(Product);
      const kardexRepo = manager.getRepository(Kardex);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);
      const accountRepo = manager.getRepository(Account);
      const companyRepo = manager.getRepository(Company);

      await assertPeriodoAbierto(
        manager.getRepository(Cierre),
        empresaId,
        inventario.fecha,
      );

      const detalles = await detRepo.find({
        where: { inventario_id: id, empresa_id: empresaId },
      });

      // No se puede finalizar con productos sin contar: serían tratados como
      // faltantes y se pondría su stock en cero.
      const sinContar = detalles.filter((d) => Number(d.estado) !== 2);
      if (sinContar.length > 0) {
        throw new BadRequestException(
          `Faltan ${sinContar.length} producto(s) por contar (ej: ${sinContar
            .slice(0, 3)
            .map((d) => d.codigo_producto)
            .join(', ')}). Registre el conteo o anule el inventario.`,
        );
      }

      const detallesConDiferencia = detalles.filter((d) => Number(d.diferencia) !== 0);

      if (detallesConDiferencia.length === 0) {
        // No hay diferencias, solo finalizar
        inventario.estado = EstadoInventario.GUARDADO;
        if (dto.observacion) inventario.observacion = dto.observacion;
        await invRepo.save(inventario);
        return { inventario, ajustes: 0, mensaje: 'Inventario finalizado sin diferencias' };
      }

      // Cuentas PUC: usar las configuradas en cada producto; fallback a
      // auxiliares del plan (PUC punteado: 1.4 inventarios, 6.1 costo,
      // 4.2 otros ingresos para sobrantes).
      const cuentas = await accountRepo.find({
        where: { empresa_id: empresaId, estado: 1 },
      });
      const aux = (prefijo: string) =>
        cuentas.find(
          (c) =>
            (c.codigo || '').startsWith(prefijo) &&
            Number(c.clasificacion) === 4,
        );
      const cuentaInvFallback = aux('1.4');
      const cuentaCostoFallback = aux('6.1') || aux('5.3') || aux('7.1');
      const cuentaIngresoSobrante = aux('4.2') || aux('4.');

      // Generar asiento contable de ajuste
      const empresa = await companyRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await companyRepo.save(empresa);

      const consecutivo = 'AJ' + empresa.consecutivo_asientos.toString().padStart(6, '0');
      const lineas: Partial<AccountingEntryLine>[] = [];

      // Procesar cada diferencia
      for (const det of detallesConDiferencia) {
        const producto = await productRepo.findOne({ where: { id: det.producto_id, empresa_id: empresaId } });
        if (!producto) continue;

        const cuentaInventarioId = producto.cuenta_inventarios_id || cuentaInvFallback?.id;
        if (!cuentaInventarioId) {
          throw new BadRequestException(
            `El producto ${producto.codigo} no tiene cuenta de inventarios y no hay auxiliar 1.4 en el PUC`,
          );
        }
        const costoUnitario = Number(det.costo_unitario) || Number(producto.promedio) || 0;
        const cantidadAjuste = Math.abs(Number(det.diferencia));
        const valorAjuste = round2(cantidadAjuste * costoUnitario);

        const stockAnterior = Number(producto.stock);
        const saldoAnterior = Number(producto.saldo_inventario) || round2(stockAnterior * costoUnitario);
        const promedioAnterior =
          stockAnterior > 0 ? saldoAnterior / stockAnterior : costoUnitario;

        if (Number(det.diferencia) > 0) {
          // Faltante (sistema > conteo): debitar costo/gasto, acreditar inventario
          const cuentaCostoId = producto.cuenta_costos_id || cuentaCostoFallback?.id;
          if (!cuentaCostoId) {
            throw new BadRequestException(
              `El producto ${producto.codigo} no tiene cuenta de costos y no hay auxiliar 6.1 en el PUC`,
            );
          }

          const stockActual = round2(stockAnterior - cantidadAjuste);
          const saldoActual = round2(saldoAnterior - valorAjuste);
          producto.stock = stockActual;
          producto.saldo_inventario = saldoActual;
          producto.promedio = stockActual > 0 ? round2(saldoActual / stockActual) : 0;

          lineas.push({
            empresa_id: empresaId,
            cuenta_contable_id: cuentaCostoId,
            descripcion: `Faltante inventario ${producto.nombre} (${inventario.codigo})`,
            valor: valorAjuste,
            debito: valorAjuste,
            credito: 0,
            naturaleza: 'D',
            consecutivo,
            fecha: inventario.fecha,
            usuario,
            estado: 1,
          });
          lineas.push({
            empresa_id: empresaId,
            cuenta_contable_id: cuentaInventarioId,
            descripcion: `Salida inventario faltante ${producto.nombre}`,
            valor: valorAjuste,
            debito: 0,
            credito: valorAjuste,
            naturaleza: 'C',
            consecutivo,
            fecha: inventario.fecha,
            usuario,
            estado: 1,
          });

          await kardexRepo.save(
            kardexRepo.create({
              empresa_id: empresaId,
              producto_id: producto.id,
              tipo_documento: 'ajuste',
              documento_id: inventario.id,
              consecutivo,
              fecha: inventario.fecha,
              cantidad_anterior: stockAnterior,
              saldo_anterior: saldoAnterior,
              promedio_anterior: promedioAnterior,
              valor_unitario: costoUnitario,
              entradas: 0,
              salidas: cantidadAjuste,
              valor_entradas: 0,
              valor_salidas: valorAjuste,
              total: valorAjuste,
              cantidad_actual: stockActual,
              saldo_actual: saldoActual,
              promedio_actual: producto.promedio,
              estado: 1,
            }),
          );
        } else {
          // Sobrante (conteo > sistema): debitar inventario, acreditar otros ingresos
          const cuentaIngresoId = cuentaIngresoSobrante?.id;
          if (!cuentaIngresoId) {
            throw new BadRequestException(
              'No hay cuenta auxiliar 4.2 (otros ingresos) en el PUC para registrar el sobrante',
            );
          }

          const stockActual = round2(stockAnterior + cantidadAjuste);
          const saldoActual = round2(saldoAnterior + valorAjuste);
          producto.stock = stockActual;
          producto.saldo_inventario = saldoActual;
          producto.promedio = stockActual > 0 ? round2(saldoActual / stockActual) : 0;

          lineas.push({
            empresa_id: empresaId,
            cuenta_contable_id: cuentaInventarioId,
            descripcion: `Entrada inventario sobrante ${producto.nombre}`,
            valor: valorAjuste,
            debito: valorAjuste,
            credito: 0,
            naturaleza: 'D',
            consecutivo,
            fecha: inventario.fecha,
            usuario,
            estado: 1,
          });
          lineas.push({
            empresa_id: empresaId,
            cuenta_contable_id: cuentaIngresoId,
            descripcion: `Sobrante inventario ${producto.nombre} (${inventario.codigo})`,
            valor: valorAjuste,
            debito: 0,
            credito: valorAjuste,
            naturaleza: 'C',
            consecutivo,
            fecha: inventario.fecha,
            usuario,
            estado: 1,
          });

          await kardexRepo.save(
            kardexRepo.create({
              empresa_id: empresaId,
              producto_id: producto.id,
              tipo_documento: 'ajuste',
              documento_id: inventario.id,
              consecutivo,
              fecha: inventario.fecha,
              cantidad_anterior: stockAnterior,
              saldo_anterior: saldoAnterior,
              promedio_anterior: promedioAnterior,
              valor_unitario: costoUnitario,
              entradas: cantidadAjuste,
              salidas: 0,
              valor_entradas: valorAjuste,
              valor_salidas: 0,
              total: valorAjuste,
              cantidad_actual: stockActual,
              saldo_actual: saldoActual,
              promedio_actual: producto.promedio,
              estado: 1,
            }),
          );
        }

        await productRepo.save(producto);
      }

      // Guardar asiento contable
      const balance = assertBalanced(lineas.map((l) => ({ debito: Number(l.debito || 0), credito: Number(l.credito || 0) })));
      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: 5, // ajuste
        fecha: inventario.fecha,
        descripcion: `Ajuste de inventario ${inventario.codigo}`,
        total_debito: balance.debito,
        total_credito: balance.credito,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      // Asignar asentado_id a las líneas
      lineas.forEach((l) => (l.asentado_id = asentadoGuardado.id));
      await contabilidadRepo.save(lineas.map((l) => contabilidadRepo.create(l)));

      // Finalizar inventario
      inventario.estado = EstadoInventario.GUARDADO;
      if (dto.observacion) inventario.observacion = dto.observacion;
      await invRepo.save(inventario);

      return {
        inventario,
        ajustes: detallesConDiferencia.length,
        asentado: asentadoGuardado,
        total_debito: balance.debito,
        total_credito: balance.credito,
        mensaje: `Inventario finalizado con ${detallesConDiferencia.length} ajustes`,
      };
    });
  }

  /**
   * Anula un inventario (solo si está pendiente o incompleto)
   */
  async anular(id: number, empresaId: number) {
    const inventario = await this.invRepo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!inventario) {
      throw new NotFoundException('Inventario no encontrado');
    }
    if (inventario.estado === EstadoInventario.GUARDADO) {
      throw new BadRequestException('No se puede anular un inventario ya finalizado');
    }

    inventario.estado = EstadoInventario.ANULADO;
    await this.invRepo.save(inventario);
    // Los detalles se conservan: son la evidencia de lo que se contó.

    return { ok: true, mensaje: 'Inventario anulado' };
  }

  /**
   * Obtiene el valor del inventario actual (stock × costo)
   */
  async valorizacion(empresaId: number) {
    const productos = await this.productRepo.find({
      where: { empresa_id: empresaId, estado: 1 },
    });

    const data = productos.map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      stock: Number(p.stock),
      costo: Number(p.promedio || p.ultimo_precio || 0),
      valor: round2(Number(p.stock) * Number(p.promedio || p.ultimo_precio || 0)),
    }));

    const total = data.reduce((acc, d) => acc + d.valor, 0);
    const totalUnidades = data.reduce((acc, d) => acc + d.stock, 0);

    return {
      data,
      total_valor: round2(total),
      total_unidades: round2(totalUnidades),
      total_productos: data.length,
    };
  }
}
