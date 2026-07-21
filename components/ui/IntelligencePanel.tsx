'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { apiClient, type OrgSalesContentTheme } from '@/lib/api';
import { DEFAULT_EMAIL_HTML_TEMPLATE } from '@/lib/emailHtmlDefaultTemplate';
import {
  normalizeOfferLadder,
  type ObjectionHandler,
  type OfferEntry,
  type OfferLadder,
  type ReferralOffer,
} from '@/lib/offerLadder';

const CAMPAIGN_SAMPLE_KINDS = [
  'onboarding_email',
  'referral_campaign',
  'upsell_campaign',
  're_sign_campaign',
] as const;
type CampaignSampleKind = (typeof CAMPAIGN_SAMPLE_KINDS)[number];

function isCampaignSampleKind(k: string): k is CampaignSampleKind {
  return (CAMPAIGN_SAMPLE_KINDS as readonly string[]).includes(k);
}
import { useLoading } from '@/contexts/LoadingContext';

interface AssetLink {
  label: string;
  url: string;
}

type WritingSampleKind =
  | 'email'
  | 'message'
  | 'other'
  | 'onboarding_email'
  | 'referral_campaign'
  | 'upsell_campaign'
  | 're_sign_campaign';

const WRITING_SAMPLE_KIND_OPTIONS: { value: WritingSampleKind; label: string; description: string }[] = [
  { value: 'email', label: 'Voice example — email', description: 'Past email that sounds like you' },
  { value: 'message', label: 'Voice example — message', description: 'DM, SMS, or chat snippet for tone' },
  { value: 'other', label: 'Voice example — other', description: 'Any other writing that captures your voice' },
  { value: 'onboarding_email', label: 'Onboarding email', description: 'Welcome / first-steps email for new clients' },
  { value: 'referral_campaign', label: 'Referral campaign', description: 'Asks clients to share with a friend' },
  { value: 'upsell_campaign', label: 'Upsell campaign', description: 'Offers a higher tier / next step' },
  { value: 're_sign_campaign', label: 'Re-sign / renewal', description: 'Win-back / commitment renewal' },
];

interface WritingSample {
  kind: WritingSampleKind;
  title?: string;
  /** Plain text version. Used when format = 'plain', and as a fallback / voice anchor when format = 'html'. */
  body?: string;
  /** Branded HTML. Optional even for campaign kinds — only used when format = 'html'. */
  html_template?: string;
  /**
   * Which side is the source of truth for this sample. Defaults to 'plain' so
   * voice examples stay simple and HTML wrappers are explicitly opt-in.
   */
  format?: 'plain' | 'html';
}

interface AIProfile {
  writing_style?: string;
  writing_tone?: string;
  coaching_style?: string;
  client_management_philosophy?: string;
  business_description?: string;
  target_audience?: string;
  unique_selling_proposition?: string;
  sales_framework?: string;
  sales_tactics?: string;
  marketing_strategy?: string;
  marketing_channels?: string;
  pipeline_priorities?: string[];
  asset_links?: AssetLink[];
  offer_ladder?: OfferLadder;
  writing_samples?: WritingSample[];
}

type SectionId =
  | 'voice'
  | 'samples'
  | 'business'
  | 'offers'
  | 'sales'
  | 'marketing'
  ;

const MAX_WRITING_SAMPLES = 12;

const SECTIONS: { id: SectionId; title: string; subtitle: string }[] = [
  { id: 'voice', title: 'Voice & Coaching', subtitle: 'How emails and copy should sound on your behalf' },
  {
    id: 'samples',
    title: 'Writing Samples',
    subtitle: 'Voice examples plus optional branded HTML for referral, upsell, and re-sign campaigns',
  },
  { id: 'business', title: 'Your Business', subtitle: 'Help the AI understand what you do' },
  { id: 'offers', title: 'Offers & Ladder', subtitle: 'Core offer, upsells and add-ons, and referral offer' },
  { id: 'sales', title: 'Sales', subtitle: 'Frameworks and tactics — also used to lens call analysis' },
  { id: 'marketing', title: 'Marketing', subtitle: 'How you attract and nurture prospects' },
];

