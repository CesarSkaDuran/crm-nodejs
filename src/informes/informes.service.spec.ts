/**
 * Tests de regresión para InformesService (Fase 1).
 *
 * Estos tests fijan el comportamiento ACTUAL correcto del servicio,
 * sirviendo como red de seguridad para la Fase 2 (refactor).
 *
 * Casos cubiertos:
 *   1. Libro por rango que cruza varias clases (1 a 4) → aparecen cuentas de las 4 clases
 *   2. Modo 'detallado' → saldo se acumula POR CUENTA independientemente
 *   3. saldo_final = suma de saldoPorNaturaleza de cada cuenta con movimientos
 *   4. balanceGeneral → Activo = Pasivo + Patrimonio (con Resultado del Ejercicio)
 *   5. balanceGeneral sin nodo raíz real para Activo/Pasivo → se crea nodo virtual
 *   6. pyg → utilidadPerdida = totalIngresos - totalCostos - totalGastos (redondeo 2 dec)
 */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InformesService } from './informes.service';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';

// =============================================================================
// FIXTURES: Datos que reflejan los escenarios validados manualmente
// =============================================================================

/**
 * Plan de cuentas mínimo con 4 clases (1=Activo, 2=Pasivo, 3=Patrimonio, 4=Ingresos).
 * Cada cuenta tiene id, codigo, nombre, naturaleza, clasificacion, clase, cuenta_padre_id.
 */
const CUENTAS_FIXTURE: any[] = [
  // --- Clase 1: Activo ---
  { id: 1, codigo: '1', nombre: 'ACTIVO', naturaleza: 'D', clasificacion: 1, clase: '1', cuenta_padre_id: null },
  { id: 10, codigo: '1.1', nombre: 'DISPONIBLE', naturaleza: 'D', clasificacion: 2, clase: '1', cuenta_padre_id: 1 },
  { id: 100, codigo: '1.1.05', nombre: 'CAJA', naturaleza: 'D', clasificacion: 3, clase: '1', cuenta_padre_id: 10 },
  { id: 1001, codigo: '1.1.05.05', nombre: 'CAJA GENERAL', naturaleza: 'D', clasificacion: 4, clase: '1', cuenta_padre_id: 100 },

  // --- Clase 2: Pasivo ---
  { id: 2, codigo: '2', nombre: 'PASIVO', naturaleza: 'C', clasificacion: 1, clase: '2', cuenta_padre_id: null },
  { id: 20, codigo: '2.1', nombre: 'PROVEEDORES', naturaleza: 'C', clasificacion: 2, clase: '2', cuenta_padre_id: 2 },
  { id: 200, codigo: '2.1.05', nombre: 'PROVEEDORES NACIONALES', naturaleza: 'C', clasificacion: 3, clase: '2', cuenta_padre_id: 20 },
  { id: 2001, codigo: '2.1.05.05', nombre: 'PROVEEDOR ABC', naturaleza: 'C', clasificacion: 4, clase: '2', cuenta_padre_id: 200 },

  // --- Clase 3: Patrimonio ---
  { id: 3, codigo: '3', nombre: 'PATRIMONIO', naturaleza: 'C', clasificacion: 1, clase: '3', cuenta_padre_id: null },
  { id: 30, codigo: '3.1', nombre: 'CAPITAL SOCIAL', naturaleza: 'C', clasificacion: 2, clase: '3', cuenta_padre_id: 3 },
  { id: 300, codigo: '3.1.05', nombre: 'CAPITAL SUSCRITO', naturaleza: 'C', clasificacion: 3, clase: '3', cuenta_padre_id: 30 },
  { id: 3001, codigo: '3.1.05.05', nombre: 'CAPITAL PAGADO', naturaleza: 'C', clasificacion: 4, clase: '3', cuenta_padre_id: 300 },

  // --- Clase 4: Ingresos ---
  { id: 4, codigo: '4', nombre: 'INGRESOS', naturaleza: 'C', clasificacion: 1, clase: '4', cuenta_padre_id: null },
  { id: 40, codigo: '4.1', nombre: 'INGRESOS OPERACIONALES', naturaleza: 'C', clasificacion: 2, clase: '4', cuenta_padre_id: 4 },
  { id: 400, codigo: '4.1.05', nombre: 'VENTAS', naturaleza: 'C', clasificacion: 3, clase: '4', cuenta_padre_id: 40 },
  { id: 4001, codigo: '4.1.05.05', nombre: 'VENTAS NACIONALES', naturaleza: 'C', clasificacion: 4, clase: '4', cuenta_padre_id: 400 },
];

/**
 * Movimientos contables para los tests del libro auxiliar.
 * Cubren 2 cuentas de Activo (1.1.05.05) y 2 de Ingresos (4.1.05.05).
 */
