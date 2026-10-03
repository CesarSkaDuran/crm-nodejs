import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Account, EMPRESA_GLOBAL } from './entities/account.entity';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
    @InjectRepository(AccountingEntryLine)
    private readonly lineaRepo: Repository<AccountingEntryLine>,
  ) {}

  /** PUC base compartido (empresa_id=0) + cuentas propias de la empresa. */
  private visibles(empresaId: number) {
    return In([EMPRESA_GLOBAL, empresaId]);
  }

  private assertPuedeModificar(cuenta: Account, esSuperadmin: boolean) {
    if (Number(cuenta.empresa_id) === EMPRESA_GLOBAL && !esSuperadmin) {
      throw new ForbiddenException(
        'Las cuentas del Plan Único de Cuentas base solo las puede ' +
          'modificar el administrador de la plataforma',
      );
    }
  }

  private async validarPadre(empresaId: number, padreId?: number) {
    if (!padreId) return;
    const padre = await this.repo.findOne({
      where: { id: padreId, empresa_id: this.visibles(empresaId) },
    });
    if (!padre) {
      throw new BadRequestException(
        'La cuenta padre no existe en esta empresa',
      );
    }
  }

  async create(dto: CreateAccountDto, empresaId: number, esSuperadmin = false) {
    // El superadmin crea cuentas del PUC base (empresa_id=0); una empresa
    // crea cuentas especiales visibles solo para ella. En ambos casos el
    // código no puede colisionar con el catálogo visible.
    const exists = await this.repo.findOne(
      esSuperadmin
        ? { where: { codigo: dto.codigo } }
        : { where: { codigo: dto.codigo, empresa_id: this.visibles(empresaId) } },
    );
    if (exists) {
      throw new ConflictException(
        exists.empresa_id === EMPRESA_GLOBAL
          ? 'El código de cuenta ya existe en el Plan Único de Cuentas base'
          : 'El código de cuenta ya existe en esta empresa',
      );
    }

    await this.validarPadre(empresaId, dto.cuenta_padre_id);

    const cuenta = this.repo.create({
      ...dto,
      empresa_id: esSuperadmin ? EMPRESA_GLOBAL : empresaId,
    });
    return this.repo.save(cuenta);
  }

  async findAll(empresaId: number) {
    const cuentas = await this.repo.find({
      where: { empresa_id: this.visibles(empresaId) },
      order: { codigo: 'ASC' },
    });

    // Marcar cuentas con movimientos contables (no se pueden eliminar).
    // Una sola consulta agrupada; incluye líneas anuladas porque también
    // son historia contable.
    const movs = await this.lineaRepo
      .createQueryBuilder('l')
      .select('l.cuenta_contable_id', 'cuenta_id')
      .addSelect('COUNT(*)', 'total')
      .where('l.empresa_id = :empresaId', { empresaId })
      .groupBy('l.cuenta_contable_id')
      .getRawMany();
    const movMap = new Map<number, number>(
      movs.map((m) => [Number(m.cuenta_id), Number(m.total)]),
    );

    return cuentas.map((c) => ({
      ...c,
      movimientos: movMap.get(c.id) || 0,
      es_global: Number(c.empresa_id) === EMPRESA_GLOBAL,
    }));
  }

  async findOne(id: number, empresaId: number) {
    const cuenta = await this.repo.findOne({
      where: { id, empresa_id: this.visibles(empresaId) },
      relations: ['cuenta_padre', 'hijas'],
    });
    if (!cuenta) {
      throw new NotFoundException('Cuenta no encontrada');
    }
    return cuenta;
  }

  async update(
    id: number,
    empresaId: number,
    dto: UpdateAccountDto,
    esSuperadmin = false,
  ) {
    const cuenta = await this.findOne(id, empresaId);
    this.assertPuedeModificar(cuenta, esSuperadmin);

    // Trazabilidad: una cuenta con movimientos contables no puede cambiar
    // código, naturaleza ni clasificación — eso redefiniría el sentido de
    // los asientos históricos. Sí se permite nombre, estado, padre, etc.
    const camposEstructurales: Array<keyof UpdateAccountDto> = [
      'codigo',
      'naturaleza',
      'clasificacion',
    ];
    const cambiaEstructura = camposEstructurales.some(
      (campo) =>
        dto[campo] !== undefined &&
        String(dto[campo]) !== String(cuenta[campo]),
    );
    if (cambiaEstructura) {
      // Una cuenta global puede tener movimientos en CUALQUIER empresa.
      const movWhere: any = { cuenta_contable_id: id };
      if (Number(cuenta.empresa_id) !== EMPRESA_GLOBAL) {
        movWhere.empresa_id = empresaId;
      }
      const movimientos = await this.lineaRepo.count({ where: movWhere });
      if (movimientos > 0) {
        throw new BadRequestException(
          `La cuenta ${cuenta.codigo} ${cuenta.nombre} tiene ${movimientos} ` +
            `movimiento(s) contables: no se puede cambiar su código, ` +
            `naturaleza ni clasificación. Solo se permite editar el nombre ` +
            `o desactivarla.`,
        );
      }
    }

    if (dto.codigo && dto.codigo !== cuenta.codigo) {
      const exists = await this.repo.findOne(
        esSuperadmin
          ? { where: { codigo: dto.codigo } }
          : {
              where: {
                codigo: dto.codigo,
                empresa_id: this.visibles(empresaId),
              },
            },
      );
      if (exists) {
        throw new ConflictException(
          exists.empresa_id === EMPRESA_GLOBAL
            ? 'El código de cuenta ya existe en el Plan Único de Cuentas base'
            : 'El código de cuenta ya existe en esta empresa',
        );
      }
    }

    if (dto.cuenta_padre_id !== undefined) {
      if (dto.cuenta_padre_id === id) {
        throw new BadRequestException(
          'Una cuenta no puede ser padre de sí misma',
        );
      }
      await this.validarPadre(empresaId, dto.cuenta_padre_id);
    }

    Object.assign(cuenta, dto);
    return this.repo.save(cuenta);
  }

  async remove(id: number, empresaId: number, esSuperadmin = false) {
    const cuenta = await this.findOne(id, empresaId);
    this.assertPuedeModificar(cuenta, esSuperadmin);

    // Las subcuentas pueden pertenecer a cualquier empresa si la cuenta es
    // global (una empresa puede colgar cuentas especiales del PUC base).
    const hijas = await this.repo.count({
      where: { cuenta_padre_id: id },
    });
    if (hijas > 0) {
      throw new BadRequestException(
        'No se puede eliminar una cuenta con subcuentas',
      );
    }

    // Trazabilidad: una cuenta con movimientos (aunque estén anulados) no
    // se puede borrar; solo se puede desactivar (estado=0). Una cuenta
    // global puede tener movimientos en cualquier empresa.
    const movWhere: any = { cuenta_contable_id: id };
    if (Number(cuenta.empresa_id) !== EMPRESA_GLOBAL) {
      movWhere.empresa_id = empresaId;
    }
    const movimientos = await this.lineaRepo.count({ where: movWhere });
    if (movimientos > 0) {
      throw new BadRequestException(
        `La cuenta ${cuenta.codigo} ${cuenta.nombre} tiene ${movimientos} ` +
          `movimiento(s) contables y no se puede eliminar. Puede ` +
          `desactivarla (estado = Inactivo).`,
      );
    }

    await this.repo.remove(cuenta);
  }

  /**
   * Importación masiva del plan de cuentas desde Excel/CSV.
   *
   * Cada fila debe traer:
   *  - codigo (requerido)
   *  - nombre (requerido)
   *  - naturaleza ('D' o 'C', default 'D')
   *  - clasificacion (1=clase, 2=grupo, 3=cuenta, 4=auxiliar, default 4)
   *  - tipo (default 1)
   *  - estado (default 1)
   *
   * Si la cuenta ya existe (mismo codigo), se actualiza (upsert).
   * El campo cuenta_padre_id se resuelve automáticamente buscando
   * el código padre (prefijo del código actual con un dígito menos).
   *
   * Retorna: { creados, actualizados, errores, total }
   */
  async importar(
    filas: any[],
    empresaId: number,
    esSuperadmin = false,
  ): Promise<{ creados: number; actualizados: number; errores: any[]; total: number }> {
    const errores: any[] = [];
    let creados = 0;
    let actualizados = 0;

    // Pre-cargar cuentas existentes: propias + PUC base compartido.
    // Las globales (empresa_id=0) se usan para resolver padres y detectar
    // códigos ya existentes, pero una empresa normal NO las modifica.
    const codigos = filas
      .map((f) => (f.codigo ?? '').toString().trim())
      .filter((c) => c.length > 0);
    const existentes = codigos.length
      ? await this.repo.find({
          where: codigos.map((codigo) => ({
            codigo,
            empresa_id: esSuperadmin ? EMPRESA_GLOBAL : this.visibles(empresaId),
          })),
        })
      : [];
    const cuentaMap = new Map<string, Account>();
    for (const c of existentes) {
      cuentaMap.set(c.codigo, c);
    }

    // Ordenar por longitud de código para que los padres se creen primero
    const filasOrdenadas = [...filas].sort((a, b) => {
      const ca = (a.codigo ?? '').toString().trim();
      const cb = (b.codigo ?? '').toString().trim();
      return ca.length - cb.length || ca.localeCompare(cb);
    });

    for (let i = 0; i < filasOrdenadas.length; i++) {
      const fila = filasOrdenadas[i];
      const filaOriginal = filas.indexOf(fila) + 2; // +2 por header
      try {
        const codigo = (fila.codigo ?? '').toString().trim();
        const nombre = (fila.nombre ?? '').toString().trim();

        if (!codigo || !nombre) {
          errores.push({ fila: filaOriginal, error: 'Código y nombre son obligatorios' });
          continue;
        }

        // Resolver cuenta padre automáticamente (código sin último dígito)
        let padreId: number | null = null;
        if (codigo.length > 1) {
          const codigoPadre = codigo.slice(0, -1);
          const padre = cuentaMap.get(codigoPadre);
          if (padre) {
            padreId = padre.id;
          }
        }

        // Determinar clasificación por longitud de código
        let clasificacion = Number(fila.clasificacion);
        if (!clasificacion) {
          if (codigo.length === 1) clasificacion = 1; // clase
          else if (codigo.length === 2) clasificacion = 2; // grupo
          else if (codigo.length === 4) clasificacion = 3; // cuenta
          else clasificacion = 4; // auxiliar
        }

        // Determinar naturaleza por clase si no se especifica
        let naturaleza = (fila.naturaleza ?? '').toString().trim().toUpperCase();
        if (!naturaleza || (naturaleza !== 'D' && naturaleza !== 'C')) {
          // Clases 1-3 (Activo, Pasivo, Patrimonio): D, C, C
          // Clases 4-7 (Ingresos, Costos, Gastos, Otros): C, D, D, D
          const clase = codigo.charAt(0);
          naturaleza = ['4'].includes(clase) ? 'C' : 'D';
        }

        // Construir campos de jerarquía
        const clase = codigo.length >= 1 ? codigo.charAt(0) : null;
        const grupo = codigo.length >= 2 ? codigo.substring(0, 2) : null;
        const cuenta = codigo.length >= 4 ? codigo.substring(0, 4) : null;

        const dto: any = {
          codigo,
          nombre,
          naturaleza,
          clasificacion,
          tipo: Number(fila.tipo ?? 1),
          estado: Number(fila.estado ?? 1),
          clase,
          grupo,
          cuenta,
          cuenta_padre_id: padreId,
        };

        const existente = cuentaMap.get(codigo);
        if (
          existente &&
          Number(existente.empresa_id) === EMPRESA_GLOBAL &&
          !esSuperadmin
        ) {
          // Ya existe en el PUC base: se respeta, no se modifica ni
          // duplica una cuenta global con datos de una empresa.
          continue;
        }
        if (existente) {
          Object.assign(existente, dto);
          await this.repo.save(existente);
          actualizados++;
        } else {
          const cuentaNueva = this.repo.create({
            ...dto,
            empresa_id: esSuperadmin ? EMPRESA_GLOBAL : empresaId,
          }) as unknown as Account;
          const guardada = await this.repo.save(cuentaNueva);
          cuentaMap.set(codigo, guardada);
          creados++;
        }
      } catch (err: any) {
        errores.push({ fila: filaOriginal, error: err?.message || 'Error desconocido' });
      }
    }

    return { creados, actualizados, errores, total: filas.length };
  }
}
