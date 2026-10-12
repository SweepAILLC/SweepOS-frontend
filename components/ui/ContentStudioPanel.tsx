'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  apiClient,
  ContentStudioBootstrap,
  ContentStudioBundle,
} from '@/lib/api';
import { useLoading } from '@/contexts/LoadingContext';
import { formatApiError } from '@/lib/apiError';
import IdeasTab from '@/components/marketing/IdeasTab';
import PerformanceTab from '@/components/marketing/PerformanceTab';

export default function ContentStudioPanel() {
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

  const headerBlurb = useMemo(
    () => (
      <>
        Instagram period metrics, top posts, and underperformers — then video concepts grounded in that performance
        and your{' '}
        <Link href="/?tab=intelligence" className="text-violet-600 dark:text-violet-400 underline">
          Intelligence
        </Link>{' '}
        ICP.
      </>
    ),
    []
  );

  return (
    <div className="max-w-6xl mx-auto w-full px-1 pb-12 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Marketing Intel</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{headerBlurb}</p>
      </div>

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
    </div>
  );
}
