'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
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

const MONEY_CHART_HEIGHT = 180;
const ACTIVITY_CHART_HEIGHT = 180;

type ChartRange = '6m' | '12m' | 'all';

const CHART_RANGE_OPTIONS: { id: ChartRange; label: string }[] = [
  { id: '6m', label: '6 month' },
  { id: '12m', label: '12 month' },
  { id: 'all', label: 'All time' },
];

function sliceChartRange<T>(data: T[], range: ChartRange): T[] {
  if (data.length === 0 || range === 'all') return data;
  const months = range === '6m' ? 6 : 12;
  return data.slice(-months);
}

/** Shared gutters so both charts' timelines share the same plot width. */
const LEFT_AXIS_WIDTH = 56;
const RIGHT_AXIS_WIDTH = 44;
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

/** Left axis = call outcomes (smaller scale); right = outreach volume (larger scale). */
const ACTIVITY_SERIES = [
  {
    label: 'Closes',
    color: '#22c55e',
    dataKey: 'kpi_closes_count' as const,
    yAxisId: 'left' as const,
  },
  {
    label: 'Show-ups',
    color: '#8b5cf6',
    dataKey: 'kpi_show_ups_count' as const,
    yAxisId: 'left' as const,
  },
  {
    label: 'Booked calls',
    color: '#0ea5e9',
    dataKey: 'kpi_calls_booked_count' as const,
    yAxisId: 'left' as const,
  },
  {
    label: 'Outbounds sent',
    color: '#f97316',
    dataKey: 'kpi_outreach_sent_count' as const,
    yAxisId: 'right' as const,
  },
] as const;

function axisMax(values: number[]): number {
  const max = values.reduce((m, v) => (Number.isFinite(v) ? Math.max(m, v) : m), 0);
  if (max <= 0) return 1;
  return Math.ceil(max * 1.08);
}

type ChartOffset = { left: number; top: number; right: number; bottom: number };

type TrendChartRow = ReturnType<typeof healthTrendPeriodsWithFinancesCash>[number] & {
  kpi_closes_count: number;
  kpi_show_ups_count: number;
  kpi_calls_booked_count: number;
  kpi_outreach_sent_count: number;
};

function withActivityCounts(
  periods: HealthTrendPeriod[]
): TrendChartRow[] {
  return healthTrendPeriodsWithFinancesCash(periods).map((p) => ({
    ...p,
    kpi_closes_count: Number(p.kpi_closes_count ?? 0),
    kpi_show_ups_count: Number(p.kpi_show_ups_count ?? 0),
    // Prefer calendar sales bookings; KPI daily sum is often empty for unopened months.
    kpi_calls_booked_count: Number(
      (p.calls_booked_count != null && p.calls_booked_count > 0
        ? p.calls_booked_count
        : p.kpi_calls_booked_count) ?? 0
    ),
    kpi_outreach_sent_count: Number(p.kpi_outreach_sent_count ?? 0),
  }));
}

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

const LeftCountAxisChart = memo(function LeftCountAxisChart({
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
        tick={{ fontSize: 10 }}
        allowDecimals={false}
        className={tickClass}
      />
    </ComposedChart>
  );
});

