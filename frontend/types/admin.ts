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

export interface GlobalHealth {
  total_organizations: number;
  total_users: number;
  total_clients: number;
  total_funnels: number;
  total_events: number;
  total_payments: number;
  total_subscriptions: number;
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
}

