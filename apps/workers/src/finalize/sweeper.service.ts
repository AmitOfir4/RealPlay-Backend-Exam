import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../../libs/shared/src/prisma/prisma.service';
import {
  FINALIZE_GRACE_MS,
  FINALIZE_JOB,
  FinalizeJobData,
  finalizeJobId,
  SWEEP_EVERY_MS,
  SWEEP_JOB,
  TOURNAMENTS_QUEUE,
} from '../../../../libs/shared/src/queue/queue.constants';

/**
 * Safety net for lost finalize jobs: if the delayed job disappeared (Redis
 * flush) or the worker was down when it fired, tournaments would stay ACTIVE
 * forever. A repeatable sweep finds overdue ACTIVE tournaments and re-enqueues
 * finalization. The deterministic jobId prevents double-scheduling, and the
 * processor's status check makes a double-run harmless anyway.
 */
@Injectable()
export class SweeperService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SweeperService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TOURNAMENTS_QUEUE) private readonly queue: Queue,
  ) {}

  async onApplicationBootstrap() {
    await this.queue.upsertJobScheduler(SWEEP_JOB, { every: SWEEP_EVERY_MS }, { name: SWEEP_JOB });
  }

  async sweep(): Promise<void> {
    const overdue = await this.prisma.tournament.findMany({
      where: {
        status: 'ACTIVE',
        endsAt: { lt: new Date(Date.now() - FINALIZE_GRACE_MS) },
      },
      select: { id: true },
    });

    for (const { id } of overdue) {
      await this.queue.add(
        FINALIZE_JOB,
        { tournamentId: id } satisfies FinalizeJobData,
        {
          jobId: finalizeJobId(id),
          attempts: 5,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: 1000,
          removeOnFail: false,
        },
      );
    }

    if (overdue.length > 0) {
      this.logger.log(`Sweeper re-enqueued ${overdue.length} overdue tournament(s)`);
    }
  }
}
