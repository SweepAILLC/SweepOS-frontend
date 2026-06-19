'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  CALENDAR_BOOKINGS_UPDATED_EVENT,
  MANUAL_PAYMENT_CREATED_EVENT,
  STRIPE_DATA_UPDATED_EVENT,
  TERMINAL_DATA_REFRESHED_EVENT,
} from '@/lib/cache';
import { runTerminalDataRefresh } from '@/lib/terminalRefresh';
import type {
  StripeSummary,
  FinancesCombinedSummary,
  FinancesTimelinePoint,
  TerminalSummaryForWidgets,
} from '@/types/integration';
import type { CalendarTrendSummary } from '@/lib/dashboardTimeRange';
import {
  dashboardPeriodLabel,
  financesSummaryApiParams,
  financesTimelineApiParams,
  calendarTrendSummaryApiParams,
  mapCalendarTrendSummaryFromApi,
  computeCalendarTrendSummaryFromRows,
  computeCalendarPastCountTrendPct,
  computeCalendarUpcomingCountTrendPct,
  computeCalendarCloseRateTrendPp,
  computeCalendarShowUpRateTrendPp,
  computeAvgRevenuePerCustomerTrend,
  computeFinancesTimelineTrend,
  combinedCashForRange,
  fallbackCashForRange,
  stripeSummaryRange,
} from '@/lib/dashboardTimeRange';
import { useTerminalCalendar } from '@/contexts/TerminalCalendarContext';
import { useTerminalTimeRange } from '@/contexts/TerminalTimeRangeContext';
import { KpiGridSkeleton, PremiumReveal } from '@/components/ui/PremiumMotion';
import { COLUMN_STAGGER_MS } from '@/lib/premiumMotion';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function TrendBadge({ pct, suffix = '%' }: { pct: number | null | undefined; suffix?: string }) {
  if (pct == null || Number.isNaN(pct)) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`text-[10px] font-medium tabular-nums shrink-0 leading-none ${
        positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
      }`}
    >
      {positive ? '+' : ''}
      {pct.toFixed(1)}
      {suffix}
    </span>
  );
}

