// Messaging Matrix (Content Engine). Mirrors backend app/services/messaging_matrix_service.py.

export type MessagingChannel = 'organic' | 'paid';

export type AwarenessStage = 'unaware' | 'problem_aware' | 'solution_aware' | 'product_aware' | 'most_aware';

export interface MessagingAngle {
  id: string;
  name: string;
  description: string | null;
  awareness_stage: AwarenessStage | null;
  persona: string | null;
  promise: string | null;
  hook_mechanic: string | null;
  organic_score: number | null;
  paid_score: number | null;
  overall_score: number | null;
  organic_samples: number;
  paid_samples: number;
  reasoning: string | null;
  status: 'active' | 'archived';
  scored_at: string | null;
}

export interface MessagingMatrixRefreshStatus {
  state: 'idle' | 'queued' | 'running' | 'done' | 'failed';
  started_at?: string;
  finished_at?: string;
  error?: string;
  stats?: Record<string, unknown>;
}

export interface MessagingMatrixResponse {
  angles: MessagingAngle[];
  total_angles: number;
  tagged_items: number;
  rejected_items: number;
  refresh: MessagingMatrixRefreshStatus;
  score_note: string;
}

export interface MessagingAngleSourceItem {
  source_type: 'instagram' | 'meta_ad';
  source_id: string;
  title: string;
  url: string | null;
  thumbnail_url: string | null;
  quote: string | null;
  item_score: number | null;
  metrics: Record<string, unknown>;
}

export interface MessagingAngleDraft {
  channel: MessagingChannel;
  hooks: string[];
  outline: string[];
  cta: string | null;
  evidence: string[];
  confidence: number;
  approved: boolean;
  created_at: string;
}

export interface MessagingAngleDetail extends MessagingAngle {
  sources: MessagingAngleSourceItem[];
  last_draft: MessagingAngleDraft | null;
}
