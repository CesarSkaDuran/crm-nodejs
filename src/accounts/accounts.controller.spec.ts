import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

const cuentaGlobal = {
  id: 10,
  empresa_id: 0,
  cuenta_padre: { id: 1, empresa_id: 0 },
  hijas: [
    { id: 11, empresa_id: 0 },
    { id: 12, empresa_id: 2 },
    { id: 13, empresa_id: 3 },
  ],
};

describe('AccountsController tenant isolation', () => {
  let controller: AccountsController;
  let findOne: jest.Mock;

  beforeEach(() => {
    findOne = jest.fn().mockResolvedValue(cuentaGlobal);
    controller = new AccountsController({ findOne } as unknown as AccountsService);
  });

  it('returns only global and company-owned children for a global account', async () => {
    const result = await controller.findOne(10, { empresa_id: 2 });

    expect(findOne).toHaveBeenCalledWith(10, 2);
    expect(result.hijas.map((c) => c.id)).toEqual([11, 12]);
    expect(result.cuenta_padre).toEqual({ id: 1, empresa_id: 0 });
  });

  it('uses the current company rather than sharing private children across companies', async () => {
    const result = await controller.findOne(10, { empresa_id: 3 });

    expect(result.hijas.map((c) => c.id)).toEqual([11, 13]);
  });

  it('does not expose a parent from another company', async () => {
    findOne.mockResolvedValue({
      ...cuentaGlobal,
      cuenta_padre: { id: 20, empresa_id: 3 },
    });

    const result = await controller.findOne(10, { empresa_id: 2 });

    expect(result.cuenta_padre).toBeNull();
  });

  it('does not mutate relations used by the service when updating accounts', async () => {
    await controller.findOne(10, { empresa_id: 2 });

    expect(cuentaGlobal.hijas.map((c) => c.id)).toEqual([11, 12, 13]);
  });
});
