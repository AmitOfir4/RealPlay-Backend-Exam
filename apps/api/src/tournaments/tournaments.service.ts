import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import { Tournament } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  FINALIZE_GRACE_MS,
  FINALIZE_JOB,
  FinalizeJobData,
  finalizeJobId,
  TOURNAMENTS_QUEUE,
} from '../../../../libs/shared/src/queue/queue.constants';
import { PrismaService } from '../../../../libs/shared/src/prisma/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TOURNAMENTS_QUEUE) private readonly queue: Queue,
  ) {}

  async create(dto: CreateTournamentDto): Promise<Tournament> {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be after startsAt');
    }

    const tournament = await this.prisma.tournament.create({
      data: { name: dto.name, startsAt, endsAt },
    });

    // Snapshot job fires shortly after endsAt. jobId is deterministic so a
    // re-enqueue (e.g. by the sweeper) can never schedule it twice while one
    // is pending; the processor itself is idempotent as a second line of defense.
    const delay = Math.max(0, endsAt.getTime() - Date.now() + FINALIZE_GRACE_MS);
    await this.queue.add(
      FINALIZE_JOB,
      { tournamentId: tournament.id } satisfies FinalizeJobData,
      {
        jobId: finalizeJobId(tournament.id),
        delay,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1000,
        removeOnFail: false,
      },
    );

    return tournament;
  }

  findById(id: string): Promise<Tournament | null> {
    return this.prisma.tournament.findUnique({ where: { id } });
  }

  /** Paginated list of ACTIVE (not yet finalized) tournaments, newest first. */
  async listActive(
    offset: number,
    limit: number,
  ): Promise<{ total: number; limit: number; offset: number; items: Tournament[] }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tournament.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.tournament.count({ where: { status: 'ACTIVE' } }),
    ]);
    return { total, limit, offset, items };
  }
}
