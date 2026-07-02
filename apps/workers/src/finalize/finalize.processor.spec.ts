import { FinalizeProcessor } from './finalize.processor';

function makeProcessor(tournament: any, grouped: any[] = []) {
  const createMany = jest.fn().mockReturnValue('createMany-op');
  const groupBy = jest.fn().mockResolvedValue(grouped);
  const prisma = {
    tournament: {
      findUnique: jest.fn().mockResolvedValue(tournament),
      update: jest.fn().mockReturnValue('update-op'),
    },
    bet: { groupBy },
    tournamentPlacement: {
      deleteMany: jest.fn().mockReturnValue('delete-op'),
      createMany,
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  const leaderboard = { expire: jest.fn().mockResolvedValue(undefined) };
  const sweeper = { sweep: jest.fn() };
  const processor = new FinalizeProcessor(prisma as any, leaderboard as any, sweeper as any);
  return { processor, prisma, groupBy, createMany, leaderboard };
}

describe('FinalizeProcessor', () => {
  it('aggregates standings from Postgres (not Redis) and writes competition ranks', async () => {
    // p1/p2 tie at 300, ordered as the query returns them
    const { processor, groupBy, createMany, leaderboard } = makeProcessor(
      { id: 't1', status: 'ACTIVE' },
      [
        { playerId: 'p1', _sum: { amount: 300 } },
        { playerId: 'p2', _sum: { amount: 300 } },
        { playerId: 'p3', _sum: { amount: 100 } },
      ],
    );

    await processor.finalizeTournament('t1');

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['playerId'], where: { tournamentId: 't1' } }),
    );
    expect(createMany).toHaveBeenCalledWith({
      data: [
        { tournamentId: 't1', playerId: 'p1', score: 300, rank: 1 },
        { tournamentId: 't1', playerId: 'p2', score: 300, rank: 1 },
        { tournamentId: 't1', playerId: 'p3', score: 100, rank: 3 },
      ],
    });
    expect(leaderboard.expire).toHaveBeenCalledWith('t1', expect.any(Number));
  });

  it('is a no-op when the tournament is already FINALIZED', async () => {
    const { processor, groupBy, createMany } = makeProcessor({ id: 't1', status: 'FINALIZED' });

    await processor.finalizeTournament('t1');

    expect(groupBy).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('skips a tournament that no longer exists', async () => {
    const { processor, groupBy } = makeProcessor(null);

    await processor.finalizeTournament('gone');

    expect(groupBy).not.toHaveBeenCalled();
  });
});
