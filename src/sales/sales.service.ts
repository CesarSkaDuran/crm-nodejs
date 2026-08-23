import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Sale } from './entities/sale.entity';
import { SaleDetail } from './entities/sale-detail.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Product } from '../products/entities/product.entity';
import { Third } from '../thirds/entities/third.entity';
import { Company } from '../companies/entities/company.entity';
import { Account } from '../accounts/entities/account.entity';
import { Kardex } from '../kardex/entities/kardex.entity';
import {
  AccountingEntry,
  AccountingEntryLine,
} from '../accounting/entities/accounting-entry.entity';

const TIPO_ASIENTO_VENTA = 2;

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly ventaRepo: Repository<Sale>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSaleDto, empresaId: number, usuario: string) {
    return this.dataSource.transaction(async (manager) => {
      const ventaRepo = manager.getRepository(Sale);
      const detalleRepo = manager.getRepository(SaleDetail);
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

      const cliente = await terceroRepo.findOne({
        where: { id: dto.cliente_id, empresa_id: empresaId },
      });
      if (!cliente) {
        throw new NotFoundException('Cliente no encontrado');
      }

      if (!cliente.cuenta_contable_id) {
        throw new BadRequestException(
          'El cliente debe tener una cuenta contable asignada',
        );
      }

      const cuentaCliente = await cuentaRepo.findOne({
        where: { id: cliente.cuenta_contable_id, empresa_id: empresaId },
      });
      if (!cuentaCliente) {
        throw new BadRequestException(
          'La cuenta contable del cliente no existe en esta empresa',
        );
      }

      empresa.consecutivo_ventas = (empresa.consecutivo_ventas || 0) + 1;
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const codigoVenta =
        'FV' + empresa.consecutivo_ventas.toString().padStart(6, '0');

      const detalles: SaleDetail[] = [];
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

        if (!producto.cuenta_ingresos_id) {
          throw new BadRequestException(
            `El producto ${producto.nombre} no tiene cuenta de ingresos`,
          );
        }

        if (!producto.cuenta_inventarios_id) {
          throw new BadRequestException(
            `El producto ${producto.nombre} no tiene cuenta de inventarios`,
          );
        }

        const cantidad = Number(item.cantidad);
        const precioUnitario = Number(item.precio_unitario);
        if (cantidad <= 0 || precioUnitario < 0) {
          throw new BadRequestException(
            `Cantidad o precio inválido en el producto ${producto.nombre}`,
          );
        }

        if (cantidad > Number(producto.stock)) {
          throw new BadRequestException(
            `Stock insuficiente para el producto ${producto.nombre}`,
          );
        }

        const descuentoItem = Number(item.descuento || 0);
        const impuestoItem = Number(item.impuesto || 0);

        const bruto = cantidad * precioUnitario;
        const valorDescuento = (bruto * descuentoItem) / 100;
        const neto = bruto - valorDescuento;
        const valorImpuesto = (neto * impuestoItem) / 100;

        const cantidadAnterior = Number(producto.stock);
        const promedioAnterior = Number(producto.promedio);
        const saldoAnterior = cantidadAnterior * promedioAnterior;

        const cantidadActual = cantidadAnterior - cantidad;
        const costo = cantidad * promedioAnterior;
        const saldoActual = cantidadActual * promedioAnterior;

        producto.stock = cantidadActual;
        await productoRepo.save(producto);

        const detalle = new SaleDetail();
        detalle.producto_id = producto.id;
        detalle.cantidad = cantidad;
        detalle.precio_unitario = precioUnitario;
        detalle.costo_unitario = promedioAnterior;
        detalle.descuento = descuentoItem;
        detalle.impuesto = impuestoItem;
        detalle.subtotal = neto;
        detalle.codigos = item.codigos;
        detalle.estado = 1;
        detalles.push(detalle);

        const kardex = new Kardex();
        kardex.empresa_id = empresaId;
        kardex.producto_id = producto.id;
        kardex.tipo_documento = 'venta';
        kardex.consecutivo = codigoVenta;
        kardex.fecha = dto.fecha;
        kardex.cantidad_anterior = cantidadAnterior;
        kardex.saldo_anterior = saldoAnterior;
        kardex.promedio_anterior = promedioAnterior;
        kardex.valor_unitario = promedioAnterior;
        kardex.entradas = 0;
        kardex.salidas = cantidad;
        kardex.valor_entradas = 0;
        kardex.valor_salidas = costo;
        kardex.total = costo;
        kardex.cantidad_actual = cantidadActual;
        kardex.saldo_actual = saldoActual;
        kardex.promedio_actual = promedioAnterior;
        kardex.estado = 1;
        movimientosKardex.push(kardex);

        lineasContables.push({
          empresa_id: empresaId,
          cuenta_contable_id: producto.cuenta_ingresos_id,
          tercero_id: dto.cliente_id,
          descripcion: `Venta ${producto.nombre}`,
          valor: neto,
          debito: 0,
          credito: neto,
          naturaleza: 'C',
          consecutivo: codigoVenta,
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
          'El total de la venta debe ser mayor a cero',
        );
      }

      const venta = ventaRepo.create({
        empresa_id: empresaId,
        codigo: codigoVenta,
        numero_factura: dto.numero_factura,
        fecha: dto.fecha,
        cliente_id: dto.cliente_id,
        vendedor_id: dto.vendedor_id,
        codigo_guia_venta: dto.codigo_guia_venta,
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
      const ventaGuardada = await ventaRepo.save(venta);

      detalles.forEach((d) => (d.venta_id = ventaGuardada.id));
      await detalleRepo.save(detalles);

      movimientosKardex.forEach((k) => (k.documento_id = ventaGuardada.id));
      await kardexRepo.save(movimientosKardex);

      const consecutivoAsiento =
        'VT' + empresa.consecutivo_asientos.toString().padStart(6, '0');

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo: consecutivoAsiento,
        tipo: TIPO_ASIENTO_VENTA,
        fecha: dto.fecha,
        descripcion: `Venta ${codigoVenta} - ${cliente.nombre}`,
        total_debito: total,
        total_credito: total,
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

      lineas.push(
        contabilidadRepo.create({
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: cliente.cuenta_contable_id,
          tercero_id: dto.cliente_id,
          descripcion: `Cuenta por cobrar ${cliente.nombre}`,
          valor: total,
          debito: total,
          credito: 0,
          naturaleza: 'D',
          consecutivo: consecutivoAsiento,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        }),
      );

      await contabilidadRepo.save(lineas);

      return ventaRepo.findOne({
        where: { id: ventaGuardada.id },
        relations: ['detalles', 'detalles.producto', 'cliente'],
      });
    });
  }

  findAll(empresaId: number) {
    return this.ventaRepo.find({
      where: { empresa_id: empresaId },
      relations: ['cliente'],
      order: { fecha: 'DESC', id: 'DESC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const venta = await this.ventaRepo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['detalles', 'detalles.producto', 'cliente'],
    });
    if (!venta) {
      throw new NotFoundException('Venta no encontrada');
    }
    return venta;
  }
}
