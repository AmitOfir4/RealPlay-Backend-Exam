import { TournamentsService } from './tournaments.service';

describe('TournamentsService.listActive', () => {
  function makeService(items: any[], total: number) {
    const prisma = {
      tournament: {
        findMany: jest.fn().mockResolvedValue(items),
        count: jest.fn().mockResolvedValue(total),
      },
      // service wraps findMany + count in one transaction
      $transaction: jest.fn().mockImplementation((ops: Promise<any>[]) => Promise.all(ops)),
    };
    const queue = { add: jest.fn() };
    return { service: new TournamentsService(prisma as any, queue as any), prisma };
  }

  it('returns only ACTIVE tournaments, newest first, with paging metadata', async () => {
    const items = [{ id: 't2' }, { id: 't1' }];
    const { service, prisma } = makeService(items, 5);

    const page = await service.listActive(2, 20);

    expect(prisma.tournament.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      skip: 2,
      take: 20,
    });
    expect(prisma.tournament.count).toHaveBeenCalledWith({ where: { status: 'ACTIVE' } });
    expect(page).toEqual({ total: 5, limit: 20, offset: 2, items });
  });
});
