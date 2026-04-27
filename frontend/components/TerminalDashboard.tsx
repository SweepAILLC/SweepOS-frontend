import { useState, useEffect, useRef } from 'react';
import ClientKanbanBoard from './client/ClientKanbanBoard';
import PipelineSnapshot from './terminal/PipelineSnapshot';
import CashCollectedAndMRR from './terminal/CashCollectedAndMRR';
import FailedPaymentQueue from './terminal/FailedPaymentQueue';
import LeadsBySource from './terminal/LeadsBySource';
import NotificationsCard from './calendar/NotificationsCard';
import { useLoading } from '@/contexts/LoadingContext';
import { apiClient } from '@/lib/api';
import { invalidateStripeAndTerminalAfterWebhook, getSeenStripeDataMs, STRIPE_DATA_UPDATED_EVENT } from '@/lib/cache';
import type { TerminalSummaryForWidgets } from '@/types/integration';

export default function TerminalDashboard() {
  const [filteredColumn, setFilteredColumn] = useState<string | null>(null);
  const { setLoading: setGlobalLoading } = useLoading();
  const [showBelowFold, setShowBelowFold] = useState(true);
  const [terminalSummary, setTerminalSummary] = useState<TerminalSummaryForWidgets | null>(null);
  const [terminalSummarySettled, setTerminalSummarySettled] = useState(false);

  // Background Stripe sync so payments/clients arrive without manual clicks.
  // Webhooks are best, but this is a safety net for missed webhooks/local dev.
  const stripeSyncInFlightRef = useRef(false);
  const STRIPE_AUTO_SYNC_MS = 5 * 60 * 1000;

  // The app's tab switch sets a global "Switching tabs..." loading overlay.
  // Clear it immediately on Terminal mount so the user can interact right away.
  useEffect(() => {
    setGlobalLoading(false);
  }, [setGlobalLoading]);

  // Only invalidate when server data version (ms) is newer than what we've seen (webhook or sync)
  const checkStripeUpdatedAndRefetchIfNeeded = async (): Promise<boolean> => {
    try {
      const { last_updated_ms } = await apiClient.getStripeLastUpdated();
      if (typeof window === 'undefined' || last_updated_ms == null) return false;
      if (getSeenStripeDataMs() >= last_updated_ms) return false;
      invalidateStripeAndTerminalAfterWebhook(last_updated_ms);
      window.dispatchEvent(new CustomEvent(STRIPE_DATA_UPDATED_EVENT));
      return true;
    } catch {
      return false;
    }
  };

  // Single flow on mount: check webhook, then load terminal summary (use cache if no webhook update = no loading delay)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hadWebhookUpdate = await checkStripeUpdatedAndRefetchIfNeeded();
        const summary = await apiClient.getTerminalSummary(hadWebhookUpdate);
        if (cancelled) return;
        setTerminalSummary(summary ?? null);
      } catch {
        if (!cancelled) setTerminalSummary(null);
      } finally {
        if (!cancelled) setTerminalSummarySettled(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runDebouncedStripeRefetch = () => {
    if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    refetchDebounceRef.current = setTimeout(async () => {
      refetchDebounceRef.current = null;
      const hadUpdate = await checkStripeUpdatedAndRefetchIfNeeded();
      if (!hadUpdate) return;
      try {
        const summary = await apiClient.getTerminalSummary(true);
        setTerminalSummary(summary ?? null);
        // No global overlay: individual widgets handle their own loading.
      } catch {
        /* keep existing */
      }
    }, 1800);
  };

  // Poll lightly; debounce refetch so bursts of webhooks = one reload
  const STRIPE_POLL_MS = 90000;
  useEffect(() => {
    const interval = setInterval(() => runDebouncedStripeRefetch(), STRIPE_POLL_MS);
    return () => {
      clearInterval(interval);
      if (refetchDebounceRef.current) clearTimeout(refetchDebounceRef.current);
    };
  }, []);

  // Auto sync Stripe on an interval when connected.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled || stripeSyncInFlightRef.current) return;
      try {
        const status = await apiClient.getStripeStatus(false);
        if (!status?.connected) return;
        stripeSyncInFlightRef.current = true;
        await apiClient.syncStripeData(false, true);
        // Sync should advance last_updated marker; immediately refetch terminal summary.
        const hadUpdate = await checkStripeUpdatedAndRefetchIfNeeded();
        if (hadUpdate) {
          const summary = await apiClient.getTerminalSummary(true);
          if (!cancelled) setTerminalSummary(summary ?? null);
        }
      } catch {
        /* keep */
      } finally {
        stripeSyncInFlightRef.current = false;
      }
    };
    // First tick shortly after mount (avoid racing initial summary load)
    const t0 = setTimeout(tick, 2500);
    const interval = setInterval(tick, STRIPE_AUTO_SYNC_MS);
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') runDebouncedStripeRefetch();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // No global loading overlay; let each widget manage its own loading state/spinner.
  const handleComponentLoaded = (_componentName: string) => {};

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate min-w-0">
          Terminal
        </h2>
      </div>

      {/* Top Metrics Row */}
      <details open className="group">
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 py-1 min-w-0">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-blue-200 bg-blue-100 text-blue-700 shadow-sm hover:bg-blue-200 dark:border-blue-400/35 dark:bg-blue-500/20 dark:text-blue-200 dark:shadow-none dark:hover:bg-blue-500/30 transition-colors">
            <svg
              className="w-4 h-4 transition-transform group-open:rotate-180"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Top Metrics
          </span>
        </summary>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
          {/* Calendar Notifications (includes sales close rate in the small stat row) */}
          <NotificationsCard onLoadComplete={() => handleComponentLoaded('notifications')} />

          {/* Cash Collected & Current MRR */}
          <CashCollectedAndMRR
            initialSummary={terminalSummary}
            initialSummarySettled={terminalSummarySettled}
            onLoadComplete={() => handleComponentLoaded('cashCollected')}
          />
        </div>
      </details>

      {/* Failed payments + leads (one collapsible, side by side on large screens) */}
      <details open className="group">
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 py-1 min-w-0">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-blue-200 bg-blue-100 text-blue-700 shadow-sm hover:bg-blue-200 dark:border-blue-400/35 dark:bg-blue-500/20 dark:text-blue-200 dark:shadow-none dark:hover:bg-blue-500/30 transition-colors">
            <svg
              className="w-4 h-4 transition-transform group-open:rotate-180"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Failed payments &amp; leads
          </span>
        </summary>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 min-w-0">
          <FailedPaymentQueue onLoadComplete={() => handleComponentLoaded('failedPayments')} />
          <LeadsBySource onLoadComplete={() => handleComponentLoaded('leadsBySource')} />
        </div>
      </details>

      {/* Below-the-fold: pipeline + kanban */}
      {showBelowFold && (
        <>
          {/* Pipeline Snapshot */}
          <PipelineSnapshot 
            onFilterChange={setFilteredColumn}
            onLoadComplete={() => handleComponentLoaded('pipeline')}
          />

          {/* Kanban Board */}
          <div className="mt-4 sm:mt-6 min-w-0">
            <ClientKanbanBoard 
              filteredColumn={filteredColumn}
              onLoadComplete={() => handleComponentLoaded('kanban')}
            />
          </div>
        </>
      )}
    </div>
  );
}

