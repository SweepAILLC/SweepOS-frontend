export interface ClientInsightSummary {
  headline?: string | null;
  tags: string[];
  last_call_at?: string | null;
  last_insight_at?: string | null;
}

export interface CallInsightPerCall {
  id: string;
  fathom_call_record_id: string;
  fathom_recording_id?: number | null;
  meeting_at?: string | null;
  status: string;
  computed_at?: string | null;
  insight: Record<string, unknown> | null;
  failure_reason?: string | null;
}

/** Calendar + sales pipeline from GET call-insights (drives lead tags). */
export interface LeadPipelineSnapshot {
  has_past_sales_call: boolean;
  last_sales_call?: {
    start_time?: string | null;
    sale_closed?: boolean | null;
    event_id?: string | null;
  } | null;
  open_sales_deal: boolean;
  has_upcoming_check_in: boolean;
  next_start_time_iso?: string | null;
  next_is_sales_call: boolean;
}

export interface CallInsightsRollup {
  /** Latest call-insight narrative: state, physical/emotional/psychographic, next conversation focus. */
  client_state_synthesis?: string;
  accumulated_priorities: string[];
  accumulated_call_suggestions: { title: string; detail: string; meeting_at?: string }[];
  accumulated_clips: Record<string, unknown>[];
  accumulated_wins: string[];
  accumulated_testimonial_stories: string[];
  /** Server-validated client-win quotes with timestamps (from roi_signals). */
  accumulated_roi_testimonials?: Record<string, unknown>[];
  latest_upsell_signal?: { rationale?: string; meeting_at?: string } | null;
  latest_referral_signal?: { rationale?: string; meeting_at?: string; variant?: string | null } | null;
  latest_revive_playbook?: {
    rationale?: string;
    offer_angles?: string[];
    outreach_hooks?: string[];
    meeting_at?: string;
  } | null;
  prospect_voice_profile: Record<string, unknown>;
  /** Sales-framework critique of the most recent sales-relevant call (when Intelligence sales fields are set). */
  latest_framework_review?: { summary?: string; meeting_at?: string } | null;
  /** Theme keys that met org-wide thresholds (for transparency). */
  org_validated_theme_keys?: string[];
}

export interface OfferSuggestion {
  /** Internal kind: core | upsell | referral (legacy records may contain downsell). */
  kind: string;
  /** Human label (e.g. "core offer", "upsell"). */
  kind_label: string;
  name: string;
  promise?: string;
  rationale?: string;
  script_hint?: string;
}

export interface ClientCallInsightsResponse {
  client_id: string;
  summary: ClientInsightSummary | null;
  insights: CallInsightPerCall[];
  rollup?: CallInsightsRollup | null;
  /** Persisted ROI gates (e.g. testimonial_trigger_at) from client.meta. */
  roi_state?: Record<string, unknown> | null;
  pipeline?: LeadPipelineSnapshot | null;
  /** Deterministic next-offer prescription drawn from the org's offer ladder. */
  offer_suggestion?: OfferSuggestion | null;
}

export interface CallInsightTagEntry {
  tags: string[];
  headline: string;
}
