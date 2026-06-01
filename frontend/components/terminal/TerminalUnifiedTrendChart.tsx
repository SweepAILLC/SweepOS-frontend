'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { apiClient } from '@/lib/api';
import { TERMINAL_DATA_REFRESHED_EVENT } from '@/lib/cache';
import type { HealthTrendPeriod } from '@/types/admin';
import { healthTrendPeriodsWithFinancesCash } from '@/lib/healthTrendMetrics';
import {
  type DashboardTimeRange,
  dashboardPeriodLabel,
  filterMonthlyCoachingPeriodsForDashboardRange,
} from '@/lib/dashboardTimeRange';

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'rgba(17, 24, 39, 0.95)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: '#e5e7eb' },
};

export default function TerminalUnifiedTrendChart() {
  const [periods, setPeriods] = useState<HealthTrendPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>('all');
  const periodsRef = useRef(periods);
  periodsRef.current = periods;

  const loadTrends = useCallback((forceRefresh = false) => {
    if (!forceRefresh && periodsRef.current.length === 0) setLoading(true);
    apiClient
      .getTerminalMonthlyTrends(forceRefresh)
      .then((d) => setPeriods(Array.isArray(d?.periods) ? d.periods : []))
      .catch(() => setPeriods([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadTrends();
    const onRefresh = () => loadTrends(true);
    window.addEventListener(TERMINAL_DATA_REFRESHED_EVENT, onRefresh);
    return () => window.removeEventListener(TERMINAL_DATA_REFRESHED_EVENT, onRefresh);
  }, [loadTrends]);

  const filtered = useMemo(
    () => filterMonthlyCoachingPeriodsForDashboardRange(periods, timeRange),
    [periods, timeRange]
  );

  const chartData = useMemo(() => healthTrendPeriodsWithFinancesCash(filtered), [filtered]);

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0 h-full flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
            Revenue &amp; calendar trends
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Combined monthly cash (Stripe + Whop), sales calls booked, show-up and close rates
          </p>
        </div>
        <select
          value={timeRange === 'all' ? 'all' : timeRange === 'mtd' ? 'mtd' : String(timeRange)}
          onChange={(e) => {
            const v = e.target.value;
            setTimeRange(v === 'all' ? 'all' : v === 'mtd' ? 'mtd' : Number(v));
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

      {loading && (
        <div className="flex-1 flex items-center justify-center min-h-[400px] text-sm text-gray-500">
          Loading trends…
        </div>
      )}

      {!loading && chartData.length === 0 && (
        <div className="flex-1 flex items-center justify-center min-h-[400px] text-sm text-gray-500">
          No monthly data yet for {dashboardPeriodLabel(timeRange).toLowerCase()}.
        </div>
      )}

      {!loading && chartData.length > 0 && (
        <div className="flex-1 min-h-[400px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minHeight={400}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 52, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
              <XAxis
                dataKey="period_label"
                tick={{ fontSize: 10 }}
                angle={-35}
                textAnchor="end"
                height={56}
                className="fill-gray-600 dark:fill-gray-400"
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `$${v}`}
                className="fill-gray-600 dark:fill-gray-400"
              />
              <YAxis
                yAxisId="rate"
                orientation="right"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
                className="fill-gray-600 dark:fill-gray-400"
              />
              <YAxis
                yAxisId="calls"
                orientation="right"
                tick={{ fontSize: 10 }}
                width={36}
                axisLine={false}
                tickLine={false}
                className="fill-gray-500 dark:fill-gray-500"
              />
              <Tooltip
                {...tooltipStyle}
                formatter={(value: number, name: string) => {
                  if (name === 'Sales calls booked') return [value ?? '—', name];
                  if (name.includes('rate')) return [`${value ?? '—'}%`, name];
                  return [`$${Number(value).toFixed(2)}`, name];
                }}
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="finances_cash_usd"
                name="Combined cash"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="calls"
                type="monotone"
                dataKey="calls_booked_count"
                name="Sales calls booked"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={{ r: 3 }}
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
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
