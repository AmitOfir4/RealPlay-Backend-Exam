import { Injectable } from '@nestjs/common';
import { LeaderboardStore } from '../../../../libs/shared/src/leaderboard/leaderboard.store';
import { PrismaService } from '../../../../libs/shared/src/prisma/prisma.service';
import { IngestBetDto } from './dto/ingest-bet.dto';

export interface BetIngestionResult {
  externalBetId: string;
  results: Array<{ tournamentId: string; accepted: boolean; duplicate: boolean }>;
}

@Injectable()
export class BetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardStore,
  ) {}

  async ingest(dto: IngestBetDto): Promise<BetIngestionResult> {
    const createdAt = new Date(dto.createdAt);

    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: 'ACTIVE',
        startsAt: { lte: createdAt },
        endsAt: { gte: createdAt },
      },
      select: { id: true },
    });

    if (tournaments.length === 0) {
      return { externalBetId: dto.externalBetId, results: [] };
    }

    await this.prisma.bet.createMany({
      data: tournaments.map((t) => ({
        tournamentId: t.id,
        externalBetId: dto.externalBetId,
        playerId: dto.playerId,
        amount: dto.amount,
        currency: dto.currency,
        createdAt,
      })),
      skipDuplicates: true,
    });

    // Applied even when the insert was skipped as a duplicate: heals a crash
    // that happened between the Postgres write and the Redis update.
    const applied = await this.leaderboard.applyBets(
      tournaments.map((t) => ({
        tournamentId: t.id,
        externalBetId: dto.externalBetId,
        playerId: dto.playerId,
        amount: dto.amount,
      })),
    );

    return {
      externalBetId: dto.externalBetId,
      results: tournaments.map((t, i) => ({
        tournamentId: t.id,
        accepted: applied[i],
        duplicate: !applied[i],
      })),
    };
  }
}
