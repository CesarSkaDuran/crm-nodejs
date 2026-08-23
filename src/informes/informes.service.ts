import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { AccountingEntry } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { Third } from '../thirds/entities/third.entity';

@Injectable()
export class InformesService {
  constructor(
    @InjectRepository(AccountingEntryLine)
    private readonly lineRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
  ) {}

  async libroMayor(query: any, empresaId: number) {
    const { cuenta_id, date, date2, modo = 'detallado' } = query;

    if (!cuenta_id) {
      throw new NotFoundException('Debe seleccionar una cuenta');
    }

    const cuenta = await this.accountRepo.findOne({
      where: { id: Number(cuenta_id), empresa_id: empresaId },
    });

    if (!cuenta) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    return this.buildLibro(query, empresaId, cuenta, modo);
  }

  async libroRango(query: any, empresaId: number) {
    const { desde_id, hasta_id, date, date2, modo = 'detallado' } = query;

    if (!desde_id || !hasta_id) {
      throw new NotFoundException('Debe seleccionar cuenta inicial y final');
    }

    const [desde, hasta] = await Promise.all([
      this.accountRepo.findOne({ where: { id: Number(desde_id), empresa_id: empresaId } }),
      this.accountRepo.findOne({ where: { id: Number(hasta_id), empresa_id: empresaId } }),
    ]);

    if (!desde || !hasta) {
      throw new NotFoundException('Cuentas no encontradas');
    }

    return this.buildLibro(
      { ...query, range: [desde.codigo, hasta.codigo] },
      empresaId,
      desde,
      modo,
    );
  }

  private async buildLibro(query: any, empresaId: number, cuentaRef: Account, modo: string) {
    const { date, date2, range, tercero_id } = query;
    const cuenta = cuentaRef;

    const qb = this.accountRepo
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .where('a.empresa_id = :empresaId', { empresaId });

    if (range) {
      qb.andWhere('a.codigo BETWEEN :desde AND :hasta', { desde: range[0], hasta: range[1] });
    } else {
      qb.andWhere('a.codigo LIKE :codigo', { codigo: `${cuenta.codigo}%` });
    }

    const codes = await qb.getRawMany();

    const ids = codes.map((c) => c.id);

    const lineQb = this.lineRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.cuenta_contable', 'cuenta')
      .leftJoinAndSelect('c.tercero', 'tercero')
      .where('c.empresa_id = :empresaId', { empresaId })
      .andWhere('c.cuenta_contable_id IN (:...ids)', { ids })
      .orderBy('c.fecha', 'ASC')
      .addOrderBy('c.id', 'ASC');

    if (date) {
      lineQb.andWhere('c.fecha >= :date', { date });
    }
    if (date2) {
      lineQb.andWhere('c.fecha <= :date2', { date2 });
    }
    if (tercero_id) {
      lineQb.andWhere('c.tercero_id = :tercero_id', { tercero_id });
    }

    const [data, total] = await lineQb.getManyAndCount();

    const totales = await this.lineRepo
      .createQueryBuilder('c')
      .where('c.empresa_id = :empresaId', { empresaId })
      .andWhere('c.cuenta_contable_id IN (:...ids)', { ids })
      .andWhere(
        date && date2
          ? 'c.fecha BETWEEN :date AND :date2'
          : '1=1',
        { date, date2 },
      )
      .andWhere(tercero_id ? 'c.tercero_id = :tercero_id' : '1=1', { tercero_id })
      .select('COALESCE(SUM(c.debito), 0)', 'debito')
      .addSelect('COALESCE(SUM(c.credito), 0)', 'credito')
      .getRawOne();

    const totalDebito = Number(totales?.debito ?? 0);
    const totalCredito = Number(totales?.credito ?? 0);

    let resultado: any[] = [];
    let saldo = 0;

    if (modo === 'detallado') {
      for (const row of data) {
        const valor = Number(row.debito) - Number(row.credito);
        saldo += valor;
        resultado.push({ ...row, valor, saldo });
      }
    } else if (modo === 'resumido') {
      const map = new Map<number, any>();
      for (const row of data) {
        const id = row.cuenta_contable_id;
        if (!map.has(id)) {
          map.set(id, {
            cuenta: row.cuenta_contable,
            debito: 0,
            credito: 0,
          });
        }
        const item = map.get(id);
        item.debito += Number(row.debito);
        item.credito += Number(row.credito);
      }
      resultado = Array.from(map.values()).map((x: any) => ({
        ...x,
        saldo: x.debito - x.credito,
      }));
    } else if (modo === 'porComprobante') {
      const map = new Map<string, any>();
      for (const row of data) {
        const con = row.consecutivo || 'S/N';
        if (!map.has(con)) {
          map.set(con, {
            consecutivo: con,
            fecha: row.fecha,
            debito: 0,
            credito: 0,
          });
        }
        const item = map.get(con);
        item.debito += Number(row.debito);
        item.credito += Number(row.credito);
      }
      resultado = Array.from(map.values()).map((x: any) => ({
        ...x,
        saldo: x.debito - x.credito,
      }));
    } else if (modo === 'discriminado') {
      const map = new Map<number | string, any>();
      for (const row of data) {
        const key = row.tercero_id ?? 'SIN_TERCERO';
        if (!map.has(key)) {
          map.set(key, {
            tercero: row.tercero ?? { nombre: 'Sin tercero' },
            debito: 0,
            credito: 0,
          });
        }
        const item = map.get(key);
        item.debito += Number(row.debito);
        item.credito += Number(row.credito);
      }
      resultado = Array.from(map.values()).map((x: any) => ({
        ...x,
        saldo: x.debito - x.credito,
      }));
    }

    return {
      cuenta,
      modo,
      data: resultado,
      total,
      total_debito: totalDebito,
      total_credito: totalCredito,
      saldo_final: totalDebito - totalCredito,
    };
  }

