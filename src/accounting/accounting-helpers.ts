import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';
import { Cierre, EstadoCierre } from '../cierres/entities/cierre.entity';
import { Moneda } from '../monedas/entities/moneda.entity';

/**
 * Bloqueo real de período: rechaza cualquier asiento cuya fecha caiga en un
 * período (YYYY-MM) con cierre CERRADO. Aplica a todos los roles — el único
 * camino es la reapertura del período por el administrador.
 */
export async function assertPeriodoAbierto(
  cierreRepo: Repository<Cierre>,
  empresaId: number,
  fecha: string | Date,
) {
  const periodo = String(fecha).slice(0, 7); // 'YYYY-MM'
  // OJO: la columna estado es ENUM('0','1','2'). Comparar con el número 1 en
  // el WHERE hace que MySQL use el ÍNDICE del enum ('0'=abierto) en vez del
  // valor. Por eso se filtra por período y se compara en JS.
  const cierres = await cierreRepo.find({
    where: { empresa_id: empresaId, periodo },
  });
  const cierre = cierres.find(
    (c) => Number(c.estado) === EstadoCierre.CERRADO,
  );
  if (cierre) {
    throw new BadRequestException(
      `El período contable ${periodo} está CERRADO. No se pueden crear ni ` +
      `modificar asientos con fecha dentro de ese período. Solicite al ` +
      `administrador la reapertura del período.`,
    );
  }
}

export async function findAccountByKeywords(
  accountRepo: Repository<Account>,
  empresaId: number,
  keywords: string[],
): Promise<Account | null> {
  const cuentas = await accountRepo.find({
    where: { empresa_id: empresaId, estado: 1 },
  });

  // Filtramos keywords vacíos y evitamos matches accidentales por código
  // cuando el keyword es demasiado corto (ej. "1"), lo que podría colapsar
  // en cuentas raíz del PUC (ACTIVO, PASIVO, etc.) en vez de cuentas hoja.
  const lower = (keywords || [])
    .map((k) => (k ?? '').toString().toLowerCase().trim())
    .filter((k) => k.length > 0);

  const coincide = (c: Account) =>
    lower.some(
      (k) =>
        (c.nombre || '').toLowerCase().includes(k) ||
        (k.length >= 2 && (c.codigo || '').toLowerCase().startsWith(k)),
    );
  const coincidePorCodigo = (c: Account) =>
    lower.some((k) => k.length >= 2 && (c.codigo || '').toLowerCase().startsWith(k));

  // Preferimos SIEMPRE cuentas hoja (clasificacion 4 = auxiliar): las
  // cuentas de clase/grupo/cuenta (1,2,3) suelen tener nombres genéricos
  // (ej. "IMPUESTOS", "GASTOS") que coinciden por texto con las mismas
  // palabras clave, causando que se postee por error en una cuenta de
  // agrupación en vez de una auxiliar.
  const hojas = cuentas.filter((c) => Number(c.clasificacion) === 4);
  const noHojas = cuentas.filter((c) => Number(c.clasificacion) !== 4);

  return (
    hojas.find(coincide) ||
    hojas.find(coincidePorCodigo) ||
    noHojas.find(coincide) ||
    noHojas.find(coincidePorCodigo) ||
    null
  );
}

export async function requireAccountByKeywords(
  accountRepo: Repository<Account>,
  empresaId: number,
  keywords: string[],
  label: string,
): Promise<Account> {
  const cuenta = await findAccountByKeywords(accountRepo, empresaId, keywords);
  if (!cuenta) {
    throw new BadRequestException(
      `No se encontró una cuenta contable de ${label} en el Plan Único de Cuentas. Configure una cuenta con nombres/códigos como: ${keywords.join(', ')}`,
    );
  }
  return cuenta;
}

export async function resolveBancoCuenta(
  accountRepo: Repository<Account>,
  empresaId: number,
  cuentaRef: string | number,
  bancoNombre: string,
): Promise<Account> {
  const ref = String(cuentaRef || '').trim();
  if (!ref) {
    throw new BadRequestException(
      `El banco ${bancoNombre} no tiene una cuenta del Plan Único de Cuentas asignada`,
    );
  }

  // 1. Match exacto por código
  let cuenta = await accountRepo.findOne({
    where: { codigo: ref, empresa_id: empresaId },
  });

  // 2. Si no hay match, buscar por código normalizado (sin puntos)
  if (!cuenta) {
    const refSinPuntos = ref.replace(/\./g, '');
    const todas = await accountRepo.find({ where: { empresa_id: empresaId } });
    cuenta = todas.find((c) => (c.codigo || '').replace(/\./g, '') === refSinPuntos) || null;
  }

  // 3. Fallback: si es numérico, buscar por id
  if (!cuenta && /^\d+$/.test(ref)) {
    cuenta = await accountRepo.findOne({
      where: { id: Number(ref), empresa_id: empresaId },
    });
  }

  if (!cuenta) {
    throw new BadRequestException(
      `La cuenta contable del banco ${bancoNombre} (${ref}) no existe en el Plan Único de Cuentas`,
    );
  }

  return cuenta;
}

