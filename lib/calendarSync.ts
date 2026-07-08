import { apiClient } from '@/lib/api';
import { MIN_CALENDAR_CHECKIN_SYNC_GAP_MS } from '@/lib/calendarPollConstants';

/** Serialize check-in syncs so Terminal refresh and calendar context do not hammer the API/DB. */
let syncChain: Promise<void> = Promise.resolve();
let syncInFlight = false;
let lastCalendarSyncFinishedAt = 0;

export function isCalendarCheckInSyncInFlight(): boolean {
  return syncInFlight;
}

export function runCalendarCheckInSync(opts?: {
  applyPipelineRules?: boolean;
  force?: boolean;
}): Promise<void> {
  const force = opts?.force === true;
  if (!force && Date.now() - lastCalendarSyncFinishedAt < MIN_CALENDAR_CHECKIN_SYNC_GAP_MS) {
    return syncChain;
  }

  const task = async () => {
    syncInFlight = true;
    try {
      await apiClient.syncCheckIns(
        opts?.applyPipelineRules === false ? { applyPipelineRules: false } : undefined
      );
      lastCalendarSyncFinishedAt = Date.now();
    } finally {
      syncInFlight = false;
    }
  };

  const run = syncChain.then(() => task());
  // Keep the chain alive for later callers, but surface errors to the current caller.
  syncChain = run.catch(() => {});
  return run;
}
