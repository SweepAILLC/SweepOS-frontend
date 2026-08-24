export type CloseSurveyPaymentSource = 'manual' | 'stripe' | 'whop' | 'none';
export type CloseSurveyDealOutcome = 'yes' | 'no' | 'no_show';

export interface CloseSurveyEntryLinkResponse {
  token: string;
  url: string;
}

export interface CloseSurveyClientOption {
  id: string;
  name: string;
  email?: string | null;
  lifecycle_state: string;
}

export interface CloseSurveyOfferOption {
  slot: string;
  label: string;
  suggested_total_cents?: number | null;
}

export interface CloseSurveyCloserOption {
  id: string;
  name: string;
  email?: string | null;
  role: string;
}

export interface CloseSurveyLeadSourceOption {
  key: string;
  label: string;
  funnel_id?: string | null;
}

export interface CloseSurveyMetaResponse {
  org_name: string;
  clients: CloseSurveyClientOption[];
  offers: CloseSurveyOfferOption[];
  closers: CloseSurveyCloserOption[];
  lead_sources: CloseSurveyLeadSourceOption[];
}

export interface CloseSurveySubmitPayload {
  client_id: string;
  closed: boolean;
  deal_outcome?: CloseSurveyDealOutcome;
  payment_source: CloseSurveyPaymentSource;
  cash_collected?: number | null;
  offer_slot?: string | null;
  offer_name?: string;
  contract_amount?: number | null;
  recording_url?: string;
  call_notes?: string;
  entry_date?: string;
  closer_user_id?: string | null;
  lead_source_key?: string | null;
}

export interface CloseSurveySubmitResponse {
  ok: boolean;
  client_id: string;
  closed: boolean;
  deal_outcome: CloseSurveyDealOutcome;
  payment_source: CloseSurveyPaymentSource;
  closer_user_id?: string | null;
  lead_source?: string | null;
  manual_payment_id?: string | null;
  lifecycle_state?: string | null;
  message: string;
  submitted_at: string;
}
