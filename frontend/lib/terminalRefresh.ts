import { apiClient } from '@/lib/api';
import { normalizeLifecycleColumn } from '@/lib/pipelineColumns';
import { setPipelineClients } from '@/lib/pipelineStore';
import type { Client } from '@/types/client';
import {
  cache,
  CACHE_KEYS,
  clearCalendarIntegrationStatusCache,
  invalidateStripeAndTerminalAfterWebhook,
  STRIPE_DATA_UPDATED_EVENT,
  TERMINAL_DATA_REFRESHED_EVENT,
} from '@/lib/cache';

const TERMINAL_SYNC_ON_LOAD_KEY = 'terminalSyncOnLoad';
/** Avoid stacking full syncs when webhook polling fires repeatedly. */
const MIN_AUTO_REFRESH_GAP_MS = 45_000;

let refreshChain: Promise<TerminalRefreshResult> = Promise.resolve({ ok: true });
let lastRefreshFinishedAt = 0;

export type TerminalRefreshReason = 'manual' | 'new_session' | 'webhook';

export interface TerminalRefreshResult {
  ok: boolean;
  stripe?: boolean;
  whop?: boolean;
  calendar?: boolean;
  error?: string;
}

/** Set after login so Terminal runs a full sync once per session. */
export function markTerminalSyncOnLoad(): void {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(TERMINAL_SYNC_ON_LOAD_KEY, '1');
  }
}

export function consumeTerminalSyncOnLoad(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  if (sessionStorage.getItem(TERMINAL_SYNC_ON_LOAD_KEY) !== '1') return false;
  sessionStorage.removeItem(TERMINAL_SYNC_ON_LOAD_KEY);
  return true;
}

function invalidateTerminalCaches(): void {
  cache.delete(CACHE_KEYS.TERMINAL_SUMMARY);
  cache.delete(CACHE_KEYS.TERMINAL_MONTHLY_TRENDS);
  cache.delete(CACHE_KEYS.TERMINAL_LEADS_BY_SOURCE);
  cache.deleteByPrefix(CACHE_KEYS.FINANCES_SUMMARY);
  cache.deleteByPrefix('stripe_');
}

function notifyTerminalWidgetsRefreshed(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STRIPE_DATA_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent('calendarBookingsUpdated'));
  window.dispatchEvent(new CustomEvent(TERMINAL_DATA_REFRESHED_EVENT));
}

async function executeTerminalRefresh(): Promise<TerminalRefreshResult> {
  const result: TerminalRefreshResult = { ok: true };
  invalidateTerminalCaches();

  const [stripeStatus, whopStatus, calcom, calendly] = await Promise.all([
    apiClient.getStripeStatus(true).catch(() => ({ connected: false })),
    apiClient.getWhopStatus(true).catch(() => ({ connected: false })),
    apiClient.getCalComStatus().catch(() => ({ connected: false })),
    apiClient.getCalendlyStatus().catch(() => ({ connected: false })),
  ]);

  const syncTasks: Promise<void>[] = [];

  if (stripeStatus?.connected) {
    syncTasks.push(
      apiClient
        .syncAndReconcileStripeData(false, true)
        .then(() => {
          result.stripe = true;
        })
        .catch(() => {
          result.stripe = false;
          result.ok = false;
        })
    );
  }

  if (whopStatus?.connected) {
    syncTasks.push(
      apiClient
        .postWhopSync(false)
        .then(() => {
          result.whop = true;
        })
        .catch(() => {
          result.whop = false;
        })
    );
  }

  if (calcom?.connected || calendly?.connected) {
    syncTasks.push(
      apiClient
        .syncCheckIns({ applyPipelineRules: false })
        .then(() => {
          result.calendar = true;
        })
        .catch(() => {
          result.calendar = false;
          result.ok = false;
        })
    );
  }

  await Promise.allSettled(syncTasks);

  try {
    const { last_updated_ms } = await apiClient.getStripeLastUpdated();
    if (last_updated_ms != null) {
      invalidateStripeAndTerminalAfterWebhook(last_updated_ms);
    } else {
      invalidateTerminalCaches();
    }
  } catch {
    invalidateTerminalCaches();
  }

  clearCalendarIntegrationStatusCache();
  notifyTerminalWidgetsRefreshed();

  try {
    const data = (await apiClient.getClients(undefined, true)) as Client[];
    const normalized = data.map((client) => {
      const column = normalizeLifecycleColumn(client.lifecycle_state);
      return column && column !== client.lifecycle_state
        ? { ...client, lifecycle_state: column }
        : client;
    });
    if (normalized.length > 0) setPipelineClients(normalized);
  } catch {
    /* pipeline snapshot keeps last known counts */
  }

  lastRefreshFinishedAt = Date.now();
  return result;
}

/**
 * Sync + reconcile Stripe/Whop payments, pull calendar events, invalidate caches,
 * and notify Terminal widgets to refetch KPIs and charts.
 */
export function runTerminalDataRefresh(options?: {
  reason?: TerminalRefreshReason;
  force?: boolean;
}): Promise<TerminalRefreshResult> {
  const reason = options?.reason ?? 'manual';
  const force = options?.force ?? reason === 'manual';

  if (!force && Date.now() - lastRefreshFinishedAt < MIN_AUTO_REFRESH_GAP_MS) {
    return refreshChain;
  }

  refreshChain = refreshChain
    .then(() => executeTerminalRefresh())
    .catch(
      (e): TerminalRefreshResult => ({
        ok: false,
        error: e instanceof Error ? e.message : 'Refresh failed',
      })
    );

  return refreshChain;
}
