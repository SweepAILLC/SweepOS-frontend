'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { Client } from '@/types/client';
import type { ClientCallInsightsResponse, CallInsightsRollup, LeadPipelineSnapshot } from '@/types/callInsights';
import { apiClient } from '@/lib/api';
import { LEAD_PIPELINE_COLUMNS } from '@/lib/leadFollowUp';
import { formatApiError } from '@/lib/apiError';
import {
  buildClipQueueView,
  clipStableKey,
  INTELLIGENCE_MAX_POOL,
  INTELLIGENCE_VISIBLE_CLIPS,
  mergeMetaWithDismissedClip,
  readDismissedClipIds,
} from '@/lib/intelligenceQueue';
import { BALANCE_DUE_CHIP_CLASS, hasOutstandingOfferBalance } from '@/lib/clientOfferBalance';
import AIRecommendationsSection from './aiRecommendations/AIRecommendationsSection';
import ConfirmDialog from '../ui/ConfirmDialog';

const TAG_STYLES: Record<string, string> = {
  upsell: 'bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-500/30',
  testimonial: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30',
  referral: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/30',
  conversion: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30',
  win_back: 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/30',
  revive: 'bg-rose-600/15 text-rose-900 dark:text-rose-100 border-rose-600/35',
  deal_follow_up: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-200 border-indigo-500/30',
};

function tagClass(tag: string): string {
  return TAG_STYLES[tag] || 'bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30';
}

/** Dispatched after manual re-analyze so Kanban chips can refresh without waiting for the 15s poll. */
export const CALL_INSIGHTS_REANALYZED_EVENT = 'sweep:call-insights-reanalyzed';

/** Dispatched after Kanban merge so the drawer reloads combined call insights + checklist (no new LLM on server). */
export const CLIENT_MERGED_EVENT = 'sweep:client-merged';

function refreshCallInsightNoticePayload(
  status: string,
  detail: Record<string, unknown> | undefined | null
): { text: string; tone: 'ok' | 'warn' } {
  const text = refreshCallInsightNoticeText(status, detail);
  const tone = status === 'ok' ? 'ok' : 'warn';
  return { text, tone };
}

function refreshCallInsightNoticeText(status: string, detail: Record<string, unknown> | undefined | null): string {
  const reason = typeof detail?.reason === 'string' ? detail.reason : '';
  switch (status) {
    case 'ok':
      return 'Latest call re-analyzed. ROI signals and checklist updated.';
    case 'skipped':
      if (reason === 'no_fathom_recording') {
        return 'No Fathom recording for this client yet — match invitee email and sync under Integrations.';
      }
      if (reason === 'thin_transcript') return callInsightFailureHint('thin_transcript');
      if (reason === 'no_health') return callInsightFailureHint('no_health');
      if (reason === 'sentiment_not_complete') return 'Call sentiment not ready yet — try again shortly.';
      if (reason === 'same_hash') return 'No change in call inputs since last run — nothing to update.';
      return reason ? `Skipped: ${reason.replace(/_/g, ' ')}.` : 'Re-analyze skipped.';
    case 'failed':
      if (reason === 'llm') return callInsightFailureHint('llm_unavailable_or_failed');
      return reason ? `Analysis failed (${reason.replace(/_/g, ' ')}).` : 'Analysis failed.';
    default:
      return `Done (${status}).`;
  }
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
  /** When false, checklist is omitted (e.g. rendered below engagement in the drawer). Default true. */
  showChecklist?: boolean;
  /** Nested inside ClientStrategyPanel — hides outer section title and tightens copy. */
  variant?: 'default' | 'strategy';
  /** After persisting clip dismissals (meta patch), refetch client in parent. */
  onClientUpdated?: () => void;
  /** Prefer PATCH response merged into drawer/Kanban (instant persisted meta); optional. */
  onClientPatched?: (client: Client) => void;
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
    accumulated_roi_testimonials: [],
    latest_upsell_signal: null,
    latest_referral_signal: null,
    latest_revive_playbook: null,
    prospect_voice_profile: {},
    org_validated_theme_keys: [],
  };
}

