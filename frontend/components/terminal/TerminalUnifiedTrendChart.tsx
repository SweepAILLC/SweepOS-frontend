'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Rectangle,
  Customized,
} from 'recharts';
import type { RectangleProps } from 'recharts';
import { apiClient } from '@/lib/api';
import { CALENDAR_BOOKINGS_UPDATED_EVENT, TERMINAL_DATA_REFRESHED_EVENT } from '@/lib/cache';
import type { HealthTrendPeriod } from '@/types/admin';
import { healthTrendPeriodsWithFinancesCash } from '@/lib/healthTrendMetrics';
import { chartRevealBudgetMs } from '@/lib/premiumMotion';
import { ChartSkeleton, PremiumContentGate } from '@/components/ui/PremiumMotion';

const CHART_HEIGHT = 400;

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
const LEFT_AXIS_WIDTH = 56;
const RIGHT_AXIS_WIDTH = 88;
const CHART_MARGIN = { top: 8, right: 0, left: 0, bottom: 56 };
const X_AXIS_HEIGHT = 56;
const Y_TICK_COUNT = 6;
const RATE_DOMAIN: [number, number] = [0, 100];

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: '#e5e7eb' },
};

const LEGEND_ITEMS = [
  { label: 'Combined cash', color: '#f59e0b' },
  { label: 'Sales calls booked', color: '#0ea5e9' },
  { label: 'Show-up rate', color: '#8b5cf6' },
  { label: 'Close rate', color: '#22c55e' },
] as const;

function axisMax(values: number[]): number {
  const max = values.reduce((m, v) => (Number.isFinite(v) ? Math.max(m, v) : m), 0);
  if (max <= 0) return 1;
  return Math.ceil(max * 1.08);
}

type RisingCashBarProps = RectangleProps & {
  index?: number;
  revealProgress: number;
  totalBars: number;
};

/** Linear left→right rise — each column grows at a constant pace. */
function RisingCashBar({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  fill = '#f59e0b',
  index = 0,
  revealProgress,
  totalBars,
}: RisingCashBarProps) {
  if (totalBars <= 0 || height <= 0) return null;

  const riseProgress = Math.min(1, Math.max(0, revealProgress * totalBars - index));
  if (riseProgress <= 0) return null;

  const animatedHeight = height * riseProgress;
  const animatedY = y + height - animatedHeight;

  return (
    <Rectangle
      x={x}
      y={animatedY}
      width={width}
      height={animatedHeight}
      fill={fill}
      radius={[4, 4, 0, 0]}
      isAnimationActive={false}
    />
  );
}

type ChartOffset = { left: number; top: number; right: number; bottom: number };

type TrendChartRow = ReturnType<typeof healthTrendPeriodsWithFinancesCash>[number];

