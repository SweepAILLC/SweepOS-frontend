'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  apiClient,
  type AutomationContentMode,
  type AutomationHtmlTemplateRef,
  type AutomationPlaybook,
  type AutomationPreviewResponse,
  type AutomationRule,
  type AutomationRuleUpdate,
} from '@/lib/api';

import ToggleSwitch from '@/components/ui/ToggleSwitch';

interface WritingSampleLite {
  kind: string;
  title?: string;
  body?: string;
  html_template?: string;
}

const SAMPLE_KIND_LABEL: Record<string, string> = {
  email: 'Voice email',
  message: 'Voice message',
  other: 'Voice other',
  onboarding_email: 'Onboarding email',
  referral_campaign: 'Referral campaign',
  upsell_campaign: 'Upsell campaign',
  re_sign_campaign: 'Re-sign / renewal',
};

const PLAYBOOK_AUTO_SAMPLE_KIND: Record<AutomationPlaybook, string> = {
  pre_sale_post_booking: 'onboarding_email',
  first_payment_onboarding: 'onboarding_email',
  first_payment_referral: 'referral_campaign',
  win_combined_ask: 'referral_campaign',
  offboarding_recap_ask: 're_sign_campaign',
};

/** Encode a chosen sample (or the auto-pick option) into the persisted ref shape. */
function encodeSampleRef(value: string): AutomationHtmlTemplateRef | null {
  if (!value) return null;
  if (value.startsWith('title:')) {
    return { kind: 'writing_samples_by_title', title: value.slice('title:'.length) };
  }
  if (value.startsWith('kind:')) {
    return { kind: 'writing_samples_by_kind', sample_kind: value.slice('kind:'.length) };
  }
  return null;
}

/** Decode the saved ref back to the dropdown's selected value. */
function decodeSampleRef(ref?: AutomationHtmlTemplateRef | null): string {
  if (!ref) return '';
  if (ref.kind === 'writing_samples_by_title' && ref.title) {
    return `title:${ref.title}`;
  }
  if (ref.kind === 'writing_samples_by_kind' && ref.sample_kind) {
    return `kind:${ref.sample_kind}`;
  }
  return '';
}

const PLAYBOOK_LABEL: Record<AutomationPlaybook, string> = {
  pre_sale_post_booking: 'Post-booking (pre-sale)',
  first_payment_onboarding: 'Onboarding (first payment)',
  first_payment_referral: 'Referral ask (first payment + 1h)',
  win_combined_ask: 'Combined ask after win',
  offboarding_recap_ask: 'Offboarding recap & ask',
};

const PLAYBOOK_DESCRIPTION: Record<AutomationPlaybook, string> = {
  pre_sale_post_booking:
    'Sent after a Calendly or Cal.com booking lands while the client has not paid yet. Use it for a primer / agenda / pre-call value email so the lead arrives warm. Configure which calendar events fire this step from the Booking trigger node on the timeline.',
  first_payment_onboarding:
    'Sent immediately after a client makes their first successful payment. Welcome them and outline the first checklist items.',
  first_payment_referral:
    'Sent ~1 hour after the onboarding email. Tells them people do best with a friend in the program — includes the referral offer and a sharable link.',
  win_combined_ask:
    'Triggered when an LLM call insight detects a win. Picks the top 1–2 opportunities (referral, upsell, testimonial) for this client and combines them into one note.',
  offboarding_recap_ask:
    'Triggered when a client crosses 75% program progress. Recaps wins and asks for the highest-priority opportunity.',
};

const ASK_ORDER_LABEL: Record<string, string> = {
  referral: 'Referral',
  upsell: 'Upsell',
  testimonial: 'Testimonial',
};

