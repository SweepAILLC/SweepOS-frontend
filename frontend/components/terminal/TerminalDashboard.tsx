'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import TerminalUnifiedTrendChart from '@/components/terminal/TerminalUnifiedTrendChart';
import UpcomingAppointmentsList from '@/components/terminal/UpcomingAppointmentsList';
import TerminalKpiRow from '@/components/terminal/TerminalKpiRow';
import TerminalFinanceCollapsibles from '@/components/terminal/TerminalFinanceCollapsibles';
import TerminalBookingsTable from '@/components/terminal/TerminalBookingsTable';
import { PremiumReveal } from '@/components/ui/PremiumMotion';
import { TERMINAL_STAGGER } from '@/lib/premiumMotion';
import { TerminalCalendarProvider } from '@/contexts/TerminalCalendarContext';
import { TerminalTimeRangeProvider } from '@/contexts/TerminalTimeRangeContext';
import { useLoading } from '@/contexts/LoadingContext';
import { apiClient } from '@/lib/api';
import { getSeenStripeDataMs } from '@/lib/cache';
import {
  consumeTerminalSyncOnLoad,
  runTerminalDataRefresh,
} from '@/lib/terminalRefresh';

const LeadsBySource = dynamic(() => import('@/components/terminal/LeadsBySource'), {
  loading: () => (
    <div className="glass-card p-4 sm:p-6 min-h-[280px]">
      <div className="premium-shimmer h-5 w-36 rounded mb-4 bg-gray-200/60 dark:bg-white/[0.06]" />
      <div className="premium-shimmer h-[220px] rounded-lg bg-gray-200/40 dark:bg-white/[0.04]" />
    </div>
  ),
  ssr: false,
});

const PerformancePanel = dynamic(() => import('@/components/ui/PerformancePanel'), {
  loading: () => (
    <div className="space-y-3 px-1 py-2">
      <div className="premium-shimmer h-16 rounded-xl bg-gray-200/60 dark:bg-white/[0.06]" />
      <div className="premium-shimmer h-24 rounded-xl bg-gray-200/60 dark:bg-white/[0.06]" />
    </div>
  ),
});

interface TerminalDashboardProps {
  /** When false, hide ROI priorities (legacy `performance` tab permission). */
  showPriorities?: boolean;
}

const sectionChevron = (
  <svg className="w-4 h-4 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

const sectionToggleClass =
  'inline-flex items-center justify-center w-8 h-8 rounded-md border border-blue-200 bg-blue-100 text-blue-700 shadow-sm hover:bg-blue-200 dark:border-blue-400/35 dark:bg-blue-500/20 dark:text-blue-200 dark:shadow-none dark:hover:bg-blue-500/30 transition-colors';

function TerminalFinanceBookingsRow() {
  const bookingsRef = useRef<HTMLDivElement>(null);
  const [bookingsColumnHeight, setBookingsColumnHeight] = useState<number | undefined>();

  useEffect(() => {
    const el = bookingsRef.current;
    if (!el) return;

    const mq = window.matchMedia('(min-width: 1024px)');

    const syncHeight = () => {
      if (!mq.matches) {
        setBookingsColumnHeight(undefined);
        return;
      }
      setBookingsColumnHeight(el.offsetHeight);
    };

    const ro = new ResizeObserver(syncHeight);
    ro.observe(el);
    mq.addEventListener('change', syncHeight);
    syncHeight();

    return () => {
      ro.disconnect();
      mq.removeEventListener('change', syncHeight);
    };
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 sm:gap-6 min-w-0 lg:items-start">
      <div
        className="min-w-0 flex flex-col"
        style={bookingsColumnHeight != null ? { minHeight: bookingsColumnHeight } : undefined}
      >
        <TerminalFinanceCollapsibles bookingsColumnHeight={bookingsColumnHeight} />
      </div>
      <div ref={bookingsRef} className="min-w-0 flex flex-col">
        <TerminalBookingsTable />
      </div>
    </div>
  );
}

export default function TerminalDashboard({ showPriorities = true }: TerminalDashboardProps) {
  const { setLoading: setGlobalLoading } = useLoading();
  const initialSyncStarted = useRef(false);

  useEffect(() => {
    setGlobalLoading(false);
  }, [setGlobalLoading]);

  /** Warm terminal summary + priorities; chart fetches its own monthly trends. */
  useEffect(() => {
    void apiClient.getTerminalSummary(false);
    void apiClient.getPerformanceSnapshot(false).catch(() => {});
    void apiClient
      .getOutreachInbox({ include_performance: false, include_automations: true, limit: 50 })
      .catch(() => {});
  }, []);

  /** New session after login: full sync once. Webhook poll: sync when server data is newer. */
  useEffect(() => {
    let cancelled = false;

    const runIfNewSession = () => {
      if (initialSyncStarted.current || cancelled) return;
      if (!consumeTerminalSyncOnLoad()) return;
      initialSyncStarted.current = true;
      void runTerminalDataRefresh({ reason: 'new_session', force: true });
    };

    runIfNewSession();

    const checkWebhook = async () => {
      if (cancelled) return;
      try {
        const { last_updated_ms } = await apiClient.getStripeLastUpdated();
        if (last_updated_ms == null || getSeenStripeDataMs() >= last_updated_ms) return;
        await runTerminalDataRefresh({ reason: 'webhook' });
      } catch {
        /* ignore */
      }
    };

    void checkWebhook();
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        runIfNewSession();
        void checkWebhook();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    const interval = setInterval(checkWebhook, 90000);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(interval);
    };
  }, []);

  return (
    <TerminalCalendarProvider>
      <TerminalTimeRangeProvider>
      <div className="space-y-4 sm:space-y-6 min-w-0 max-w-full">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate min-w-0">
            Terminal
          </h2>
        </div>

        {/* Row 1: unified chart + upcoming appointments + leads by source */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 sm:gap-6 min-w-0 lg:items-start">
          <PremiumReveal delayMs={TERMINAL_STAGGER.heroChart}>
            <TerminalUnifiedTrendChart />
          </PremiumReveal>
          <div className="flex flex-col gap-4 min-w-0">
            <PremiumReveal delayMs={TERMINAL_STAGGER.sidebar} className="glass-card p-4 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Upcoming Appointments
              </h3>
              <UpcomingAppointmentsList />
            </PremiumReveal>
            <PremiumReveal delayMs={TERMINAL_STAGGER.sidebar + 40}>
              <LeadsBySource />
            </PremiumReveal>
          </div>
        </div>

        {/* Row 2: KPI row */}
        <PremiumReveal delayMs={TERMINAL_STAGGER.kpiRow}>
          <TerminalKpiRow />
        </PremiumReveal>

        {/* Row 3: finance collapsibles + bookings table */}
        <PremiumReveal delayMs={TERMINAL_STAGGER.financeRow}>
          <TerminalFinanceBookingsRow />
        </PremiumReveal>

        {/* Row 4: priorities & approvals */}
        {showPriorities ? (
          <PremiumReveal delayMs={TERMINAL_STAGGER.priorities}>
          <details open className="group">
            <summary className="cursor-pointer select-none list-none flex items-center gap-2 py-1 min-w-0">
              <span className={sectionToggleClass}>{sectionChevron}</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Priorities &amp; approvals
              </span>
            </summary>
            <PerformancePanel variant="embedded" />
          </details>
          </PremiumReveal>
        ) : null}
      </div>
      </TerminalTimeRangeProvider>
    </TerminalCalendarProvider>
  );
}
