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
import { round2, assertBalanced } from '../accounting/accounting-helpers';

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

      // Crear detalles con stock del sistema
      const detalles = productos.map((p) =>
        detRepo.create({
          inventario_id: invGuardado.id,
          empresa_id: empresaId,
          producto_id: p.id,
          codigo_producto: p.codigo,
          nombre_producto: p.nombre,
          costo_unitario: Number(p.ultimo_precio || p.pvp1 || 0),
          cantidad_sistema: Number(p.stock || 0),
          conteo: 0,
          diferencia: Number(p.stock || 0),
          valor_conteo: 0,
          estado: 1,
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

      return invGuardado;
    });
  }

  /**
   * Lista todos los inventarios físicos
   */
  async findAll(empresaId: number) {
    return this.invRepo.find({
      where: { empresa_id: empresaId },
      order: { id: 'DESC' },
    });
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
   * Registra los conteos físicos (consolidación)
   */
  async consolidar(id: number, dto: ConsolidarInventarioDto, empresaId: number) {
    const inventario = await this.invRepo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!inventario) {
      throw new NotFoundException('Inventario no encontrado');
    }
    if (inventario.estado !== EstadoInventario.PENDIENTE) {
      throw new BadRequestException('El inventario no está en estado pendiente');
    }

    return this.dataSource.transaction(async (manager) => {
      const detRepo = manager.getRepository(DetalleInventarioFisico);
      const invRepo = manager.getRepository(InventarioFisico);

      // Actualizar conteos
      let valorConteoTotal = 0;
      for (const c of dto.conteos) {
        const detalle = await detRepo.findOne({
          where: { inventario_id: id, producto_id: c.producto_id, empresa_id: empresaId },
        });
        if (!detalle) continue;

        detalle.conteo = Number(c.conteo);
        detalle.diferencia = round2(Number(detalle.cantidad_sistema) - Number(c.conteo));
        detalle.valor_conteo = round2(Number(detalle.costo_unitario) * Number(c.conteo));
        detalle.estado = 2; // ajustado/conteado
        await detRepo.save(detalle);

        valorConteoTotal += detalle.valor_conteo;
      }

      inventario.valor_conteo = round2(valorConteoTotal);
      inventario.diferencia = round2(Number(inventario.valor_sistema) - valorConteoTotal);
      inventario.estado = EstadoInventario.INCOMPLETO;
      await invRepo.save(inventario);

      return inventario;
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
    if (inventario.estado !== EstadoInventario.INCOMPLETO) {
      throw new BadRequestException('El inventario debe estar consolidado antes de finalizarlo');
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

      const detalles = await detRepo.find({
        where: { inventario_id: id, empresa_id: empresaId },
      });

      const detallesConDiferencia = detalles.filter((d) => Number(d.diferencia) !== 0);

      if (detallesConDiferencia.length === 0) {
        // No hay diferencias, solo finalizar
        inventario.estado = EstadoInventario.GUARDADO;
        if (dto.observacion) inventario.observacion = dto.observacion;
        await invRepo.save(inventario);
        return { inventario, ajustes: 0, mensaje: 'Inventario finalizado sin diferencias' };
      }

      // Buscar cuentas contables de inventario y costo de ventas
      const cuentas = await accountRepo.find({ where: { empresa_id: empresaId, estado: 1 } });
      const cuentaInventario = cuentas.find((c) => (c.codigo || '').startsWith('14')) || null;
      const cuentaCosto = cuentas.find((c) => (c.codigo || '').startsWith('61') || (c.codigo || '').startsWith('71')) || null;

      if (!cuentaInventario) {
        throw new BadRequestException('No se encontró cuenta contable de inventario (códigos 14xx)');
      }

      // Generar asiento contable de ajuste
      const empresa = await companyRepo.findOneBy({ id: empresaId });
      if (!empresa) throw new NotFoundException('Empresa no encontrada');
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await companyRepo.save(empresa);

      const consecutivo = 'AJ' + empresa.consecutivo_asientos.toString().padStart(6, '0');
      const lineas: Partial<AccountingEntryLine>[] = [];
      let totalDebito = 0;
      let totalCredito = 0;

      // Procesar cada diferencia
      for (const det of detallesConDiferencia) {
        const producto = await productRepo.findOne({ where: { id: det.producto_id, empresa_id: empresaId } });
        if (!producto) continue;

        const cantidadAjuste = Math.abs(Number(det.diferencia));
        const valorAjuste = round2(cantidadAjuste * Number(det.costo_unitario));

        if (Number(det.diferencia) > 0) {
          // Faltante (sistema > conteo): debitar costo de ventas, acreditar inventario
          producto.stock = round2(Number(producto.stock) - cantidadAjuste);

          if (cuentaCosto) {
            lineas.push({
              empresa_id: empresaId,
              cuenta_contable_id: cuentaCosto.id,
              descripcion: `Ajuste inventario faltante ${producto.nombre}`,
              valor: valorAjuste,
              debito: valorAjuste,
              credito: 0,
              naturaleza: 'D',
              consecutivo,
              fecha: inventario.fecha,
              usuario,
              estado: 1,
            });
            totalDebito += valorAjuste;
          }

          lineas.push({
            empresa_id: empresaId,
            cuenta_contable_id: cuentaInventario.id,
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
          totalCredito += valorAjuste;

          // Kardex de salida
          const kardex = kardexRepo.create({
            empresa_id: empresaId,
            producto_id: producto.id,
            tipo_documento: 'ajuste',
            documento_id: inventario.id,
            consecutivo,
            fecha: inventario.fecha,
            cantidad_anterior: Number(producto.stock) + cantidadAjuste,
            saldo_anterior: round2((Number(producto.stock) + cantidadAjuste) * Number(det.costo_unitario)),
            promedio_anterior: Number(det.costo_unitario),
            valor_unitario: Number(det.costo_unitario),
            entradas: 0,
            salidas: cantidadAjuste,
            valor_entradas: 0,
            valor_salidas: valorAjuste,
            total: valorAjuste,
            cantidad_actual: Number(producto.stock),
            saldo_actual: round2(Number(producto.stock) * Number(det.costo_unitario)),
            promedio_actual: Number(det.costo_unitario),
            estado: 1,
          });
          await kardexRepo.save(kardex);
        } else {
          // Sobrante (conteo > sistema): debitar inventario, acreditar otros ingresos
          producto.stock = round2(Number(producto.stock) + cantidadAjuste);

          lineas.push({
            empresa_id: empresaId,
            cuenta_contable_id: cuentaInventario.id,
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
          totalDebito += valorAjuste;

          // Buscar cuenta de otros ingresos (42xx)
          const cuentaIngreso = cuentas.find((c) => (c.codigo || '').startsWith('42')) || cuentaCosto;
          if (cuentaIngreso) {
            lineas.push({
              empresa_id: empresaId,
              cuenta_contable_id: cuentaIngreso.id,
              descripcion: `Sobrante inventario ${producto.nombre}`,
              valor: valorAjuste,
              debito: 0,
              credito: valorAjuste,
              naturaleza: 'C',
              consecutivo,
              fecha: inventario.fecha,
              usuario,
              estado: 1,
            });
            totalCredito += valorAjuste;
          }

          // Kardex de entrada
          const kardex = kardexRepo.create({
            empresa_id: empresaId,
            producto_id: producto.id,
            tipo_documento: 'ajuste',
            documento_id: inventario.id,
            consecutivo,
            fecha: inventario.fecha,
            cantidad_anterior: Number(producto.stock) - cantidadAjuste,
            saldo_anterior: round2((Number(producto.stock) - cantidadAjuste) * Number(det.costo_unitario)),
            promedio_anterior: Number(det.costo_unitario),
            valor_unitario: Number(det.costo_unitario),
            entradas: cantidadAjuste,
            salidas: 0,
            valor_entradas: valorAjuste,
            valor_salidas: 0,
            total: valorAjuste,
            cantidad_actual: Number(producto.stock),
            saldo_actual: round2(Number(producto.stock) * Number(det.costo_unitario)),
            promedio_actual: Number(det.costo_unitario),
            estado: 1,
          });
          await kardexRepo.save(kardex);
        }

        await productRepo.save(producto);

        // Marcar detalle como ajustado
        det.estado = 2;
        await detRepo.save(det);
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

    // Eliminar detalles
    await this.detRepo.delete({ inventario_id: id });

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
      costo: Number(p.ultimo_precio || 0),
      valor: round2(Number(p.stock) * Number(p.ultimo_precio || 0)),
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
