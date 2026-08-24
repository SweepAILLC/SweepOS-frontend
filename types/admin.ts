export interface Organization {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  user_count?: number;
  client_count?: number;
  funnel_count?: number;
  admin_email?: string;  // Only present when creating a new org
  admin_password?: string;  // Only present when creating a new org
}

export interface HealthTrendPeriod {
  period_label: string;
  period_start: string;
  period_end: string;
  show_up_rate_pct: number | null;
  close_rate_pct: number | null;
  stripe_revenue_usd: number;
  /** Monthly cash matching Finances "combined" (Stripe + Whop) when API provides it; charts prefer this over stripe-only. */
  combined_revenue_usd?: number | null;
  calls_booked_count: number;
  cumulative_total_clients: number;
  active_clients_cohort: number;
  /** When set by API, preferred over derived cumulative revenue ÷ roster for LTV charts. */
  avg_client_ltv_usd?: number | null;
}

export interface GlobalHealth {
  total_organizations: number;
  organizations_created_last_30_days: number;
  total_users: number;
  users_created_last_30_days: number;
  total_clients: number;
  clients_created_last_30_days: number;
  total_funnels: number;
  total_events: number;
  total_events_last_30_days: number;
  total_payments: number;
  total_subscriptions: number;
  active_subscriptions: number;
  total_mrr_usd: number;
  total_revenue_stripe_succeeded_usd: number;
  last_30_days_revenue_stripe_usd: number;
  /** Finances-style Stripe + Whop; falls back to Stripe-only in UI when absent. */
  last_30_days_combined_revenue_usd?: number;
  treasury_posted_last_30_days_usd: number;
  treasury_posted_all_time_usd: number;
  cash_collected_all_time_combined_usd: number;
  manual_cash_all_time_usd: number;
  total_processor_revenue_all_time_usd: number;
  funnel_first_step_views_all_time: number;
  funnel_first_step_views_last_30_days: number;
  unique_visitors_all_time: number;
  unique_visitors_last_30_days: number;
  orgs_with_stripe_connected: number;
  orgs_with_brevo_connected: number;
  pending_invitations: number;
  stripe_revenue_post_onboarding_usd: number;
  /** Cumulative combined (Finances) post-onboarding; UI prefers this over `stripe_revenue_post_onboarding_usd` when set. */
  combined_revenue_post_onboarding_usd?: number;
  invitation_emails_sent_last_30d: number;
  invitation_emails_sent_previous_30d: number;
  calls_booked_last_30d: number;
  calls_booked_previous_30d: number;
  lifecycle_active_clients_current: number;
  lifecycle_active_clients_previous_30d_cohort: number;
  show_up_rate_last_30d_pct: number | null;
  close_rate_last_30d_pct: number | null;
  health_trend_periods: HealthTrendPeriod[];
}

export interface GlobalSettings {
  sudo_admin_email: string;
  frontend_url: string;
  stripe_configured: boolean;
  brevo_configured: boolean;
}

export interface Invitation {
  id: string;
  org_id: string;
  invitee_email: string;
  invitation_type: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface OrganizationDashboardSummary {
  organization_id: string;
  organization_name: string;
  total_users: number;
  max_user_seats: number | null;
  total_clients: number;
  clients_by_status: Record<string, number>;
  total_funnels: number;
  active_funnels: number;
  total_events: number;
  total_visitors: number;
  total_mrr: number;
  total_arr: number;
  active_subscriptions: number;
  total_payments: number;
  last_30_days_revenue: number;
  brevo_connected: boolean;
  funnel_conversion_metrics: Array<{
    funnel_id: string;
    funnel_name: string;
    total_visitors: number;
    total_conversions: number;
    overall_conversion_rate: number;
    step_counts: Array<{
      step_order: number;
      label: string | null;
      event_name: string;
      count: number;
      conversion_rate: number | null;
    }>;
  }>;
  recent_funnels: Array<{
    id: string;
    name: string;
    domain: string | null;
    created_at: string | null;
  }>;
  organization_onboarded_at?: string | null;
  /** Finances combined (Stripe + Whop) since onboarding when API reports it. */
  finances_combined_since_onboarding_usd?: number;
  cash_collected_since_onboarding_usd?: number;
  cash_collected_all_time_usd?: number;
  manual_cash_all_time_usd?: number;
  total_processor_revenue_all_time_usd?: number;
  monthly_health_since_onboarding?: HealthTrendPeriod[];
}

