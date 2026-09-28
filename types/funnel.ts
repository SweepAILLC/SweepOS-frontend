export interface FunnelStep {
  id: string;
  org_id: string;
  funnel_id: string;
  step_order: number;
  event_name: string;
  label?: string;
  created_at: string;
  updated_at: string;
}

export interface Funnel {
  id: string;
  org_id: string;
  client_id?: string;
  name: string;
  slug?: string;
  domain?: string;
  env?: string;
  created_at: string;
  updated_at: string;
  steps?: FunnelStep[];
}

export interface FunnelWithSteps extends Funnel {
  steps: FunnelStep[];
}

export interface StepCount {
  step_order: number;
  label?: string;
  event_name: string;
  count: number;
  conversion_rate?: number; // Percentage from previous step
}

export interface FunnelHealth {
  funnel_id: string;
  last_event_at?: string;
  events_per_minute: number;
  error_count_last_24h: number;
  total_events: number;
}

export interface UTMSourceStats {
  source: string;
  count: number;  // Event count (kept for backward compatibility)
  unique_visitors: number;  // Unique visitor count
  conversions: number;
  revenue_cents: number;
}

export interface ReferrerStats {
  referrer: string;
  count: number;  // Event count (kept for backward compatibility)
  unique_visitors: number;  // Unique visitor count
  conversions: number;
  revenue_cents: number;
}

export interface FunnelAnalytics {
  funnel_id: string;
  range_days: number;
  step_counts: StepCount[];
  total_visitors: number;
  total_conversions: number;
  overall_conversion_rate: number;
  bookings: number;
  revenue_cents: number;
  top_utm_sources: UTMSourceStats[];
  top_referrers: ReferrerStats[];
}

export interface FunnelLeadListItem {
  id: string;
  client_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  instagram?: string | null;
  source?: string | null;
  funnel_step_reached?: string | null;
  lifecycle_state?: string | null;
  is_new_client?: boolean | null;
  captured_at?: string | null;
  answers?: Record<string, unknown>;
}

export interface FunnelLeadListResponse {
  funnel_id: string;
  total: number;
  leads: FunnelLeadListItem[];
}

export interface EventIn {
  funnel_id?: string;
  client_id?: string;
  event_name: string;
  visitor_id?: string;
  session_id?: string;
  metadata?: Record<string, any>;
  event_timestamp?: string;
  idempotency_key?: string;
}

export interface EventExplorerEvent {
  id: string;
  funnel_id?: string;
  client_id?: string;
  event_name: string;
  visitor_id?: string;
  session_id?: string;
  metadata?: Record<string, any>;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
  referrer?: string;
  occurred_at?: string;
  received_at?: string;
}


// ---------------------------------------------------------------------------
// Funnels dashboard + weekly ad spend (PRD phase 8) — GET /funnels/dashboard
// ---------------------------------------------------------------------------

export type FunnelTrackingStatus = 'live' | 'silent' | 'errors' | 'no_funnels';

export interface FunnelDashboardMoney {
  has_spend: boolean;
  spend_usd: number;
  paid_cash_usd: number;
  cpl_usd: number | null;
  cac_usd: number | null;
  roas: number | null;
  profit_usd: number | null;
}

export interface FunnelDashboardWeek {
  week_start: string;
  spend_usd: number;
  cash_usd: number;
  opt_ins: number;
  closed: number;
  cac_usd: number | null;
}

export interface FunnelDashboardSource {
  source: string;
  opt_ins: number;
  booked: number;
  closed: number;
  cash_usd: number;
}

export interface FunnelDashboardResponse {
  window_start: string;
  window_end: string;
  channel: 'all' | 'organic' | 'paid';
  funnel_id: string | null;
  tracking: { status: FunnelTrackingStatus; last_event_at: string | null; errors_24h: number };
  visitors: number | null;
  summary: import('@/types/kpi').KpiFunnelSummaryResponse;
  money: FunnelDashboardMoney | null;
  weekly: FunnelDashboardWeek[];
  sources: FunnelDashboardSource[];
  scorecard: FunnelScorecard;
}

/** Sheet-style scorecard grid: metrics x weeks, each vs the average complete week. */
export type FunnelScorecardGroup = 'ads' | 'funnel' | 'close' | 'economics';

export interface FunnelScorecardMetric {
  key: string;
  label: string;
  group: FunnelScorecardGroup;
  /** 'pct' values are fractions (0.25 = 25%). */
  format: 'int' | 'usd' | 'pct' | 'ratio';
  better: 'up' | 'down' | 'neutral';
  /** One per FunnelScorecard.weeks entry. */
  values: Array<number | null>;
  /** Average of the complete weeks' values. */
  benchmark: number | null;
}

export interface FunnelScorecardWeek {
  week_start: string;
  /** Current week: shown, but excluded from the benchmark and gets no arrow. */
  in_progress: boolean;
}

export interface FunnelScorecard {
  weeks: FunnelScorecardWeek[];
  benchmark_weeks: number;
  /** 'compare' = benchmark is the compare range's average week (date-range filter compare on). */
  benchmark_source?: 'range' | 'compare';
  metrics: FunnelScorecardMetric[];
}

export interface FunnelAdSpendRow {
  id: string;
  funnel_id: string | null;
  week_start: string;
  amount_usd: number;
  ads_deployed: number | null;
  angles_deployed: number | null;
}
