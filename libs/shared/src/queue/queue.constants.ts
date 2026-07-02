export const TOURNAMENTS_QUEUE = 'tournaments';

export const FINALIZE_JOB = 'finalize';
export const SWEEP_JOB = 'sweep';

// Delay after endsAt before finalization, absorbing late events and clock skew.
export const FINALIZE_GRACE_MS = 5_000;

export const SWEEP_EVERY_MS = 60_000;

export interface FinalizeJobData {
  tournamentId: string;
}

// BullMQ forbids ':' in custom job ids
export const finalizeJobId = (tournamentId: string) => `finalize-${tournamentId}`;
