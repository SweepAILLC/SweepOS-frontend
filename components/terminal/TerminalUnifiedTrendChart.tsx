'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Customized,
} from 'recharts';
import { apiClient } from '@/lib/api';
import {
  CALENDAR_BOOKINGS_UPDATED_EVENT,
  STRIPE_DATA_UPDATED_EVENT,
  TERMINAL_CHART_REFRESH_EVENT,
  TERMINAL_DATA_REFRESHED_EVENT,
} from '@/lib/cache';
import type { HealthTrendPeriod } from '@/types/admin';
import { healthTrendPeriodsWithFinancesCash } from '@/lib/healthTrendMetrics';
import { chartRevealBudgetMs, PREMIUM_LINE_ANIMATION } from '@/lib/premiumMotion';
import { ChartSkeleton, PremiumContentGate } from '@/components/ui/PremiumMotion';
import PortalKpiSnapshot from '@/components/portal/PortalKpiSnapshot';
import { useOptionalDateRange } from '@/contexts/DateRangeContext';
import { addDays, diffDays, formatRange, formatYmd, mondayOf } from '@/lib/dateRange';

const MONEY_CHART_HEIGHT = 180;

/** Left cash axis gutter for the money chart. */
const LEFT_AXIS_WIDTH = 56;
const CHART_MARGIN = { top: 6, right: 16, left: 4, bottom: 0 };
const AXIS_MARGIN = { top: 6, right: 0, left: 0, bottom: 44 };
const X_AXIS_HEIGHT = 44;
const Y_TICK_COUNT = 4;
/** Keep first/last category points inset so dots/strokes aren't clipped. */
const X_AXIS_PADDING = { left: 12, right: 16 };

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: '#e5e7eb' },
};

const MONEY_LEGEND = [
  { label: 'Cash collected', color: '#f59e0b' },
  { label: 'Revenue', color: '#6366f1' },
] as const;


function axisMax(values: number[]): number {
  const max = values.reduce((m, v) => (Number.isFinite(v) ? Math.max(m, v) : m), 0);
  if (max <= 0) return 1;
  return Math.ceil(max * 1.08);
}

type ChartOffset = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width?: number;
  height?: number;
};

/** Fields the money chart reads; monthly trend rows and date-range rows both fit. */
type TrendChartRow = { period_label: string; finances_cash_usd: number; deal_revenue_usd: number };

const LeftCashAxisChart = memo(function LeftCashAxisChart({
  data,
  domain,
  height,
  tickClass,
}: {
  data: TrendChartRow[];
  domain: [number, number];
  height: number;
  tickClass: string;
}) {
  return (
    <ComposedChart width={LEFT_AXIS_WIDTH} height={height} data={data} margin={AXIS_MARGIN}>
      <YAxis
        yAxisId="left"
        width={LEFT_AXIS_WIDTH}
        domain={domain}
        tickCount={Y_TICK_COUNT}
        tick={{ fontSize: 11 }}
        tickFormatter={(v) => `$${v}`}
        className={tickClass}
      />
    </ComposedChart>
  );
});


function ChartRevealClip({
  width: chartWidth = 0,
  height: chartHeight = 0,
  offset,
  revealProgress,
  clipId,
}: {
  width?: number;
  height?: number;
  offset?: ChartOffset;
  revealProgress: number;
  clipId: string;
}) {
  const plotLeft = offset?.left ?? 0;
  const plotTop = offset?.top ?? 0;
  const rawWidth =
    offset != null && typeof offset.width === 'number' && offset.width > 0
      ? offset.width
      : offset != null
        ? chartWidth - (Number(offset.left) || 0) - (Number(offset.right) || 0)
        : chartWidth;
  const rawHeight =
    offset != null && typeof offset.height === 'number' && offset.height > 0
      ? offset.height
      : offset != null
        ? chartHeight - (Number(offset.top) || 0) - (Number(offset.bottom) || 0)
        : chartHeight;
  const plotW = Math.max(0, rawWidth);
  const plotH = Math.max(0, rawHeight);
  const clipW = Math.max(0, plotW * Math.min(1, Math.max(0, revealProgress)));

  if (plotW < 1 || plotH < 1 || clipW < 0.5) return null;

  return (
    <defs>
      <clipPath id={clipId}>
        <rect x={plotLeft} y={plotTop} width={clipW} height={plotH} />
      </clipPath>
    </defs>
  );
}

/** Monthly chart: months overlapping the page range, at least MIN_MONTHS so it reads as a trend. */
const MIN_MONTHS = 3;

type Granularity = 'day' | 'week' | 'month';

type MoneyRow = {
  period_label: string;
  period_start: string;
  period_end: string;
  finances_cash_usd: number;
  deal_revenue_usd: number;
};

