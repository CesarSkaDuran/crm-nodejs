import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Third } from './entities/third.entity';
import { CreateThirdDto } from './dto/create-third.dto';
import { UpdateThirdDto } from './dto/update-third.dto';
import { Account } from '../accounts/entities/account.entity';

@Injectable()
export class ThirdsService {
  constructor(
    @InjectRepository(Third)
    private readonly repo: Repository<Third>,
    @InjectRepository(Account)
    private readonly cuentaRepo: Repository<Account>,
  ) {}

  private async validarCuenta(empresaId: number, cuentaId?: number) {
    if (!cuentaId) return;
    const cuenta = await this.cuentaRepo.findOne({
      where: { id: cuentaId, empresa_id: empresaId },
    });
    if (!cuenta) {
      throw new BadRequestException(
        'La cuenta contable no existe en esta empresa',
      );
    }
  }

  /**
   * Busca automáticamente una cuenta contable adecuada según el tipo de tercero.
   * Prioriza cuentas hoja (clasificacion=4) y busca por palabras clave del PUC colombiano.
   * Retorna null si no encuentra ninguna cuenta candidata.
   */
  private async sugerirCuentaPorTipo(
    empresaId: number,
    tipoTerceros: number,
  ): Promise<number | null> {
    const palabras: Record<number, string[]> = {
      // TipoTercero.CLIENTE
      1: ['cliente', '1305', '1.3.05', 'cuenta por cobrar'],
      // TipoTercero.PROVEEDOR
      2: ['proveedor', '2205', '2.2.05', 'cuenta por pagar'],
      // TipoTercero.EMPLEADO
      3: ['empleado', 'salario', '2335', '2.3.35', 'obligacion laboral'],
      // TipoTercero.VENDEDOR
      4: ['vendedor', 'comision', '1305', '1.3.05'],
      // TipoTercero.OTRO -> 1305 por defecto (cuentas por cobrar)
      5: ['1305', '1.3.05', 'cliente', 'cuenta por cobrar'],
    };

    const terminos = palabras[tipoTerceros] || palabras[5];
    const qb = this.cuentaRepo
      .createQueryBuilder('c')
      .where('c.empresa_id = :empresaId', { empresaId })
      .andWhere('c.estado = 1');

    // Construir OR con LIKE por cada término (código o nombre)
    const condiciones: string[] = [];
    const params: any = { empresaId };
    terminos.forEach((t, i) => {
      condiciones.push(
        `(LOWER(c.codigo) LIKE :t${i} OR LOWER(c.nombre) LIKE :t${i})`,
      );
      params[`t${i}`] = `%${t.toLowerCase()}%`;
    });
    qb.andWhere(`(${condiciones.join(' OR ')})`, params);

    // Preferir cuentas hoja (clasificacion=4) y ordenar por código
    qb.orderBy('CASE c.clasificacion WHEN 4 THEN 0 ELSE 1 END', 'ASC')
      .addOrderBy('c.codigo', 'ASC')
      .limit(1);

    const cuenta = await qb.getOne();
    return cuenta ? cuenta.id : null;
  }

  private async generarCodigo(empresaId: number): Promise<string> {
    const total = await this.repo.count({ where: { empresa_id: empresaId } });
    let consecutivo = total + 1;
    let codigo = `TER${consecutivo.toString().padStart(4, '0')}`;

    while (await this.repo.findOne({ where: { codigo, empresa_id: empresaId } })) {
      consecutivo++;
      codigo = `TER${consecutivo.toString().padStart(4, '0')}`;
    }

    return codigo;
  }

  async create(dto: CreateThirdDto, empresaId: number) {
    const codigo = dto.codigo?.trim() || (await this.generarCodigo(empresaId));

    const exists = await this.repo.findOne({
      where: { codigo, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException(
        'El código de tercero ya existe en esta empresa',
      );
    }

    await this.validarCuenta(empresaId, dto.cuenta_contable_id);

    // Auto-asignar cuenta contable según tipo_terceros si no se especificó
    let cuentaContableId = dto.cuenta_contable_id;
    if (!cuentaContableId) {
      const sugerida = await this.sugerirCuentaPorTipo(
        empresaId,
        dto.tipo_terceros ?? 1,
      );
      if (sugerida) cuentaContableId = sugerida;
    }

    const tercero = this.repo.create({
      ...dto,
      codigo,
      cuenta_contable_id: cuentaContableId,
      empresa_id: empresaId,
    });
    return this.repo.save(tercero);
  }

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(200, Math.max(1, Number(query.limit || 10)));
    const tipoTerceros = query.tipo_terceros
      ? Number(query.tipo_terceros)
      : undefined;

    const qb = this.repo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.cuenta_contable', 'cuenta_contable')
      .where('t.empresa_id = :empresaId', { empresaId })
      .orderBy('t.nombre', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (tipoTerceros) {
      qb.andWhere('t.tipo_terceros = :tipoTerceros', { tipoTerceros });
    }

    if (query.search) {
      qb.andWhere(
        '(t.nombre LIKE :search OR t.documento LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.date && query.date2) {
      qb.andWhere('t.created_at BETWEEN :date AND :date2', {
        date: query.date,
        date2: `${query.date2} 23:59:59`,
      });
    } else if (query.date) {
      qb.andWhere('t.created_at >= :date', { date: query.date });
    } else if (query.date2) {
      qb.andWhere('t.created_at <= :date2', {
        date2: `${query.date2} 23:59:59`,
      });
    }

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const tercero = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['cuenta_contable'],
    });
    if (!tercero) {
      throw new NotFoundException('Tercero no encontrado');
    }
    return tercero;
  }

  async update(id: number, empresaId: number, dto: UpdateThirdDto) {
    const tercero = await this.findOne(id, empresaId);

    if (dto.codigo && dto.codigo !== tercero.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException(
          'El código de tercero ya existe en esta empresa',
        );
      }
    }

    if (dto.cuenta_contable_id !== undefined) {
      await this.validarCuenta(empresaId, dto.cuenta_contable_id);
    }

    Object.assign(tercero, dto);
    return this.repo.save(tercero);
  }

  async remove(id: number, empresaId: number) {
    const tercero = await this.findOne(id, empresaId);
    await this.repo.remove(tercero);
  }
}
