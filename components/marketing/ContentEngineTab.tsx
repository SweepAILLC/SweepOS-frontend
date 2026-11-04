'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { formatYmd } from '@/lib/dateRange';
import type {
  OnboardingSurveyDashboardResponse,
  OnboardingSurveyResponseItem,
  OnboardingSurveySelectedContentItem,
  OnboardingSurveyTopSelectedItem,
} from '@/types/onboardingSurvey';
import IdeasTab, { IdeasTabProps } from '@/components/marketing/IdeasTab';

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** started_following_date is a plain YYYY-MM-DD calendar date, not an instant —
 * formatting it through `new Date().toLocaleDateString()` shifts it a day west
 * of UTC, so this parses the YMD string directly instead. */
function fmtYmdDate(ymd: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(ymd) ? formatYmd(ymd.slice(0, 10)) : fmtDate(ymd);
}

function avgCommitmentScore(responses: OnboardingSurveyResponseItem[]): string {
  const scored = responses.map((r) => r.commitment_score).filter((s): s is number => s != null);
  if (!scored.length) return '—';
  return (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1);
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card rounded-xl p-3.5 space-y-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
    </div>
  );
}

function QA({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
      <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug break-words">{value}</p>
    </div>
  );
}

function ResponseCard({ response }: { response: OnboardingSurveyResponseItem }) {
  return (
    <div className="glass-card rounded-xl p-4 space-y-3 border border-gray-200/40 dark:border-gray-700/40">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{response.respondent_name}</p>
          {response.respondent_business_name ? (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">{response.respondent_business_name}</p>
          ) : null}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Submitted {fmtDate(response.submitted_at)}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <QA label="Referral source" value={response.referral_source} />
        <QA label="Started following" value={response.started_following_date ? fmtYmdDate(response.started_following_date) : null} />
        <QA label="Commitment score" value={response.commitment_score != null ? `${response.commitment_score}/10` : null} />
        <QA label="Problem to solve" value={response.problem_to_solve} />
        <QA label="Conversion trigger" value={response.conversion_trigger} />
        <QA label="Decision speed blocker" value={response.decision_speed_blocker} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QA label="What sparked interest" value={response.interest_spark} />
        <QA label="Content that contributed" value={response.content_contribution} />
        <QA label="Why the offer fit" value={response.offer_fit_reason} />
        <QA label="Why they invested" value={response.investment_reason} />
      </div>

      {response.referral_name || response.referral_contact ? (
        <div className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wide text-violet-500 dark:text-violet-300 font-semibold">
            Referral
          </p>
          <p className="text-sm text-gray-800 dark:text-gray-200">
            {response.referral_name || 'Unnamed'}
            {response.referral_contact ? ` — ${response.referral_contact}` : ''}
          </p>
        </div>
      ) : null}

      {response.content_selected.length ? (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
            Content that drew them in
          </p>
          <div className="flex flex-wrap gap-2">
            {response.content_selected.map((c: OnboardingSurveySelectedContentItem) => (
              <a
                key={c.instagram_media_id}
                href={c.permalink || undefined}
                target="_blank"
                rel="noreferrer"
                className="block w-16 h-16 rounded-lg overflow-hidden bg-gray-200/60 dark:bg-gray-700/60 ring-1 ring-gray-300/40 dark:ring-gray-600/40 hover:ring-violet-400/50"
                title={c.permalink || undefined}
              >
                {c.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : null}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ContentEngineTabProps = IdeasTabProps & { ideasError: string | null };

export default function ContentEngineTab({ ideasError, ...ideasProps }: ContentEngineTabProps) {
  const [data, setData] = useState<OnboardingSurveyDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.getOnboardingSurveyDashboard();
      setData(res);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading onboarding survey data…</p>;
  }

  if (error) {
    return (
      <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
        {error}
      </div>
    );
  }

  const responses = data?.responses ?? [];
  const topSelected = data?.top_selected_content ?? [];

  return (
    <div className="space-y-10">
      {topSelected.length ? (
        <section className="space-y-2">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top 5 highest-rated content</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              The Instagram posts clients picked most often, via the onboarding survey, as what actually drew them
              in — ranked by how many clients selected each one.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {topSelected.map((t: OnboardingSurveyTopSelectedItem, i: number) => (
              <a
                key={t.instagram_media_id}
                href={t.permalink || undefined}
                target="_blank"
                rel="noreferrer"
                className="glass-card rounded-xl p-2.5 w-36 space-y-1.5 hover:ring-1 hover:ring-violet-400/40"
              >
                <div className="relative w-full h-28 rounded-lg overflow-hidden bg-gray-200/60 dark:bg-gray-700/60">
                  {t.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  ) : null}
                  <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-black/70 text-white">
                    #{i + 1}
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 text-center">
                  {t.selection_count} client{t.selection_count === 1 ? '' : 's'}
                </p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Onboarding Survey</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Every post-sale onboarding survey response, and which of your Instagram posts clients say actually drew
            them in.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatTile label="Responses" value={String(data?.total_submitted ?? 0)} />
          <StatTile label="Avg commitment score" value={avgCommitmentScore(responses)} />
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">All responses</h4>
          {responses.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              No clients have submitted the onboarding survey yet.
            </p>
          ) : (
            <div className="space-y-3">
              {responses.map((r: OnboardingSurveyResponseItem) => (
                <ResponseCard key={`${r.respondent_name}-${r.submitted_at}`} response={r} />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="border-t border-gray-200/50 dark:border-gray-700/50 pt-8 space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Ideas</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            TOF / MOF / BOF concepts mined from calls and grounded in your top Instagram posts — not advice labels.
          </p>
        </div>
        {ideasError ? (
          <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
            {ideasError}
          </div>
        ) : null}
        <IdeasTab {...ideasProps} />
      </div>
    </div>
  );
}
