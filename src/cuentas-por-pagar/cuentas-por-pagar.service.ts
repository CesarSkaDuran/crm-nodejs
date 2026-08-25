import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { AccountingService } from '../accounting/accounting.service';
import { TipoComprobantesService } from '../tipo-comprobantes/tipo-comprobantes.service';
import { BancosService } from '../bancos/bancos.service';
import { CreatePagoDto } from './dto/create-pago.dto';

@Injectable()
export class CuentasPorPagarService {
  constructor(
    @InjectRepository(Third)
    private readonly thirdRepo: Repository<Third>,
    @InjectRepository(AccountingEntryLine)
    private readonly lineRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly accountingService: AccountingService,
    private readonly tipoCompService: TipoComprobantesService,
    private readonly bancosService: BancosService,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const [proveedores, total] = await this.thirdRepo.findAndCount({
      where: { empresa_id: empresaId, tipo_terceros: 2, estado: 1 },
      order: { nombre: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = [];
    const hoy = new Date();

    for (const t of proveedores) {
      const res = await this.lineRepo
        .createQueryBuilder('c')
        .select('COALESCE(SUM(c.debito), 0)', 'debito')
        .addSelect('COALESCE(SUM(c.credito), 0)', 'credito')
        .where('c.empresa_id = :empresaId AND c.tercero_id = :terceroId', {
          empresaId,
          terceroId: t.id,
        })
        .getRawOne();

      const debito = Number(res?.debito ?? 0);
      const credito = Number(res?.credito ?? 0);
      const saldo = credito - debito;

      if (!query.solo_saldo_positivo || saldo > 0) {
        const movimientos = await this.lineRepo.find({
          where: { empresa_id: empresaId, tercero_id: t.id },
          order: { fecha: 'ASC', id: 'ASC' },
        });

        const debits = movimientos.filter((m) => Number(m.debito) > 0);
        const credits = movimientos.filter((m) => Number(m.credito) > 0);

        const fecha_oportuna = debits[0]?.fecha ?? null;
        const ultimo_pago = credits.length ? credits[credits.length - 1].fecha : null;
        const ultimoPagoFecha = ultimo_pago ? new Date(ultimo_pago) : null;
        const oportunaFecha = fecha_oportuna ? new Date(fecha_oportuna) : null;

        let dias_mora = null;
        const referencia = ultimoPagoFecha || oportunaFecha;
        if (referencia) {
          const diff = hoy.getTime() - referencia.getTime();
          dias_mora = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
        }

        const vr_cuota = credits.length
          ? Number(credits[credits.length - 1].credito)
          : debits.length
            ? Number(debits[0].debito)
            : 0;

        data.push({
          tercero_id: t.id,
          nombre: t.nombre,
          documento: t.documento,
          total_debito: debito,
          total_credito: credito,
          saldo,
          cobrador: null,
          vendedor: null,
          centro: null,
          fecha_oportuna,
          ultimo_pago,
          dias_mora,
          vr_cuota,
        });
      }
    }

    return { data, total: proveedores.length, page, limit };
  }

  async findOne(terceroId: number, empresaId: number) {
    const proveedor = await this.thirdRepo.findOne({
      where: { id: terceroId, empresa_id: empresaId, tipo_terceros: 2 },
    });
    if (!proveedor) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    const res = await this.lineRepo
      .createQueryBuilder('c')
      .select('COALESCE(SUM(c.debito), 0)', 'debito')
      .addSelect('COALESCE(SUM(c.credito), 0)', 'credito')
      .where('c.empresa_id = :empresaId AND c.tercero_id = :terceroId', {
        empresaId,
        terceroId,
      })
      .getRawOne();

    const movimientos = await this.lineRepo.find({
      where: { empresa_id: empresaId, tercero_id: terceroId },
      relations: ['cuenta_contable', 'asentado'],
      order: { id: 'DESC' },
    });

    return {
      tercero: proveedor,
      resumen: {
        total_debito: Number(res?.debito ?? 0),
        total_credito: Number(res?.credito ?? 0),
        saldo: Number(res?.credito ?? 0) - Number(res?.debito ?? 0),
      },
      movimientos,
    };
  }

  async pagar(dto: CreatePagoDto, empresaId: number, usuario: string) {
    const proveedor = await this.thirdRepo.findOne({
      where: { id: dto.tercero_id, empresa_id: empresaId },
    });
    if (!proveedor) {
      throw new NotFoundException('Proveedor no encontrado');
    }
    if (!proveedor.cuenta_contable_id) {
      throw new BadRequestException(
        `El proveedor ${proveedor.nombre} no tiene cuenta contable asignada`,
      );
    }

    const proveedorCuenta = await this.accountRepo.findOne({
      where: { id: proveedor.cuenta_contable_id, empresa_id: empresaId },
    });
    if (!proveedorCuenta) {
      throw new BadRequestException('La cuenta contable del proveedor no existe');
    }

    const banco = await this.bancosService.findOne(dto.banco_id, empresaId);
    if (!banco) {
      throw new NotFoundException('Banco/caja no encontrado');
    }
    if (!banco.cuenta_id) {
      throw new BadRequestException(
        `El banco ${banco.nombre} no tiene una cuenta del Plan Único de Cuentas asignada`,
      );
    }

    const bancoCuenta = await this.accountRepo.findOne({
      where: { codigo: banco.cuenta_id, empresa_id: empresaId },
    });
    if (!bancoCuenta) {
      throw new BadRequestException(
        `La cuenta contable del banco ${banco.nombre} no existe en el Plan Único de Cuentas`,
      );
    }

    const monto = Number(dto.valor);
    if (monto <= 0) {
      throw new BadRequestException('El valor del pago debe ser mayor a cero');
    }
    if (monto > Number(banco.monto)) {
      throw new BadRequestException(
        `El banco ${banco.nombre} no tiene saldo suficiente. Disponible: ${banco.monto}`,
      );
    }

    const consecutivo = await this.tipoCompService.nextConsecutivo(
      dto.tipo_comprobante_id,
      empresaId,
    );

    const asientoDto = {
      consecutivo,
      tipo: dto.tipo_comprobante_id,
      fecha: dto.fecha,
      descripcion: dto.descripcion ?? `Pago a proveedor ${proveedor.nombre}`,
      detalles: [
        {
          cuenta_contable_id: proveedor.cuenta_contable_id,
          tercero_id: proveedor.id,
          descripcion: dto.descripcion ?? `Pago a ${proveedor.nombre}`,
          valor: monto,
          naturaleza: proveedorCuenta.naturaleza === 'C' ? 'D' : 'C',
        },
        {
          cuenta_contable_id: bancoCuenta.id,
          descripcion:
            dto.descripcion ?? `Salida banco/caja pago a ${proveedor.nombre}`,
          valor: monto,
          naturaleza: bancoCuenta.naturaleza === 'D' ? 'C' : 'D',
        },
      ],
    };

    const asiento = await this.accountingService.create(asientoDto, empresaId, usuario);
    await this.bancosService.descontar(dto.banco_id, monto, empresaId);
    return asiento;
  }
}
