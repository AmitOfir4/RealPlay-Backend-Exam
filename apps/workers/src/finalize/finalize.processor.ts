import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { LeaderboardStore } from '../../../../libs/shared/src/leaderboard/leaderboard.store';
import { computePlacements } from '../../../../libs/shared/src/leaderboard/placements';
import { PrismaService } from '../../../../libs/shared/src/prisma/prisma.service';
import {
  FINALIZE_JOB,
  FinalizeJobData,
  SWEEP_JOB,
  TOURNAMENTS_QUEUE,
} from '../../../../libs/shared/src/queue/queue.constants';
import { SweeperService } from './sweeper.service';

// Live Redis keys stay readable for a day after finalization, then expire.
const FINALIZED_KEYS_TTL_SECONDS = 24 * 60 * 60;

@Processor(TOURNAMENTS_QUEUE)
export class FinalizeProcessor extends WorkerHost {
  private readonly logger = new Logger(FinalizeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leaderboard: LeaderboardStore,
    private readonly sweeper: SweeperService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case FINALIZE_JOB:
        return this.finalizeTournament((job.data as FinalizeJobData).tournamentId);
      case SWEEP_JOB:
        return this.sweeper.sweep();
      default:
        this.logger.warn(`Unknown job ${job.name}`);
    }
  }

  /**
   * Writes final placements and flips the tournament to FINALIZED. Standings
   * are aggregated from the Bet table, not Redis, so a Redis flush can't
   * corrupt the permanent result. Idempotent — safe to retry or double-run.
   */
  async finalizeTournament(tournamentId: string): Promise<void> {
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      this.logger.warn(`Tournament ${tournamentId} not found, skipping finalization`);
      return;
    }
    if (tournament.status === 'FINALIZED') {
      return;
    }

    const grouped = await this.prisma.bet.groupBy({
      by: ['playerId'],
      where: { tournamentId },
      _sum: { amount: true },
      orderBy: [{ _sum: { amount: 'desc' } }, { playerId: 'asc' }],
    });
    const standings = grouped.map((g) => ({ playerId: g.playerId, score: g._sum.amount ?? 0 }));
    const placements = computePlacements(standings);

    await this.prisma.$transaction([
      this.prisma.tournamentPlacement.deleteMany({ where: { tournamentId } }),
      this.prisma.tournamentPlacement.createMany({
        data: placements.map((p) => ({ tournamentId, ...p })),
      }),
      this.prisma.tournament.update({
        where: { id: tournamentId },
        data: { status: 'FINALIZED' },
      }),
    ]);

    await this.leaderboard.expire(tournamentId, FINALIZED_KEYS_TTL_SECONDS);
    this.logger.log(`Finalized tournament ${tournamentId} with ${placements.length} placements`);
  }
}
