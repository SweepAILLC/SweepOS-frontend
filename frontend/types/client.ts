export interface Client {
  id: string;
  tenant_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  lifecycle_state: 'cold_lead' | 'warm_lead' | 'active' | 'offboarding' | 'dead';
  last_activity_at?: string;
  stripe_customer_id?: string;
  estimated_mrr: number;
  lifetime_revenue_cents?: number;
  notes?: string;
  meta?: Record<string, any>;
  // Program tracking fields
  program_start_date?: string;
  program_duration_days?: number;
  program_end_date?: string;
  program_progress_percent?: number;
  created_at: string;
  updated_at: string;
}

export interface ClientPayment {
  id: string;
  stripe_id: string;
  amount_cents: number;
  amount: number;
  currency: string;
  status: string;
  created_at: string | null;
  receipt_url: string | null;
  subscription_id: string | null;
}

export interface ClientPaymentsResponse {
  client_id: string;
  total_amount_paid_cents: number;
  total_amount_paid: number;
  payments: ClientPayment[];
}

