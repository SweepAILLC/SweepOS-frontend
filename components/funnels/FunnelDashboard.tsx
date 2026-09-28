import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '@/lib/api';
import { setPipelineGridIntent } from '@/lib/pipelineStore';
import PageDateRange from '@/components/ui/PageDateRange';
import { useDateRange } from '@/contexts/DateRangeContext';
import { formatRange } from '@/lib/dateRange';
import KpiCommandCenterPanel from '@/components/kpi/KpiCommandCenterPanel';
import TeamSettingsView from '@/components/team/TeamSettingsView';
import FunnelScorecardGrid from '@/components/funnels/FunnelScorecardGrid';
import FunnelOverviewTab from '@/components/funnels/FunnelOverviewTab';
import FunnelStepsTab from '@/components/funnels/FunnelStepsTab';
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
const SPEND_COLOR = '#6366f1';
const CASH_COLOR = '#10b981';
const STAGE_COLOR = '#8b5cf6';
const GRID_STROKE = 'rgba(148, 163, 184, 0.2)';
const AXIS_TICK = { fill: '#94a3b8', fontSize: 11 };

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


function mondayOf(d: Date): string {
  const copy = new Date(d);
  const offset = (copy.getDay() + 6) % 7; // Mon=0 .. Sun=6
  copy.setDate(copy.getDate() - offset);
  return toYmd(copy);
}

