import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConciliacionBancaria } from './entities/conciliacion-bancaria.entity';
import { ConciliacionMovimiento } from './entities/conciliacion-movimiento.entity';
import { CreateConciliacionDto } from './dto/create-conciliacion.dto';
import { UpdateConciliacionDto } from './dto/update-conciliacion.dto';
import { CreateMovimientoConciliacionDto } from './dto/create-movimiento.dto';
import { Banco } from '../bancos/entities/banco.entity';
import { Tesoreria } from '../tesoreria/entities/tesoreria.entity';
import { TesoreriaService } from '../tesoreria/tesoreria.service';

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Concepto contable de la partida de conciliación -> (origen, tipo_movimiento).
 * Las ND/NC del extracto son partidas que el banco ya registró pero que aún no
 * están en libros; al conciliar se llevan a la contabilidad vía tesorería.
 */
const CONCEPTOS: Record<string, { origen: string; tipo_movimiento?: number }> = {
  nota_debito: { origen: 'extracto', tipo_movimiento: 2 },
  nota_credito: { origen: 'extracto', tipo_movimiento: 1 },
  cheque_circulacion: { origen: 'libro', tipo_movimiento: 2 },
  consignacion_transito: { origen: 'libro', tipo_movimiento: 1 },
  error_libros: { origen: 'libro' },
  error_extracto: { origen: 'extracto' },
};

@Injectable()
export class ConciliacionesService {
  constructor(
    @InjectRepository(ConciliacionBancaria)
    private readonly repo: Repository<ConciliacionBancaria>,
    @InjectRepository(ConciliacionMovimiento)
    private readonly movRepo: Repository<ConciliacionMovimiento>,
    @InjectRepository(Banco)
    private readonly bancoRepo: Repository<Banco>,
    @InjectRepository(Tesoreria)
    private readonly tesoreriaRepo: Repository<Tesoreria>,
    private readonly tesoreriaService: TesoreriaService,
  ) {}

