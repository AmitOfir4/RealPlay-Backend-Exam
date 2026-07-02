import { BetsService } from './bets.service';

const dto = {
  externalBetId: 'bet_123456',
  playerId: 'player_42',
  amount: 250,
  currency: 'USD',
  createdAt: '2026-06-04T12:30:00.000Z',
};

function makeService(tournamentIds: string[], applied: boolean[]) {
  const prisma = {
    tournament: {
      findMany: jest.fn().mockResolvedValue(tournamentIds.map((id) => ({ id }))),
    },
    bet: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const store = { applyBets: jest.fn().mockResolvedValue(applied) };
  return { service: new BetsService(prisma as any, store as any), prisma, store };
}

describe('BetsService', () => {
  it('only matches ACTIVE tournaments whose window contains createdAt', async () => {
    const { service, prisma } = makeService([], []);
    await service.ingest(dto);

    expect(prisma.tournament.findMany).toHaveBeenCalledWith({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: new Date(dto.createdAt) },
        endsAt: { gte: new Date(dto.createdAt) },
      },
      select: { id: true },
    });
  });

  it('returns empty results and writes nothing when no tournament matches', async () => {
    const { service, prisma, store } = makeService([], []);
    const result = await service.ingest(dto);

    expect(result.results).toEqual([]);
    expect(prisma.bet.createMany).not.toHaveBeenCalled();
    expect(store.applyBets).not.toHaveBeenCalled();
  });

  it('counts a bet towards every matching tournament', async () => {
    const { service, prisma, store } = makeService(['t1', 't2'], [true, true]);
    const result = await service.ingest(dto);

    expect(prisma.bet.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ tournamentId: 't1', externalBetId: dto.externalBetId }),
        expect.objectContaining({ tournamentId: 't2', externalBetId: dto.externalBetId }),
      ]),
      skipDuplicates: true,
    });
    expect(store.applyBets).toHaveBeenCalledWith([
      expect.objectContaining({ tournamentId: 't1', amount: 250, playerId: 'player_42' }),
      expect.objectContaining({ tournamentId: 't2', amount: 250, playerId: 'player_42' }),
    ]);
    expect(result.results).toEqual([
      { tournamentId: 't1', accepted: true, duplicate: false },
      { tournamentId: 't2', accepted: true, duplicate: false },
    ]);
  });

  it('reports duplicates as success without counting twice', async () => {
    const { service, store } = makeService(['t1'], [false]);
    const result = await service.ingest(dto);

    // the Lua SADD guard said "already counted" — no score change, still a 2xx
    expect(store.applyBets).toHaveBeenCalledTimes(1);
    expect(result.results).toEqual([{ tournamentId: 't1', accepted: false, duplicate: true }]);
  });
});