  async libroTerceros(query: any, empresaId: number) {
    const { tercero_id, cuenta_id, date, date2, modo = 'detallado' } = query;

    if (!tercero_id) {
      throw new NotFoundException('Debe seleccionar un tercero');
    }
    if (!cuenta_id) {
      throw new NotFoundException('Debe seleccionar una cuenta');
    }

    const cuenta = await this.accountRepo.findOne({
      where: { id: Number(cuenta_id), empresa_id: empresaId },
    });

    if (!cuenta) {
      throw new NotFoundException('Cuenta no encontrada');
    }

    return this.buildLibro(
      { ...query, tercero_id: Number(tercero_id) },
      empresaId,
      cuenta,
      modo,
    );
  }

  async balanceGeneral(query: any, empresaId: number) {
    const { date, date2 } = query;

    const params: any[] = [empresaId];
    let dateFilter = '';

    if (date) {
      dateFilter += ' AND c.fecha >= ? ';
      params.push(date);
    }
    if (date2) {
      dateFilter += ' AND c.fecha <= ? ';
      params.push(date2);
    }

    const rows = await this.lineRepo.query(
      `
      SELECT
        p.id,
        p.codigo,
        p.nombre,
        p.clase,
        p.naturaleza,
        CAST(SUM(c.debito) AS DECIMAL(15,2)) AS debito,
        CAST(SUM(c.credito) AS DECIMAL(15,2)) AS credito,
        CAST(SUM(c.debito - c.credito) AS DECIMAL(15,2)) AS saldo
      FROM contabilidad c
      INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
      WHERE c.empresa_id = ? ${dateFilter}
      GROUP BY c.cuenta_contable_id
      ORDER BY p.codigo ASC
      `,
      params,
    );

    const totales = { activo: 0, pasivo: 0, patrimonio: 0 };
    let totalDebito = 0;
    let totalCredito = 0;

    for (const r of rows) {
      const d = Number(r.debito ?? 0);
      const cr = Number(r.credito ?? 0);
      const s = Number(r.saldo ?? 0);
      totalDebito += d;
      totalCredito += cr;

      const clase = String(r.clase ?? '').trim();
      if (clase === '1') {
        totales.activo += d - cr;
      } else if (clase === '2') {
        totales.pasivo += cr - d;
      } else if (clase === '3') {
        totales.patrimonio += cr - d;
      }
    }

    return {
      data: rows,
      totales: {
        ...totales,
        pasivo_mas_patrimonio: totales.pasivo + totales.patrimonio,
      },
      total_debito: totalDebito,
      total_credito: totalCredito,
    };
  }

  async pyg(query: any, empresaId: number) {
    const { date, date2 } = query;

    const params: any[] = [empresaId];
    let dateFilter = '';

    if (date) {
      dateFilter += ' AND c.fecha >= ? ';
      params.push(date);
    }
    if (date2) {
      dateFilter += ' AND c.fecha <= ? ';
      params.push(date2);
    }

    const rows = await this.lineRepo.query(
      `
      SELECT
        p.id,
        p.codigo,
        p.nombre,
        p.clase,
        p.naturaleza,
        CAST(SUM(c.debito) AS DECIMAL(15,2)) AS debito,
        CAST(SUM(c.credito) AS DECIMAL(15,2)) AS credito,
        CAST(SUM(c.debito - c.credito) AS DECIMAL(15,2)) AS saldo
      FROM contabilidad c
      INNER JOIN plan_cuentas p ON p.id = c.cuenta_contable_id
      WHERE c.empresa_id = ?
        AND (p.clase = '4' OR p.clase = '5')
        ${dateFilter}
      GROUP BY c.cuenta_contable_id
      ORDER BY p.clase, p.codigo ASC
      `,
      params,
    );

    const totales = { ingresos: 0, gastos: 0, utilidad: 0 };
    let totalDebito = 0;
    let totalCredito = 0;

    for (const r of rows) {
      const d = Number(r.debito ?? 0);
      const cr = Number(r.credito ?? 0);
      const s = Number(r.saldo ?? 0);
      totalDebito += d;
      totalCredito += cr;

      const clase = String(r.clase ?? '').trim();
      if (clase === '4') {
        totales.ingresos += -(s);
      } else if (clase === '5') {
        totales.gastos += s;
      }
    }

    totales.utilidad = totales.ingresos - totales.gastos;

    return {
      data: rows,
      totales,
      total_debito: totalDebito,
      total_credito: totalCredito,
    };
  }
}
