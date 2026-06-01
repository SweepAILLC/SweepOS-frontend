'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import TerminalUnifiedTrendChart from '@/components/terminal/TerminalUnifiedTrendChart';
import UpcomingAppointmentsList from '@/components/terminal/UpcomingAppointmentsList';
import TerminalKpiRow from '@/components/terminal/TerminalKpiRow';
import TerminalFinanceCollapsibles from '@/components/terminal/TerminalFinanceCollapsibles';
import TerminalBookingsTable from '@/components/terminal/TerminalBookingsTable';
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
    <div className="glass-card p-4 sm:p-6 min-h-[280px] animate-pulse">
      <div className="h-5 w-36 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
      <div className="h-[220px] bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  ),
  ssr: false,
});

const PerformancePanel = dynamic(() => import('@/components/ui/PerformancePanel'), {
  loading: () => (
    <div className="space-y-3 animate-pulse px-1 py-2">
      <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
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

export default function TerminalDashboard({ showPriorities = true }: TerminalDashboardProps) {
  const { setLoading: setGlobalLoading } = useLoading();
  const initialSyncStarted = useRef(false);

  useEffect(() => {
    setGlobalLoading(false);
  }, [setGlobalLoading]);

  /** Warm the same caches production widgets read (parity with legacy Terminal mount). */
  useEffect(() => {
    void apiClient.getTerminalSummary(false);
    void apiClient.getTerminalMonthlyTrends(false);
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 sm:gap-6 min-w-0 items-stretch lg:min-h-[440px]">
          <TerminalUnifiedTrendChart />
          <div className="flex flex-col gap-4 min-w-0">
            <div className="glass-card p-4 min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                Upcoming Appointments
              </h3>
              <UpcomingAppointmentsList />
            </div>
            <LeadsBySource />
          </div>
        </div>

        {/* Row 2: KPI row */}
        <TerminalKpiRow />

        {/* Row 3: finance collapsibles + bookings table */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4 sm:gap-6 min-w-0">
          <TerminalFinanceCollapsibles />
          <TerminalBookingsTable />
        </div>

        {/* Row 4: priorities & approvals */}
        {showPriorities ? (
          <details open className="group">
            <summary className="cursor-pointer select-none list-none flex items-center gap-2 py-1 min-w-0">
              <span className={sectionToggleClass}>{sectionChevron}</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Priorities &amp; approvals
              </span>
            </summary>
            <PerformancePanel variant="embedded" />
          </details>
        ) : null}
      </div>
      </TerminalTimeRangeProvider>
    </TerminalCalendarProvider>
  );
}
