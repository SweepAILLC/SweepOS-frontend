import { apiClient } from '@/lib/api';
import { runCalendarCheckInSync } from '@/lib/calendarSync';
import { normalizeLifecycleColumn } from '@/lib/pipelineColumns';
import { setPipelineClients } from '@/lib/pipelineStore';
import type { Client } from '@/types/client';
import {
  cache,
  CACHE_KEYS,
  CALENDAR_BOOKINGS_UPDATED_EVENT,
  clearCalendarIntegrationStatusCache,
  getSeenCalendarDataMs,
  getSeenStripeDataMs,
  invalidateStripeAndTerminalAfterWebhook,
  invalidateTerminalAfterCalendarWebhook,
  STRIPE_DATA_UPDATED_EVENT,
  TERMINAL_CHART_REFRESH_EVENT,
  TERMINAL_DATA_REFRESHED_EVENT,
} from '@/lib/cache';

const TERMINAL_SYNC_ON_LOAD_KEY = 'terminalSyncOnLoad';
/** Avoid stacking full syncs when webhook polling fires repeatedly. */
const MIN_AUTO_REFRESH_GAP_MS = 45_000;

let refreshChain: Promise<TerminalRefreshResult> = Promise.resolve({ ok: true });
let lastRefreshFinishedAt = 0;
let refreshInFlight = false;

export function isTerminalRefreshInFlight(): boolean {
  return refreshInFlight;
}

export function isTerminalSyncOnLoadPending(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  return sessionStorage.getItem(TERMINAL_SYNC_ON_LOAD_KEY) === '1';
}

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
  cache.deleteByPrefix('performance_snapshot_');
  cache.deleteByPrefix('outreach_inbox_');
  cache.deleteByPrefix('stripe_');
}

function notifyTerminalWidgetsRefreshed(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STRIPE_DATA_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent(CALENDAR_BOOKINGS_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent(TERMINAL_DATA_REFRESHED_EVENT));
}

/** After KPI refresh finishes — bust trend cache and tell the unified chart to refetch. */
export function notifyTerminalChartsRefreshed(): void {
  cache.delete(CACHE_KEYS.TERMINAL_MONTHLY_TRENDS);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TERMINAL_CHART_REFRESH_EVENT));
}

function notifyStripeDataChanged(seenMs: number): void {
  invalidateStripeAndTerminalAfterWebhook(seenMs);
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(STRIPE_DATA_UPDATED_EVENT));
  window.dispatchEvent(new CustomEvent(TERMINAL_DATA_REFRESHED_EVENT));
}

/** Poll after Stripe webhook — invalidate caches and notify widgets even when full sync is rate-limited. */
export async function checkStripeWebhookAndRefresh(): Promise<boolean> {
  try {
    const { last_updated_ms } = await apiClient.getStripeLastUpdated();
    if (last_updated_ms == null || getSeenStripeDataMs() >= last_updated_ms) return false;
    notifyStripeDataChanged(last_updated_ms);
    return true;
  } catch {
    return false;
  }
}

/** Poll after Cal.com / Calendly webhook — DB already has the row; no provider pull needed. */
export async function checkCalendarWebhookAndRefresh(): Promise<boolean> {
  try {
    const { last_updated_ms } = await apiClient.getCalendarLastUpdated();
    if (last_updated_ms == null || getSeenCalendarDataMs() >= last_updated_ms) return false;
    invalidateTerminalAfterCalendarWebhook(last_updated_ms);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CALENDAR_BOOKINGS_UPDATED_EVENT));
      window.dispatchEvent(new CustomEvent(TERMINAL_DATA_REFRESHED_EVENT));
    }
    return true;
  } catch {
    return false;
  }
}

async function executeTerminalRefresh(): Promise<TerminalRefreshResult> {
  refreshInFlight = true;
  try {
  const result: TerminalRefreshResult = { ok: true };
  invalidateTerminalCaches();

  const [stripeStatus, whopStatus, calcom, calendly] = await Promise.all([
    apiClient.getStripeStatus(true).catch(() => ({ connected: false })),
    apiClient.getWhopStatus(true).catch(() => ({ connected: false })),
    apiClient.getCalComStatus().catch(() => ({ connected: false })),
    apiClient.getCalendlyStatus().catch(() => ({ connected: false })),
  ]);

  if (calcom?.connected || calendly?.connected) {
    try {
      await runCalendarCheckInSync({ applyPipelineRules: false, force: true });
      result.calendar = true;
      try {
        const { last_updated_ms } = await apiClient.getCalendarLastUpdated();
        if (last_updated_ms != null) invalidateTerminalAfterCalendarWebhook(last_updated_ms);
      } catch {
        cache.deleteByPrefix('calendar_trend_summary_');
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CALENDAR_BOOKINGS_UPDATED_EVENT));
      }
    } catch {
      result.calendar = false;
      result.ok = false;
    }
  }

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
  } finally {
    refreshInFlight = false;
  }
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
