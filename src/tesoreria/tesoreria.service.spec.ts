/**
 * Tests de regresión para TesoreriaService.
 *
 * Casos cubiertos:
 *   1. update() con cambio de valor → reversa el asiento anterior (espejo)
 *      y genera un asiento nuevo; el banco queda con el valor nuevo.
 *   2. update() en período cerrado → BadRequestException.
 *   3. update() de movimiento vinculado a conciliación conciliada → bloqueo.
 *   4. update() sin cambios contables → no toca asientos ni bancos.
 *   5. remove() → restaura el banco y reversa el asiento.
 */
import { BadRequestException } from '@nestjs/common';
import { TesoreriaService } from './tesoreria.service';
import { Tesoreria } from './entities/tesoreria.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Account } from '../accounts/entities/account.entity';
import { Company } from '../companies/entities/company.entity';
import {
  AccountingEntry,
  AccountingEntryLine,
} from '../accounting/entities/accounting-entry.entity';
import { ConciliacionMovimiento } from '../conciliaciones/entities/conciliacion-movimiento.entity';
import { ConciliacionBancaria } from '../conciliaciones/entities/conciliacion-bancaria.entity';
import { Cierre } from '../cierres/entities/cierre.entity';

// =============================================================================
// FIXTURES
// =============================================================================

const EMPRESA_ID = 1;

const BANCO: any = {
  id: 5,
  empresa_id: EMPRESA_ID,
  nombre: 'BANCOLOMBIA',
  cuenta_id: '11100501',
  monto: 1000000,
};

const CUENTA_BANCO: any = {
  id: 101,
  empresa_id: EMPRESA_ID,
  codigo: '11100501',
  nombre: 'BANCOLOMBIA',
  clasificacion: 4,
  estado: 1,
};

const CUENTA_CONTRA: any = {
  id: 202,
  empresa_id: EMPRESA_ID,
  codigo: '53050510',
  nombre: 'COMISIONES',
  clasificacion: 4,
  estado: 1,
};

const MOVIMIENTO: any = {
  id: 10,
  empresa_id: EMPRESA_ID,
  codigo: 'EG0001',
  fecha: '2026-09-10',
  nombre_tercero: 'BANCO',
  valor: 50000,
  tipo: 2, // egreso
  banco_id: 5,
  cuenta_contrapartida_id: 202,
  asentado_id: 900,
  estado: 1,
};

const ASIENTO_ORIGINAL: any = {
  id: 900,
  empresa_id: EMPRESA_ID,
  consecutivo: 'TS000001',
  tipo: 4,
  fecha: '2026-09-10',
  total_debito: 50000,
  total_credito: 50000,
  estado: 1,
};

const LINEAS_ORIGINALES: any[] = [
  {
    id: 1,
    asentado_id: 900,
    cuenta_contable_id: 202,
    debito: 50000,
    credito: 0,
    valor: 50000,
    descripcion: 'Contrapartida COMISIONES',
  },
  {
    id: 2,
    asentado_id: 900,
    cuenta_contable_id: 101,
    debito: 0,
    credito: 50000,
    valor: 50000,
    descripcion: 'Salida BANCOLOMBIA',
  },
];

// =============================================================================
// HARNESS
// =============================================================================

function buildService(opts: {
  cierres?: any[];
  vinculoConciliacion?: any;
  conciliacion?: any;
}) {
  const banco = { ...BANCO };
  const movimiento = { ...MOVIMIENTO };
  const asientos: any[] = [{ ...ASIENTO_ORIGINAL }];
  const lineas: any[] = LINEAS_ORIGINALES.map((l) => ({ ...l }));
  let nextAsientoId = 901;
  let nextLineaId = 100;

  const makeRepo = (entity: any, tx: boolean) => {
    switch (entity) {
      case Cierre:
        return { find: async () => opts.cierres ?? [] };
      case ConciliacionMovimiento:
        return {
          findOne: async () => opts.vinculoConciliacion ?? null,
          update: async () => ({}),
        };
      case ConciliacionBancaria:
        return {
          findOne: async () => opts.conciliacion ?? null,
        };
      case Tesoreria:
        return {
          findOne: async ({ where }: any) =>
            where.id === movimiento.id ? movimiento : null,
          create: (v: any) => v,
          save: async (v: any) => Object.assign(movimiento, v),
          remove: async (v: any) => v,
        };
      case Banco:
        return {
          findOne: async () => banco,
          save: async (b: any) => b,
        };
      case Account:
        return {
          findOne: async ({ where }: any) => {
            if (where.id === CUENTA_CONTRA.id) return CUENTA_CONTRA;
            if (where.codigo === CUENTA_BANCO.codigo) return CUENTA_BANCO;
            return null;
          },
          find: async () => [CUENTA_BANCO, CUENTA_CONTRA],
        };
      case Company:
        return {
          findOneBy: async () => ({ id: EMPRESA_ID, consecutivo_asientos: 0 }),
          save: async (e: any) => e,
        };
      case AccountingEntry:
        return {
          findOne: async ({ where }: any) =>
            asientos.find((a) => a.id === where.id) ?? null,
          create: (v: any) => v,
          save: async (a: any) => {
            if (!a.id) a.id = nextAsientoId++;
            const idx = asientos.findIndex((x) => x.id === a.id);
            if (idx >= 0) asientos[idx] = a;
            else asientos.push(a);
            return a;
          },
        };
      case AccountingEntryLine:
        return {
          find: async ({ where }: any) =>
            lineas.filter((l) => l.asentado_id === where.asentado_id),
          create: (v: any) => v,
          save: async (ls: any) => {
            for (const l of ls) {
              if (!l.id) l.id = nextLineaId++;
              lineas.push(l);
            }
            return ls;
          },
        };
      default:
        throw new Error('Repo no mockeado: ' + entity?.name);
    }
  };

  const managerFueraTx = { getRepository: (e: any) => makeRepo(e, false) };
  const txManager = { getRepository: (e: any) => makeRepo(e, true) };

  const repo: any = {
    findOne: (o: any) => makeRepo(Tesoreria, false).findOne(o),
    save: (v: any) => makeRepo(Tesoreria, false).save(v),
    remove: (v: any) => v,
    manager: managerFueraTx,
  };

  const dataSource: any = {
    transaction: async (cb: any) => cb(txManager),
  };

  const auditoria: any = { registrar: async () => ({}) };

  const service = new TesoreriaService(repo, dataSource, auditoria);
  return { service, banco, movimiento, asientos, lineas, auditoria };
}

