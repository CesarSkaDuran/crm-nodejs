import {
  BadGatewayException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ContaAsistService } from './contaasist.service';

describe('ContaAsistService', () => {
  let service: ContaAsistService;
  let balanceGeneral: jest.Mock;
  let pyg: jest.Mock;

  beforeEach(() => {
    balanceGeneral = jest.fn().mockResolvedValue({
      data: [
        {
          id: 321,
          codigo: '1.1',
          nombre: 'Disponible',
          clase: '1',
          naturaleza: 'D',
          debito: 100,
          credito: 20,
          saldo: 80,
        },
      ],
      totales: { activo: 80, pasivo: 0, patrimonio: 80 },
      total_debito: 100,
      total_credito: 20,
      saldo_final: 0,
    });
    pyg = jest.fn().mockResolvedValue({
      totalIngresos: 100,
      totalCostos: 20,
      totalGastos: 30,
      utilidadPerdida: 50,
      detalle: [],
    });

    service = new ContaAsistService(
      { get: jest.fn().mockReturnValue(undefined) } as any,
      { balanceGeneral, pyg } as any,
    );
  });

  it('uses the authenticated company for balance queries and omits database ids', async () => {
    const result = await (service as any).runReadOnlyTool(
      'consultar_balance_general',
      { date2: '2026-10-31' },
      42,
    );

    expect(balanceGeneral).toHaveBeenCalledWith({ date2: '2026-10-31' }, 42);
    expect(JSON.stringify(result)).not.toContain('"id"');
    expect(result.cuentas[0]).toEqual({
      codigo: '1.1',
      nombre: 'Disponible',
      clase: '1',
      naturaleza: 'D',
      debito: 100,
      credito: 20,
      saldo: 80,
    });
  });

  it('uses the authenticated company for P&G queries', async () => {
    const result = await (service as any).runReadOnlyTool(
      'consultar_estado_resultados',
      { date: '2026-01-01', date2: '2026-10-31' },
      42,
    );

    expect(pyg).toHaveBeenCalledWith(
      { date: '2026-01-01', date2: '2026-10-31' },
      42,
    );
    expect(result.utilidadPerdida).toBe(50);
  });

  it('does not make provider requests until a key is configured', async () => {
    await expect(
      service.chat({ message: 'Hola', module: 'dashboard' }, 42),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(balanceGeneral).not.toHaveBeenCalled();
    expect(pyg).not.toHaveBeenCalled();
  });

  it('reports the upstream HTTP status without exposing provider error details', async () => {
    (service as any).config.get.mockImplementation((key: string) =>
      key === 'DEEPSEEK_API_KEY' ? 'test-key' : undefined,
    );
    jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'x-request-id': 'request-123' }),
      json: jest.fn().mockResolvedValue({
        error: {
          type: 'authentication_error',
          code: 'invalid_api_key',
          message: 'provider detail that should stay private',
        },
      }),
    }) as any;

    try {
      const error = await (service as any)
        .requestDeepSeek([])
        .catch((result: unknown) => result);

      expect(error).toBeInstanceOf(BadGatewayException);
      expect(error.message).toContain('HTTP 401');
      expect(error.message).not.toContain('provider detail');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
