import { Injectable, NotFoundException } from '@nestjs/common';
import { LeaderboardStore } from '../../../../libs/shared/src/leaderboard/leaderboard.store';
import { PrismaService } from '../../../../libs/shared/src/prisma/prisma.service';

export interface LeaderboardPage {
  tournamentId: string;
  source: 'live' | 'final';
  total: number;
  limit: number;
  offset: number;
  entries: Array<{ rank: number; playerId: string; score: number }>;
}

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: LeaderboardStore,
  ) {}

  async getPage(tournamentId: string, offset: number, limit: number): Promise<LeaderboardPage> {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      throw new NotFoundException(`Tournament ${tournamentId} not found`);
    }

    if (tournament.status === 'FINALIZED') {
      const [placements, total] = await Promise.all([
        this.prisma.tournamentPlacement.findMany({
          where: { tournamentId },
          orderBy: [{ rank: 'asc' }, { playerId: 'asc' }],
          skip: offset,
          take: limit,
        }),
        this.prisma.tournamentPlacement.count({ where: { tournamentId } }),
      ]);
      return {
        tournamentId,
        source: 'final',
        total,
        limit,
        offset,
        entries: placements.map((p) => ({ rank: p.rank, playerId: p.playerId, score: p.score })),
      };
    }

    const { total, entries } = await this.store.getPage(tournamentId, offset, limit);
    return { tournamentId, source: 'live', total, limit, offset, entries };
  }
}
