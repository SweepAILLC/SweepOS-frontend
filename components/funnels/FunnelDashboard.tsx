import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '@/lib/api';
import PageDateRange from '@/components/ui/PageDateRange';
import { useDateRange } from '@/contexts/DateRangeContext';
import { formatRange, ymdOf } from '@/lib/dateRange';
import KpiCommandCenterPanel from '@/components/kpi/KpiCommandCenterPanel';
import TeamSettingsView from '@/components/team/TeamSettingsView';
import FunnelScorecardGrid from '@/components/funnels/FunnelScorecardGrid';
import FunnelOverviewTab from '@/components/funnels/FunnelOverviewTab';
import GhlBadge from '@/components/funnels/GhlBadge';
import FunnelStepsTab from '@/components/funnels/FunnelStepsTab';
import FunnelStepDropoff from '@/components/funnels/FunnelStepDropoff';
import FunnelAdPerformanceDrawer from '@/components/funnels/FunnelAdPerformanceDrawer';
import FunnelSnapshotPicker from '@/components/funnels/FunnelSnapshotPicker';
import FunnelSimulatorModal from '@/components/portal/FunnelSimulatorModal';
import { paidSnapshotWeeklyBenchmarks, scenarioInputs } from '@/lib/funnelSimulator';
import type { FunnelSimulatorScenario } from '@/types/funnelSimulator';
import type {
  Funnel,
  FunnelDashboardResponse,
  FunnelTrackingStatus,
  FunnelWithSteps,
} from '@/types/funnel';

/**
 * Funnels tab (PRD phase 8): the tab's date range, a week-by-week scorecard of the
 * sheet's 23 metrics against a benchmark, two graphs, one sources table — all
 * from one /funnels/dashboard call. Replaces the funnel list + five-tab detail
 * view and is the single home for funnel-stage numbers (Sales KPIs links here).
 */

type FunnelChannelFilter = 'all' | 'organic' | 'paid';

const TRACKING: Record<FunnelTrackingStatus, { dot: string; label: string }> = {
  live: { dot: 'bg-emerald-500', label: 'Tracking live' },
  silent: { dot: 'bg-amber-500', label: 'No events in 24h' },
  errors: { dot: 'bg-red-500', label: 'Tracking errors' },
  no_funnels: { dot: 'bg-gray-400', label: 'No funnels yet' },
};

// Chart palette: spend (cost) vs cash (return) must read as opposites at a glance.
const SPEND_COLOR = '#ef4444';
const CASH_COLOR = '#10b981';
const STAGE_COLOR = '#8b5cf6';
const GRID_STROKE = 'rgba(148, 163, 184, 0.2)';
const AXIS_TICK = { fill: '#94a3b8', fontSize: 11 };
const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: 'rgba(17, 24, 39, 0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#e5e7eb' },
};
// Same blue palette as Terminal's "Leads by Source" pie.
const SOURCE_COLORS = ['#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'];

const UTM_GROUP_OPTIONS: { value: 'source' | 'medium' | 'campaign' | 'content'; label: string }[] = [
  { value: 'source', label: 'Source' },
  { value: 'medium', label: 'Medium' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'content', label: 'Ad' },
];

