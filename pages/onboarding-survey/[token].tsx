import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { addDays, formatYmd, ymdOf } from '@/lib/dateRange';
import type {
  OnboardingSurveyMetaResponse,
  OnboardingSurveySubmitPayload,
} from '@/types/onboardingSurvey';

const TOTAL_STEPS = 12;

/** Shared chrome so SSR + first client paint match (avoids hydration errors) — same
 * local-shell convention as pages/close-survey/[token].tsx. */
function SurveyShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-4">{children}</div>
    </main>
  );
}

export default function OnboardingSurveyPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
          Loading form…
        </div>
      </SurveyShell>
    );
  }

  return <OnboardingSurveyClient />;
}

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 transition-colors';

const questionClass = 'text-xl sm:text-2xl font-semibold text-gray-100 leading-snug';

// ---------------------------------------------------------------------------
// Single-date picker — same visual language as the app's global date-range
// timeline (components/ui/DateRangePicker.tsx), scoped to one date only.
// ---------------------------------------------------------------------------

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SingleDateCalendar({
  value,
  onChange,
  today,
}: {
  value: string | null;
  onChange: (ymd: string) => void;
  today: string;
}) {
  const [ty, tm] = today.split('-').map(Number);
  const [view, setView] = useState(() => {
    const base = value || today;
    const [y, m] = base.split('-').map(Number);
    return { year: y, month: m - 1 };
  });

  const first = ymdOf(view.year, view.month, 1);
  const lead = (new Date(Date.UTC(view.year, view.month, 1, 12)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(view.year, view.month + 1, 0, 12)).getUTCDate();
  const cells: Array<string | null> = [...Array(lead).fill(null)];
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(addDays(first, d - 1));

  const canPrev = view.year > ty - 100;
  const canNext = view.year < ty || (view.year === ty && view.month < tm - 1);
  const shift = (n: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.year, v.month + n, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  const years: number[] = [];
  for (let y = ty; y >= ty - 100; y -= 1) years.push(y);

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-center gap-1 mb-3">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canPrev}
          aria-label="Previous month"
          className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
        >
          ‹
        </button>
        <select
          aria-label="Month"
          value={view.month}
          onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
          className="rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold text-gray-100 hover:bg-white/10 cursor-pointer"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={i} className="bg-gray-900">
              {m.slice(0, 3)}
            </option>
          ))}
        </select>
        <select
          aria-label="Year"
          value={view.year}
          onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
          className="rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold text-gray-100 hover:bg-white/10 cursor-pointer"
        >
          {years.map((y) => (
            <option key={y} value={y} className="bg-gray-900">
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!canNext}
          aria-label="Next month"
          className="rounded-md p-1.5 text-gray-400 hover:bg-white/10 disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-500 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`b${i}`} />;
          const future = ymd > today;
          const selected = ymd === value;
          const isToday = ymd === today;
          return (
            <button
              key={ymd}
              type="button"
              disabled={future}
              onClick={() => onChange(ymd)}
              aria-pressed={selected}
              className={`relative h-10 rounded-md text-sm tabular-nums transition-colors ${
                future
                  ? 'text-gray-600 cursor-not-allowed'
                  : selected
                    ? 'bg-cyan-600 text-white font-semibold'
                    : 'text-gray-200 hover:bg-white/10'
              }`}
            >
              {Number(ymd.slice(8))}
              {isToday && !selected ? (
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-cyan-400" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------------

function todayYmd(): string {
  const d = new Date();
  return ymdOf(d.getFullYear(), d.getMonth(), d.getDate());
}

function OnboardingSurveyClient() {
  const router = useRouter();
  const token = useMemo(
    () => (typeof router.query.token === 'string' ? router.query.token : ''),
    [router.query.token]
  );

  const [meta, setMeta] = useState<OnboardingSurveyMetaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const submittingRef = useRef(false);
  const loadGen = useRef(0);
  const today = useMemo(() => todayYmd(), []);

  // Q0 + Q1-Q11
  const [respondentName, setRespondentName] = useState('');
  const [respondentBusinessName, setRespondentBusinessName] = useState('');
  const [referralSource, setReferralSource] = useState('');
  const [startedFollowingDate, setStartedFollowingDate] = useState<string | null>(null);
  const [interestSpark, setInterestSpark] = useState('');
  const [contentContribution, setContentContribution] = useState('');
  const [contentSelectedIds, setContentSelectedIds] = useState<string[]>([]);
  const [failedThumbIds, setFailedThumbIds] = useState<Set<string>>(new Set());
  const [problemToSolve, setProblemToSolve] = useState('');
  const [offerFitReason, setOfferFitReason] = useState('');
  const [investmentReason, setInvestmentReason] = useState('');
  const [decisionSpeedBlocker, setDecisionSpeedBlocker] = useState('');
  const [commitmentScore, setCommitmentScore] = useState<number | null>(null);
  const [conversionTrigger, setConversionTrigger] = useState('');
  const [referralName, setReferralName] = useState('');
  const [referralContact, setReferralContact] = useState('');

  const loadMeta = useCallback(async (tok: string) => {
    const gen = ++loadGen.current;
    setLoading(true);
    setLoadError(null);
    try {
      const row = await apiClient.getOnboardingSurveyMeta(tok);
      if (gen !== loadGen.current) return;
      setMeta(row);
    } catch (err) {
      if (gen !== loadGen.current) return;
      setMeta(null);
      setLoadError(formatApiError(err, 'Could not load survey'));
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadMeta(token);
  }, [token, loadMeta]);

  const goTo = (next: number) => {
    setAnimKey((k) => k + 1);
    setStep(Math.max(0, Math.min(TOTAL_STEPS - 1, next)));
  };
  const goNext = () => goTo(step + 1);
  const goBack = () => goTo(step - 1);

  /** Single-choice steps advance themselves after a short beat so the pick is visible. */
  const pickAndAdvance = (apply: () => void) => {
    apply();
    window.setTimeout(() => goNext(), 180);
  };

  const canAdvance = useMemo(() => {
    if (step === 0) return respondentName.trim().length > 0;
    return true;
  }, [step, respondentName]);

  const submit = async () => {
    if (!token || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const body: OnboardingSurveySubmitPayload = {
        respondent_name: respondentName.trim(),
        respondent_business_name: respondentBusinessName.trim() || undefined,
        referral_source: referralSource || undefined,
        started_following_date: startedFollowingDate || undefined,
        interest_spark: interestSpark || undefined,
        content_contribution: contentContribution || undefined,
        content_selected_ids: contentSelectedIds.length ? contentSelectedIds : undefined,
        problem_to_solve: problemToSolve || undefined,
        offer_fit_reason: offerFitReason || undefined,
        investment_reason: investmentReason || undefined,
        decision_speed_blocker: decisionSpeedBlocker || undefined,
        commitment_score: commitmentScore,
        conversion_trigger: conversionTrigger || undefined,
        referral_name: referralName.trim() || undefined,
        referral_contact: referralContact.trim() || undefined,
      };
      await apiClient.submitOnboardingSurvey(token, body);
      setDone(true);
    } catch (err) {
      setSaveError(formatApiError(err, 'Could not submit survey'));
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  // Enter advances on a focused <input> (not inside a <textarea>, which needs
  // Enter for newlines); Escape-free, Typeform-style keyboard flow.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const el = document.activeElement;
      if (el instanceof HTMLTextAreaElement) return;
      if (!canAdvance) return;
      e.preventDefault();
      if (step < TOTAL_STEPS - 1) goNext();
      else if (!saving) void submit();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, canAdvance, saving]);

  if (loading) {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
          Loading…
        </div>
      </SurveyShell>
    );
  }

  if (loadError || !meta) {
    return (
      <SurveyShell>
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {loadError || 'Survey link not found'}
        </div>
      </SurveyShell>
    );
  }

  if (done) {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center animate-in fade-in zoom-in-95 duration-300">
          <p className="text-lg font-semibold text-emerald-100">
            Thanks{respondentName ? `, ${respondentName.split(' ')[0]}` : ''} — your answers were recorded.
          </p>
        </div>
      </SurveyShell>
    );
  }

  const progressPct = ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <SurveyShell>
      <div className="text-center">
        <h1 className="text-xl font-bold text-gray-100">Onboarding Form</h1>
        <p className="mt-1 text-sm text-gray-500">{meta.org_name}</p>
      </div>

      <div>
        <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-cyan-500 transition-all duration-300 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {step + 1} / {TOTAL_STEPS} · {meta.org_name}
        </p>
      </div>

      <div
        key={animKey}
        className="rounded-xl border border-white/10 bg-white/5 p-5 sm:p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        {step === 0 && (
          <div className="space-y-4">
            <label className="block">
              <span className={questionClass}>What&apos;s your name?</span>
              <input
                type="text"
                autoFocus
                value={respondentName}
                onChange={(e) => setRespondentName(e.target.value)}
                className={inputClass}
                placeholder="Jordan Okoye"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-400">And your business name? (optional)</span>
              <input
                type="text"
                value={respondentBusinessName}
                onChange={(e) => setRespondentBusinessName(e.target.value)}
                className={inputClass}
                placeholder="Okoye Coaching"
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div>
            <span className={questionClass}>How did you first hear about us?</span>
            {meta.referral_source_options.length > 0 ? (
              <div className="mt-3 space-y-2">
                {meta.referral_source_options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => pickAndAdvance(() => setReferralSource(opt))}
                    className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                      referralSource === opt
                        ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                autoFocus
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                className={inputClass}
                placeholder="e.g. Instagram, a friend's referral…"
              />
            )}
          </div>
        )}

        {step === 2 && (
          <div>
            <span className={questionClass}>When did you start following us?</span>
            <p className="mt-1 text-sm text-gray-400">Not sure exactly? A rough guess is totally fine.</p>
            <div className="mt-3">
              <SingleDateCalendar value={startedFollowingDate} onChange={setStartedFollowingDate} today={today} />
            </div>
            {startedFollowingDate ? (
              <p className="mt-2 text-sm text-cyan-300">{formatYmd(startedFollowingDate)}</p>
            ) : null}
          </div>
        )}

        {step === 3 && (
          <label className="block">
            <span className={questionClass}>What first sparked your interest?</span>
            <textarea
              autoFocus
              value={interestSpark}
              onChange={(e) => setInterestSpark(e.target.value)}
              rows={4}
              className={inputClass}
              placeholder="A post, a story, a conversation…"
            />
          </label>
        )}

        {step === 4 && (
          meta.instagram_connected && meta.instagram_gallery.length > 0 ? (
            <div>
              <span className={questionClass}>
                Which of these posts specifically contributed to you starting with us?
              </span>
              <p className="mt-1 text-sm text-gray-400">Select as many as apply.</p>
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 gap-3">
                {meta.instagram_gallery.map((item) => {
                  const selected = contentSelectedIds.includes(item.id);
                  const showImg = Boolean(item.thumbnail_url) && !failedThumbIds.has(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        setContentSelectedIds((prev) =>
                          selected ? prev.filter((id) => id !== item.id) : [...prev, item.id]
                        )
                      }
                      className={`relative rounded-lg overflow-hidden border-2 transition-colors text-left ${
                        selected ? 'border-cyan-400' : 'border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className="relative w-full aspect-[4/5] bg-white/5">
                        {showImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.thumbnail_url!}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            onError={() =>
                              setFailedThumbIds((prev) => new Set(prev).add(item.id))
                            }
                            className={`absolute inset-0 w-full h-full object-cover ${
                              selected ? '' : 'opacity-70'
                            }`}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 p-2 text-center line-clamp-4">
                            {item.caption_excerpt || 'Post'}
                          </div>
                        )}
                      </div>
                      {selected ? (
                        <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-cyan-400 text-gray-900 text-xs flex items-center justify-center">
                          ✓
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <label className="block">
              <span className={questionClass}>What content specifically contributed to you starting with us?</span>
              <textarea
                autoFocus
                value={contentContribution}
                onChange={(e) => setContentContribution(e.target.value)}
                rows={4}
                className={inputClass}
                placeholder="A specific post, reel, story, or video…"
              />
            </label>
          )
        )}

        {step === 5 && (
          <div>
            <span className={questionClass}>What problem were you hoping to solve?</span>
            {meta.problem_to_solve_options.length > 0 ? (
              <div className="mt-3 space-y-2">
                {meta.problem_to_solve_options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => pickAndAdvance(() => setProblemToSolve(opt))}
                    className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                      problemToSolve === opt
                        ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                autoFocus
                value={problemToSolve}
                onChange={(e) => setProblemToSolve(e.target.value)}
                className={inputClass}
              />
            )}
          </div>
        )}

        {step === 6 && (
          <label className="block">
            <span className={questionClass}>What part of the offer felt like it addressed that problem?</span>
            <textarea
              autoFocus
              value={offerFitReason}
              onChange={(e) => setOfferFitReason(e.target.value)}
              rows={4}
              className={inputClass}
            />
          </label>
        )}

        {step === 7 && (
          <label className="block">
            <span className={questionClass}>What was the main reason you decided to invest?</span>
            <textarea
              autoFocus
              value={investmentReason}
              onChange={(e) => setInvestmentReason(e.target.value)}
              rows={4}
              className={inputClass}
            />
          </label>
        )}

        {step === 8 && (
          <label className="block">
            <span className={questionClass}>What could have sped up your decision?</span>
            <textarea
              autoFocus
              value={decisionSpeedBlocker}
              onChange={(e) => setDecisionSpeedBlocker(e.target.value)}
              rows={4}
              className={inputClass}
            />
          </label>
        )}

        {step === 9 && (
          <div>
            <span className={questionClass}>
              Before your call, how committed did you already feel to working with us?
            </span>
            <div className="mt-4 flex flex-wrap gap-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pickAndAdvance(() => setCommitmentScore(n))}
                  className={`w-10 h-10 rounded-lg border text-sm font-semibold transition-all ${
                    commitmentScore === n
                      ? 'border-cyan-400 bg-cyan-500/25 text-cyan-100 scale-110'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">1 = not at all · 10 = fully committed</p>
          </div>
        )}

        {step === 10 && (
          <div>
            <span className={questionClass}>What ultimately pushed you to say yes?</span>
            {meta.conversion_trigger_options.length > 0 ? (
              <div className="mt-3 space-y-2">
                {meta.conversion_trigger_options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => pickAndAdvance(() => setConversionTrigger(opt))}
                    className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                      conversionTrigger === opt
                        ? 'border-cyan-400 bg-cyan-500/15 text-cyan-100'
                        : 'border-white/10 bg-white/5 text-gray-200 hover:bg-white/10'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="text"
                autoFocus
                value={conversionTrigger}
                onChange={(e) => setConversionTrigger(e.target.value)}
                className={inputClass}
              />
            )}
          </div>
        )}

        {step === 11 && (
          <div className="space-y-4">
            <div>
              <span className={questionClass}>
                Who do you know that might want to go through this program with you and achieve
                those same results?
              </span>
              <p className="mt-1 text-sm text-gray-400">
                Provide their contact info and name — and feel free to let them know we may be
                reaching out.
              </p>
            </div>
            <label className="block">
              <span className="text-sm text-gray-400">Their name</span>
              <input
                type="text"
                autoFocus
                value={referralName}
                onChange={(e) => setReferralName(e.target.value)}
                className={inputClass}
                placeholder="Alex Rivera"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-400">How can we reach them? (email or phone)</span>
              <input
                type="text"
                value={referralContact}
                onChange={(e) => setReferralContact(e.target.value)}
                className={inputClass}
                placeholder="alex@email.com or (555) 123-4567"
              />
            </label>
          </div>
        )}

        {saveError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {saveError}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={goBack}
            disabled={step === 0}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-300 disabled:opacity-40 hover:bg-white/5 transition-colors"
          >
            Back
          </button>
          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={!canAdvance}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 px-5 py-2 text-sm font-semibold text-white transition-colors"
            >
              Next ↵
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-5 py-2 text-sm font-semibold text-white transition-colors"
            >
              {saving ? 'Submitting…' : 'Submit ↵'}
            </button>
          )}
        </div>
      </div>
    </SurveyShell>
  );
}