function KpiTile({
  label,
  value,
  trendPct,
  trendSuffix = '%',
  sub,
}: {
  label: string;
  value: string;
  trendPct?: number | null;
  trendSuffix?: string;
  sub?: string;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-2 min-w-0 overflow-hidden">
      <div className="flex items-baseline gap-1 min-w-0">
        <div className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate min-w-0 leading-tight">
          {value}
        </div>
        <TrendBadge pct={trendPct} suffix={trendSuffix} />
      </div>
      <div className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 leading-snug line-clamp-2" title={label}>
        {label}
      </div>
      {sub && (
        <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5 truncate leading-snug" title={sub}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default function TerminalKpiRow() {
  const { connectedProvider, syncedUpcoming, syncedPast } = useTerminalCalendar();
  const { timeRange: kpiTimeRange, setTimeRange: setKpiTimeRange } = useTerminalTimeRange();
  const [financesSummary, setFinancesSummary] = useState<FinancesCombinedSummary | null>(null);
  const [terminalSummary, setTerminalSummary] = useState<TerminalSummaryForWidgets | null>(null);
  const [cashTrendPct, setCashTrendPct] = useState<number | null>(null);
  const [financesTimeline, setFinancesTimeline] = useState<FinancesTimelinePoint[]>([]);
  const [stripeSummary, setStripeSummary] = useState<StripeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [calendarTrendSummary, setCalendarTrendSummary] = useState<CalendarTrendSummary | null>(null);

  const hasLoadedOnce = useRef(false);

  const loadKpis = useCallback(async (opts?: { silent?: boolean; forceRefresh?: boolean }) => {
    if (!opts?.silent && !hasLoadedOnce.current) setLoading(true);
    setLoadError(null);

    const sumParams = financesSummaryApiParams(kpiTimeRange);
    const tlParams = financesTimelineApiParams(kpiTimeRange);
    const stripeRange = stripeSummaryRange(kpiTimeRange);
    const bustTerminalCache = opts?.forceRefresh === true || opts?.silent === true;

    const [finRes, tlRes, stripeRes, terminalRes] = await Promise.allSettled([
      apiClient.getFinancesSummary(true, sumParams),
      apiClient.getFinancesRevenueTimeline(tlParams.days, 'day', tlParams.scope ?? null),
      apiClient.getStripeSummary(stripeRange, true),
      apiClient.getTerminalSummary(bustTerminalCache),
    ]);

    let finSum: FinancesCombinedSummary | null = null;
    if (finRes.status === 'fulfilled') {
      finSum = finRes.value as FinancesCombinedSummary;
      setFinancesSummary(finSum);
    } else {
      setFinancesSummary(null);
    }

    let stripeSum: StripeSummary | null = null;
    if (stripeRes.status === 'fulfilled') {
      stripeSum = stripeRes.value as StripeSummary;
      setStripeSummary(stripeSum);
    } else {
      setStripeSummary(null);
    }

    let termSum: TerminalSummaryForWidgets | null = null;
    if (terminalRes.status === 'fulfilled') {
      termSum = terminalRes.value as TerminalSummaryForWidgets;
      setTerminalSummary(termSum);
    } else {
      setTerminalSummary(null);
    }

    if (tlRes.status === 'fulfilled') {
      const pts = ((tlRes.value as { timeline?: FinancesTimelinePoint[] })?.timeline ??
        []) as FinancesTimelinePoint[];
      setFinancesTimeline(pts);
      setCashTrendPct(computeFinancesTimelineTrend(pts, kpiTimeRange));
    } else {
      setFinancesTimeline([]);
      setCashTrendPct(null);
    }

    if (!finSum && !stripeSum && !termSum) {
      setLoadError('Could not load revenue metrics. Check Stripe/Whop connections.');
    }

    hasLoadedOnce.current = true;
    setLoading(false);
  }, [kpiTimeRange]);

  useEffect(() => {
    hasLoadedOnce.current = false;
    void loadKpis();
  }, [loadKpis]);

  useEffect(() => {
    const handler = () => void loadKpis({ silent: true, forceRefresh: true });
    window.addEventListener(STRIPE_DATA_UPDATED_EVENT, handler);
    window.addEventListener(TERMINAL_DATA_REFRESHED_EVENT, handler);
    window.addEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, handler);
    window.addEventListener(MANUAL_PAYMENT_CREATED_EVENT, handler);
    return () => {
      window.removeEventListener(STRIPE_DATA_UPDATED_EVENT, handler);
      window.removeEventListener(TERMINAL_DATA_REFRESHED_EVENT, handler);
      window.removeEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, handler);
      window.removeEventListener(MANUAL_PAYMENT_CREATED_EVENT, handler);
    };
  }, [loadKpis]);

  const handleRefreshAll = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await runTerminalDataRefresh({ reason: 'manual', force: true });
      await loadKpis({ forceRefresh: true });
      if (!result.ok) {
        setSyncError('Some integrations failed to sync. Metrics may be partial.');
      }
    } catch {
      setSyncError('Refresh failed. Try again in a moment.');
    } finally {
      setSyncing(false);
    }
  };

  const loadCalendarTrendSummary = useCallback(async (forceRefresh?: boolean) => {
    if (!connectedProvider) {
      setCalendarTrendSummary(null);
      return;
    }
    try {
      const row = await apiClient.getCalendarTrendSummary(
        calendarTrendSummaryApiParams(kpiTimeRange),
        forceRefresh
      );
      setCalendarTrendSummary(mapCalendarTrendSummaryFromApi(row));
    } catch {
      if (syncedUpcoming.length > 0 || syncedPast.length > 0) {
        setCalendarTrendSummary(
          computeCalendarTrendSummaryFromRows(syncedUpcoming, syncedPast, kpiTimeRange)
        );
      }
    }
  }, [connectedProvider, kpiTimeRange, syncedUpcoming, syncedPast]);

  useEffect(() => {
    if (!connectedProvider) {
      setCalendarTrendSummary(null);
      return;
    }
    if (syncedUpcoming.length > 0 || syncedPast.length > 0) {
      setCalendarTrendSummary(
        computeCalendarTrendSummaryFromRows(syncedUpcoming, syncedPast, kpiTimeRange)
      );
    }
  }, [connectedProvider, syncedUpcoming, syncedPast, kpiTimeRange]);

  useEffect(() => {
    if (!connectedProvider) return;
    const delayMs = syncedUpcoming.length + syncedPast.length > 0 ? 400 : 1200;
    const timer = window.setTimeout(() => {
      void loadCalendarTrendSummary();
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [connectedProvider, loadCalendarTrendSummary, syncedUpcoming.length, syncedPast.length]);

  useEffect(() => {
    const handler = () => void loadCalendarTrendSummary(true);
    window.addEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, handler);
    return () => window.removeEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, handler);
  }, [loadCalendarTrendSummary]);

  const calendarPastTrendPct = useMemo(() => {
    if (!connectedProvider) return null;
    return computeCalendarPastCountTrendPct(syncedUpcoming, syncedPast, kpiTimeRange);
  }, [connectedProvider, syncedUpcoming, syncedPast, kpiTimeRange]);

  const calendarCloseRateTrendPp = useMemo(() => {
    if (!connectedProvider) return null;
    return computeCalendarCloseRateTrendPp(syncedUpcoming, syncedPast, kpiTimeRange);
  }, [connectedProvider, syncedUpcoming, syncedPast, kpiTimeRange]);

  const calendarUpcomingTrendPct = useMemo(() => {
    if (!connectedProvider) return null;
    return computeCalendarUpcomingCountTrendPct(syncedUpcoming, syncedPast, kpiTimeRange);
  }, [connectedProvider, syncedUpcoming, syncedPast, kpiTimeRange]);

  const calendarShowUpTrendPp = useMemo(() => {
    if (!connectedProvider) return null;
    return computeCalendarShowUpRateTrendPp(syncedUpcoming, syncedPast, kpiTimeRange);
  }, [connectedProvider, syncedUpcoming, syncedPast, kpiTimeRange]);

  const ltvTrendPct = useMemo(
    () =>
      computeAvgRevenuePerCustomerTrend(
        financesTimeline,
        stripeSummary?.total_customers ?? 0,
        kpiTimeRange
      ),
    [financesTimeline, stripeSummary?.total_customers, kpiTimeRange]
  );

  const rangeLabel = dashboardPeriodLabel(kpiTimeRange);
  const rangeLabelLower = rangeLabel.toLowerCase();

  const combinedCash = financesSummary
    ? combinedCashForRange(financesSummary, kpiTimeRange)
    : fallbackCashForRange(kpiTimeRange, {
        terminal: terminalSummary,
        stripeLast30: stripeSummary?.last_30_days_revenue,
      });

  const mrr =
    stripeSummary?.total_mrr ??
    terminalSummary?.mrr?.current_mrr ??
    0;

  const cashLabel =
    kpiTimeRange === 'mtd'
      ? 'Combined cash MTD'
      : kpiTimeRange === 'all'
        ? 'Combined cash (all time)'
        : `Combined cash (${rangeLabelLower})`;

  return (
    <div className="glass-card p-3 sm:p-4 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Key metrics</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            disabled={syncing || loading}
            className="inline-flex items-center gap-1.5 text-sm glass-button-secondary rounded-md px-3 py-1 hover:bg-white/20 disabled:opacity-60"
            title="Sync payments, calendar events, and refresh all metrics"
          >
            <svg
              className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466 1 1 0 11-1.731-1.003 7.5 7.5 0 0012.548-3.364 1 1 0 11-1.616.901zM4.687 8.576a5.5 5.5 0 019.201-2.466 1 1 0 111.731 1.003 7.5 7.5 0 01-12.548 3.364 1 1 0 111.616-.901z"
                clipRule="evenodd"
              />
            </svg>
            {syncing ? 'Syncing…' : 'Refresh'}
          </button>
          <select
            value={kpiTimeRange === 'all' ? 'all' : kpiTimeRange === 'mtd' ? 'mtd' : String(kpiTimeRange)}
            onChange={(e) => {
              const v = e.target.value;
              setKpiTimeRange(v === 'all' ? 'all' : v === 'mtd' ? 'mtd' : Number(v));
            }}
            className="text-sm glass-input rounded-md px-3 py-1"
          >
            <option value="mtd">Month to date</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      {syncError && !syncing && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">{syncError}</p>
      )}

      {loadError && !loading && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">{loadError}</p>
      )}

      {loading && !hasLoadedOnce.current ? (
        <KpiGridSkeleton />
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1.5 sm:gap-2 min-w-0">
        {(
          [
            {
              key: 'cash',
              tile: (
                <KpiTile
                  label={cashLabel}
                  value={formatCurrency(combinedCash)}
                  trendPct={cashTrendPct}
                  sub={financesSummary ? 'Stripe + Whop + Manual' : 'Terminal / Stripe fallback'}
                />
              ),
            },
            {
              key: 'mrr',
              tile: (
                <KpiTile
                  label="MRR"
                  value={formatCurrency(mrr)}
                  trendPct={stripeSummary?.mrr_change_percent}
                  sub={rangeLabel}
                />
              ),
            },
            {
              key: 'ltv',
              tile: (
                <KpiTile
                  label="Avg LTV"
                  value={
                    stripeSummary?.average_client_ltv != null
                      ? formatCurrency(stripeSummary.average_client_ltv)
                      : '—'
                  }
                  trendPct={ltvTrendPct}
                  sub="Avg total spend"
                />
              ),
            },
            {
              key: 'upcoming',
              tile: (
                <KpiTile
                  label={`Upcoming (${rangeLabelLower})`}
                  value={
                    connectedProvider && calendarTrendSummary
                      ? String(calendarTrendSummary.upcomingCount)
                      : '—'
                  }
                  trendPct={calendarUpcomingTrendPct}
                />
              ),
            },
            {
              key: 'past',
              tile: (
                <KpiTile
                  label={`Past meetings (${rangeLabelLower})`}
                  value={
                    connectedProvider && calendarTrendSummary
                      ? String(calendarTrendSummary.pastCount)
                      : '—'
                  }
                  trendPct={calendarPastTrendPct}
                />
              ),
            },
            {
              key: 'close',
              tile: (
                <KpiTile
                  label={`Sales close rate (${rangeLabelLower})`}
                  value={
                    calendarTrendSummary?.closeRatePct != null
                      ? `${calendarTrendSummary.closeRatePct}%`
                      : '—'
                  }
                  trendPct={calendarCloseRateTrendPp}
                  trendSuffix=" pp"
                  sub={
                    calendarTrendSummary && calendarTrendSummary.salesCallsInRange > 0
                      ? `${calendarTrendSummary.closedSalesCount}/${calendarTrendSummary.salesCallsInRange} sales calls`
                      : undefined
                  }
                />
              ),
            },
            {
              key: 'showup',
              tile: (
                <KpiTile
                  label={`Show-up rate (${rangeLabelLower})`}
                  value={
                    calendarTrendSummary?.showUpRatePct != null
                      ? `${calendarTrendSummary.showUpRatePct}%`
                      : '—'
                  }
                  trendPct={calendarShowUpTrendPp}
                  trendSuffix=" pp"
                  sub={
                    calendarTrendSummary && calendarTrendSummary.attendanceEligiblePast > 0
                      ? `${calendarTrendSummary.showedUpCount}/${calendarTrendSummary.attendanceEligiblePast} sales calls`
                      : undefined
                  }
                />
              ),
            },
          ] as const
        ).map((item, i) => (
          <PremiumReveal key={item.key} delayMs={i * COLUMN_STAGGER_MS}>
            {item.tile}
          </PremiumReveal>
        ))}
      </div>
      )}
    </div>
  );
}
