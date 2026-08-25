import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { AccountingService } from '../accounting/accounting.service';
import { TipoComprobantesService } from '../tipo-comprobantes/tipo-comprobantes.service';
import { BancosService } from '../bancos/bancos.service';
import { CreateCobroDto } from './dto/create-cobro.dto';

@Injectable()
export class CarteraService {
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

    const [clientes, total] = await this.thirdRepo.findAndCount({
      where: { empresa_id: empresaId, tipo_terceros: 1, estado: 1 },
      order: { nombre: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data = [];
    for (const t of clientes) {
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
      const saldo = debito - credito;

      if (!query.solo_saldo_positivo || saldo > 0) {
        data.push({
          tercero_id: t.id,
          nombre: t.nombre,
          documento: t.documento,
          total_debito: debito,
          total_credito: credito,
          saldo,
        });
      }
    }

    return { data, total: clientes.length, page, limit };
  }

  async findOne(terceroId: number, empresaId: number) {
    const cliente = await this.thirdRepo.findOne({
      where: { id: terceroId, empresa_id: empresaId, tipo_terceros: 1 },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
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
      tercero: cliente,
      resumen: {
        total_debito: Number(res?.debito ?? 0),
        total_credito: Number(res?.credito ?? 0),
        saldo: Number(res?.debito ?? 0) - Number(res?.credito ?? 0),
      },
      movimientos,
    };
  }

  async cobrar(dto: CreateCobroDto, empresaId: number, usuario: string) {
    const cliente = await this.thirdRepo.findOne({
      where: { id: dto.tercero_id, empresa_id: empresaId },
    });
    if (!cliente) {
      throw new NotFoundException('Cliente no encontrado');
    }
    if (!cliente.cuenta_contable_id) {
      throw new BadRequestException(
        `El cliente ${cliente.nombre} no tiene cuenta contable asignada`,
      );
    }

    const clienteCuenta = await this.accountRepo.findOne({
      where: { id: cliente.cuenta_contable_id, empresa_id: empresaId },
    });
    if (!clienteCuenta) {
      throw new BadRequestException('La cuenta contable del cliente no existe');
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
      throw new BadRequestException('El valor del cobro debe ser mayor a cero');
    }

    const consecutivo = await this.tipoCompService.nextConsecutivo(
      dto.tipo_comprobante_id,
      empresaId,
    );

    const asientoDto = {
      consecutivo,
      tipo: dto.tipo_comprobante_id,
      fecha: dto.fecha,
      descripcion: dto.descripcion ?? `Cobro a cliente ${cliente.nombre}`,
      detalles: [
        {
          cuenta_contable_id: bancoCuenta.id,
          descripcion:
            dto.descripcion ?? `Entrada banco/caja cobro a ${cliente.nombre}`,
          valor: monto,
          naturaleza: bancoCuenta.naturaleza === 'D' ? 'D' : 'C',
        },
        {
          cuenta_contable_id: cliente.cuenta_contable_id,
          tercero_id: cliente.id,
          descripcion: dto.descripcion ?? `Cobro a ${cliente.nombre}`,
          valor: monto,
          naturaleza: clienteCuenta.naturaleza === 'D' ? 'C' : 'D',
        },
      ],
    };

    const asiento = await this.accountingService.create(asientoDto, empresaId, usuario);
    await this.bancosService.agregar(dto.banco_id, monto, empresaId);
    return asiento;
  }
}
