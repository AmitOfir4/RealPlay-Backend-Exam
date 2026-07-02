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

  /**
   * Idempotent ingestion. Postgres is written first: the unique
   * (tournamentId, externalBetId) insert is the durable decision of whether
   * the bet counts. Redis is then updated through an atomic Lua script whose
   * SADD guard makes the apply step idempotent too — so a crash or retry
   * between the two writes always converges without double-counting.
   */
  async ingest(dto: IngestBetDto): Promise<BetIngestionResult> {
    const createdAt = new Date(dto.createdAt);

    // A bet can count towards every ACTIVE tournament whose window contains
    // it. FINALIZED tournaments no longer accept bets: their placements are
    // already written, so counting late events would silently diverge.
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

    // Durable record + idempotency backstop; duplicates are skipped silently.
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

    // Applied unconditionally (not only for fresh rows): if a previous request
    // crashed after the DB write but before Redis, this replay heals the gap.
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
