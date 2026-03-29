'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiClient, PerformanceSnapshot, PerformanceTask } from '@/lib/api';
import { useLoading } from '@/contexts/LoadingContext';
import PerformancePipelineMini from '@/components/ui/PerformancePipelineMini';

type RxMap = Record<string, { why: string; prescription: string; next_step: string }>;

function severityStyles(level: string): string {
  const v = (level || 'ok').toLowerCase();
  if (v === 'risk') return 'bg-red-500/15 text-red-800 dark:text-red-200 ring-1 ring-red-500/30';
  if (v === 'watch') return 'bg-amber-500/15 text-amber-900 dark:text-amber-100 ring-1 ring-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-500/25';
}

function formatUsd(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatPct(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(0)}%`;
}

interface PerformancePanelProps {
  /** In the global drawer, hide the large title (drawer chrome already shows "Performance"). */
  variant?: 'default' | 'drawer';
}

export default function PerformancePanel({ variant = 'default' }: PerformancePanelProps) {
  const { setLoading: setGlobalLoading } = useLoading();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<PerformanceSnapshot | null>(null);
  const [tasks, setTasks] = useState<PerformanceTask[]>([]);
  const [rx, setRx] = useState<RxMap>({});
  const [rxStatus, setRxStatus] = useState<'idle' | 'loading' | 'done' | 'skipped'>('idle');
  const [patching, setPatching] = useState(false);
  /** LLM prescription runs at most once per mounted panel lifetime (not on every tab return). */
  const prescriptionRequestedRef = useRef(false);
  /** After first successful snapshot we soft-refresh without full-page skeleton. */
  const hasSnapshotDataRef = useRef(false);
  const [signalsRefreshing, setSignalsRefreshing] = useState(false);

  const loadSnapshot = useCallback(async () => {
    if (!hasSnapshotDataRef.current) {
      setLoading(true);
    }
    setError(null);
    try {
      const data = await apiClient.getPerformanceSnapshot();
      setError(null);
      setSnap(data);
      setTasks(data.tasks || []);
      hasSnapshotDataRef.current = true;
      setLoading(false);
      setGlobalLoading(false);

      if (!prescriptionRequestedRef.current) {
        prescriptionRequestedRef.current = true;
        setRxStatus('loading');
        void (async () => {
          try {
            const pr = await apiClient.postPerformancePrescription();
            const m: RxMap = {};
            for (const t of pr.tasks || []) {
              m[t.id] = {
                why: t.why || '',
                prescription: t.prescription || '',
                next_step: t.next_step || '',
              };
            }
            setRx(m);
            setRxStatus('done');
          } catch {
            setRxStatus('skipped');
          }
        })();
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as Error)?.message ||
        'Failed to load performance data';
      setError(String(msg));
      if (!hasSnapshotDataRef.current) {
        setSnap(null);
        setTasks([]);
      }
      setLoading(false);
      setGlobalLoading(false);
    }
  }, [setGlobalLoading]);

  const refreshPipelineSignals = useCallback(async () => {
    setSignalsRefreshing(true);
    try {
      await loadSnapshot();
    } finally {
      setSignalsRefreshing(false);
    }
  }, [loadSnapshot]);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  const { topOpen, backlogOpen, completedTasks } = useMemo(() => {
    const open = tasks.filter((t) => !t.completed).sort((a, b) => b.impact_score - a.impact_score);
    const done = tasks.filter((t) => t.completed).sort((a, b) => b.impact_score - a.impact_score);
    return {
      topOpen: open.slice(0, 10),
      backlogOpen: open.slice(10, 40),
      completedTasks: done,
    };
  }, [tasks]);

  const flushCompleted = useCallback(
    async (nextTasks: PerformanceTask[]) => {
      const ids = nextTasks.filter((t) => t.completed).map((t) => t.id);
      setPatching(true);
      try {
        await apiClient.patchPerformanceTasks(ids);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (e as Error)?.message ||
          'Could not save';
        setError(String(msg));
        await loadSnapshot();
      } finally {
        setPatching(false);
      }
    },
    [loadSnapshot]
  );

  const toggleCompleted = (id: string) => {
    const next = tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTasks(next);
    void flushCompleted(next);
  };

  const diagnosis = snap?.diagnosis;

  if (loading && !snap) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-4 animate-pulse px-1">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/3" />
        <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    );
  }

  if (error && !snap) {
    return (
      <div className="w-full max-w-lg mx-auto glass-card p-6 text-center">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button type="button" onClick={() => loadSnapshot()} className="glass-button px-4 py-2 rounded-md text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full mx-auto px-1 pb-8 ${variant === 'drawer' ? 'max-w-none' : 'max-w-3xl pb-12'}`}>
      {variant === 'drawer' ? (
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <Link
            href="/?tab=intelligence"
            className="glass-button-secondary px-3 py-1.5 rounded-md whitespace-nowrap"
          >
            Personalize
          </Link>
          <Link href="/?tab=funnels" className="glass-button-secondary px-3 py-1.5 rounded-md whitespace-nowrap">
            Funnels
          </Link>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Performance</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              ROI-ranked actions from your pipeline, funnels, and payments.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link
              href="/?tab=intelligence"
              className="glass-button-secondary px-3 py-1.5 rounded-md whitespace-nowrap"
            >
              Personalize recommendations
            </Link>
            <Link href="/?tab=funnels" className="glass-button-secondary px-3 py-1.5 rounded-md whitespace-nowrap">
              Funnels
            </Link>
          </div>
        </div>
      )}

      {diagnosis && (
        <div className="glass-card neon-glow p-4 mb-6 rounded-xl">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Pipeline signals
            </p>
            {variant === 'drawer' && (
              <button
                type="button"
                onClick={() => void refreshPipelineSignals()}
                disabled={signalsRefreshing}
                className="shrink-0 inline-flex items-center justify-center rounded-lg p-1.5 text-gray-500 hover:text-violet-600 hover:bg-violet-500/10 dark:text-gray-400 dark:hover:text-violet-300 dark:hover:bg-violet-500/15 transition-colors disabled:opacity-60 disabled:pointer-events-none"
                aria-label="Refresh pipeline signals"
                title="Refresh pipeline signals"
              >
                <svg
                  className={`h-4 w-4 ${signalsRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityStyles(diagnosis.traffic)}`}>
              Traffic: {diagnosis.traffic}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityStyles(diagnosis.nurture)}`}>
              Nurture: {diagnosis.nurture}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityStyles(diagnosis.conversion)}`}>
              Conversion: {diagnosis.conversion}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
            {diagnosis.traffic_hint} {diagnosis.nurture_hint} {diagnosis.conversion_hint}
          </p>

          {diagnosis.pipeline_strip?.segments?.length ? (
            <PerformancePipelineMini
              segments={diagnosis.pipeline_strip.segments}
              totalClients={diagnosis.pipeline_strip.total_clients ?? 0}
            />
          ) : null}

          {(diagnosis.revenue_compare || diagnosis.funnel_compare) && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {diagnosis.revenue_compare && (
                <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 border border-gray-200/60 dark:border-gray-600/40">
                  <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Cash & MRR</p>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-300">
                    <li>
                      Rolling 30d:{' '}
                      <strong className="text-gray-900 dark:text-gray-100">
                        {formatUsd(diagnosis.revenue_compare.cash_last_30_days)}
                      </strong>
                      {diagnosis.revenue_compare.pct_change_30d != null &&
                      diagnosis.revenue_compare.pct_change_30d !== undefined ? (
                        <span
                          className={
                            diagnosis.revenue_compare.pct_change_30d < 0
                              ? ' text-red-600 dark:text-red-400'
                              : diagnosis.revenue_compare.pct_change_30d > 0
                                ? ' text-emerald-600 dark:text-emerald-400'
                                : ''
                          }
                        >
                          {' '}
                          ({formatPct(diagnosis.revenue_compare.pct_change_30d)} vs prior 30d)
                        </span>
                      ) : null}
                    </li>
                    <li className="text-gray-500 dark:text-gray-400">
                      Prior 30d: {formatUsd(diagnosis.revenue_compare.cash_prior_30_days)}
                    </li>
                    <li>
                      MTD vs same days last month:{' '}
                      <strong>{formatUsd(diagnosis.revenue_compare.cash_mtd)}</strong>
                      {diagnosis.revenue_compare.pct_change_mtd != null &&
                      diagnosis.revenue_compare.pct_change_mtd !== undefined ? (
                        <span
                          className={
                            diagnosis.revenue_compare.pct_change_mtd < 0
                              ? ' text-red-600 dark:text-red-400'
                              : diagnosis.revenue_compare.pct_change_mtd > 0
                                ? ' text-emerald-600 dark:text-emerald-400'
                                : ''
                          }
                        >
                          {' '}
                          ({formatPct(diagnosis.revenue_compare.pct_change_mtd)})
                        </span>
                      ) : null}
                    </li>
                    <li className="text-gray-500 dark:text-gray-400">
                      Same span prior month: {formatUsd(diagnosis.revenue_compare.cash_mtd_prev_month_same_range)}
                    </li>
                    {typeof diagnosis.revenue_compare.mrr === 'number' ? (
                      <li>
                        MRR:{' '}
                        <strong className="text-gray-900 dark:text-gray-100">
                          {formatUsd(diagnosis.revenue_compare.mrr)}
                        </strong>
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
              {diagnosis.funnel_compare && (
                <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 border border-gray-200/60 dark:border-gray-600/40">
                  <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Funnel (blended, last 30d)</p>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-300">
                    <li>
                      Visitors:{' '}
                      <strong>{diagnosis.funnel_compare.visitors_last_30 ?? 0}</strong>
                      {diagnosis.funnel_compare.pct_change_visitors != null &&
                      diagnosis.funnel_compare.pct_change_visitors !== undefined ? (
                        <span
                          className={
                            diagnosis.funnel_compare.pct_change_visitors < 0
                              ? ' text-red-600 dark:text-red-400'
                              : diagnosis.funnel_compare.pct_change_visitors > 0
                                ? ' text-emerald-600 dark:text-emerald-400'
                                : ''
                          }
                        >
                          {' '}
                          ({formatPct(diagnosis.funnel_compare.pct_change_visitors)} vs prior 30d)
                        </span>
                      ) : null}
                    </li>
                    <li className="text-gray-500 dark:text-gray-400">
                      Prior 30d visitors: {diagnosis.funnel_compare.visitors_prior_30 ?? 0}
                    </li>
                    <li>
                      Conversions:{' '}
                      <strong>{diagnosis.funnel_compare.conversions_last_30 ?? 0}</strong>
                      {diagnosis.funnel_compare.pct_change_conversions != null &&
                      diagnosis.funnel_compare.pct_change_conversions !== undefined ? (
                        <span
                          className={
                            diagnosis.funnel_compare.pct_change_conversions < 0
                              ? ' text-red-600 dark:text-red-400'
                              : diagnosis.funnel_compare.pct_change_conversions > 0
                                ? ' text-emerald-600 dark:text-emerald-400'
                                : ''
                          }
                        >
                          {' '}
                          ({formatPct(diagnosis.funnel_compare.pct_change_conversions)})
                        </span>
                      ) : null}
                    </li>
                    <li>
                      Conv. rate:{' '}
                      <strong>
                        {(diagnosis.funnel_compare.conversion_rate_last_30 ?? 0).toFixed(1)}%
                      </strong>
                      <span className="text-gray-500 dark:text-gray-400">
                        {' '}
                        (was {(diagnosis.funnel_compare.conversion_rate_prior_30 ?? 0).toFixed(1)}%)
                      </span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {diagnosis.insights && diagnosis.insights.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-200 list-disc list-inside leading-relaxed">
              {diagnosis.insights.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rxStatus === 'loading' && (
        <p className="text-xs text-violet-600 dark:text-violet-400 mb-3">Tailoring copy to your Intelligence profile…</p>
      )}
      {rxStatus === 'skipped' && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Showing baseline recommendations (AI optional).</p>
      )}

      {error && snap && <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">{error}</p>}

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Top priorities</h3>
        {topOpen.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 glass-card p-4 rounded-xl">
            No open tasks — great job. Refresh after new leads or funnel traffic.
          </p>
        ) : (
          <ul className="space-y-3">
            {topOpen.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                rx={rx[t.id]}
                disabled={patching}
                onToggle={() => toggleCompleted(t.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {backlogOpen.length > 0 && (
        <details className="glass-card rounded-xl mb-6 group">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200 list-none flex items-center justify-between">
            <span>Backlog ({backlogOpen.length})</span>
            <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <ul className="px-4 pb-4 space-y-3 border-t border-gray-200/50 dark:border-gray-700/50 pt-3">
            {backlogOpen.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                rx={rx[t.id]}
                disabled={patching}
                onToggle={() => toggleCompleted(t.id)}
              />
            ))}
          </ul>
        </details>
      )}

      {completedTasks.length > 0 && (
        <details className="glass-card rounded-xl">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 list-none">
            Completed ({completedTasks.length})
          </summary>
          <ul className="px-4 pb-4 space-y-3 opacity-90 pt-2">
            {completedTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                rx={rx[t.id]}
                disabled={patching}
                onToggle={() => toggleCompleted(t.id)}
              />
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-500 mt-8 text-center">
        {snap?.generated_at ? `Snapshot ${new Date(snap.generated_at).toLocaleString()}` : ''}
      </p>
    </div>
  );
}

function TaskRow({
  task,
  rx,
  disabled,
  onToggle,
}: {
  task: PerformanceTask;
  rx?: { why: string; prescription: string; next_step: string };
  disabled: boolean;
  onToggle: () => void;
}) {
  const why = (rx?.why || task.why || '').trim();
  const prescription = (rx?.prescription || task.prescription || '').trim();
  const nextStep = (rx?.next_step || task.next_step || '').trim();
  const actions = task.recommended_actions?.filter(Boolean) || [];
  const fix = actions[0] || prescription;
  const ev = task.evidence as Record<string, unknown> | undefined;
  const fromTerminal = ev?.source === 'client_card';
  const healthLabel =
    typeof ev?.health_score === 'number' ? `${(ev.health_score as number).toFixed(0)} health` : null;

  const evidenceEntries = (() => {
    if (!ev || typeof ev !== 'object') return [] as [string, string][];
    const skip = new Set(['source']);
    const rows: [string, string][] = [];
    for (const [k, v] of Object.entries(ev)) {
      if (skip.has(k) || v === undefined || v === null) continue;
      if (typeof v === 'object') {
        rows.push([k, JSON.stringify(v)]);
      } else {
        rows.push([k, String(v)]);
      }
    }
    return rows;
  })();

  return (
    <li className={`glass-card rounded-xl overflow-hidden ${task.completed ? 'opacity-75' : ''}`}>
      <div className="flex gap-3 p-4">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={onToggle}
          disabled={disabled}
          className="mt-1.5 h-4 w-4 shrink-0 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
          aria-label={`Mark complete: ${task.title}`}
          onClick={(e) => e.stopPropagation()}
        />
        <details className="group min-w-0 flex-1">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className={`flex flex-wrap items-baseline gap-2 ${task.completed ? 'line-through' : ''}`}>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{task.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {task.category === 'client' ? 'Terminal' : task.category}
                  </span>
                  {fromTerminal && healthLabel && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {healthLabel}
                    </span>
                  )}
                  <span className="text-xs text-violet-600 dark:text-violet-400 tabular-nums">
                    ROI {task.impact_score.toFixed(0)}
                  </span>
                </div>
                {why && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2 pr-6">{why}</p>
                )}
                {fix && !why && (
                  <p className="text-sm text-gray-700 dark:text-gray-200 mt-1 line-clamp-2 pr-6">Fix: {fix}</p>
                )}
                <span className="mt-1 block text-xs text-violet-600/90 dark:text-violet-400/90 group-open:hidden">
                  Expand for full details
                </span>
              </div>
              <span
                className="mt-0.5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                aria-hidden
              >
                ▼
              </span>
            </div>
          </summary>
          <div className="mt-3 space-y-3 border-t border-gray-200/60 pt-3 text-sm dark:border-gray-700/60">
            {fromTerminal && (
              <Link
                href="/?tab=terminal"
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline inline-block"
              >
                Open in Terminal
              </Link>
            )}
            {why && <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{why}</p>}
            {prescription && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Prescription
                </p>
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{prescription}</p>
              </div>
            )}
            {actions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Recommended actions
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                  {actions.map((a, i) => (
                    <li key={i} className="leading-relaxed">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {nextStep && (
              <p className="text-gray-600 dark:text-gray-300">
                <span className="font-medium text-gray-800 dark:text-gray-200">Next step: </span>
                {nextStep}
              </p>
            )}
            {evidenceEntries.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Evidence
                </p>
                <ul className="space-y-2 text-xs list-none">
                  {evidenceEntries.map(([k, v]) => (
                    <li key={k} className="border-l-2 border-violet-500/25 pl-2.5">
                      <span className="font-medium text-gray-500 dark:text-gray-400 capitalize block">
                        {k.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-800 dark:text-gray-200 break-words block mt-0.5">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>
    </li>
  );
}
