'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Client } from '@/types/client';
import type { ClientCallInsightsResponse, CallInsightsRollup } from '@/types/callInsights';
import { apiClient } from '@/lib/api';
import {
  buildClipQueueView,
  clipStableKey,
  INTELLIGENCE_MAX_POOL,
  INTELLIGENCE_VISIBLE_CLIPS,
  mergeMetaWithDismissedClip,
  readDismissedClipIds,
} from '@/lib/intelligenceQueue';
import AIRecommendationsSection from './aiRecommendations/AIRecommendationsSection';

const TAG_STYLES: Record<string, string> = {
  upsell: 'bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-500/30',
  testimonial: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30',
  referral: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/30',
  conversion: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30',
  win_back: 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/30',
};

function tagClass(tag: string): string {
  return TAG_STYLES[tag] || 'bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30';
}

function callInsightFailureHint(reason: string | null | undefined): string {
  switch (reason) {
    case 'thin_transcript':
      return 'Not enough transcript text yet. Run Fathom sync in the Integrations tab.';
    case 'no_health':
      return 'Health snapshot was not ready. Open the health tab once to seed it.';
    case 'org_throttle':
      return 'Hourly AI limit reached — will retry automatically on the next cycle.';
    case 'llm_unavailable_or_failed':
      return 'AI failed — check LLM keys and budget (Integrations / environment).';
    default:
      return reason
        ? `Last run: ${reason.replace(/_/g, ' ')}.`
        : 'Run Fathom sync (Integrations tab) to seed call data.';
  }
}

interface IntelligenceSectionProps {
  client: Client | null;
  refreshToken?: number;
  /** After persisting clip dismissals (meta patch), refetch client in parent. */
  onClientUpdated?: () => void;
  onOpenEmailComposerWithDraft?: (draft: { subject: string; bodyHtml: string; bodyText: string }) => void;
}

function emptyRollup(): CallInsightsRollup {
  return {
    client_state_synthesis: '',
    accumulated_priorities: [],
    accumulated_call_suggestions: [],
    accumulated_clips: [],
    accumulated_wins: [],
    accumulated_testimonial_stories: [],
    prospect_voice_profile: {},
    org_validated_theme_keys: [],
  };
}

