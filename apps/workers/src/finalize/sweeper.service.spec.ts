import { SweeperService } from './sweeper.service';
import { finalizeJobId } from '../../../../libs/shared/src/queue/queue.constants';

type FakeJob = { getState: jest.Mock; retry: jest.Mock };

function fakeJob(state: string): FakeJob {
  return { getState: jest.fn().mockResolvedValue(state), retry: jest.fn().mockResolvedValue(undefined) };
}

function makeSweeper(overdueIds: string[], jobsById: Record<string, FakeJob | null>) {
  const prisma = {
    tournament: { findMany: jest.fn().mockResolvedValue(overdueIds.map((id) => ({ id }))) },
  };
  const queue = {
    getJob: jest.fn((jobId: string) => Promise.resolve(jobsById[jobId] ?? null)),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const sweeper = new SweeperService(prisma as any, queue as any);
  return { sweeper, queue };
}

describe('SweeperService.sweep', () => {
  it('retries a finalize job that exhausted its attempts (failed) instead of re-adding', async () => {
    const job = fakeJob('failed');
    const { sweeper, queue } = makeSweeper(['t1'], { [finalizeJobId('t1')]: job });

    await sweeper.sweep();

    expect(job.retry).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('re-adds a lost job (none present) so a Redis flush still finalizes', async () => {
    const { sweeper, queue } = makeSweeper(['t1'], { [finalizeJobId('t1')]: null });

    await sweeper.sweep();

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledWith(
      'finalize',
      { tournamentId: 't1' },
      expect.objectContaining({ jobId: finalizeJobId('t1') }),
    );
  });

  it.each(['active', 'waiting', 'delayed', 'completed'])(
    'leaves a job that is already %s alone',
    async (state) => {
      const job = fakeJob(state);
      const { sweeper, queue } = makeSweeper(['t1'], { [finalizeJobId('t1')]: job });

      await sweeper.sweep();

      expect(job.retry).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    },
  );

  it('isolates a per-tournament failure so the rest of the sweep still runs', async () => {
    const bad = fakeJob('failed');
    bad.retry.mockRejectedValueOnce(new Error('redis blip'));
    const { sweeper, queue } = makeSweeper(['t1', 't2'], {
      [finalizeJobId('t1')]: bad,
      [finalizeJobId('t2')]: null,
    });

    await expect(sweeper.sweep()).resolves.toBeUndefined();

    // t1 threw, but t2 was still re-added
    expect(queue.add).toHaveBeenCalledWith(
      'finalize',
      { tournamentId: 't2' },
      expect.objectContaining({ jobId: finalizeJobId('t2') }),
    );
  });
});
