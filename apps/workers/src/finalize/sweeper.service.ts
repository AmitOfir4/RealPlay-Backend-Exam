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

    let reenqueued = 0;
    for (const { id } of overdue) {
      // Per-tournament isolation: one bad job must not abort the whole sweep and
      // starve every later overdue tournament this cycle.
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

  /**
   * Re-drives finalization for one overdue tournament, choosing the action by
   * the finalize job's current state. Returns true if it kicked off a run.
   *
   * The deterministic jobId means a lingering job "occupies" the id: BullMQ's
   * `add()` is a silent no-op while a job with that id exists. So a job that
   * exhausted its attempts (state `failed`, kept by removeOnFail: false) would
   * never restart via `add()` alone — it needs an explicit `retry()`.
   */
  private async reenqueue(id: string): Promise<boolean> {
    const jobId = finalizeJobId(id);
    const existing = await this.queue.getJob(jobId);
    const state = existing ? await existing.getState() : null;

    if (state === 'failed') {
      // Exhausted its attempts — actually re-run it (add() would no-op here).
      await existing!.retry();
      return true;
    }
    if (!existing) {
      // Job was lost (e.g. Redis flush) or never scheduled — schedule it fresh.
      await this.queue.add(FINALIZE_JOB, { tournamentId: id } satisfies FinalizeJobData, {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      });
      return true;
    }
    // active | waiting | delayed | completed: a run is already pending or done;
    // the processor's status check makes any eventual run idempotent. Leave it.
    return false;
  }
}