/** Preset pin orders for combined-ask playbooks (value = comma-separated canonical names). */
function buildCombinedAskPinOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [
    { value: '', label: 'LLM chooses (recommended)' },
  ];
  const keys = ['referral', 'upsell', 'testimonial'] as const;
  for (const k of keys) {
    out.push({ value: k, label: `${ASK_ORDER_LABEL[k]} only` });
  }
  for (const a of keys) {
    for (const b of keys) {
      if (a === b) continue;
      out.push({
        value: `${a},${b}`,
        label: `${ASK_ORDER_LABEL[a]} → ${ASK_ORDER_LABEL[b]}`,
      });
    }
  }
  const triplePerms = [
    ['referral', 'upsell', 'testimonial'],
    ['referral', 'testimonial', 'upsell'],
    ['upsell', 'referral', 'testimonial'],
    ['upsell', 'testimonial', 'referral'],
    ['testimonial', 'referral', 'upsell'],
    ['testimonial', 'upsell', 'referral'],
  ] as const;
  for (const perm of triplePerms) {
    out.push({
      value: perm.join(','),
      label: perm.map((p) => ASK_ORDER_LABEL[p]).join(' → '),
    });
  }
  return out;
}

const COMBINED_ASK_PIN_OPTIONS = buildCombinedAskPinOptions();

interface PlaybookCardProps {
  rule: AutomationRule;
  onSaved: (next: AutomationRule) => void;
  /** When provided, "Preview" sends an actual draft request scoped to this client. */
  previewClientId?: string | null;
  /** Inside PlaybookModal — skip outer card chrome; modal supplies the shell. */
  embedded?: boolean;
}

const fieldClass =
  'block w-full rounded-lg border border-gray-300/80 dark:border-white/10 bg-white dark:bg-gray-900/80 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/25';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200/80 dark:border-white/10 bg-gray-50/80 dark:bg-white/[0.03] p-4 space-y-3">
      <div>
        <h4 className="text-xs font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">{title}</h4>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-gray-400">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function delayLabel(seconds: number): string {
  if (seconds <= 0) return 'immediate';
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

