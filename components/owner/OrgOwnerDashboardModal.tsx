import { useEffect, useId, useMemo, useState } from 'react';
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
import type { HealthTrendPeriod, Organization, OrganizationDashboardSummary } from '@/types/admin';
import { PIPELINE_COLUMNS, normalizeLifecycleColumn } from '@/lib/pipelineColumns';
import { buildPipelineFunnelPath } from '@/lib/pipelineFunnel';
import { healthTrendPeriodsWithFinancesCash } from '@/lib/healthTrendMetrics';
import { ApiCostsTrendChart } from '@/components/owner/ApiCostsTrendChart';
import { CashAndLtvTrendChart } from '@/components/owner/OwnerHealthTrendCharts';
import SharedTypingPad from '@/components/portal/SharedTypingPad';
import {
  type DashboardTimeRange,
  dashboardPeriodLabel,
} from '@/lib/dashboardTimeRange';
import ShinyButton from '@/components/ui/ShinyButton';

const LIVE_POLL_MS = 30000;

function formatUsd(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

function formatPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function OrgPipelineDiagram({
  clientsByStatus,
  totalClients,
}: {
  clientsByStatus: Record<string, number>;
  totalClients: number;
}) {
  const gradientId = `orgPipeGrad-${useId().replace(/:/g, '')}`;
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const col of PIPELINE_COLUMNS) map[col.id] = 0;
    for (const [raw, count] of Object.entries(clientsByStatus || {})) {
      const id = normalizeLifecycleColumn(raw);
      if (id) map[id] = (map[id] || 0) + Number(count || 0);
      else if (raw) map[raw] = Number(count || 0);
    }
    return map;
  }, [clientsByStatus]);

  const maxCount = Math.max(...Object.values(counts), 1);
  const heights = PIPELINE_COLUMNS.map((col) => {
    const c = counts[col.id] || 0;
    return c === 0 ? 0 : (c / maxCount) * 100;
  });
  const pathD = buildPipelineFunnelPath(heights);
  const segmentWidth = 100 / PIPELINE_COLUMNS.length;

  return (
    <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text">
          Pipeline
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {totalClients} clients
        </span>
      </div>
      <div className="flex gap-0 mb-1 min-w-0 overflow-x-auto">
        {PIPELINE_COLUMNS.map((column) => (
          <div
            key={column.id}
            className="flex-1 min-w-[3.25rem] flex flex-col items-center justify-center gap-0 py-1 px-0.5"
          >
            <span className="text-[9px] sm:text-[10px] font-medium text-gray-600 dark:text-gray-400 truncate w-full text-center">
              {column.shortTitle}
            </span>
            <span className="text-sm sm:text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {counts[column.id] || 0}
            </span>
          </div>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-xl border border-gray-300 dark:border-white/20 h-28 sm:h-32 bg-gray-100 dark:bg-gray-800/50">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
              <stop offset="0%" stopColor="#93c5fd" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <path d={pathD} fill={`url(#${gradientId})`} />
        </svg>
        {PIPELINE_COLUMNS.map((column, index) => (
          <div
            key={column.id}
            className="absolute inset-0"
            style={{ left: `${index * segmentWidth}%`, width: `${segmentWidth}%` }}
            title={`${column.title}: ${counts[column.id] || 0}`}
          />
        ))}
      </div>
    </section>
  );
}

function OrgTerminalTrendChart({ periods }: { periods: HealthTrendPeriod[] }) {
  const chartData = useMemo(() => healthTrendPeriodsWithFinancesCash(periods), [periods]);
  const ranged = useMemo(() => chartData.slice(-12), [chartData]);

  if (ranged.length === 0) {
    return (
      <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text mb-2">
          Terminal trends
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">No monthly trend data yet.</p>
      </section>
    );
  }

  return (
    <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text">
          Terminal trends
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Live org metrics — combined cash, calls booked, show-up & close rates (last 12 months).
        </p>
      </div>
      <div className="h-72 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={ranged}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
            <XAxis dataKey="period_label" tick={{ fontSize: 10 }} className="fill-gray-600 dark:fill-gray-400" />
            <YAxis yAxisId="left" tick={{ fontSize: 11 }} className="fill-gray-600 dark:fill-gray-400" />
            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              className="fill-gray-600 dark:fill-gray-400"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: '#e5e7eb' }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="finances_cash_usd"
              name="Combined ($)"
              fill="#f59e0b"
              radius={[4, 4, 0, 0]}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="calls_booked_count"
              name="Calls booked"
              stroke="#0ea5e9"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="show_up_rate_pct"
              name="Show-up %"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="close_rate_pct"
              name="Close %"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export type OrgOwnerDashboardModalProps = {
  orgId: string;
  dashboardData: OrganizationDashboardSummary;
  organizations: Organization[];
  onClose: () => void;
  onRefreshDashboard: (timeRange?: DashboardTimeRange) => Promise<void>;
  timeRange: DashboardTimeRange;
  onTimeRangeChange: (tr: DashboardTimeRange) => void;
  // seats
  maxUserSeatsInput: string;
  setMaxUserSeatsInput: (v: string) => void;
  savingSeats: boolean;
  onSaveSeats: () => void;
  // consulting
  consultingTierInput: '' | 'pro_consulting' | 'core_consulting';
  setConsultingTierInput: (v: '' | 'pro_consulting' | 'core_consulting') => void;
  bookingUrlInput: string;
  setBookingUrlInput: (v: string) => void;
  savingConsulting: boolean;
  onSaveConsulting: () => void;
  // funnels
  editingFunnel: string | null;
  setEditingFunnel: (id: string | null) => void;
  funnelFormData: {
    name: string;
    client_id: string;
    slug: string;
    domain: string;
    env: string;
  };
  setFunnelFormData: (v: {
    name: string;
    client_id: string;
    slug: string;
    domain: string;
    env: string;
  }) => void;
  onUpdateFunnel: (id: string) => void;
  onDeleteFunnel: (id: string) => void;
  // tab permissions
  orgTabPermissions: Array<{ tab_name: string; enabled: boolean }>;
  loadingTabPermissions: boolean;
  onToggleTabPermission: (tabName: string, enabled: boolean) => void;
  tabPermissionDisplayName: (tab: string) => string;
};

export default function OrgOwnerDashboardModal({
  orgId,
  dashboardData,
  organizations,
  onClose,
  onRefreshDashboard,
  timeRange,
  onTimeRangeChange,
  maxUserSeatsInput,
  setMaxUserSeatsInput,
  savingSeats,
  onSaveSeats,
  consultingTierInput,
  setConsultingTierInput,
  bookingUrlInput,
  setBookingUrlInput,
  savingConsulting,
  onSaveConsulting,
  editingFunnel,
  setEditingFunnel,
  funnelFormData,
  setFunnelFormData,
  onUpdateFunnel,
  onDeleteFunnel,
  orgTabPermissions,
  loadingTabPermissions,
  onToggleTabPermission,
  tabPermissionDisplayName,
}: OrgOwnerDashboardModalProps) {
  const [refreshToken, setRefreshToken] = useState(0);
  const [liveRefreshing, setLiveRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      setLiveRefreshing(true);
      try {
        await onRefreshDashboard(timeRange);
        if (!cancelled) setRefreshToken((n) => n + 1);
      } finally {
        if (!cancelled) setLiveRefreshing(false);
      }
    };
    const id = setInterval(() => void tick(), LIVE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [onRefreshDashboard, timeRange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const llm = dashboardData.llm_usage_last_30d;
  const periods = dashboardData.monthly_health_since_onboarding ?? [];
  const rangeLabel = dashboardPeriodLabel(timeRange);
  const rangeLabelLower = rangeLabel.toLowerCase();
  const cashLabel =
    timeRange === 'mtd'
      ? 'Combined cash MTD'
      : timeRange === 'all'
        ? 'Combined cash (all time)'
        : `Combined cash (${rangeLabelLower})`;

  return (
    <div className="w-full min-w-0 space-y-5" role="region" aria-labelledby="org-dash-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 shrink-0 inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-white/15 bg-white/60 dark:bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10"
            aria-label="Back to organizations"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Orgs
          </button>
          <div className="min-w-0">
            <h2
              id="org-dash-title"
              className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate"
            >
              {dashboardData.organization_name}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Org dashboard
              {liveRefreshing ? ' · refreshing…' : ' · live'}
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-5">
          {/* Terminal KPIs + time scope */}
          <section className="glass-card p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Key metrics
                </h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Same Terminal KPI set for this org · Stripe + Whop + Manual
                </p>
              </div>
              <select
                value={
                  timeRange === 'all' ? 'all' : timeRange === 'mtd' ? 'mtd' : String(timeRange)
                }
                onChange={(e) => {
                  const v = e.target.value;
                  onTimeRangeChange(v === 'all' ? 'all' : v === 'mtd' ? 'mtd' : Number(v));
                }}
                className="text-sm glass-input rounded-md px-3 py-1.5"
              >
                <option value="mtd">Month to date</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last year</option>
                <option value="all">All time</option>
              </select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1.5 sm:gap-2 min-w-0">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-2 min-w-0">
                <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-gray-100 truncate">
                  {formatUsd(dashboardData.kpi_cash_usd ?? 0)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-0.5 leading-snug">
                  {cashLabel}
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-2 min-w-0">
                <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-gray-100 truncate">
                  {formatUsd(dashboardData.kpi_mrr_usd ?? dashboardData.total_mrr ?? 0)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">MRR</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-2 min-w-0">
                <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-gray-100 truncate">
                  {formatUsd(dashboardData.kpi_avg_ltv_usd)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                  Avg LTV
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-2 min-w-0">
                <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-gray-100 truncate">
                  {(dashboardData.kpi_upcoming_count ?? 0).toLocaleString()}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                  Upcoming ({rangeLabelLower})
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-2 min-w-0">
                <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-gray-100 truncate">
                  {formatUsd(dashboardData.kpi_aov_usd)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                  AOV ({rangeLabelLower})
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-2 min-w-0">
                <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-gray-100 truncate">
                  {formatPct(dashboardData.kpi_close_rate_pct)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                  Sales close rate
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-1.5 sm:px-2.5 sm:py-2 min-w-0">
                <p className="text-sm sm:text-base font-bold tabular-nums text-gray-900 dark:text-gray-100 truncate">
                  {formatPct(dashboardData.kpi_show_up_rate_pct)}
                </p>
                <p className="text-[10px] sm:text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                  Show-up rate
                </p>
              </div>
            </div>
          </section>

          <OrgPipelineDiagram
            clientsByStatus={dashboardData.clients_by_status || {}}
            totalClients={dashboardData.total_clients}
          />

          {/* Growth since platform onboarding — mirrors Owner Health */}
          <section className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 digitized-text">
                Growth since onboarding
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Holistic coaching & revenue signals for this org since joining Sweep
                {dashboardData.organization_onboarded_at
                  ? ` (${new Date(dashboardData.organization_onboarded_at).toLocaleDateString(undefined, {
                      dateStyle: 'medium',
                    })})`
                  : ''}
                .
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                <p className="text-[10px] digitized-text text-gray-500">Cash since onboarding</p>
                <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatUsd(
                    dashboardData.finances_combined_since_onboarding_usd ??
                      dashboardData.cash_collected_since_onboarding_usd ??
                      0,
                    2
                  )}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">Post-onboarding processor cash</p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                <p className="text-[10px] digitized-text text-gray-500">Show-up rate (30d)</p>
                <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatPct(dashboardData.show_up_rate_last_30d_pct)}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                <p className="text-[10px] digitized-text text-gray-500">Sales close rate (30d)</p>
                <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatPct(dashboardData.close_rate_last_30d_pct)}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                <p className="text-[10px] digitized-text text-gray-500">Calls booked (30d)</p>
                <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {(dashboardData.calls_booked_last_30d ?? 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Prior 30d: {(dashboardData.calls_booked_previous_30d ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                <p className="text-[10px] digitized-text text-gray-500">Active clients</p>
                <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {(dashboardData.lifecycle_active_clients_current ?? 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Tenured active:{' '}
                  {(dashboardData.lifecycle_active_clients_previous_30d_cohort ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5 p-3">
                <p className="text-[10px] digitized-text text-gray-500">Users / seats</p>
                <p className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {dashboardData.total_users ?? 0}
                  {dashboardData.max_user_seats != null
                    ? ` / ${dashboardData.max_user_seats}`
                    : ''}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {dashboardData.max_user_seats == null ? 'Unlimited seats' : 'Seat limit'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10">
                <CashAndLtvTrendChart data={periods} />
              </div>
              <OrgTerminalTrendChart periods={periods} />
            </div>
          </section>

          <ApiCostsTrendChart
            organizations={organizations}
            lockedOrgId={orgId}
            refreshToken={refreshToken}
          />

          {llm ? (
            <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text mb-3">
                API usage (30d)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
                  <p className="text-xs text-gray-500">Calls</p>
                  <p className="text-lg font-bold tabular-nums">{llm.calls.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
                  <p className="text-xs text-gray-500">Tokens</p>
                  <p className="text-lg font-bold tabular-nums">{llm.total_tokens.toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
                  <p className="text-xs text-gray-500">Prompt / out</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {llm.prompt_tokens.toLocaleString()} / {llm.completion_tokens.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-amber-200/80 dark:border-amber-500/25 p-3">
                  <p className="text-xs text-amber-800 dark:text-amber-200">Est. cost</p>
                  <p className="text-lg font-bold tabular-nums text-amber-900 dark:text-amber-100">
                    $
                    {llm.estimated_cost_usd.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <SharedTypingPad
            orgId={orgId}
            title="Shared space"
            subtitle="Live notepad for this org’s consulting portal — clients see updates as you type."
          />

          <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10 space-y-4 max-w-xl">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text mb-2">
              Seats & consulting
            </h3>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <input
                type="number"
                min={0}
                placeholder="Unlimited seats"
                value={maxUserSeatsInput}
                onChange={(e) => setMaxUserSeatsInput(e.target.value)}
                className="w-28 px-3 py-1.5 glass-input rounded-md text-sm"
              />
              <ShinyButton onClick={onSaveSeats} disabled={savingSeats} className="px-3 py-1.5 text-sm">
                {savingSeats ? 'Saving…' : 'Save seats'}
              </ShinyButton>
            </div>
            <select
              value={consultingTierInput}
              onChange={(e) =>
                setConsultingTierInput(
                  e.target.value as '' | 'pro_consulting' | 'core_consulting'
                )
              }
              className="w-full px-3 py-2 glass-input rounded-md text-sm mb-2"
            >
              <option value="">No consulting tier</option>
              <option value="core_consulting">Core Consulting</option>
              <option value="pro_consulting">Pro Consulting</option>
            </select>
            <input
              type="url"
              value={bookingUrlInput}
              onChange={(e) => setBookingUrlInput(e.target.value)}
              placeholder="https://cal.com/your-user/30min"
              className="w-full px-3 py-2 glass-input rounded-md text-sm mb-1"
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Cal.com event link — embedded in the org portal so teams can book in-place.
            </p>
            <ShinyButton
              onClick={onSaveConsulting}
              disabled={savingConsulting}
              className="px-3 py-1.5 text-sm"
            >
              {savingConsulting ? 'Saving…' : 'Save consulting'}
            </ShinyButton>
          </section>

          {/* Combined funnels section */}
          <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text">
                  Funnels & analytics
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {dashboardData.total_events.toLocaleString()} events ·{' '}
                  {dashboardData.total_visitors.toLocaleString()} visitors ·{' '}
                  {dashboardData.active_funnels} active
                </p>
              </div>
            </div>

            {(dashboardData.funnel_conversion_metrics?.length ?? 0) > 0 ? (
              <div className="space-y-3">
                {dashboardData.funnel_conversion_metrics.map((funnel) => (
                  <div
                    key={funnel.funnel_id}
                    className="rounded-lg border border-gray-200 dark:border-white/10 bg-white/40 dark:bg-white/5 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100">{funnel.funnel_name}</h4>
                      <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
                        {funnel.overall_conversion_rate.toFixed(1)}% conversion
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs text-gray-600 dark:text-gray-400 mb-2">
                      <span>{funnel.total_visitors.toLocaleString()} visitors</span>
                      <span>{funnel.total_conversions.toLocaleString()} conversions</span>
                    </div>
                    {funnel.step_counts?.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {funnel.step_counts.map((step, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-200"
                          >
                            {step.label || step.event_name}: {step.count.toLocaleString()}
                            {step.conversion_rate != null ? (
                              <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                                ({step.conversion_rate.toFixed(0)}%)
                              </span>
                            ) : null}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No conversion metrics in the last 30 days.</p>
            )}

            {editingFunnel ? (
              <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3 space-y-2">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Edit funnel</p>
                <input
                  type="text"
                  value={funnelFormData.name}
                  onChange={(e) => setFunnelFormData({ ...funnelFormData, name: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md text-sm"
                  placeholder="Name"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={funnelFormData.domain}
                    onChange={(e) => setFunnelFormData({ ...funnelFormData, domain: e.target.value })}
                    className="w-full px-3 py-2 glass-input rounded-md text-sm"
                    placeholder="Domain"
                  />
                  <input
                    type="text"
                    value={funnelFormData.slug}
                    onChange={(e) => setFunnelFormData({ ...funnelFormData, slug: e.target.value })}
                    className="w-full px-3 py-2 glass-input rounded-md text-sm"
                    placeholder="Slug"
                  />
                </div>
                <select
                  value={funnelFormData.env}
                  onChange={(e) => setFunnelFormData({ ...funnelFormData, env: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md text-sm"
                >
                  <option value="">Select environment</option>
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onUpdateFunnel(editingFunnel)}
                    className="glass-button neon-glow px-3 py-1.5 rounded-md text-sm"
                  >
                    Update
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingFunnel(null);
                      setFunnelFormData({ name: '', client_id: '', slug: '', domain: '', env: '' });
                    }}
                    className="glass-button-secondary px-3 py-1.5 rounded-md text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              {dashboardData.recent_funnels.length > 0 ? (
                dashboardData.recent_funnels.map((funnel) => (
                  <div
                    key={funnel.id}
                    className="flex justify-between items-center py-2 px-3 rounded-lg border border-gray-200/60 dark:border-white/10"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{funnel.name}</p>
                      {funnel.domain ? (
                        <p className="text-xs text-gray-500">{funnel.domain}</p>
                      ) : null}
                    </div>
                    <div className="flex gap-2 text-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingFunnel(funnel.id);
                          setFunnelFormData({
                            name: funnel.name,
                            client_id: '',
                            slug: '',
                            domain: funnel.domain || '',
                            env: '',
                          });
                        }}
                        className="text-blue-500 hover:text-blue-400"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteFunnel(funnel.id)}
                        className="text-red-500 hover:text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-2">No funnels yet.</p>
              )}
            </div>
          </section>

          {/* Tab permissions */}
          <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text mb-2">
              Tab permissions
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Control which product tabs this org can access.
            </p>
            {loadingTabPermissions ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {orgTabPermissions.map((permission) => (
                  <label
                    key={permission.tab_name}
                    className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-gray-200/60 dark:border-white/10 cursor-pointer"
                  >
                    <span className="text-sm text-gray-900 dark:text-gray-100">
                      {tabPermissionDisplayName(permission.tab_name)}
                    </span>
                    <input
                      type="checkbox"
                      checked={permission.enabled}
                      onChange={(e) => onToggleTabPermission(permission.tab_name, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-violet-600"
                    />
                  </label>
                ))}
              </div>
            )}
          </section>
      </div>
    </div>
  );
}
