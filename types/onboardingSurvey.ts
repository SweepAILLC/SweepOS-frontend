export interface OnboardingSurveyEntryLinkResponse {
  token: string;
  url: string;
}

export interface OnboardingSurveyGalleryItem {
  id: string;
  permalink?: string | null;
  thumbnail_url?: string | null;
  caption_excerpt?: string | null;
}

export interface OnboardingSurveyMetaResponse {
  org_name: string;
  referral_source_options: string[];
  problem_to_solve_options: string[];
  conversion_trigger_options: string[];
  instagram_connected: boolean;
  instagram_gallery: OnboardingSurveyGalleryItem[];
}

export interface OnboardingSurveyOptionsResponse {
  referral_source_options: string[];
  problem_to_solve_options: string[];
  conversion_trigger_options: string[];
}

export type OnboardingSurveyOptionsUpdatePayload = OnboardingSurveyOptionsResponse;

export interface OnboardingSurveySubmitPayload {
  respondent_name: string;
  respondent_business_name?: string;
  referral_source?: string;
  started_following_date?: string;
  interest_spark?: string;
  content_contribution?: string;
  content_selected_ids?: string[];
  problem_to_solve?: string;
  offer_fit_reason?: string;
  investment_reason?: string;
  decision_speed_blocker?: string;
  commitment_score?: number | null;
  conversion_trigger?: string;
  referral_name?: string;
  referral_contact?: string;
}

export interface OnboardingSurveySubmitResponse {
  ok: boolean;
  submitted_at: string;
  message: string;
}

export interface OnboardingSurveySelectedContentItem {
  instagram_media_id: string;
  permalink?: string | null;
  thumbnail_url?: string | null;
}

export interface OnboardingSurveyResponseItem {
  respondent_name: string;
  respondent_business_name?: string | null;
  submitted_at: string;
  referral_source?: string | null;
  started_following_date?: string | null;
  interest_spark?: string | null;
  content_contribution?: string | null;
  content_selected: OnboardingSurveySelectedContentItem[];
  problem_to_solve?: string | null;
  offer_fit_reason?: string | null;
  investment_reason?: string | null;
  decision_speed_blocker?: string | null;
  commitment_score?: number | null;
  conversion_trigger?: string | null;
  referral_name?: string | null;
  referral_contact?: string | null;
}

export interface OnboardingSurveyTopSelectedItem {
  instagram_media_id: string;
  selection_count: number;
  permalink?: string | null;
  thumbnail_url?: string | null;
  caption?: string | null;
}

export interface OnboardingSurveyDashboardResponse {
  total_submitted: number;
  responses: OnboardingSurveyResponseItem[];
  top_selected_content: OnboardingSurveyTopSelectedItem[];
}
