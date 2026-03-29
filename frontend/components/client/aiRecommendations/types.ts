/** AI recommendation checklist (backend: lifecycle defaults today; call-insights later). */
export interface AIRecommendationAction {
  id: string;
  title: string;
  detail?: string | null;
  category?: string | null;
  priority: number;
  completed: boolean;
  completed_at?: string | null;
  /** When true, show “View draft” to open email composer with AI/template draft */
  supports_email_draft?: boolean;
}

export interface AIRecommendationEmailDraft {
  subject: string;
  body_plain: string;
  body_html: string;
  source: string;
}

export interface ClientAIRecommendationsResponse {
  client_id: string;
  headline?: string | null;
  actions: AIRecommendationAction[];
  updated_at?: string | null;
}
