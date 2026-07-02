import { LeaderboardStore } from './leaderboard.store';

function makeStore(zrangeResult: string[] = [], zcardResult = 0) {
  const redis = {
    defineCommand: jest.fn(),
    zrange: jest.fn().mockResolvedValue(zrangeResult),
    zcard: jest.fn().mockResolvedValue(zcardResult),
  };
  return { store: new LeaderboardStore(redis as any), redis };
}

describe('LeaderboardStore', () => {
  it('computes ranks from the page offset', async () => {
    const { store } = makeStore(['b', '500', 'a', '250'], 5);

    const { total, entries } = await store.getPage('t1', 2, 2);
    expect(total).toBe(5);
    expect(entries).toEqual([
      { rank: 3, playerId: 'b', score: 500 },
      { rank: 4, playerId: 'a', score: 250 },
    ]);
  });

  it('requests the correct ZSET slice, highest scores first', async () => {
    const { store, redis } = makeStore();
    await store.getPage('t1', 10, 20);
    expect(redis.zrange).toHaveBeenCalledWith('t:{t1}:lb', 10, 29, 'REV', 'WITHSCORES');
  });

  it('breaks score ties by playerId for deterministic final standings', async () => {
    const { store } = makeStore(['zed', '300', 'amy', '300', 'top', '900']);

    const standings = await store.getAll('t1');
    expect(standings).toEqual([
      { playerId: 'top', score: 900 },
      { playerId: 'amy', score: 300 },
      { playerId: 'zed', score: 300 },
    ]);
  });
});
