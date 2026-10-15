import { useState } from 'react';
import { formatKpiValue, trendClass, trendOf } from '@/lib/kpiFormat';
import type { FunnelScorecard, FunnelScorecardGroup, FunnelScorecardMetric } from '@/types/funnel';

/**
 * The Google Sheet, in the app: one self-contained table per group (Ads, Funnel, Close,
 * Economics), laid out 2x2 to use the page's width instead of one long vertical stack.
 * Each table has its own Metric/Benchmark/week header. Weeks are Mon-Sun columns, and the
 * Benchmark column (average of the range's complete weeks, or of the compare range's weeks
 * when the date filter's compare is on) sits next to each title.
 * Every week cell carries a green/red arrow against that benchmark; the current
 * week is shown muted, with no arrow, since its counts are still partial. Weeks that
 * haven't started yet still get a column (muted, labeled "upcoming") so the grid's
 * column count always matches the full month.
 * Count rows (leads, calls, cash, spend...) can be clicked and typed over per week;
 * rates and costs recompute from the edited counts on reload.
 */

const GROUP_TITLES: Record<FunnelScorecardGroup, string> = {
  ads: 'Ads',
  funnel: 'Funnel',
  close: 'Close',
  economics: 'Economics',
};
const GROUP_ORDER: FunnelScorecardGroup[] = ['ads', 'funnel', 'close', 'economics'];