// =============================================================================
// TESTS
// =============================================================================

describe('TesoreriaService', () => {
  it('edita el valor: reversa el asiento anterior y crea uno nuevo', async () => {
    const { service, banco, movimiento, asientos, lineas } = buildService({});

    await service.update(10, EMPRESA_ID, { valor: 80000 }, 'admin@test');

    // Asiento original quedó anulado
    expect(asientos[0].estado).toBe(0);

    // Se creó reversa (tipo 6) con líneas espejo
    const reversa = asientos.find((a) => a.tipo === 6);
    expect(reversa).toBeDefined();
    const lineasReversa = lineas.filter((l) => l.asentado_id === reversa.id);
    expect(lineasReversa).toHaveLength(2);
    // espejo: la línea de contrapartida (débito original) ahora es crédito
    const contra = lineasReversa.find((l) => l.cuenta_contable_id === 202);
    expect(contra.credito).toBe(50000);
    expect(contra.debito).toBe(0);

    // Nuevo asiento (tipo 4) con el valor nuevo
    const nuevo = asientos.find((a) => a.tipo === 4 && a.id !== 900);
    expect(nuevo).toBeDefined();
    const lineasNuevo = lineas.filter((l) => l.asentado_id === nuevo.id);
    expect(lineasNuevo.find((l) => l.cuenta_contable_id === 202).debito).toBe(80000);

    // El movimiento apunta al asiento nuevo y tiene el valor nuevo
    expect(movimiento.asentado_id).toBe(nuevo.id);
    expect(movimiento.valor).toBe(80000);

    // Banco: 1.000.000 + 50.000 (reversa egreso) - 80.000 (nuevo egreso)
    expect(banco.monto).toBe(970000);
  });

  it('bloquea la edición si el período del movimiento está cerrado', async () => {
    const { service } = buildService({
      cierres: [{ empresa_id: EMPRESA_ID, periodo: '2026-09', estado: '1' }],
    });

    await expect(
      service.update(10, EMPRESA_ID, { valor: 80000 }, 'admin@test'),
    ).rejects.toThrow(BadRequestException);
  });

  it('bloquea la edición si está vinculado a una conciliación conciliada', async () => {
    const { service } = buildService({
      vinculoConciliacion: { id: 1, conciliacion_id: 7, tesoreria_id: 10 },
      conciliacion: { id: 7, estado: 1 },
    });

    await expect(
      service.update(10, EMPRESA_ID, { valor: 80000 }, 'admin@test'),
    ).rejects.toThrow(BadRequestException);
  });

  it('edición sin cambios contables no toca asientos ni banco', async () => {
    const { service, banco, movimiento, asientos } = buildService({});

    await service.update(10, EMPRESA_ID, { nombre_tercero: 'OTRO' }, 'admin@test');

    expect(asientos).toHaveLength(1); // no se creó nada
    expect(asientos[0].estado).toBe(1); // sigue activo
    expect(banco.monto).toBe(1000000); // intacto
    expect(movimiento.nombre_tercero).toBe('OTRO');
    expect(movimiento.asentado_id).toBe(900); // sigue apuntando al original
  });

  it('remove() restaura el banco y reversa el asiento', async () => {
    const { service, banco, asientos, lineas } = buildService({});

    await service.remove(10, EMPRESA_ID, 'admin@test');

    // Egreso de 50.000 eliminado → el banco recupera ese dinero
    expect(banco.monto).toBe(1050000);
    // Asiento original anulado + reversa creada
    expect(asientos[0].estado).toBe(0);
    const reversa = asientos.find((a) => a.tipo === 6);
    expect(reversa).toBeDefined();
    const espejo = lineas.filter((l) => l.asentado_id === reversa.id);
    expect(espejo.find((l) => l.cuenta_contable_id === 202).credito).toBe(50000);
  });
});
