export interface BrevoStatus {
  connected: boolean;
  account_email?: string;
  account_name?: string;
  message?: string;
}

export interface Payment {
  id: string;
  amount_cents: number; // Amount in cents
  currency?: string;
  status: string;
  created_at: number; // Unix timestamp
  client_id?: string;
  client_name?: string;
  client_email?: string;
  subscription_id?: string;
  receipt_url?: string;
}

export interface Subscription {
  id: string;
  customer_id: string;
  status: string;
  current_period_end: number; // Unix timestamp
  current_period_start?: number; // Unix timestamp
  amount: number;
}

export interface StripeSummary {
  total_mrr: number;
  total_arr: number;
  mrr_change?: number;
  mrr_change_percent?: number;
  new_subscriptions?: number;
  churned_subscriptions?: number;
  failed_payments?: number;
  last_30_days_revenue: number;
  active_subscriptions: number;
  total_customers: number;
  average_client_ltv?: number;  // Average Lifetime Value (average total spend of all customers)
  payments: Payment[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  customers: Customer[];
}

export interface Invoice {
  id: string;
  amount: number;
  status: string;
  created_at: number;
  customer_id: string;
}

export interface Customer {
  id: string;
  email?: string;
  name?: string;
  created_at: number;
}

export interface RevenueTimelinePoint {
  date: string;
  revenue: number;
}

export interface RevenueTimeline {
  timeline: RevenueTimelinePoint[];
  total_revenue: number;
}

export interface ChurnMonthData {
  month: string;
  churn_rate: number;
  canceled: number;
  active: number;
}

export interface CohortMonthData {
  month: string;
  new_subscriptions: number;
  churned: number;
}

export interface ChurnData {
  churn_by_month: ChurnMonthData[];
  cohort_snapshot: CohortMonthData[];
}

export interface MRRTrendPoint {
  date: string;
  mrr: number;
  subscriptions_count: number;
}

export interface MRRTrend {
  trend_data: MRRTrendPoint[];
  current_mrr: number;
  previous_mrr: number;
  growth_percent: number;
}

export interface FailedPayment extends Payment {
  has_recovery_recommendation: boolean;
  recovery_recommendation_id?: string;
  attempt_count?: number;  // Number of failed attempts for this subscription/client
  first_attempt_at?: number;  // Unix timestamp of first failed attempt
  latest_attempt_at?: number;  // Unix timestamp of most recent failed attempt
}

