import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { formatPctMoM, formatPpMoM } from '@/lib/healthTrendMetrics';
import { formatKpiValue, kpiTierBadgeClass, tierForMetric } from '@/lib/kpiBenchmarks';
import type {
  KpiDailyEntry,
  KpiRepPerformanceMetricKey,
  KpiRepPerformanceResponse,
  KpiRepPerformanceRow,
} from '@/types/kpi';
import KpiCalendar from './KpiCalendar';

type SubView = 'leaderboard' | 'grid' | 'calendar';

type MetricDef = {
  key: KpiRepPerformanceMetricKey;
  label: string;
  kind: 'int' | 'pct' | 'currency';
  /** Reuse the existing org-level threshold keys — only defined for the two rate metrics;
   * volume metrics (outreach/bookings/etc) have no per-rep benchmark, so render plainly. */
  tierMetric?: 'show_up_pct' | 'closing_rate_pct';
  /** cash_collected_cents is stored in cents — convert for display/format. */
  toDisplay?: (raw: number) => number;
};

const METRICS: MetricDef[] = [
  { key: 'closing_rate_pct', label: 'Close %', kind: 'pct', tierMetric: 'closing_rate_pct' },
  { key: 'cash_collected_cents', label: 'Cash Collected', kind: 'currency', toDisplay: (v) => v / 100 },
  { key: 'closes', label: 'Closes', kind: 'int' },
  { key: 'show_up_pct', label: 'Show-up %', kind: 'pct', tierMetric: 'show_up_pct' },
  { key: 'calls_taken', label: 'Calls Taken', kind: 'int' },
  { key: 'calls_booked', label: 'Calls Booked', kind: 'int' },
  { key: 'outreach_sent', label: 'Outreach Sent', kind: 'int' },
  { key: 'no_shows', label: 'No-shows', kind: 'int' },
];

function metricValue(row: KpiRepPerformanceRow, period: 'current' | 'previous' | 'personal_best', key: KpiRepPerformanceMetricKey): number {
  const v = row[period][key];
  return v == null ? 0 : Number(v);
}

function displayValue(def: MetricDef, raw: number): string {
  const shown = def.toDisplay ? def.toDisplay(raw) : raw;
  return formatKpiValue(shown, def.kind);
}

