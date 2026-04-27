'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient, type OrgSalesContentTheme } from '@/lib/api';
import { useLoading } from '@/contexts/LoadingContext';

interface AssetLink {
  label: string;
  url: string;
}

interface OfferEntry {
  name?: string;
  promise?: string;
  ideal_for?: string;
  not_for?: string;
  price_terms?: string;
  when_to_use?: string;
  triggers?: string[];
  contraindications?: string;
}

interface ReferralOffer {
  incentive?: string;
  eligibility?: string;
  ask_script_hints?: string;
}

interface ObjectionHandler {
  objection: string;
  response: string;
}

interface OfferLadder {
  version?: number;
  core_offer?: OfferEntry;
  downsells?: OfferEntry[];
  upsells?: OfferEntry[];
  referral_offer?: ReferralOffer;
  positioning_notes?: string[];
  objection_handlers?: ObjectionHandler[];
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
}

type SectionId =
  | 'priorities'
  | 'voice'
  | 'business'
  | 'offers'
  | 'sales'
  | 'marketing'
  | 'assets';

const SECTIONS: { id: SectionId; title: string; subtitle: string }[] = [
  { id: 'priorities', title: 'Pipeline Priorities', subtitle: 'What matters most right now?' },
  { id: 'voice', title: 'Voice & Coaching', subtitle: 'How emails and copy should sound on your behalf' },
  { id: 'business', title: 'Your Business', subtitle: 'Help the AI understand what you do' },
  { id: 'offers', title: 'Offers & Ladder', subtitle: 'Core offer, downsells, upsells, and referral offer' },
  { id: 'sales', title: 'Sales', subtitle: 'Frameworks and tactics — also used to lens call analysis' },
  { id: 'marketing', title: 'Marketing', subtitle: 'How you attract and nurture prospects' },
  { id: 'assets', title: 'Resource Library', subtitle: 'Links the AI can reference in drafts' },
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

const PIPELINE_PRIORITY_OPTIONS = [
  { id: 'testimonials', label: 'Testimonials & social proof', description: 'Surface asks for quotes, reviews, and case studies' },
  { id: 'revenue', label: 'Revenue growth', description: 'Upsells, cross-sells, and pricing conversations' },
  { id: 'retention', label: 'Retention & engagement', description: 'Keep active clients progressing and satisfied' },
  { id: 'conversion', label: 'Lead conversion', description: 'Move cold/warm leads toward a booked call or sale' },
  { id: 'referrals', label: 'Referrals', description: 'Generate word-of-mouth and warm introductions' },
  { id: 'win_back', label: 'Win-back & re-engagement', description: 'Revive dead leads and lapsed clients' },
  { id: 'onboarding', label: 'Smooth onboarding', description: 'Get new clients set up and feeling supported' },
  { id: 'content', label: 'Content & thought leadership', description: 'Gather stories and angles for your marketing' },
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

export default function IntelligencePanel() {
  const { setLoading: setGlobalLoading } = useLoading();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('priorities');
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
        setProfile(saved as AIProfile);
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
      await apiClient.updateUserSettings({ ai_profile: profile as Record<string, unknown> });
      // Confirm round-trip: reload from server so the UI reflects exactly what was persisted
      try {
        const settings = await apiClient.getUserSettings();
        const persisted = settings?.ai_profile;
        if (persisted != null && typeof persisted === 'object') {
          setProfile(persisted as AIProfile);
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

  const togglePriority = (id: string) => {
    const current = profile.pipeline_priorities || [];
    if (current.includes(id)) {
      update('pipeline_priorities', current.filter((p) => p !== id));
    } else {
      update('pipeline_priorities', [...current, id]);
    }
  };

  const movePriority = (id: string, dir: -1 | 1) => {
    const current = [...(profile.pipeline_priorities || [])];
    const idx = current.indexOf(id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= current.length) return;
    [current[idx], current[target]] = [current[target], current[idx]];
    update('pipeline_priorities', current);
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

  // ── Offer ladder helpers ──
  const updateLadder = (next: OfferLadder) => update('offer_ladder', { version: 1, ...next });

  const updateCoreOffer = (field: keyof OfferEntry, value: string) => {
    const ladder = profile.offer_ladder || {};
    const core = { ...(ladder.core_offer || {}), [field]: value };
    updateLadder({ ...ladder, core_offer: core });
  };

  const addLadderItem = (kind: 'downsells' | 'upsells') => {
    const ladder = profile.offer_ladder || {};
    const items = [...(ladder[kind] || []), { name: '', promise: '' } as OfferEntry];
    updateLadder({ ...ladder, [kind]: items });
  };

  const updateLadderItem = (
    kind: 'downsells' | 'upsells',
    idx: number,
    field: keyof OfferEntry,
    value: string | string[],
  ) => {
    const ladder = profile.offer_ladder || {};
    const items = [...(ladder[kind] || [])];
    items[idx] = { ...(items[idx] || {}), [field]: value };
    updateLadder({ ...ladder, [kind]: items });
  };

  const removeLadderItem = (kind: 'downsells' | 'upsells', idx: number) => {
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
                  case 'priorities': return (profile.pipeline_priorities || []).length > 0;
                  case 'voice': return !!(
                    profile.writing_style ||
                    profile.writing_tone ||
                    profile.coaching_style ||
                    profile.client_management_philosophy
                  );
                  case 'business': return !!(profile.business_description || profile.target_audience || profile.unique_selling_proposition);
                  case 'offers': {
                    const l = profile.offer_ladder;
                    return !!(
                      l && (
                        (l.core_offer && (l.core_offer.name || l.core_offer.promise)) ||
                        (l.upsells || []).length > 0 ||
                        (l.downsells || []).length > 0 ||
                        (l.referral_offer && (l.referral_offer.incentive || l.referral_offer.ask_script_hints))
                      )
                    );
                  }
                  case 'sales': return !!(profile.sales_framework || profile.sales_tactics);
                  case 'marketing': return !!(profile.marketing_strategy || profile.marketing_channels);
                  case 'assets': return (profile.asset_links || []).length > 0;
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
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="glass-card p-6 space-y-6">

            {/* ── Pipeline Priorities ── */}
            {activeSection === 'priorities' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Pipeline Priorities</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Select what matters most to your business right now. The AI will weight recommendations,
                    next steps, and email suggestions toward your top priorities — in the order you rank them.
                  </p>
                </div>

                <div className="space-y-2">
                  {/* Selected priorities — ordered, reorderable */}
                  {(profile.pipeline_priorities || []).length > 0 && (
                    <div className="space-y-1.5 mb-4">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Your priorities (drag to reorder)</p>
                      {(profile.pipeline_priorities || []).map((id, idx) => {
                        const opt = PIPELINE_PRIORITY_OPTIONS.find((o) => o.id === id);
                        if (!opt) return null;
                        return (
                          <div
                            key={id}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-violet-500/30 bg-violet-500/10"
                          >
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300 flex items-center justify-center text-xs font-bold">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{opt.label}</span>
                              <span className="block text-[11px] text-gray-500 dark:text-gray-400">{opt.description}</span>
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => movePriority(id, -1)}
                                disabled={idx === 0}
                                className="p-0.5 text-gray-400 hover:text-violet-600 disabled:opacity-30 disabled:cursor-default"
                                title="Move up"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => movePriority(id, 1)}
                                disabled={idx === (profile.pipeline_priorities || []).length - 1}
                                className="p-0.5 text-gray-400 hover:text-violet-600 disabled:opacity-30 disabled:cursor-default"
                                title="Move down"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() => togglePriority(id)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              title="Remove"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Unselected options */}
                  {PIPELINE_PRIORITY_OPTIONS.filter((o) => !(profile.pipeline_priorities || []).includes(o.id)).length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Available</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {PIPELINE_PRIORITY_OPTIONS.filter((o) => !(profile.pipeline_priorities || []).includes(o.id)).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => togglePriority(opt.id)}
                            className="text-left px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
                          >
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{opt.label}</span>
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400">{opt.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(profile.pipeline_priorities || []).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                      Click any option above to add it. The order you select them determines priority rank.
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ── Voice & Coaching ── */}
            {activeSection === 'voice' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Voice & Coaching</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    The single source of truth for how the AI sounds when it writes on your behalf — emails,
                    follow-ups, nurture sequences, and Performance prescriptions. Your coaching style here also
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
                    Define your core offer plus any downsells, upsells, and referral offer. Performance ROI rows
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

                {/* Upsells */}
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Upsells</h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Expansion offers prescribed when the system detects an upsell tag. Add the behavioral
                        triggers that make each upsell the right fit.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addLadderItem('upsells')}
                      className="text-xs text-emerald-700 dark:text-emerald-300 hover:underline whitespace-nowrap"
                    >
                      + Add upsell
                    </button>
                  </div>
                  {(profile.offer_ladder?.upsells || []).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      None yet. Add the next-step offers your best clients move into.
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
                        placeholder="Promise / outcome of this upsell"
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

                {/* Downsells */}
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Downsells</h4>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
                        Lighter alternatives prescribed for cold/warm leads who hesitate at the core offer.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addLadderItem('downsells')}
                      className="text-xs text-amber-700 dark:text-amber-300 hover:underline whitespace-nowrap"
                    >
                      + Add downsell
                    </button>
                  </div>
                  {(profile.offer_ladder?.downsells || []).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      None yet. A trial, mini-program, or low-ticket on-ramp works well here.
                    </p>
                  )}
                  {(profile.offer_ladder?.downsells || []).map((d, idx) => (
                    <div key={idx} className="rounded-md border border-gray-200 dark:border-white/10 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <input
                          type="text"
                          value={d.name || ''}
                          onChange={(e) => updateLadderItem('downsells', idx, 'name', e.target.value)}
                          placeholder="Name (e.g. 30-day starter)"
                          className="flex-1 px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <input
                          type="text"
                          value={d.price_terms || ''}
                          onChange={(e) => updateLadderItem('downsells', idx, 'price_terms', e.target.value)}
                          placeholder="Price / terms"
                          className="w-40 px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <button
                          type="button"
                          onClick={() => removeLadderItem('downsells', idx)}
                          className="mt-1 p-1.5 text-gray-400 hover:text-red-500"
                          title="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <textarea
                        value={d.promise || ''}
                        onChange={(e) => updateLadderItem('downsells', idx, 'promise', e.target.value)}
                        rows={2}
                        placeholder="Promise / outcome"
                        className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <textarea
                        value={d.when_to_use || ''}
                        onChange={(e) => updateLadderItem('downsells', idx, 'when_to_use', e.target.value)}
                        rows={2}
                        placeholder="When to use (e.g. price objection, not ready for full commitment)"
                        className="w-full px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
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

            {/* ── Assets ── */}
            {activeSection === 'assets' && (
              <>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Resource Library</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Links to sales pages, case studies, lead magnets, testimonials, pricing — anything the AI should reference when drafting emails or suggesting tactics.
                  </p>
                </div>

                <div className="space-y-3">
                  {(profile.asset_links || []).map((link, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={link.label}
                          onChange={(e) => updateAssetLink(idx, 'label', e.target.value)}
                          placeholder="Label (e.g. Sales page)"
                          className="px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        <input
                          type="url"
                          value={link.url}
                          onChange={(e) => updateAssetLink(idx, 'url', e.target.value)}
                          placeholder="https://..."
                          className="px-3 py-2 glass-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAssetLink(idx)}
                        className="mt-1 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        title="Remove"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addAssetLink}
                    className="inline-flex items-center gap-1.5 text-sm text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add link
                  </button>

                  {(profile.asset_links || []).length === 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      No resources yet. Add links to your sales page, testimonials page, lead magnet, pricing, or anything else the AI should be able to reference.
                    </p>
                  )}
                </div>
              </>
            )}

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
