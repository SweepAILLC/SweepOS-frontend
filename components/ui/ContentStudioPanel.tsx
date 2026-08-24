'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  apiClient,
  ContentStudioBootstrap,
  ContentStudioBundle,
  ContentStudioStage,
  ContentStudioStageId,
} from '@/lib/api';
import { useLoading } from '@/contexts/LoadingContext';
import { formatApiError } from '@/lib/apiError';

const STAGES: ContentStudioStageId[] = ['TOF', 'MOF', 'BOF'];

const STAGE_LABEL: Record<ContentStudioStageId, string> = {
  TOF: 'Top of funnel',
  MOF: 'Middle of funnel',
  BOF: 'Bottom of funnel',
};

const STAGE_THEME: Record<
  ContentStudioStageId,
  { ring: string; chip: string; chipText: string; tint: string; border: string; iconColor: string; icon: React.ReactNode }
> = {
  TOF: {
    ring: 'ring-sky-400/30',
    chip: 'bg-sky-500/15',
    chipText: 'text-sky-700 dark:text-sky-300',
    tint: 'bg-sky-500/[0.04] dark:bg-sky-500/[0.06]',
    border: 'border-sky-400/30 dark:border-sky-500/20',
    iconColor: 'text-sky-500 dark:text-sky-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M10 3a7 7 0 1 0 4.95 11.95.75.75 0 1 1 1.06 1.06A8.5 8.5 0 1 1 18.5 10a.75.75 0 0 1-1.5 0A7 7 0 0 0 10 3Zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
      </svg>
    ),
  },
  MOF: {
    ring: 'ring-violet-400/30',
    chip: 'bg-violet-500/15',
    chipText: 'text-violet-700 dark:text-violet-300',
    tint: 'bg-violet-500/[0.04] dark:bg-violet-500/[0.06]',
    border: 'border-violet-400/30 dark:border-violet-500/20',
    iconColor: 'text-violet-500 dark:text-violet-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5C2 16.216 2.784 17 3.75 17h12.5A1.75 1.75 0 0 0 18 15.25V4.75A1.75 1.75 0 0 0 16.25 3H3.75ZM6 7.5A.75.75 0 0 1 6.75 7h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 7.5Zm0 3A.75.75 0 0 1 6.75 10h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10.5Zm.75 2.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5h-3.5Z" />
      </svg>
    ),
  },
  BOF: {
    ring: 'ring-emerald-400/30',
    chip: 'bg-emerald-500/15',
    chipText: 'text-emerald-700 dark:text-emerald-300',
    tint: 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]',
    border: 'border-emerald-400/30 dark:border-emerald-500/20',
    iconColor: 'text-emerald-500 dark:text-emerald-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
          clipRule="evenodd"
        />
      </svg>
    ),
  },
};

function formatLabel(fmt: string): string {
  if (fmt === 'long') return 'Long-form';
  if (fmt === 'short') return 'Short-form';
  return fmt;
}

