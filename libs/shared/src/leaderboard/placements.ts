export interface PlacementRow {
  playerId: string;
  score: number;
  rank: number;
}

/**
 * Assigns final ranks from sorted standings using standard competition
 * ranking ("1224"): tied scores share a rank, and the next distinct score
 * skips past them. Input must already be sorted score DESC.
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