const WRITING_STYLE_OPTIONS = [
  'Conversational & warm',
  'Professional & polished',
  'Direct & concise',
  'Storytelling & narrative',
  'Motivational & energizing',
  'Educational & informative',
];

const WRITING_TONE_OPTIONS = [
  'Friendly',
  'Authoritative',
  'Empathetic',
  'Casual',
  'Urgent',
  'Inspirational',
];

const COACHING_STYLE_OPTIONS = [
  'Accountability-driven',
  'Supportive & nurturing',
  'Data & results-focused',
  'Challenge-based / tough love',
  'Holistic / whole-person',
  'Systems & process-oriented',
];

const SALES_FRAMEWORK_OPTIONS = [
  'Consultative selling',
  'SPIN selling',
  'Challenger sale',
  'Value-based selling',
  'Relationship selling',
  'Social selling',
  'None / custom',
];

export default function IntelligencePanel({
  onOpenAutomations,
}: {
  onOpenAutomations?: () => void;
} = {}) {
  const { setLoading: setGlobalLoading } = useLoading();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('voice');
  const [profile, setProfile] = useState<AIProfile>({});
  const [dirty, setDirty] = useState(false);
  const [orgThemes, setOrgThemes] = useState<OrgSalesContentTheme[]>([]);
  const [orgThemesLoading, setOrgThemesLoading] = useState(false);
  const [orgThemesError, setOrgThemesError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const settings = await apiClient.getUserSettings();
      const saved = settings?.ai_profile;
      if (saved != null && typeof saved === 'object') {
        const next = saved as AIProfile;
        setProfile({
          ...next,
          ...(next.offer_ladder ? { offer_ladder: normalizeOfferLadder(next.offer_ladder) } : {}),
        });
        setDirty(false);
      } else {
        setProfile({});
        setDirty(false);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || (err as Error)?.message || 'Failed to load';
      setError(msg);
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  }, [setGlobalLoading]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Marketing Intel (content_studio tab) "Re-analyze" pulls Fathom + regenerates bundles; refresh profile and sales themes.
  useEffect(() => {
    const onContentStudioReanalyze = () => {
      void loadProfile();
      setOrgThemesLoading(true);
      setOrgThemesError(null);
      apiClient
        .getOrgSalesContentThemes()
        .then((res) => {
          setOrgThemes(Array.isArray(res?.themes) ? res.themes : []);
        })
        .catch((err: unknown) => {
          setOrgThemesError(
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
              (err as Error)?.message ||
              'Could not load themes'
          );
        })
        .finally(() => setOrgThemesLoading(false));
    };
    window.addEventListener('sweep:content-studio-reanalyzed', onContentStudioReanalyze);
    return () => window.removeEventListener('sweep:content-studio-reanalyzed', onContentStudioReanalyze);
  }, [loadProfile]);

  useEffect(() => {
    if (activeSection !== 'sales') return;
    let cancelled = false;
    setOrgThemesLoading(true);
    setOrgThemesError(null);
    apiClient
      .getOrgSalesContentThemes()
      .then((res) => {
        if (!cancelled) setOrgThemes(Array.isArray(res?.themes) ? res.themes : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOrgThemesError(
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
              (err as Error)?.message ||
              'Could not load themes'
          );
          setOrgThemes([]);
        }
      })
      .finally(() => {
        if (!cancelled) setOrgThemesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSection]);

  const update = <K extends keyof AIProfile>(key: K, value: AIProfile[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSaved(false);
      const profileToSave = profile.offer_ladder
        ? { ...profile, offer_ladder: normalizeOfferLadder(profile.offer_ladder) }
        : profile;
      await apiClient.updateUserSettings({ ai_profile: profileToSave as Record<string, unknown> });
      // Confirm round-trip: reload from server so the UI reflects exactly what was persisted
      try {
        const settings = await apiClient.getUserSettings();
        const persisted = settings?.ai_profile;
        if (persisted != null && typeof persisted === 'object') {
          const next = persisted as AIProfile;
          setProfile({
            ...next,
            ...(next.offer_ladder ? { offer_ladder: normalizeOfferLadder(next.offer_ladder) } : {}),
          });
        }
      } catch {
        // Reload failed — keep local state, which is already correct
      }
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || (err as Error)?.message || 'Save failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const addAssetLink = () => {
    const links = [...(profile.asset_links || []), { label: '', url: '' }];
    update('asset_links', links);
  };

  const updateAssetLink = (idx: number, field: 'label' | 'url', value: string) => {
    const links = [...(profile.asset_links || [])];
    links[idx] = { ...links[idx], [field]: value };
    update('asset_links', links);
  };

  const removeAssetLink = (idx: number) => {
    const links = (profile.asset_links || []).filter((_, i) => i !== idx);
    update('asset_links', links);
  };

  const addWritingSample = (kind: WritingSampleKind = 'email') => {
    const list = [...(profile.writing_samples || [])];
    if (list.length >= MAX_WRITING_SAMPLES) return;
    list.push({
      kind,
      title: '',
      body: '',
      html_template: '',
      // Default to plain text. HTML is always opt-in via the per-sample Format toggle.
      format: 'plain',
    });
    update('writing_samples', list);
  };

  const updateWritingSample = (idx: number, patch: Partial<WritingSample>) => {
    const list = [...(profile.writing_samples || [])];
    const cur = list[idx];
    if (!cur) return;
    list[idx] = { ...cur, ...patch };
    update('writing_samples', list);
  };

  const removeWritingSample = (idx: number) => {
    const list = (profile.writing_samples || []).filter((_, i) => i !== idx);
    update('writing_samples', list);
  };

  /** Back-fill `format` for existing samples (saved before the toggle existed). */
  const sampleFormat = (s: WritingSample): 'plain' | 'html' => {
    if (s.format === 'html' || s.format === 'plain') return s.format;
    if ((s.html_template || '').trim()) return 'html';
    return 'plain';
  };

  // ── Offer ladder helpers ──
  const updateLadder = (next: OfferLadder) => update('offer_ladder', { version: 1, ...next });

  const updateCoreOffer = (field: keyof OfferEntry, value: string) => {
    const ladder = profile.offer_ladder || {};
    const core = { ...(ladder.core_offer || {}), [field]: value };
    updateLadder({ ...ladder, core_offer: core });
  };

  const addLadderItem = (kind: 'upsells') => {
    const ladder = profile.offer_ladder || {};
    const items = [...(ladder[kind] || []), { name: '', promise: '' } as OfferEntry];
    updateLadder({ ...ladder, [kind]: items });
  };

  const updateLadderItem = (
    kind: 'upsells',
    idx: number,
    field: keyof OfferEntry,
    value: string | string[],
  ) => {
    const ladder = profile.offer_ladder || {};
    const items = [...(ladder[kind] || [])];
    items[idx] = { ...(items[idx] || {}), [field]: value };
    updateLadder({ ...ladder, [kind]: items });
  };

  const removeLadderItem = (kind: 'upsells', idx: number) => {
    const ladder = profile.offer_ladder || {};
    const items = (ladder[kind] || []).filter((_, i) => i !== idx);
    updateLadder({ ...ladder, [kind]: items });
  };

  const updateReferralOffer = (field: keyof ReferralOffer, value: string) => {
    const ladder = profile.offer_ladder || {};
    const referral = { ...(ladder.referral_offer || {}), [field]: value };
    updateLadder({ ...ladder, referral_offer: referral });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-3 text-gray-600 dark:text-gray-400">Loading your AI profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Intelligence</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Personalize how the AI writes, recommends, and advises. Everything here shapes email drafts, next-step suggestions, and coaching insights.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6 min-h-0 min-w-0">
        {/* Section sidebar */}
        <aside className="flex-shrink-0 w-full sm:w-56 lg:w-64">
          <nav className="glass-card p-2 space-y-0.5">
            {SECTIONS.map((s) => {
              const filled = (() => {
                switch (s.id) {
                  case 'voice': return !!(
                    profile.writing_style ||
                    profile.writing_tone ||
                    profile.coaching_style ||
                    profile.client_management_philosophy
                  );
                  case 'samples': return (profile.writing_samples || []).some(
                    (s) => (s.body || '').trim().length > 0 || (s.html_template || '').trim().length > 0
                  );
                  case 'business': return !!(profile.business_description || profile.target_audience || profile.unique_selling_proposition);
                  case 'offers': {
                    const l = profile.offer_ladder;
                    return !!(
                      l && (
                        (l.core_offer && (l.core_offer.name || l.core_offer.promise)) ||
                        (l.upsells || []).length > 0 ||
                        (l.referral_offer && (l.referral_offer.incentive || l.referral_offer.ask_script_hints))
                      )
                    );
                  }
                  case 'sales': return !!(profile.sales_framework || profile.sales_tactics);
                  case 'marketing': return !!(profile.marketing_strategy || profile.marketing_channels);
                  default: return false;
                }
              })();
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === s.id
                      ? 'bg-white/20 dark:bg-white/10 text-gray-900 dark:text-gray-100'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-white/10 hover:text-gray-900 dark:hover:text-gray-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{s.title}</span>
                    {filled && !dirty && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="Saved" />
                    )}
                  </span>
                  <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-500 mt-0.5">{s.subtitle}</span>
                </button>
              );
            })}
          </nav>

          {/* Email Playbooks deep-link — Intelligence configures voice/templates/offers; Automations is where they actually fire. */}
          <div className="mt-3 glass-card p-4">
            <div className="flex items-start gap-2">
              <span
                className="flex-shrink-0 w-8 h-8 rounded-md bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center justify-center"
                aria-hidden
              >
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Email Playbooks</p>
                <p className="mt-0.5 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                  Voice, samples, and offers here power your automated emails. Configure the
                  triggers and timing in Automations.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenAutomations) {
                      onOpenAutomations();
                    } else if (typeof window !== 'undefined') {
                      window.location.href = '/?tab=automations';
                    }
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-violet-700 dark:text-violet-300 hover:text-violet-900 dark:hover:text-violet-100"
                >
                  Open Automations
                  <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="glass-card p-6 space-y-6">

            {/* ── Voice & Coaching ── */}
            {activeSection === 'voice' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Voice & Coaching</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    The single source of truth for how the AI sounds when it writes on your behalf — emails,
                    follow-ups, nurture sequences, and coaching copy. Your coaching style here also
                    shapes how the AI frames advice and how it relates to your clients.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Writing style</label>
                  <div className="flex flex-wrap gap-2">
                    {WRITING_STYLE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => update('writing_style', opt)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          profile.writing_style === opt
                            ? 'border-violet-500 bg-violet-500/15 text-violet-800 dark:text-violet-200'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-violet-400 hover:text-violet-700 dark:hover:text-violet-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">Or describe your own:</p>
                  <input
                    type="text"
                    value={profile.writing_style && !WRITING_STYLE_OPTIONS.includes(profile.writing_style) ? profile.writing_style : ''}
                    onChange={(e) => update('writing_style', e.target.value)}
                    placeholder="e.g. Witty but professional, lots of short paragraphs"
                    className="mt-1 w-full max-w-lg px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Preferred tone</label>
                  <div className="flex flex-wrap gap-2">
                    {WRITING_TONE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => update('writing_tone', opt)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          profile.writing_tone === opt
                            ? 'border-violet-500 bg-violet-500/15 text-violet-800 dark:text-violet-200'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-violet-400 hover:text-violet-700 dark:hover:text-violet-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-white/10 pt-5 mt-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Coaching style
                  </label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    The relational backbone for everything the AI writes — advice framing, what you push on,
                    what you stay soft on.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {COACHING_STYLE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => update('coaching_style', opt)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          profile.coaching_style === opt
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={profile.coaching_style && !COACHING_STYLE_OPTIONS.includes(profile.coaching_style) ? profile.coaching_style : ''}
                    onChange={(e) => update('coaching_style', e.target.value)}
                    placeholder="Or describe your own approach..."
                    className="mt-2 w-full max-w-lg px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Client management philosophy
                  </label>
                  <textarea
                    value={profile.client_management_philosophy || ''}
                    onChange={(e) => update('client_management_philosophy', e.target.value)}
                    rows={3}
                    placeholder="e.g. I believe in radical honesty and meeting clients where they are. I never push a sale — I let results and relationships do the talking."
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Used as voice context for follow-ups and how recommendations get framed.
                  </p>
                </div>
              </>
            )}

            {/* ── Writing samples ── */}
            {activeSection === 'samples' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Writing samples</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Drop in real examples of how you communicate so the AI sounds like you. Each sample
                    can be plain text (the default) or a branded HTML template — choose per sample.
                    Onboarding, referral, upsell, and re-sign campaign samples are auto-picked by the
                    matching <Link className="underline" href="/?tab=automations">Automations</Link> playbooks.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {
                      (profile.writing_samples || []).filter(
                        (s) => (s.body || '').trim() || (s.html_template || '').trim()
                      ).length
                    }{' '}
                    / {MAX_WRITING_SAMPLES} samples filled in
                  </p>
                  <button
                    type="button"
                    onClick={() => addWritingSample('email')}
                    disabled={(profile.writing_samples || []).length >= MAX_WRITING_SAMPLES}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-800 dark:text-teal-200 hover:bg-teal-500/20 disabled:opacity-40"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add sample
                  </button>
                </div>

                <div className="space-y-4">
                  {(profile.writing_samples || []).map((sample, idx) => {
                    const campaign = isCampaignSampleKind(sample.kind || '');
                    const fmt = sampleFormat(sample);
                    const kindOpt = WRITING_SAMPLE_KIND_OPTIONS.find((o) => o.value === sample.kind);
                    return (
                    <div
                      key={idx}
                      className={`rounded-lg border p-4 space-y-3 ${
                        campaign
                          ? 'border-violet-500/30 bg-violet-500/[0.06]'
                          : 'border-teal-500/25 bg-teal-500/5'
                      }`}
                    >
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="flex-1 min-w-[16rem] space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <label className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Type
                            </label>
                            <select
                              value={sample.kind || 'email'}
                              onChange={(e) =>
                                updateWritingSample(idx, { kind: e.target.value as WritingSampleKind })
                              }
                              className="max-w-[min(100%,16rem)] px-2 py-1 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            >
                              {WRITING_SAMPLE_KIND_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {kindOpt?.description && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">{kindOpt.description}</p>
                          )}
                          <input
                            type="text"
                            value={sample.title || ''}
                            onChange={(e) => updateWritingSample(idx, { title: e.target.value })}
                            placeholder="Optional label (e.g. Post-payment welcome v2)"
                            className="w-full px-3 py-1.5 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>

                        {/* Format toggle — Plain text / HTML template — always user-controlled. */}
                        <div className="flex flex-col items-end gap-2">
                          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Format
                          </span>
                          <div
                            role="tablist"
                            aria-label="Sample format"
                            className="inline-flex rounded-lg border border-gray-300 dark:border-white/10 overflow-hidden text-xs"
                          >
                            <button
                              type="button"
                              role="tab"
                              aria-selected={fmt === 'plain'}
                              onClick={() => updateWritingSample(idx, { format: 'plain' })}
                              className={`px-3 py-1.5 font-medium transition-colors ${
                                fmt === 'plain'
                                  ? 'bg-teal-600 text-white'
                                  : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                              }`}
                            >
                              Plain text
                            </button>
                            <button
                              type="button"
                              role="tab"
                              aria-selected={fmt === 'html'}
                              onClick={() => updateWritingSample(idx, { format: 'html' })}
                              className={`px-3 py-1.5 font-medium border-l border-gray-300 dark:border-white/10 transition-colors ${
                                fmt === 'html'
                                  ? 'bg-violet-600 text-white'
                                  : 'bg-transparent text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
                              }`}
                            >
                              HTML template
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeWritingSample(idx)}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            title="Remove sample"
                            aria-label="Remove sample"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {fmt === 'html' ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
                              Branded HTML
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                updateWritingSample(idx, { html_template: DEFAULT_EMAIL_HTML_TEMPLATE })
                              }
                              className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline"
                            >
                              Load starter template
                            </button>
                          </div>
                          <textarea
                            value={sample.html_template || ''}
                            onChange={(e) => updateWritingSample(idx, { html_template: e.target.value })}
                            rows={12}
                            placeholder="Paste branded HTML, or click “Load starter template”. Use {{BODY_HTML}} where the message body should appear."
                            className="w-full px-3 py-2 glass-input rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
                          />
                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            Tokens supported:{' '}
                            <span className="font-mono">{"{{BODY_HTML}}"}</span>,{' '}
                            <span className="font-mono">{"{{SUBJECT}}"}</span>,{' '}
                            <span className="font-mono">{"{{SENDER_NAME}}"}</span>,{' '}
                            <span className="font-mono">{"{{SENDER_EMAIL}}"}</span>.
                          </p>
                          <details className="text-xs text-gray-600 dark:text-gray-400">
                            <summary className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">
                              Add a plain-text fallback (recommended)
                            </summary>
                            <textarea
                              value={sample.body || ''}
                              onChange={(e) => updateWritingSample(idx, { body: e.target.value })}
                              rows={5}
                              placeholder="Plain version used for inbox preview text and as a voice anchor for the AI."
                              className="mt-2 w-full px-3 py-2 glass-input rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                          </details>
                        </div>
                      ) : (
                        <div>
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1 block">
                            Plain text
                          </label>
                          <textarea
                            value={sample.body || ''}
                            onChange={(e) => updateWritingSample(idx, { body: e.target.value })}
                            rows={8}
                            placeholder={
                              sample.kind === 'message'
                                ? 'Paste a DM or text thread (you can redact names).'
                                : 'Paste the full email or the main paragraphs (redact names if you prefer).'
                            }
                            className="w-full px-3 py-2 glass-input rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>
                      )}
                    </div>
                    );
                  })}

                  {(profile.writing_samples || []).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      No samples yet. Click <strong>Add sample</strong>, then pick the type and format
                      inside the card. Even one strong example will sharpen drafts noticeably.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ── Business ── */}
            {activeSection === 'business' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Your Business</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Context about what you do so the AI can write relevant copy and suggest appropriate actions.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">What does your business do?</label>
                  <textarea
                    value={profile.business_description || ''}
                    onChange={(e) => update('business_description', e.target.value)}
                    rows={3}
                    placeholder="e.g. I run an online fitness coaching business specializing in postpartum recovery. I offer 12-week 1-on-1 programs and a group membership."
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Who is your ideal client?</label>
                  <textarea
                    value={profile.target_audience || ''}
                    onChange={(e) => update('target_audience', e.target.value)}
                    rows={2}
                    placeholder="e.g. New mothers 25–40, health-conscious, willing to invest in premium coaching. Usually found via Instagram or referrals."
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">What makes you different? (USP)</label>
                  <textarea
                    value={profile.unique_selling_proposition || ''}
                    onChange={(e) => update('unique_selling_proposition', e.target.value)}
                    rows={2}
                    placeholder="e.g. Medically-informed programming, direct access to me via Voxer, and a money-back guarantee if you don't see results in 8 weeks."
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}

            {/* ── Offers & Ladder ── */}
            {activeSection === 'offers' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Offers & Ladder</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Define your core offer plus any upsells, add-ons, and referral offer. Performance ROI rows
                    will prescribe the best fit when a client&apos;s buying signals match — and the AI will tailor
                    pitch language using each client&apos;s prospect voice profile.
                  </p>
                </div>

                {/* Core offer */}
                <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Core offer</h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      The flagship thing you sell. Used as the default prescription for active clients without a
                      stronger signal.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={profile.offer_ladder?.core_offer?.name || ''}
                      onChange={(e) => updateCoreOffer('name', e.target.value)}
                      placeholder="Name (e.g. Inner Circle 12-week 1:1)"
                      className="px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <input
                      type="text"
                      value={profile.offer_ladder?.core_offer?.price_terms || ''}
                      onChange={(e) => updateCoreOffer('price_terms', e.target.value)}
                      placeholder="Price / terms (e.g. $9k or 3x $3.5k)"
                      className="px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <textarea
                    value={profile.offer_ladder?.core_offer?.promise || ''}
                    onChange={(e) => updateCoreOffer('promise', e.target.value)}
                    rows={2}
                    placeholder="Promise / outcome (e.g. Add $10k MRR in 90 days with a single repeatable offer)"
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <textarea
                      value={profile.offer_ladder?.core_offer?.ideal_for || ''}
                      onChange={(e) => updateCoreOffer('ideal_for', e.target.value)}
                      rows={2}
                      placeholder="Ideal for (audience + their situation)"
                      className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <textarea
                      value={profile.offer_ladder?.core_offer?.not_for || ''}
                      onChange={(e) => updateCoreOffer('not_for', e.target.value)}
                      rows={2}
                      placeholder="Not for (who you'd turn away)"
                      className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                </div>

                {/* Upsells and add-ons */}
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Upsells and add-ons</h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Expansion and complementary offers matched to each client&apos;s goals and signals. Add the
                        triggers and guardrails that make each option the right fit.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addLadderItem('upsells')}
                      className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline whitespace-nowrap"
                    >
                      + Add upsell or add-on
                    </button>
                  </div>
                  {(profile.offer_ladder?.upsells || []).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      None yet. Add relevant next-step offers or complementary services.
                    </p>
                  )}
                  {(profile.offer_ladder?.upsells || []).map((u, idx) => (
                    <div key={idx} className="rounded-md border border-gray-200 dark:border-white/10 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          value={u.name || ''}
                          onChange={(e) => updateLadderItem('upsells', idx, 'name', e.target.value)}
                          placeholder="Name (e.g. Done-with-you sprint)"
                          className="flex-1 px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <input
                          type="text"
                          value={u.price_terms || ''}
                          onChange={(e) => updateLadderItem('upsells', idx, 'price_terms', e.target.value)}
                          placeholder="Price / terms"
                          className="w-40 px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => removeLadderItem('upsells', idx)}
                          className="mt-1 p-1.5 text-gray-400 hover:text-red-500"
                          title="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <textarea
                        value={u.promise || ''}
                        onChange={(e) => updateLadderItem('upsells', idx, 'promise', e.target.value)}
                        rows={2}
                        placeholder="Promise / outcome of this offer"
                        className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <input
                        type="text"
                        value={(u.triggers || []).join(', ')}
                        onChange={(e) =>
                          updateLadderItem(
                            'upsells',
                            idx,
                            'triggers',
                            e.target.value
                              .split(',')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          )
                        }
                        placeholder="Triggers (comma-separated, e.g. wants done-for-you, hit revenue ceiling, ready to hire)"
                        className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <textarea
                          value={u.ideal_for || ''}
                          onChange={(e) => updateLadderItem('upsells', idx, 'ideal_for', e.target.value)}
                          rows={2}
                          placeholder="Who it's for"
                          className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <textarea
                          value={u.contraindications || ''}
                          onChange={(e) => updateLadderItem('upsells', idx, 'contraindications', e.target.value)}
                          rows={2}
                          placeholder="Skip if (e.g. still pre-product, cashflow tight)"
                          className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Referral offer */}
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-4 space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Referral offer</h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Prescribed to active clients with a testimonial-class win or referral intent on their last call.
                    </p>
                  </div>
                  <input
                    type="text"
                    value={profile.offer_ladder?.referral_offer?.incentive || ''}
                    onChange={(e) => updateReferralOffer('incentive', e.target.value)}
                    placeholder="Incentive (e.g. 1 month free for both, $500 cash, lifetime upgrade)"
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <input
                    type="text"
                    value={profile.offer_ladder?.referral_offer?.eligibility || ''}
                    onChange={(e) => updateReferralOffer('eligibility', e.target.value)}
                    placeholder="Eligibility (e.g. active 60+ days, on a paying plan)"
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <textarea
                    value={profile.offer_ladder?.referral_offer?.ask_script_hints || ''}
                    onChange={(e) => updateReferralOffer('ask_script_hints', e.target.value)}
                    rows={3}
                    placeholder="Ask-script hints — how you'd phrase the referral request to feel natural for this client"
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </>
            )}

            {/* ── Sales ── */}
            {activeSection === 'sales' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Sales</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">The AI uses this to draft conversion-focused emails and suggest closing tactics that match your approach.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sales framework</label>
                  <div className="flex flex-wrap gap-2">
                    {SALES_FRAMEWORK_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => update('sales_framework', opt)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          profile.sales_framework === opt
                            ? 'border-amber-500 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-amber-400 hover:text-amber-700 dark:hover:text-amber-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Specific tactics or talk tracks</label>
                  <textarea
                    value={profile.sales_tactics || ''}
                    onChange={(e) => update('sales_tactics', e.target.value)}
                    rows={3}
                    placeholder="e.g. I always lead with a free audit call. My close rate is highest when I use a 'pain → vision → bridge' framework on the second call."
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="border-t border-gray-200 dark:border-white/10 pt-5 mt-2">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    Org-validated objection themes
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Recurring patterns across multiple clients. Email drafts use only these for org-wide objection framing;
                    single-call transcript tone still comes from each client.
                  </p>
                  {orgThemesLoading ? (
                    <p className="text-xs text-gray-500">Loading…</p>
                  ) : orgThemesError ? (
                    <p className="text-xs text-red-600 dark:text-red-300">{orgThemesError}</p>
                  ) : orgThemes.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      None yet. Themes appear after enough distinct clients share similar objections within the lookback window.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {orgThemes.map((t) => (
                        <li
                          key={t.theme_key}
                          className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white/40 dark:bg-gray-900/20 px-3 py-2 text-xs"
                        >
                          <div className="font-medium text-gray-800 dark:text-gray-200">
                            {t.label || t.theme_key}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                            {t.distinct_client_count} clients · {t.occurrence_count} insights
                          </div>
                          {(t.sample_quotes || []).length > 0 ? (
                            <p className="text-[10px] text-gray-600 dark:text-gray-300 mt-1 italic line-clamp-2">
                              &ldquo;{(t.sample_quotes || [])[0]}&rdquo;
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {/* ── Marketing ── */}
            {activeSection === 'marketing' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Marketing</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Helps the AI craft nurture sequences and suggest outreach that fits your brand and channels.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Marketing strategy overview</label>
                  <textarea
                    value={profile.marketing_strategy || ''}
                    onChange={(e) => update('marketing_strategy', e.target.value)}
                    rows={3}
                    placeholder="e.g. Content marketing via Instagram Reels + email nurture. I post 5x/week and run a weekly newsletter. My funnel is: IG → freebie opt-in → email sequence → sales call."
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Primary channels</label>
                  <textarea
                    value={profile.marketing_channels || ''}
                    onChange={(e) => update('marketing_channels', e.target.value)}
                    rows={2}
                    placeholder="e.g. Instagram, email (Brevo), TikTok, podcast guest appearances, Facebook group"
                    className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </>
            )}

            {/* Resource Library moved to the dedicated Resources tab */}

            {/* Save bar */}
            <div className="flex items-center gap-3 pt-4 border-t border-gray-200 dark:border-white/10">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !dirty}
                className="glass-button neon-glow px-5 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Profile'}
              </button>
              {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved</span>}
              {dirty && !saved && <span className="text-xs text-gray-400 dark:text-gray-500">Unsaved changes</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
