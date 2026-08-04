export type CloseSurveyPaymentSource = 'manual' | 'stripe' | 'whop' | 'none';

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

export interface CloseSurveyMetaResponse {
  org_name: string;
  clients: CloseSurveyClientOption[];
  offers: CloseSurveyOfferOption[];
}

export interface CloseSurveySubmitPayload {
  client_id: string;
  closed: boolean;
  payment_source: CloseSurveyPaymentSource;
  cash_collected?: number | null;
  offer_slot?: string | null;
  offer_name?: string;
  contract_amount?: number | null;
  recording_url?: string;
  call_notes?: string;
  entry_date?: string;
}

export interface CloseSurveySubmitResponse {
  ok: boolean;
  client_id: string;
  closed: boolean;
  payment_source: CloseSurveyPaymentSource;
  manual_payment_id?: string | null;
  lifecycle_state?: string | null;
  message: string;
  submitted_at: string;
}
