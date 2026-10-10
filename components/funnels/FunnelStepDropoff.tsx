import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import type { FunnelAnalytics, StepCount } from '@/types/funnel';

/**
 * Step-by-step drop-off for one funnel: a bar per tracked step (Settings → Steps),
 * sized against the largest step, with the share lost between each pair labelled.
 * Counts unique visitors; falls back to raw events when the funnel's events carry
 * no visitor_id (older snippets), and says so.
 */

interface FunnelStepDropoffProps {
  funnelId: string;
  start?: string;
  end: string;
  /** Bumped by the dashboard's reload; forces a fresh fetch past the cache. */
  reloadKey?: number;
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${v.toFixed(0)}%`;
}

export default function FunnelStepDropoff({ funnelId, start, end, reloadKey = 0 }: FunnelStepDropoffProps) {
  const [steps, setSteps] = useState<StepCount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .getFunnelAnalytics(funnelId, undefined, reloadKey > 0, { start, end })
      .then((res: unknown) => {
        if (!cancelled) setSteps((res as FunnelAnalytics | null)?.step_counts ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load step counts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [funnelId, start, end, reloadKey]);

  const view = useMemo(() => {
    if (!steps?.length) return null;
    const byVisitor = steps.some((s) => (s.unique_visitors ?? 0) > 0);
    const valueOf = (s: StepCount) => (byVisitor ? s.unique_visitors ?? 0 : s.count);
    const rows = steps.map((s, i) => {
      const value = valueOf(s);
      const prev = i > 0 ? valueOf(steps[i - 1]) : null;
      const kept = prev ? (value / prev) * 100 : null;
      return { step: s, value, kept, lost: kept == null ? null : Math.max(0, 100 - kept) };
    });
    // The leak worth fixing first: the largest share lost between two steps.
    let worst = -1;
    rows.forEach((r, i) => {
      if (r.lost != null && r.lost > 0 && (worst < 0 || r.lost > (rows[worst].lost ?? 0))) worst = i;
    });
    return {
      byVisitor,
      rows,
      worst,
      top: rows[0].value,
      max: Math.max(...rows.map((r) => r.value), 1),
      total: rows.reduce((n, r) => n + r.value, 0),
    };
  }, [steps]);

  if (loading && !steps) {
    return <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>;
  }
  if (error) {
    return <p className="py-6 text-center text-sm text-red-500">{error}</p>;
  }
  if (!view) {
    return (
      <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No steps defined for this funnel yet. Add them under Settings → Steps.
      </p>
    );
  }
  if (view.total === 0) {
    return (
      <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No step events in this range. Check that the tracking snippet fires each step&apos;s event name.
      </p>
    );
  }

  return (
    <div className={loading ? 'opacity-60 transition-opacity' : ''}>
      <ol>
        {view.rows.map((r, i) => {
          const name = r.step.label || r.step.event_name;
          const ofTop = view.top > 0 ? (r.value / view.top) * 100 : null;
          const isWorst = i === view.worst;
          return (
            <li key={`${r.step.step_order}-${r.step.event_name}`}>
              {r.lost != null ? (
                <div
                  className={`flex items-center gap-1.5 py-1 pl-[7.75rem] text-[11px] tabular-nums ${
                    isWorst ? 'text-red-500 font-semibold' : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <span aria-hidden>↓</span>
                  <span>
                    {pct(r.lost)} drop-off · {pct(r.kept)} continue
                    {isWorst ? ' · biggest leak' : ''}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <div
                  className="w-[7rem] shrink-0 truncate text-sm text-gray-800 dark:text-gray-200"
                  title={r.step.label ? `${r.step.label} (${r.step.event_name})` : r.step.event_name}
                >
                  <span className="mr-1 tabular-nums text-gray-400 dark:text-gray-500">{i + 1}.</span>
                  {name}
                </div>
                <div className="h-6 flex-1 rounded bg-white/5">
                  <div
                    className={`h-full rounded ${isWorst ? 'bg-red-500/70' : 'bg-violet-500/80'}`}
                    style={{ width: `${(r.value / view.max) * 100}%` }}
                  />
                </div>
                <div className="w-[7.5rem] shrink-0 text-right text-sm tabular-nums text-gray-900 dark:text-gray-100">
                  {r.value.toLocaleString()}
                  <span className="ml-1.5 text-[11px] text-gray-500 dark:text-gray-400">{pct(ofTop)}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[10px] text-gray-500 dark:text-gray-400">
        {view.byVisitor
          ? 'Unique visitors who fired each step’s event in this range. The % beside each count is its share of step 1; the biggest leak is the largest share lost between two steps.'
          : 'Counting raw events: this funnel’s events carry no visitor_id, so refreshes and repeat visits count more than once.'}
      </p>
    </div>
  );
}
