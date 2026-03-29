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

export interface CallInsightsRollup {
  /** Latest call-insight narrative: state, physical/emotional/psychographic, next conversation focus. */
  client_state_synthesis?: string;
  accumulated_priorities: string[];
  accumulated_call_suggestions: { title: string; detail: string; meeting_at?: string }[];
  accumulated_clips: Record<string, unknown>[];
  accumulated_wins: string[];
  accumulated_testimonial_stories: string[];
  prospect_voice_profile: Record<string, unknown>;
  /** Theme keys that met org-wide thresholds (for transparency). */
  org_validated_theme_keys?: string[];
}

export interface ClientCallInsightsResponse {
  client_id: string;
  summary: ClientInsightSummary | null;
  insights: CallInsightPerCall[];
  rollup?: CallInsightsRollup | null;
}

export interface CallInsightTagEntry {
  tags: string[];
  headline: string;
}
