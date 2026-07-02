import { NotFoundException } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

describe('LeaderboardService', () => {
  const makeService = (tournament: any, placements: any[] = [], livePage: any = null) => {
    const prisma = {
      tournament: { findUnique: jest.fn().mockResolvedValue(tournament) },
      tournamentPlacement: {
        findMany: jest.fn().mockResolvedValue(placements),
        count: jest.fn().mockResolvedValue(placements.length),
      },
    };
    const store = { getPage: jest.fn().mockResolvedValue(livePage) };
    return { service: new LeaderboardService(prisma as any, store as any), prisma, store };
  };

  it('throws 404 for an unknown tournament', async () => {
    const { service } = makeService(null);
    await expect(service.getPage('nope', 0, 20)).rejects.toThrow(NotFoundException);
  });

  it('serves the live Redis leaderboard while the tournament is ACTIVE', async () => {
    const { service, store } = makeService(
      { id: 't1', status: 'ACTIVE' },
      [],
      {
        total: 3,
        entries: [
          { rank: 2, playerId: 'b', score: 400 },
          { rank: 3, playerId: 'c', score: 100 },
        ],
      },
    );

    const page = await service.getPage('t1', 1, 2);
    expect(store.getPage).toHaveBeenCalledWith('t1', 1, 2);
    expect(page.source).toBe('live');
    expect(page.total).toBe(3);
    expect(page.entries.map((e) => e.playerId)).toEqual(['b', 'c']);
  });

  it('serves persisted placements once FINALIZED', async () => {
    const { service, prisma, store } = makeService(
      { id: 't1', status: 'FINALIZED' },
      [
        { rank: 1, playerId: 'a', score: 500 },
        { rank: 2, playerId: 'b', score: 400 },
      ],
    );

    const page = await service.getPage('t1', 0, 20);
    expect(store.getPage).not.toHaveBeenCalled();
    expect(prisma.tournamentPlacement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );
    expect(page.source).toBe('final');
    expect(page.entries).toEqual([
      { rank: 1, playerId: 'a', score: 500 },
      { rank: 2, playerId: 'b', score: 400 },
    ]);
  });
});
