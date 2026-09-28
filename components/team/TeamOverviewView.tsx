import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { formatKpiValue } from '@/lib/kpiFormat';
import MonthNavigator from '@/components/kpi/MonthNavigator';
import type {
  TeamEodNote,
  TeamEodSummary,
  TeamMetricCell,
  TeamOverviewMember,
  TeamOverviewResponse,
} from '@/types/team';

/**
 * One month-only Team view (accountability + performance), built to be read at
 * a glance: a "Needs attention" list, then one card per person — setter EODs as a
 * strip of dots (one per required day), closer activity as compact stats. Every number carries ▲▼ vs the same
 * point last month; ★ marks a best month. People needing attention come first.
 */

const DOT: Record<TeamEodSummary['days'][number]['status'], { cls: string; label: string }> = {
  submitted: { cls: 'bg-emerald-500 border-emerald-500', label: 'Submitted' },
  missed: { cls: 'bg-red-500 border-red-500', label: 'Missed' },
  today: { cls: 'bg-transparent border-amber-500 border-2', label: 'Today — pending' },
  upcoming: { cls: 'bg-transparent border-gray-300 dark:border-gray-600', label: 'Upcoming' },
};

const ROLE_LABEL: Record<string, string> = { sales: 'Sales rep', marketing: 'Marketing rep' };

function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmt(v: number | null | undefined, format: TeamMetricCell['format']): string {
  if (v == null) return '—';
  if (format === 'pct') return `${v.toFixed(1)}%`;
  return formatKpiValue(v, format);
}

