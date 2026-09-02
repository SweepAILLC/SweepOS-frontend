import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '@/lib/api';
import { formatKpiValue, kpiTierBadgeClass } from '@/lib/kpiBenchmarks';
import type { KpiSnapshotCard, KpiSnapshotResponse, KpiTier } from '@/types/kpi';

type Range = 7 | 30 | 90;

/** Activity metrics shown as cards — excludes cash which owner dashboard already surfaces. */
const CARD_KEYS = new Set([
  'total_conversations',
  'calls_booked',
  'calls_taken',
  'closes',
  'convo_to_booking_pct',
]);

function shortDate(iso: string) {
  const [, m, day] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(day, 10)}`;
}

type Props = {
  isActive?: boolean;
  /** When provided, loads KPI data for this org via the admin API (owner dashboard use). */
  orgId?: string;
  /** Show bottleneck insights inside the snapshot (hide when parent already shows flags). */
  showFlags?: boolean;
  emptyHint?: string;
  /**
   * Controlled date window (YYYY-MM-DD). When set with rangeEnd, replaces the 7/30/90
   * day toggle and loads this exact range.
   */
  rangeStart?: string;
  rangeEnd?: string;
  /** Custom controls rendered where the day-range toggle usually sits. */
  rangeControls?: ReactNode;
};

export default function PortalKpiSnapshot({
  isActive = true,
  orgId,
  showFlags = true,
  emptyHint = 'No KPI entries logged yet for this period. Head to the KPI Command Center tab to start tracking.',
  rangeStart,
  rangeEnd,
  rangeControls,
}: Props) {
  const controlled = Boolean(rangeStart && rangeEnd);
  const [range, setRange] = useState<Range>(30);
  const [snapshot, setSnapshot] = useState<KpiSnapshotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasPainted = useRef(false);

  const load = useCallback(async () => {
    if (!isActive) return;
    if (hasPainted.current) setUpdating(true);
    else setLoading(true);
    setError(null);
    try {
      const params =
        controlled && rangeStart && rangeEnd
          ? {
              start: rangeStart,
              end: rangeEnd,
              include_flags: showFlags,
              include_series: true,
            }
          : { days: range, include_flags: showFlags, include_series: true };
      const data = orgId
        ? await apiClient.getAdminKpiSnapshot(orgId, params)
        : await apiClient.getKpiSnapshot(params);
      setSnapshot(data);
      hasPainted.current = true;
    } catch {
      setError('Could not load KPI snapshot.');
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, [isActive, orgId, showFlags, controlled, rangeStart, rangeEnd, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards: KpiSnapshotCard[] = (snapshot?.cards || []).filter((c) => CARD_KEYS.has(c.key));
  const hasData = (snapshot?.days_with_data || 0) > 0;
  const chartData = (snapshot?.series || []).map((e) => ({
    date: shortDate(e.date),
    Conversations:
      e.total_conversations ??
      e.outreach_sent ??
      0,
    Booked: e.calls_booked ?? 0,
    Closes: e.closes ?? 0,
  }));
  const topFlags = showFlags ? (snapshot?.flags || []).slice(0, 3) : [];
  const periodLabel = controlled
    ? `${snapshot?.days ?? '—'}d in view`
    : `${range}d`;

  return (
    <section className="glass-card rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden relative">
      {updating ? (
        <div className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 bg-black/30 rounded px-2 py-0.5 pointer-events-none">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Updating…
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-200/60 dark:border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text">
            KPI Snapshot
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Logged activity from the KPI tracker — conversations through closes.
          </p>
        </div>
        {rangeControls ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">{rangeControls}</div>
        ) : controlled ? (
          <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums">
            {rangeStart} → {rangeEnd}
          </span>
        ) : (
          <div className="flex gap-1">
            {([7, 30, 90] as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  range === r
                    ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200 border border-sky-400/40'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 border border-transparent'
                }`}
              >
                {r}d
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && !snapshot ? (
        <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
      ) : error && !snapshot ? (
        <div className="py-8 px-5 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : !hasData ? (
        <div className="py-12 px-5 text-center text-sm text-gray-400 dark:text-gray-500">
          {emptyHint}
        </div>
      ) : (
        <div className="p-5 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {cards.map((card) => {
              const tier = (card.tier as KpiTier | null) || null;
              const value =
                card.value == null ? '—' : formatKpiValue(card.value, card.kind);
              return (
                <div
                  key={card.key}
                  className="glass-card rounded-lg p-3 border border-gray-200/60 dark:border-white/10 flex flex-col gap-1"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {card.label}
                  </span>
                  <span className="text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-none">
                    {value}
                  </span>
                  {tier ? (
                    <span
                      className={`self-start text-[10px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${kpiTierBadgeClass(tier)}`}
                    >
                      {tier}
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {card.aggregation === 'sum' ? `${periodLabel} total` : `${periodLabel} avg`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {topFlags.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Insights
              </p>
              <ul className="space-y-1.5">
                {topFlags.map((f) => (
                  <li
                    key={f.id}
                    className="text-xs text-gray-700 dark:text-gray-200 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <span className="font-semibold capitalize">{f.severity}</span>
                    <span className="text-gray-400"> · {f.stage} · </span>
                    {f.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
              Daily Activity — Conversations / Booked / Closes
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  className="text-gray-400 dark:text-gray-500"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  className="text-gray-400 dark:text-gray-500"
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(15,15,30,0.92)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 8,
                    fontSize: 12,
                    color: '#e5e7eb',
                  }}
                />
                <Bar dataKey="Conversations" fill="#818cf8" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Booked" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Closes" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  );
}