function usd(v: number | null | undefined, digits = 0): string {
  if (v == null) return '—';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function watchTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function weekLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-xl border border-white/10 p-3 sm:p-4 min-w-0">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
          {subtitle ? <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div> : null}
        </div>
        {action ? <div className="flex-shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

function DashboardModal({
  label,
  title,
  onClose,
  wide,
  children,
}: {
  label: string;
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-y-0 right-0 left-0 lg:left-[var(--app-sidebar-width,14rem)] z-[55] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button type="button" aria-label={`Close ${label}`} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative w-full ${wide ? 'max-w-3xl' : 'max-w-2xl'} max-h-[85vh] overflow-y-auto rounded-xl border border-white/10 bg-white dark:bg-gray-950 shadow-xl p-4 sm:p-6 space-y-6`}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SettingsModal({ funnelId, onClose }: { funnelId: string; onClose: () => void }) {
  const [funnel, setFunnel] = useState<FunnelWithSteps | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setFunnel(await apiClient.getFunnel(funnelId));
    } catch {
      setError('Failed to load funnel settings');
    }
  }, [funnelId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <DashboardModal label="Funnel settings" title={`${funnel?.name ?? 'Funnel'} settings`} onClose={onClose}>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {funnel ? (
        <>
          <FunnelOverviewTab funnel={funnel} onReload={() => void load()} />
          <FunnelStepsTab funnel={funnel} onReload={() => void load()} />
        </>
      ) : !error ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : null}
    </DashboardModal>
  );
}

/** Org KPI % targets, the same from every funnel view. */
function TargetsModal({ onClose }: { onClose: () => void }) {
  const [canEdit, setCanEdit] = useState(false);
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getCurrentUser()
      .then((u: { role?: string | null }) => {
        const role = String(u?.role || '').toLowerCase();
        if (!cancelled) setCanEdit(role === 'owner' || role === 'admin');
      })
      .catch(() => {
        /* the server still enforces owner/admin on every write */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <DashboardModal label="Targets" title="Targets" onClose={onClose} wide>
      <TeamSettingsView canEdit={canEdit} part="targets" />
    </DashboardModal>
  );
}

interface FunnelDashboardProps {
  /** Preselect a funnel (deep link /?tab=funnels&funnelId=…). */
  initialFunnelId?: string | null;
  /** Preselect a channel (deep link /?tab=funnels&channel=organic; old Team KPIs links land here). */
  initialChannel?: FunnelChannelFilter | null;
  /** Back to the funnel cards (FunnelListPanel). */
  onBack?: () => void;
}

export default function FunnelDashboard({
  initialFunnelId = null,
  initialChannel = null,
  onBack,
}: FunnelDashboardProps) {
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [funnelId, setFunnelId] = useState<string | null>(initialFunnelId);
  // Campaigns linked to the selected funnel (MetaCampaign.funnel_id) — drives the
  // campaign toggle. Its selection narrows both the aggregate scorecard's Ad Spend
  // row and the creative grid below it to one campaign instead of all of them.
  const [linkedCampaigns, setLinkedCampaigns] = useState<{ id: string; name: string | null }[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const hasLinkedCampaigns = linkedCampaigns.length > 0;
  useEffect(() => {
    setSelectedCampaignId(null);
    if (!funnelId) {
      setLinkedCampaigns([]);
      return;
    }
    let cancelled = false;
    apiClient
      .getMetaAdsFunnelMappings()
      .then((data) => {
        if (cancelled) return;
        const fm = data.funnels.find((f) => f.funnel_id === funnelId);
        setLinkedCampaigns((fm?.linked_campaigns || []).map((c) => ({ id: c.id, name: c.name })));
      })
      .catch(() => {
        if (!cancelled) setLinkedCampaigns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [funnelId]);
  // The Funnels tab's one date range (header picker) drives everything below.
  const { range } = useDateRange();
  const [channel, setChannel] = useState<FunnelChannelFilter>(initialChannel ?? 'all');
  const [targetsOpen, setTargetsOpen] = useState(false);
  useEffect(() => {
    if (initialChannel) setChannel(initialChannel);
  }, [initialChannel]);
  const [data, setData] = useState<FunnelDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [utmGroupBy, setUtmGroupBy] = useState<'source' | 'medium' | 'campaign' | 'content'>('source');
  // Snapshot each view compares against (null = historic averages / no model).
  const [paidSnapshot, setPaidSnapshot] = useState<FunnelSimulatorScenario | null>(null);
  const [organicSnapshot, setOrganicSnapshot] = useState<FunnelSimulatorScenario | null>(null);
  const [snapshotTick, setSnapshotTick] = useState(0);

  // Funnels never offer "All time" (the scorecard needs a start), so start is always set.
  const start = range.start ?? range.end;
  // "This month" rolls its end to today everywhere else in the app, but the weekly
  // scorecard is a month-shaped grid (docs: every Monday in the month gets a column,
  // including ones that haven't happened yet) — so on this tab only, extend through
  // the end of the calendar month instead of stopping the fetch window at today.
  const end = useMemo(() => {
    if (range.preset !== 'this_month') return range.end;
    const [y, m] = start.split('-').map(Number);
    const monthEnd = ymdOf(y, m, 0);
    return monthEnd > range.end ? monthEnd : range.end;
  }, [range.preset, range.end, start]);
  // The scorecard's Benchmark/Averages column is always this range's own average
  // (never the page's "vs previous period" compare) — that compare range is often
  // genuinely data-less, which read as a broken "$0 average" rather than a real
  // comparison. Deliberately not wired into the dashboard fetch below.
  // A single funnel is paid by definition — the channel only applies without one.
  const effectiveChannel: FunnelChannelFilter = funnelId ? 'paid' : channel;
  // Organic has no landing page or spend: it's the daily-activity calendar, not the scorecard.
  const isOrganicView = !funnelId && channel === 'organic';
  // Paid snapshots belong to one funnel (or to "all paid funnels"); "All channels" has none.
  const showPaidSnapshot = !isOrganicView && effectiveChannel === 'paid';

  useEffect(() => {
    setFunnelId(initialFunnelId);
  }, [initialFunnelId]);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getFunnels()
      .then((rows: unknown) => {
        if (!cancelled && Array.isArray(rows)) setFunnels(rows as Funnel[]);
      })
      .catch(() => {
        /* selector just lists "All funnels" */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isOrganicView) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .getFunnelDashboard({
        start,
        end,
        channel: effectiveChannel,
        funnel_id: funnelId,
        utm_group_by: utmGroupBy,
        campaign_id: selectedCampaignId,
      })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load the funnel dashboard');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [start, end, effectiveChannel, funnelId, reloadKey, isOrganicView, utmGroupBy, selectedCampaignId]);

  const viewTitle = funnelId
    ? funnels.find((f) => f.id === funnelId)?.name ?? 'Funnel'
    : channel === 'organic'
      ? 'Organic'
      : channel === 'paid'
        ? 'All paid funnels'
        : 'All channels';

  const summary = data?.summary ?? null;
  const scorecard = data?.scorecard ?? null;
  const tracking = TRACKING[data?.tracking.status ?? 'no_funnels'];
  const vslWatch = data?.vsl_watch ?? null;

  const stageBars = useMemo(() => {
    if (!summary) return [];
    const rows = [
      ...(data?.visitors != null ? [{ stage: 'Visitors', count: data.visitors }] : []),
      { stage: effectiveChannel === 'organic' ? 'Respondents' : 'Opt-ins', count: summary.opt_ins },
      { stage: 'Booked', count: summary.booked },
      { stage: 'Showed', count: summary.showed },
      { stage: 'Closed', count: summary.closed },
    ];
    return rows;
  }, [summary, data?.visitors, effectiveChannel]);

  const scorecardModel = useMemo(() => {
    if (!showPaidSnapshot || !paidSnapshot) return null;
    return {
      name: paidSnapshot.name,
      values: paidSnapshotWeeklyBenchmarks(scenarioInputs(paidSnapshot).paid),
    };
  }, [showPaidSnapshot, paidSnapshot]);

  const weekly = useMemo(
    () => (data?.weekly ?? []).map((w) => ({ ...w, label: weekLabel(w.week_start) })),
    [data?.weekly],
  );

  const { totalSpend, totalCash, roas } = useMemo(() => {
    const spend = weekly.reduce((sum, w) => sum + (w.spend_usd ?? 0), 0);
    const cash = weekly.reduce((sum, w) => sum + (w.cash_usd ?? 0), 0);
    return { totalSpend: spend, totalCash: cash, roas: spend > 0 ? cash / spend : null };
  }, [weekly],
  );

  return (
    <div
      className={`px-4 sm:px-6 lg:px-8 py-6 space-y-4 min-w-0 ${
        funnelId && hasLinkedCampaigns ? 'lg:pr-[3.75rem]' : ''
      }`}
    >
      {/* Header: the only controls on the page */}
      <div className="flex flex-wrap items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-white/10"
          >
            ← Funnels
          </button>
        ) : null}
        <h2 className="flex items-center gap-2 text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mr-2">
          {funnelId && funnels.find((f) => f.id === funnelId)?.source === 'ghl' ? <GhlBadge className="h-5 w-5" /> : null}
          {viewTitle}
        </h2>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {isOrganicView ? null : (
          <span
            className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300"
            title={
              data?.tracking.last_event_at
                ? `Last event ${new Date(data.tracking.last_event_at).toLocaleString()} · ${data.tracking.errors_24h} error(s) in 24h`
                : 'No tracked events yet'
            }
          >
            <span className={`h-2 w-2 rounded-full ${tracking.dot}`} aria-hidden />
            {tracking.label}
          </span>
          )}
          <button
            type="button"
            onClick={() => setTargetsOpen(true)}
            title={
              funnelId
                ? 'This funnel’s snapshot (model) — Compare dropdown picks which one the scorecard uses'
                : 'Org KPI targets and closer targets — the same from every view'
            }
            className="rounded-lg border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-1.5 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20"
          >
            🎯 Targets
          </button>
          {funnelId ? (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Funnel settings"
              title="Funnel ID, tracking snippet, and steps"
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-white/10"
            >
              ⚙ Settings
            </button>
          ) : null}
          <PageDateRange allowAllTime={false} />
        </div>
      </div>

      {isOrganicView ? (
        <>
          <div className="glass-card rounded-xl border border-white/10 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-semibold uppercase tracking-wide">Financial model</span>
              {organicSnapshot
                ? ' · targets show under each month in Grid view'
                : ' · pick a snapshot in Compare to'}
            </div>
            <FunnelSnapshotPicker
              mode="organic_dm"
              funnelId={null}
              noneLabel="No model"
              onChange={setOrganicSnapshot}
            />
          </div>
          <KpiCommandCenterPanel variant="organic" organicModel={organicSnapshot} />
        </>
      ) : (
        <>
      {error ? (
        <div className="glass-card rounded-xl border border-red-400/40 p-4 text-sm text-red-700 dark:text-red-300">
          {error}{' '}
          <button type="button" className="underline" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      {/* Left: leak + UTM stacked. Right: scorecard fills through to the Ad Performance rail. */}
      <div className="flex flex-col xl:flex-row gap-4 items-stretch">
      <div className="w-full xl:w-[22rem] xl:flex-shrink-0 space-y-4 order-2 xl:order-1 min-w-0">
        <Panel
          title="Where it leaks"
          subtitle="People reaching each stage in this range"
        >
          <div className="h-56">
            {stageBars.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageBars} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                  <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="stage" width={84} tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
                  <Bar dataKey="count" name="People" fill={STAGE_COLOR} radius={[0, 4, 4, 0]} barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">{loading ? 'Loading…' : 'No data'}</div>
            )}
          </div>
        </Panel>
        <Panel
          title="UTM sources"
          subtitle={`Grouped by utm_${utmGroupBy} on the lead`}
          action={
            <select
              value={utmGroupBy}
              onChange={(e) => setUtmGroupBy(e.target.value as typeof utmGroupBy)}
              className="text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-gray-900 dark:text-gray-100"
              aria-label="Group UTM sources by"
            >
              {UTM_GROUP_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          }
        >
          {data?.sources.length ? (
            <div className="flex flex-col gap-4 min-w-0">
              <div className="w-full min-w-0 max-w-full h-40 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip
                      content={({ payload }: any) => {
                        const p0 = payload?.[0];
                        if (!p0) return null;
                        const s = p0.payload as { source: string; opt_ins: number; closed: number; cash_usd: number };
                        return (
                          <div className="glass-panel px-3 py-2 rounded-lg text-xs text-gray-900 dark:text-gray-100">
                            <div className="font-semibold">{s.source}</div>
                            <div className="text-gray-600 dark:text-gray-300">{s.opt_ins.toLocaleString()} opt-ins</div>
                            <div className="text-gray-600 dark:text-gray-300">{s.closed} closed · {usd(s.cash_usd)}</div>
                          </div>
                        );
                      }}
                    />
                    <Pie
                      data={data.sources}
                      dataKey="opt_ins"
                      nameKey="source"
                      innerRadius={36}
                      outerRadius={58}
                      paddingAngle={2}
                      cornerRadius={10}
                      labelLine={false}
                      label={({ percent }: any) => (percent != null && percent > 0.04 ? `${Math.round(percent * 100)}%` : '')}
                    >
                      {data.sources.map((s, i) => (
                        <Cell key={`cell-${s.source}`} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <details className="glass-panel rounded-lg px-3 py-2 min-w-0 overflow-hidden">
                <summary className="cursor-pointer select-none list-none flex items-center justify-between gap-3 min-w-0">
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">Sources</span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">▼</span>
                </summary>
                <div className="mt-3 max-h-40 overflow-y-auto overscroll-y-contain space-y-2 pr-1">
                  {data.sources.map((s, i) => (
                    <div
                      key={s.source}
                      className="flex items-center justify-between gap-3 glass-panel rounded-lg px-3 py-2 min-w-0 max-w-full overflow-hidden"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length]} }
                        />
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate" title={s.source}>
                          {s.source}
                        </span>
                      </div>
                      <div className="text-right flex-shrink-0 min-w-0">
                        <div className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate">
                          {s.opt_ins.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {s.closed} closed · {usd(s.cash_usd)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {loading ? 'Loading…' : 'No leads in this range. UTM sources appear once funnels send utm with submitLead.'}
            </p>
          )}
        </Panel>
      </div>
      <div className="min-w-0 flex-1 order-1 xl:order-2">
      <div className="glass-card rounded-xl border border-white/10 p-3 sm:p-4 h-full">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Weekly scorecard · {formatRange(start, end)}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {showPaidSnapshot ? (
              <FunnelSnapshotPicker
                key={funnelId ?? 'all-paid'}
                mode="paid_vsl"
                funnelId={funnelId}
                noneLabel="Averages"
                onChange={setPaidSnapshot}
              />
            ) : null}
          </div>
        </div>
        {selectedCampaignId ? (
          <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
            Scoped to one campaign (via the Ad performance tab, far right) — read-only; hand edits apply to the
            funnel-wide total, so switch back to &quot;All linked campaigns&quot; there to edit.
          </p>
        ) : null}
        <FunnelScorecardGrid
          scorecard={scorecard}
          loading={loading}
          model={scorecardModel}
          onEditCell={
            selectedCampaignId
              ? undefined
              : async (weekStart, metricKey, value) => {
                  await apiClient.putFunnelScorecardOverride({
                    funnel_id: funnelId ?? null,
                    channel: effectiveChannel,
                    week_start: weekStart,
                    metric_key: metricKey,
                    value,
                  });
                  setReloadKey((k) => k + 1);
                }
          }
        />
      </div>
      </div>
      </div>

      {funnelId && hasLinkedCampaigns ? (
        <FunnelAdPerformanceDrawer
          funnelId={funnelId}
          linkedCampaigns={linkedCampaigns}
          selectedCampaignId={selectedCampaignId}
          onSelectedCampaignIdChange={setSelectedCampaignId}
          start={start}
          end={end}
        />
      ) : null}

      {/* Full width: weekly ad spend vs cash collected, same values as the scorecard grid */}
      <Panel title="Paid ads vs. cash collected" subtitle="Weekly, from the scorecard's Ad Spend and Cash Collected rows · CAC on hover">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs text-gray-600 dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: SPEND_COLOR }} />
            Paid ads
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CASH_COLOR }} />
            Cash collected
          </span>
        </div>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="w-full lg:w-3/4 h-64">
            {weekly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weekly} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} width={64} />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [usd(value), name]}
                    labelFormatter={(label, payload) => {
                      const cac = payload?.[0]?.payload?.cac_usd as number | null | undefined;
                      return `Week of ${label}${cac != null ? ` · CAC ${usd(cac)}` : ''}`;
                    }}
                  />
                  <Area type="monotone" dataKey="spend_usd" name="Paid ads" stroke={SPEND_COLOR} fill={SPEND_COLOR} fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="cash_usd" name="Cash collected" stroke={CASH_COLOR} fill={CASH_COLOR} fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">{loading ? 'Loading…' : 'No data'}</div>
            )}
          </div>

          <div className="w-full lg:w-1/4 flex flex-col gap-2 lg:h-64">
            <div className="glass-panel rounded-lg border-l-2 px-3 py-2 flex-1 flex flex-col justify-center min-w-0" style={{ borderLeftColor: CASH_COLOR }}>
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Total cash collected
                <span title="Calculated from scorecard data, not directly editable" aria-hidden className="text-gray-400 dark:text-gray-500">🔒</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums truncate">{usd(totalCash)}</div>
            </div>
            <div className="glass-panel rounded-lg border-l-2 px-3 py-2 flex-1 flex flex-col justify-center min-w-0" style={{ borderLeftColor: SPEND_COLOR }}>
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-600 dark:text-gray-300">
                Total ad spend
                <span title="Calculated from scorecard data, not directly editable" aria-hidden className="text-gray-400 dark:text-gray-500">🔒</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums truncate">{usd(totalSpend)}</div>
            </div>
            <div className="glass-panel rounded-lg border-l-2 border-amber-500 px-3 py-2 flex-1 flex flex-col justify-center min-w-0">
              <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-gray-600 dark:text-gray-300">
                ROAS
                <span title="Calculated from scorecard data, not directly editable" aria-hidden className="text-gray-400 dark:text-gray-500">🔒</span>
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white tabular-nums truncate">{roas != null ? `${roas.toFixed(2)}x` : '—'}</div>
            </div>
          </div>
        </div>
      </Panel>

      {vslWatch ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="glass-card rounded-xl border border-white/10 px-4 py-3">
            <div
              className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
              title={`Average across ${vslWatch.sessions} watch session${vslWatch.sessions === 1 ? '' : 's'}`}
            >
              Avg VSL watch time
            </div>
            <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {watchTime(vslWatch.avg_seconds)}
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {vslWatch.sessions} session{vslWatch.sessions === 1 ? '' : 's'} with video
            </div>
          </div>
          <div className="glass-card rounded-xl border border-white/10 px-4 py-3">
            <div
              className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400"
              title="Share of landing visitors who hit play on the VSL"
            >
              Play rate
            </div>
            <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {vslWatch.play_rate != null ? `${Math.round(vslWatch.play_rate * 100)}%` : '—'}
            </div>
            <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              {vslWatch.plays != null ? `${vslWatch.plays} play${vslWatch.plays === 1 ? '' : 's'}` : 'Visitors who started the video'}
              {data?.visitors != null ? ` · ${data.visitors} visitors` : ''}
            </div>
          </div>
        </div>
      ) : null}

      {/* Steps belong to one funnel, so the drop-off view needs a funnel selected */}
      {funnelId ? (
        <Panel title="Step drop-off" subtitle="Unique visitors reaching each tracked step in this range">
          <FunnelStepDropoff funnelId={funnelId} start={start} end={end} reloadKey={reloadKey} />
        </Panel>
      ) : null}

        </>
      )}

      {settingsOpen && funnelId ? <SettingsModal funnelId={funnelId} onClose={() => setSettingsOpen(false)} /> : null}
      {targetsOpen && funnelId ? (
        <FunnelSimulatorModal
          scope={{ mode: 'paid_vsl', funnelId }}
          initialScenarioId={paidSnapshot?.id}
          startFresh={!paidSnapshot}
          onSaved={(row) => {
            setPaidSnapshot(row);
            setSnapshotTick((n) => n + 1);
          }}
          onDeleted={(id) => {
            if (paidSnapshot?.id === id) setPaidSnapshot(null);
            setSnapshotTick((n) => n + 1);
          }}
          onClose={() => setTargetsOpen(false)}
        />
      ) : null}
      {targetsOpen && !funnelId ? <TargetsModal onClose={() => setTargetsOpen(false)} /> : null}
    </div>
  );
}