export default function PlaybookCard({ rule, onSaved, previewClientId, embedded = false }: PlaybookCardProps) {
  const [draft, setDraft] = useState<AutomationRuleUpdate>({
    enabled: rule.enabled,
    delay_seconds: rule.delay_seconds,
    content_mode: rule.content_mode,
    subject_template: rule.subject_template ?? '',
    html_template_ref: rule.html_template_ref ?? null,
    ai_content_system_prompt: rule.ai_content_system_prompt ?? '',
    audience_filter: rule.audience_filter ?? null,
    trigger_config: rule.trigger_config ?? null,
    opportunity_priority: rule.opportunity_priority ?? null,
    combine_top_n: rule.combine_top_n,
    require_approval: rule.require_approval,
    approval_ttl_hours: rule.approval_ttl_hours ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<AutomationPreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [samples, setSamples] = useState<WritingSampleLite[]>([]);
  const [samplesLoaded, setSamplesLoaded] = useState(false);
  const [previewView, setPreviewView] = useState<'rendered' | 'plain' | 'source'>('rendered');

  const isCombinedAsk =
    rule.playbook === 'win_combined_ask' || rule.playbook === 'offboarding_recap_ask';

  useEffect(() => {
    setDraft({
      enabled: rule.enabled,
      delay_seconds: rule.delay_seconds,
      content_mode: rule.content_mode,
      subject_template: rule.subject_template ?? '',
      html_template_ref: rule.html_template_ref ?? null,
      ai_content_system_prompt: rule.ai_content_system_prompt ?? '',
      audience_filter: rule.audience_filter ?? null,
      trigger_config: rule.trigger_config ?? null,
      opportunity_priority: rule.opportunity_priority ?? null,
      combine_top_n: rule.combine_top_n,
      require_approval: rule.require_approval,
      approval_ttl_hours: rule.approval_ttl_hours ?? null,
    });
  }, [rule.updated_at, rule.id]);

  // Pull writing samples from Intelligence so the HTML-template dropdown shows
  // the operator's actual saved samples (no manual title-typing required).
  useEffect(() => {
    if (draft.content_mode !== 'html_template' || samplesLoaded) return;
    let cancelled = false;
    apiClient
      .getUserSettings()
      .then((settings) => {
        if (cancelled) return;
        const profile = (settings as { ai_profile?: { writing_samples?: WritingSampleLite[] } } | null)?.ai_profile;
        const list = Array.isArray(profile?.writing_samples) ? profile!.writing_samples! : [];
        setSamples(
          list.filter(
            (s) => (s?.html_template || '').trim().length > 0 || (s?.body || '').trim().length > 0
          )
        );
        setSamplesLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSamples([]);
          setSamplesLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft.content_mode, samplesLoaded]);

  const autoSampleKind = PLAYBOOK_AUTO_SAMPLE_KIND[rule.playbook];
  const autoMatchedSample = useMemo(
    () => samples.find((s) => s.kind === autoSampleKind),
    [samples, autoSampleKind]
  );
  const sampleSelectValue = decodeSampleRef(draft.html_template_ref ?? null);

  const combinedAskPinSelectOptions = useMemo(() => {
    if (!isCombinedAsk) {
      return COMBINED_ASK_PIN_OPTIONS;
    }
    const pri = draft.opportunity_priority ?? [];
    const pinKey = pri.join(',');
    const base = COMBINED_ASK_PIN_OPTIONS;
    if (pinKey && !base.some((o) => o.value === pinKey)) {
      return [
        ...base,
        {
          value: pinKey,
          label: `Saved: ${pri.map((n) => ASK_ORDER_LABEL[n] ?? n).join(' → ')}`,
        },
      ];
    }
    return base;
  }, [isCombinedAsk, draft.opportunity_priority]);

  const combinedAskPinValue = (draft.opportunity_priority ?? []).join(',');

  const setField = <K extends keyof AutomationRuleUpdate>(key: K, value: AutomationRuleUpdate[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const onSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.updateAutomationRule(rule.playbook, draft);
      onSaved(next);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved, rule.playbook]);

  const onPreview = useCallback(async () => {
    if (!previewClientId) {
      setError('Pick a client at the top of the page to preview a draft.');
      return;
    }
    setPreviewing(true);
    setError(null);
    try {
      const out = await apiClient.previewAutomationDraft({
        playbook: rule.playbook,
        client_id: previewClientId,
        content_mode: draft.content_mode,
        subject_template: draft.subject_template,
        html_template_ref: draft.html_template_ref ?? null,
        ai_content_system_prompt: draft.ai_content_system_prompt?.trim()
          ? draft.ai_content_system_prompt.trim()
          : null,
      });
      setPreview(out);
      // Default to rendered HTML when in template mode (which is when this view
      // really matters); plain mode previews are best read as plain text.
      setPreviewView(draft.content_mode === 'html_template' ? 'rendered' : 'plain');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Preview failed';
      setError(msg);
    } finally {
      setPreviewing(false);
    }
  }, [
    previewClientId,
    rule.playbook,
    draft.content_mode,
    draft.subject_template,
    draft.html_template_ref,
    draft.ai_content_system_prompt,
  ]);

  return (
    <div
      className={
        embedded
          ? 'space-y-5'
          : 'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 sm:p-5 space-y-5'
      }
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          {!embedded ? (
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {PLAYBOOK_LABEL[rule.playbook]}
            </h3>
          ) : null}
          <p className={`text-sm leading-relaxed text-gray-600 dark:text-gray-400 max-w-2xl ${embedded ? '' : 'mt-1'}`}>
            {PLAYBOOK_DESCRIPTION[rule.playbook]}
          </p>
        </div>
        <ToggleSwitch
          checked={!!draft.enabled}
          onChange={(v) => setField('enabled', v)}
          label={embedded ? undefined : 'Automation'}
          onLabel="On"
          offLabel="Off"
          tone="emerald"
        />
      </div>

      <Section title="Timing" description="How long to wait after the previous step before this email sends.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
            <span className="font-medium text-gray-800 dark:text-gray-200">Delay</span>
            <select
              value={draft.delay_seconds}
              onChange={(e) => setField('delay_seconds', Number(e.target.value))}
              className={fieldClass}
            >
              <option value={0}>Immediate</option>
              <option value={1800}>30 minutes</option>
              <option value={3600}>1 hour</option>
              <option value={2 * 3600}>2 hours</option>
              <option value={24 * 3600}>1 day</option>
              <option value={3 * 24 * 3600}>3 days</option>
            </select>
            <span className="text-[11px] text-gray-500">Currently: {delayLabel(draft.delay_seconds)}</span>
          </label>
        </div>
      </Section>

      <Section
        title="Content"
        description="Subject line and body source. AI mode uses your Intelligence voice; template mode uses a saved writing sample."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 sm:col-span-2">
            <span className="font-medium text-gray-800 dark:text-gray-200">Content mode</span>
            <select
              value={draft.content_mode}
              onChange={(e) => setField('content_mode', e.target.value as AutomationContentMode)}
              className={fieldClass}
            >
              <option value="ai_generated">AI-generated (Intelligence voice)</option>
              <option value="html_template">HTML template (writing samples)</option>
            </select>
          </label>

          <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 sm:col-span-2">
            <span className="font-medium text-gray-800 dark:text-gray-200">Subject</span>
            <input
              type="text"
              value={draft.subject_template ?? ''}
              onChange={(e) => setField('subject_template', e.target.value)}
              placeholder="e.g. Welcome — your first steps, {{first_name}}"
              className={fieldClass}
            />
            <span className="text-[11px] text-gray-500">Use {'{{first_name}}'} merge tags</span>
          </label>

          {draft.content_mode === 'ai_generated' ? (
            <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 sm:col-span-2">
              <span className="font-medium text-gray-800 dark:text-gray-200">AI instructions (optional)</span>
              <textarea
                rows={4}
                maxLength={8000}
                value={draft.ai_content_system_prompt ?? ''}
                onChange={(e) => setField('ai_content_system_prompt', e.target.value)}
                placeholder="Tone, CTAs, links to emphasize, what to avoid…"
                className={`${fieldClass} font-mono text-xs`}
              />
              <span className="text-[11px] text-gray-500">
                {(draft.ai_content_system_prompt ?? '').length.toLocaleString()} / 8,000
              </span>
            </label>
          ) : null}

          {draft.content_mode === 'html_template' ? (
            <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5 sm:col-span-2">
              <span className="font-medium text-gray-800 dark:text-gray-200">Email template</span>
              <select
                value={sampleSelectValue}
                onChange={(e) => setField('html_template_ref', encodeSampleRef(e.target.value))}
                className={fieldClass}
              >
                <option value="">
                  {autoMatchedSample
                    ? `Auto-pick (“${autoMatchedSample.title || SAMPLE_KIND_LABEL[autoSampleKind] || autoSampleKind}”)`
                    : `Auto-pick by playbook (no ${SAMPLE_KIND_LABEL[autoSampleKind] || autoSampleKind} sample yet)`}
                </option>
                {samples.length > 0 ? (
                  <optgroup label="Your writing samples">
                    {samples.map((s, i) => {
                      const titleOrLabel = (s.title || '').trim() || SAMPLE_KIND_LABEL[s.kind] || s.kind;
                      const value = (s.title || '').trim()
                        ? `title:${(s.title || '').trim()}`
                        : `kind:${s.kind}`;
                      const tag = SAMPLE_KIND_LABEL[s.kind] || s.kind;
                      return (
                        <option key={`${value}-${i}`} value={value}>
                          {titleOrLabel} — {tag}
                        </option>
                      );
                    })}
                  </optgroup>
                ) : null}
              </select>
              <span className="text-[11px] text-gray-500">
                {samplesLoaded && samples.length === 0 ? (
                  <>
                    Add samples in{' '}
                    <Link className="text-violet-600 dark:text-violet-400 underline" href="/?tab=intelligence">
                      Intelligence
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Manage in{' '}
                    <Link className="text-violet-600 dark:text-violet-400 underline" href="/?tab=intelligence">
                      Intelligence → Writing Samples
                    </Link>
                    .
                  </>
                )}
              </span>
            </label>
          ) : null}
        </div>
      </Section>

      {isCombinedAsk ? (
        <Section title="Combined ask" description="How many opportunities the AI may bundle into one email.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
              <span className="font-medium text-gray-800 dark:text-gray-200">Max asks</span>
              <select
                value={draft.combine_top_n}
                onChange={(e) => setField('combine_top_n', Number(e.target.value))}
                className={fieldClass}
              >
                <option value={1}>1 — exactly one</option>
                <option value={2}>2 — up to two</option>
                <option value={3}>3 — full autonomy</option>
              </select>
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
              <span className="font-medium text-gray-800 dark:text-gray-200">Pin order</span>
              <select
                value={combinedAskPinValue}
                onChange={(e) => {
                  const v = e.target.value;
                  setField('opportunity_priority', v ? v.split(',') : null);
                }}
                className={fieldClass}
              >
                {combinedAskPinSelectOptions.map((o) => (
                  <option key={o.value || '__llm__'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Section>
      ) : null}

      <Section title="Approval" description="Require a human OK before Brevo sends — jobs land in your Performance inbox.">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <ToggleSwitch
            checked={!!draft.require_approval}
            onChange={(v) => setField('require_approval', v)}
            label="Require approval"
            onLabel="Yes"
            offLabel="No"
          />
          {draft.require_approval ? (
            <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1.5">
              <span className="font-medium text-gray-800 dark:text-gray-200">Expires after (hours)</span>
              <input
                type="number"
                min={1}
                max={336}
                value={draft.approval_ttl_hours ?? 72}
                onChange={(e) =>
                  setField(
                    'approval_ttl_hours',
                    Number.isFinite(Number(e.target.value)) ? Number(e.target.value) : 72
                  )
                }
                className="w-28 rounded-lg border border-gray-300/80 dark:border-white/10 bg-white dark:bg-gray-900/80 px-3 py-2 text-sm"
              />
            </label>
          ) : null}
        </div>
      </Section>

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {preview ? (
        <div className="rounded-xl border border-gray-200/80 dark:border-white/10 bg-white dark:bg-black/20 p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              Subject:{' '}
              <span className="font-normal">{preview.subject || '(empty)'}</span>
            </div>
            <div className="flex items-center gap-2">
              {preview.chosen_opportunities.length ? (
                <div className="text-[11px] text-gray-500">
                  Combined: {preview.chosen_opportunities.join(', ')}
                </div>
              ) : null}
              {/* View toggle — rendered HTML is what actually gets sent to Brevo. */}
              <div
                role="tablist"
                aria-label="Preview view"
                className="inline-flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden text-[11px]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewView === 'rendered'}
                  disabled={!preview.html}
                  onClick={() => setPreviewView('rendered')}
                  className={`px-2 py-0.5 ${
                    previewView === 'rendered'
                      ? 'bg-violet-600 text-white'
                      : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  } ${!preview.html ? 'opacity-40 cursor-not-allowed' : ''}`}
                  title={preview.html ? 'Render the HTML body the worker will send' : 'No HTML in this draft'}
                >
                  Rendered
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewView === 'plain'}
                  onClick={() => setPreviewView('plain')}
                  className={`px-2 py-0.5 border-l border-gray-300 dark:border-gray-600 ${
                    previewView === 'plain'
                      ? 'bg-violet-600 text-white'
                      : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  Plain
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={previewView === 'source'}
                  disabled={!preview.html}
                  onClick={() => setPreviewView('source')}
                  className={`px-2 py-0.5 border-l border-gray-300 dark:border-gray-600 ${
                    previewView === 'source'
                      ? 'bg-violet-600 text-white'
                      : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                  } ${!preview.html ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  HTML source
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2">
            {previewView === 'rendered' && preview.html ? (
              // Sandboxed iframe so the operator sees exactly what Brevo will render,
              // without giving the email scripts/styles access to our app DOM.
              <iframe
                title="Email HTML preview"
                sandbox=""
                srcDoc={preview.html}
                className="w-full h-[28rem] rounded border border-gray-200 dark:border-gray-700 bg-white"
              />
            ) : previewView === 'source' && preview.html ? (
              <pre className="whitespace-pre-wrap break-all text-[11px] font-mono text-gray-800 dark:text-gray-200 max-h-[28rem] overflow-auto p-2 rounded bg-gray-50 dark:bg-gray-900/40">
                {preview.html}
              </pre>
            ) : (
              <pre className="whitespace-pre-wrap text-xs text-gray-800 dark:text-gray-200 max-h-[28rem] overflow-auto p-2 rounded bg-gray-50 dark:bg-gray-900/40">
                {preview.body_plain || '(empty)'}
              </pre>
            )}
          </div>

          {preview.notes.length ? (
            (() => {
              // The picker emits the rationale block at the front of `notes` (lines
              // starting with "LLM picked", "Operator-pinned", or "Deterministic
              // combined ask"). Render that block in a slightly more prominent panel
              // so the operator sees the *why* before the trailing diagnostics
              // (token usage, fallback warnings, etc.).
              const rationalePrefixes = [
                'LLM picked combined ask',
                'Operator-pinned combined ask',
                'Deterministic combined ask',
              ];
              let splitAt = preview.notes.length;
              if (rationalePrefixes.some((p) => preview.notes[0]?.startsWith(p))) {
                splitAt = 1;
                while (
                  splitAt < preview.notes.length &&
                  (preview.notes[splitAt].startsWith('Why:') ||
                    preview.notes[splitAt].startsWith('  - ') ||
                    preview.notes[splitAt].startsWith('Fallback used:'))
                ) {
                  splitAt += 1;
                }
              } else {
                splitAt = 0;
              }
              const rationaleNotes = preview.notes.slice(0, splitAt);
              const otherNotes = preview.notes.slice(splitAt);
              return (
                <>
                  {rationaleNotes.length ? (
                    <div className="mt-3 rounded-md border border-violet-200 dark:border-violet-700/60 bg-violet-50/60 dark:bg-violet-900/20 p-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300 mb-1">
                        Combined-ask strategy
                      </div>
                      <ul className="text-[11px] text-violet-900 dark:text-violet-100 space-y-0.5">
                        {rationaleNotes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {otherNotes.length ? (
                    <ul className="mt-2 text-[11px] text-gray-500 list-disc pl-5">
                      {otherNotes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              );
            })()
          ) : null}
        </div>
      ) : null}

      <div
        className={`flex flex-wrap items-center gap-2 ${embedded ? 'sticky bottom-0 -mx-4 sm:-mx-5 px-4 sm:px-5 py-3 border-t border-white/10 bg-gray-950/95 backdrop-blur-sm' : 'pt-1'}`}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          aria-busy={saving}
          className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 shadow-[0_0_20px_rgba(139,92,246,0.25)] transition-colors"
        >
          {saving ? 'Saving…' : 'Save playbook'}
        </button>
        <button
          type="button"
          onClick={onPreview}
          disabled={previewing || !previewClientId}
          aria-busy={previewing}
          className="rounded-lg border border-gray-300/80 dark:border-white/15 text-sm font-medium px-4 py-2 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
          title={previewClientId ? 'Build a preview draft for the selected client' : 'Pick a client above to preview'}
        >
          {previewing ? 'Building preview…' : 'Preview draft'}
        </button>
      </div>
    </div>
  );
}
