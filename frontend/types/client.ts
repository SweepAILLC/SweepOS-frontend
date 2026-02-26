export interface Client {
  id: string;
  tenant_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  emails?: string[];
  phone?: string;
  instagram?: string;
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

