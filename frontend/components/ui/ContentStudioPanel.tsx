'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  apiClient,
  ContentStudioBootstrap,
  ContentStudioBundle,
  ContentStudioSectionIdea,
} from '@/lib/api';

const STAGES: ('TOF' | 'MOF' | 'BOF')[] = ['TOF', 'MOF', 'BOF'];
const STAGE_LABEL: Record<string, string> = {
  TOF: 'Top of funnel',
  MOF: 'Middle of funnel',
  BOF: 'Bottom of funnel',
};

function formatFormatLabel(fmt: string): string {
  return (fmt || 'reel').replace(/_/g, ' ');
}

const SECTION_THEME: Record<
  string,
  { bg: string; border: string; iconColor: string; icon: React.ReactNode }
> = {
  common_objections: {
    bg: 'bg-rose-500/[0.06] dark:bg-rose-500/[0.08]',
    border: 'border-rose-400/30 dark:border-rose-500/20',
    iconColor: 'text-rose-500 dark:text-rose-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clipRule="evenodd" />
      </svg>
    ),
  },
  active_client_issues: {
    bg: 'bg-amber-500/[0.06] dark:bg-amber-500/[0.08]',
    border: 'border-amber-400/30 dark:border-amber-500/20',
    iconColor: 'text-amber-500 dark:text-amber-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M10 1a6 6 0 0 0-3.815 10.631C7.237 12.5 8 13.443 8 14.456v.644a.75.75 0 0 0 .75.75h2.5a.75.75 0 0 0 .75-.75v-.644c0-1.013.762-1.957 1.815-2.825A6 6 0 0 0 10 1ZM8.863 17.414a.75.75 0 0 0-.226 1.483 9.066 9.066 0 0 0 2.726 0 .75.75 0 0 0-.226-1.483 7.563 7.563 0 0 1-2.274 0Z" />
      </svg>
    ),
  },
  testimonials_wins: {
    bg: 'bg-emerald-500/[0.06] dark:bg-emerald-500/[0.08]',
    border: 'border-emerald-400/30 dark:border-emerald-500/20',
    iconColor: 'text-emerald-500 dark:text-emerald-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
      </svg>
    ),
  },
  pain_points_and_dream_outcomes: {
    bg: 'bg-violet-500/[0.06] dark:bg-violet-500/[0.08]',
    border: 'border-violet-400/30 dark:border-violet-500/20',
    iconColor: 'text-violet-500 dark:text-violet-400',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
        <path d="M15.98 1.804a1 1 0 0 0-1.96 0l-.24 1.192a1 1 0 0 1-.784.785l-1.192.238a1 1 0 0 0 0 1.962l1.192.238a1 1 0 0 1 .785.785l.238 1.192a1 1 0 0 0 1.962 0l.238-1.192a1 1 0 0 1 .785-.785l1.192-.238a1 1 0 0 0 0-1.962l-1.192-.238a1 1 0 0 1-.785-.785l-.238-1.192ZM6.949 5.684a1 1 0 0 0-1.898 0l-.683 2.051a1 1 0 0 1-.633.633l-2.051.683a1 1 0 0 0 0 1.898l2.051.684a1 1 0 0 1 .633.632l.683 2.051a1 1 0 0 0 1.898 0l.683-2.051a1 1 0 0 1 .633-.633l2.051-.683a1 1 0 0 0 0-1.898l-2.051-.683a1 1 0 0 1-.633-.633L6.95 5.684ZM13.949 13.684a1 1 0 0 0-1.898 0l-.184.551a1 1 0 0 1-.632.633l-.551.183a1 1 0 0 0 0 1.898l.551.183a1 1 0 0 1 .633.633l.183.551a1 1 0 0 0 1.898 0l.184-.551a1 1 0 0 1 .632-.633l.551-.183a1 1 0 0 0 0-1.898l-.551-.184a1 1 0 0 1-.633-.632l-.183-.551Z" />
      </svg>
    ),
  },
};

const DEFAULT_SECTION_THEME = {
  bg: 'bg-gray-500/[0.04] dark:bg-gray-500/[0.06]',
  border: 'border-gray-300/40 dark:border-gray-600/30',
  iconColor: 'text-gray-500 dark:text-gray-400',
  icon: (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z" clipRule="evenodd" />
    </svg>
  ),
};

