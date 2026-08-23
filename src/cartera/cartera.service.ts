import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';

@Injectable()
export class CarteraService {
  constructor(
    @InjectRepository(Third)
    private readonly thirdRepo: Repository<Third>,
    @InjectRepository(AccountingEntryLine)
    private readonly lineRepo: Repository<AccountingEntryLine>,
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
}
