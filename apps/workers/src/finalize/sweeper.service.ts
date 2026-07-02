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
 * Safety net: finds overdue ACTIVE tournaments and re-drives their finalize
 * job if it was lost (Redis flush, worker down) or exhausted its retries.
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

    let reenqueued = 0;
    for (const { id } of overdue) {
      // one bad job must not abort the rest of the sweep
      try {
        if (await this.reenqueue(id)) reenqueued++;
      } catch (err) {
        this.logger.warn(`Sweeper could not re-enqueue ${id}: ${(err as Error).message}`);
      }
    }

    if (reenqueued > 0) {
      this.logger.log(`Sweeper re-enqueued ${reenqueued} overdue tournament(s)`);
    }
  }

  // BullMQ's add() is a silent no-op while any job holds the same jobId — a
  // failed job (kept by removeOnFail: false) must be retry()'d, not re-added.
  private async reenqueue(id: string): Promise<boolean> {
    const jobId = finalizeJobId(id);
    const existing = await this.queue.getJob(jobId);
    const state = existing ? await existing.getState() : null;

    if (state === 'failed') {
      await existing!.retry();
      return true;
    }
    if (!existing) {
      await this.queue.add(FINALIZE_JOB, { tournamentId: id } satisfies FinalizeJobData, {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      });
      return true;
    }
    return false; // active/waiting/delayed/completed — a run is pending or done
  }
}
