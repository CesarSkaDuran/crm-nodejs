import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { Cierre, EstadoCierre } from './entities/cierre.entity';
import { CreateCierreDto } from './dto/create-cierre.dto';
import { Kardex } from '../kardex/entities/kardex.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import {
  AccountingEntry,
  AccountingEntryLine,
} from '../accounting/entities/accounting-entry.entity';
import { Company } from '../companies/entities/company.entity';
import { Account } from '../accounts/entities/account.entity';
import { round2, assertBalanced, requireAccountByKeywords } from '../accounting/accounting-helpers';

@Injectable()
export class CierresService {
  constructor(
    @InjectRepository(Cierre)
    private readonly cierreRepo: Repository<Cierre>,
    @InjectRepository(Kardex)
    private readonly kardexRepo: Repository<Kardex>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(Purchase)
    private readonly purchaseRepo: Repository<Purchase>,
    @InjectRepository(AccountingEntry)
    private readonly asentadoRepo: Repository<AccountingEntry>,
    @InjectRepository(AccountingEntryLine)
    private readonly lineaRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Company)
    private readonly empresaRepo: Repository<Company>,
    @InjectRepository(Account)
    private readonly cuentaRepo: Repository<Account>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(empresaId: number, query?: any) {
    const page = Math.max(1, Number(query?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query?.limit || 20)));

