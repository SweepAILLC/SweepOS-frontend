'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Client } from '@/types/client';
import { apiClient } from '@/lib/api';
import { INTELLIGENCE_MAX_POOL, INTELLIGENCE_VISIBLE_ACTIONS } from '@/lib/intelligenceQueue';
import type { AIRecommendationAction, ClientAIRecommendationsResponse } from './types';
import AIRecommendationActionList from './AIRecommendationActionList';

interface AIRecommendationsSectionProps {
  client: Client | null;
  /** Bump to refetch from server (e.g. after lifecycle change elsewhere). */
  refreshToken?: number;
  /** Nested under IntelligenceSection: no extra top border / smaller heading. */
  embedded?: boolean;
  /** After generating a draft, parent opens Brevo email composer with subject + body */
  onOpenEmailComposerWithDraft?: (draft: { subject: string; bodyHtml: string; bodyText: string }) => void;
}

export default function AIRecommendationsSection({
  client,
  refreshToken = 0,
  embedded = false,
  onOpenEmailComposerWithDraft,
}: AIRecommendationsSectionProps) {
  const [data, setData] = useState<ClientAIRecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [draftLoadingId, setDraftLoadingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!client?.id) return;
    setError(null);
    setLoading(true);
    apiClient
      .getClientAIRecommendations(client.id)
      .then(setData)
      .catch((err) => {
        setError(err?.response?.data?.detail || err?.message || 'Failed to load recommendations');
      })
      .finally(() => setLoading(false));
  }, [client?.id]);

  useEffect(() => {
    setData(null);
    load();
  }, [client?.id, client?.updated_at, refreshToken, load]);

  const handleToggle = async (actionId: string, completed: boolean) => {
    if (!client?.id) return;
    const prev = data;
    if (!prev) return;

    // Optimistic UI
    setData({
      ...prev,
      actions: prev.actions.map((a) =>
        a.id === actionId
          ? {
              ...a,
              completed,
              completed_at: completed ? new Date().toISOString() : null,
            }
          : a
      ),
    });
    setPendingIds((s) => new Set(s).add(actionId));

    try {
      const next = await apiClient.patchClientAIRecommendationAction(client.id, actionId, completed);
      setData(next);
    } catch (err: unknown) {
      setData(prev);
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Could not update action';
      setError(msg);
    } finally {
      setPendingIds((s) => {
        const n = new Set(s);
        n.delete(actionId);
        return n;
      });
    }
  };

  const handleViewDraft = async (actionId: string) => {
    if (!client?.id || !onOpenEmailComposerWithDraft) return;
    setDraftLoadingId(actionId);
    setError(null);
    try {
      const d = await apiClient.postAIRecommendationEmailDraft(client.id, actionId);
      onOpenEmailComposerWithDraft({
        subject: d.subject,
        bodyHtml: d.body_html ?? '',
        bodyText: d.body_plain ?? '',
      });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Could not generate email draft';
      setError(msg);
    } finally {
      setDraftLoadingId(null);
    }
  };

  const { visibleActions, queuedBehindHint, allIncomplete, totalActions } = useMemo(() => {
    const actions = (data?.actions as AIRecommendationAction[]) || [];
    if (!embedded) {
      return {
        visibleActions: actions,
        queuedBehindHint: null as string | null,
        allIncomplete: actions.filter((a) => !a.completed).length,
        totalActions: actions.length,
      };
    }
    const incomplete = actions
      .filter((a) => !a.completed)
      .sort((a, b) => {
        const pa = Number(a.priority) || 0;
        const pb = Number(b.priority) || 0;
        if (pa !== pb) return pa - pb;
        return String(a.title || '').localeCompare(String(b.title || ''));
      });
    const pool = incomplete.slice(0, INTELLIGENCE_MAX_POOL);
    const visible = pool.slice(0, INTELLIGENCE_VISIBLE_ACTIONS);
    const queued = Math.max(0, pool.length - visible.length);
    const hint =
      queued > 0
        ? `${queued} more queued — finish items above to pull in the next (max ${INTELLIGENCE_MAX_POOL} prioritized).`
        : null;
    return {
      visibleActions: visible,
      queuedBehindHint: hint,
      allIncomplete: incomplete.length,
      totalActions: actions.length,
    };
  }, [data, embedded]);

  if (!client) return null;

  const outer = embedded
    ? 'pt-4 mt-2 border-t border-gray-200 dark:border-white/10 space-y-3'
    : 'border-t border-gray-200 dark:border-white/10 pt-6 space-y-3';

  return (
    <div className={outer}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {embedded ? 'Next steps & checklist' : 'AI recommendations'}
        </h3>
      </div>
      <p className={`text-gray-500 dark:text-gray-400 ${embedded ? 'text-[11px] leading-snug' : 'text-xs'}`}>
        {embedded ? (
          <>
            Top {INTELLIGENCE_VISIBLE_ACTIONS} open items (of {INTELLIGENCE_MAX_POOL} max prioritized). Check off to
            surface the next. <span className="font-medium text-gray-600 dark:text-gray-300">View draft</span> → Brevo.
          </>
        ) : (
          <>
            Suggested next steps by lifecycle. Mark items done as you complete them (saved to your workspace).{' '}
            <span className="font-medium text-gray-600 dark:text-gray-300">View draft</span> is only shown when an email
            is appropriate: lead follow-ups and call reminders, onboarding nudges, active-client testimonial requests
            (e.g. video), or win-back / re-sign outreach for offboarding and dead clients. Drafts are written as complete,
            send-ready messages (subject + body + signature) using your org name and available context—opened in Brevo so
            you can send immediately or tweak if needed.
          </>
        )}
      </p>

      {loading && !data && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-violet-500 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
          {error}
        </div>
      )}

      {data && (
        <>
          {data.headline && !embedded ? (
            <p className="text-sm text-gray-700 dark:text-gray-300 font-medium">{data.headline}</p>
          ) : null}
          {embedded && allIncomplete === 0 && totalActions > 0 ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">All open items done — nice work.</p>
          ) : null}
          {embedded && queuedBehindHint ? (
            <p className="text-[10px] text-violet-700/90 dark:text-violet-300/90">{queuedBehindHint}</p>
          ) : null}
          {!(embedded && allIncomplete === 0 && totalActions > 0) ? (
            <AIRecommendationActionList
              actions={visibleActions}
              pendingIds={pendingIds}
              onToggle={handleToggle}
              onViewDraft={onOpenEmailComposerWithDraft ? handleViewDraft : undefined}
              draftLoadingId={draftLoadingId}
              compact={embedded}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
