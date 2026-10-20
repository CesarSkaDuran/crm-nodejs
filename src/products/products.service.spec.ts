import { ProductsService } from './products.service';

describe('ProductsService importar', () => {
  let service: ProductsService;
  let productRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(() => {
    productRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((product) => product),
      save: jest.fn(async (product) => ({ id: 1, ...product })),
    };

    service = new ProductsService(
      productRepo as any,
      {} as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { count: jest.fn().mockResolvedValue(0) } as any,
    );
  });

  it('defaults unrelated text in tipo to product instead of persisting NaN', async () => {
    const result = await service.importar(
      [
        {
          codigo: '001915',
          nombre: 'JUGUETE PELOTA',
          tipo: 'Soltero',
        },
      ],
      1,
    );

    expect(result).toMatchObject({ creados: 1, actualizados: 0, errores: [] });
    expect(productRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ codigo: '001915', tipo: 1 }),
    );
    expect(
      Object.values(productRepo.save.mock.calls[0][0]).some(
        (value) => typeof value === 'number' && Number.isNaN(value),
      ),
    ).toBe(false);
  });

  it('maps a service label to the service product type', async () => {
    await service.importar(
      [{ codigo: 'SVC-1', nombre: 'Servicio', tipo: 'Servicio' }],
      1,
    );

    expect(productRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 2 }),
    );
  });
});