export default function IntelligenceSection({
  client,
  refreshToken = 0,
  onClientUpdated,
  onOpenEmailComposerWithDraft,
}: IntelligenceSectionProps) {
  const [insightData, setInsightData] = useState<ClientCallInsightsResponse | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [recRefresh, setRecRefresh] = useState(0);
  const [synthesisExpanded, setSynthesisExpanded] = useState(false);
  const [clipDismissing, setClipDismissing] = useState<Set<string>>(() => new Set());

  const loadInsights = useCallback(() => {
    if (!client?.id) return;
    setInsightError(null);
    setInsightLoading(true);
    apiClient
      .getClientCallInsights(client.id)
      .then(setInsightData)
      .catch((err) => {
        setInsightError(err?.response?.data?.detail || err?.message || 'Failed to load call context');
      })
      .finally(() => setInsightLoading(false));
  }, [client?.id]);

  useEffect(() => {
    setInsightData(null);
    setSynthesisExpanded(false);
    loadInsights();
  }, [client?.id, client?.updated_at, refreshToken, loadInsights]);

  const bumpRecommendations = () => setRecRefresh((n) => n + 1);

  const copyText = (label: string, text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  const dismissedClipIds = useMemo(
    () => readDismissedClipIds(client?.meta as Record<string, unknown> | null | undefined),
    [client?.meta, client?.updated_at]
  );

  const rollup: CallInsightsRollup = useMemo(() => {
    return insightData?.rollup ? { ...emptyRollup(), ...insightData.rollup } : emptyRollup();
  }, [insightData?.rollup]);

  const { clipsForQueue, hadHiddenObjections } = useMemo(() => {
    const raw = (rollup.accumulated_clips || []).map((c) => c as Record<string, unknown>);
    const filtered = raw.filter((c) => {
      const kind = String(c.kind || 'other').toLowerCase();
      if (kind !== 'objection') return true;
      return c.org_validated_pattern === true;
    });
    const hadHidden = raw.some(
      (c) => String(c.kind || '').toLowerCase() === 'objection' && c.org_validated_pattern !== true
    );
    return { clipsForQueue: filtered, hadHiddenObjections: hadHidden };
  }, [rollup.accumulated_clips]);

  const clipQueue = useMemo(() => {
    return buildClipQueueView(clipsForQueue, dismissedClipIds, INTELLIGENCE_MAX_POOL, INTELLIGENCE_VISIBLE_CLIPS);
  }, [clipsForQueue, dismissedClipIds]);

  if (!client) return null;

  const latestNonComplete = (insightData?.insights || []).find((i) => i.status !== 'complete' || !i.insight);
  const anyCompleteInsight = (insightData?.insights || []).some((i) => i.status === 'complete' && i.insight);

  const pv = rollup.prospect_voice_profile || {};
  const phrases = Array.isArray(pv.phrases_that_resonated) ? (pv.phrases_that_resonated as string[]) : [];
  const toneNotes = Array.isArray(pv.tone_notes) ? (pv.tone_notes as string[]) : [];
  const avoid = Array.isArray(pv.avoid_phrasing) ? (pv.avoid_phrasing as string[]) : [];
  const pvSummary = typeof pv.summary_one_liner === 'string' ? pv.summary_one_liner : '';

  const synthesis = (rollup.client_state_synthesis || '').trim();

  const handleClipDismissed = async (clip: Record<string, unknown>) => {
    const key = clipStableKey(clip);
    if (clipDismissing.has(key)) return;
    setClipDismissing((s) => new Set(s).add(key));
    try {
      const nextMeta = mergeMetaWithDismissedClip(client.meta as Record<string, unknown> | undefined, key);
      await apiClient.updateClient(client.id, { meta: nextMeta });
      onClientUpdated?.();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Could not save';
      setInsightError(msg);
    } finally {
      setClipDismissing((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  };

  const hasRollupContent =
    synthesis.length > 0 ||
    rollup.accumulated_priorities.length > 0 ||
    rollup.accumulated_clips.length > 0 ||
    rollup.accumulated_wins.length > 0 ||
    rollup.accumulated_testimonial_stories.length > 0 ||
    phrases.length > 0 ||
    toneNotes.length > 0 ||
    avoid.length > 0 ||
    pvSummary;

  return (
    <div className="border-t border-gray-200 dark:border-white/10 pt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">AI intelligence</h3>
      </div>

      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
        Fathom → tags, coaching summary, top transcript clips, tone hints. Checklist below includes call follow-ups +{' '}
        <span className="font-medium text-gray-600 dark:text-gray-300">View draft</span>.
      </p>

      {insightLoading && !insightData && (
        <div className="flex justify-center py-3">
          <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-violet-500 rounded-full animate-spin" />
        </div>
      )}

      {insightError && (
        <div className="py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
          {insightError}
        </div>
      )}

      {insightData?.summary?.tags && insightData.summary.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {insightData.summary.tags.map((t) => (
            <span
              key={t}
              className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${tagClass(t)}`}
            >
              {t.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {insightData?.summary?.headline && (
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{insightData.summary.headline}</p>
      )}

      {!insightLoading && insightData && !anyCompleteInsight && !latestNonComplete && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No Fathom call context yet. Match invitee email to this client and run Fathom sync (Integrations tab) — AI
          analysis runs automatically.
        </p>
      )}

      {insightData && !anyCompleteInsight && latestNonComplete && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">
            Latest call AI {latestNonComplete.status === 'failed' ? 'failed' : 'pending'}
            {latestNonComplete.meeting_at ? ` · ${new Date(latestNonComplete.meeting_at).toLocaleString()}` : ''}
          </p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-0.5">
            {callInsightFailureHint(latestNonComplete.failure_reason)}
          </p>
        </div>
      )}

      {hasRollupContent && (
        <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 p-3 space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Call context
          </h4>

          {(phrases.length > 0 || toneNotes.length > 0 || avoid.length > 0 || pvSummary) && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Tone</p>
              {pvSummary ? <p className="text-[11px] text-gray-600 dark:text-gray-400 italic">{pvSummary}</p> : null}
              {phrases.length > 0 && (
                <ul className="text-[11px] text-gray-700 dark:text-gray-300 list-disc list-inside space-y-0.5">
                  {phrases.slice(0, 3).map((p, i) => (
                    <li key={i}>&ldquo;{p}&rdquo;</li>
                  ))}
                </ul>
              )}
              {toneNotes.length > 0 && (
                <p className="text-[10px] text-gray-600 dark:text-gray-400 line-clamp-2">
                  <span className="font-medium">Style: </span>
                  {toneNotes.slice(0, 3).join(' · ')}
                </p>
              )}
              {avoid.length > 0 && (
                <p className="text-[10px] text-amber-800 dark:text-amber-200 line-clamp-2">
                  <span className="font-medium">Avoid: </span>
                  {avoid.slice(0, 3).join(' · ')}
                </p>
              )}
            </div>
          )}

          {synthesis.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1">Coaching focus</p>
              <p
                className={`text-sm text-gray-800 dark:text-gray-200 leading-snug whitespace-pre-wrap ${
                  synthesisExpanded ? '' : 'line-clamp-4'
                }`}
              >
                {synthesis}
              </p>
              {synthesis.length > 220 ? (
                <button
                  type="button"
                  onClick={() => setSynthesisExpanded((e) => !e)}
                  className="text-[10px] text-violet-600 dark:text-violet-400 hover:underline mt-1"
                >
                  {synthesisExpanded ? 'Show less' : 'Show more'}
                </button>
              ) : null}
            </div>
          )}

          {!synthesis && rollup.accumulated_priorities.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Themes & priorities (legacy)</p>
              <ul className="list-disc list-inside text-sm text-gray-800 dark:text-gray-200 space-y-1">
                {rollup.accumulated_priorities.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                Re-analyze the latest call to generate the full state paragraph.
              </p>
            </div>
          )}

          {rollup.accumulated_clips.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 mb-1">
                Transcript clips (top {INTELLIGENCE_VISIBLE_CLIPS} of {INTELLIGENCE_MAX_POOL} prioritized)
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-1.5 leading-snug">
                Objection clips only appear when they match a recurring theme across multiple clients in your org (for
                content angles). Other clip kinds stay per-call.
              </p>
              {hadHiddenObjections ? (
                <p className="text-[10px] text-amber-800/90 dark:text-amber-200/80 mb-1.5">
                  Some objections from calls are hidden until they match an org-wide pattern. See Intelligence → Sales for
                  validated themes.
                </p>
              ) : null}
              {clipsForQueue.length === 0 && hadHiddenObjections ? (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  No org-validated objection clips for this client yet.
                </p>
              ) : clipQueue.visible.length === 0 ? (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  All prioritized clips cleared — new analyses add more.
                </p>
              ) : (
                <>
                  {clipQueue.queuedCount > 0 ? (
                    <p className="text-[10px] text-violet-700/90 dark:text-violet-300/90 mb-1.5">
                      {clipQueue.queuedCount} more queued — check &quot;Done&quot; to show the next.
                    </p>
                  ) : null}
                  <ul className="space-y-1.5">
                    {clipQueue.visible.map((clip) => {
                      const quote = String(clip.quote || '');
                      const label = String(clip.label || 'Clip');
                      const ts = String(clip.start_timestamp || '');
                      const kind = String(clip.kind || 'other');
                      const mat = String(clip.meeting_at || '');
                      const idKey = clipStableKey(clip);
                      const busy = clipDismissing.has(idKey);
                      const orgBadge = kind.toLowerCase() === 'objection' && clip.org_validated_pattern === true;
                      return (
                        <li
                          key={idKey}
                          className="text-[11px] border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white/50 dark:bg-gray-900/30"
                        >
                          <div className="flex justify-between gap-2">
                            <span className="font-medium text-gray-800 dark:text-gray-200">
                              {label}
                              {ts ? ` · ${ts}` : ''}{' '}
                              <span className="text-gray-500">({kind})</span>
                              {orgBadge ? (
                                <span className="ml-1 align-middle text-[9px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
                                  Org pattern
                                </span>
                              ) : null}
                              {mat ? <span className="text-gray-400 block text-[10px] mt-0.5">{mat}</span> : null}
                            </span>
                            {quote ? (
                              <button
                                type="button"
                                className="shrink-0 text-violet-600 dark:text-violet-400 hover:underline text-[10px]"
                                onClick={() => copyText('clip', quote)}
                              >
                                Copy
                              </button>
                            ) : null}
                          </div>
                          {quote ? (
                            <p className="mt-0.5 text-gray-600 dark:text-gray-400 italic line-clamp-3">{quote}</p>
                          ) : null}
                          <label className="flex items-center gap-2 mt-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={false}
                              disabled={busy}
                              onChange={() => handleClipDismissed(clip)}
                              className="h-3.5 w-3.5 rounded border-gray-300 text-violet-600"
                            />
                            <span className="text-[10px] text-gray-500">{busy ? 'Saving…' : 'Done — hide & show next'}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          )}

          {(rollup.accumulated_wins.length > 0 || rollup.accumulated_testimonial_stories.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
              {rollup.accumulated_wins.length > 0 && (
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">Wins</p>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-0.5">
                    {rollup.accumulated_wins.slice(0, 3).map((w, i) => (
                      <li key={i} className="line-clamp-2">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rollup.accumulated_testimonial_stories.length > 0 && (
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-300 mb-0.5">Stories</p>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-0.5">
                    {rollup.accumulated_testimonial_stories.slice(0, 3).map((w, i) => (
                      <li key={i} className="line-clamp-2">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <AIRecommendationsSection
        client={client}
        refreshToken={recRefresh + refreshToken}
        embedded
        onOpenEmailComposerWithDraft={onOpenEmailComposerWithDraft}
      />
    </div>
  );
}
