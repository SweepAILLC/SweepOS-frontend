import type { Client } from '@/types/client';
import { dateInputToFollowUpIso, LEAD_PIPELINE_COLUMNS } from '@/lib/leadFollowUp';

/** True when the client has a start date plus duration or end date (active program timeline). */
export function hasProgramTimeline(client: Pick<Client, 'program_start_date' | 'program_duration_days' | 'program_end_date'>): boolean {
  if (!client.program_start_date) return false;
  return client.program_duration_days != null || Boolean(client.program_end_date);
}

/** Show program progress UI only when a timeline exists and progress is defined. */
export function isProgramProgressVisible(
  client: Pick<Client, 'program_start_date' | 'program_duration_days' | 'program_end_date' | 'program_progress_percent'>,
): boolean {
  if (!hasProgramTimeline(client)) return false;
  return client.program_progress_percent !== undefined && client.program_progress_percent !== null;
}

function dateInputToProgramIso(dateInput: string): string | null {
  const trimmed = dateInput?.trim();
  if (!trimmed) return null;
  return new Date(`${trimmed}T00:00:00`).toISOString();
}

/** Mirrors backend Client.calculate_progress for optimistic board updates. */
export function computeProgramProgressPercent(
  program_start_date: string | null | undefined,
  program_end_date: string | null | undefined,
  program_duration_days: number | null | undefined,
): number | null {
  if (!program_start_date || !program_duration_days) return null;

  const startMs = new Date(program_start_date).getTime();
  if (Number.isNaN(startMs)) return null;

  let endMs: number;
  if (program_end_date) {
    endMs = new Date(program_end_date).getTime();
  } else {
    endMs = startMs + program_duration_days * 24 * 60 * 60 * 1000;
  }
  if (Number.isNaN(endMs)) return null;

  const now = Date.now();
  if (now < startMs) return 0;
  if (now >= endMs) return 100;

  const totalDuration = endMs - startMs;
  if (totalDuration <= 0) return null;
  const progress = ((now - startMs) / totalDuration) * 100;
  return Math.min(100, Math.max(0, progress));
}

/** Resolve program timeline fields from profile date inputs (matches PATCH behavior). */
export function resolveProgramTimelineFromInputs(
  startInput: string,
  endInput: string,
): Pick<Client, 'program_start_date' | 'program_end_date' | 'program_duration_days' | 'program_progress_percent'> {
  const startIso = dateInputToProgramIso(startInput);
  if (!startIso) {
    return {
      program_start_date: undefined,
      program_end_date: undefined,
      program_duration_days: undefined,
      program_progress_percent: undefined,
    };
  }

  const endIso = dateInputToProgramIso(endInput);
  if (!endIso) {
    return {
      program_start_date: startIso,
      program_end_date: undefined,
      program_duration_days: undefined,
      program_progress_percent: undefined,
    };
  }

  const start = new Date(startIso);
  const end = new Date(endIso);
  const durationDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  if (durationDays <= 0) {
    return {
      program_start_date: startIso,
      program_end_date: undefined,
      program_duration_days: undefined,
      program_progress_percent: undefined,
    };
  }

  return {
    program_start_date: startIso,
    program_end_date: endIso,
    program_duration_days: durationDays,
    program_progress_percent: computeProgramProgressPercent(startIso, endIso, durationDays) ?? undefined,
  };
}

export type ClientTimerFormSnapshot = {
  program_start_date: string;
  program_end_date: string;
  follow_up_due_date: string;
};

/** Build a client patch for instant kanban timer/progress updates from drawer form state. */
export function buildOptimisticClientFromTimerFields(
  client: Client,
  snapshot: ClientTimerFormSnapshot,
): Client {
  const next: Client = {
    ...client,
    ...resolveProgramTimelineFromInputs(snapshot.program_start_date, snapshot.program_end_date),
  };

  const isLead = (LEAD_PIPELINE_COLUMNS as readonly string[]).includes(client.lifecycle_state);
  if (isLead) {
    const baseMeta: Record<string, unknown> =
      client.meta && typeof client.meta === 'object' ? { ...client.meta } : {};
    const trimmed = snapshot.follow_up_due_date?.trim();
    if (trimmed) {
      try {
        baseMeta.follow_up_due_at = dateInputToFollowUpIso(trimmed);
      } catch {
        /* keep existing meta on invalid interim input */
      }
    } else {
      delete baseMeta.follow_up_due_at;
    }
    next.meta = baseMeta as Client['meta'];
  }

  return next;
}
