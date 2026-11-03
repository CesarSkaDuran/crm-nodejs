import { AccountsService } from './accounts.service';

describe('AccountsService.findAll', () => {
  const accounts = [
    { id: 1, empresa_id: 4 },
    { id: 2, empresa_id: 0 },
  ];

  let service: AccountsService;
  let createQueryBuilder: jest.Mock;
  let getRawMany: jest.Mock;

  beforeEach(() => {
    getRawMany = jest.fn().mockResolvedValue([{ cuenta_id: 1, total: '3' }]);
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany,
    };
    createQueryBuilder = jest.fn().mockReturnValue(queryBuilder);

    service = new AccountsService(
      { find: jest.fn().mockResolvedValue(accounts) } as any,
      { createQueryBuilder } as any,
    );
  });

  it('skips the accounting-line aggregation when counts are not requested', async () => {
    const result = await service.findAll(4, false);

    expect(createQueryBuilder).not.toHaveBeenCalled();
    expect(result).toEqual([
      { ...accounts[0], es_global: false },
      { ...accounts[1], es_global: true },
    ]);
  });

  it('keeps movement counts enabled by default for the chart of accounts', async () => {
    const result = await service.findAll(4);

    expect(getRawMany).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { ...accounts[0], movimientos: 3, es_global: false },
      { ...accounts[1], movimientos: 0, es_global: true },
    ]);
  });
});
