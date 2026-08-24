export interface Client {
  id: string;
  tenant_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  emails?: string[];
  phone?: string;
  instagram?: string;
  lifecycle_state: 'cold_lead' | 'nurturing' | 'qualified' | 'booked' | 'active' | 'offboarding' | 'dead';
  last_activity_at?: string;
  stripe_customer_id?: string;
  estimated_mrr: number;
  lifetime_revenue_cents?: number;
  notes?: string;
  /** Intelligence ladder slot + manual payment-plan tracking (from PATCH client). */
  offer_enrollment?: {
    slot: string;
    name_snapshot?: string | null;
    total_cents?: number;
    paid_cents?: number;
    currency?: string;
    notes?: string | null;
    balance_cents?: number;
  } | null;
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
  stripe_id: string | null;  // null for manual payments
  amount_cents: number;
  amount: number;
  currency: string;
  status: string;
  created_at: string | null;
  receipt_url: string | null;
  subscription_id: string | null;
  invoice_id?: string | null;
  type?: string | null;  // 'stripe_payment', 'treasury_transaction', 'manual_payment'
  description?: string | null;  // For manual payments
  payment_method?: string | null;  // For manual payments
}

export interface ClientPaymentsResponse {
  client_id: string;
  total_amount_paid_cents: number;
  total_amount_paid: number;
  payments: ClientPayment[];
}

/** Health score factor (AI-ready for future referral/testimonial/retention/upsell). */
export interface ClientHealthFactor {
  key: string;
  label: string;
  value?: number | null;
  raw?: Record<string, unknown> | null;
  unit?: string | null;
  description?: string | null;
}

export interface ClientHealthScoreResponse {
  client_id: string;
  score: number;
  grade: string;
  factors: ClientHealthFactor[];
  computed_at?: string | null;
  /** logic | ai — when AI overlay was used */
  source?: string | null;
  explanation?: string | null;
  source_reason?: string | null;
}

