'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  apiClient,
  ContentStudioBootstrap,
  ContentStudioBundle,
} from '@/lib/api';
import { DateRangeProvider } from '@/contexts/DateRangeContext';
import { useLoading } from '@/contexts/LoadingContext';
import { formatApiError } from '@/lib/apiError';
import AdsTab from '@/components/marketing/AdsTab';
import ContentEngineTab from '@/components/marketing/ContentEngineTab';
import PerformanceTab from '@/components/marketing/PerformanceTab';

type SubTab = 'organic' | 'ads' | 'content_engine';

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'organic', label: 'Organic' },
  { id: 'ads', label: 'Ads' },
  { id: 'content_engine', label: 'Content Engine' },
];

function parseSub(raw: string | string[] | undefined): SubTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === 'ads') return 'ads';
  if (value === 'content_engine') return 'content_engine';
  return 'organic';
}

export default function ContentStudioPanel() {
  const router = useRouter();
  const sub = parseSub(router.query.sub);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { setLoading: setGlobalLoading } = useLoading();

  const [salesPlaybookSource, setSalesPlaybookSource] = useState<'fathom' | 'default'>('default');
  const [contentBundle, setContentBundle] = useState<ContentStudioBundle | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [reanalyzeBusy, setReanalyzeBusy] = useState(false);
  const [conceptRegenPending, setConceptRegenPending] = useState(false);
  const [reanalyzeMessage, setReanalyzeMessage] = useState<string | null>(null);
  const bundlePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadBootstrap = useCallback(async () => {
    setError(null);
    try {
      const data: ContentStudioBootstrap = await apiClient.getContentStudioBootstrap();
      setSalesPlaybookSource(data.sales_playbook?.source === 'fathom' ? 'fathom' : 'default');
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
          ? 'Regenerating TOF/MOF/BOF concepts from call evidence and Instagram top posts.'
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

  const setSub = (next: SubTab) => {
    void router.replace(
      { pathname: router.pathname, query: { ...router.query, tab: 'content_studio', sub: next } },
      undefined,
      { shallow: true }
    );
  };

  const headerBlurb = useMemo(() => {
    if (sub === 'ads') {
      return 'Fatigue, messaging ceiling, and scale signals from synced Meta Ads. Alerts recommend. Pause is the only write.';
    }
    if (sub === 'content_engine') {
      return (
        <>
          Your top-converting content, every post-sale onboarding survey response, and video concepts grounded in
          that performance and your{' '}
          <Link href="/?tab=intelligence" className="text-violet-600 dark:text-violet-400 underline">
            Intelligence
          </Link>{' '}
          ICP — nothing here is sent automatically.
        </>
      );
    }
    return 'Instagram period metrics, top posts, and underperformers.';
  }, [sub]);

  return (
    <div className="max-w-6xl mx-auto w-full px-1 pb-12 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Marketing Intel</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{headerBlurb}</p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl bg-gray-100/80 dark:bg-gray-800/60 w-fit">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSub(tab.id)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
              sub === tab.id
                ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {sub === 'ads' ? (
        <DateRangeProvider storageKey="marketing-intel-ads" defaultPreset="last_28" defaultCompare="previous_period">
          <AdsTab />
        </DateRangeProvider>
      ) : sub === 'content_engine' ? (
        <ContentEngineTab
          ideasError={error}
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
      ) : (
        <PerformanceTab />
      )}
    </div>
  );
}