function weekHeader(mondayYmd: string): string {
  const [y, m, d] = mondayYmd.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(y, m - 1, d + 6);
  const fmt = (x: Date) => x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Click-to-edit week cell for count rows. Enter saves, Escape cancels, empty reverts to computed. */
function EditableValue({
  metric,
  index,
  onSave,
}: {
  metric: FunnelScorecardMetric;
  index: number;
  onSave: (value: number | null) => Promise<void>;
}) {
  const value = metric.values[index];
  const overridden = metric.overridden?.[index] === true;
  const original = metric.original?.[index] ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setDraft(value == null ? '' : String(value));
    setError(null);
    setEditing(true);
  };

  const commit = async () => {
    const raw = draft.trim().replace(/[$,]/g, '');
    let next: number | null = null;
    if (raw !== '') {
      const n = Number(raw);
      const whole = metric.format === 'int';
      if (!Number.isFinite(n) || n < 0 || (whole && !Number.isInteger(n))) {
        setError(whole ? 'Whole number' : 'Number ≥ 0');
        return;
      }
      next = n;
    } else if (!overridden) {
      setEditing(false);
      return;
    }
    if (next !== null && next === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      setError('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span className="inline-flex flex-col items-end">
        <input
          autoFocus
          value={draft}
          disabled={saving}
          inputMode="decimal"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit();
            if (e.key === 'Escape') setEditing(false);
          }}
          placeholder={overridden ? 'empty = computed' : ''}
          className="w-24 rounded border border-indigo-400 bg-white dark:bg-gray-900 px-1.5 py-0.5 text-right tabular-nums text-sm"
        />
        {error ? <span className="text-[10px] text-red-500">{error}</span> : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      title={
        overridden
          ? `Edited by hand. Calculated: ${formatKpiValue(original, metric.format)}. Click to change; clear to revert.`
          : 'Click to edit this week'
      }
      className={`rounded px-1 -mx-1 hover:bg-indigo-500/10 hover:underline decoration-dotted ${
        overridden ? 'underline decoration-indigo-400 decoration-dotted' : ''
      }`}
    >
      {formatKpiValue(value, metric.format)}
      {overridden ? <span className="ml-0.5 align-super text-[9px] text-indigo-500" aria-label="edited">✎</span> : null}
    </button>
  );
}

/** One group's self-contained table (own Metric/Benchmark/week header) — one of the 2x2 panels. */
function GroupTable({
  group,
  rows,
  weeks,
  modelValue,
  benchmarkTint,
  model,
  fromCompare,
  compareLabel,
  benchmarkWeeks,
  onEditCell,
}: {
  group: FunnelScorecardGroup;
  rows: FunnelScorecardMetric[];
  weeks: FunnelScorecard['weeks'];
  modelValue: (key: string) => number | null;
  benchmarkTint: string;
  model: { name: string; values: Record<string, number | null> } | null;
  fromCompare: boolean;
  compareLabel: string | null;
  benchmarkWeeks: number;
  onEditCell?: (weekStart: string, metricKey: string, value: number | null) => Promise<void>;
}) {
  const stickyCell = 'sticky left-0 z-10 bg-white dark:bg-gray-950';
  return (
    <div className="rounded-lg border border-black/5 dark:border-white/10 p-3 min-w-0">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 mb-1.5 pl-1">
        {GROUP_TITLES[group]}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-auto text-sm border-separate border-spacing-0">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <th scope="col" className={`${stickyCell} text-left font-medium py-1.5 pr-3 pl-1 whitespace-nowrap`}>
                Metric
              </th>
              <th
                scope="col"
                className={`text-right font-semibold py-1.5 px-2 whitespace-nowrap ${benchmarkTint}`}
                title={
                  model
                    ? `Snapshot "${model.name}" as one modeled week (monthly model × 7 / days in month)`
                    : fromCompare
                    ? `Average week of the compare range (${compareLabel ?? ''}), ${benchmarkWeeks} week${benchmarkWeeks === 1 ? '' : 's'}`
                    : `Average of ${benchmarkWeeks} complete week${benchmarkWeeks === 1 ? '' : 's'} in this range`
                }
              >
                {model ? 'Model' : 'Benchmark'}
                <div className="text-[10px] font-normal normal-case tracking-normal max-w-[7rem] truncate ml-auto">
                  {model
                    ? model.name
                    : fromCompare ? `compare · ${benchmarkWeeks} wk${benchmarkWeeks === 1 ? '' : 's'}` : `avg of ${benchmarkWeeks} wk${benchmarkWeeks === 1 ? '' : 's'}`}
                </div>
              </th>
              {weeks.map((w) => (
                <th
                  key={w.week_start}
                  scope="col"
                  className={`text-right font-medium py-1.5 px-2 whitespace-nowrap ${w.in_progress ? 'text-gray-400 dark:text-gray-500' : ''}`}
                >
                  {weekHeader(w.week_start)}
                  {w.not_started ? (
                    <div className="text-[10px] font-normal normal-case tracking-normal">upcoming</div>
                  ) : w.in_progress ? (
                    <div className="text-[10px] font-normal normal-case tracking-normal">in progress</div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const modeled = modelValue(m.key);
              const benchmark = modeled ?? m.benchmark;
              const fellBack = model != null && modeled == null && m.benchmark != null;
              const rowDim = !m.editable;
              const rowTitle = rowDim ? 'Calculated from other rows' : undefined;
              return (
                <tr
                  key={m.key}
                  className={rowDim ? 'bg-black/[0.035] dark:bg-white/[0.035] hover:bg-black/[0.06] dark:hover:bg-white/[0.06]' : 'hover:bg-white/[0.03]'}
                >
                  <th
                    scope="row"
                    title={rowTitle}
                    className={`sticky left-0 z-10 text-left font-normal py-1 pr-3 pl-1 border-t border-white/5 whitespace-nowrap ${
                      rowDim
                        ? 'bg-gray-50 dark:bg-gray-900/70 text-gray-400 dark:text-gray-600'
                        : 'bg-white dark:bg-gray-950 text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {m.label}
                  </th>
                  <td
                    title={fellBack ? 'Not in the snapshot — historic average shown' : rowTitle}
                    className={`text-right py-1 px-2 tabular-nums font-medium border-t border-white/5 ${benchmarkTint} ${
                      fellBack ? 'italic opacity-70' : rowDim ? 'opacity-70' : ''
                    }`}
                  >
                    {formatKpiValue(benchmark, m.format)}
                  </td>
                  {weeks.map((w, i) => {
                    const value = m.values[i];
                    const trend = w.in_progress ? null : trendOf(value, benchmark);
                    const arrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : null;
                    return (
                      <td
                        key={w.week_start}
                        title={rowTitle}
                        className={`text-right py-1 px-2 tabular-nums border-t border-white/5 whitespace-nowrap ${
                          rowDim
                            ? 'text-gray-400 dark:text-gray-600'
                            : w.in_progress
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-gray-900 dark:text-gray-100'
                        }`}
                      >
                        {onEditCell && m.editable ? (
                          <EditableValue metric={m} index={i} onSave={(next) => onEditCell(w.week_start, m.key, next)} />
                        ) : (
                          formatKpiValue(value, m.format)
                        )}
                        {arrow && trend ? (
                          <span
                            className={`ml-1 text-[10px] ${trendClass(trend, m.better)}`}
                            aria-label={trend === 'up' ? 'above benchmark' : 'below benchmark'}
                          >
                            {arrow}
                          </span>
                        ) : (
                          <span className="ml-1 inline-block w-[0.7em]" aria-hidden />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FunnelScorecardGridProps {
  scorecard: FunnelScorecard | null;
  loading: boolean;
  /** Compare range label when the date filter's compare is on (benchmark = its average week). */
  compareLabel?: string | null;
  /**
   * A funnel snapshot standing in for the averages: one modeled week per metric key.
   * Metrics the model leaves null keep their historic benchmark.
   */
  model?: { name: string; values: Record<string, number | null> } | null;
  /** Save a hand edit for one count-row cell (null reverts it). Omit to make the grid read-only. */
  onEditCell?: (weekStart: string, metricKey: string, value: number | null) => Promise<void>;
}

export default function FunnelScorecardGrid({
  scorecard,
  loading,
  compareLabel = null,
  model = null,
  onEditCell,
}: FunnelScorecardGridProps) {
  if (!scorecard || scorecard.weeks.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        {loading ? 'Loading…' : 'No complete or in-progress weeks start in this date range.'}
      </p>
    );
  }

  const { weeks, metrics, benchmark_weeks: benchmarkWeeks } = scorecard;
  const fromCompare = scorecard.benchmark_source === 'compare';
  const modelValue = (key: string): number | null => (model ? model.values[key] ?? null : null);
  const benchmarkTint = model
    ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300'
    : 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300';
  const groups = GROUP_ORDER.map((group) => ({ group, rows: metrics.filter((m) => m.group === group) })).filter(
    (g) => g.rows.length > 0,
  );

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {groups.map(({ group, rows }) => (
          <GroupTable
            key={group}
            group={group}
            rows={rows}
            weeks={weeks}
            modelValue={modelValue}
            benchmarkTint={benchmarkTint}
            model={model}
            fromCompare={fromCompare}
            compareLabel={compareLabel}
            benchmarkWeeks={benchmarkWeeks}
            onEditCell={onEditCell}
          />
        ))}
      </div>
      <p className="mt-3 text-[10px] text-gray-500 dark:text-gray-400">
        {model
          ? `Model = snapshot "${model.name}" scaled to one week, so each arrow reads "vs plan". Italic values aren't in the snapshot and fall back to the historic average. `
          : fromCompare
          ? `Benchmark = the average week of the compare range (${compareLabel ?? ''}), so each arrow reads "vs then". `
          : 'Benchmark = average of each complete week\'s value in this date range. '}
        {onEditCell ? 'Click any count (leads, calls, cash, spend…) to correct a week; ✎ marks edited cells and rates recompute from them. ' : ''}
        Dimmed rows are calculated from the count rows above and can&apos;t be edited directly.{' '}
        Weeks where a metric can&apos;t be computed (e.g. CAC with no spend) are skipped. Columns are every Mon–Sun week that
        starts inside the range, including ones still upcoming. Costs are green when below benchmark; ad spend is neutral.
      </p>
    </div>
  );
}
