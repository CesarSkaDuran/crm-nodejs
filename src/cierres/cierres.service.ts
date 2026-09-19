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
import { Product } from '../products/entities/product.entity';
import {
  AccountingEntry,
  AccountingEntryLine,
} from '../accounting/entities/accounting-entry.entity';
import { Company } from '../companies/entities/company.entity';
import { Account } from '../accounts/entities/account.entity';
import { Auditoria, TipoOperacion } from '../auditoria/entities/auditoria.entity';
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
    @InjectRepository(Product)
    private readonly productoRepo: Repository<Product>,
    @InjectRepository(Account)
    private readonly cuentaRepo: Repository<Account>,
    @InjectRepository(Auditoria)
    private readonly auditoriaRepo: Repository<Auditoria>,
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

  /**
   * Diferencia real de kardex: para cada producto compara la cantidad del
   * ÚLTIMO movimiento de kardex contra el stock del producto. Una suma de
   * todos los saldo_actual no tiene sentido (es un saldo acumulado por
   * producto, no una diferencia).
   */
  private async validarKardex(
    kardexRepo: Repository<Kardex>,
    productoRepo: Repository<Product>,
    empresaId: number,
  ) {
    const [movimientos, kardexData] = await Promise.all([
      kardexRepo.count({ where: { empresa_id: empresaId } }),
      kardexRepo.find({
        where: { empresa_id: empresaId },
        order: { id: 'DESC' },
      }),
    ]);

    if (movimientos === 0) {
      throw new BadRequestException(
        'No hay movimientos de kardex para validar',
      );
    }

    // Último movimiento por producto (la consulta viene ordenada DESC)
    const ultimoPorProducto = new Map<number, Kardex>();
    for (const k of kardexData) {
      if (!ultimoPorProducto.has(k.producto_id)) {
        ultimoPorProducto.set(k.producto_id, k);
      }
    }

    let diferencia = 0;
    for (const [productoId, kardex] of ultimoPorProducto) {
      const producto = await productoRepo.findOne({
        where: { id: productoId, empresa_id: empresaId },
      });
      if (!producto) continue;
      diferencia += Number(kardex.cantidad_actual || 0) - Number(producto.stock || 0);
    }

    return {
      valido: Math.abs(diferencia) < 0.01,
      diferencia: round2(diferencia),
      movimientos,
    };
  }

  /**
   * Devuelve el cierre CERRADO del período si existe. La columna estado es
   * ENUM('0','1','2'): un WHERE con el número 1 compara por índice del enum
   * en MySQL, así que se compara en JS.
   */
  private async cierreCerradoDelPeriodo(
    cierreRepo: Repository<Cierre>,
    empresaId: number,
    periodo: string,
  ) {
    const cierres = await cierreRepo.find({
      where: { empresa_id: empresaId, periodo },
    });
    return (
      cierres.find((c) => Number(c.estado) === EstadoCierre.CERRADO) || null
    );
  }

  async validarCierre(empresaId: number, periodo: string) {
    // Verificar que no exista un cierre ya realizado para este período
    const cierreExistente = await this.cierreCerradoDelPeriodo(
      this.cierreRepo,
      empresaId,
      periodo,
    );

    if (cierreExistente) {
      throw new ConflictException(
        `Ya existe un cierre cerrado para el período ${periodo}`,
      );
    }

    return this.validarKardex(this.kardexRepo, this.productoRepo, empresaId);
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
      const cierreExistente = await this.cierreCerradoDelPeriodo(
        cierreRepo,
        empresaId,
        dto.periodo,
      );

      if (cierreExistente) {
        throw new ConflictException(
          `Ya existe un cierre cerrado para el período ${dto.periodo}`,
        );
      }

      // 2. Validar kardex
      const kardexVal = await this.validarKardex(
        kardexRepo,
        manager.getRepository(Product),
        empresaId,
      );

      if (!kardexVal.valido) {
        throw new BadRequestException(
          `El kardex tiene una diferencia de ${kardexVal.diferencia}. ` +
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

      // Saldo final de kardex = valor del inventario (último saldo por producto)
      const ultimoKardex = await kardexRepo.find({
        where: { empresa_id: empresaId },
        order: { id: 'DESC' },
      });
      const ultimos = new Map<number, number>();
      for (const k of ultimoKardex) {
        if (!ultimos.has(k.producto_id)) {
          ultimos.set(k.producto_id, Number(k.saldo_actual || 0));
        }
      }
      const saldoFinalKardex = round2(
        Array.from(ultimos.values()).reduce((s, v) => s + v, 0),
      );

      // 4. Crear registro de cierre
      const cierre = cierreRepo.create({
        empresa_id: empresaId,
        periodo: dto.periodo,
        fecha_inicio: dto.fecha_inicio,
        fecha_fin: dto.fecha_fin,
        fecha_cierre:
          dto.fecha_cierre || new Date().toISOString().split('T')[0],
        estado: EstadoCierre.CERRADO,
        saldo_inicial_kardex: 0,
        saldo_final_kardex: saldoFinalKardex,
        diferencia_kardex: kardexVal.diferencia,
        total_movimientos: totalMovimientos + totalCompras,
        total_asientos: totalAsientos,
        descripcion: dto.descripcion,
        usuario,
        estado_registro: 1,
      });

      const cierreGuardado = await cierreRepo.save(cierre);

      // El asiento de cierre contable se genera aparte con
      // generarAsientoCierre() — permite revisar el período antes de liquidarlo.

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
    const kardexVal = await this.validarKardex(
      this.kardexRepo,
      this.productoRepo,
      empresaId,
    );

    if (!kardexVal.valido) {
      throw new BadRequestException(
        `El kardex tiene una diferencia de ${kardexVal.diferencia}. ` +
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

  /**
   * Anular un cierre reabre el período en la práctica (ya no hay cierre
   * CERRADO que lo bloquee), así que exige el mismo control que reabrir:
   * solo ADMIN, motivo obligatorio y registro en auditoría.
   */
  async anular(
    id: number,
    empresaId: number,
    usuario: string,
    motivo: string,
  ) {
    const cierre = await this.findOne(id, empresaId);

    if (cierre.estado !== EstadoCierre.CERRADO) {
      throw new BadRequestException(
        'Solo se pueden anular cierres en estado CERRADO',
      );
    }
    if (!motivo || !motivo.trim()) {
      throw new BadRequestException(
        'Debe indicar el motivo de la anulación (queda registrado en auditoría)',
      );
    }

    const anterior = { estado: cierre.estado };
    cierre.estado = EstadoCierre.ANULADO;
    cierre.usuario = usuario;
    await this.cierreRepo.save(cierre);

    await this.auditoriaRepo.save(
      this.auditoriaRepo.create({
        empresa_id: empresaId,
        tabla: 'cierres',
        registro_id: cierre.id,
        operacion: TipoOperacion.ACTUALIZAR,
        usuario,
        valores_anteriores: JSON.stringify(anterior),
        valores_nuevos: JSON.stringify({ estado: EstadoCierre.ANULADO }),
        descripcion: `ANULACIÓN del cierre del período ${cierre.periodo}. Motivo: ${motivo}`,
        estado: 1,
      }),
    );

    return {
      ok: true,
      cierre,
      mensaje: `Cierre del período ${cierre.periodo} anulado. Anulación registrada en auditoría.`,
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
    const cierre = await this.cierreCerradoDelPeriodo(
      this.cierreRepo,
      empresaId,
      periodo,
    );

    return !!cierre;
  }

  /**
   * Genera el asiento de cierre del período: pone en cero todas las cuentas
   * de resultado (clases 4 ingresos, 5 gastos, 6 costos) y traslada el
   * resultado neto a la cuenta de patrimonio 36 (3605 utilidad / 3610 pérdida).
   * El asiento queda fechado en fecha_fin del período.
   */
  async generarAsientoCierre(id: number, empresaId: number, usuario: string) {
    const cierre = await this.findOne(id, empresaId);

    if (cierre.estado === EstadoCierre.ANULADO) {
      throw new BadRequestException(
        'No se puede generar asiento de cierre en un cierre anulado',
      );
    }
    if (cierre.asentado_cierre_id) {
      throw new BadRequestException(
        `El período ${cierre.periodo} ya tiene asiento de cierre (#${cierre.asentado_cierre_id})`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const lineaRepo = manager.getRepository(AccountingEntryLine);
      const asentadoRepo = manager.getRepository(AccountingEntry);
      const cuentaRepo = manager.getRepository(Account);
      const cierreRepo = manager.getRepository(Cierre);
      const empresaRepo = manager.getRepository(Company);

      const empresa = await empresaRepo.findOneBy({ id: empresaId });
      const asentado_consecutivo = Number(empresa?.consecutivo_asientos || 0) + 1;
      const consecutivo = 'CI' + String(asentado_consecutivo).padStart(6, '0');
      const fecha = cierre.fecha_fin;

      // Movimientos netos por cuenta auxiliar de resultado (4/5/6) en el período
      const lineas = await lineaRepo.find({
        where: {
          empresa_id: empresaId,
          fecha: Between(cierre.fecha_inicio, cierre.fecha_fin),
          estado: 1,
        },
        relations: ['cuenta_contable'],
      });

      const netos = new Map<number, { cuenta: Account; neto: number }>();
      for (const l of lineas) {
        const cuenta = l.cuenta_contable;
        if (!cuenta || Number(cuenta.clasificacion) !== 4) continue;
        const clase = (cuenta.codigo || '')[0];
        if (!['4', '5', '6'].includes(clase)) continue;

        const e = netos.get(cuenta.id) || { cuenta, neto: 0 };
        e.neto = round2(e.neto + Number(l.debito || 0) - Number(l.credito || 0));
        netos.set(cuenta.id, e);
      }

      const lineasAsiento: Partial<AccountingEntryLine>[] = [];
      let gastosCostos = 0; // saldos débito netos (clases 5 y 6, y 4 débito)
      let ingresos = 0; // saldos crédito netos (clase 4)

      for (const { cuenta, neto } of netos.values()) {
        if (Math.abs(neto) < 0.01) continue;
        const clase = (cuenta.codigo || '')[0];
        const esDebito = neto > 0;
        if (esDebito) gastosCostos = round2(gastosCostos + neto);
        else ingresos = round2(ingresos - neto);

        lineasAsiento.push({
          empresa_id: empresaId,
          cuenta_contable_id: cuenta.id,
          tercero_id: null,
          descripcion: `Cierre de cuenta ${clase === '4' ? 'ingresos' : clase === '5' ? 'gastos' : 'costos'} ${cuenta.codigo} - ${cuenta.nombre}`,
          valor: Math.abs(neto),
          debito: esDebito ? 0 : round2(-neto),
          credito: esDebito ? neto : 0,
          naturaleza: esDebito ? 'C' : 'D',
          consecutivo,
          fecha,
          usuario,
          estado: 1,
        });
      }

      if (lineasAsiento.length === 0) {
        throw new BadRequestException(
          'No hay movimientos en cuentas de resultado (4/5/6) para el período',
        );
      }

      // Resultado del ejercicio: ingresos - gastos/costos
      const resultado = round2(ingresos - gastosCostos);
      const esUtilidad = resultado >= 0;

      // Cuenta de patrimonio: 3605 utilidad / 3610 pérdida (PUC colombiano).
      // Puede ser auxiliar (clasificacion 4) o el nivel más profundo que
      // exista en el PUC de la empresa (algunos PUC la dejan en nivel 3).
      const cuentas = await cuentaRepo.find({
        where: { empresa_id: empresaId, estado: 1 },
      });
      const maxClasif = Math.max(
        ...cuentas.map((c) => Number(c.clasificacion) || 0),
      );
      const codigoObjetivo = esUtilidad ? '3.6.05' : '3.6.10';
      const nombreObjetivo = esUtilidad ? 'utilidad' : 'pérdida';
      const deNivel = (nivel: number) =>
        cuentas.filter((c) => Number(c.clasificacion) === nivel);
      const buscar = (lista: Account[]) =>
        lista.find((c) => c.codigo === codigoObjetivo) ||
        lista.find((c) => (c.codigo || '').startsWith(codigoObjetivo + '.')) ||
        lista.find(
          (c) =>
            (c.codigo || '').startsWith('3.6') &&
            (c.nombre || '').toLowerCase().includes(nombreObjetivo),
        ) ||
        lista.find((c) => (c.codigo || '').startsWith('3.6')) ||
        null;

      let cuentaResultado: Account | null = null;
      for (let nivel = maxClasif; nivel >= 3 && !cuentaResultado; nivel--) {
        cuentaResultado = buscar(deNivel(nivel));
      }

      if (!cuentaResultado) {
        throw new BadRequestException(
          `No se encontró cuenta de resultados del ejercicio (3.6.05 utilidad / 3.6.10 pérdida) en el Plan Único de Cuentas`,
        );
      }

      lineasAsiento.push({
        empresa_id: empresaId,
        cuenta_contable_id: cuentaResultado.id,
        tercero_id: null,
        descripcion: esUtilidad
          ? `Utilidad del ejercicio - período ${cierre.periodo}`
          : `Pérdida del ejercicio - período ${cierre.periodo}`,
        valor: Math.abs(resultado),
        debito: esUtilidad ? 0 : Math.abs(resultado),
        credito: esUtilidad ? resultado : 0,
        naturaleza: esUtilidad ? 'C' : 'D',
        consecutivo,
        fecha,
        usuario,
        estado: 1,
      });

      const balance = assertBalanced(
        lineasAsiento.map((l) => ({ debito: l.debito, credito: l.credito })),
      );

      const asentado = asentadoRepo.create({
        empresa_id: empresaId,
        consecutivo,
        tipo: 3,
        fecha,
        descripcion: `Asiento de cierre del período ${cierre.periodo}`,
        total_debito: balance.debito,
        total_credito: balance.credito,
        usuario,
        estado: 1,
      });
      const asentadoGuardado = await asentadoRepo.save(asentado);

      for (const l of lineasAsiento) l.asentado_id = asentadoGuardado.id;
      await lineaRepo.save(lineasAsiento.map((l) => lineaRepo.create(l)));

      cierre.asentado_cierre_id = asentadoGuardado.id;
      await cierreRepo.save(cierre);

      if (empresa) {
        empresa.consecutivo_asientos = asentado_consecutivo;
        await empresaRepo.save(empresa);
      }

      return {
        ok: true,
        asentado_id: asentadoGuardado.id,
        consecutivo,
        resultado,
        es_utilidad: esUtilidad,
        cuenta_resultado: `${cuentaResultado.codigo} - ${cuentaResultado.nombre}`,
        cuentas_cerradas: lineasAsiento.length - 1,
        mensaje: `Asiento de cierre ${consecutivo} generado: ${esUtilidad ? 'utilidad' : 'pérdida'} de ${Math.abs(resultado).toLocaleString('es-CO')}`,
      };
    });
  }

  /**
   * Reabre un período cerrado. Solo el administrador (rol) puede hacerlo y
   * siempre queda registro en auditoría con el motivo.
   */
  async reabrir(
    id: number,
    empresaId: number,
    usuario: string,
    motivo: string,
  ) {
    const cierre = await this.findOne(id, empresaId);

    if (cierre.estado !== EstadoCierre.CERRADO) {
      throw new BadRequestException(
        'Solo se pueden reabrir cierres en estado CERRADO',
      );
    }
    if (!motivo || !motivo.trim()) {
      throw new BadRequestException(
        'Debe indicar el motivo de la reapertura (queda registrado en auditoría)',
      );
    }

    const anterior = { estado: cierre.estado };
    cierre.estado = EstadoCierre.ABIERTO;
    cierre.usuario = usuario;
    await this.cierreRepo.save(cierre);

    await this.auditoriaRepo.save(
      this.auditoriaRepo.create({
        empresa_id: empresaId,
        tabla: 'cierres',
        registro_id: cierre.id,
        operacion: TipoOperacion.ACTUALIZAR,
        usuario,
        valores_anteriores: JSON.stringify(anterior),
        valores_nuevos: JSON.stringify({ estado: EstadoCierre.ABIERTO }),
        descripcion: `REAPERTURA del período ${cierre.periodo}. Motivo: ${motivo}`,
        estado: 1,
      }),
    );

    return {
      ok: true,
      cierre,
      mensaje: `Período ${cierre.periodo} reabierto. Reapertura registrada en auditoría.`,
    };
  }
}
