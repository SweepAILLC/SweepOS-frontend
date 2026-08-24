'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  apiClient,
  ContentStudioBootstrap,
  ContentStudioBundle,
} from '@/lib/api';
import { useLoading } from '@/contexts/LoadingContext';
import { formatApiError } from '@/lib/apiError';
import IdeasTab from '@/components/marketing/IdeasTab';
import SignalsTab from '@/components/marketing/SignalsTab';
import PerformanceTab from '@/components/marketing/PerformanceTab';

type SubTab = 'overview' | 'signals';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'signals', label: 'Signals' },
];

function parseSub(raw: string | string[] | undefined): SubTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  // Legacy deep-links from Performance / Ideas tabs collapse into Overview.
  if (v === 'signals') return 'signals';
  return 'overview';
}

export default function ContentStudioPanel() {
  const router = useRouter();
  const sub = parseSub(router.query.sub);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setLoading: setGlobalLoading } = useLoading();

  const [salesPlaybookSource, setSalesPlaybookSource] = useState<'fathom' | 'default'>('default');
  const [playbookParagraphs, setPlaybookParagraphs] = useState<string[]>([]);
  const [knowledge, setKnowledge] = useState<{
    objections: string[];
    closing: string[];
    reframes: string[];
  }>({ objections: [], closing: [], reframes: [] });
  const [contentBundle, setContentBundle] = useState<ContentStudioBundle | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [reanalyzeBusy, setReanalyzeBusy] = useState(false);
  const [conceptRegenPending, setConceptRegenPending] = useState(false);
  const [reanalyzeMessage, setReanalyzeMessage] = useState<string | null>(null);
  const bundlePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setSub = useCallback(
    (next: SubTab) => {
      void router.replace(
        { pathname: router.pathname, query: { ...router.query, tab: 'content_studio', sub: next } },
        undefined,
        { shallow: true }
      );
    },
    [router]
  );

  const loadBootstrap = useCallback(async () => {
    setError(null);
    try {
      const data: ContentStudioBootstrap = await apiClient.getContentStudioBootstrap();
      setSalesPlaybookSource(data.sales_playbook?.source === 'fathom' ? 'fathom' : 'default');
      setPlaybookParagraphs(data.sales_playbook?.paragraphs || []);
      setKnowledge(data.knowledge || { objections: [], closing: [], reframes: [] });
      setContentBundle(data.content_bundle);
      setBatchId(data.batch_id);
      setCompleted(new Set(data.completed_idea_ids || []));
      if (data.content_bundle && data.content_bundle.version >= 7) {
        setConceptRegenPending(false);
      }
      return data;
    } catch (e) {
      setError(formatApiError(e));
      return null;
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  }, [setGlobalLoading]);

  useEffect(() => {
    setGlobalLoading(true);
    void loadBootstrap();
  }, [loadBootstrap, setGlobalLoading]);

  // Poll while bundle regenerating or stale version
  useEffect(() => {
    const needsPoll =
      conceptRegenPending || (contentBundle != null && contentBundle.version < 7) || !contentBundle;
    if (!needsPoll) {
      if (bundlePollRef.current) {
        clearInterval(bundlePollRef.current);
        bundlePollRef.current = null;
      }
      return;
    }
    if (bundlePollRef.current) return;
    bundlePollRef.current = setInterval(() => {
      void loadBootstrap();
    }, conceptRegenPending ? 5000 : 6000);
    return () => {
      if (bundlePollRef.current) {
        clearInterval(bundlePollRef.current);
        bundlePollRef.current = null;
      }
    };
  }, [conceptRegenPending, contentBundle, loadBootstrap]);

  const handleReanalyze = useCallback(async () => {
    setReanalyzeBusy(true);
    setReanalyzeMessage(null);
    setError(null);
    try {
      const res = await apiClient.postContentStudioReanalyze();
      setConceptRegenPending(Boolean(res.bundle_regenerating));
      setReanalyzeMessage(
        res.bundle_regenerating
          ? 'Fathom synced — regenerating TOF/MOF/BOF concepts from call evidence and Instagram top posts.'
          : 'Re-analyze complete.'
      );
      await loadBootstrap();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setReanalyzeBusy(false);
    }
  }, [loadBootstrap]);

  const flushCompleted = useCallback(async (ids: string[]) => {
    try {
      await apiClient.patchContentStudioCompletions(ids);
    } catch {
      /* ignore autosave blips */
    }
  }, []);

  const toggleCompleted = (id: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      void flushCompleted(Array.from(next));
      return next;
    });
  };

  const headerBlurb = useMemo(() => {
    if (sub === 'signals') {
      return 'Sales playbook, objections, and reframes mined from calls — the raw signal behind your concepts.';
    }
    return (
      <>
        Instagram period metrics, top posts, and underperformers — then video concepts grounded in that performance
        and your{' '}
        <Link href="/?tab=intelligence" className="text-violet-600 dark:text-violet-400 underline">
          Intelligence
        </Link>{' '}
        ICP.
      </>
    );
  }, [sub]);

  return (
    <div className="max-w-6xl mx-auto w-full px-1 pb-12 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Marketing Intel</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{headerBlurb}</p>
      </div>

      <div className="inline-flex flex-wrap gap-1 p-1 rounded-lg bg-gray-500/10 dark:bg-gray-800/60 border border-gray-200/40 dark:border-gray-700/40">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            className={`px-3.5 py-2 text-sm font-semibold rounded-lg transition ${
              sub === t.id
                ? 'bg-white dark:bg-gray-900 text-violet-700 dark:text-violet-300 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && sub === 'signals' && (
        <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {sub === 'overview' && (
        <div className="space-y-10">
          <PerformanceTab />
          <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-8 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ideas</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                TOF / MOF / BOF concepts mined from calls and grounded in your top Instagram posts — not advice
                labels.
              </p>
            </div>
            {error ? (
              <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            ) : null}
            <IdeasTab
              contentBundle={contentBundle}
              batchId={batchId}
              completed={completed}
              salesPlaybookSource={salesPlaybookSource}
              reanalyzeBusy={reanalyzeBusy}
              conceptRegenPending={conceptRegenPending}
              reanalyzeMessage={reanalyzeMessage}
              loading={loading}
              onReanalyze={() => void handleReanalyze()}
              onToggleCompleted={toggleCompleted}
            />
          </div>
        </div>
      )}

      {sub === 'signals' && (
        <SignalsTab
          salesPlaybookSource={salesPlaybookSource}
          paragraphs={playbookParagraphs}
          knowledge={knowledge}
          loading={loading}
        />
      )}
    </div>
  );
}