const MOVIMIENTOS_LIBRO_FIXTURE: any[] = [
  // Caja General (1.1.05.05, naturaleza D): 2 movimientos
  { id: 1, fecha: '2024-01-15', consecutivo: 'FV001', cuenta_contable_id: 1001, tercero_id: 1, descripcion: 'Venta contado', debito: 50000, credito: 0, cuenta_contable: { id: 1001, codigo: '1.1.05.05', nombre: 'CAJA GENERAL', naturaleza: 'D' }, tercero: { nombre: 'CLIENTE 1', documento: '12345' } },
  { id: 2, fecha: '2024-01-20', consecutivo: 'FV002', cuenta_contable_id: 1001, tercero_id: 2, descripcion: 'Venta contado 2', debito: 30000, credito: 0, cuenta_contable: { id: 1001, codigo: '1.1.05.05', nombre: 'CAJA GENERAL', naturaleza: 'D' }, tercero: { nombre: 'CLIENTE 2', documento: '67890' } },
  // Ventas Nacionales (4.1.05.05, naturaleza C): 2 movimientos
  { id: 3, fecha: '2024-01-15', consecutivo: 'FV001', cuenta_contable_id: 4001, tercero_id: 1, descripcion: 'Venta contado', debito: 0, credito: 50000, cuenta_contable: { id: 4001, codigo: '4.1.05.05', nombre: 'VENTAS NACIONALES', naturaleza: 'C' }, tercero: { nombre: 'CLIENTE 1', documento: '12345' } },
  { id: 4, fecha: '2024-01-20', consecutivo: 'FV002', cuenta_contable_id: 4001, tercero_id: 2, descripcion: 'Venta contado 2', debito: 0, credito: 30000, cuenta_contable: { id: 4001, codigo: '4.1.05.05', nombre: 'VENTAS NACIONALES', naturaleza: 'C' }, tercero: { nombre: 'CLIENTE 2', documento: '67890' } },
];

/**
 * Movimientos agregados por cuenta para balanceGeneral.
 * Estructura: [{ id, debito, credito }]
 * Genera un balance cuadrado: Activo=80000, Pasivo=30000, Patrimonio=50000
 */
const MOVIMIENTOS_BALANCE_FIXTURE: any[] = [
  { id: 1001, debito: 80000, credito: 0 },  // Caja (Activo, nat D): saldo = 80000
  { id: 2001, debito: 0, credito: 30000 },  // Proveedor (Pasivo, nat C): saldo = 30000
  { id: 3001, debito: 0, credito: 50000 },  // Capital (Patrimonio, nat C): saldo = 50000
];

/**
 * Movimientos agregados para P&G.
 * Ingresos=80000, Costos=30000, Gastos=10000 → Utilidad=40000
 */
const MOVIMIENTOS_PYG_AGGREGATE_FIXTURE: any[] = [
  { clase: '4', naturaleza: 'C', debito: 0, credito: 80000 },   // Ingresos
  { clase: '6', naturaleza: 'D', debito: 30000, credito: 0 },   // Costos
  { clase: '5', naturaleza: 'D', debito: 10000, credito: 0 },   // Gastos
];

/**
 * Detalle de cuentas auxiliares para P&G.
 */
const MOVIMIENTOS_PYG_DETALLE_FIXTURE: any[] = [
  { cuenta_id: 4001, codigo: '4.1.05.05', nombre: 'VENTAS NACIONALES', clase: '4', naturaleza: 'C', debito: 0, credito: 80000 },
  // Nota: las clases 5 y 6 no están en CUENTAS_FIXTURE, se simulan aquí
  { cuenta_id: 5001, codigo: '5.1.05.05', nombre: 'GASTOS ADMIN', clase: '5', naturaleza: 'D', debito: 10000, credito: 0 },
  { cuenta_id: 6001, codigo: '6.1.05.05', nombre: 'COSTO VENTAS', clase: '6', naturaleza: 'D', debito: 30000, credito: 0 },
];

// =============================================================================
// MOCK HELPERS
// =============================================================================

/**
 * Crea un mock del QueryBuilder de TypeORM que simula las consultas
 * usando los fixtures en memoria.
 */
function createMockQueryBuilder(cuentasFixture: any[], range?: string[]) {
  // Simular el filtrado de cuentas
  let filteredCuentas = [...cuentasFixture];

  const mockQb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockImplementation(async () => {
      // Simular el filtrado LIKE que haría la BD
      // Para tests, devolver todas las cuentas; el filtrado en memoria
      // se hace en el servicio
      return filteredCuentas.map((c) => ({
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        naturaleza: c.naturaleza,
        clasificacion: c.clasificacion,
        clase: c.clase,
        cuenta_padre_id: c.cuenta_padre_id,
      }));
    }),
  };

  return mockQb;
}

// =============================================================================
// TESTS
// =============================================================================