/** Bucket size that keeps the axis readable: days up to ~6 weeks, then weeks, then months. */
function granularityFor(start: string, end: string): Granularity {
  const days = diffDays(start, end) + 1;
  if (days <= 45) return 'day';
  if (days <= 200) return 'week';
  return 'month';
}

function bucketStart(ymd: string, g: Granularity): string {
  if (g === 'day') return ymd;
  if (g === 'week') return mondayOf(ymd);
  return `${ymd.slice(0, 7)}-01`;
}

function nextBucket(ymd: string, g: Granularity): string {
  if (g === 'day') return addDays(ymd, 1);
  if (g === 'week') return addDays(ymd, 7);
  const [y, m] = ymd.split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function bucketLabel(ymd: string, g: Granularity): string {
  if (g === 'day') return formatYmd(ymd, false);
  if (g === 'week') return `Wk ${formatYmd(ymd, false)}`;
  return formatYmd(ymd).replace(/ \d+,/, '');
}

/**
 * Cash (finances timeline, Stripe + Whop + Manual) and deal revenue (KPI ledger) summed into
 * buckets covering exactly the page range — every bucket present, empty ones as 0.
 */
function buildRangeSeries(
  cashByDay: Array<{ date: string; total_revenue: number }>,
  revenueByDay: Array<{ entry_date: string; revenue?: number | null }>,
  start: string | null,
  end: string,
): { rows: MoneyRow[]; granularity: Granularity } {
  const firstData = [...cashByDay.map((c) => c.date), ...revenueByDay.map((r) => r.entry_date)].sort()[0];
  const from = start ?? firstData ?? end;
  const g = granularityFor(from, end);
  const cash = new Map<string, number>();
  const deal = new Map<string, number>();
  for (const c of cashByDay) {
    const d = c.date.slice(0, 10);
    if (d < from || d > end) continue;
    const k = bucketStart(d, g);
    cash.set(k, (cash.get(k) ?? 0) + (c.total_revenue ?? 0));
  }
  for (const r of revenueByDay) {
    const d = r.entry_date;
    if (d < from || d > end || !r.revenue) continue;
    const k = bucketStart(d, g);
    deal.set(k, (deal.get(k) ?? 0) + Number(r.revenue));
  }
  const rows: MoneyRow[] = [];
  for (let k = bucketStart(from, g); k <= end; k = nextBucket(k, g)) {
    rows.push({
      period_label: bucketLabel(k, g),
      period_start: k,
      period_end: nextBucket(k, g),
      finances_cash_usd: Math.round((cash.get(k) ?? 0) * 100) / 100,
      deal_revenue_usd: Math.round((deal.get(k) ?? 0) * 100) / 100,
    });
  }
  return { rows, granularity: g };
}

export default function TerminalUnifiedTrendChart() {
  const [periods, setPeriods] = useState<HealthTrendPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const pageRange = useOptionalDateRange()?.range ?? null;
  const pageRangeRef = useRef(pageRange);
  pageRangeRef.current = pageRange;
  const [rangeSeries, setRangeSeries] = useState<{ rows: MoneyRow[]; granularity: Granularity } | null>(null);
  const [animateChart, setAnimateChart] = useState(true);
  const [revealProgress, setRevealProgress] = useState(0);
  const [revealKey, setRevealKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const revealFrameRef = useRef<number | null>(null);
  const moneyClipId = useRef(`terminal-money-reveal-${Math.random().toString(36).slice(2, 9)}`);
  const fetchGenRef = useRef(0);

  const reloadTrends = useCallback((opts?: { forceRefresh?: boolean; animate?: boolean }) => {
    const gen = ++fetchGenRef.current;
    const force = opts?.forceRefresh === true;
    if (opts?.animate) {
      setAnimateChart(true);
      setRevealProgress(0);
      setRevealKey((k) => k + 1);
    }
    const range = pageRangeRef.current;
    if (range) {
      // Inside the Terminal: exact series for the page's date range.
      const win = range.start ? { start: range.start, end: range.end } : { end: range.end };
      return Promise.all([
        apiClient.getFinancesRevenueTimeline(30, 'day', null, win),
        apiClient.getKpiEntries({ ...win, sync: false }),
      ])
        .then(([tl, entries]) => {
          if (gen !== fetchGenRef.current) return;
          const points = ((tl as { timeline?: Array<{ date: string; total_revenue: number }> })?.timeline ?? []);
          setRangeSeries(buildRangeSeries(points, entries, range.start, range.end));
        })
        .catch(() => {
          if (gen !== fetchGenRef.current) return;
          setRangeSeries({ rows: [], granularity: 'day' });
        })
        .finally(() => {
          if (gen !== fetchGenRef.current) return;
          setLoading(false);
        });
    }
    return apiClient
      .getTerminalMonthlyTrends(force)
      .then((d) => {
        if (gen !== fetchGenRef.current) return;
        setPeriods(Array.isArray(d?.periods) ? d.periods : []);
      })
      .catch(() => {
        if (gen !== fetchGenRef.current) return;
        setPeriods([]);
      })
      .finally(() => {
        if (gen !== fetchGenRef.current) return;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void reloadTrends();

    const onRefresh = () => void reloadTrends({ forceRefresh: true, animate: true });
    window.addEventListener(TERMINAL_DATA_REFRESHED_EVENT, onRefresh);
    window.addEventListener(TERMINAL_CHART_REFRESH_EVENT, onRefresh);
    window.addEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, onRefresh);
    window.addEventListener(STRIPE_DATA_UPDATED_EVENT, onRefresh);

    return () => {
      fetchGenRef.current += 1;
      window.removeEventListener(TERMINAL_DATA_REFRESHED_EVENT, onRefresh);
      window.removeEventListener(TERMINAL_CHART_REFRESH_EVENT, onRefresh);
      window.removeEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, onRefresh);
      window.removeEventListener(STRIPE_DATA_UPDATED_EVENT, onRefresh);
    };
  }, [reloadTrends]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setAnimateChart(false);
    }
  }, []);

  const measureContainer = useCallback(() => {
    const w = containerRef.current?.clientWidth ?? 0;
    if (w > 0) setViewportWidth(w);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    measureContainer();
    const ro = new ResizeObserver(() => measureContainer());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureContainer]);

  const chartData = useMemo(() => healthTrendPeriodsWithFinancesCash(periods), [periods]);

  const rangedChartData = useMemo<MoneyRow[]>(
    () => (pageRange ? rangeSeries?.rows ?? [] : chartData.slice(-6)),
    [chartData, pageRange, rangeSeries]
  );

  const cashDomain = useMemo(
    (): [number, number] => [
      0,
      axisMax(
        rangedChartData.flatMap((d) => [d.finances_cash_usd, Number(d.deal_revenue_usd ?? 0)])
      ),
    ],
    [rangedChartData]
  );


  const plotWidth = useMemo(() => {
    const base = viewportWidth > 0 ? viewportWidth : 720;
    return Math.max(200, base - LEFT_AXIS_WIDTH);
  }, [viewportWidth]);

  const revealInProgress = animateChart && revealProgress < 1;
  const moneyClipPath =
    revealInProgress && revealProgress > 0 ? `url(#${moneyClipId.current})` : undefined;
  useLayoutEffect(() => {
    if (loading || rangedChartData.length === 0) return;
    measureContainer();
  }, [loading, rangedChartData.length, plotWidth, measureContainer]);

  const revealBudgetMs = useMemo(
    () => chartRevealBudgetMs(rangedChartData.length),
    [revealKey, rangedChartData.length]
  );

  useEffect(() => {
    if (revealFrameRef.current != null) {
      cancelAnimationFrame(revealFrameRef.current);
      revealFrameRef.current = null;
    }

    if (loading || rangedChartData.length === 0) {
      setRevealProgress(0);
      return;
    }

    if (!animateChart) {
      setRevealProgress(1);
      return;
    }

    setRevealProgress(0);
    const startedAt = performance.now();
    let lastPaintAt = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / revealBudgetMs);
      if (progress >= 1 || now - lastPaintAt >= 32) {
        lastPaintAt = now;
        setRevealProgress(progress);
      }

      if (progress < 1) {
        revealFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      revealFrameRef.current = null;
      setAnimateChart(false);
    };

    revealFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (revealFrameRef.current != null) {
        cancelAnimationFrame(revealFrameRef.current);
        revealFrameRef.current = null;
      }
    };
  }, [loading, animateChart, revealKey, revealBudgetMs, rangedChartData.length]);

  // Replay the reveal when the page range changes.
  const rangeKey = pageRange ? `${pageRange.start}~${pageRange.end}` : '';
  const firstRangeLoad = useRef(true);
  useEffect(() => {
    // The mount effect already loaded the first range; refetch + replay the reveal on changes.
    if (firstRangeLoad.current) {
      firstRangeLoad.current = false;
      return;
    }
    void reloadTrends({ animate: true });
  }, [rangeKey, reloadTrends]);

  const rangeDescription = useMemo(() => {
    if (!rangedChartData.length) return '';
    if (pageRange && rangeSeries) {
      const unit = rangeSeries.granularity === 'day' ? 'Daily' : rangeSeries.granularity === 'week' ? 'Weekly' : 'Monthly';
      const first = rangedChartData[0].period_start;
      return `${unit} · ${pageRange.start ? formatRange(pageRange.start, pageRange.end) : `All time through ${formatYmd(pageRange.end)}`}${
        !pageRange.start ? ` (from ${formatYmd(first)})` : ''
      }`;
    }
    return `Last ${rangedChartData.length} months`;
  }, [rangedChartData, pageRange, rangeSeries]);

  const axisTickClass = 'fill-gray-600 dark:fill-gray-400';

  return (
    <div className="min-w-0 flex flex-col gap-4 sm:gap-6">
      {/* Money: cash collected + deal revenue */}
      <div className="glass-card p-4 sm:p-6 min-w-0 flex flex-col">
        <div className="mb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              Cash &amp; revenue
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {rangeDescription} — cash collected (Stripe + Whop + Manual) and deal/contract revenue.
            </p>
          </div>
        </div>

        {/* Measure inside card padding so plot width matches the visible content box. */}
        <div ref={containerRef} className="w-full min-w-0">
        <PremiumContentGate
          loading={loading}
          animate={false}
          skeleton={<ChartSkeleton height={MONEY_CHART_HEIGHT} />}
        >
          {rangedChartData.length === 0 ? (
            <div
              className="flex items-center justify-center text-sm text-gray-500 premium-reveal"
              style={{ height: MONEY_CHART_HEIGHT }}
            >
              No monthly data yet.
            </div>
          ) : plotWidth > 0 ? (
            <div className="w-full min-w-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-gray-600 dark:text-gray-400">
                {MONEY_LEGEND.map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                  </span>
                ))}
              </div>

              <div className="flex w-full min-w-0" style={{ height: MONEY_CHART_HEIGHT }}>
                <div className="shrink-0" style={{ width: LEFT_AXIS_WIDTH }}>
                  <LeftCashAxisChart
                    data={rangedChartData}
                    domain={cashDomain}
                    height={MONEY_CHART_HEIGHT}
                    tickClass={axisTickClass}
                  />
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div style={{ width: plotWidth, height: MONEY_CHART_HEIGHT }}>
                    <ComposedChart
                      width={plotWidth}
                      height={MONEY_CHART_HEIGHT}
                      data={rangedChartData}
                      margin={CHART_MARGIN}
                    >
                      <Customized
                        component={(props: {
                          width?: number;
                          height?: number;
                          offset?: ChartOffset;
                        }) => (
                          <ChartRevealClip
                            width={props.width}
                            height={props.height}
                            offset={props.offset}
                            revealProgress={revealProgress}
                            clipId={moneyClipId.current}
                          />
                        )}
                      />
                      <CartesianGrid
                        strokeDasharray="3 3"
                        className="stroke-gray-200 dark:stroke-white/10"
                      />
                      <XAxis
                        dataKey="period_label"
                        tick={{ fontSize: 10 }}
                        angle={-35}
                        textAnchor="end"
                        height={X_AXIS_HEIGHT}
                        padding={
                          rangedChartData.length <= 2
                            ? { left: 0, right: 0 }
                            : X_AXIS_PADDING
                        }
                        interval={rangedChartData.length > 14 ? 'preserveStartEnd' : 0}
                        className={axisTickClass}
                      />
                      <YAxis
                        yAxisId="left"
                        hide
                        width={0}
                        domain={cashDomain}
                        tickCount={Y_TICK_COUNT}
                      />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(value: number, name: string) => [
                          `$${Number(value).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`,
                          name,
                        ]}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="finances_cash_usd"
                        name="Cash collected"
                        stroke="#f59e0b"
                        fill="#f59e0b"
                        fillOpacity={0.15}
                        strokeWidth={2}
                        clipPath={moneyClipPath}
                        {...PREMIUM_LINE_ANIMATION}
                        isAnimationActive={false}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="deal_revenue_usd"
                        name="Revenue"
                        stroke="#6366f1"
                        fill="#6366f1"
                        fillOpacity={0.15}
                        strokeWidth={2}
                        clipPath={moneyClipPath}
                        {...PREMIUM_LINE_ANIMATION}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </div>
                </div>

              </div>
            </div>
          ) : null}
        </PremiumContentGate>
        </div>
      </div>

      {/* Follows the Terminal's date range (its own 7/30/90 toggle hides when controlled).
          All time has no start, so it reads from 2000 and skips the live calendar sync. */}
      <PortalKpiSnapshot
        isActive
        showFlags={false}
        syncLive={pageRange ? pageRange.start != null : true}
        rangeStart={pageRange ? pageRange.start ?? '2000-01-01' : undefined}
        rangeEnd={pageRange?.end}
        emptyHint="No KPI entries logged yet. Head to Funnels → Organic to start tracking."
      />

    </div>
  );
}
