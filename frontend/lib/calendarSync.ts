import { apiClient } from '@/lib/api';

/** Serialize check-in syncs so Terminal refresh and calendar context do not hammer the API/DB. */
let syncChain: Promise<void> = Promise.resolve();
let syncInFlight = false;

export function isCalendarCheckInSyncInFlight(): boolean {
  return syncInFlight;
}

export function runCalendarCheckInSync(opts?: { applyPipelineRules?: boolean }): Promise<void> {
  const task = async () => {
    syncInFlight = true;
    try {
      await apiClient.syncCheckIns(
        opts?.applyPipelineRules === false ? { applyPipelineRules: false } : undefined
      );
    } finally {
      syncInFlight = false;
    }
  };

  syncChain = syncChain.then(task).catch(() => {});
  return syncChain;
}
