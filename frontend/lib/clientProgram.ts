import type { Client } from '@/types/client';

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
