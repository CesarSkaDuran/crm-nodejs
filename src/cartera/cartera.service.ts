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
import { CreateCobroDto } from './dto/create-cobro.dto';
import { resolveBancoCuenta, round2, assertBalanced } from '../accounting/accounting-helpers';

@Injectable()
export class CarteraService {
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
    return this.dataSource.transaction(async (manager) => {
      const thirdRepo = manager.getRepository(Third);
      const accountRepo = manager.getRepository(Account);
      const bancoRepo = manager.getRepository(Banco);
      const empresaRepo = manager.getRepository(Company);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const contabilidadRepo = manager.getRepository(AccountingEntryLine);

      const cliente = await thirdRepo.findOne({
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

      const clienteCuenta = await accountRepo.findOne({
        where: { id: cliente.cuenta_contable_id, empresa_id: empresaId },
      });
      if (!clienteCuenta) {
        throw new BadRequestException('La cuenta contable del cliente no existe');
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
        throw new BadRequestException('El valor del cobro debe ser mayor a cero');
      }

      // Sumar al banco dentro de la misma transacción
      banco.monto = round2(Number(banco.monto) + monto);
      await bancoRepo.save(banco);

      // Generar consecutivo dentro de la transacción
      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      if (!empresa) {
        throw new NotFoundException('Empresa no encontrada');
      }
      empresa.consecutivo_asientos = (empresa.consecutivo_asientos || 0) + 1;
      await empresaRepo.save(empresa);

      const consecutivo =
        'CB' + empresa.consecutivo_asientos.toString().padStart(6, '0');

      const descripcion = dto.descripcion ?? `Cobro a cliente ${cliente.nombre}`;

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
          cuenta_contable_id: bancoCuenta.id,
          tercero_id: cliente.id,
          descripcion: `Entrada banco/caja cobro a ${cliente.nombre}`,
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
          cuenta_contable_id: cliente.cuenta_contable_id,
          tercero_id: cliente.id,
          descripcion: `Cobro a ${cliente.nombre}`,
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
