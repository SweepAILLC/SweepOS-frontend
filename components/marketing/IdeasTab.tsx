'use client';

import Link from 'next/link';
import {
  ContentStudioBundle,
  ContentStudioStage,
  ContentStudioStageId,
} from '@/lib/api';

const STAGES: ContentStudioStageId[] = ['TOF', 'MOF', 'BOF'];

const STAGE_LABEL: Record<ContentStudioStageId, string> = {
  TOF: 'Top of funnel',
  MOF: 'Middle of funnel',
  BOF: 'Bottom of funnel',
};

const STAGE_THEME: Record<
  ContentStudioStageId,
  { chip: string; chipText: string; tint: string; border: string; iconColor: string; icon: React.ReactNode }
> = {
  TOF: {
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
      {isLong ? 'Long-form' : 'Short-form'}
    </span>
  );
}

export type IdeasTabProps = {
  contentBundle: ContentStudioBundle | null;
  batchId: string | null;
  completed: Set<string>;
  salesPlaybookSource: 'fathom' | 'default';
  reanalyzeBusy: boolean;
  conceptRegenPending: boolean;
  reanalyzeMessage: string | null;
  loading: boolean;
  onReanalyze: () => void;
  onToggleCompleted: (id: string) => void;
};

export default function IdeasTab({
  contentBundle,
  batchId,
  completed,
  salesPlaybookSource,
  reanalyzeBusy,
  conceptRegenPending,
  reanalyzeMessage,
  loading,
  onReanalyze,
  onToggleCompleted,
}: IdeasTabProps) {
  const stagesOrdered: ContentStudioStage[] = STAGES.map((sid) => {
    const found = contentBundle?.stages?.find((s) => s.id === sid);
    return found;
  }).filter(Boolean) as ContentStudioStage[];

  const bundleLoading = loading && !contentBundle;
  const bundleStale = Boolean(contentBundle && contentBundle.version < 4);

  return (
    <div className="space-y-6">
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
            onClick={onReanalyze}
            disabled={reanalyzeBusy || loading || conceptRegenPending}
            aria-busy={reanalyzeBusy || conceptRegenPending}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg glass-button-secondary hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
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
            Finishing concept drafts in the background — this page keeps polling automatically.
          </p>
        ) : null}
        {salesPlaybookSource === 'default' && (
          <p className="text-xs text-amber-700/90 dark:text-amber-300/90 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
            Connect Fathom and sync calls so TOF/MOF/BOF concepts mirror real conversations.{' '}
            <Link href="/?tab=integrations" className="underline">
              Integrations
            </Link>
          </p>
        )}
        {bundleStale ? (
          <p className="text-xs text-amber-700/90 dark:text-amber-300/90 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
            Upgrading ideas with Instagram performance grounding — fresh concepts are drafting in the background.
          </p>
        ) : null}
        {batchId ? (
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Bundle batch: {batchId.slice(0, 8)}…
          </p>
        ) : null}
      </section>

      {bundleLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
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
                              onChange={() => onToggleCompleted(concept.id)}
                              className="mt-1 rounded border-gray-400"
                              aria-label="Mark concept produced"
                            />
                            <div className="min-w-0 flex-1 space-y-2">
                              <FormatBadge format={concept.format} />
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
    </div>
  );
}
