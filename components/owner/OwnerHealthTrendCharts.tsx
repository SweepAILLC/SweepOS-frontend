import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { HealthTrendPeriod } from '@/types/admin';
import {
  enrichPeriodsWithLtv,
  formatPctMoM,
  formatPpMoM,
  lastTwoDefined,
} from '@/lib/healthTrendMetrics';
import { PREMIUM_LINE_ANIMATION } from '@/lib/premiumMotion';

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: '#e5e7eb' },
};

export type ShowUpCloseRow = {
  period_label: string;
  show_up_rate_pct: number | null;
  close_rate_pct: number | null;
};

function RatesMomSummary({ data }: { data: ShowUpCloseRow[] }) {
  const pairSup = lastTwoDefined(data.map((d) => d.show_up_rate_pct));
  const pairCr = lastTwoDefined(data.map((d) => d.close_rate_pct));
  if (!pairSup && !pairCr) return null;
  const parts: string[] = [];
  if (pairSup) {
    parts.push(`Show-up ${formatPpMoM(pairSup[0], pairSup[1])} vs prior month`);
  }
  if (pairCr) {
    parts.push(`Close ${formatPpMoM(pairCr[0], pairCr[1])} vs prior month`);
  }
  return <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{parts.join(' · ')}</p>;
}

function LtvMomSummary({ data }: { data: HealthTrendPeriod[] }) {
  const enriched = useMemo(() => enrichPeriodsWithLtv(data), [data]);
  const pair = lastTwoDefined(enriched.map((d) => d.display_ltv_usd));
  if (!pair) return null;
  const [prev, curr] = pair;
  const dir = curr >= prev ? 'growth' : 'decay';
  return (
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
      LTV proxy {dir}: {formatPctMoM(prev, curr)} vs prior month (cumulative Finances cash ÷ roster
      {data.some((p) => p.avg_client_ltv_usd != null && p.avg_client_ltv_usd > 0)
        ? '; API value used when provided'
        : ''}
      )
    </p>
  );
}

type XAxisMode = 'horizontal' | 'tilted';

function xAxisProps(mode: XAxisMode) {
  if (mode === 'tilted') {
    return {
      tick: { fontSize: 10 },
      angle: -35 as const,
      textAnchor: 'end' as const,
      height: 56,
    };
  }
  return { tick: { fontSize: 11 } };
}

/** Show-up % vs close % — same series as platform health, per-org monthly, and Calendar tab. */
export function ShowUpVsCloseRateChart({
  data,
  heightPx = 288,
  xAxisMode = 'horizontal',
  title = 'Show-up vs close rate',
  description,
  className = '',
}: {
  data: ShowUpCloseRow[];
  heightPx?: number;
  xAxisMode?: XAxisMode;
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {title ? (
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{title}</p>
      ) : null}
      {description ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{description}</p>
      ) : null}
      <RatesMomSummary data={data} />
      <div className="w-full min-w-0" style={{ height: heightPx }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
            <XAxis
              dataKey="period_label"
              className="fill-gray-600 dark:fill-gray-400"
              {...xAxisProps(xAxisMode)}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              className="fill-gray-600 dark:fill-gray-400"
              label={
                xAxisMode === 'horizontal'
                  ? { value: '%', angle: 0, position: 'insideTopLeft', fill: 'currentColor' }
                  : undefined
              }
            />
            <Tooltip {...tooltipStyle} />
            <Legend />
            <Line
              type="monotone"
              dataKey="show_up_rate_pct"
              name="Show-up %"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              {...PREMIUM_LINE_ANIMATION}
            />
            <Line
              type="monotone"
              dataKey="close_rate_pct"
              name="Close %"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              {...PREMIUM_LINE_ANIMATION}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const currencyFmt = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Average revenue per client record over time (LTV proxy from health trend periods). */
export function ClientLtvTrendChart({
  data,
  heightPx = 288,
  xAxisMode = 'horizontal',
  title = 'Client LTV (proxy)',
  description = 'Cumulative Finances cash in scope (Stripe + Whop per month when the API reports combined revenue; otherwise Stripe-only for that month) ÷ cumulative client records. Rises or falls as revenue outpaces roster growth or the reverse.',
  className = '',
}: {
  data: HealthTrendPeriod[];
  heightPx?: number;
  xAxisMode?: XAxisMode;
  title?: string;
  description?: string;
  className?: string;
}) {
  const enriched = useMemo(() => enrichPeriodsWithLtv(data), [data]);

  return (
    <div className={className}>
      {title ? (
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">{title}</p>
      ) : null}
      {description ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{description}</p>
      ) : null}
      <LtvMomSummary data={data} />
      <div className="w-full min-w-0" style={{ height: heightPx }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={enriched}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
            <XAxis
              dataKey="period_label"
              className="fill-gray-600 dark:fill-gray-400"
              {...xAxisProps(xAxisMode)}
            />
            <YAxis
              tick={{ fontSize: 11 }}
              className="fill-gray-600 dark:fill-gray-400"
              tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
            />
            <Tooltip
              {...tooltipStyle}
              formatter={(value: number) => [currencyFmt(value), 'LTV proxy']}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="display_ltv_usd"
              name="LTV proxy ($)"
              stroke="#a855f7"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
              {...PREMIUM_LINE_ANIMATION}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
