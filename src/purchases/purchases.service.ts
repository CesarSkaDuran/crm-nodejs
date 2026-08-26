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
import {
  AccountingEntry,
  AccountingEntryLine,
} from '../accounting/entities/accounting-entry.entity';
import {
  assertBalanced,
  requireAccountByKeywords,
  resolveBancoCuenta,
  round2,
} from '../accounting/accounting-helpers';

const TIPO_ASIENTO_COMPRA = 1;

@Injectable()
export class PurchasesService {
  constructor(
    @InjectRepository(Purchase)
    private readonly compraRepo: Repository<Purchase>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreatePurchaseDto, empresaId: number, usuario: string) {
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

      empresa.consecutivo_compras = (empresa.consecutivo_compras || 0) + 1;
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const codigoCompra =
        'FC' + empresa.consecutivo_compras.toString().padStart(6, '0');

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

        const cantidadAnterior = Number(producto.stock);
        const promedioAnterior = Number(producto.promedio);
        const saldoAnterior = cantidadAnterior * promedioAnterior;

        const cantidadActual = cantidadAnterior + cantidad;
        const saldoActual = saldoAnterior + neto;
        const promedioActual =
          cantidadActual > 0 ? saldoActual / cantidadActual : costoUnitario;

        producto.stock = cantidadActual;
        producto.promedio = promedioActual;
        producto.ultimo_precio = costoUnitario;
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
      });
      const compraGuardada = await compraRepo.save(compra);

      detalles.forEach((d) => (d.compra_id = compraGuardada.id));
      await detalleRepo.save(detalles);

      movimientosKardex.forEach((k) => (k.documento_id = compraGuardada.id));
      await kardexRepo.save(movimientosKardex);

      const bancoRepo = manager.getRepository(Banco);
      const consecutivoAsiento =
        'CP' + empresa.consecutivo_asientos.toString().padStart(6, '0');

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

      return compraRepo.findOne({
        where: { id: compraGuardada.id },
        relations: ['detalles', 'detalles.producto', 'proveedor'],
      });
    });
  }

  findAll(empresaId: number) {
    return this.compraRepo.find({
      where: { empresa_id: empresaId },
      relations: ['proveedor'],
      order: { fecha: 'DESC', id: 'DESC' },
    });
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
}
