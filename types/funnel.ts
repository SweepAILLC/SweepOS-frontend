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