export function assertBalanced(lines: Array<{ debito?: number; credito?: number }>) {
  const debito = lines.reduce((acc, l) => acc + Number(l.debito || 0), 0);
  const credito = lines.reduce((acc, l) => acc + Number(l.credito || 0), 0);
  const diff = Math.abs(round2(debito) - round2(credito));
  if (diff > 0.01) {
    throw new BadRequestException(
      `El asiento no cuadra. Débito: ${round2(debito)} Crédito: ${round2(credito)}`,
    );
  }
  return { debito: round2(debito), credito: round2(credito) };
}

export function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Resolución de moneda para documentos (NIIF 21).
 * - Sin moneda_id o moneda local (COP) → no hay conversión.
 * - Moneda extranjera (USD): la tasa viene del DTO o de la TRM registrada
 *   en la moneda. Rechaza si no hay tasa válida.
 */
export async function resolverMonedaDocumento(
  monedaRepo: Repository<Moneda>,
  empresaId: number,
  monedaId: number | undefined,
  tasaCambio: number | undefined,
): Promise<{ moneda: Moneda; tasa: number; esExtranjera: boolean } | null> {
  if (!monedaId) return null;

  const moneda = await monedaRepo.findOne({
    where: { id: monedaId, empresa_id: empresaId, estado: 1 },
  });
  if (!moneda) {
    throw new BadRequestException('La moneda indicada no existe o está inactiva');
  }

  if (moneda.codigo === 'COP' || Number(moneda.es_local) === 1) {
    return { moneda, tasa: 1, esExtranjera: false };
  }

  const tasa = Number(tasaCambio) || Number(moneda.tasa);
  if (!tasa || tasa <= 0) {
    throw new BadRequestException(
      `El documento es en ${moneda.codigo} pero no hay tasa de cambio válida. ` +
        'Sincronice la TRM (Configuración → Monedas) o digite la tasa manualmente.',
    );
  }
  return { moneda, tasa, esExtranjera: true };
}

/**
 * Cuenta de diferencia en cambio (NIIF 21).
 * ganancia → ingreso 4.2.10.x ; perdida → gasto 5.3.05.x
 * Solo acepta una cuenta auxiliar cuyo nombre contenga "diferencia en
 * cambio" y cuyo código cuelgue de la clase correcta. Si no existe, se
 * rechaza la operación indicando qué cuenta crear — usar una auxiliar
 * genérica (ej. INTERESES) contaminaría los informes.
 */
export async function cuentaDiferenciaCambio(
  accountRepo: Repository<Account>,
  empresaId: number,
  esGanancia: boolean,
): Promise<Account> {
  const prefijo = esGanancia ? '4.2.10' : '5.3.05';
  const cuentas = await accountRepo.find({
    where: { empresa_id: empresaId, estado: 1 },
  });
  const cuenta = cuentas.find(
    (c) =>
      Number(c.clasificacion) === 4 &&
      (c.codigo || '').startsWith(prefijo) &&
      (c.nombre || '').toLowerCase().includes('diferencia en cambio'),
  );
  if (!cuenta) {
    throw new BadRequestException(
      `Hay diferencia en cambio pero no existe una cuenta auxiliar de ` +
        `"Diferencia en cambio" bajo ${prefijo} en el Plan Único de Cuentas. ` +
        `Créela en Configuración → Plan de Cuentas ` +
        `(ej. ${prefijo}.50 DIFERENCIA EN CAMBIO ${esGanancia ? 'INGRESO' : 'GASTO'}).`,
    );
  }
  return cuenta;
}

/**
 * Cuenta auxiliar de gasto bancario: comisión o GMF (4x1000).
 * Solo acepta auxiliares (clasificacion 4) de clase 5 cuyo nombre contenga
 * la palabra clave, para no contaminar informes con cuentas genéricas.
 */
export async function cuentaGastoBancario(
  accountRepo: Repository<Account>,
  empresaId: number,
  tipo: 'comision' | 'gmf',
): Promise<Account> {
  const keywords =
    tipo === 'comision' ? ['comision'] : ['4x1000', 'gmf', 'gravamen'];
  const sugerencia =
    tipo === 'comision'
      ? '5.3.05.10 COMISIONES'
      : '5.3.05.15 GMF 4X1000';

  const cuentas = await accountRepo.find({
    where: { empresa_id: empresaId, estado: 1 },
  });
  const esCandidata = (c: Account) =>
    Number(c.clasificacion) === 4 &&
    (c.codigo || '').startsWith('5.') &&
    keywords.some((k) => (c.nombre || '').toLowerCase().includes(k));
  // Preferimos la auxiliar bajo 5.3.05 (gastos financieros) — la comisión
  // y el GMF son gastos de financiación, no administrativos.
  const cuenta =
    cuentas.find((c) => esCandidata(c) && (c.codigo || '').startsWith('5.3.05')) ||
    cuentas.find(esCandidata);
  if (!cuenta) {
    const label = tipo === 'comision' ? 'comisiones bancarias' : 'GMF 4x1000';
    throw new BadRequestException(
      `Se indicó ${label} pero no existe una cuenta auxiliar de gasto ` +
        `correspondiente en el Plan Único de Cuentas. Créela en ` +
        `Configuración → Plan de Cuentas (ej. ${sugerencia}).`,
    );
  }
  return cuenta;
}
