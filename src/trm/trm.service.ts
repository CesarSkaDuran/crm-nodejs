import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Moneda } from '../monedas/entities/moneda.entity';
import { HistorialTasa } from './entities/historial-tasa.entity';

const URL_TRM =
  'https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC';
const URL_FALLBACK = 'https://open.er-api.com/v6/latest/USD';

@Injectable()
export class TrmService {
  private readonly logger = new Logger(TrmService.name);

  constructor(
    @InjectRepository(Moneda)
    private readonly monedaRepo: Repository<Moneda>,
    @InjectRepository(HistorialTasa)
    private readonly historialRepo: Repository<HistorialTasa>,
  ) {}

  /** Consulta la TRM oficial (datos.gov.co) o el fallback. */
  private async consultarTrm(): Promise<{
    tasa: number;
    vigencia: string;
    fuente: string;
  }> {
    try {
      const res = await fetch(URL_TRM, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const tasa = Number(data?.[0]?.valor);
      if (!tasa || tasa <= 0) throw new Error('TRM sin valor válido');
      return {
        tasa,
        vigencia: String(data[0].vigenciadesde).slice(0, 10),
        fuente: 'trm_oficial',
      };
    } catch (e) {
      this.logger.warn(`TRM oficial falló (${e.message}), usando fallback`);
    }

    const res = await fetch(URL_FALLBACK, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Fallback HTTP ${res.status}`);
    const data = await res.json();
    const tasa = Number(data?.rates?.COP);
    if (!tasa || tasa <= 0) throw new Error('Fallback sin valor COP');
    return {
      tasa,
      vigencia: new Date().toISOString().slice(0, 10),
      fuente: 'fallback',
    };
  }

  /**
   * Sincroniza la tasa de USD para todas las empresas que la tengan
   * registrada. Nunca sobrescribe la última tasa válida si la consulta falla.
   */
  async sincronizar(): Promise<{
    ok: boolean;
    tasa?: number;
    fuente?: string;
    vigencia?: string;
    error?: string;
  }> {
    let trm;
    try {
      trm = await this.consultarTrm();
    } catch (e) {
      this.logger.error(`Sincronización TRM fallida: ${e.message}`);
      return { ok: false, error: e.message };
    }

    const monedas = await this.monedaRepo.find({
      where: { codigo: 'USD', estado: 1 },
    });

    for (const m of monedas) {
      m.tasa = trm.tasa;
      await this.monedaRepo.save(m);
      await this.historialRepo.save(
        this.historialRepo.create({
          empresa_id: m.empresa_id,
          moneda_id: m.id,
          codigo_moneda: 'USD',
          tasa: trm.tasa,
          fecha_vigencia: trm.vigencia,
          fuente: trm.fuente,
        }),
      );
    }

    this.logger.log(
      `TRM sincronizada: ${trm.tasa} (${trm.fuente}, vigencia ${trm.vigencia}) para ${monedas.length} empresa(s)`,
    );
    return { ok: true, tasa: trm.tasa, fuente: trm.fuente, vigencia: trm.vigencia };
  }

  /** Cron: días hábiles 8:00 AM. */
  @Cron('0 8 * * 1-5')
  async sincronizarDiario() {
    await this.sincronizar();
  }

  /**
   * TRM vigente para la empresa: la de la moneda USD y el último registro
   * del historial. `desactualizada` = más de 5 días desde la vigencia.
   */
  async trmActual(empresaId: number) {
    const moneda = await this.monedaRepo.findOne({
      where: { empresa_id: empresaId, codigo: 'USD', estado: 1 },
    });
    const ultimo = await this.historialRepo.findOne({
      where: { empresa_id: empresaId, codigo_moneda: 'USD' },
      order: { fecha_vigencia: 'DESC', id: 'DESC' },
    });

    const vigencia = ultimo?.fecha_vigencia || null;
    const diasAntiguedad = vigencia
      ? Math.floor(
          (Date.now() - new Date(vigencia).getTime()) / 86400000,
        )
      : null;

    return {
      disponible: !!moneda,
      moneda_id: moneda?.id ?? null,
      tasa: Number(moneda?.tasa ?? 0),
      vigencia,
      fuente: ultimo?.fuente ?? null,
      desactualizada: diasAntiguedad === null || diasAntiguedad > 5,
      dias_antiguedad: diasAntiguedad,
    };
  }

  /** Historial de tasas registradas. */
  async historial(empresaId: number, limit = 60) {
    return this.historialRepo.find({
      where: { empresa_id: empresaId },
      order: { fecha_vigencia: 'DESC', id: 'DESC' },
      take: Math.min(limit, 500),
    });
  }

  /**
   * TRM aplicable a una fecha dada: el último registro cuya vigencia sea
   * <= fecha. Si no hay historial, usa la tasa actual de la moneda.
   */
  async tasaParaFecha(empresaId: number, fecha: string): Promise<number> {
    const reg = await this.historialRepo.findOne({
      where: {
        empresa_id: empresaId,
        codigo_moneda: 'USD',
        fecha_vigencia: LessThanOrEqual(fecha),
      },
      order: { fecha_vigencia: 'DESC', id: 'DESC' },
    });
    if (reg) return Number(reg.tasa);

    const moneda = await this.monedaRepo.findOne({
      where: { empresa_id: empresaId, codigo: 'USD', estado: 1 },
    });
    return Number(moneda?.tasa ?? 0);
  }
}