export default function ContentStudioPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  const [salesPlaybookSource, setSalesPlaybookSource] = useState<'fathom' | 'default'>('default');
  const [contentBundle, setContentBundle] = useState<ContentStudioBundle | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = useState<Set<string>>(() => new Set());

  const [transcript, setTranscript] = useState('');
  const [purpose, setPurpose] = useState<'TOF' | 'MOF' | 'BOF' | 'mixed'>('MOF');
  const [mixedNote, setMixedNote] = useState('');
  const [analysisResult, setAnalysisResult] = useState<Record<string, unknown> | null>(null);
  const [history, setHistory] = useState<
    { id: string; purpose: string; summary?: string; created_at?: string }[]
  >([]);

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
    }
  }, []);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  const loadHistory = useCallback(async () => {
    try {
      const { items } = await apiClient.getContentStudioTranscripts(15);
      setHistory(items || []);
    } catch {
      /* optional */
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

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

  const runAnalyze = async () => {
    setAnalyzing(true);
    setError(null);
    setAnalysisResult(null);
    try {
      const res = await apiClient.postContentStudioTranscriptAnalyze({
        transcript: transcript.trim(),
        purpose,
        mixed_note: purpose === 'mixed' ? mixedNote.trim() || undefined : undefined,
      });
      setAnalysisResult(res.analysis || {});
      void loadHistory();
      void loadBootstrap();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as Error)?.message ||
        'Analysis failed';
      setError(String(msg));
    } finally {
      setAnalyzing(false);
    }
  };

  const ideaByStage = (ideas: ContentStudioSectionIdea[], stage: 'TOF' | 'MOF' | 'BOF') =>
    ideas.find((i) => i.stage === stage);

  const bundleLoading = loading && !contentBundle;

  return (
    <div className="max-w-5xl mx-auto w-full px-1 pb-12 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Content Studio</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Reel hooks and concepts from your sales signals, aligned with your{' '}
          <Link href="/?tab=intelligence" className="text-violet-600 dark:text-violet-400 underline">
            Intelligence
          </Link>{' '}
          profile. Ideas refresh when call data meaningfully changes.
        </p>
      </div>

      {error && (
        <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      <section className="glass-card neon-glow rounded-xl p-4 sm:p-5 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
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
        {salesPlaybookSource === 'default' && (
          <p className="text-xs text-amber-700/90 dark:text-amber-300/90 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
            Connect Fathom and sync calls so objections, wins, and language mirror real conversations.
          </p>
        )}
        {batchId ? (
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Bundle batch: {batchId.slice(0, 8)}…
            {contentBundle?.source === 'default' ? (
              <span className="ml-2 text-amber-600 dark:text-amber-400">(placeholder — enable LLM for full draft)</span>
            ) : null}
          </p>
        ) : null}
      </section>

      {bundleLoading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      )}

      {contentBundle?.sections?.length ? (
        <div className="space-y-4">
          {contentBundle.sections.map((section) => {
            const theme = SECTION_THEME[section.id] ?? DEFAULT_SECTION_THEME;
            const isOpen = openSections.has(section.id);
            return (
              <section
                key={section.id}
                className={`glass-card rounded-xl border ${theme.bg} ${theme.border}`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenSections((prev) => {
                      const next = new Set(prev);
                      if (next.has(section.id)) next.delete(section.id);
                      else next.add(section.id);
                      return next;
                    })
                  }
                  className="w-full flex items-start gap-3 p-4 sm:p-5 text-left"
                >
                  <span className={`mt-0.5 shrink-0 ${theme.iconColor}`}>{theme.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          {section.title}
                        </h3>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
                          {section.body}
                        </p>
                      </div>
                      <span className="shrink-0 text-gray-400">
                        <svg
                          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M5 8L10 13L15 8"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 border-t border-gray-200/70 dark:border-gray-700/70">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
                      {STAGES.map((stage) => {
                        const idea = ideaByStage(section.ideas, stage);
                        if (!idea) return null;
                        return (
                          <div
                            key={`${section.id}-${stage}`}
                            className={`rounded-xl p-3 border bg-white/40 dark:bg-gray-900/40 space-y-2 ${theme.border}`}
                          >
                            <div className="flex items-start gap-2">
                              <input
                                type="checkbox"
                                checked={completed.has(idea.id)}
                                onChange={() => toggleCompleted(idea.id)}
                                className="mt-1 rounded border-gray-400"
                                aria-label="Mark idea done"
                              />
                              <div className="min-w-0 flex-1 space-y-2">
                                <p className={`text-[10px] font-semibold uppercase tracking-wide ${theme.iconColor}`}>
                                  {stage} — {STAGE_LABEL[stage]}
                                </p>
                                <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-gray-200/80 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                                  {formatFormatLabel(idea.format)}
                                </span>
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{idea.hook}</p>
                                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                  {idea.concept}
                                </p>
                                <div className="text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200/50 dark:border-gray-600/50 pt-2 leading-relaxed">
                                  <span className="font-medium text-gray-500 dark:text-gray-500">Why it works: </span>
                                  {idea.why_it_works}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : !bundleLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No content bundle loaded.</p>
      ) : null}

      {contentBundle?.voice_marketing ? (
        <section className="glass-card rounded-xl p-4 sm:p-5 border border-emerald-500/25 space-y-3 bg-emerald-500/5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {contentBundle.voice_marketing.title || 'Language, tonality & what is working on calls'}
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {contentBundle.voice_marketing.body}
          </p>
          {contentBundle.voice_marketing.bullets?.length ? (
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {contentBundle.voice_marketing.bullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="glass-card rounded-xl p-4 sm:p-5 space-y-4 border border-gray-200/60 dark:border-white/10">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Call / transcript review</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Paste a transcript. Say which funnel stage it was meant for—we analyze conversion strengths and gaps.
        </p>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Transcript purpose</span>
          <select
            className="w-full max-w-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-900/60 px-3 py-2 text-sm"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as typeof purpose)}
          >
            <option value="TOF">TOF — awareness / cold</option>
            <option value="MOF">MOF — nurture / consideration</option>
            <option value="BOF">BOF — decision / close</option>
            <option value="mixed">Mixed — explain below</option>
          </select>
        </label>
        {purpose === 'mixed' && (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Mixed context</span>
            <input
              className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-900/60 px-3 py-2 text-sm"
              value={mixedNote}
              onChange={(e) => setMixedNote(e.target.value)}
              placeholder="e.g. discovery that turned into a soft close"
            />
          </label>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Transcript</span>
          <textarea
            className="w-full min-h-[180px] rounded-lg border border-gray-200 dark:border-gray-600 bg-white/80 dark:bg-gray-900/60 px-3 py-2 text-sm font-mono"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste call notes or transcript (min ~40 characters)…"
          />
        </label>
        <button
          type="button"
          onClick={() => void runAnalyze()}
          disabled={analyzing || transcript.trim().length < 40}
          className="glass-button px-4 py-2 rounded-lg text-sm disabled:opacity-50"
        >
          {analyzing ? 'Analyzing…' : 'Analyze transcript'}
        </button>

        {analysisResult && (
          <div className="mt-4 space-y-3 text-sm border-t border-gray-200/50 dark:border-gray-600/50 pt-4">
            {typeof analysisResult.summary === 'string' && (
              <p className="text-gray-800 dark:text-gray-200">{analysisResult.summary}</p>
            )}
            {typeof analysisResult.purpose_alignment === 'string' && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase">Purpose alignment</p>
                <p className="text-gray-700 dark:text-gray-300">{analysisResult.purpose_alignment}</p>
              </div>
            )}
            <AnalysisList title="Strengths" items={analysisResult.strengths_for_conversion} />
            <AnalysisList title="Weaknesses" items={analysisResult.weaknesses_for_conversion} />
            <ComponentsList items={analysisResult.components} />
          </div>
        )}
      </section>

      {history.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Recent analyses</h3>
          <ul className="space-y-2 text-xs text-gray-600 dark:text-gray-400">
            {history.map((h) => (
              <li key={h.id} className="glass-card rounded-lg px-3 py-2">
                <span className="font-medium text-gray-800 dark:text-gray-200">{h.purpose}</span>
                {h.created_at ? <span className="ml-2 opacity-70">{new Date(h.created_at).toLocaleString()}</span> : null}
                {h.summary ? <p className="mt-1">{h.summary}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="glass-card rounded-xl p-4 text-center text-xs text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600">
        Instagram publishing — coming soon.
      </section>
    </div>
  );
}

function AnalysisList({
  title,
  items,
}: {
  title: string;
  items: unknown;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{title}</p>
      <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
        {items.map((row, i) => {
          if (row && typeof row === 'object' && 'point' in row) {
            const r = row as { point?: string; evidence?: string };
            return (
              <li key={i}>
                <span className="font-medium">{r.point}</span>
                {r.evidence ? (
                  <span className="block text-xs opacity-80 mt-0.5 pl-4">{`"${r.evidence}"`}</span>
                ) : null}
              </li>
            );
          }
          return (
            <li key={i}>
              <span>{String(row)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ComponentsList({ items }: { items: unknown }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Components</p>
      <ul className="space-y-2">
        {items.map((c, i) => {
          if (c && typeof c === 'object' && ('label' in c || 'summary' in c)) {
            const x = c as { label?: string; summary?: string };
            return (
              <li key={i} className="text-gray-700 dark:text-gray-300">
                <span className="font-medium">{x.label}</span>
                {x.summary ? <span className="block text-xs mt-0.5">{x.summary}</span> : null}
              </li>
            );
          }
          return null;
        })}
      </ul>
    </div>
  );
}
