export interface PlacementRow {
  playerId: string;
  score: number;
  rank: number;
}

/**
 * Competition ranking ("1224"): ties share a rank, the next distinct score
 * skips past them. Input must be sorted score DESC.
 */
export function computePlacements(
  standings: Array<{ playerId: string; score: number }>,
): PlacementRow[] {
  const placements: PlacementRow[] = [];
  for (let i = 0; i < standings.length; i++) {
    const { playerId, score } = standings[i];
    const rank = i > 0 && score === placements[i - 1].score ? placements[i - 1].rank : i + 1;
    placements.push({ playerId, score, rank });
  }
  return placements;
}