  async findAll(query: any, empresaId: number) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));

    const qb = this.repo
      .createQueryBuilder('c')
      .where('c.empresa_id = :empresaId', { empresaId })
      .orderBy('c.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.banco_id) {
      qb.andWhere('c.banco_id = :bancoId', { bancoId: query.banco_id });
    }
    if (query.periodo) {
      qb.andWhere('c.periodo = :periodo', { periodo: query.periodo });
    }
    if (query.estado !== undefined && query.estado !== '') {
      qb.andWhere('c.estado = :estado', { estado: query.estado });
    }

    const [data, total] = await qb.getManyAndCount();

    // Adjuntar nombre del banco
    const bancos = await this.bancoRepo.find({ where: { empresa_id: empresaId } });
    const bancoMap = new Map(bancos.map((b) => [b.id, b.nombre]));
    const enriched = data.map((c) => ({
      ...c,
      banco_nombre: bancoMap.get(c.banco_id) || 'N/A',
    }));

    return { data: enriched, total, page, limit };
  }

  async findOne(id: number, empresaId: number) {
    const item = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!item) {
      throw new NotFoundException('Conciliación no encontrada');
    }

    const banco = await this.bancoRepo.findOne({
      where: { id: item.banco_id, empresa_id: empresaId },
    });

    const movimientos = await this.movRepo.find({
      where: { conciliacion_id: id, empresa_id: empresaId },
      order: { fecha: 'ASC', id: 'ASC' },
    });

    return {
      ...item,
      banco_nombre: banco?.nombre || 'N/A',
      movimientos,
    };
  }

  async create(dto: CreateConciliacionDto, empresaId: number, usuario: string) {
    const banco = await this.bancoRepo.findOne({
      where: { id: dto.banco_id, empresa_id: empresaId },
    });
    if (!banco) {
      throw new NotFoundException('Banco/caja no encontrado');
    }

    // Validar que no exista ya una conciliación para ese banco+periodo
    // (las anuladas no bloquean: permiten rehacer la conciliación)
    const exists = await this.repo.findOne({
      where: {
        empresa_id: empresaId,
        banco_id: dto.banco_id,
        periodo: dto.periodo,
      },
    });
    if (exists && exists.estado !== 2) {
      throw new ConflictException(
        `Ya existe una conciliación para el banco "${banco.nombre}" en el periodo ${dto.periodo}`,
      );
    }

    // Calcular fechas de inicio y fin del periodo
    const [year, month] = dto.periodo.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) {
      throw new BadRequestException('Periodo inválido, use formato YYYY-MM');
    }
    const fechaInicio = `${dto.periodo}-01`;
    const fechaFin = this.lastDayOfMonth(year, month);

    // Saldo inicial según libros = saldo del banco al inicio del periodo
    // Aproximación: saldo actual del banco menos movimientos del periodo
    const movimientosPeriodo = await this.tesoreriaRepo
      .createQueryBuilder('t')
      .where('t.empresa_id = :empresaId', { empresaId })
      .andWhere('t.banco_id = :bancoId', { bancoId: dto.banco_id })
      .andWhere('t.estado = 1')
      .andWhere('t.fecha BETWEEN :inicio AND :fin', {
        inicio: fechaInicio,
        fin: fechaFin,
      })
      .getMany();

    let saldoInicialLibros = Number(banco.monto);
    for (const m of movimientosPeriodo) {
      if (m.tipo === 1) {
        saldoInicialLibros -= Number(m.valor);
      } else {
        saldoInicialLibros += Number(m.valor);
      }
    }
    saldoInicialLibros = round2(saldoInicialLibros);

    const item = this.repo.create({
      empresa_id: empresaId,
      banco_id: dto.banco_id,
      periodo: dto.periodo,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      saldo_inicial_libros: saldoInicialLibros,
      saldo_final_libros: saldoInicialLibros, // sin movimientos de conciliación todavía
      saldo_extracto: round2(dto.saldo_extracto),
      diferencia: round2(saldoInicialLibros - dto.saldo_extracto),
      estado: 0,
      notas: dto.notas || null,
      usuario,
    });

    return this.repo.save(item);
  }

  async update(id: number, empresaId: number, dto: UpdateConciliacionDto) {
    const item = await this.findOne(id, empresaId);
    if (item.estado === 1) {
      throw new BadRequestException(
        'No se puede editar una conciliación ya conciliada',
      );
    }
    if (item.estado === 2) {
      throw new BadRequestException(
        'No se puede editar una conciliación anulada',
      );
    }

    if (dto.saldo_extracto !== undefined) {
      item.saldo_extracto = round2(dto.saldo_extracto);
    }
    if (dto.notas !== undefined) {
      item.notas = dto.notas;
    }

    // Recalcular diferencia
    await this.recalcular(item);
    return this.repo.save(item);
  }

  async remove(id: number, empresaId: number, usuario: string) {
    const item = await this.findOne(id, empresaId);
    if (item.estado === 1) {
      throw new BadRequestException(
        'No se puede eliminar una conciliación conciliada. Anúlela primero.',
      );
    }

    // Si quedan movimientos de tesorería generados vivos (ej. conciliaciones
    // anuladas antes de la reversa automática), revertirlos antes de borrar.
    for (const m of item.movimientos) {
      if (m.tesoreria_id == null) continue;
      const tes = await this.tesoreriaRepo.findOne({
        where: { id: m.tesoreria_id, empresa_id: empresaId },
      });
      const esGenerado =
        tes != null &&
        (tes.codigo === `NC-C${item.id}-${m.id}` ||
          tes.codigo === `ND-C${item.id}-${m.id}`);
      if (esGenerado) {
        await this.tesoreriaService.remove(
          m.tesoreria_id,
          empresaId,
          usuario,
          true,
        );
      }
    }

    await this.movRepo.delete({ conciliacion_id: id, empresa_id: empresaId });
    await this.repo.remove(item);
  }

  // ============ Movimientos de conciliación ============

  async addMovimiento(
    conciliacionId: number,
    dto: CreateMovimientoConciliacionDto,
    empresaId: number,
  ) {
    const conciliacion = await this.findOne(conciliacionId, empresaId);
    if (conciliacion.estado === 1) {
      throw new BadRequestException(
        'La conciliación ya está conciliada, no se pueden agregar movimientos',
      );
    }
    if (conciliacion.estado === 2) {
      throw new BadRequestException(
        'La conciliación está anulada, no se pueden agregar movimientos',
      );
    }

    // Derivar origen/tipo desde el concepto contable cuando viene informado
    let origen = dto.origen;
    let tipoMovimiento = dto.tipo_movimiento;
    if (dto.concepto) {
      const map = CONCEPTOS[dto.concepto];
      if (!map) {
        throw new BadRequestException(`Concepto inválido: ${dto.concepto}`);
      }
      origen = map.origen;
      if (map.tipo_movimiento) {
        tipoMovimiento = map.tipo_movimiento;
      }
    }

    if (origen !== 'libro' && origen !== 'extracto') {
      throw new BadRequestException("El origen debe ser 'libro' o 'extracto'");
    }
    if (tipoMovimiento !== 1 && tipoMovimiento !== 2) {
      throw new BadRequestException('tipo_movimiento debe ser 1 (ingreso) o 2 (egreso)');
    }
    if (dto.valor <= 0) {
      throw new BadRequestException('El valor debe ser mayor a cero');
    }

    // Las notas débito/crédito se llevan a la contabilidad al conciliar:
    // necesitan la cuenta PUC de contrapartida (gasto o ingreso).
    if (origen === 'extracto' && !dto.cuenta_contable_id) {
      throw new BadRequestException(
        'Las notas débito/crédito requieren la cuenta contable de contrapartida (PUC)',
      );
    }

    const mov = this.movRepo.create({
      empresa_id: empresaId,
      conciliacion_id: conciliacionId,
      origen,
      tipo_movimiento: tipoMovimiento,
      fecha: dto.fecha,
      descripcion: dto.descripcion,
      valor: round2(dto.valor),
      tesoreria_id: dto.tesoreria_id || null,
      forma: dto.forma || null,
      concepto: dto.concepto || null,
      cuenta_contable_id: dto.cuenta_contable_id || null,
    });

    const saved = await this.movRepo.save(mov);
    await this.recalcular(conciliacion);
    await this.repo.save(conciliacion);
    return saved;
  }

  async removeMovimiento(movId: number, empresaId: number) {
    const mov = await this.movRepo.findOne({
      where: { id: movId, empresa_id: empresaId },
    });
    if (!mov) {
      throw new NotFoundException('Movimiento de conciliación no encontrado');
    }

    const conciliacion = await this.repo.findOne({
      where: { id: mov.conciliacion_id, empresa_id: empresaId },
    });
    if (conciliacion?.estado === 1) {
      throw new BadRequestException(
        'La conciliación ya está conciliada, no se pueden eliminar movimientos',
      );
    }
    if (conciliacion?.estado === 2) {
      throw new BadRequestException(
        'La conciliación está anulada, no se pueden eliminar movimientos',
      );
    }

    await this.movRepo.remove(mov);
    if (conciliacion) {
      await this.recalcular(conciliacion);
      await this.repo.save(conciliacion);
    }
  }

  // ============ Conciliar / Anular ============

  async conciliar(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    if (item.estado === 1) {
      throw new BadRequestException('La conciliación ya está conciliada');
    }
    if (item.estado === 2) {
      throw new BadRequestException('La conciliación está anulada');
    }

    await this.recalcular(item);

    if (Math.abs(Number(item.diferencia)) > 0.01) {
      throw new BadRequestException(
        `No se puede conciliar: hay una diferencia de ${item.diferencia}. Ajuste los movimientos o el saldo del extracto.`,
      );
    }

    // Contabilizar las notas débito/crédito del extracto: son partidas que el
    // banco ya registró pero que aún no existen en libros. Cada una genera su
    // movimiento de tesorería con asiento contable (Dr/Cr contra el banco).
    const notas = item.movimientos.filter(
      (m) => m.origen === 'extracto' && !m.tesoreria_id,
    );
    for (const m of notas) {
      if (!m.cuenta_contable_id) {
        throw new BadRequestException(
          `La partida "${m.descripcion}" (extracto) no tiene cuenta de contrapartida PUC`,
        );
      }
    }
    for (const m of notas) {
      const esCredito = m.tipo_movimiento === 1;
      const tes = await this.tesoreriaService.create(
        {
          fecha: m.fecha,
          codigo: `${esCredito ? 'NC' : 'ND'}-C${item.id}-${m.id}`,
          nombre_tercero: m.descripcion,
          valor: Number(m.valor),
          cuenta_contable_id: String(m.cuenta_contable_id),
          tercero: '',
          tipo: m.tipo_movimiento,
          banco_id: item.banco_id,
          cuenta_contrapartida_id: m.cuenta_contable_id,
          forma: m.forma ?? undefined,
        },
        empresaId,
        item.usuario || 'sistema',
      );
      m.tesoreria_id = tes.id;
      await this.movRepo.save(m);
    }

    item.estado = 1;
    return this.repo.save(item);
  }

  /**
   * Anula una conciliación y deshace lo que contabilizó al conciliar:
   * los movimientos de tesorería generados a partir de las notas
   * débito/crédito del extracto se eliminan (lo que reversa su asiento y
   * restaura el saldo del banco). Las partidas de origen 'libro' que
   * referencian movimientos preexistentes solo se desvinculan.
   * Si alguna fecha generada cae en período cerrado, la anulación se bloquea.
   */
  async anular(id: number, empresaId: number, usuario: string) {
    const item = await this.findOne(id, empresaId);
    if (item.estado === 2) {
      throw new BadRequestException('La conciliación ya está anulada');
    }
    if (item.estado === 0) {
      throw new BadRequestException(
        'Solo se pueden anular conciliaciones ya conciliadas. Use eliminar para una conciliación en borrador.',
      );
    }

    for (const m of item.movimientos) {
      if (m.tesoreria_id == null) continue;

      const tes = await this.tesoreriaRepo.findOne({
        where: { id: m.tesoreria_id, empresa_id: empresaId },
      });

      // Solo se eliminan los movimientos que esta conciliación creó al
      // conciliar (códigos NC-C{id}-{mov}/ND-C{id}-{mov}). Los vínculos a
      // movimientos preexistentes (origen 'libro') solo se deshacen.
      const esGenerado =
        tes != null &&
        (tes.codigo === `NC-C${item.id}-${m.id}` ||
          tes.codigo === `ND-C${item.id}-${m.id}`);

      if (esGenerado) {
        // remove() ya reversa el asiento y restaura el saldo del banco;
        // además bloquea si la fecha cae en un período cerrado.
        // El 4to parámetro omite el bloqueo "vinculado a conciliación
        // activa" porque la reversa la está haciendo la propia conciliación.
        await this.tesoreriaService.remove(
          m.tesoreria_id,
          empresaId,
          usuario,
          true,
        );
      }
      m.tesoreria_id = null;
      await this.movRepo.save(m);
    }

    item.estado = 2;
    return this.repo.save(item);
  }

  // ============ Resumen / Cálculos ============

  async getResumen(id: number, empresaId: number) {
    const item = await this.findOne(id, empresaId);
    return this.calcularResumen(item);
  }

  // ============ Helpers ============

  /**
   * Calcula el resumen a partir de una entidad ya cargada en memoria (no
   * vuelve a consultar la conciliación en la base de datos). Esto es
   * importante para `recalcular()`, que se invoca ANTES de guardar cambios
   * pendientes (ej. un nuevo saldo_extracto) — si volviéramos a leer desde
   * la BD obtendríamos el valor viejo y la diferencia quedaría desactualizada.
   */
  private async calcularResumen(item: ConciliacionBancaria) {
    const movs = await this.movRepo.find({
      where: { conciliacion_id: item.id, empresa_id: item.empresa_id },
    });

    let chequesNoCobrados = 0; // libro, egreso (resta del extracto)
    let consignacionesPendientes = 0; // libro, ingreso (suma al extracto)
    let creditosBancarios = 0; // extracto, ingreso (no en libros)
    let debitosBancarios = 0; // extracto, egreso (no en libros)

    for (const m of movs) {
      if (m.origen === 'libro') {
        if (m.tipo_movimiento === 2) {
          chequesNoCobrados += Number(m.valor);
        } else {
          consignacionesPendientes += Number(m.valor);
        }
      } else {
        if (m.tipo_movimiento === 1) {
          creditosBancarios += Number(m.valor);
        } else {
          debitosBancarios += Number(m.valor);
        }
      }
    }

    const saldoInicialLibros = Number(item.saldo_inicial_libros);
    // Saldo final libros = inicial + créditos bancarios - débitos bancarios
    const saldoFinalLibros = round2(
      saldoInicialLibros + creditosBancarios - debitosBancarios,
    );
    // Saldo ajustado del extracto = extracto + consignaciones pendientes - cheques no cobrados
    const saldoExtractoAjustado = round2(
      Number(item.saldo_extracto) +
        consignacionesPendientes -
        chequesNoCobrados,
    );
    const diferencia = round2(saldoFinalLibros - saldoExtractoAjustado);

    return {
      saldo_inicial_libros: saldoInicialLibros,
      saldo_final_libros: saldoFinalLibros,
      saldo_extracto: Number(item.saldo_extracto),
      saldo_extracto_ajustado: saldoExtractoAjustado,
      cheques_no_cobrados: round2(chequesNoCobrados),
      consignaciones_pendientes: round2(consignacionesPendientes),
      creditos_bancarios: round2(creditosBancarios),
      debitos_bancarios: round2(debitosBancarios),
      diferencia,
      conciliado: Math.abs(diferencia) <= 0.01,
    };
  }

  private async recalcular(item: ConciliacionBancaria) {
    const resumen = await this.calcularResumen(item);
    item.saldo_final_libros = resumen.saldo_final_libros;
    item.diferencia = resumen.diferencia;
  }

  private lastDayOfMonth(year: number, month: number): string {
    const d = new Date(year, month, 0); // día 0 del mes siguiente = último día del mes actual
    const day = d.getDate().toString().padStart(2, '0');
    return `${year}-${month.toString().padStart(2, '0')}-${day}`;
  }
}