function deltaLabel(def: MetricDef, prev: number, curr: number): string {
  if (prev === 0 && curr === 0) return '';
  // Rate metrics (0-100) read as a percentage-point move; everything else as relative %.
  return def.kind === 'pct' ? formatPpMoM(prev, curr) : formatPctMoM(prev, curr);
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Props = {
  isActive?: boolean;
  /** When provided, loads via the system-owner admin API for this org (cross-org review). */
  orgId?: string;
  /** Shared with the rest of the KPI Command Center's date range — no independent range here. */
  rangeStart: string;
  rangeEnd: string;
};

export default function KpiRepPerformancePanel({ isActive = true, orgId, rangeStart, rangeEnd }: Props) {
  const [data, setData] = useState<KpiRepPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subView, setSubView] = useState<SubView>('leaderboard');
  const [primaryKey, setPrimaryKey] = useState<KpiRepPerformanceMetricKey>('closing_rate_pct');
  const [selectedRepId, setSelectedRepId] = useState<string>('');

  const load = useCallback(async () => {
    if (!isActive) return;
    setLoading(true);
    setError(null);
    try {
      const params = { start: rangeStart, end: rangeEnd };
      const res = orgId
        ? await apiClient.getAdminKpiRepPerformance(orgId, params)
        : await apiClient.getKpiRepPerformance(params);
      setData(res);
    } catch (err) {
      setError(formatApiError(err, 'Could not load rep performance.'));
    } finally {
      setLoading(false);
    }
  }, [isActive, orgId, rangeStart, rangeEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const reps = useMemo(() => data?.reps || [], [data]);
  const primaryDef = METRICS.find((m) => m.key === primaryKey) || METRICS[0];

  const ranked = useMemo(() => {
    return [...reps].sort(
      (a, b) => metricValue(b, 'current', primaryKey) - metricValue(a, 'current', primaryKey)
    );
  }, [reps, primaryKey]);

  const selectedRow = selectedRepId ? reps.find((r) => r.rep_user_id === selectedRepId) || null : null;

  // --- Calendar tab: only wireable for the self-org view (GET /kpi/entries supports
  // rep_user_id filtering); the cross-org admin entries endpoint doesn't yet, so system
  // owners get an honest placeholder there instead of a silently-wrong "all reps" view.
  const [calEntries, setCalEntries] = useState<KpiDailyEntry[]>([]);
  const [calLoading, setCalLoading] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const calSupported = !orgId;

  useEffect(() => {
    if (subView !== 'calendar' || !calSupported || !selectedRepId) return;
    let cancelled = false;
    setCalLoading(true);
    const start = toYmd(new Date(calMonth.year, calMonth.month, 1));
    const end = toYmd(new Date(calMonth.year, calMonth.month + 1, 0));
    void apiClient
      .getKpiEntries({ start, end, sync: false, rep_user_id: selectedRepId })
      .then((rows) => {
        if (!cancelled) setCalEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setCalEntries([]);
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subView, calSupported, selectedRepId, calMonth]);

  const noOpUpsert = useCallback(async (): Promise<KpiDailyEntry> => {
    // Editing isn't offered from this read-only calendar view — the picker in
    // KpiCommandCenterPanel's own Calendar tab is where reps log their day.
    throw new Error('Read-only in the By Rep view — log entries from the KPI Command Center calendar.');
  }, []);

  return (
    <section className="glass-card rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden relative">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-gray-200/60 dark:border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text">
            By Rep Performance
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Setter and closer attribution — current period vs prior period and personal best.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {(
              [
                ['leaderboard', 'Leaderboard'],
                ['grid', 'Grid'],
                ['calendar', 'Calendar'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setSubView(id)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  subView === id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-gray-200/60 dark:border-white/10 flex flex-wrap items-center gap-3">
        <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          Rep
          <select
            value={selectedRepId}
            onChange={(e) => setSelectedRepId(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
          >
            <option value="">All reps</option>
            {reps.map((r) => (
              <option key={r.rep_user_id} value={r.rep_user_id}>
                {r.rep_name}
              </option>
            ))}
          </select>
        </label>
        {subView === 'leaderboard' && (
          <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            Rank by
            <select
              value={primaryKey}
              onChange={(e) => setPrimaryKey(e.target.value as KpiRepPerformanceMetricKey)}
              className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {loading && !data ? (
        <div className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">Loading…</div>
      ) : error && !data ? (
        <div className="py-8 px-5 text-sm text-red-600 dark:text-red-300">{error}</div>
      ) : reps.length === 0 ? (
        <div className="py-12 px-5 text-center text-sm text-gray-400 dark:text-gray-500">
          No rep-attributed KPI data yet for this period. Reps can identify themselves on the
          KPI entry link, or attribution fills in automatically once closes are logged via the
          post-sales survey or bookings sync with a resolved calendar host.
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {selectedRow ? (
            <RepDetailCard row={selectedRow} />
          ) : subView === 'leaderboard' ? (
            <div className="space-y-2">
              {ranked.map((row, idx) => {
                const curr = metricValue(row, 'current', primaryKey);
                const prev = metricValue(row, 'previous', primaryKey);
                const best = metricValue(row, 'personal_best', primaryKey);
                const isPersonalBest = curr > 0 && curr >= best;
                const delta = deltaLabel(primaryDef, prev, curr);
                return (
                  <div
                    key={row.rep_user_id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200/60 dark:border-white/10 bg-white/5 px-3 py-2.5"
                  >
                    <span className="text-xs font-semibold text-gray-400 w-5 text-center">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {row.rep_name}
                    </span>
                    {isPersonalBest && (
                      <span
                        title="New personal best this period"
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-400/30"
                      >
                        ★ Best
                      </span>
                    )}
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums w-24 text-right">
                      {displayValue(primaryDef, curr)}
                    </span>
                    {delta && (
                      <span
                        className={`text-xs tabular-nums w-20 text-right ${
                          delta.startsWith('+') ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
                        }`}
                      >
                        {delta}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : subView === 'grid' ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 dark:text-gray-400">
                    <th className="py-2 pr-3 font-medium">Rep</th>
                    {METRICS.map((m) => (
                      <th key={m.key} className="py-2 px-3 font-medium text-right">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reps.map((row) => (
                    <tr key={row.rep_user_id} className="border-t border-gray-200/40 dark:border-white/5">
                      <td className="py-2 pr-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {row.rep_name}
                      </td>
                      {METRICS.map((m) => {
                        const v = metricValue(row, 'current', m.key);
                        const tier = m.tierMetric
                          ? tierForMetric(m.tierMetric, row.current[m.tierMetric], {})
                          : null;
                        return (
                          <td key={m.key} className="py-2 px-3 text-right tabular-nums">
                            {tier ? (
                              <span className={`inline-block px-1.5 py-0.5 rounded ${kpiTierBadgeClass(tier)}`}>
                                {displayValue(m, v)}
                              </span>
                            ) : (
                              <span className="text-gray-700 dark:text-gray-200">{displayValue(m, v)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            // Calendar
            <div className="space-y-3">
              {!calSupported ? (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  Rep-level calendar detail isn&apos;t available in cross-org review yet — use the
                  Grid or Leaderboard above, or open this org&apos;s own KPI Command Center.
                </div>
              ) : !selectedRepId ? (
                <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                  Select a rep above to see their day-by-day breakdown.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() =>
                        setCalMonth((m) => {
                          const d = new Date(m.year, m.month - 1, 1);
                          return { year: d.getFullYear(), month: d.getMonth() };
                        })
                      }
                      className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 text-gray-800 dark:text-gray-100"
                    >
                      ← Prev month
                    </button>
                    <span className="text-gray-500 dark:text-gray-400">
                      {calLoading ? 'Loading…' : ' '}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCalMonth((m) => {
                          const d = new Date(m.year, m.month + 1, 1);
                          return { year: d.getFullYear(), month: d.getMonth() };
                        })
                      }
                      className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 text-gray-800 dark:text-gray-100"
                    >
                      Next month →
                    </button>
                  </div>
                  <KpiCalendar
                    entries={calEntries}
                    thresholds={{}}
                    loading={calLoading}
                    onUpsertEntry={noOpUpsert}
                    year={calMonth.year}
                    month={calMonth.month}
                    hideRepPicker
                  />
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RepDetailCard({ row }: { row: KpiRepPerformanceRow }) {
  return (
    <div className="rounded-xl border border-gray-200/60 dark:border-white/10 bg-white/5 p-4 space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.rep_name}</h4>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {METRICS.map((m) => {
          const curr = metricValue(row, 'current', m.key);
          const prev = metricValue(row, 'previous', m.key);
          const best = metricValue(row, 'personal_best', m.key);
          const isBest = curr > 0 && curr >= best;
          const delta = deltaLabel(m, prev, curr);
          return (
            <div key={m.key} className="rounded-lg border border-gray-200/60 dark:border-white/10 p-2.5 flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {m.label}
              </span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums leading-none">
                {displayValue(m, curr)}
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {delta && <span className="text-[10px] text-gray-500 dark:text-gray-400">{delta} vs prior</span>}
                {isBest && (
                  <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-200">
                    ★ best
                  </span>
                )}
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500">
                Best: {displayValue(m, best)}
                {row.personal_best_month[m.key] ? ` (${row.personal_best_month[m.key]})` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