    const [data, total] = await this.cierreRepo.findAndCount({
      where: { empresa_id: empresaId },
      order: { periodo: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const cierre = await this.cierreRepo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!cierre) {
      throw new NotFoundException('Cierre no encontrado');
    }
    return cierre;
  }

  async validarCierre(empresaId: number, periodo: string) {
    // Verificar que no exista un cierre ya realizado para este período
    const cierreExistente = await this.cierreRepo.findOne({
      where: {
        empresa_id: empresaId,
        periodo,
        estado: EstadoCierre.CERRADO,
      },
    });

    if (cierreExistente) {
      throw new ConflictException(
        `Ya existe un cierre cerrado para el período ${periodo}`,
      );
    }

    // Validar kardex: diferencia debe ser 0
    const [, kardexMovimientos] = await this.kardexRepo.findAndCount({
      where: { empresa_id: empresaId },
    });

    if (kardexMovimientos === 0) {
      throw new BadRequestException(
        'No hay movimientos de kardex para validar',
      );
    }

    // Calcular diferencia de kardex (suma de saldos actuales debe cuadrar)
    const kardexData = await this.kardexRepo.find({
      where: { empresa_id: empresaId },
    });

    let diferencia = 0;
    for (const k of kardexData) {
      diferencia += Number(k.saldo_actual || 0);
    }

    return {
      valido: Math.abs(diferencia) < 0.01,
      diferencia: round2(diferencia),
      movimientos: kardexMovimientos,
    };
  }

  async crear(
    dto: CreateCierreDto,
    empresaId: number,
    usuario: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const cierreRepo = manager.getRepository(Cierre);
      const kardexRepo = manager.getRepository(Kardex);
      const saleRepo = manager.getRepository(Sale);
      const purchaseRepo = manager.getRepository(Purchase);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const lineaRepo = manager.getRepository(AccountingEntryLine);
      const empresaRepo = manager.getRepository(Company);
      const cuentaRepo = manager.getRepository(Account);

      // 1. Validar que no exista cierre para este período
      const cierreExistente = await cierreRepo.findOne({
        where: {
          empresa_id: empresaId,
          periodo: dto.periodo,
          estado: EstadoCierre.CERRADO,
        },
      });

      if (cierreExistente) {
        throw new ConflictException(
          `Ya existe un cierre cerrado para el período ${dto.periodo}`,
        );
      }

      // 2. Validar kardex
      const kardexMovimientos = await kardexRepo.find({
        where: { empresa_id: empresaId },
      });

      let diferencia = 0;
      for (const k of kardexMovimientos) {
        diferencia += Number(k.saldo_actual || 0);
      }

      if (Math.abs(diferencia) > 0.01) {
        throw new BadRequestException(
          `El kardex tiene una diferencia de ${round2(diferencia)}. ` +
          `Debe cuadrar antes de cerrar el período.`,
        );
      }

      // 3. Contar movimientos en el período
      const [, totalMovimientos] = await saleRepo.findAndCount({
        where: {
          empresa_id: empresaId,
          fecha: Between(dto.fecha_inicio, dto.fecha_fin),
          estado: 1,
        },
      });

      const [, totalCompras] = await purchaseRepo.findAndCount({
        where: {
          empresa_id: empresaId,
          fecha: Between(dto.fecha_inicio, dto.fecha_fin),
          estado: 1,
        },
      });

      const [, totalAsientos] = await asentadoRepo.findAndCount({
        where: {
          empresa_id: empresaId,
          fecha: Between(dto.fecha_inicio, dto.fecha_fin),
          estado: 1,
        },
      });

      // 4. Crear registro de cierre
      const cierre = cierreRepo.create({
        empresa_id: empresaId,
        periodo: dto.periodo,
        fecha_inicio: dto.fecha_inicio,
        fecha_fin: dto.fecha_fin,
        fecha_cierre: dto.fecha_cierre,
        estado: EstadoCierre.CERRADO,
        saldo_inicial_kardex: 0,
        saldo_final_kardex: round2(
          kardexMovimientos.reduce((sum, k) => sum + Number(k.saldo_actual || 0), 0),
        ),
        diferencia_kardex: 0,
        total_movimientos: totalMovimientos + totalCompras,
        total_asientos: totalAsientos,
        descripcion: dto.descripcion,
        usuario,
        estado_registro: 1,
      });

      const cierreGuardado = await cierreRepo.save(cierre);

      // 5. Generar asiento de cierre (opcional: asiento de cierre contable)
      // Por ahora solo registramos el cierre, sin generar asientos automáticos
      // Esto puede activarse si se requiere asientos de cierre específicos

      return {
        ok: true,
        cierre: cierreGuardado,
        mensaje: `Período ${dto.periodo} cerrado correctamente. ` +
          `Movimientos: ${totalMovimientos + totalCompras}, Asientos: ${totalAsientos}`,
      };
    });
  }

  async cerrar(id: number, empresaId: number, usuario: string) {
    const cierre = await this.findOne(id, empresaId);

    if (cierre.estado !== EstadoCierre.ABIERTO) {
      throw new BadRequestException(
        `El cierre no está en estado ABIERTO. Estado actual: ${cierre.estado}`,
      );
    }

    // Validar que el kardex esté cuadrado
    const kardexMovimientos = await this.kardexRepo.find({
      where: { empresa_id: empresaId },
    });

    let diferencia = 0;
    for (const k of kardexMovimientos) {
      diferencia += Number(k.saldo_actual || 0);
    }

    if (Math.abs(diferencia) > 0.01) {
      throw new BadRequestException(
        `El kardex tiene una diferencia de ${round2(diferencia)}. ` +
        `Debe cuadrar antes de cerrar el período.`,
      );
    }

    // Cambiar estado a CERRADO
    cierre.estado = EstadoCierre.CERRADO;
    cierre.usuario = usuario;
    cierre.fecha_cierre = new Date().toISOString().split('T')[0];
    const cierreCerrado = await this.cierreRepo.save(cierre);

    return {
      ok: true,
      cierre: cierreCerrado,
      mensaje: `Cierre del período ${cierre.periodo} cerrado correctamente`,
    };
  }

  async anular(id: number, empresaId: number, usuario: string) {
    const cierre = await this.findOne(id, empresaId);

    if (cierre.estado !== EstadoCierre.CERRADO) {
      throw new BadRequestException(
        'Solo se pueden anular cierres en estado CERRADO',
      );
    }

    cierre.estado = EstadoCierre.ANULADO;
    cierre.usuario = usuario;
    await this.cierreRepo.save(cierre);

    return {
      ok: true,
      cierre,
      mensaje: `Cierre del período ${cierre.periodo} anulado correctamente`,
    };
  }

  async obtenerEstadoCierre(empresaId: number, periodo: string) {
    const cierre = await this.cierreRepo.findOne({
      where: { empresa_id: empresaId, periodo },
      order: { fecha_cierre: 'DESC' },
    });

    if (!cierre) {
      return {
        periodo,
        estado: EstadoCierre.ABIERTO,
        mensaje: 'El período está abierto',
      };
    }

    return {
      periodo,
      estado: cierre.estado,
      fecha_cierre: cierre.fecha_cierre,
      total_movimientos: cierre.total_movimientos,
      total_asientos: cierre.total_asientos,
      mensaje:
        cierre.estado === EstadoCierre.CERRADO
          ? 'El período está cerrado'
          : 'El período fue anulado',
    };
  }

  async bloquearTransaccionesEnPeriodoCerrado(
    empresaId: number,
    fecha: string,
  ): Promise<boolean> {
    const periodo = fecha.substring(0, 7); // YYYY-MM
    const cierre = await this.cierreRepo.findOne({
      where: {
        empresa_id: empresaId,
        periodo,
        estado: EstadoCierre.CERRADO,
      },
    });

    return !!cierre;
  }
}
