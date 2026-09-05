import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Third } from '../thirds/entities/third.entity';
import { Credito, EstadoCredito } from '../cartera/entities/credito.entity';
import { Product } from '../products/entities/product.entity';
import { round2 } from '../accounting/accounting-helpers';

@Injectable()
export class ValidacionesService {
  constructor(
    @InjectRepository(Third)
    private readonly terceroRepo: Repository<Third>,
    @InjectRepository(Credito)
    private readonly creditoRepo: Repository<Credito>,
    @InjectRepository(Product)
    private readonly productoRepo: Repository<Product>,
  ) {}

  /**
   * Valida que el cliente no haya excedido su límite de crédito
   */
  async validarLimiteCredito(
    empresaId: number,
    clienteId: number,
    montoNuevo: number,
  ): Promise<{ valido: boolean; mensaje?: string; saldo_disponible?: number }> {
    const cliente = await this.terceroRepo.findOne({
      where: { id: clienteId, empresa_id: empresaId },
    });

    if (!cliente) {
      throw new BadRequestException('Cliente no encontrado');
    }

    const cupoDisponible = Number(cliente.cupo || 0);
    if (cupoDisponible <= 0) {
      return {
        valido: false,
        mensaje: `El cliente ${cliente.nombre} no tiene cupo de crédito asignado`,
      };
    }

    // Obtener saldo actual de créditos activos
    const creditosActivos = await this.creditoRepo.find({
      where: {
        empresa_id: empresaId,
        tercero_id: clienteId,
        estado: EstadoCredito.ACTIVO,
      },
    });

    let saldoActual = 0;
    for (const credito of creditosActivos) {
      saldoActual = round2(saldoActual + Number(credito.saldo || 0));
    }

    const saldoDisponible = round2(cupoDisponible - saldoActual);

    if (montoNuevo > saldoDisponible) {
      return {
        valido: false,
        mensaje: `Crédito insuficiente. Cupo: ${cupoDisponible}, Usado: ${saldoActual}, Disponible: ${saldoDisponible}`,
        saldo_disponible: saldoDisponible,
      };
    }

    return {
      valido: true,
      saldo_disponible: saldoDisponible,
    };
  }

  /**
   * Valida que hay stock suficiente para una venta
   */
  async validarStock(
    empresaId: number,
    productoId: number,
    cantidad: number,
  ): Promise<{ valido: boolean; mensaje?: string; stock_disponible?: number }> {
    const producto = await this.productoRepo.findOne({
      where: { id: productoId, empresa_id: empresaId },
    });

    if (!producto) {
      throw new BadRequestException('Producto no encontrado');
    }

    const stockDisponible = Number(producto.stock || 0);

    if (cantidad > stockDisponible) {
      return {
        valido: false,
        mensaje: `Stock insuficiente para ${producto.nombre}. Disponible: ${stockDisponible}, Solicitado: ${cantidad}`,
        stock_disponible: stockDisponible,
      };
    }

    return {
      valido: true,
      stock_disponible: stockDisponible - cantidad,
    };
  }

  /**
   * Valida que el proveedor no tenga deuda vencida
   */
  async validarDeudaVencidaProveedor(
    empresaId: number,
    proveedorId: number,
  ): Promise<{ valido: boolean; mensaje?: string; deuda_vencida?: number }> {
    const hoy = new Date().toISOString().split('T')[0];

    const creditosVencidos = await this.creditoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cuotas', 'cu')
      .where('c.empresa_id = :empresaId', { empresaId })
      .andWhere('c.tercero_id = :proveedorId', { proveedorId })
      .andWhere('c.estado != :pagado', { pagado: EstadoCredito.PAGADO })
      .andWhere('cu.fecha_vencimiento < :hoy', { hoy })
      .andWhere('cu.estado != :pagada', { pagada: 3 }) // EstadoCuota.PAGADA
      .getMany();

    let deudaVencida = 0;
    for (const credito of creditosVencidos) {
      deudaVencida = round2(deudaVencida + Number(credito.saldo || 0));
    }

    if (deudaVencida > 0) {
      return {
        valido: false,
        mensaje: `El proveedor tiene deuda vencida por ${deudaVencida}. Debe regularizar antes de nuevas compras.`,
        deuda_vencida: deudaVencida,
      };
    }

    return {
      valido: true,
      deuda_vencida: 0,
    };
  }

  /**
   * Obtiene resumen de límites de crédito por cliente
   */
  async obtenerResumenCredito(empresaId: number, clienteId: number) {
    const cliente = await this.terceroRepo.findOne({
      where: { id: clienteId, empresa_id: empresaId },
    });

    if (!cliente) {
      throw new BadRequestException('Cliente no encontrado');
    }

    const creditosActivos = await this.creditoRepo.find({
      where: {
        empresa_id: empresaId,
        tercero_id: clienteId,
        estado: EstadoCredito.ACTIVO,
      },
    });

    let saldoActual = 0;
    for (const credito of creditosActivos) {
      saldoActual = round2(saldoActual + Number(credito.saldo || 0));
    }

    const cupoDisponible = Number(cliente.cupo || 0);
    const saldoDisponible = round2(cupoDisponible - saldoActual);
    const porcentajeUtilizado = cupoDisponible > 0 ? round2((saldoActual / cupoDisponible) * 100) : 0;

    return {
      cliente_id: clienteId,
      nombre_cliente: cliente.nombre,
      cupo_total: cupoDisponible,
      saldo_utilizado: saldoActual,
      saldo_disponible: saldoDisponible,
      porcentaje_utilizado: porcentajeUtilizado,
      creditos_activos: creditosActivos.length,
    };
  }

  /**
   * Valida que el precio unitario sea razonable (no sea 0 o negativo)
   */
  validarPrecioUnitario(precio: number): { valido: boolean; mensaje?: string } {
    if (precio < 0) {
      return {
        valido: false,
        mensaje: 'El precio unitario no puede ser negativo',
      };
    }

    if (precio === 0) {
      return {
        valido: false,
        mensaje: 'El precio unitario debe ser mayor a cero',
      };
    }

    return { valido: true };
  }

  /**
   * Valida que el descuento sea un porcentaje válido (0-100)
   */
  validarDescuento(descuento: number): { valido: boolean; mensaje?: string } {
    if (descuento < 0 || descuento > 100) {
      return {
        valido: false,
        mensaje: 'El descuento debe estar entre 0 y 100',
      };
    }

    return { valido: true };
  }

  /**
   * Valida que el impuesto sea un porcentaje válido (0-100)
   */
  validarImpuesto(impuesto: number): { valido: boolean; mensaje?: string } {
    if (impuesto < 0 || impuesto > 100) {
      return {
        valido: false,
        mensaje: 'El impuesto debe estar entre 0 y 100',
      };
    }

    return { valido: true };
  }
}
