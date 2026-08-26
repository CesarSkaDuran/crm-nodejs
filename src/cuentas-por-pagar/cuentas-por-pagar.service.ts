import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine, AccountingEntry } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Company } from '../companies/entities/company.entity';
import { AccountingService } from '../accounting/accounting.service';
import { TipoComprobantesService } from '../tipo-comprobantes/tipo-comprobantes.service';
import { BancosService } from '../bancos/bancos.service';
import { CreatePagoDto } from './dto/create-pago.dto';
import { resolveBancoCuenta, round2, assertBalanced } from '../accounting/accounting-helpers';

@Injectable()
export class CuentasPorPagarService {
  constructor(
    @InjectRepository(Third)
    private readonly thirdRepo: Repository<Third>,
    @InjectRepository(AccountingEntryLine)
    private readonly lineRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
    return this.dataSource.transaction(async (manager) => {
      const thirdRepo = manager.getRepository(Third);
      const accountRepo = manager.getRepository(Account);
      const bancoRepo = manager.getRepository(Banco);
      const empresaRepo = manager.getRepository(Company);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);

      const proveedor = await thirdRepo.findOne({
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

      const proveedorCuenta = await accountRepo.findOne({
        where: { id: proveedor.cuenta_contable_id, empresa_id: empresaId },
      });
      if (!proveedorCuenta) {
        throw new BadRequestException('La cuenta contable del proveedor no existe');
      }

      const banco = await bancoRepo.findOne({
        where: { id: dto.banco_id, empresa_id: empresaId },
      });
      if (!banco) {
        throw new NotFoundException('Banco/caja no encontrado');
      }

      const bancoCuenta = await resolveBancoCuenta(
        accountRepo,
        empresaId,
        banco.cuenta_id,
        banco.nombre,
      );

      const monto = round2(Number(dto.valor));
      if (monto <= 0) {
        throw new BadRequestException('El valor del pago debe ser mayor a cero');
      }
      if (monto > Number(banco.monto)) {
        throw new BadRequestException(
          `El banco ${banco.nombre} no tiene saldo suficiente. Disponible: ${banco.monto}`,
        );
      }

      // Descontar banco dentro de la misma transacción
      banco.monto = round2(Number(banco.monto) - monto);
      await bancoRepo.save(banco);

      // Generar consecutivo dentro de la transacción
      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) {
        throw new NotFoundException('Empresa no encontrada');
      }
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivo =
        'PP' + empresa.consecutivo_asientos.toString().padStart(6, '0');

      const descripcion = dto.descripcion ?? `Pago a proveedor ${proveedor.nombre}`;

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: dto.tipo_comprobante_id,
        fecha: dto.fecha,
        descripcion,
        total_debito: monto,
        total_credito: monto,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      const lineas: Partial<AccountingEntryLine>[] = [
        {
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: proveedor.cuenta_contable_id,
          tercero_id: proveedor.id,
          descripcion: `Pago a ${proveedor.nombre}`,
          valor: monto,
          debito: monto,
          credito: 0,
          naturaleza: 'D',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        },
        {
          empresa_id: empresaId,
          asentado_id: asentadoGuardado.id,
          cuenta_contable_id: bancoCuenta.id,
          tercero_id: proveedor.id,
          descripcion: `Salida banco/caja pago a ${proveedor.nombre}`,
          valor: monto,
          debito: 0,
          credito: monto,
          naturaleza: 'C',
          consecutivo,
          fecha: dto.fecha,
          usuario,
          estado: 1,
        },
      ];

      // Validar balance
      const balance = assertBalanced(
        lineas.map((l) => ({
          debito: Number(l.debito || 0),
          credito: Number(l.credito || 0),
        })),
      );

      asentadoGuardado.total_debito = balance.debito;
      asentadoGuardado.total_credito = balance.credito;
      await asentadoRepo.save(asentadoGuardado);

      await contabilidadRepo.save(
        lineas.map((l) => contabilidadRepo.create(l)),
      );

      return asentadoGuardado;
    });
  }
}