const LeftCashAxisChart = memo(function LeftCashAxisChart({
  data,
  domain,
  tickClass,
}: {
  data: TrendChartRow[];
  domain: [number, number];
  tickClass: string;
}) {
  return (
    <ComposedChart width={LEFT_AXIS_WIDTH} height={CHART_HEIGHT} data={data} margin={CHART_MARGIN}>
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

const RightRateAxisChart = memo(function RightRateAxisChart({
  data,
  callsDomain,
  tickClass,
}: {
  data: TrendChartRow[];
  callsDomain: [number, number];
  tickClass: string;
}) {
  return (
    <ComposedChart width={RIGHT_AXIS_WIDTH} height={CHART_HEIGHT} data={data} margin={CHART_MARGIN}>
      <YAxis
        yAxisId="rate"
        orientation="right"
        width={52}
        domain={RATE_DOMAIN}
        tickCount={Y_TICK_COUNT}
        tick={{ fontSize: 11 }}
        tickFormatter={(v) => `${v}%`}
        className={tickClass}
      />
      <YAxis
        yAxisId="calls"
        orientation="right"
        width={36}
        axisLine={false}
        tickLine={false}
        domain={callsDomain}
        tickCount={Y_TICK_COUNT}
        tick={{ fontSize: 10 }}
        className="fill-gray-500 dark:fill-gray-500"
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
  const revealClipId = useRef(`terminal-trend-reveal-${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;

    const fetchTrends = () =>
      apiClient
        .getTerminalMonthlyTrends()
        .then((d) => {
          if (!cancelled) setPeriods(Array.isArray(d?.periods) ? d.periods : []);
        })
        .catch(() => {
          if (!cancelled) setPeriods([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

    fetchTrends();

    const onRefresh = () => {
      void apiClient
        .getTerminalMonthlyTrends(true)
        .then((d) => setPeriods(Array.isArray(d?.periods) ? d.periods : []))
        .catch(() => {});
    };
    window.addEventListener(TERMINAL_DATA_REFRESHED_EVENT, onRefresh);
    window.addEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, onRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener(TERMINAL_DATA_REFRESHED_EVENT, onRefresh);
      window.removeEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, onRefresh);
    };
  }, []);

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

  const rangedChartData = useMemo(
    () => sliceChartRange(chartData, chartRange),
    [chartData, chartRange]
  );

  const cashDomain = useMemo(
    (): [number, number] => [0, axisMax(rangedChartData.map((d) => d.finances_cash_usd))],
    [rangedChartData]
  );

  const callsDomain = useMemo(
    (): [number, number] => [0, axisMax(rangedChartData.map((d) => d.calls_booked_count))],
    [rangedChartData]
  );

  const plotViewportWidth = useMemo(() => {
    const base = viewportWidth > 0 ? viewportWidth : 720;
    return Math.max(200, base - LEFT_AXIS_WIDTH - RIGHT_AXIS_WIDTH);
  }, [viewportWidth]);

  const plotChartWidth = useMemo(() => {
    if (rangedChartData.length === 0) return 0;
    return plotViewportWidth;
  }, [rangedChartData.length, plotViewportWidth]);

  const revealInProgress = animateChart && revealProgress < 1;
  const lineClipPath =
    revealInProgress && revealProgress > 0 ? `url(#${revealClipId.current})` : undefined;

  useLayoutEffect(() => {
    if (loading || rangedChartData.length === 0) return;
    measureContainer();
  }, [loading, rangedChartData.length, plotChartWidth, measureContainer]);

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
  }, [loading, animateChart, revealKey, revealBudgetMs]);

  const rangeDescription = useMemo(() => {
    if (rangedChartData.length === 0) return '';
    if (chartRange === 'all') {
      return rangedChartData.length === 1
        ? 'All time (1 month)'
        : `All time (${rangedChartData.length} months)`;
    }
    const target = chartRange === '6m' ? 6 : 12;
    if (rangedChartData.length < target) {
      return `Last ${rangedChartData.length} month${rangedChartData.length !== 1 ? 's' : ''}`;
    }
    return chartRange === '6m' ? 'Last 6 months' : 'Last 12 months';
  }, [chartRange, rangedChartData.length]);

  const axisTickClass = 'fill-gray-600 dark:fill-gray-400';

  return (
    <div ref={containerRef} className="glass-card p-4 sm:p-6 min-w-0 flex flex-col">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            Revenue &amp; calendar trends
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {rangeDescription} — combined monthly cash (Stripe + Whop), sales calls booked, sales-call show-up and close rates.
          </p>
        </div>
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
      </div>

      <PremiumContentGate
        loading={loading}
        animate={false}
        skeleton={<ChartSkeleton height={CHART_HEIGHT} />}
      >
        {rangedChartData.length === 0 ? (
          <div
            className="flex items-center justify-center text-sm text-gray-500 premium-reveal"
            style={{ height: CHART_HEIGHT }}
          >
            No monthly data yet.
          </div>
        ) : plotChartWidth > 0 ? (
        <div className="w-full min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-gray-600 dark:text-gray-400">
            {LEGEND_ITEMS.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1.5">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>

          <div className="flex w-full min-w-0" style={{ height: CHART_HEIGHT }}>
            <div className="shrink-0" style={{ width: LEFT_AXIS_WIDTH }}>
              <LeftCashAxisChart data={rangedChartData} domain={cashDomain} tickClass={axisTickClass} />
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              <div style={{ width: plotChartWidth, height: CHART_HEIGHT }}>
                <ComposedChart
                  width={plotChartWidth}
                  height={CHART_HEIGHT}
                  data={rangedChartData}
                  margin={{ top: CHART_MARGIN.top, right: 12, left: 4, bottom: 0 }}
                  barCategoryGap={rangedChartData.length > 12 ? '10%' : '18%'}
                  barGap={2}
                >
                  <Customized
                    component={(props: { width?: number; height?: number; offset?: ChartOffset }) => (
                      <ChartRevealClip
                        width={props.width}
                        height={props.height}
                        offset={props.offset}
                        revealProgress={revealProgress}
                        clipId={revealClipId.current}
                      />
                    )}
                  />
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
                  <XAxis
                    dataKey="period_label"
                    tick={{ fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                    height={X_AXIS_HEIGHT}
                    interval={rangedChartData.length > 14 ? 'preserveStartEnd' : 0}
                    className={axisTickClass}
                  />
                  <YAxis yAxisId="left" hide width={0} domain={cashDomain} tickCount={Y_TICK_COUNT} />
                  <YAxis yAxisId="rate" hide width={0} domain={RATE_DOMAIN} tickCount={Y_TICK_COUNT} />
                  <YAxis yAxisId="calls" hide width={0} domain={callsDomain} tickCount={Y_TICK_COUNT} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value: number, name: string) => {
                      if (name === 'Sales calls booked') return [value ?? '—', name];
                      if (name.includes('rate')) return [`${value ?? '—'}%`, name];
                      return [`$${Number(value).toFixed(2)}`, name];
                    }}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="finances_cash_usd"
                    name="Combined cash"
                    fill="#f59e0b"
                    isAnimationActive={false}
                    shape={(props: unknown) => (
                      <RisingCashBar
                        {...(props as RisingCashBarProps)}
                        revealProgress={revealProgress}
                        totalBars={rangedChartData.length}
                      />
                    )}
                  />
                  <Line
                    yAxisId="calls"
                    type="monotone"
                    dataKey="calls_booked_count"
                    name="Sales calls booked"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                    clipPath={lineClipPath}
                  />
                  <Line
                    yAxisId="rate"
                    type="monotone"
                    dataKey="show_up_rate_pct"
                    name="Show-up rate"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                    clipPath={lineClipPath}
                  />
                  <Line
                    yAxisId="rate"
                    type="monotone"
                    dataKey="close_rate_pct"
                    name="Close rate"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                    clipPath={lineClipPath}
                  />
                </ComposedChart>
              </div>
            </div>

            <div className="shrink-0" style={{ width: RIGHT_AXIS_WIDTH }}>
              <RightRateAxisChart
                data={rangedChartData}
                callsDomain={callsDomain}
                tickClass={axisTickClass}
              />
            </div>
          </div>
        </div>
        ) : null}
      </PremiumContentGate>
    </div>
  );
}