const RightCountAxisChart = memo(function RightCountAxisChart({
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
    <ComposedChart width={RIGHT_AXIS_WIDTH} height={height} data={data} margin={AXIS_MARGIN}>
      <YAxis
        yAxisId="right"
        orientation="right"
        width={RIGHT_AXIS_WIDTH}
        domain={domain}
        tickCount={Y_TICK_COUNT}
        tick={{ fontSize: 10 }}
        allowDecimals={false}
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
  const plotWidth =
    offset != null ? Math.max(0, chartWidth - offset.left - offset.right) : chartWidth;
  const plotHeight =
    offset != null ? Math.max(0, chartHeight - offset.top - offset.bottom) : chartHeight;

  if (plotWidth <= 0 || plotHeight <= 0) return null;

  return (
    <defs>
      <clipPath id={clipId}>
        <rect
          x={plotLeft}
          y={plotTop}
          width={plotWidth * revealProgress}
          height={plotHeight}
        />
      </clipPath>
    </defs>
  );
}

function rangeDescriptionFor(dataLen: number, chartRange: ChartRange): string {
  if (dataLen === 0) return '';
  if (chartRange === 'all') {
    return dataLen === 1 ? 'All time (1 month)' : `All time (${dataLen} months)`;
  }
  const target = chartRange === '6m' ? 6 : 12;
  if (dataLen < target) {
    return `Last ${dataLen} month${dataLen !== 1 ? 's' : ''}`;
  }
  return chartRange === '6m' ? 'Last 6 months' : 'Last 12 months';
}

export default function TerminalUnifiedTrendChart() {
  const [periods, setPeriods] = useState<HealthTrendPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [chartRange, setChartRange] = useState<ChartRange>('6m');
  const [animateChart, setAnimateChart] = useState(true);
  const [revealProgress, setRevealProgress] = useState(0);
  const [revealKey, setRevealKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const revealFrameRef = useRef<number | null>(null);
  const moneyClipId = useRef(`terminal-money-reveal-${Math.random().toString(36).slice(2, 9)}`);
  const activityClipId = useRef(`terminal-activity-reveal-${Math.random().toString(36).slice(2, 9)}`);
  const fetchGenRef = useRef(0);

  const reloadTrends = useCallback((opts?: { forceRefresh?: boolean; animate?: boolean }) => {
    const gen = ++fetchGenRef.current;
    const force = opts?.forceRefresh === true;
    if (opts?.animate) {
      setAnimateChart(true);
      setRevealProgress(0);
      setRevealKey((k) => k + 1);
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

  const chartData = useMemo(() => withActivityCounts(periods), [periods]);

  const rangedChartData = useMemo(
    () => sliceChartRange(chartData, chartRange),
    [chartData, chartRange]
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

  const activityLeftDomain = useMemo(
    (): [number, number] => [
      0,
      axisMax(
        rangedChartData.flatMap((d) => [
          d.kpi_closes_count,
          d.kpi_show_ups_count,
          d.kpi_calls_booked_count,
        ])
      ),
    ],
    [rangedChartData]
  );

  const activityRightDomain = useMemo(
    (): [number, number] => [
      0,
      axisMax(rangedChartData.map((d) => d.kpi_outreach_sent_count)),
    ],
    [rangedChartData]
  );

  const plotWidth = useMemo(() => {
    const base = viewportWidth > 0 ? viewportWidth : 720;
    return Math.max(200, base - LEFT_AXIS_WIDTH - RIGHT_AXIS_WIDTH);
  }, [viewportWidth]);

  const revealInProgress = animateChart && revealProgress < 1;
  const moneyClipPath =
    revealInProgress && revealProgress > 0 ? `url(#${moneyClipId.current})` : undefined;
  const activityClipPath =
    revealInProgress && revealProgress > 0 ? `url(#${activityClipId.current})` : undefined;

  useLayoutEffect(() => {
    if (loading || rangedChartData.length === 0) return;
    measureContainer();
  }, [loading, rangedChartData.length, plotWidth, measureContainer]);

  const revealBudgetMs = useMemo(
    () => chartRevealBudgetMs(rangedChartData.length),
    [revealKey, rangedChartData.length]
  );

  const handleRangeChange = useCallback((range: ChartRange) => {
    setChartRange(range);
    setAnimateChart(true);
    setRevealProgress(0);
    setRevealKey((k) => k + 1);
  }, []);

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

  const rangeDescription = useMemo(
    () => rangeDescriptionFor(rangedChartData.length, chartRange),
    [chartRange, rangedChartData.length]
  );

  const axisTickClass = 'fill-gray-600 dark:fill-gray-400';

  const rangeToggle = (
    <div className="flex shrink-0 rounded-md border border-white/10 p-0.5 bg-black/[0.02] dark:bg-white/[0.03]">
      {CHART_RANGE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => handleRangeChange(option.id)}
          className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded transition-colors whitespace-nowrap ${
            chartRange === option.id
              ? 'glass-button neon-glow text-white'
              : 'glass-button-secondary text-gray-700 dark:text-gray-300 hover:bg-white/10'
          }`}
          aria-pressed={chartRange === option.id}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

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
          {rangeToggle}
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
                        padding={X_AXIS_PADDING}
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

                {/* Spacer matches activity right axis so timelines align. */}
                <div className="shrink-0" style={{ width: RIGHT_AXIS_WIDTH }} aria-hidden />
              </div>
            </div>
          ) : null}
        </PremiumContentGate>
        </div>
      </div>

      {/* Activity: closes, show-ups, booked calls, outbounds */}
      <div className="glass-card p-4 sm:p-6 min-w-0 flex flex-col">
        <div className="mb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
              Sales activity
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {rangeDescription} — outcomes + calendar sales bookings (left), outbounds (right).
            </p>
          </div>
        </div>

        <PremiumContentGate
          loading={loading}
          animate={false}
          skeleton={<ChartSkeleton height={ACTIVITY_CHART_HEIGHT} />}
        >
          {rangedChartData.length === 0 ? (
            <div
              className="flex items-center justify-center text-sm text-gray-500 premium-reveal"
              style={{ height: ACTIVITY_CHART_HEIGHT }}
            >
              No monthly data yet.
            </div>
          ) : plotWidth > 0 ? (
            <div className="w-full min-w-0">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-gray-600 dark:text-gray-400">
                {ACTIVITY_SERIES.map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {item.yAxisId === 'left' ? 'L' : 'R'}
                    </span>
                  </span>
                ))}
              </div>

              <div className="flex w-full min-w-0" style={{ height: ACTIVITY_CHART_HEIGHT }}>
                <div className="shrink-0" style={{ width: LEFT_AXIS_WIDTH }}>
                  <LeftCountAxisChart
                    data={rangedChartData}
                    domain={activityLeftDomain}
                    height={ACTIVITY_CHART_HEIGHT}
                    tickClass={axisTickClass}
                  />
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div style={{ width: plotWidth, height: ACTIVITY_CHART_HEIGHT }}>
                    <ComposedChart
                      width={plotWidth}
                      height={ACTIVITY_CHART_HEIGHT}
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
                            clipId={activityClipId.current}
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
                        padding={X_AXIS_PADDING}
                        interval={rangedChartData.length > 14 ? 'preserveStartEnd' : 0}
                        className={axisTickClass}
                      />
                      <YAxis
                        yAxisId="left"
                        hide
                        width={0}
                        domain={activityLeftDomain}
                        tickCount={Y_TICK_COUNT}
                        allowDecimals={false}
                      />
                      <YAxis
                        yAxisId="right"
                        hide
                        width={0}
                        domain={activityRightDomain}
                        tickCount={Y_TICK_COUNT}
                        allowDecimals={false}
                      />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(value: number, name: string) => [
                          Number(value).toLocaleString(),
                          name,
                        ]}
                      />
                      {ACTIVITY_SERIES.map((item) => (
                        <Line
                          key={item.dataKey}
                          yAxisId={item.yAxisId}
                          type="monotone"
                          dataKey={item.dataKey}
                          name={item.label}
                          stroke={item.color}
                          strokeWidth={2}
                          dot={{ r: 2.5 }}
                          connectNulls
                          clipPath={activityClipPath}
                          {...PREMIUM_LINE_ANIMATION}
                          isAnimationActive={false}
                        />
                      ))}
                    </ComposedChart>
                  </div>
                </div>

                <div className="shrink-0" style={{ width: RIGHT_AXIS_WIDTH }}>
                  <RightCountAxisChart
                    data={rangedChartData}
                    domain={activityRightDomain}
                    height={ACTIVITY_CHART_HEIGHT}
                    tickClass={axisTickClass}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </PremiumContentGate>
      </div>
    </div>
  );
}
