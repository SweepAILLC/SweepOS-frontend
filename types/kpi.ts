/** KPI Command Center types — mirror backend/app/schemas/kpi.py */

export type KpiTier = 'strong' | 'okay' | 'weak';

export type KpiRelatedFeature = 'content_studio' | 'automations' | 'call_library';

export interface KpiDailyEntry {
  id: string;
  org_id: string;
  entry_date: string; // YYYY-MM-DD
  /** Set when this row is one rep's own entry rather than the org aggregate. */
  rep_user_id?: string | null;
  total_followers: number | null;
  new_followers: number | null;
  content_posted: boolean | null;
  /** UI label: Content Attracting ICP */
  best_content_type: string | null;
  inboxes_checked: number | null;
  outreach_sent: number | null;
  respondents: number | null;
  inbound_icp_leads: number | null;
  followups_sent: number | null;
  new_conversations: number | null;
  conversations_nurtured: number | null;
  /** UI label: Pitches */
  calls_pitched: number | null;
  inbound_bookings: number | null;
  outbound_bookings: number | null;
  calls_booked: number | null;
  /** Calls booked ON this day (by booking/creation date) — contrast with calls_booked, which counts by meeting date. */
  calls_booked_activity: number | null;
  calls_taken: number | null;
  offers_made: number | null;
  no_shows: number | null;
  closes: number | null;
  cash_collected: number | null;
  revenue: number | null;
  setter_context: string | null;
  created_at: string;
  updated_at: string;
  // Calculated
  outreach_reply_pct: number | null;
  convo_to_booking_pct: number | null;
  show_up_pct: number | null;
  closing_rate_pct: number | null;
  avg_order_value: number | null;
}

export type KpiManualField =
  | 'total_followers'
  | 'new_followers'
  | 'content_posted'
  | 'best_content_type'
  | 'inboxes_checked'
  | 'outreach_sent'
  | 'respondents'
  | 'inbound_icp_leads'
  | 'followups_sent'
  | 'new_conversations'
  | 'conversations_nurtured'
  | 'calls_pitched'
  | 'inbound_bookings'
  | 'outbound_bookings'
  | 'calls_booked'
  | 'calls_booked_activity'
  | 'calls_taken'
  | 'offers_made'
  | 'no_shows'
  | 'closes'
  | 'cash_collected'
  | 'revenue'
  | 'setter_context';

export type KpiCalculatedField =
  | 'outreach_reply_pct'
  | 'convo_to_booking_pct'
  | 'show_up_pct'
  | 'closing_rate_pct'
  | 'avg_order_value';

export interface KpiMonthlyRollup {
  period_label: string;
  period_start: string;
  period_end: string;
  days_with_data: number;
  new_followers: number;
  outreach_sent: number;
  respondents: number;
  inbound_icp_leads: number;
  followups_sent: number;
  new_conversations: number;
  conversations_nurtured: number;
  calls_pitched: number;
  inbound_bookings: number;
  outbound_bookings: number;
  calls_booked: number;
  calls_booked_activity: number;
  calls_taken: number;
  offers_made: number;
  no_shows: number;
  closes: number;
  cash_collected: number;
  revenue: number;
  content_posted_days: number;
  avg_outreach_reply_pct: number | null;
  avg_convo_to_booking_pct: number | null;
  avg_show_up_pct: number | null;
  avg_closing_rate_pct: number | null;
  outreach_reply_pct: number | null;
  convo_to_booking_pct: number | null;
  show_up_pct: number | null;
  closing_rate_pct: number | null;
  avg_order_value: number | null;
}

export interface MetricThreshold {
  strong_min: number;
  okay_min: number;
  okay_max?: number | null;
  unit: 'count' | 'percent';
}

export interface KpiBenchmarks {
  org_id: string;
  thresholds: Record<string, MetricThreshold>;
  content_type_tags: string[];
  updated_at?: string | null;
  entry_form_token?: string | null;
}

export interface KpiFlag {
  id: string;
  metric: string;
  stage: string;
  tier: KpiTier;
  message: string;
  comparison?: string | null;
  related_feature?: KpiRelatedFeature | null;
  severity: 'info' | 'watch' | 'critical';
  window_start?: string | null;
  window_end?: string | null;
}

export interface KpiFlagsResponse {
  flags: KpiFlag[];
  generated_at: string;
}

export interface KpiEntryLinkResponse {
  token: string;
  url: string;
}

export interface KpiAutopopulateStatusResponse {
  calendar_available: boolean;
  payments_available: boolean;
  autopopulated_columns: string[];
}

/** Partial payload for PUT /kpi/entries/{date} */
export type KpiEntryUpdatePayload = Partial<
  Record<KpiManualField, number | boolean | string | null>
>;

/** Compact cross-tab KPI insights — mirrors GET /kpi/snapshot */
export interface KpiSnapshotCard {
  key: string;
  label: string;
  value: number | null;
  kind: 'int' | 'pct' | 'currency';
  aggregation: 'sum' | 'avg' | 'ratio';
  tier: KpiTier | null;
}

export interface KpiSnapshotSeriesPoint {
  date: string;
  outreach_sent: number | null;
  total_conversations?: number | null;
  calls_booked: number | null;
  calls_taken: number | null;
  closes: number | null;
  cash_collected: number | null;
  revenue: number | null;
  show_up_pct: number | null;
  closing_rate_pct: number | null;
  convo_to_booking_pct: number | null;
  outreach_reply_pct: number | null;
}

export interface KpiSnapshotResponse {
  range_start: string;
  range_end: string;
  days: number;
  generated_at: string;
  days_with_data: number;
  cards: KpiSnapshotCard[];
  current_month: KpiMonthlyRollup | null;
  flags: KpiFlag[];
  flags_truncated: number;
  series: KpiSnapshotSeriesPoint[];
  calendar_available: boolean;
  payments_available: boolean;
}

/** One org member selectable as a rep (setter or closer) for attribution. */
export interface KpiRepOption {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
}

export interface KpiRepOptionsResponse {
  reps: KpiRepOption[];
}

/** One period's totals for one rep — mirrors backend KpiRepPerformanceMetrics. */
export interface KpiRepPerformanceMetrics {
  outreach_sent: number;
  calls_booked: number;
  calls_booked_activity: number;
  calls_taken: number;
  no_shows: number;
  closes: number;
  cash_collected_cents: number;
  show_up_pct: number | null;
  closing_rate_pct: number | null;
}

export type KpiRepPerformanceMetricKey = keyof KpiRepPerformanceMetrics;

export interface KpiRepPerformanceRow {
  rep_user_id: string;
  rep_name: string;
  rep_email: string | null;
  current: KpiRepPerformanceMetrics;
  previous: KpiRepPerformanceMetrics;
  /** Each metric's own best calendar month over the trailing lookback — not necessarily the same month for every metric. */
  personal_best: KpiRepPerformanceMetrics;
  personal_best_month: Record<string, string | null>;
}

export interface KpiRepPerformanceResponse {
  org_id: string;
  range_start: string;
  range_end: string;
  previous_range_start: string;
  previous_range_end: string;
  generated_at: string;
  reps: KpiRepPerformanceRow[];
}

/** Which clients' payments made up a day's cash_collected — mirrors GET /kpi/entries/{date}/revenue-contributors */
export interface KpiRevenueContributor {
  client_id: string | null;
  client_name: string;
  amount_cents: number;
  source: 'stripe' | 'whop' | 'manual';
  payment_id: string;
}

export interface KpiRevenueContributorsResponse {
  entry_date: string;
  total_cents: number;
  contributors: KpiRevenueContributor[];
}