function FormatBadge({ format }: { format: string }) {
  const isLong = format === 'long';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
        isLong
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'bg-pink-500/15 text-pink-700 dark:text-pink-300'
      }`}
    >
      {isLong ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path d="M2 5.75A2.75 2.75 0 0 1 4.75 3h10.5A2.75 2.75 0 0 1 18 5.75v8.5A2.75 2.75 0 0 1 15.25 17H4.75A2.75 2.75 0 0 1 2 14.25v-8.5Zm6.34 1.71a.75.75 0 0 0-1.18.61v3.86a.75.75 0 0 0 1.18.61l2.86-1.93a.75.75 0 0 0 0-1.22L8.34 7.46Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path d="M5 2.75A2.75 2.75 0 0 1 7.75 0h4.5A2.75 2.75 0 0 1 15 2.75v14.5A2.75 2.75 0 0 1 12.25 20h-4.5A2.75 2.75 0 0 1 5 17.25V2.75ZM10 16a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z" />
        </svg>
      )}
      {formatLabel(format)}
    </span>
  );
}

export default function ContentStudioPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setLoading: setGlobalLoading } = useLoading();

  const [salesPlaybookSource, setSalesPlaybookSource] = useState<'fathom' | 'default'>('default');
  const [contentBundle, setContentBundle] = useState<ContentStudioBundle | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [reanalyzeBusy, setReanalyzeBusy] = useState(false);
  /** True after a successful re-analyze request while the bundle may still be regenerating in the background. */
  const [conceptRegenPending, setConceptRegenPending] = useState(false);
  const [reanalyzeMessage, setReanalyzeMessage] = useState<string | null>(null);
  const bundlePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadBootstrap = useCallback(async () => {
    setError(null);
    try {
      const data: ContentStudioBootstrap = await apiClient.getContentStudioBootstrap();
      setSalesPlaybookSource(data.sales_playbook?.source === 'fathom' ? 'fathom' : 'default');
      setContentBundle(data.content_bundle ?? null);
      setBatchId(data.content_bundle?.batch_id ?? data.batch_id);
      setCompleted(new Set(data.completed_idea_ids || []));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as Error)?.message ||
        'Failed to load Content Studio';
      setError(String(msg));
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  }, [setGlobalLoading]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    return () => {
      if (bundlePollRef.current) {
        clearInterval(bundlePollRef.current);
        bundlePollRef.current = null;
      }
    };
  }, []);

  // Auto-poll while the bundle is missing or pre-v3 — covers the silent v2 → v3 background regen
  // triggered by /content-studio/bootstrap so the user doesn't have to refresh manually.
  useEffect(() => {
    if (loading) return;
    const needsPoll = !contentBundle || contentBundle.version < 3;
    if (!needsPoll) {
      if (bundlePollRef.current) {
        clearInterval(bundlePollRef.current);
        bundlePollRef.current = null;
      }
      return;
    }
    if (bundlePollRef.current) return;
    let ticks = 0;
    bundlePollRef.current = setInterval(() => {
      ticks += 1;
      void loadBootstrap();
      if (ticks >= 12) {
        if (bundlePollRef.current) clearInterval(bundlePollRef.current);
        bundlePollRef.current = null;
      }
    }, 6000);
  }, [loading, contentBundle, loadBootstrap]);

  useEffect(() => {
    if (!conceptRegenPending) return;
    if (contentBundle && contentBundle.version >= 3) {
      setConceptRegenPending(false);
    }
  }, [conceptRegenPending, contentBundle]);

  useEffect(() => {
    if (!conceptRegenPending) return;
    const id = window.setTimeout(() => setConceptRegenPending(false), 120_000);
    return () => window.clearTimeout(id);
  }, [conceptRegenPending]);

  const handleReanalyze = useCallback(async () => {
    if (reanalyzeBusy) return;
    setReanalyzeBusy(true);
    setReanalyzeMessage(null);
    setError(null);
    try {
      const res = await apiClient.postContentStudioReanalyze();
      const fs = (res.fathom_sync || {}) as Record<string, unknown>;
      const skipped = Boolean(fs.skipped);
      if (skipped) {
        setReanalyzeMessage(
          `Fathom: ${String(fs.reason || 'skipped')}. Concepts are still regenerating from your latest call signals.`
        );
      } else {
        const ing = Number(fs.ingested ?? 0);
        setReanalyzeMessage(
          `Fathom: ${ing} new meeting(s) ingested. Cleared health caches for ${res.health_clients_invalidated} clients. Drafting fresh TOF / MOF / BOF concepts…`
        );
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('sweep:content-studio-reanalyzed'));
      }
      setConceptRegenPending(true);
      if (bundlePollRef.current) {
        clearInterval(bundlePollRef.current);
        bundlePollRef.current = null;
      }
      let ticks = 0;
      bundlePollRef.current = setInterval(() => {
        ticks += 1;
        void loadBootstrap();
        if (ticks >= 24) {
          if (bundlePollRef.current) clearInterval(bundlePollRef.current);
          bundlePollRef.current = null;
        }
      }, 5000);
    } catch (e: unknown) {
      setConceptRegenPending(false);
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 429) {
        setError('Re-analyze is limited to 3 runs per hour. Try again later.');
      } else {
        setError(formatApiError(e, 'Re-analyze failed. Try again in a moment.'));
      }
    } finally {
      setReanalyzeBusy(false);
    }
  }, [reanalyzeBusy, loadBootstrap]);

  const flushCompleted = useCallback(
    async (next: Set<string>) => {
      try {
        await apiClient.patchContentStudioCompletions(Array.from(next));
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (e as Error)?.message ||
          'Could not save';
        setError(String(msg));
        await loadBootstrap();
      }
    },
    [loadBootstrap]
  );

  const toggleCompleted = (id: string) => {
    const next = new Set(completed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCompleted(next);
    void flushCompleted(next);
  };

  const stagesOrdered: ContentStudioStage[] = useMemo(() => {
    const map = new Map<ContentStudioStageId, ContentStudioStage>();
    for (const s of contentBundle?.stages ?? []) {
      if (s && (s.id === 'TOF' || s.id === 'MOF' || s.id === 'BOF')) {
        map.set(s.id, s);
      }
    }
    return STAGES.map((sid) => map.get(sid)).filter(Boolean) as ContentStudioStage[];
  }, [contentBundle]);

  const bundleLoading = loading && !contentBundle;
  const bundleStale = contentBundle && contentBundle.version < 3;

  return (
    <div className="max-w-6xl mx-auto w-full px-1 pb-12 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Marketing Intel</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Long-form and short-form video concepts mined purely from your Fathom calls and tied to the ICP defined in{' '}
          <Link href="/?tab=intelligence" className="text-violet-600 dark:text-violet-400 underline">
            Intelligence
          </Link>
          . Bulleted concepts only — no scripts. Each one is intentionally curated to move a viewer one step closer to a
          sale. For full call coaching reports, use the{' '}
          <Link href="/?tab=call_library" className="text-violet-600 dark:text-violet-400 underline">
            Call Library
          </Link>{' '}
          tab.
        </p>
      </div>

      {error && (
        <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <section className="glass-card neon-glow rounded-xl p-4 sm:p-5 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2 min-w-0">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Sales data source</h3>
            <span
              className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${
                salesPlaybookSource === 'fathom'
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  : 'bg-gray-500/15 text-gray-600 dark:text-gray-400'
              }`}
            >
              {salesPlaybookSource === 'fathom' ? 'Fathom + call insights' : 'Expert baseline'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void handleReanalyze()}
            disabled={reanalyzeBusy || loading || conceptRegenPending}
            aria-busy={reanalyzeBusy || conceptRegenPending}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg glass-button-secondary hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Pull latest Fathom meetings, refresh Intelligence-related caches, and regenerate TOF / MOF / BOF concepts (max 3 per hour)"
          >
            <svg
              className={`w-3.5 h-3.5 ${reanalyzeBusy || conceptRegenPending ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {reanalyzeBusy ? 'Starting…' : conceptRegenPending ? 'Regenerating concepts…' : 'Re-analyze from calls'}
          </button>
        </div>
        {reanalyzeMessage ? (
          <p className="text-xs text-violet-700 dark:text-violet-300 bg-violet-500/10 rounded-lg px-3 py-2 border border-violet-500/20">
            {reanalyzeMessage}
          </p>
        ) : null}
        {conceptRegenPending && !reanalyzeBusy ? (
          <p className="text-xs text-gray-600 dark:text-gray-400 bg-gray-500/10 rounded-lg px-3 py-2 border border-gray-500/15">
            Finishing concept drafts in the background — this can take up to a couple of minutes. This page keeps polling
            automatically.
          </p>
        ) : null}
        {salesPlaybookSource === 'default' && (
          <p className="text-xs text-amber-700/90 dark:text-amber-300/90 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
            Connect Fathom and sync calls so TOF/MOF/BOF concepts mirror real conversations and on-brand client wins.
          </p>
        )}
        {bundleStale ? (
          <p className="text-xs text-amber-700/90 dark:text-amber-300/90 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
            Upgrading to the new TOF / MOF / BOF concept layout — fresh concepts are drafting in the background. This
            page will refresh automatically.
          </p>
        ) : null}
        {batchId ? (
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Bundle batch: {batchId.slice(0, 8)}…
            {contentBundle?.source === 'default' ? (
              <span className="ml-2 text-amber-600 dark:text-amber-400">
                (placeholder — enable LLM and sync Fathom for the full draft)
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      {bundleLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      )}

      {stagesOrdered.length ? (
        <div className="space-y-6">
          {stagesOrdered.map((stage) => {
            const theme = STAGE_THEME[stage.id];
            return (
              <section
                key={stage.id}
                className={`glass-card rounded-2xl border ${theme.tint} ${theme.border} p-4 sm:p-5 space-y-4`}
              >
                <header className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 ${theme.iconColor}`}>{theme.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${theme.chip} ${theme.chipText}`}
                      >
                        {stage.id} — {STAGE_LABEL[stage.id]}
                      </span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        {stage.concepts.length} concept{stage.concepts.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <h3 className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100">{stage.title}</h3>
                    {stage.intro ? (
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{stage.intro}</p>
                    ) : null}
                  </div>
                </header>

                {stage.concepts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                    No concepts for this stage yet — sync more Fathom calls.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stage.concepts.map((concept) => {
                      const isDone = completed.has(concept.id);
                      return (
                        <div
                          key={concept.id}
                          className={`rounded-xl p-4 border bg-white/60 dark:bg-gray-900/40 space-y-3 transition-opacity ${
                            theme.border
                          } ${isDone ? 'opacity-70' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isDone}
                              onChange={() => toggleCompleted(concept.id)}
                              className="mt-1 rounded border-gray-400"
                              aria-label="Mark concept produced"
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <FormatBadge format={concept.format} />
                              </div>
                              <p
                                className={`text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100 ${
                                  isDone ? 'line-through' : ''
                                }`}
                              >
                                {concept.title}
                              </p>

                              {concept.hook ? (
                                <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 px-2.5 py-2">
                                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400 mb-0.5">
                                    Hook
                                  </span>
                                  <p className="text-xs font-medium text-violet-900 dark:text-violet-200 leading-snug">
                                    “{concept.hook}”
                                  </p>
                                </div>
                              ) : null}

                              {concept.bullets.length ? (
                                <ul className="list-disc list-inside space-y-1 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                  {concept.bullets.map((b, i) => (
                                    <li key={i}>{b}</li>
                                  ))}
                                </ul>
                              ) : null}

                              {concept.why_for_icp ? (
                                <div className="text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200/50 dark:border-gray-600/50 pt-2 leading-relaxed">
                                  <span className="font-semibold text-gray-500 dark:text-gray-500">
                                    Why it lands for your ICP:{' '}
                                  </span>
                                  {concept.why_for_icp}
                                </div>
                              ) : null}

                              {concept.funnel_path_to_sale ? (
                                <div className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                  <span className="font-semibold">Path to sale: </span>
                                  {concept.funnel_path_to_sale}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : !bundleLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No concepts loaded yet.</p>
      ) : null}

      <section className="glass-card rounded-xl p-4 text-center text-xs text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600">
        Instagram publishing — coming soon.
      </section>
    </div>
  );
}
