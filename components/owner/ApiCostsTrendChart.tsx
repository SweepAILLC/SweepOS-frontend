import { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { apiClient } from '@/lib/api';
import type { Organization, LlmUsageTimeseries } from '@/types/admin';
import {
  type DashboardTimeRange,
  dashboardPeriodLabel,
  financesTimelineApiParams,
} from '@/lib/dashboardTimeRange';
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

const currencyFmt = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

function formatDayLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Owner Health: estimated LLM API cost over time with org + time filters. */
export function ApiCostsTrendChart({
  organizations,
  className = '',
}: {
  organizations: Organization[];
  className?: string;
}) {
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>(30);
  const [orgId, setOrgId] = useState<string>('');
  const [data, setData] = useState<LlmUsageTimeseries | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const tl = financesTimelineApiParams(timeRange);
        const res = (await apiClient.getLlmUsageTimeseries({
          days: tl.days,
          scope: tl.scope,
          org_id: orgId || undefined,
        })) as LlmUsageTimeseries;
        if (!cancelled) setData(res);
      } catch (err: unknown) {
        if (!cancelled) {
          const msg =
            (err as { response?: { data?: { detail?: string } }; message?: string })?.response?.data
              ?.detail ||
            (err as { message?: string })?.message ||
            'Failed to load API cost trend';
          setError(typeof msg === 'string' ? msg : 'Failed to load API cost trend');
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [timeRange, orgId]);

  const chartRows =
    data?.points.map((p) => ({
      ...p,
      label: formatDayLabel(p.date),
    })) ?? [];

  const scopeLabel = orgId
    ? organizations.find((o) => o.id === orgId)?.name || data?.organization_name || 'Selected org'
    : 'All organizations';

  return (
    <div
      className={`glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
            API costs over time
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Estimated LLM spend ({scopeLabel}) · {dashboardPeriodLabel(timeRange)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={orgId}
            onChange={(e) => setOrgId(e.target.value)}
            className="text-sm glass-input rounded-md px-3 py-1.5 min-w-[10rem]"
            aria-label="Filter by organization"
          >
            <option value="">All organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
          <select
            value={timeRange === 'all' ? 'all' : timeRange === 'mtd' ? 'mtd' : String(timeRange)}
            onChange={(e) => {
              const v = e.target.value;
              setTimeRange(v === 'all' ? 'all' : v === 'mtd' ? 'mtd' : Number(v));
            }}
            className="text-sm glass-input rounded-md px-3 py-1.5"
            aria-label="Time range"
          >
            <option value="mtd">Month to Date</option>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
            <option value="all">All Time</option>
          </select>
        </div>
      </div>

      {data && (
        <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-600 dark:text-gray-400">
          <span>
            Est. cost:{' '}
            <strong className="text-amber-800 dark:text-amber-200 tabular-nums">
              $
              {data.estimated_cost_usd.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </strong>
          </span>
          <span>
            Calls: <strong className="tabular-nums text-gray-800 dark:text-gray-200">{data.calls.toLocaleString()}</strong>
          </span>
          <span>
            Tokens:{' '}
            <strong className="tabular-nums text-gray-800 dark:text-gray-200">
              {data.total_tokens.toLocaleString()}
            </strong>
          </span>
        </div>
      )}

      {loading && <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">Loading…</p>}
      {error && !loading && (
        <p className="text-sm text-red-600 dark:text-red-400 py-4">{error}</p>
      )}
      {!loading && !error && chartRows.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          No LLM usage in this window.
        </p>
      )}
      {!loading && !error && chartRows.length > 0 && (
        <div className="w-full min-w-0 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                className="fill-gray-600 dark:fill-gray-400"
                interval="preserveStartEnd"
                minTickGap={28}
              />
              <YAxis
                yAxisId="cost"
                tick={{ fontSize: 11 }}
                className="fill-gray-600 dark:fill-gray-400"
                tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
              />
              <YAxis
                yAxisId="calls"
                orientation="right"
                tick={{ fontSize: 11 }}
                className="fill-gray-600 dark:fill-gray-400"
                allowDecimals={false}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number, name: string) => {
                  if (name === 'Est. cost ($)') return [currencyFmt(Number(value) || 0), name];
                  return [Number(value).toLocaleString(), name];
                }}
              />
              <Legend />
              <Area
                yAxisId="cost"
                type="monotone"
                dataKey="estimated_cost_usd"
                name="Est. cost ($)"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.15}
                strokeWidth={2}
                {...PREMIUM_LINE_ANIMATION}
              />
              <Line
                yAxisId="calls"
                type="monotone"
                dataKey="calls"
                name="Calls"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                {...PREMIUM_LINE_ANIMATION}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