describe('InformesService - Fase 1 (Tests de Regresión)', () => {
  let service: InformesService;
  let lineRepo: jest.Mocked<Partial<Repository<AccountingEntryLine>>>;
  let accountRepo: jest.Mocked<Partial<Repository<Account>>>;

  beforeEach(async () => {
    // Mock del lineRepo: simula getManyAndCount y query (raw SQL)
    lineRepo = {
      createQueryBuilder: jest.fn(),
      query: jest.fn(),
    };

    // Mock del accountRepo: simula createQueryBuilder y findOne
    accountRepo = {
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        InformesService,
        { provide: getRepositoryToken(AccountingEntryLine), useValue: lineRepo },
        { provide: getRepositoryToken(Account), useValue: accountRepo },
      ],
    }).compile();

    service = module.get<InformesService>(InformesService);
  });

  // ---------------------------------------------------------------------------
  // TEST 1: Libro por rango que cruza varias clases (1 a 4)
  // ---------------------------------------------------------------------------
  describe('Caso 1: Libro por rango 1 a 4 (cruza 4 clases)', () => {
    it('debe incluir cuentas de las 4 clases, no solo las dos extremas', async () => {
      // Configurar mocks
      const desde = CUENTAS_FIXTURE.find((c) => c.codigo === '1');
      const hasta = CUENTAS_FIXTURE.find((c) => c.codigo === '4');
      accountRepo.findOne = jest.fn().mockImplementation((opts: any) => {
        const id = opts.where?.id;
        return Promise.resolve(CUENTAS_FIXTURE.find((c) => c.id === id) || null);
      });

      const mockQb = createMockQueryBuilder(CUENTAS_FIXTURE);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      // Mock del lineRepo.createQueryBuilder para devolver los movimientos
      const mockLineQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([MOVIMIENTOS_LIBRO_FIXTURE, MOVIMIENTOS_LIBRO_FIXTURE.length]),
      };
      lineRepo.createQueryBuilder = jest.fn().mockReturnValue(mockLineQb);

      // Llamar libroRango con rango 1 a 4 (cruza clases 1, 2, 3, 4)
      const result = await service.libroRango(
        { desde_id: 1, hasta_id: 4, modo: 'detallado' },
        1, // empresaId
      );

      // Verificar que el resultado tiene datos
      expect(result.data).toBeDefined();
      expect(result.data.length).toBeGreaterThan(0);

      // Verificar que hay movimientos de cuentas de clase 1 (Activo) y clase 4 (Ingresos)
      const clasesPresentes = new Set(
        result.data.map((row: any) => row.cuenta?.codigo?.split('.')[0]).filter(Boolean),
      );
      expect(clasesPresentes.has('1')).toBe(true);  // Activo
      expect(clasesPresentes.has('4')).toBe(true);  // Ingresos

      // El test clave: verificar que el querybuilder recibió un argumento
      // de tipo objeto (Brackets) para agrupar el OR de múltiples clases.
      // Si el bug estuviera presente, se pasaría un string simple con
      // 'OR' que solo incluiría 2 clases.
      const andWhereCalls = mockQb.andWhere.mock.calls;
      // Buscar la llamada que NO es un string (Brackets es un objeto)
      const objectCall = andWhereCalls.find((call: any) =>
        call[0] && typeof call[0] === 'object'
      );
      expect(objectCall).toBeDefined();
      // Verificar que no hay un OR simple de solo 2 clases (el bug)
      const simpleOrCall = andWhereCalls.find((call: any) =>
        typeof call[0] === 'string' && call[0].includes('OR')
      );
      expect(simpleOrCall).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 2: Modo 'detallado' - saldo acumulado POR CUENTA
  // ---------------------------------------------------------------------------
  describe('Caso 2: Modo detallado - saldo acumulado por cuenta independiente', () => {
    it('cada cuenta debe tener su propio saldo acumulado, no un acumulado global', async () => {
      // Configurar mocks para libro de una sola cuenta (1.1.05.05)
      const cuentaCaja = CUENTAS_FIXTURE.find((c) => c.codigo === '1.1.05.05');
      accountRepo.findOne = jest.fn().mockResolvedValue(cuentaCaja);

      const mockQb = createMockQueryBuilder(CUENTAS_FIXTURE.filter((c) => c.codigo.startsWith('1.1.05.05')));
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      // Solo movimientos de Caja
      const movsCaja = MOVIMIENTOS_LIBRO_FIXTURE.filter((m) => m.cuenta_contable_id === 1001);
      const mockLineQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([movsCaja, movsCaja.length]),
      };
      lineRepo.createQueryBuilder = jest.fn().mockReturnValue(mockLineQb);

      const result = await service.libroMayor(
        { cuenta_id: 1001, modo: 'detallado' },
        1,
      );

      expect(result.data.length).toBe(2);

      // Fila 1: debito=50000, credito=0, naturaleza D → saldo = 50000
      expect(result.data[0].debito).toBe(50000);
      expect(result.data[0].credito).toBe(0);
      expect(result.data[0].saldo).toBe(50000);

      // Fila 2: debito=30000, credito=0, naturaleza D → saldo = 50000 + 30000 = 80000
      expect(result.data[1].debito).toBe(30000);
      expect(result.data[1].credito).toBe(0);
      expect(result.data[1].saldo).toBe(80000);
    });

    it('con múltiples cuentas, el saldo de cada una es independiente', async () => {
      // Rango que incluye Caja (1.1.05.05) y Ventas (4.1.05.05)
      const desde = CUENTAS_FIXTURE.find((c) => c.codigo === '1');
      const hasta = CUENTAS_FIXTURE.find((c) => c.codigo === '4');
      accountRepo.findOne = jest.fn().mockImplementation((opts: any) => {
        const id = opts.where?.id;
        return Promise.resolve(CUENTAS_FIXTURE.find((c) => c.id === id) || null);
      });

      const mockQb = createMockQueryBuilder(CUENTAS_FIXTURE);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      const mockLineQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([MOVIMIENTOS_LIBRO_FIXTURE, MOVIMIENTOS_LIBRO_FIXTURE.length]),
      };
      lineRepo.createQueryBuilder = jest.fn().mockReturnValue(mockLineQb);

      const result = await service.libroRango(
        { desde_id: desde.id, hasta_id: hasta.id, modo: 'detallado' },
        1,
      );

      // Filtrar por cada cuenta
      const filasCaja = result.data.filter((r: any) => r.cuenta?.codigo === '1.1.05.05');
      const filasVentas = result.data.filter((r: any) => r.cuenta?.codigo === '4.1.05.05');

      // Caja: 50000, luego 80000 (acumulado propio, no mezclado con Ventas)
      expect(filasCaja[0].saldo).toBe(50000);
      expect(filasCaja[1].saldo).toBe(80000);

      // Ventas (naturaleza C): credito=50000 → saldo = 50000, luego +30000 = 80000
      expect(filasVentas[0].saldo).toBe(50000);
      expect(filasVentas[1].saldo).toBe(80000);

      // CLAVE: el saldo de la primera fila de Ventas NO debe arrastrar el saldo de Caja
      // Si el bug estuviera presente, filasVentas[0].saldo sería 50000 + 50000 = 100000
      expect(filasVentas[0].saldo).not.toBe(100000);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 3: saldo_final = suma de saldoPorNaturaleza de cada cuenta con movimientos
  // ---------------------------------------------------------------------------
  describe('Caso 3: saldo_final coherente con totales', () => {
    it('saldo_final debe ser la suma de saldos por naturaleza de cada cuenta', async () => {
      const cuentaCaja = CUENTAS_FIXTURE.find((c) => c.codigo === '1.1.05.05');
      accountRepo.findOne = jest.fn().mockResolvedValue(cuentaCaja);

      const mockQb = createMockQueryBuilder(CUENTAS_FIXTURE.filter((c) => c.codigo.startsWith('1.1.05.05')));
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      const movsCaja = MOVIMIENTOS_LIBRO_FIXTURE.filter((m) => m.cuenta_contable_id === 1001);
      const mockLineQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([movsCaja, movsCaja.length]),
      };
      lineRepo.createQueryBuilder = jest.fn().mockReturnValue(mockLineQb);

      const result = await service.libroMayor(
        { cuenta_id: 1001, modo: 'detallado' },
        1,
      );

      // total_debito = 50000 + 30000 = 80000
      // total_credito = 0
      // saldo_final (naturaleza D) = 80000 - 0 = 80000
      expect(result.total_debito).toBe(80000);
      expect(result.total_credito).toBe(0);
      expect(result.saldo_final).toBe(80000);

      // El saldo_final debe coincidir con total_debito - total_credito
      // cuando todas las cuentas son de la misma naturaleza
      expect(result.saldo_final).toBe(result.total_debito - result.total_credito);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 4: balanceGeneral - Activo = Pasivo + Patrimonio
  // ---------------------------------------------------------------------------
  describe('Caso 4: Estado de Situación Financiera - ecuación contable', () => {
    it('Activo = Pasivo + Patrimonio (con Resultado del Ejercicio)', async () => {
      // Mock del accountRepo.createQueryBuilder para devolver cuentas de clases 1, 2, 3
      const cuentasBalance = CUENTAS_FIXTURE.filter((c) => ['1', '2', '3'].includes(c.clase));
      const mockQb = createMockQueryBuilder(cuentasBalance);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      // Mock del lineRepo.query para movimientos agregados del balance
      lineRepo.query = jest.fn()
        // Primera llamada: movimientos del balance
        .mockResolvedValueOnce(MOVIMIENTOS_BALANCE_FIXTURE)
        // Segunda llamada: resultado del ejercicio (clases 4, 5, 6)
        // En este fixture, no hay movimientos de clases 4/5/6 → resultado = 0
        .mockResolvedValueOnce([]);

      const result = await service.balanceGeneral({}, 1);

      // Activo = 80000 (Caja, naturaleza D)
      expect(result.totales.activo).toBe(80000);
      // Pasivo = 30000 (Proveedor, naturaleza C)
      expect(result.totales.pasivo).toBe(30000);
      // Patrimonio = 50000 (Capital, naturaleza C) + Resultado del Ejercicio (0)
      expect(result.totales.patrimonio).toBe(50000);

      // Ecuación: Activo = Pasivo + Patrimonio
      expect(result.totales.activo).toBe(result.totales.pasivo + result.totales.patrimonio);

      // saldo_final debe ser ~0 si el balance cuadra
      expect(Math.abs(result.saldo_final)).toBeLessThan(0.01);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 5: balanceGeneral sin nodo raíz real para Activo/Pasivo
  // ---------------------------------------------------------------------------
  describe('Caso 5: Estado de Situación Financiera sin nodo raíz para Activo/Pasivo', () => {
    it('debe crear nodo virtual y el total no debe quedar en 0', async () => {
      // Plan de cuentas SIN nodo raíz "1" ni "2" (sin cuenta_padre_id=null para esas clases).
      // Las cuentas de Activo y Pasivo tienen cuenta_padre_id apuntando a un ID
      // inexistente (999), simulando un plan de cuentas huérfano.
      const cuentasSinRaiz = CUENTAS_FIXTURE
        .filter((c) => ['1', '2', '3'].includes(c.clase))
        .map((c) => {
          // Eliminar los nodos raíz "1" y "2"
          if (c.codigo === '1' || c.codigo === '2') return null;
          // Las cuentas que eran hijas directas de "1" o "2" ahora apuntan
          // a un padre inexistente (999)
          if (c.codigo === '1.1' || c.codigo === '2.1') {
            return { ...c, cuenta_padre_id: 999 };
          }
          return c;
        })
        .filter(Boolean);

      const mockQb = createMockQueryBuilder(cuentasSinRaiz);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      lineRepo.query = jest.fn()
        .mockResolvedValueOnce(MOVIMIENTOS_BALANCE_FIXTURE)
        .mockResolvedValueOnce([]);

      const result = await service.balanceGeneral({}, 1);

      // Activo NO debe ser 0 (el nodo virtual debe consolidar las hijas)
      expect(result.totales.activo).not.toBe(0);
      expect(result.totales.activo).toBe(80000);

      // Pasivo NO debe ser 0
      expect(result.totales.pasivo).not.toBe(0);
      expect(result.totales.pasivo).toBe(30000);

      // Verificar que se crearon nodos virtuales en data
      const raizActivo = result.data.find((d: any) =>
        (d.codigo === '1' || d.codigo === '1.') && d.esVirtual === true,
      );
      const raizPasivo = result.data.find((d: any) =>
        (d.codigo === '2' || d.codigo === '2.') && d.esVirtual === true,
      );
      expect(raizActivo).toBeDefined();
      expect(raizPasivo).toBeDefined();

      // La ecuación debe seguir cuadrando
      expect(Math.abs(result.saldo_final)).toBeLessThan(0.01);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 6: pyg - utilidadPerdida = ingresos - costos - gastos (redondeo)
  // ---------------------------------------------------------------------------
  describe('Caso 6: P&G - utilidad con redondeo a 2 decimales', () => {
    it('utilidadPerdida = totalIngresos - totalCostos - totalGastos', async () => {
      // Mock del lineRepo.query para devolver:
      // 1. Detalle de cuentas auxiliares de clases 4, 5, 6
      // 2. Agregado por clase para calcularResultadoEjercicio
      lineRepo.query = jest.fn()
        // pyg: detalle de auxiliares
        .mockResolvedValueOnce(MOVIMIENTOS_PYG_DETALLE_FIXTURE)
        // calcularResultadoEjercicio: agregado por clase
        .mockResolvedValueOnce(MOVIMIENTOS_PYG_AGGREGATE_FIXTURE);

      const result = await service.pyg({}, 1);

      // Ingresos = 80000 (naturaleza C: credito - debito = 80000 - 0)
      expect(result.totalIngresos).toBe(80000);
      // Costos = 30000 (naturaleza D: debito - credito = 30000 - 0)
      expect(result.totalCostos).toBe(30000);
      // Gastos = 10000 (naturaleza D: debito - credito = 10000 - 0)
      expect(result.totalGastos).toBe(10000);
      // Utilidad = 80000 - 30000 - 10000 = 40000
      expect(result.utilidadPerdida).toBe(40000);

      // Verificar redondeo: los valores deben tener máximo 2 decimales
      const round2 = (x: number) => Math.round(x * 100) / 100;
      expect(result.totalIngresos).toBe(round2(result.totalIngresos));
      expect(result.totalCostos).toBe(round2(result.totalCostos));
      expect(result.totalGastos).toBe(round2(result.totalGastos));
      expect(result.utilidadPerdida).toBe(round2(result.utilidadPerdida));
    });

    it('utilidadPerdida con decimales debe redondear correctamente', async () => {
      // Fixture con valores que generan decimales exactos en coma flotante
      // (evitar 100.005 que tiene problemas de representación)
      const detalleConDecimales = [
        { cuenta_id: 4001, codigo: '4.1.05.05', nombre: 'VENTAS', clase: '4', naturaleza: 'C', debito: 0, credito: 100.12 },
        { cuenta_id: 5001, codigo: '5.1.05.05', nombre: 'GASTOS', clase: '5', naturaleza: 'D', debito: 30.34, credito: 0 },
        { cuenta_id: 6001, codigo: '6.1.05.05', nombre: 'COSTOS', clase: '6', naturaleza: 'D', debito: 20.56, credito: 0 },
      ];
      const aggregateConDecimales = [
        { clase: '4', naturaleza: 'C', debito: 0, credito: 100.12 },
        { clase: '5', naturaleza: 'D', debito: 30.34, credito: 0 },
        { clase: '6', naturaleza: 'D', debito: 20.56, credito: 0 },
      ];

      lineRepo.query = jest.fn()
        .mockResolvedValueOnce(detalleConDecimales)
        .mockResolvedValueOnce(aggregateConDecimales);

      const result = await service.pyg({}, 1);

      // Ingresos = 100.12 (naturaleza C: credito - debito)
      expect(result.totalIngresos).toBe(100.12);
      // Costos = 20.56 (naturaleza D: debito - credito)
      expect(result.totalCostos).toBe(20.56);
      // Gastos = 30.34 (naturaleza D: debito - credito)
      expect(result.totalGastos).toBe(30.34);
      // Utilidad = 100.12 - 20.56 - 30.34 = 49.22
      expect(result.utilidadPerdida).toBe(49.22);

      // Verificar que todos los valores están redondeados a 2 decimales
      const round2 = (x: number) => Math.round(x * 100) / 100;
      expect(result.totalIngresos).toBe(round2(result.totalIngresos));
      expect(result.totalCostos).toBe(round2(result.totalCostos));
      expect(result.totalGastos).toBe(round2(result.totalGastos));
      expect(result.utilidadPerdida).toBe(round2(result.utilidadPerdida));
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 7: balanceGeneral - no doble conteo en total_debito / total_credito
  // ---------------------------------------------------------------------------
  describe('Caso 7: Estado de Situación Financiera - no doble conteo de totales', () => {
    it('total_debito debe sumar solo movimientos directos, no agregados jerárquicos', async () => {
      // Catálogo de 3 niveles: clase 1 → grupo 1.1 → auxiliar 1.1.05
      // Solo la auxiliar tiene movimientos reales (debito = 100)
      const cuentasTresNiveles = [
        { id: 1, codigo: '1', nombre: 'ACTIVO', naturaleza: 'D', clasificacion: 1, clase: '1', cuenta_padre_id: null },
        { id: 10, codigo: '1.1', nombre: 'DISPONIBLE', naturaleza: 'D', clasificacion: 2, clase: '1', cuenta_padre_id: 1 },
        { id: 100, codigo: '1.1.05', nombre: 'CAJA', naturaleza: 'D', clasificacion: 3, clase: '1', cuenta_padre_id: 10 },
      ];

      const mockQb = createMockQueryBuilder(cuentasTresNiveles);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      // Solo la auxiliar 100 tiene movimientos: 100 de débito
      const movimientos = [{ id: 100, debito: 100, credito: 0 }];

      lineRepo.query = jest.fn()
        .mockResolvedValueOnce(movimientos)
        .mockResolvedValueOnce([]);

      const result = await service.balanceGeneral({}, 1);

      // total_debito debe ser exactamente 100, no 300 (que sería si se suman
      // los 3 niveles jerárquicos: 100 del auxiliar + 100 del grupo + 100 de la clase)
      expect(result.total_debito).toBe(100);
      expect(result.total_credito).toBe(0);

      // El total de la clase Activo (totales.activo) debe ser 100
      expect(result.totales.activo).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 8: buildLibro - saldo anterior en modo detallado
  // ---------------------------------------------------------------------------
  describe('Caso 8: buildLibro - saldo anterior incluido en saldo corrido', () => {
    it('saldo_inicial + suma de movimientos del periodo = saldo_final', async () => {
      // Cuenta auxiliar de naturaleza D con movimientos antes y dentro del rango
      const cuentaCaja = CUENTAS_FIXTURE.find((c) => c.codigo === '1.1.05.05');
      accountRepo.findOne = jest.fn().mockResolvedValue(cuentaCaja);

      const cuentasCaja = CUENTAS_FIXTURE.filter((c) =>
        c.codigo.startsWith('1.1.05.05'),
      );
      const mockQb = createMockQueryBuilder(cuentasCaja);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      // Movimientos dentro del rango [2024-02-01, 2024-02-28]:
      //   2024-02-15: debito 30, credito 0
      const movsRango = [
        {
          id: 10,
          fecha: '2024-02-15',
          consecutivo: 'FC001',
          cuenta_contable_id: 1001,
          tercero_id: 1,
          descripcion: 'Ingreso febrero',
          debito: 30,
          credito: 0,
          cuenta_contable: { id: 1001, codigo: '1.1.05.05', nombre: 'CAJA GENERAL', naturaleza: 'D' },
          tercero: { nombre: 'CLIENTE 1', documento: '12345' },
        },
      ];
      const mockLineQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([movsRango, movsRango.length]),
      };
      lineRepo.createQueryBuilder = jest.fn().mockReturnValue(mockLineQb);

      // Saldo anterior (movimientos antes de 2024-02-01):
      //   debito 50, credito 0 => saldoAnterior = 50 (naturaleza D)
      const saldoAnterior = [{ id: 1001, debito: 50, credito: 0 }];
      lineRepo.query = jest.fn().mockResolvedValue(saldoAnterior);

      const result = await service.libroMayor(
        { cuenta_id: 1001, modo: 'detallado', date: '2024-02-01', date2: '2024-02-28' },
        1,
      );

      // total_debito / total_credito solo incluyen movimientos del rango
      expect(result.total_debito).toBe(30);
      expect(result.total_credito).toBe(0);

      // saldo_inicial de la cuenta 1001 es 50
      expect(result.saldos_iniciales).toBeDefined();
      expect(result.saldos_iniciales![1001]).toBe(50);

      // La primera fila tiene saldo 80 (50 anterior + 30 del periodo)
      expect(result.data[0].saldo).toBe(80);

      // Identidad contable: saldo_inicial + suma de movimientos del periodo = saldo_final
      // 50 + (30 - 0) = 80
      expect(result.saldo_final).toBe(80);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 9: balanceGeneral ignora date y usa solo date2 como fecha de corte
  // ---------------------------------------------------------------------------
  describe('Caso 9: balanceGeneral ignora el parámetro date', () => {
    it('incluye movimientos anteriores a date porque es saldo acumulado a date2', async () => {
      // Cuenta de Activo con 2 movimientos: 50 antes de date, 100 dentro del rango
      const cuentas = [
        { id: 100, codigo: '1.1.05', nombre: 'CAJA', naturaleza: 'D', clasificacion: 3, clase: '1', cuenta_padre_id: null },
      ];
      const mockQb = createMockQueryBuilder(cuentas);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      // Si date fuera usado como límite inferior, el balance con date='2024-02-01'
      // solo incluiría 100. Al ignorar date, la suma es 150.
      const movimientos = [{ id: 100, debito: 150, credito: 0 }];

      lineRepo.query = jest.fn()
        .mockResolvedValueOnce(movimientos)
        .mockResolvedValueOnce([]);

      const result = await service.balanceGeneral(
        { date: '2024-02-01', date2: '2024-12-31' },
        1,
      );

      expect(result.totales.activo).toBe(150);
      // total_debito es 150 (todo el histórico hasta date2)
      expect(result.total_debito).toBe(150);
      expect(result.total_credito).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 10: compatibilidad hacia atrás sin filtro de fecha
  // ---------------------------------------------------------------------------
  describe('Caso 10: buildLibro sin filtro de fecha - compatibilidad hacia atrás', () => {
    it('saldos_iniciales debe estar vacío y el resultado coincidir con el comportamiento anterior', async () => {
      // Reutiliza el fixture de la Fase 1 (libro con cuenta única)
      const cuentaCaja = CUENTAS_FIXTURE.find((c) => c.codigo === '1.1.05.05');
      accountRepo.findOne = jest.fn().mockResolvedValue(cuentaCaja);

      const mockQb = createMockQueryBuilder(CUENTAS_FIXTURE.filter((c) => c.codigo.startsWith('1.1.05.05')));
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      const movsCaja = MOVIMIENTOS_LIBRO_FIXTURE.filter((m) => m.cuenta_contable_id === 1001);
      const mockLineQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([movsCaja, movsCaja.length]),
      };
      lineRepo.createQueryBuilder = jest.fn().mockReturnValue(mockLineQb);

      // Sin `date`, no se ejecuta la query de saldo anterior
      lineRepo.query = jest.fn().mockResolvedValue([]);

      const result = await service.libroMayor(
        { cuenta_id: 1001, modo: 'detallado' },
        1,
      );

      // Aserciones originales de la Fase 1
      expect(result.data.length).toBe(2);
      expect(result.data[0].saldo).toBe(50000);
      expect(result.data[1].saldo).toBe(80000);
      expect(result.total_debito).toBe(80000);
      expect(result.total_credito).toBe(0);
      expect(result.saldo_final).toBe(80000);

      // Nuevo assert: sin filtro de fecha no hay saldos iniciales
      expect(result.saldos_iniciales).toEqual({});
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 11: buildLibro - cuenta con saldo anterior pero SIN movimientos en el período
  // ---------------------------------------------------------------------------
  describe('Caso 11: buildLibro - mantiene cuenta con saldo anterior sin movimientos en el período', () => {
    it('en modo resumido, la cuenta NO desaparece y saldo_final = saldoAnterior', async () => {
      // Cuenta Bancos (1.1.05.05, naturaleza D) con saldo anterior de 10000
      const cuentaCaja = CUENTAS_FIXTURE.find((c) => c.codigo === '1.1.05.05');
      accountRepo.findOne = jest.fn().mockResolvedValue(cuentaCaja);

      const cuentasCaja = CUENTAS_FIXTURE.filter((c) =>
        c.codigo.startsWith('1.1.05.05'),
      );
      const mockQb = createMockQueryBuilder(cuentasCaja);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      // Sin movimientos en el rango [2026-01-01, 2026-01-31]
      const mockLineQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      lineRepo.createQueryBuilder = jest.fn().mockReturnValue(mockLineQb);

      // Saldo anterior: 10000 (débito) antes de 2026-01-01
      const saldoAnterior = [{ id: 1001, debito: 10000, credito: 0 }];
      lineRepo.query = jest.fn().mockResolvedValue(saldoAnterior);

      const result = await service.libroMayor(
        { cuenta_id: 1001, modo: 'resumido', date: '2026-01-01', date2: '2026-01-31' },
        1,
      );

      // saldo_inicial de la cuenta 1001 es 10000
      expect(result.saldos_iniciales).toBeDefined();
      expect(result.saldos_iniciales![1001]).toBe(10000);

      // saldo_final = saldoAnterior = 10000 (sin movimientos en el período)
      expect(result.saldo_final).toBe(10000);

      // total_debito y total_credito son 0 (sin movimientos en el rango)
      expect(result.total_debito).toBe(0);
      expect(result.total_credito).toBe(0);

      // La cuenta NO debe desaparecer del resultado resumido
      expect(result.data.length).toBeGreaterThan(0);
      const filaCuenta = result.data.find((d: any) => d.cuenta?.id === 1001);
      expect(filaCuenta).toBeDefined();
      expect(filaCuenta.saldo).toBe(10000);

      // NO debe haber filas de movimiento ficticias (data tiene la fila resumida, no transacciones)
      // En modo resumido, data contiene una fila por cuenta, no por transacción
      expect(result.data.length).toBe(1); // Solo una cuenta
    });
  });

  // ---------------------------------------------------------------------------
  // TEST 12: buildLibro - saldo anterior + movimientos del período
  // ---------------------------------------------------------------------------
  describe('Caso 12: buildLibro - saldo anterior + movimientos del período = saldo_final', () => {
    it('saldo_inicial(10000) + movimiento(2000) = saldo_final(12000)', async () => {
      const cuentaCaja = CUENTAS_FIXTURE.find((c) => c.codigo === '1.1.05.05');
      accountRepo.findOne = jest.fn().mockResolvedValue(cuentaCaja);

      const cuentasCaja = CUENTAS_FIXTURE.filter((c) =>
        c.codigo.startsWith('1.1.05.05'),
      );
      const mockQb = createMockQueryBuilder(cuentasCaja);
      accountRepo.createQueryBuilder = jest.fn().mockReturnValue(mockQb);

      // Un movimiento dentro del rango: débito 2000
      const movsRango = [
        {
          id: 50,
          fecha: '2026-01-15',
          consecutivo: 'FC001',
          cuenta_contable_id: 1001,
          tercero_id: 1,
          descripcion: 'Ingreso enero',
          debito: 2000,
          credito: 0,
          cuenta_contable: { id: 1001, codigo: '1.1.05.05', nombre: 'CAJA GENERAL', naturaleza: 'D' },
          tercero: { nombre: 'CLIENTE 1', documento: '12345' },
        },
      ];
      const mockLineQb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([movsRango, movsRango.length]),
      };
      lineRepo.createQueryBuilder = jest.fn().mockReturnValue(mockLineQb);

      // Saldo anterior: 10000 (débito) antes de 2026-01-01
      const saldoAnterior = [{ id: 1001, debito: 10000, credito: 0 }];
      lineRepo.query = jest.fn().mockResolvedValue(saldoAnterior);

      const result = await service.libroMayor(
        { cuenta_id: 1001, modo: 'resumido', date: '2026-01-01', date2: '2026-01-31' },
        1,
      );

      // saldo_inicial = 10000
      expect(result.saldos_iniciales![1001]).toBe(10000);

      // total_debito = 2000 (solo movimientos del período)
      expect(result.total_debito).toBe(2000);
      expect(result.total_credito).toBe(0);

      // saldo_final = 10000 + 2000 = 12000
      expect(result.saldo_final).toBe(12000);

      // La cuenta aparece con saldo 12000
      const filaCuenta = result.data.find((d: any) => d.cuenta?.id === 1001);
      expect(filaCuenta).toBeDefined();
      expect(filaCuenta.saldo).toBe(12000);
    });
  });
});


