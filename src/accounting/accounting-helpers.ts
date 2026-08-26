import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Account } from '../accounts/entities/account.entity';

export async function findAccountByKeywords(
  accountRepo: Repository<Account>,
  empresaId: number,
  keywords: string[],
): Promise<Account | null> {
  const cuentas = await accountRepo.find({
    where: { empresa_id: empresaId, estado: 1 },
  });

  const lower = keywords.map((k) => k.toLowerCase());

  const byName = cuentas.find((c) =>
    lower.some(
      (k) =>
        (c.nombre || '').toLowerCase().includes(k) ||
        (c.codigo || '').toLowerCase().startsWith(k),
    ),
  );
  if (byName) return byName;

  return (
    cuentas.find((c) =>
      lower.some((k) => (c.codigo || '').toLowerCase().startsWith(k)),
    ) || null
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
