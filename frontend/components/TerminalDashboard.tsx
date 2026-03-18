import { useState, useEffect, useRef } from 'react';
import ClientKanbanBoard from './client/ClientKanbanBoard';
import PipelineSnapshot from './terminal/PipelineSnapshot';
import TopRevenueContributors from './terminal/TopRevenueContributors';
import CashCollectedAndMRR from './terminal/CashCollectedAndMRR';
import FailedPaymentQueue from './terminal/FailedPaymentQueue';
import LeadsBySource from './terminal/LeadsBySource';
import BookingRateByFunnel from './terminal/BookingRateByFunnel';
import NotificationsCard from './calendar/NotificationsCard';
import { useLoading } from '@/contexts/LoadingContext';
import { apiClient } from '@/lib/api';
import { invalidateStripeAndTerminalAfterWebhook, TERMINAL_STRIPE_UPDATED_KEY, STRIPE_DATA_UPDATED_EVENT } from '@/lib/cache';
import type { TerminalSummaryForWidgets } from '@/types/integration';

// Keys that must be loaded before we hide the global overlay (above-the-fold only)
const ABOVE_THE_FOLD_KEYS = ['topRevenue', 'cashCollected', 'notifications', 'failedPayments'];

export default function TerminalDashboard() {
  const [filteredColumn, setFilteredColumn] = useState<string | null>(null);
  const { setLoading: setGlobalLoading } = useLoading();
  const [showBelowFold, setShowBelowFold] = useState(false);
  const [terminalSummary, setTerminalSummary] = useState<TerminalSummaryForWidgets | null>(null);
  const [terminalSummarySettled, setTerminalSummarySettled] = useState(false);
  const [componentLoadingStates, setComponentLoadingStates] = useState<Record<string, boolean>>({
    topRevenue: true,
    cashCollected: true,
    pipeline: true,
    kanban: true,
    notifications: true,
    failedPayments: true,
    leadsBySource: true,
    bookingRate: true,
  });
  const loadingInitialized = useRef(false);
  const allLoadedRef = useRef(false);

  // Set loading to true only once when component mounts
  useEffect(() => {
    if (!loadingInitialized.current) {
      setGlobalLoading(true, 'Loading Terminal dashboard...');
      loadingInitialized.current = true;
    }
  }, [setGlobalLoading]);

  // Check if Stripe was updated by webhook; only invalidate when necessary so tab switch uses cache (no loading)
  const checkStripeUpdatedAndRefetchIfNeeded = async () => {
    try {
      const { last_updated } = await apiClient.getStripeLastUpdated();
      if (typeof window === 'undefined' || !last_updated) return false;
      const stored = sessionStorage.getItem(TERMINAL_STRIPE_UPDATED_KEY);
      if (stored && stored >= last_updated) return false; // No new webhook → keep cache
      invalidateStripeAndTerminalAfterWebhook(last_updated);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(STRIPE_DATA_UPDATED_EVENT));
      }
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
        const hasCash = (summary?.cash_collected && (summary.cash_collected.today > 0 || summary.cash_collected.last_7_days > 0 || summary.cash_collected.last_30_days > 0)) || (summary?.mrr?.current_mrr ?? 0) > 0;
        const hasContributors = (summary?.top_contributors_30d?.length ?? 0) > 0 || (summary?.top_contributors_90d?.length ?? 0) > 0;
        if (hasCash || hasContributors) {
          setComponentLoadingStates(prev => ({
            ...prev,
            ...(prev.cashCollected !== false ? { cashCollected: false } : {}),
            ...(prev.topRevenue !== false ? { topRevenue: false } : {}),
          }));
        }
      } catch {
        if (!cancelled) setTerminalSummary(null);
      } finally {
        if (!cancelled) setTerminalSummarySettled(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll while Terminal is visible so new payments show without refresh
  const STRIPE_POLL_MS = 45000;
  useEffect(() => {
    const interval = setInterval(async () => {
      const hadUpdate = await checkStripeUpdatedAndRefetchIfNeeded();
      if (!hadUpdate) return;
      try {
        const summary = await apiClient.getTerminalSummary(true);
        setTerminalSummary(summary ?? null);
        setComponentLoadingStates(prev => ({
          ...prev,
          cashCollected: false,
          topRevenue: false,
        }));
      } catch {
        // keep existing data
      }
    }, STRIPE_POLL_MS);
    return () => clearInterval(interval);
  }, []);

  // Mount below-the-fold widgets after a short delay to stagger API calls and speed up first paint
  useEffect(() => {
    const t = setTimeout(() => setShowBelowFold(true), 150);
    return () => clearTimeout(t);
  }, []);

  // Turn off global loading when above-the-fold components are loaded (below-fold load in background)
  useEffect(() => {
    const aboveFoldLoaded = ABOVE_THE_FOLD_KEYS.every(k => componentLoadingStates[k] === false);
    if (aboveFoldLoaded && !allLoadedRef.current) {
      allLoadedRef.current = true;
      setTimeout(() => setGlobalLoading(false), 200);
    }
  }, [componentLoadingStates, setGlobalLoading]);

  const handleComponentLoaded = (componentName: string) => {
    setComponentLoadingStates(prev => {
      // Only update if this component hasn't already reported as loaded
      if (prev[componentName] === false) {
        return prev; // Already loaded, don't update
      }
      return {
        ...prev,
        [componentName]: false,
      };
    });
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      <div className="flex items-center justify-between">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Terminal</h2>
      </div>

      {/* Top Metrics Row */}
      <details open className="group">
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-200/30 dark:border-white/15 bg-white/5 dark:bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 transition-colors">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/15 text-blue-200 dark:text-blue-300">
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
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

      {/* Revenue Contributors & Failed Payment Queue Row */}
      <details open className="group">
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-200/30 dark:border-white/15 bg-white/5 dark:bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 transition-colors">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/15 text-blue-200 dark:text-blue-300">
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
            Revenue & Failures
          </span>
        </summary>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Top 5 Revenue Contributors */}
          <TopRevenueContributors
            initialSummary={terminalSummary}
            initialSummarySettled={terminalSummarySettled}
            onLoadComplete={() => handleComponentLoaded('topRevenue')}
          />

          {/* Failed Payment Queue */}
          <FailedPaymentQueue onLoadComplete={() => handleComponentLoaded('failedPayments')} />
        </div>
      </details>

      {/* Below-the-fold: mount after short delay to stagger requests and improve perceived speed */}
      {showBelowFold && (
        <>
          {/* Leads/Booking metrics above Pipeline Snapshot */}
          <details open className="group">
            <summary className="cursor-pointer select-none list-none flex items-center gap-2 py-2 px-3 rounded-lg border border-gray-200/30 dark:border-white/15 bg-white/5 dark:bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 transition-colors">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-blue-500/15 text-blue-200 dark:text-blue-300">
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
                Leads & Booking
              </span>
            </summary>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <LeadsBySource onLoadComplete={() => handleComponentLoaded('leadsBySource')} />
              <BookingRateByFunnel onLoadComplete={() => handleComponentLoaded('bookingRate')} />
            </div>
          </details>

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

