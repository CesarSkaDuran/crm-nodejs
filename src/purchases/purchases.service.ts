import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Purchase } from './entities/purchase.entity';
import { PurchaseDetail } from './entities/purchase-detail.entity';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { Product } from '../products/entities/product.entity';
import { Third } from '../thirds/entities/third.entity';
import { Company } from '../companies/entities/company.entity';
import { Account } from '../accounts/entities/account.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Kardex } from '../kardex/entities/kardex.entity';
import { Moneda } from '../monedas/entities/moneda.entity';
import {
  AccountingEntry,
  AccountingEntryLine,
} from '../accounting/entities/accounting-entry.entity';
import {
  assertBalanced,
  assertPeriodoAbierto,
  requireAccountByKeywords,
  resolveBancoCuenta,
  resolverMonedaDocumento,
  round2,
} from '../accounting/accounting-helpers';
import { Cierre } from '../cierres/entities/cierre.entity';
import { CuentasPorPagarService } from '../cuentas-por-pagar/cuentas-por-pagar.service';
import { PeriodoCredito } from '../cartera/entities/credito.entity';
import { CierresService } from '../cierres/cierres.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TipoOperacion } from '../auditoria/entities/auditoria.entity';

const TIPO_ASIENTO_COMPRA = 1;

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private readonly compraRepo: Repository<Purchase>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly cxpService: CuentasPorPagarService,
    private readonly cierresService: CierresService,
    private readonly auditoria: AuditoriaService,
  ) {}

  private async obtenerConsecutivoAtomico(
    manager: any,
    empresaId: number,
    campo: 'consecutivo_compras' | 'consecutivo_asientos',
    prefijo: string,
  ): Promise<string> {
    await manager.query(
      `UPDATE empresas SET ${campo} = ${campo} + 1 WHERE id = ?`,
      [empresaId],
    );
    const [rows] = await manager.query(
      `SELECT ${campo} FROM empresas WHERE id = ?`,
      [empresaId],
    );
    const numero = rows?.[0]?.[campo] || rows?.[campo] || 0;
    return prefijo + String(numero).padStart(6, '0');
  }

  async create(dto: CreatePurchaseDto, empresaId: number, usuario: string) {
    // Validar que el período no esté cerrado
    const periodoCerrado = await this.cierresService.bloquearTransaccionesEnPeriodoCerrado(
      empresaId,
      dto.fecha,
    );
    if (periodoCerrado) {
      throw new BadRequestException(
        `No se pueden crear compras en un período cerrado. Fecha: ${dto.fecha}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const compraRepo = manager.getRepository(Purchase);
      const detalleRepo = manager.getRepository(PurchaseDetail);
      const productoRepo = manager.getRepository(Product);
      const terceroRepo = manager.getRepository(Third);
      const empresaRepo = manager.getRepository(Company);
      const cuentaRepo = manager.getRepository(Account);
      const kardexRepo = manager.getRepository(Kardex);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);

      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) {
        throw new NotFoundException('Empresa no encontrada');
      }

      const proveedor = await terceroRepo.findOne({
        where: { id: dto.proveedor_id, empresa_id: empresaId },
      });
      if (!proveedor) {
        throw new NotFoundException('Proveedor no encontrado');
      }

      if (!proveedor.cuenta_contable_id) {
        throw new BadRequestException(
          'El proveedor debe tener una cuenta contable asignada',
        );
      }

      const cuentaProveedor = await cuentaRepo.findOne({
        where: { id: proveedor.cuenta_contable_id, empresa_id: empresaId },
      });
      if (!cuentaProveedor) {
        throw new BadRequestException(
          'La cuenta contable del proveedor no existe en esta empresa',
        );
      }

      // --- Conversión de moneda extranjera (NIIF 21) ---
      // Si el documento es en USD, los valores del DTO (costo_unitario por
      // línea, flete, retención) vienen en USD y se convierten a COP.
      const conv = await resolverMonedaDocumento(
        manager.getRepository(Moneda),
        empresaId,
        dto.moneda_id,
        dto.tasa_cambio,
      );
      let valorMonedaExtranjera = 0;
      if (conv?.esExtranjera) {
        const tasa = conv.tasa;
        let baseUsd = 0;
        let impUsd = 0;
        for (const item of dto.detalles) {
          const bruto = Number(item.cantidad) * Number(item.costo_unitario);
          const neto = bruto - (bruto * Number(item.descuento || 0)) / 100;
          baseUsd += neto;
          impUsd += (neto * Number(item.impuesto || 0)) / 100;
        }
        valorMonedaExtranjera = round2(
          baseUsd + impUsd + Number(dto.flete || 0) - Number(dto.retencion || 0),
        );
        dto.detalles = dto.detalles.map((d) => ({
          ...d,
          costo_unitario: round2(Number(d.costo_unitario) * tasa),
        }));
        dto.flete = round2(Number(dto.flete || 0) * tasa);
        dto.retencion = round2(Number(dto.retencion || 0) * tasa);
      }

      const codigoCompra = await this.obtenerConsecutivoAtomico(
        manager,
        empresaId,
        'consecutivo_compras',
        'FC',
      );
      const consecutivoAsiento = await this.obtenerConsecutivoAtomico(
        manager,
        empresaId,
        'consecutivo_asientos',
        'CP',
      );

      const detalles: PurchaseDetail[] = [];
      const movimientosKardex: Kardex[] = [];
      const lineasContables: Partial<AccountingEntryLine>[] = [];

      let baseGrava = 0;
      let totalImpuesto = 0;
      let totalDescuento = 0;

      for (const item of dto.detalles) {
        const producto = await productoRepo.findOne({
          where: { id: item.producto_id, empresa_id: empresaId },
        });
        if (!producto || producto.estado !== 1) {
          throw new NotFoundException(
            `Producto ${item.producto_id} no encontrado o inactivo`,
          );
        }

        if (!producto.cuenta_inventarios_id) {
          throw new BadRequestException(
            `El producto ${producto.nombre} no tiene cuenta de inventarios`,
          );
        }

        const cuentaInventario = await cuentaRepo.findOne({
          where: {
            id: producto.cuenta_inventarios_id,
            empresa_id: empresaId,
          },
        });
        if (!cuentaInventario) {
          throw new BadRequestException(
            `La cuenta de inventarios del producto ${producto.nombre} no existe`,
          );
        }

        const cantidad = Number(item.cantidad);
        const costoUnitario = Number(item.costo_unitario);
        if (cantidad <= 0 || costoUnitario < 0) {
          throw new BadRequestException(
            `Cantidad o costo inválido en el producto ${producto.nombre}`,
          );
        }

        const descuentoItem = Number(item.descuento || 0);
        const impuestoItem = Number(item.impuesto || 0);

        const bruto = cantidad * costoUnitario;
        const valorDescuento = (bruto * descuentoItem) / 100;
        const neto = bruto - valorDescuento;
        const valorImpuesto = (neto * impuestoItem) / 100;

        const cantidadAnterior = round2(Number(producto.stock));
        const saldoAnterior = round2(Number(producto.saldo_inventario));
        const promedioAnterior =
          cantidadAnterior > 0 ? saldoAnterior / cantidadAnterior : 0;

        const cantidadActual = round2(cantidadAnterior + cantidad);
        const saldoActual = round2(saldoAnterior + neto);
        const promedioActual =
          cantidadActual > 0 ? saldoActual / cantidadActual : costoUnitario;

        producto.stock = cantidadActual;
        producto.saldo_inventario = saldoActual;
        producto.promedio = promedioActual;
        producto.ultimo_precio = costoUnitario;
        // Recalcular PVP1 automáticamente manteniendo el margen.
        // Fórmula correcta: Precio Venta = Precio Compra / (1 - (Margen / 100))
        if (Number(producto.margen) > 0) {
          producto.pvp1 = round2(costoUnitario / (1 - Number(producto.margen) / 100));
          // Recalcular PVP4 = PVP1 + IVA
          const ivaPct = Number(producto.impuesto) || 0;
          if (ivaPct > 0) {
            producto.pvp4 = round2(Number(producto.pvp1) * (1 + ivaPct / 100));
          }
        }
        await productoRepo.save(producto);

        const detalle = new PurchaseDetail();
        detalle.producto_id = producto.id;
        detalle.cantidad = cantidad;
        detalle.costo_unitario = costoUnitario;
        detalle.descuento = descuentoItem;
        detalle.impuesto = impuestoItem;
        detalle.subtotal = neto;
        detalle.codigos = item.codigos;
        detalle.estado = 1;
        detalles.push(detalle);

        const kardex = new Kardex();
        kardex.empresa_id = empresaId;
        kardex.producto_id = producto.id;
        kardex.tipo_documento = 'compra';
        kardex.consecutivo = codigoCompra;
        kardex.fecha = dto.fecha;
        kardex.cantidad_anterior = cantidadAnterior;
        kardex.saldo_anterior = saldoAnterior;
        kardex.promedio_anterior = promedioAnterior;
        kardex.valor_unitario = costoUnitario;
        kardex.entradas = cantidad;
        kardex.salidas = 0;
        kardex.valor_entradas = neto;
        kardex.valor_salidas = 0;
        kardex.total = neto;
        kardex.cantidad_actual = cantidadActual;
        kardex.saldo_actual = saldoActual;
        kardex.promedio_actual = promedioActual;
        kardex.estado = 1;
        movimientosKardex.push(kardex);

        lineasContables.push({
          empresa_id: empresaId,
          cuenta_contable_id: producto.cuenta_inventarios_id,
          tercero_id: dto.proveedor_id,
          descripcion: `Compra ${producto.nombre}`,
          valor: neto,
          debito: neto,
          credito: 0,
          naturaleza: 'D',
          consecutivo: codigoCompra,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });

        baseGrava += neto;
        totalImpuesto += valorImpuesto;
        totalDescuento += valorDescuento;
      }

      const flete = Number(dto.flete || 0);
      const retencion = Number(dto.retencion || 0);
      const total = baseGrava + totalImpuesto + flete - retencion;

      if (total <= 0) {
        throw new BadRequestException(
          'El total de la compra debe ser mayor a cero',
        );
      }

      const compra = compraRepo.create({
        empresa_id: empresaId,
        codigo: codigoCompra,
        numero_factura: dto.numero_factura,
        fecha: dto.fecha,
        proveedor_id: dto.proveedor_id,
        codigo_guia_compra: dto.codigo_guia_compra,
        base_grava: baseGrava,
        descuento: totalDescuento,
        impuesto: totalImpuesto,
        retencion,
        flete,
        total,
        observacion: dto.observacion,
        concepto: dto.concepto,
        almacen: dto.almacen,
        modo: dto.modo ?? 1,
        forma: dto.forma,
        estado: 1,
        moneda_id: conv?.moneda.id ?? null,
        moneda_codigo: conv?.moneda.codigo ?? 'COP',
        tasa_cambio: conv?.tasa ?? 1,
        valor_moneda_extranjera: valorMonedaExtranjera,
        valor_cop: round2(total),
      });
      const compraGuardada = await compraRepo.save(compra);

      detalles.forEach((d) => (d.compra_id = compraGuardada.id));
      await detalleRepo.save(detalles);

      movimientosKardex.forEach((k) => (k.documento_id = compraGuardada.id));
      await kardexRepo.save(movimientosKardex);

      const bancoRepo = manager.getRepository(Banco);

      // Resolver cuentas de IVA, flete y retención
      let cuentaIva: Account | null = null;
      if (totalImpuesto > 0) {
        cuentaIva = await requireAccountByKeywords(
          cuentaRepo,
          empresaId,
          ['2408', 'iva descontable', 'iva debito', 'impuesto por pagar'],
          'IVA descontable (compras)',
        );
      }

      let cuentaFlete: Account | null = null;
      if (flete > 0) {
        cuentaFlete = await requireAccountByKeywords(
          cuentaRepo,
          empresaId,
          ['2335', 'flete', 'gastos transporte', 'compra flete'],
          'Flete / transporte (compras)',
        );
      }

      let cuentaRetencion: Account | null = null;
      if (retencion > 0) {
        cuentaRetencion = await requireAccountByKeywords(
          cuentaRepo,
          empresaId,
          ['2365', 'retencion', 'rte fuente', 'retencion en la fuente'],
          'Retención en la fuente (compras)',
        );
      }

      // Construir líneas adicionales del asiento
      const lineasExtra: Partial<AccountingEntryLine>[] = [];

      if (totalImpuesto > 0 && cuentaIva) {
        lineasExtra.push({
          empresa_id: empresaId,
          cuenta_contable_id: cuentaIva.id,
          tercero_id: dto.proveedor_id,
          descripcion: `IVA descontable compra ${codigoCompra}`,
          valor: round2(totalImpuesto),
          debito: round2(totalImpuesto),
          credito: 0,
          naturaleza: 'D',
          consecutivo: consecutivoAsiento,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }

      if (flete > 0 && cuentaFlete) {
        lineasExtra.push({
          empresa_id: empresaId,
          cuenta_contable_id: cuentaFlete.id,
          tercero_id: dto.proveedor_id,
          descripcion: `Flete compra ${codigoCompra}`,
          valor: round2(flete),
          debito: round2(flete),
          credito: 0,
          naturaleza: 'D',
          consecutivo: consecutivoAsiento,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        });
      }

      // Total a pagar/credito = base + iva + flete - retencion
      const totalCredito = round2(baseGrava + totalImpuesto + flete - retencion);

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo: consecutivoAsiento,
        tipo: TIPO_ASIENTO_COMPRA,
        fecha: dto.fecha,
        descripcion: `Compra ${codigoCompra} - ${proveedor.nombre}`,
        total_debito: totalCredito,
        total_credito: totalCredito,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      const lineas = lineasContables.map((linea) =>
        contabilidadRepo.create({
          ...linea,
          asentado_id: asentadoGuardado.id,
          consecutivo: consecutivoAsiento,
        }),
      );

      // Agregar líneas extra (IVA, flete)
      for (const extra of lineasExtra) {
        lineas.push(contabilidadRepo.create({ ...extra, asentado_id: asentadoGuardado.id }));
      }

      // Retención: es un crédito (resta al pago) → debito retención reduce el haber al proveedor
      // Se registra como crédito negativo => la restamos del crédito al proveedor/banco
      // Enfocción: retención se debita de la cuenta de retención por pagar (naturaleza C, va al haber)
      // y reduce el monto a pagar al proveedor.
      // Para mantener partida doble simple: agregamos retención como crédito a cuenta por pagar de retención
      // y restamos del monto a pagar al proveedor/banco.
      // Es decir: total a pagar al proveedor = total - retencion
      const montoPagar = round2(totalCredito - retencion);

      if (retencion > 0 && cuentaRetencion) {
        lineas.push(
          contabilidadRepo.create({
            empresa_id: empresaId,
            asentado_id: asentadoGuardado.id,
            cuenta_contable_id: cuentaRetencion.id,
            tercero_id: dto.proveedor_id,
            descripcion: `Retención en la fuente compra ${codigoCompra}`,
            valor: round2(retencion),
            debito: 0,
            credito: round2(retencion),
            naturaleza: 'C',
            consecutivo: consecutivoAsiento,
            fecha: dto.fecha,
            usuario,
            estado: 1,
          }),
        );
      }

      let lineaContrapartida: Partial<AccountingEntryLine> = {
        empresa_id: empresaId,
        asentado_id: asentadoGuardado.id,
        cuenta_contable_id: cuentaProveedor.id,
        tercero_id: dto.proveedor_id,
        descripcion: `Cuenta por pagar ${proveedor.nombre}`,
        valor: montoPagar,
        debito: 0,
        credito: montoPagar,
        naturaleza: 'C',
        consecutivo: consecutivoAsiento,
        fecha: dto.fecha,
        usuario,
        estado: 1,
      };

      if (dto.banco_id) {
        const banco = await bancoRepo.findOne({
          where: { id: dto.banco_id, empresa_id: empresaId },
        });
        if (!banco) {
          throw new NotFoundException('Banco/caja no encontrado');
        }

        const bancoCuenta = await resolveBancoCuenta(
          cuentaRepo,
          empresaId,
          banco.cuenta_id,
          banco.nombre,
        );

        if (Number(banco.monto) < montoPagar) {
          throw new BadRequestException(
            `El banco ${banco.nombre} no tiene saldo suficiente`,
          );
        }

        banco.monto = round2(Number(banco.monto) - montoPagar);
        await bancoRepo.save(banco);

        lineaContrapartida = {
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: bancoCuenta.id,
          tercero_id: dto.proveedor_id,
          descripcion: `Pago contado ${banco.nombre}`,
          valor: montoPagar,
          debito: 0,
          credito: montoPagar,
          naturaleza: 'C',
          consecutivo: consecutivoAsiento,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        };
      }

      lineas.push(contabilidadRepo.create(lineaContrapartida));

      // Validar que el asiento cuadre antes de guardar
      const todasLineas = lineas.map((l) => ({
        debito: Number((l as any).debito || 0),
        credito: Number((l as any).credito || 0),
      }));
      const balance = assertBalanced(todasLineas);

      // Actualizar totales del asiento con el valor real cuadrado
      asentadoGuardado.total_debito = balance.debito;
      asentadoGuardado.total_credito = balance.credito;
      await asentadoRepo.save(asentadoGuardado);

      await contabilidadRepo.save(lineas);

      // Si la compra es a crédito (sin banco), crear el crédito con plan de cuotas
      if (!dto.banco_id && montoPagar > 0) {
        const numCuotas = dto.numero_cuotas || 1;
        const periodo = dto.periodo_cuotas || PeriodoCredito.MENSUAL;
        await this.cxpService.crearCreditoDesdeCompra(
          empresaId,
          dto.proveedor_id,
          codigoCompra,
          dto.fecha,
          montoPagar,
          numCuotas,
          periodo,
          dto.tasa_mora || 0,
          manager,
        );
      }

      return compraRepo.findOne({
        where: { id: compraGuardada.id },
        relations: ['detalles', 'detalles.producto', 'proveedor'],
      });
    });
  }

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 10)));

    const qb = this.compraRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.proveedor', 'proveedor')
      .where('c.empresa_id = :empresaId', { empresaId })
      .orderBy('c.fecha', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(c.numero_factura LIKE :search OR c.codigo LIKE :search OR c.observacion LIKE :search OR proveedor.nombre LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.date && query.date2) {
      qb.andWhere('c.fecha BETWEEN :date AND :date2', {
        date: query.date,
        date2: `${query.date2} 23:59:59`,
      });
    } else if (query.date) {
      qb.andWhere('c.fecha >= :date', { date: query.date });
    } else if (query.date2) {
      qb.andWhere('c.fecha <= :date2', { date2: `${query.date2} 23:59:59` });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const compra = await this.compraRepo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['detalles', 'detalles.producto', 'proveedor'],
    });
    if (!compra) {
      throw new NotFoundException('Compra no encontrada');
    }
    return compra;
  }

  /**
   * Anula una compra con reversa completa:
   * - Resta el stock de los productos
   * - Reversa el banco (si fue de contado)
   * - Genera asiento contable de reversión
   */
  async anular(id: number, empresaId: number, usuario: string) {
    const compra = await this.findOne(id, empresaId);
    if (compra.estado === 0) {
      throw new BadRequestException('La compra ya está anulada');
    }
    // La reversa de la compra altera el período de la factura original
    await assertPeriodoAbierto(
      this.compraRepo.manager.getRepository(Cierre),
      empresaId,
      compra.fecha,
    );

    return this.dataSource.transaction(async (manager) => {
      const compraRepo = manager.getRepository(Purchase);
      const detalleRepo = manager.getRepository(PurchaseDetail);
      const productoRepo = manager.getRepository(Product);
      const empresaRepo = manager.getRepository(Company);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);
      const kardexRepo = manager.getRepository(Kardex);

      // 1. Restar stock y revertir costo promedio ponderado
      const detalles = await detalleRepo.find({ where: { compra_id: id } });
      for (const det of detalles) {
        const producto = await productoRepo.findOne({ where: { id: det.producto_id } });
        if (producto) {
          if (Number(producto.stock) < Number(det.cantidad)) {
            throw new BadRequestException(
              `No se puede anular: stock insuficiente del producto ${producto.nombre} (stock: ${producto.stock}, cantidad a restar: ${det.cantidad})`,
            );
          }

          // Buscar el kardex de la compra original para obtener los valores exactos
          // que tenían el producto ANTES de esa compra (cantidad_anterior, saldo_anterior, promedio_anterior).
          const kardexCompra = await kardexRepo.findOne({
            where: {
              producto_id: producto.id,
              empresa_id: empresaId,
              tipo_documento: 'compra',
              consecutivo: compra.codigo,
              estado: 1,
            },
            order: { id: 'DESC' },
          });

          const cantidadRevertir = Number(det.cantidad);
          const costoUnitario = Number(det.costo_unitario);
          const valorRevertir = round2(cantidadRevertir * costoUnitario);

          let stockAnterior: number;
          let saldoAnterior: number;
          let promedioAnterior: number;
          let ultimoPrecioAnterior: number;

          if (kardexCompra) {
            // Usar los valores exactos del kardex anterior a la compra
            stockAnterior = round2(Number(kardexCompra.cantidad_anterior));
            saldoAnterior = round2(Number(kardexCompra.saldo_anterior));
            promedioAnterior = Number(kardexCompra.promedio_anterior) || 0;
            // El ultimo_precio anterior: buscar el kardex previo a la compra
            const kardexPrevio = await kardexRepo.findOne({
              where: { producto_id: producto.id, empresa_id: empresaId, estado: 1 },
              order: { id: 'DESC' },
            });
            // El último_precio antes de esta compra era el promedio anterior
            // (o el costo de la compra previa si existe)
            ultimoPrecioAnterior =
              stockAnterior > 0 ? promedioAnterior : Number(kardexCompra.promedio_anterior) || 0;
          } else {
            // Fallback: calcular reversión matemáticamente
            stockAnterior = round2(Number(producto.stock) - cantidadRevertir);
            saldoAnterior = round2(Number(producto.saldo_inventario) - valorRevertir);
            promedioAnterior = stockAnterior > 0 ? round2(saldoAnterior / stockAnterior) : 0;
            ultimoPrecioAnterior = promedioAnterior;
          }

          producto.stock = stockAnterior;
          producto.saldo_inventario = saldoAnterior;
          producto.promedio = promedioAnterior;
          producto.ultimo_precio = ultimoPrecioAnterior;
          // Recalcular PVP1 con el costo restaurado, manteniendo el margen
          if (Number(producto.margen) > 0 && Number(producto.ultimo_precio) > 0) {
            producto.pvp1 = round2(
              Number(producto.ultimo_precio) / (1 - Number(producto.margen) / 100),
            );
            const ivaPct = Number(producto.impuesto) || 0;
            if (ivaPct > 0) {
              producto.pvp4 = round2(Number(producto.pvp1) * (1 + ivaPct / 100));
            }
          }
          await productoRepo.save(producto);

          // Kardex de reversión
          const kardex = kardexRepo.create({
            empresa_id: empresaId,
            producto_id: producto.id,
            tipo_documento: 'anulacion_compra',
            documento_id: compra.id,
            consecutivo: 'ANC' + compra.id,
            fecha: new Date().toISOString().split('T')[0],
            cantidad_anterior: Number(producto.stock) + cantidadRevertir,
            saldo_anterior: round2(saldoAnterior + valorRevertir),
            promedio_anterior: Number(producto.promedio) || costoUnitario,
            valor_unitario: costoUnitario,
            entradas: 0,
            salidas: cantidadRevertir,
            valor_entradas: 0,
            valor_salidas: valorRevertir,
            total: valorRevertir,
            cantidad_actual: stockAnterior,
            saldo_actual: saldoAnterior,
            promedio_actual: promedioAnterior,
            estado: 1,
          });
          await kardexRepo.save(kardex);
        }
      }

      // 2. Generar asiento contable de reversión
      const consecutivo = await this.obtenerConsecutivoAtomico(
        manager,
        empresaId,
        'consecutivo_asientos',
        'ANC',
      );
      const montoTotal = round2(Number(compra.total));

      // Buscar asiento original para reversar.
      // El consecutivo del asiento (CP...) es distinto al código de la compra (CP...),
      // pero la descripción del asiento contiene el código de la compra.
      const asientoOriginal = await asentadoRepo
        .createQueryBuilder('a')
        .where('a.empresa_id = :empresaId', { empresaId })
        .andWhere('a.descripcion LIKE :codigo', { codigo: `%${compra.codigo}%` })
        .andWhere('a.tipo = 1')
        .orderBy('a.id', 'DESC')
        .getOne();

      let lineasReversion: Partial<AccountingEntryLine>[] = [];

      if (asientoOriginal) {
        const lineasOriginales = await contabilidadRepo.find({
          where: { asentado_id: asientoOriginal.id },
        });

        lineasReversion = lineasOriginales.map((l) => ({
          empresa_id: empresaId,
          cuenta_contable_id: l.cuenta_contable_id,
          tercero_id: l.tercero_id,
          descripcion: `[ANULACIÓN] ${l.descripcion}`,
          valor: Number(l.valor),
          debito: Number(l.credito),
          credito: Number(l.debito),
          naturaleza: Number(l.credito) > 0 ? 'D' : 'C',
          consecutivo,
          fecha: new Date().toISOString().split('T')[0],
          usuario,
          estado: 1,
        }));
      }

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: 6,
        fecha: new Date().toISOString().split('T')[0],
        descripcion: `Anulación de compra ${compra.codigo}`,
        total_debito: montoTotal,
        total_credito: montoTotal,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      if (lineasReversion.length > 0) {
        lineasReversion.forEach((l) => (l.asentado_id = asentadoGuardado.id));
        const balance = assertBalanced(lineasReversion.map((l) => ({ debito: Number(l.debito || 0), credito: Number(l.credito || 0) })));
        asentadoGuardado.total_debito = balance.debito;
        asentadoGuardado.total_credito = balance.credito;
        await asentadoRepo.save(asentadoGuardado);
        await contabilidadRepo.save(lineasReversion.map((l) => contabilidadRepo.create(l)));
      }

      // 3. Marcar compra como anulada
      compra.estado = 0;
      await compraRepo.save(compra);

      await this.auditoria.registrar(
        empresaId,
        'compras',
        compra.id,
        TipoOperacion.ANULAR,
        usuario,
        { estado: 1 },
        { estado: 0 },
        `Compra ${compra.codigo} anulada`,
      );

      return {
        ok: true,
        compra: { id: compra.id, codigo: compra.codigo, estado: 0 },
        asentado: asentadoGuardado,
        mensaje: `Compra ${compra.codigo} anulada correctamente. Stock reversado, asiento de reversión generado.`,
      };
    });
  }
}