export default function IntelligenceSection({
  client,
  refreshToken = 0,
  showChecklist = true,
  variant = 'default',
  onClientUpdated,
  onClientPatched,
  onOpenEmailComposerWithDraft,
}: IntelligenceSectionProps) {
  const embeddedInStrategy = variant === 'strategy';
  const [insightData, setInsightData] = useState<ClientCallInsightsResponse | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [reanalyzeBusy, setReanalyzeBusy] = useState(false);
  const [reanalyzeNotice, setReanalyzeNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [recRefresh, setRecRefresh] = useState(0);
  const [synthesisExpanded, setSynthesisExpanded] = useState(false);
  const [clipDismissing, setClipDismissing] = useState<Set<string>>(() => new Set());
  const [clipConfirmClip, setClipConfirmClip] = useState<Record<string, unknown> | null>(null);
  const [clipConfirmBusy, setClipConfirmBusy] = useState(false);

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
    setReanalyzeNotice(null);
    loadInsights();
  }, [client?.id, client?.updated_at, refreshToken, loadInsights]);

  useEffect(() => {
    if (!client?.id || typeof window === 'undefined') return;
    const onMerged = (e: Event) => {
      const kept = (e as CustomEvent<{ keptClientId?: string }>).detail?.keptClientId;
      if (kept && kept === client.id) {
        loadInsights();
        setRecRefresh((n) => n + 1);
      }
    };
    window.addEventListener(CLIENT_MERGED_EVENT, onMerged);
    return () => window.removeEventListener(CLIENT_MERGED_EVENT, onMerged);
  }, [client?.id, loadInsights]);

  const handleReanalyzeRoi = useCallback(async () => {
    if (!client?.id || reanalyzeBusy || insightLoading) return;
    setReanalyzeBusy(true);
    setReanalyzeNotice(null);
    setInsightError(null);
    try {
      const res = (await apiClient.postClientCallInsightsRefresh(client.id)) as {
        status?: string;
        detail?: Record<string, unknown> | null;
      };
      const st = String(res.status ?? '');
      setReanalyzeNotice(refreshCallInsightNoticePayload(st, res.detail ?? null));
      await loadInsights();
      setRecRefresh((n) => n + 1);
      onClientUpdated?.();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(CALL_INSIGHTS_REANALYZED_EVENT, { detail: { clientId: client.id } })
        );
      }
    } catch (err: unknown) {
      const httpStatus = (err as { response?: { status?: number } })?.response?.status;
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (httpStatus === 429) {
        setInsightError(
          typeof detail === 'string'
            ? detail
            : 'Too many re-analyze requests — try again in up to an hour.'
        );
      } else {
        setInsightError(formatApiError(err, 'Re-analyze failed. Try again in a moment.'));
      }
    } finally {
      setReanalyzeBusy(false);
    }
  }, [client?.id, reanalyzeBusy, insightLoading, loadInsights, onClientUpdated]);

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

  const handleClipDismissConfirmed = async () => {
    const clip = clipConfirmClip;
    if (!clip || !client?.id) return;
    const key = clipStableKey(clip);
    if (clipDismissing.has(key)) return;
    setClipConfirmBusy(true);
    setClipDismissing((s) => new Set(s).add(key));
    try {
      const nextMeta = mergeMetaWithDismissedClip(client.meta as Record<string, unknown> | undefined, key);
      const updated = await apiClient.updateClient(client.id, { meta: nextMeta });
      setClipConfirmClip(null);
      if (onClientPatched) {
        onClientPatched(updated);
      } else {
        onClientUpdated?.();
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Could not save';
      setInsightError(msg);
    } finally {
      setClipConfirmBusy(false);
      setClipDismissing((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  };

  const roiTestimonials = (rollup.accumulated_roi_testimonials || []) as Record<string, unknown>[];
  const latestUpsell = rollup.latest_upsell_signal as { rationale?: string; meeting_at?: string } | null | undefined;
  const latestReferral = rollup.latest_referral_signal as {
    rationale?: string;
    meeting_at?: string;
    variant?: string;
  } | null | undefined;
  const roiState = insightData?.roi_state;
  const pipeline = (insightData?.pipeline ?? null) as LeadPipelineSnapshot | null;
  const suggestedOffer = insightData?.offer_suggestion ?? null;
  const latestRevive = rollup.latest_revive_playbook;
  const frameworkReview = rollup.latest_framework_review || null;
  const lc = client.lifecycle_state;
  const isClientRoi = lc === 'active' || lc === 'offboarding';
  const isLead = (LEAD_PIPELINE_COLUMNS as readonly string[]).includes(lc);
  const isDead = lc === 'dead';
  const summaryTags = insightData?.summary?.tags || [];
  const offerBalanceDue = useMemo(
    () => hasOutstandingOfferBalance(client),
    [
      client.offer_enrollment?.slot,
      client.offer_enrollment?.total_cents,
      client.offer_enrollment?.paid_cents,
      client.lifetime_revenue_cents,
    ],
  );

  const showMaximizeRoiBox =
    isClientRoi &&
    (roiTestimonials.length > 0 ||
      Boolean(latestUpsell?.rationale) ||
      Boolean(latestReferral?.rationale) ||
      roiState);
  const showReviveBox = isDead && Boolean(latestRevive?.rationale);
  const showLeadPlaybook = isLead && Boolean(insightData);
  const leadPlaybookMode: 'conversion' | 'deal_follow' | null =
    !isLead || !insightData
      ? null
      : summaryTags.includes('deal_follow_up') ||
          (Boolean(pipeline?.has_past_sales_call) && Boolean(pipeline?.open_sales_deal))
        ? 'deal_follow'
        : summaryTags.includes('conversion') || pipeline == null || !pipeline.has_past_sales_call
          ? 'conversion'
          : null;

  const hasRollupContent =
    synthesis.length > 0 ||
    rollup.accumulated_priorities.length > 0 ||
    rollup.accumulated_clips.length > 0 ||
    rollup.accumulated_wins.length > 0 ||
    rollup.accumulated_testimonial_stories.length > 0 ||
    roiTestimonials.length > 0 ||
    Boolean(latestUpsell?.rationale) ||
    Boolean(latestReferral?.rationale) ||
    Boolean(latestRevive?.rationale) ||
    Boolean(frameworkReview?.summary) ||
    phrases.length > 0 ||
    toneNotes.length > 0 ||
    avoid.length > 0 ||
    pvSummary;

  return (
    <div
      className={`space-y-4 ${
        embeddedInStrategy
          ? 'pt-0'
          : showChecklist
            ? 'border-t border-gray-200 dark:border-white/10 pt-6'
            : 'pt-0'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {embeddedInStrategy ? (
          <p className="text-[11px] font-medium text-gray-600 dark:text-gray-400">Fathom call context & ROI signals</p>
        ) : (
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Client profile & opportunity</h3>
        )}
        <button
          type="button"
          onClick={() => void handleReanalyzeRoi()}
          disabled={reanalyzeBusy || insightLoading || !client?.id}
          aria-busy={reanalyzeBusy}
          title="Re-run AI on the latest Fathom call for this client (rate limited: 8 per hour per client)."
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border border-gray-200 dark:border-white/15 bg-white/70 dark:bg-white/5 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg
            className={`w-3.5 h-3.5 ${reanalyzeBusy ? 'animate-spin' : ''}`}
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
          {reanalyzeBusy ? 'Re-analyzing…' : 'Re-analyze'}
        </button>
      </div>

      {!embeddedInStrategy ? (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
          Fathom call context plus ROI signals (testimonials, upsell readiness, referrals)—your situation, momentum, and
          revenue opportunities in one place.
          {showChecklist
            ? ' Checklist below includes call follow-ups + '
            : ' Next steps & checklist live in the Strategy panel. '}
          <span className="font-medium text-gray-600 dark:text-gray-300">View draft</span>
          {showChecklist ? '.' : ' opens Brevo from Next steps.'}
        </p>
      ) : null}

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

      {reanalyzeNotice && !insightError && (
        <div
          className={`py-2 px-3 rounded-lg text-[11px] leading-snug ${
            reanalyzeNotice.tone === 'ok'
              ? 'bg-emerald-50/90 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100'
              : 'bg-amber-50/90 dark:bg-amber-950/35 text-amber-950 dark:text-amber-100'
          }`}
        >
          {reanalyzeNotice.text}
        </div>
      )}

      {(offerBalanceDue || (insightData?.summary?.tags && insightData.summary.tags.length > 0)) && (
        <div className="flex flex-wrap gap-1.5">
          {offerBalanceDue ? (
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${BALANCE_DUE_CHIP_CLASS}`}
              title="Recorded payments are below the full offer amount"
            >
              Balance due
            </span>
          ) : null}
          {insightData?.summary?.tags?.map((t) => (
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

      {showLeadPlaybook && leadPlaybookMode && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-600/50 bg-slate-50/80 dark:bg-slate-900/30 px-3 py-2.5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            Lead playbook
          </p>
          {leadPlaybookMode === 'conversion' ? (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200">Conversion &amp; nurture</p>
              <ul className="text-[10px] text-gray-600 dark:text-gray-400 list-disc list-inside space-y-0.5">
                <li>Short email sequence: problem → proof → single CTA to book a sales call.</li>
                <li>Share 1–2 nurture assets (PDF, Loom, case snippet) that pre-handle price and time objections.</li>
                <li>Content: one FAQ post or story that mirrors their stated hesitation from calls or forms.</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200">Open deal — follow up</p>
              {pipeline?.has_upcoming_check_in ? (
                <p className="text-[10px] text-gray-600 dark:text-gray-400">
                  Next meeting scheduled
                  {pipeline.next_start_time_iso
                    ? ` (${new Date(pipeline.next_start_time_iso).toLocaleString()}${pipeline.next_is_sales_call ? ', sales call' : ''})`
                    : ''}
                  . Keep momentum with a tight recap email and one question before you meet.
                </p>
              ) : (
                <ul className="text-[10px] text-gray-600 dark:text-gray-400 list-disc list-inside space-y-0.5">
                  <li>Book a follow-up call from Calendar (sync check-ins) or send three-touch email nurture.</li>
                  <li>Review the last call in Fathom; tighten one commitment for the next conversation.</li>
                </ul>
              )}
              <p className="text-[10px] pt-1">
                <Link
                  href="/?tab=call_library"
                  className="text-violet-600 dark:text-violet-400 font-medium hover:underline"
                >
                  Open Call Library
                </Link>{' '}
                for coaching patterns and close ideas from past calls.
              </p>
            </div>
          )}
        </div>
      )}

      {showReviveBox && latestRevive ? (
        <div className="rounded-lg border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/25 px-3 py-2.5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-900 dark:text-rose-100">Revive</p>
          <p className="text-[11px] text-gray-700 dark:text-gray-300">{latestRevive.rationale}</p>
          {(latestRevive.offer_angles?.length || 0) > 0 ? (
            <div>
              <p className="text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">Offer angles</p>
              <ul className="text-[10px] text-gray-600 dark:text-gray-400 list-disc list-inside space-y-0.5">
                {(latestRevive.offer_angles || []).slice(0, 6).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {(latestRevive.outreach_hooks?.length || 0) > 0 ? (
            <div>
              <p className="text-[10px] font-medium text-gray-700 dark:text-gray-300 mb-0.5">Outreach hooks</p>
              <ul className="text-[10px] text-gray-600 dark:text-gray-400 list-disc list-inside space-y-0.5">
                {(latestRevive.outreach_hooks || []).slice(0, 6).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {frameworkReview && frameworkReview.summary ? (
        <div className="rounded-lg border border-indigo-200/80 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-950/25 px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-800 dark:text-indigo-200">
              Framework critique
            </p>
            {frameworkReview.meeting_at ? (
              <span className="text-[10px] text-indigo-700/70 dark:text-indigo-300/70">
                {new Date(frameworkReview.meeting_at).toLocaleDateString()}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">{frameworkReview.summary}</p>
          <p className="text-[10px] text-indigo-700/80 dark:text-indigo-300/80">
            Lensed through your Sales framework &amp; tactics in Intelligence.
          </p>
        </div>
      ) : null}

      {suggestedOffer && suggestedOffer.name ? (
        <div className="rounded-lg border border-emerald-200/80 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2.5 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
            Suggested next offer · {suggestedOffer.kind_label}
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{suggestedOffer.name}</p>
          {suggestedOffer.promise ? (
            <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">{suggestedOffer.promise}</p>
          ) : null}
          {suggestedOffer.rationale ? (
            <p className="text-[11px] text-gray-600 dark:text-gray-400 italic">{suggestedOffer.rationale}</p>
          ) : null}
          {suggestedOffer.script_hint ? (
            <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">
              <span className="font-medium text-gray-800 dark:text-gray-200">Script hint: </span>
              {suggestedOffer.script_hint}
            </p>
          ) : null}
        </div>
      ) : null}

      {showMaximizeRoiBox && (
        <div className="rounded-lg border border-violet-200/80 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-950/25 px-3 py-2.5 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200">
            Maximize ROI
          </p>
          {roiState && typeof roiState.testimonial_trigger_at === 'string' ? (
            <p className="text-[10px] text-gray-600 dark:text-gray-400">
              Client has a validated win on record — prioritize testimonial capture and expansion asks when the
              conversation supports it.
            </p>
          ) : null}
          {roiTestimonials.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 mb-1">Testimonial-ready moments</p>
              <ul className="space-y-1.5">
                {roiTestimonials.slice(0, 4).map((m, i) => {
                  const quote = String(m.quote || '');
                  const ts = String(m.start_timestamp || '');
                  const mat = String(m.meeting_at || '');
                  return (
                    <li key={i} className="text-[11px] text-gray-700 dark:text-gray-300 border-l-2 border-emerald-500/50 pl-2">
                      {quote ? <span className="italic text-gray-600 dark:text-gray-400">&ldquo;{quote}&rdquo;</span> : null}
                      {(ts || mat) && (
                        <span className="block text-[10px] text-gray-500 mt-0.5">
                          {ts ? `${ts}` : ''}
                          {ts && mat ? ' · ' : ''}
                          {mat ? new Date(mat).toLocaleString() : ''}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {latestUpsell?.rationale ? (
            <div>
              <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 mb-0.5">Upsell signal</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400">{latestUpsell.rationale}</p>
              {latestUpsell.meeting_at ? (
                <p className="text-[10px] text-gray-500 mt-0.5">{new Date(latestUpsell.meeting_at).toLocaleString()}</p>
              ) : null}
            </div>
          ) : null}
          {latestReferral?.rationale ? (
            <div>
              <p className="text-[11px] font-medium text-gray-800 dark:text-gray-200 mb-0.5">
                Referral signal{latestReferral.variant ? ` (${String(latestReferral.variant).replace(/_/g, ' ')})` : ''}
              </p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400">{latestReferral.rationale}</p>
              {latestReferral.meeting_at ? (
                <p className="text-[10px] text-gray-500 mt-0.5">{new Date(latestReferral.meeting_at).toLocaleString()}</p>
              ) : null}
            </div>
          ) : null}
        </div>
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
                          <div className="mt-1.5 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={busy || clipConfirmBusy}
                              onClick={() => setClipConfirmClip(clip)}
                              className="inline-flex items-center gap-1.5 text-[10px] font-medium rounded-md px-2 py-1 border border-gray-200 dark:border-gray-600 bg-white/70 dark:bg-gray-900/40 text-gray-700 dark:text-gray-200 hover:bg-violet-500/10 hover:border-violet-400/40 dark:hover:border-violet-500/35 disabled:opacity-50 transition-colors"
                            >
                              <svg
                                className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              {busy ? 'Saving…' : 'Done — hide & show next'}
                            </button>
                          </div>
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

      <ConfirmDialog
        isOpen={clipConfirmClip !== null}
        onClose={() => {
          if (!clipConfirmBusy) setClipConfirmClip(null);
        }}
        title="Mark clip as done?"
        description={
          <>
            Remove this clip from your prioritized queue. The dismissal is saved on this client&apos;s profile so it
            stays cleared when you reopen the drawer; new call analyses can surface fresh clips later.
          </>
        }
        confirmLabel="Mark done"
        cancelLabel="Cancel"
        busy={clipConfirmBusy}
        onConfirm={handleClipDismissConfirmed}
      />

      {showChecklist ? (
        <AIRecommendationsSection
          client={client}
          refreshToken={recRefresh + refreshToken}
          embedded
          onOpenEmailComposerWithDraft={onOpenEmailComposerWithDraft}
        />
      ) : null}
    </div>
  );
}