function Trend({ cell }: { cell: TeamMetricCell }) {
  const { value, previous } = cell;
  if (value == null || previous == null) return null;
  const tol = Math.max(Math.abs(previous) * 0.005, 1e-9);
  if (Math.abs(value - previous) <= tol) {
    return <span className="text-[10px] text-gray-400" title={`Same as last month (${fmt(previous, cell.format)})`}>–</span>;
  }
  const up = value > previous;
  return (
    <span
      className={`text-[10px] ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
      title={`Same point last month: ${fmt(previous, cell.format)}`}
    >
      {up ? '▲' : '▼'}
    </span>
  );
}

function Best({ cell }: { cell: TeamMetricCell }) {
  if (cell.best == null || cell.best <= 0 || cell.value == null || cell.value < cell.best) return null;
  return (
    <span className="text-[10px] text-amber-500" title="Best month so far">
      ★
    </span>
  );
}

function Stat({ cell }: { cell: TeamMetricCell }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">{cell.label}</div>
      <div className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
        {fmt(cell.value, cell.format)} <Trend cell={cell} /> <Best cell={cell} />
      </div>
    </div>
  );
}

function EodStrip({ eod, notes }: { eod: TeamEodSummary; notes: TeamEodNote[] }) {
  const noteByDate = new Map(notes.map((n) => [n.date, n]));
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <div className="text-xs text-gray-600 dark:text-gray-300 w-[6.5rem]">EODs</div>
      <div
        className="flex flex-wrap gap-1"
        role="img"
        aria-label={`${eod.submitted_days} of ${eod.required_days} EODs submitted`}
      >
        {eod.days.map((d) => (
          <span
            key={d.date}
            className={`h-3 w-3 rounded-full border ${DOT[d.status].cls}`}
            title={[
              `${parseYmd(d.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} — ${DOT[d.status].label}`,
              noteByDate.get(d.date)?.content_type ? `Content: ${noteByDate.get(d.date)?.content_type}` : '',
              noteByDate.get(d.date)?.setter_context ?? '',
            ]
              .filter(Boolean)
              .join('\n')}
          />
        ))}
      </div>
      <div className="text-xs tabular-nums text-gray-600 dark:text-gray-300">
        <span
          className={`font-semibold ${eod.missed ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
        >
          {eod.submitted_days}/{eod.required_days}
        </span>{' '}
        · streak <span className="font-semibold">{eod.streak}</span>
      </div>
    </div>
  );
}

/** Setter context + content attracting ICP: month summary chips, then the latest notes. */
function SetterNotes({ m }: { m: TeamOverviewMember }) {
  const [showAll, setShowAll] = useState(false);
  if (!m.notes.length && !m.content_counts.length) {
    return <p className="text-[11px] text-gray-500 dark:text-gray-400">No setter context or content notes this month.</p>;
  }
  const notes = showAll ? m.notes : m.notes.slice(0, 3);
  return (
    <div className="space-y-2">
      {m.content_counts.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-1">Content attracting ICP</span>
          {m.content_counts.map((c) => (
            <span
              key={c.content_type}
              className="rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-700 dark:text-violet-300"
            >
              {c.content_type} ×{c.count}
            </span>
          ))}
        </div>
      ) : null}
      {notes.length ? (
        <ul className="space-y-1.5">
          {notes.map((n) => (
            <li key={n.date} className="text-xs text-gray-700 dark:text-gray-300">
              <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                {parseYmd(n.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              {n.content_type ? (
                <span className="ml-1.5 text-violet-700 dark:text-violet-300">[{n.content_type}]</span>
              ) : null}
              {n.setter_context ? <span className="ml-1.5 whitespace-pre-line">{n.setter_context}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {m.notes.length > 3 ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${m.notes.length} notes`}
        </button>
      ) : null}
    </div>
  );
}

export type TeamAttentionItem = { key: string; text: string; tone: 'red' | 'amber' };

/** Missed EODs; the Organic dash shows it in its right-hand column. */
export function TeamAttentionCard({ items }: { items: TeamAttentionItem[] }) {
  return (
    <div
      className={`rounded-xl border p-3 sm:p-4 ${
        items.length ? 'border-red-400/30 bg-red-500/5' : 'border-emerald-400/30 bg-emerald-500/5'
      }`}
    >
      {items.length ? (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300 mb-1.5">
            Needs attention ({items.length})
          </div>
          <ul className="space-y-1">
            {items.map((a) => (
              <li
                key={a.key}
                className={`text-sm ${a.tone === 'red' ? 'text-red-700 dark:text-red-300' : 'text-amber-700 dark:text-amber-300'}`}
              >
                • {a.text}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-emerald-700 dark:text-emerald-300">
          ✓ Team on track — no missed EODs.
        </p>
      )}
    </div>
  );
}

function needsAttention(m: TeamOverviewMember): boolean {
  return Boolean(m.eod && m.eod.missed > 0);
}

export default function TeamOverviewView({
  onOpenRoster,
  month,
  onAttentionChange,
  onlyUserId = null,
  range = null,
}: {
  /** Page date range (Funnels → Organic): any inclusive span; overrides `month`. */
  range?: { start: string; end: string } | null;
  /** Organic calendar rep filter: show just this person's card (null = everyone). */
  onlyUserId?: string | null;
  /** When set, "Needs attention" is handed to the parent (null = no team) instead of rendered inline. */
  onAttentionChange?: (items: TeamAttentionItem[] | null) => void;
  /** Where "assign roles" goes (Settings → Team). */
  onOpenRoster: () => void;
  /** Controlled month (any YYYY-MM-DD in it) — the Organic calendar drives it; hides this view's own month nav. */
  month?: string;
}) {
  const [ownAnchor, setAnchor] = useState<string | undefined>(undefined);
  const anchor = month ?? ownAnchor;
  const rangeStart = range?.start;
  const rangeEnd = range?.end;
  const [data, setData] = useState<TeamOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .getTeamOverview('month', anchor, rangeEnd ? { start: rangeStart, end: rangeEnd } : undefined)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(formatApiError(e, 'Failed to load the team view'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [anchor, rangeStart, rangeEnd]);

  const isCurrent = Boolean(data && data.today >= data.period_start && data.today <= data.period_end);
  const label = data
    ? parseYmd(data.period_start).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : '…';

  const shift = (delta: number) => {
    if (!data) return;
    const d = parseYmd(data.period_start);
    d.setMonth(d.getMonth() + delta);
    setAnchor(toYmd(d));
  };

  const attention = useMemo(() => {
    const items: TeamAttentionItem[] = [];
    for (const m of data?.members ?? []) {
      if (m.eod && m.eod.missed > 0) {
        items.push({
          key: `${m.user_id}-eod`,
          tone: 'red',
          text: `${m.name} missed ${m.eod.missed} EOD${m.eod.missed === 1 ? '' : 's'} (${m.eod.submitted_days}/${m.eod.required_days})`,
        });
      }
    }
    return items;
  }, [data]);

  const hasTeam = Boolean(data && data.members.length > 0);
  useEffect(() => {
    if (!onAttentionChange) return;
    onAttentionChange(hasTeam ? attention : null);
  }, [onAttentionChange, hasTeam, attention]);
  useEffect(() => {
    if (!onAttentionChange) return;
    return () => onAttentionChange(null);
  }, [onAttentionChange]);

  // People needing attention first, then alphabetical.
  const members = useMemo(
    () =>
      [...(data?.members ?? [])]
        .filter((m) => !onlyUserId || m.user_id === onlyUserId)
        .sort((a, b) => Number(needsAttention(b)) - Number(needsAttention(a)) || a.name.localeCompare(b.name)),
    [data, onlyUserId],
  );

  return (
    <div className="space-y-3">
      <div className="glass-card rounded-xl border border-white/10 px-3 py-2.5 flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mr-1">Team</div>
        {month || range ? null : (
        <MonthNavigator
          label={label}
          rangeStart={data?.period_start ?? ''}
          rangeEnd={data?.period_end ?? ''}
          onPrev={() => shift(-1)}
          onNext={() => shift(1)}
          nextDisabled={isCurrent}
        />
        )}
        {data && isCurrent ? (
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {Math.round(data.pace * 100)}% of required days in
          </span>
        ) : null}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[10px] text-gray-500 dark:text-gray-400">
          <span>
            {data?.period === 'range'
              ? '▲▼ vs the same number of days just before'
              : '▲▼ vs same point last month · ★ best month'}
          </span>
        </span>
        {loading ? <span className="text-[11px] text-gray-500 dark:text-gray-400">Loading…</span> : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</div>
      ) : null}

      {data && data.members.length === 0 && !loading ? (
        <div className="glass-card rounded-xl border border-white/10 p-6 text-center text-sm text-gray-600 dark:text-gray-300">
          No sales reps yet.{' '}
          <button type="button" onClick={onOpenRoster} className="text-indigo-600 dark:text-indigo-400 hover:underline">
            Set someone&apos;s role to Sales rep in Settings → Team →
          </button>
        </div>
      ) : null}

      {hasTeam && !onAttentionChange ? <TeamAttentionCard items={attention} /> : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {members.map((m) => {
          return (
            <div
              key={m.user_id}
              className={`glass-card rounded-xl border p-3 sm:p-4 space-y-3 ${
                needsAttention(m) ? 'border-red-400/30' : 'border-white/10'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{m.name}</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400">{ROLE_LABEL[m.team_role] ?? m.team_role}</div>
              </div>

              {m.eod ? <EodStrip eod={m.eod} notes={m.notes} /> : null}

              {m.setter_metrics.length ? (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {m.setter_metrics.map((c) => (
                    <Stat key={c.key} cell={c} />
                  ))}
                </div>
              ) : null}

              {m.setter_metrics.length ? <SetterNotes m={m} /> : null}

              {m.closer_metrics.length ? (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {m.closer_metrics.map((c) => (
                    <Stat key={c.key} cell={c} />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