function usd(v: number | null | undefined, digits = 0): string {
  if (v == null) return '—';
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function weekLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="glass-card rounded-xl border border-white/10 p-3 sm:p-4 min-w-0">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</div>
        {subtitle ? <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

interface LogSpendPopoverProps {
  funnels: Funnel[];
  defaultFunnelId: string | null;
  onClose: () => void;
  onSaved: () => void;
}

function LogSpendPopover({ funnels, defaultFunnelId, onClose, onSaved }: LogSpendPopoverProps) {
  const [funnelId, setFunnelId] = useState<string>(defaultFunnelId ?? '');
  const [week, setWeek] = useState<string>(mondayOf(new Date()));
  const [amount, setAmount] = useState<string>('');
  const [ads, setAds] = useState<string>('');
  const [angles, setAngles] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill with what's already logged for this funnel + week, so edits don't start from blank.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getFunnelAdSpend({ start: week, end: week, funnel_id: funnelId || null })
      .then((rows) => {
        if (cancelled) return;
        const match = rows.find((r) => (r.funnel_id ?? '') === funnelId);
        setAmount(match ? String(match.amount_usd) : '');
        setAds(match?.ads_deployed != null ? String(match.ads_deployed) : '');
        setAngles(match?.angles_deployed != null ? String(match.angles_deployed) : '');
      })
      .catch(() => {
        /* leave blank */
      });
    return () => {
      cancelled = true;
    };
  }, [funnelId, week]);

  const save = async () => {
    const value = Number(amount || 0);
    if (!Number.isFinite(value) || value < 0) {
      setError('Enter a dollar amount (0 clears the week).');
      return;
    }
    const toCount = (raw: string): number | null => {
      if (raw.trim() === '') return null;
      const n = Number(raw);
      return Number.isInteger(n) && n >= 0 ? n : NaN;
    };
    const adsCount = toCount(ads);
    const anglesCount = toCount(angles);
    if (Number.isNaN(adsCount) || Number.isNaN(anglesCount)) {
      setError('Ads and angles deployed must be whole numbers.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiClient.putFunnelAdSpend({
        funnel_id: funnelId || null,
        week_start: week,
        amount_usd: value,
        ads_deployed: adsCount,
        angles_deployed: anglesCount,
      });
      onSaved();
    } catch {
      setError('Could not save spend. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-white/10 bg-white dark:bg-gray-900 p-3 shadow-xl">
      <div className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2">Log this week&apos;s ads</div>
      <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Funnel</label>
      <select
        value={funnelId}
        onChange={(e) => setFunnelId(e.target.value)}
        className="w-full mb-2 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
      >
        {funnels.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
        <option value="">Unassigned (can&apos;t split by funnel)</option>
      </select>
      <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Week of (any day, saved to its Monday)</label>
      <input
        type="date"
        value={week}
        onChange={(e) => e.target.value && setWeek(mondayOf(new Date(`${e.target.value}T12:00:00`)))}
        className="w-full mb-2 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
      />
      <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Amount (USD)</label>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        className="w-full mb-2 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm tabular-nums"
      />
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">New ads deployed</label>
          <input
            type="number"
            min={0}
            step={1}
            value={ads}
            onChange={(e) => setAds(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm tabular-nums"
          />
        </div>
        <div>
          <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">New angles deployed</label>
          <input
            type="number"
            min={0}
            step={1}
            value={angles}
            onChange={(e) => setAngles(e.target.value)}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm tabular-nums"
          />
        </div>
      </div>
      {error ? <p className="text-[11px] text-red-600 dark:text-red-400 mb-2">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function SettingsDrawer({ funnelId, onClose }: { funnelId: string; onClose: () => void }) {
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
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Funnel settings">
      <button type="button" aria-label="Close settings" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-2xl overflow-y-auto bg-white dark:bg-gray-950 border-l border-white/10 p-4 sm:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{funnel?.name ?? 'Funnel'} settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {funnel ? (
          <>
            <FunnelOverviewTab funnel={funnel} onReload={() => void load()} />
            <FunnelStepsTab funnel={funnel} onReload={() => void load()} />
          </>
        ) : !error ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}

/** Org KPI % targets, the same from every funnel view. */
function TargetsDrawer({ onClose }: { onClose: () => void }) {
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
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label="Targets">
      <button type="button" aria-label="Close targets" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative h-full w-full max-w-3xl overflow-y-auto bg-white dark:bg-gray-950 border-l border-white/10 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Targets</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
        <TeamSettingsView canEdit={canEdit} part="targets" />
      </div>
    </div>
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
  const router = useRouter();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [funnelId, setFunnelId] = useState<string | null>(initialFunnelId);
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
  const [spendOpen, setSpendOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Funnels never offer "All time" (the scorecard needs a start), so start is always set.
  const start = range.start ?? range.end;
  const end = range.end;
  const compareStart = range.compare?.start;
  const compareEnd = range.compare?.end;
  // A single funnel is paid by definition — the channel only applies without one.
  const effectiveChannel: FunnelChannelFilter = funnelId ? 'paid' : channel;
  // Organic has no landing page or spend: it's the daily-activity calendar, not the scorecard.
  const isOrganicView = !funnelId && channel === 'organic';

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
        ...(compareStart && compareEnd ? { compare_start: compareStart, compare_end: compareEnd } : {}),
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
  }, [start, end, compareStart, compareEnd, effectiveChannel, funnelId, reloadKey, isOrganicView]);

  const openInPipelineGrid = () => {
    let sourceKeys: string[] | undefined;
    if (funnelId) sourceKeys = [`funnel:${funnelId}`];
    else if (effectiveChannel === 'organic') sourceKeys = ['organic'];
    else if (effectiveChannel === 'paid') sourceKeys = [...funnels.map((f) => `funnel:${f.id}`), 'paid'];
    setPipelineGridIntent({ sourceKeys });
    void router.push({ pathname: '/', query: { tab: 'pipeline' } }, undefined, { shallow: true });
  };

  const viewTitle = funnelId
    ? funnels.find((f) => f.id === funnelId)?.name ?? 'Funnel'
    : channel === 'organic'
      ? 'Organic'
      : channel === 'paid'
        ? 'All paid funnels'
        : 'All channels';

  const summary = data?.summary ?? null;
  const showSpendGraph = Boolean(data?.money?.has_spend);
  const scorecard = data?.scorecard ?? null;
  const tracking = TRACKING[data?.tracking.status ?? 'no_funnels'];

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

  const weekly = useMemo(
    () => (data?.weekly ?? []).map((w) => ({ ...w, label: weekLabel(w.week_start) })),
    [data?.weekly],
  );

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-4 min-w-0">
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
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mr-2">{viewTitle}</h2>
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
            title="Org KPI targets and closer targets — the same from every view"
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
        <KpiCommandCenterPanel variant="organic" />
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

      {/* Scorecard: the sheet, week by week, with a benchmark next to each metric */}
      <div className="glass-card rounded-xl border border-white/10 p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Weekly scorecard · {formatRange(start, end)}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openInPipelineGrid}
              className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              View these leads in Pipeline Grid →
            </button>
            {effectiveChannel !== 'organic' ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSpendOpen((o) => !o)}
                  aria-expanded={spendOpen}
                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-indigo-500"
                >
                  + Log spend &amp; ads
                </button>
                {spendOpen ? (
                  <LogSpendPopover
                    funnels={funnels}
                    defaultFunnelId={funnelId ?? funnels[0]?.id ?? null}
                    onClose={() => setSpendOpen(false)}
                    onSaved={() => {
                      setSpendOpen(false);
                      setReloadKey((k) => k + 1);
                    }}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <FunnelScorecardGrid
          scorecard={scorecard}
          loading={loading}
          compareLabel={range.compare ? formatRange(range.compare.start, range.compare.end) : null}
        />
      </div>

      {/* Two graphs, max */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Where it leaks" subtitle="People reaching each stage in this range">
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
          title={showSpendGraph ? 'Is spend paying back' : 'Opt-ins vs closes'}
          subtitle={showSpendGraph ? 'Weekly ad spend (bars) vs paid cash (line) · CAC on hover' : 'Weekly · log spend to compare against cash'}
        >
          <div className="h-56">
            {weekly.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={weekly} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  {showSpendGraph ? (
                    <>
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} width={64} />
                      <Tooltip
                        formatter={(value: number, name: string) => [usd(value), name]}
                        labelFormatter={(label, payload) => {
                          const cac = payload?.[0]?.payload?.cac_usd as number | null | undefined;
                          return `Week of ${label}${cac != null ? ` · CAC ${usd(cac)}` : ''}`;
                        }}
                      />
                      <Bar dataKey="spend_usd" name="Ad spend" fill={SPEND_COLOR} radius={[4, 4, 0, 0]} barSize={22} />
                      <Line dataKey="cash_usd" name="Paid cash" stroke={CASH_COLOR} strokeWidth={2} dot={{ r: 3 }} type="monotone" />
                    </>
                  ) : (
                    <>
                      <YAxis allowDecimals={false} tick={AXIS_TICK} axisLine={false} tickLine={false} width={32} />
                      <Tooltip labelFormatter={(label) => `Week of ${label}`} />
                      <Bar dataKey="opt_ins" name="Opt-ins" fill={SPEND_COLOR} radius={[4, 4, 0, 0]} barSize={22} />
                      <Line dataKey="closed" name="Closes" stroke={CASH_COLOR} strokeWidth={2} dot={{ r: 3 }} type="monotone" />
                    </>
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">{loading ? 'Loading…' : 'No data'}</div>
            )}
          </div>
        </Panel>
      </div>

      {/* One table */}
      <Panel title="Top sources" subtitle="Grouped by utm_source on the lead">
        {data?.sources.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  <th className="py-1.5 pr-4 font-medium">Source</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Opt-ins</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Booked</th>
                  <th className="py-1.5 pr-4 font-medium text-right">Closed</th>
                  <th className="py-1.5 font-medium text-right">Cash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.sources.map((s) => (
                  <tr key={s.source} className="text-gray-800 dark:text-gray-200">
                    <td className="py-1.5 pr-4 truncate max-w-[16rem]" title={s.source}>{s.source}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{s.opt_ins}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{s.booked}</td>
                    <td className="py-1.5 pr-4 text-right tabular-nums">{s.closed}</td>
                    <td className="py-1.5 text-right tabular-nums">{usd(s.cash_usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? 'Loading…' : 'No leads in this range. UTM sources appear once funnels send utm with submitLead.'}
          </p>
        )}
      </Panel>

        </>
      )}

      {settingsOpen && funnelId ? <SettingsDrawer funnelId={funnelId} onClose={() => setSettingsOpen(false)} /> : null}
      {targetsOpen ? <TargetsDrawer onClose={() => setTargetsOpen(false)} /> : null}
    </div>
  );
}
