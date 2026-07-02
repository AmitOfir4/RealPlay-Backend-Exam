export const TOURNAMENTS_QUEUE = 'tournaments';

export const FINALIZE_JOB = 'finalize';
export const SWEEP_JOB = 'sweep';

// Delay after endsAt before the snapshot runs, absorbing slightly-late bet
// events and clock skew between API and workers.
export const FINALIZE_GRACE_MS = 5_000;

// How often the sweeper looks for overdue ACTIVE tournaments whose finalize
// job was lost (e.g. Redis flush) or whose worker was down at fire time.
export const SWEEP_EVERY_MS = 60_000;

export interface FinalizeJobData {
  tournamentId: string;
}

// BullMQ forbids ':' in custom job ids
export const finalizeJobId = (tournamentId: string) => `finalize-${tournamentId}`;
