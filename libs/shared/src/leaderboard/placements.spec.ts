import { computePlacements } from './placements';

describe('computePlacements', () => {
  it('ranks players by position when scores are distinct', () => {
    expect(
      computePlacements([
        { playerId: 'a', score: 500 },
        { playerId: 'b', score: 250 },
        { playerId: 'c', score: 100 },
      ]),
    ).toEqual([
      { playerId: 'a', score: 500, rank: 1 },
      { playerId: 'b', score: 250, rank: 2 },
      { playerId: 'c', score: 100, rank: 3 },
    ]);
  });

  it('gives tied scores the same rank and skips the next rank (1224)', () => {
    expect(
      computePlacements([
        { playerId: 'a', score: 500 },
        { playerId: 'b', score: 300 },
        { playerId: 'c', score: 300 },
        { playerId: 'd', score: 100 },
      ]),
    ).toEqual([
      { playerId: 'a', score: 500, rank: 1 },
      { playerId: 'b', score: 300, rank: 2 },
      { playerId: 'c', score: 300, rank: 2 },
      { playerId: 'd', score: 100, rank: 4 },
    ]);
  });

  it('handles an empty leaderboard', () => {
    expect(computePlacements([])).toEqual([]);
  });
});
