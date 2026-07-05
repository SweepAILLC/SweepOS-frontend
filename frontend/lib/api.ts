import axios, { AxiosInstance, AxiosError } from 'axios';
import Cookies from 'js-cookie';
import type { Client } from '@/types/client';
import {
  cache,
  CACHE_KEYS,
  TERMINAL_CACHE_TTL_MS,
  TERMINAL_SESSION_TTL_MS,
  TERMINAL_CLIENTS_UPDATED_EVENT,
  clearSessionCaches,
  clearCalendarIntegrationStatusCache,
  dispatchCalendarIntegrationChanged,
  invalidateCachesAfterManualPayment,
} from './cache';
import { dispatchOrgChanged, orgIdFromAccessToken } from './orgScope';
import { flushPipelinePersistence, trackPipelinePersistence } from './pipelinePersistence';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

/** Cache key for GET /clients — scoped by org so board/list never mixes tenants. */
function clientsListCacheKey(lifecycleState?: string): string {
  const org = orgIdFromAccessToken();
  return lifecycleState ? `${CACHE_KEYS.CLIENTS}_${lifecycleState}_${org}` : `${CACHE_KEYS.CLIENTS}_${org}`;
}

function invalidateClientsListCache(): void {
  cache.deleteByPrefix(CACHE_KEYS.CLIENTS);
}

/** Bust cached GET /clients (e.g. after create/update/delete). */
export function invalidateClientsListCachePublic(): void {
  invalidateClientsListCache();
}

/** Drop malformed cache rows so board effects never throw on undefined.id. */
function sanitizeClientsList(rows: unknown): Client[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (c): c is Client =>
      c != null && typeof c === 'object' && typeof (c as Client).id === 'string',
  );
}

/** Read cached terminal monthly trends without a network call. */
export function peekCachedTerminalMonthlyTrends(): import('@/types/admin').HealthTrendPeriod[] {
  const cached = cache.get<{ periods?: import('@/types/admin').HealthTrendPeriod[] }>(
    CACHE_KEYS.TERMINAL_MONTHLY_TRENDS
  );
  return Array.isArray(cached?.periods) ? cached.periods : [];
}

type TerminalMonthlyTrendsPayload = { periods: import('@/types/admin').HealthTrendPeriod[] };

let terminalMonthlyTrendsInflight: Promise<TerminalMonthlyTrendsPayload> | null = null;

/** Read cached client list without a network call (for instant pipeline paint). */
export function peekCachedClientsList(): Client[] | null {
  const cached = cache.get<unknown[]>(clientsListCacheKey());
  if (cached == null) return null;
  const clean = sanitizeClientsList(cached);
  return clean.length > 0 ? clean : null;
}

/** In-memory cache key for calendar status — must match JWT org or switching orgs shows the wrong connected state. */
function calComStatusCacheKey(): string {
  return `${CACHE_KEYS.CALCOM_STATUS}_${orgIdFromAccessToken()}`;
}

function calendlyStatusCacheKey(): string {
  return `${CACHE_KEYS.CALENDLY_STATUS}_${orgIdFromAccessToken()}`;
}

function isRetryable(err: unknown): boolean {
  if (!axios.isAxiosError(err)) return false;
  const ax = err as AxiosError;
  if (ax.code === 'ERR_CANCELED') return false;
  const s = ax.response?.status;
  if (s === 429 || s === 502 || s === 503 || s === 504) return true;
  if (!s && ax.code === 'ECONNABORTED') return true;
  // No HTTP response: browser "Network Error", connection reset, refused, etc. — often transient.
  if (!s) {
    const transient = new Set(['ERR_NETWORK', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT']);
    if (ax.code && transient.has(ax.code)) return true;
    if (ax.message === 'Network Error') return true;
  }
  return false;
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2, delayMs = 1500): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i < maxAttempts - 1 && isRetryable(err)) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('withRetry: unreachable');
}

export interface FathomStatusResponse {
  configured: boolean;
  webhook_active: boolean;
  webhook_url?: string | null;
  total_calls: number;
  latest_call_at?: string | null;
}

/** Response from POST /integrations/fathom/sync */
export interface FathomSyncResponse {
  skipped?: boolean;
  reason?: string;
  started?: boolean;
  background?: boolean;
  message?: string;
  ingested?: number;
  processed?: number;
  meetings_seen?: number;
  ingested_unlinked?: number;
  relinked_to_clients?: number;
  ingest_errors?: number;
  skipped_no_client_match?: number;
  call_insights_queued?: number;
  pending_insight_record_ids?: string[];
}

/** GET /auth/me/sales-content-themes — org-wide recurring objection/circumstance themes. */
export interface OrgSalesContentTheme {
  theme_key: string;
  label: string;
  distinct_client_count: number;
  occurrence_count: number;
  sample_quotes: string[];
}

/** Performance tab — matches backend `PerformanceSnapshotResponse` / task rows. */
export interface PerformanceTask {
  id: string;
  title: string;
  category: string;
  impact_score: number;
  confidence?: number;
  evidence: Record<string, unknown>;
  recommended_actions: string[];
  why: string;
  prescription: string;
  next_step: string;
  completed: boolean;
}

export interface PerformanceSnapshot {
  generated_at: string;
  pipeline: Record<string, unknown>;
  revenue: Record<string, unknown>;
  failed_payments: Record<string, unknown>;
  funnels: unknown[];
  diagnosis: {
    traffic: string;
    nurture: string;
    conversion: string;
    traffic_hint?: string;
    nurture_hint?: string;
    conversion_hint?: string;
    pipeline_strip?: {
      segments: Array<{ id: string; title: string; count: number }>;
      total_clients: number;
    };
    revenue_compare?: {
      cash_last_30_days?: number;
      cash_prior_30_days?: number;
      pct_change_30d?: number | null;
      cash_mtd?: number;
      cash_mtd_prev_month_same_range?: number;
      pct_change_mtd?: number | null;
      mrr?: number;
    };
    funnel_compare?: {
      visitors_last_30?: number;
      visitors_prior_30?: number;
      conversions_last_30?: number;
      conversions_prior_30?: number;
      conversion_rate_last_30?: number;
      conversion_rate_prior_30?: number;
      pct_change_visitors?: number | null;
      pct_change_conversions?: number | null;
    };
    insights?: string[];
  };
  tasks: PerformanceTask[];
  /** Intelligence tab pipeline_priorities order — used server-side to rank ROI + org tasks. */
  pipeline_priorities?: string[];
  /** Persisted email drafts for Performance tasks (one per task id). */
  drafts?: PerformanceTaskEmailDraft[];
}

/** Persisted send-ready email draft auto-generated for a Performance task. */
export interface PerformanceTaskEmailDraft {
  task_id: string;
  subject: string;
  body_plain: string;
  body_html: string;
  source: string;
  generated_at: string;
  client_id?: string | null;
  client_email?: string | null;
  skipped_reason?: string | null;
}

export interface PerformanceEmailDraftsResponse {
  drafts: PerformanceTaskEmailDraft[];
  skipped: string[];
  source: string;
}

/**
 * Marketing Intel tab (content_studio) — matches backend content_studio schemas (v3 bundle).
 * v3 replaces the legacy 4-section + voice_marketing shape with a TOF/MOF/BOF concept generator
 * grounded purely in Fathom data + ICP from Intelligence.
 */
export type ContentStudioStageId = 'TOF' | 'MOF' | 'BOF';

export interface ContentStudioStageConcept {
  id: string;
  format: 'long' | 'short';
  title: string;
  bullets: string[];
  why_for_icp: string;
  funnel_path_to_sale: string;
}

export interface ContentStudioStage {
  id: ContentStudioStageId;
  title: string;
  intro: string;
  concepts: ContentStudioStageConcept[];
}

export interface ContentStudioBundle {
  version: number;
  signals_fingerprint: string;
  batch_id: string;
  generated_at?: string | null;
  source: 'llm' | 'default' | 'fathom';
  stages: ContentStudioStage[];
}

export interface ContentStudioBootstrap {
  knowledge: { objections: string[]; closing: string[]; reframes: string[] };
  sales_playbook: {
    source: 'fathom' | 'default';
    paragraphs: string[];
  };
  content_bundle: ContentStudioBundle | null;
  completed_idea_ids: string[];
  batch_id: string | null;
}

/** GET /call-library — Fathom call coaching reports */
export interface CallLibraryAttendee {
  email?: string;
  name?: string | null;
  source?: string;
  is_team_member?: boolean;
}

export type CallLibraryDealBilling =
  | 'one_time'
  | 'recurring_monthly'
  | 'recurring_annual'
  | null;

export interface CallLibraryItem {
  id: string;
  fathom_recording_id: number | null;
  call_title: string;
  meeting_at: string | null;
  status: string;
  failure_reason?: string | null;
  client_name: string | null;
  call_score: number | null;
  /** True only when the LLM is confident the sale was closed on this call. */
  deal_closed?: boolean;
  /** Closed deal value in minor units (cents). null if no figure was stated. */
  deal_value_cents?: number | null;
  deal_currency?: string | null;
  deal_billing?: CallLibraryDealBilling;
  recording_url: string | null;
  share_url?: string | null;
  video_url?: string | null;
  attendees: CallLibraryAttendee[] | null;
  report: Record<string, unknown> | null;
  computed_at: string | null;
}

export interface CallLibraryListResponse {
  items: CallLibraryItem[];
  total: number;
}

/** Row from GET /integrations/calendar/synced-bookings (DB-backed check-ins). */
export interface CalendarSyncedBookingRow {
  id: string;
  provider: 'calcom' | 'calendly';
  event_id: string;
  event_uri: string | null;
  client_id: string;
  client_name: string | null;
  title: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  meeting_url: string | null;
  attendee_email: string;
  attendee_name: string | null;
  completed: boolean;
  cancelled: boolean;
  no_show: boolean;
  is_sales_call: boolean;
  sale_closed: boolean | null;
  display_status: string;
  calcom_uid: string | null;
}

/** Row from GET /integrations/calendar/trend-summary (scoped DB aggregates). */
export interface CalendarTrendSummary {
  upcoming_count: number;
  past_count: number;
  close_rate_pct: number | null;
  sales_calls_in_range: number;
  closed_sales_count: number;
  show_up_rate_pct: number | null;
  attendance_eligible_past: number;
  showed_up_count: number;
}

/** Matches backend `client_health_score._grade_from_score` for batch responses missing `grade`. */
export function gradeFromHealthScore(score: number): string {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

// For cross-origin (e.g. frontend on Vercel, API on Render): set to 'none' so cookies are sent
const COOKIE_SAME_SITE = (process.env.NEXT_PUBLIC_COOKIE_SAME_SITE as 'lax' | 'strict' | 'none') || 'lax';

/** Extract FastAPI `detail` from an Axios error for auth-vs-integration classification. */
function httpErrorDetail(error: AxiosError): string {
  const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => (typeof e === 'object' && e && 'msg' in e ? String((e as { msg: string }).msg) : JSON.stringify(e))).join(', ');
  }
  if (detail != null) return JSON.stringify(detail);
  return '';
}

/** True when a 401/403 reflects an invalid Sweep JWT / org access — not a third-party integration. */
export function isSweepSessionAuthFailure(error: AxiosError): boolean {
  const status = error.response?.status;
  if (status !== 401 && status !== 403) return false;

  const requestUrl = String(error.config?.url ?? error.config?.baseURL ?? '');

  if (
    requestUrl.includes('stripe/connect-direct') ||
    requestUrl.includes('brevo/connect-direct') ||
    requestUrl.includes('calcom/connect-direct') ||
    requestUrl.includes('calendly/connect-direct')
  ) {
    return false;
  }

  const detail = httpErrorDetail(error).toLowerCase();

  // Integration routes proxy Cal.com/Stripe/etc.; upstream 401/403 must not clear the session.
  if (requestUrl.includes('/integrations/')) {
    return (
      detail.includes('invalid authentication') ||
      detail.includes('user not found') ||
      detail.includes('does not have access to this organization') ||
      detail === 'not authenticated'
    );
  }

  if (status === 401) return true;

  return (
    detail.includes('invalid authentication') ||
    detail.includes('user not found') ||
    detail.includes('does not have access to this organization') ||
    detail === 'not authenticated' ||
    detail.includes('credentials')
  );
}

// ----- Automation engine types ------------------------------------------------
export type AutomationPlaybook =
  | 'pre_sale_post_booking'
  | 'first_payment_onboarding'
  | 'first_payment_referral'
  | 'win_combined_ask'
  | 'offboarding_recap_ask';

export type AutomationContentMode = 'ai_generated' | 'html_template';

export type AutomationJobState =
  | 'scheduled'
  | 'awaiting_approval'
  | 'ready'
  | 'sending'
  | 'sent'
  | 'skipped'
  | 'failed'
  | 'canceled';

export interface AutomationHtmlTemplateRef {
  kind: 'writing_samples_by_title' | 'writing_samples_by_kind';
  title?: string | null;
  sample_kind?: string | null;
}

export interface AutomationAudienceFilter {
  lifecycle_in?: string[] | null;
  min_lifetime_revenue_cents?: number | null;
  program_progress_min_percent?: number | null;
  program_progress_max_percent?: number | null;
}

/** Per-rule trigger options. Today only the pre_sale_post_booking playbook reads this;
 *  shape mirrors backend BookingTriggerConfig. event_type_ids hold provider-native ids
 *  (Cal.com eventType.id as string, Calendly event_type URI). */
export interface AutomationTriggerConfig {
  provider?: 'calcom' | 'calendly' | 'any' | null;
  event_type_ids?: string[] | null;
  match_all_events?: boolean | null;
}

export interface AutomationRule {
  id: string;
  org_id: string;
  playbook: AutomationPlaybook;
  enabled: boolean;
  delay_seconds: number;
  content_mode: AutomationContentMode;
  subject_template?: string | null;
  html_template_ref?: AutomationHtmlTemplateRef | null;
  /** When content_mode is ai_generated — extra instructions merged into the LLM system prompt. */
  ai_content_system_prompt?: string | null;
  audience_filter?: AutomationAudienceFilter | null;
  trigger_config?: AutomationTriggerConfig | null;
  opportunity_priority?: string[] | null;
  combine_top_n: number;
  require_approval: boolean;
  approval_ttl_hours?: number | null;
  last_modified_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationRuleUpdate {
  enabled: boolean;
  delay_seconds: number;
  content_mode: AutomationContentMode;
  subject_template?: string | null;
  html_template_ref?: AutomationHtmlTemplateRef | null;
  ai_content_system_prompt?: string | null;
  audience_filter?: AutomationAudienceFilter | null;
  trigger_config?: AutomationTriggerConfig | null;
  opportunity_priority?: string[] | null;
  combine_top_n: number;
  require_approval: boolean;
  approval_ttl_hours?: number | null;
}

export interface AutomationEmailJob {
  id: string;
  org_id: string;
  rule_id?: string | null;
  client_id: string;
  playbook: AutomationPlaybook;
  trigger_event?: string | null;
  idempotency_key: string;
  scheduled_at: string;
  state: AutomationJobState;
  payload_json?: Record<string, unknown> | null;
  attempts: number;
  last_attempt_at?: string | null;
  dispatched_at?: string | null;
  brevo_message_id?: string | null;
  error_text?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationEmailJobListResponse {
  items: AutomationEmailJob[];
  total: number;
}

export interface AutomationDispatcherHealth {
  healthy: boolean;
  last_tick_at?: string | null;
  seconds_since_tick?: number | null;
  worker_pid?: number | null;
  worker_host?: string | null;
  queue_depth: number;
  in_flight: number;
  awaiting_approval: number;
  rq_enabled: boolean;
  notes?: string | null;
}

export interface AutomationPreviewRequest {
  playbook: AutomationPlaybook;
  client_id: string;
  content_mode?: AutomationContentMode;
  subject_template?: string | null;
  html_template_ref?: AutomationHtmlTemplateRef | null;
  ai_content_system_prompt?: string | null;
}

export interface AutomationPreviewResponse {
  subject: string;
  body_plain: string;
  html: string;
  chosen_opportunities: string[];
  merge_tags_resolved: Record<string, string>;
  notes: string[];
}

export interface OutreachInboxItem {
  id: string;
  source: 'performance_task' | 'automation_job';
  client_id?: string | null;
  client_name?: string | null;
  playbook?: AutomationPlaybook | null;
  title: string;
  summary?: string | null;
  state?: AutomationJobState | null;
  scheduled_at?: string | null;
  created_at: string;
  requires_approval: boolean;
  /** Performance-task detail (null for automation jobs). */
  category?: string | null;
  prescription?: string | null;
  next_step?: string | null;
  recommended_actions?: string[] | null;
  impact_score?: number | null;
  has_email_draft?: boolean | null;
}

export interface OutreachInboxResponse {
  items: OutreachInboxItem[];
  awaiting_approval_count: number;
  performance_task_count: number;
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 20000, // 20 second timeout to prevent hanging on heavy dashboards
    });

    // Add request interceptor to attach JWT token
    this.client.interceptors.request.use((config) => {
      const token = Cookies.get('access_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Add response interceptor to handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (isSweepSessionAuthFailure(error)) {
          clearSessionCaches();
          Cookies.remove('access_token');

          if (typeof window !== 'undefined') {
            const currentPath = window.location.pathname;
            if (currentPath !== '/login' && currentPath !== '/select-organization') {
              setTimeout(() => {
                window.location.href = '/login';
              }, 0);
              return Promise.resolve({
                data: null,
                status: error.response?.status ?? 401,
                statusText: 'Unauthorized',
                headers: {},
                config: error.config,
              });
            }
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(email: string, password: string, orgId?: string) {
    const payload: any = { email, password };
    if (orgId) {
      payload.org_id = orgId;
    }
    // Login can fail under transient load (DB pressure, cold starts, etc.)
    // Wrap in withRetry so ECONNABORTED / 5xx / 429 are retried once before surfacing to the user.
    const response = await withRetry(() =>
      this.client.post('/auth/login', payload)
    );
    if (response.data.access_token) {
      // Set cookie with proper settings for cross-origin requests
      Cookies.set('access_token', response.data.access_token, { 
        expires: 1, // 1 day
        sameSite: COOKIE_SAME_SITE,
        secure: window.location.protocol === 'https:', // Required when sameSite is 'none'
        path: '/'
      });
      
      // Verify cookie was set (for debugging)
      const cookieValue = Cookies.get('access_token');
      if (!cookieValue) {
        console.warn('Warning: Cookie was not set after login. This may cause authentication issues.');
      }
    }
    return response.data;
  }

  async getUserOrganizations(email: string) {
    return withRetry(async () => {
      const response = await this.client.get('/auth/organizations', {
        params: { email }
      });
      return response.data;
    });
  }

  async switchOrganization(orgId: string) {
    await flushPipelinePersistence();
    const data = await withRetry(async () => {
      const response = await this.client.post('/auth/switch-organization', { org_id: orgId });
      return response.data;
    });
    if (data.access_token) {
      Cookies.set('access_token', data.access_token, {
        expires: 1,
        sameSite: COOKIE_SAME_SITE,
        secure: window.location.protocol === 'https:',
        path: '/',
      });
      clearCalendarIntegrationStatusCache();
      clearSessionCaches();
      dispatchOrgChanged(orgId);
    }
    return data;
  }

  async getCurrentUser() {
    return withRetry(async () => {
      const response = await this.client.get('/auth/me');
      return response.data;
    });
  }

  /** Refresh session (sliding window). Call when same tab is active to avoid re-login. */
  async refreshSession(): Promise<{ access_token?: string } | null> {
    const data = await withRetry(async () => {
      const response = await this.client.post<{ access_token: string; token_type: string }>('/auth/refresh');
      return response.data;
    });
    if (data?.access_token) {
      Cookies.set('access_token', data.access_token, {
        expires: 1,
        sameSite: COOKIE_SAME_SITE,
        secure: typeof window !== 'undefined' && window.location.protocol === 'https:',
        path: '/',
      });
      return { access_token: data.access_token };
    }
    return null;
  }

  // Invitation acceptance (public; no auth required for validate)
  async validateInviteToken(token: string) {
    const response = await this.client.get('/auth/invite/validate', { params: { token } });
    return response.data;
  }

  async acceptInvite(body: { token: string; password?: string }) {
    const response = await this.client.post('/auth/invite/accept', body);
    return response.data;
  }

  // User Settings
  async getUserSettings() {
    const response = await this.client.get('/auth/me/settings');
    return response.data;
  }

  async updateUserSettings(data: {
    email?: string;
    current_password?: string;
    new_password?: string;
    data_sharing_enabled?: boolean;
    analytics_enabled?: boolean;
    fathom_api_key?: string;
    ai_profile?: Record<string, unknown>;
  }) {
    const response = await this.client.put('/auth/me/settings', data);
    return response.data;
  }

  // Clients (cached for terminal dashboard to avoid 4x duplicate requests)
  async getClients(lifecycleState?: string, forceRefresh?: boolean) {
    const cacheKey = clientsListCacheKey(lifecycleState);
    if (!forceRefresh && !lifecycleState) {
      const cached = cache.get<unknown[]>(cacheKey);
      if (cached != null) return sanitizeClientsList(cached);
    }
    const params: any = lifecycleState ? { lifecycle_state: lifecycleState } : {};
    // Cap client list size for performance; backend also enforces an upper bound
    params.limit = 200;
    const data = await withRetry(
      async () => {
        const response = await this.client.get('/clients', { params });
        return response.data;
      },
      3,
      1000
    );
    const clean = sanitizeClientsList(data);
    if (!lifecycleState) cache.set(cacheKey, clean, TERMINAL_CACHE_TTL_MS);
    return clean;
  }

  async getClient(id: string) {
    const response = await this.client.get(`/clients/${id}`);
    return response.data;
  }

  /** Precomputed terminal dashboard: cash collected, MRR, top contributors (30d/90d). Cached for session (24h) until invalidated by sync/payment/connect. */
  async getTerminalSummary(forceRefresh?: boolean) {
    if (!forceRefresh) {
      const cached = cache.get<unknown>(CACHE_KEYS.TERMINAL_SUMMARY);
      if (cached != null) return cached;
    }
    try {
      const response = await this.client.get('/clients/terminal-summary');
      const data = response.data;
      cache.set(CACHE_KEYS.TERMINAL_SUMMARY, data, TERMINAL_SESSION_TTL_MS);
      return data;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 500 || status === 503) {
        console.warn('[terminal-summary] backend unavailable, using empty fallback', status);
        return ApiClient.emptyTerminalSummary();
      }
      throw err;
    }
  }

  /** Safe fallback when GET /clients/terminal-summary fails (keeps Terminal tab usable). */
  static emptyTerminalSummary() {
    const zeroSource = { today: 0, last_7_days: 0, last_30_days: 0, last_mtd: 0 };
    return {
      cash_collected: { today: 0, last_7_days: 0, last_30_days: 0, last_mtd: 0 },
      mrr: { current_mrr: 0, arr: 0 },
      top_contributors_30d: [],
      top_contributors_90d: [],
      cash_by_source: { stripe: zeroSource, whop: zeroSource, manual: zeroSource },
    };
  }

  async createClient(data: any) {
    const response = await this.client.post('/clients', data);
    const created = response.data as Client | undefined;
    const cacheKey = clientsListCacheKey();
    const cached = cache.get<unknown[]>(cacheKey);
    if (cached != null && created?.id) {
      cache.set(cacheKey, [created, ...sanitizeClientsList(cached)], TERMINAL_CACHE_TTL_MS);
    } else {
      invalidateClientsListCache();
    }
    return response.data;
  }

  async updateClient(id: string, data: any) {
    const cacheKey = clientsListCacheKey();
    const cached = cache.get<unknown[]>(cacheKey);
    let rollbackList: Client[] | null = null;
    const touchesLifecycle =
      data && typeof data === 'object' && 'lifecycle_state' in data && data.lifecycle_state != null;

    if (cached != null && touchesLifecycle) {
      const list = sanitizeClientsList(cached);
      const row = list.find((c) => c.id === id);
      if (row) {
        rollbackList = list;
        const optimistic = { ...row, ...data, lifecycle_state: data.lifecycle_state } as Client;
        cache.set(
          cacheKey,
          list.map((c) => (c.id === id ? optimistic : c)),
          TERMINAL_CACHE_TTL_MS,
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(TERMINAL_CLIENTS_UPDATED_EVENT));
        }
      }
    }

    const run = async (): Promise<Client | undefined> => {
      const response = await this.client.patch(`/clients/${id}`, data);
      let updated = response.data as Client | undefined;
      if (updated?.id && data && typeof data === 'object') {
        if ('offer_enrollment' in data && updated.offer_enrollment === undefined) {
          updated = { ...updated, offer_enrollment: data.offer_enrollment };
        }
        if ('meta' in data && updated.meta === undefined) {
          updated = { ...updated, meta: data.meta };
        }
      }
      const freshCached = cache.get<unknown[]>(cacheKey);
      if (freshCached != null && updated?.id) {
        const list = sanitizeClientsList(freshCached);
        cache.set(
          cacheKey,
          list.map((c) => (c.id === id ? updated : c)),
          TERMINAL_CACHE_TTL_MS,
        );
      } else if (updated?.id) {
        invalidateClientsListCache();
      }
      if (typeof window !== 'undefined' && updated?.id) {
        window.dispatchEvent(new CustomEvent(TERMINAL_CLIENTS_UPDATED_EVENT));
      }
      return updated;
    };

    try {
      const tracked = touchesLifecycle ? trackPipelinePersistence(run()) : run();
      return await tracked;
    } catch (error) {
      if (rollbackList) {
        cache.set(cacheKey, rollbackList, TERMINAL_CACHE_TTL_MS);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(TERMINAL_CLIENTS_UPDATED_EVENT));
        }
      }
      throw error;
    }
  }

  async mergeClients(clientIds: string[]) {
    const response = await this.client.post('/clients/merge', { client_ids: clientIds });
    invalidateClientsListCache();
    return response.data;
  }

  async deleteClient(id: string, deleteMerged: boolean = false) {
    const params = deleteMerged ? { delete_merged: 'true' } : {};
    await this.client.delete(`/clients/${id}`, { params });
    const cacheKey = clientsListCacheKey();
    const cached = cache.get<unknown[]>(cacheKey);
    if (cached != null) {
      cache.set(
        cacheKey,
        sanitizeClientsList(cached).filter((c) => c.id !== id),
        TERMINAL_CACHE_TTL_MS,
      );
    } else {
      invalidateClientsListCache();
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(TERMINAL_CLIENTS_UPDATED_EVENT));
    }
  }

  async getClientPayments(clientId: string, mergedClientIds?: string[]) {
    const mergeKey = mergedClientIds?.length ? [...mergedClientIds].sort().join(',') : '';
    const cacheKey = `client_payments_${clientId}_${mergeKey}`;
    const cached = cache.get<unknown>(cacheKey);
    if (cached != null) return cached;
    const params: any = {};
    if (mergedClientIds && mergedClientIds.length > 1) {
      params.merged_client_ids = mergedClientIds.join(',');
    }
    const response = await this.client.get(`/clients/${clientId}/payments`, { params });
    const data = response.data;
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async createManualPayment(
    clientId: string,
    amount: number,
    paymentDate?: string,
    description?: string,
    paymentMethod?: string,
    receiptUrl?: string
  ) {
    const params: any = { amount };
    if (paymentDate) params.payment_date = paymentDate;
    if (description) params.description = description;
    if (paymentMethod) params.payment_method = paymentMethod;
    if (receiptUrl) params.receipt_url = receiptUrl;
    const response = await this.client.post(`/clients/${clientId}/manual-payment`, null, { params });
    cache.deleteByPrefix(`client_payments_${clientId}_`);
    invalidateCachesAfterManualPayment();
    return response.data;
  }

  async updateManualPayment(
    clientId: string,
    paymentId: string,
    amount: number,
    paymentDate?: string,
    description?: string,
    paymentMethod?: string,
    receiptUrl?: string
  ) {
    const params: Record<string, string | number> = { amount };
    if (paymentDate) params.payment_date = paymentDate;
    if (description !== undefined) params.description = description;
    if (paymentMethod !== undefined) params.payment_method = paymentMethod;
    if (receiptUrl !== undefined) params.receipt_url = receiptUrl;
    const response = await this.client.patch(
      `/clients/${clientId}/manual-payment/${paymentId}`,
      null,
      { params }
    );
    cache.deleteByPrefix(`client_payments_${clientId}_`);
    invalidateCachesAfterManualPayment();
    return response.data;
  }

  async deleteManualPayment(clientId: string, paymentId: string) {
    await this.client.delete(`/clients/${clientId}/manual-payment/${paymentId}`);
    cache.deleteByPrefix(`client_payments_${clientId}_`);
    invalidateCachesAfterManualPayment();
  }

  // Check-ins
  async syncCheckIns(opts?: { applyPipelineRules?: boolean; forceLifecycle?: boolean }) {
    const params: Record<string, boolean> = {};
    if (opts?.applyPipelineRules === false) {
      params.apply_pipeline_rules = false;
    }
    if (opts?.forceLifecycle === true) {
      params.force_lifecycle = true;
    }
    const response = await this.client.post('/clients/check-ins/sync', null, {
      timeout: 180000,
      params: Object.keys(params).length > 0 ? params : undefined,
    });
    return response.data;
  }

  /** Re-evaluate pipeline columns for every client (backfill after rule changes). */
  async reconcileClientLifecycles(force = true) {
    const response = await this.client.post('/clients/automation/reconcile-lifecycle', null, {
      timeout: 120000,
      params: { force },
    });
    return response.data;
  }

  async getClientCheckIns(clientId: string, limit: number = 50) {
    const response = await this.client.get(`/clients/${clientId}/check-ins`, {
      params: { limit }
    });
    return response.data;
  }

  /** Client/lead health score (optional AI overlay when backend LLM is configured). */
  async getClientHealthScore(clientId: string, options?: { useAi?: boolean }) {
    const params: Record<string, boolean> = {};
    if (options?.useAi) {
      params.use_ai = true;
    }
    return withRetry(async () => {
      const response = await this.client.get(`/clients/${clientId}/health-score`, {
        params: Object.keys(params).length ? params : undefined,
      });
      return response.data;
    });
  }

  /** Lifecycle (and later AI) recommendation checklist for a client. */
  async getClientAIRecommendations(clientId: string) {
    return withRetry(async () => {
      const response = await this.client.get(`/clients/${clientId}/ai-recommendations`);
      return response.data;
    });
  }

  async patchClientAIRecommendationAction(clientId: string, actionId: string, completed: boolean) {
    const response = await this.client.patch(
      `/clients/${clientId}/ai-recommendations/actions/${encodeURIComponent(actionId)}`,
      { completed }
    );
    return response.data;
  }

  /** Generate email draft (LLM or template) for a recommendation action */
  async postAIRecommendationEmailDraft(clientId: string, actionId: string) {
    const response = await this.client.post(
      `/clients/${clientId}/ai-recommendations/actions/${encodeURIComponent(actionId)}/email-draft`
    );
    return response.data;
  }

  /** Batch health scores for board tags — same resolution as drawer (Brevo + AI when configured). */
  async getClientsHealthScores(
    clientIds: string[]
  ): Promise<Record<string, { score: number; grade: string; source?: string }>> {
    if (clientIds.length === 0) return {};
    const raw = await withRetry(
      async () => {
        const response = await this.client.get('/clients/health-scores', {
          params: { client_ids: clientIds.join(',') }
        });
        return response.data || {};
      },
      3,
      1000
    );
    const out: Record<string, { score: number; grade: string; source?: string }> = {};
    for (const [id, v] of Object.entries(raw)) {
      if (!v || typeof v !== 'object') continue;
      const row = v as { score?: unknown; grade?: unknown; source?: unknown };
      const score = typeof row.score === 'number' ? row.score : Number(row.score);
      if (Number.isNaN(score)) continue;
      const grade =
        typeof row.grade === 'string' && row.grade.trim() !== ''
          ? row.grade.trim()
          : gradeFromHealthScore(score);
      out[id] = {
        score,
        grade,
        ...(typeof row.source === 'string' ? { source: row.source } : {}),
      };
    }
    return out;
  }

  /** Call insights (ROI, clips, opportunity tags) — from Fathom + LLM. */
  async getClientCallInsights(clientId: string) {
    return withRetry(async () => {
      const response = await this.client.get(`/clients/${clientId}/call-insights`);
      return response.data;
    });
  }

  async getOrgSalesContentThemes(): Promise<{ themes: OrgSalesContentTheme[] }> {
    const response = await this.client.get('/auth/me/sales-content-themes');
    return response.data;
  }

  async postClientCallInsightsRefresh(clientId: string) {
    // LLM call can exceed default 10s; avoid false "failed" in dev.
    const response = await this.client.post(`/clients/${clientId}/call-insights/refresh`, undefined, {
      timeout: 120000,
    });
    return response.data;
  }

  /**
   * Pull recent meetings from Fathom (matches clients by invitee email → ingests summaries/transcripts).
   * Uses the organization Fathom API key (Integrations tab) or FATHOM_API_KEY env.
   */
  async syncFathomMeetings(): Promise<FathomSyncResponse> {
    const response = await this.client.post('/integrations/fathom/sync', null, {
      timeout: 30000,
    });
    return response.data;
  }

  /**
   * Create a Fathom webhook (API key required) that POSTs new meeting content to this backend.
   * Backend uses BACKEND_PUBLIC_URL + per-org webhook secret to verify signatures.
   */
  async setupFathomWebhook(): Promise<{ success?: boolean; destination_url?: string; webhook_id?: string }> {
    const response = await this.client.post('/integrations/fathom/webhook/setup', null, { timeout: 60000 });
    return response.data;
  }

  async getFathomStatus(): Promise<FathomStatusResponse> {
    const response = await this.client.get('/integrations/fathom/status');
    return response.data;
  }

  /** Batch opportunity tags for board chips. */
  async getClientsCallInsightTags(
    clientIds: string[]
  ): Promise<Record<string, { tags: string[]; headline: string }>> {
    if (clientIds.length === 0) return {};
    return withRetry(
      async () => {
        const response = await this.client.get('/clients/call-insight-tags', {
          params: { client_ids: clientIds.join(',') },
        });
        return response.data || {};
      },
      3,
      1000
    );
  }

  async getNextCheckIn(clientId: string) {
    const response = await this.client.get(`/clients/${clientId}/check-ins/next`);
    return response.data;
  }

  async updateCheckIn(checkInId: string, updates: { completed?: boolean; cancelled?: boolean; no_show?: boolean }) {
    const response = await this.client.patch(`/clients/check-ins/${checkInId}`, updates);
    return response.data;
  }

  async getCheckIn(checkInId: string) {
    const response = await this.client.get(`/clients/check-ins/${checkInId}`);
    return response.data;
  }

  /** Update a manual check-in details (status + sales-call flags). */
  async updateCheckInDetails(
    checkInId: string,
    updates: {
      completed?: boolean;
      cancelled?: boolean;
      no_show?: boolean;
      is_sales_call?: boolean;
      sale_closed?: boolean | null;
    }
  ) {
    const response = await this.client.patch(`/clients/check-ins/${checkInId}`, updates);
    return response.data;
  }

  /** Reschedule a manual check-in (drag/drop on calendar). */
  async rescheduleCheckIn(
    checkInId: string,
    startTimeISO: string,
    endTimeISO?: string
  ) {
    const payload: Record<string, unknown> = {
      start_time: startTimeISO
    };
    if (endTimeISO) payload.end_time = endTimeISO;
    const response = await this.client.patch(`/clients/check-ins/${checkInId}`, payload);
    return response.data;
  }

  async deleteCheckIn(checkInId: string) {
    const response = await this.client.delete(`/clients/check-ins/${checkInId}`);
    return response.data;
  }

  async createManualCheckIn(
    clientId: string,
    title: string,
    startTime: string,
    endTime?: string,
    options?: { completed?: boolean; cancelled?: boolean; no_show?: boolean }
  ) {
    const payload: Record<string, unknown> = {
      title,
      start_time: startTime,
      end_time: endTime
    };
    if (options?.completed !== undefined) payload.completed = options.completed;
    if (options?.cancelled !== undefined) payload.cancelled = options.cancelled;
    if (options?.no_show !== undefined) payload.no_show = options.no_show;
    const response = await this.client.post(`/clients/${clientId}/check-ins`, payload);
    return response.data;
  }

  // OAuth
  async startStripeOAuth() {
    const response = await this.client.post('/oauth/stripe/start');
    return response.data;
  }

  async disconnectStripe() {
    const response = await this.client.delete('/oauth/stripe/disconnect');
    return response.data;
  }

  async verifyStripeConnection() {
    const response = await this.client.get('/oauth/stripe/verify');
    return response.data;
  }

  async completeStripeOAuthManual(code: string, orgId: string) {
    // Initial connection includes historical sync which can take a long time
    const response = await this.client.post(`/oauth/stripe/callback/manual?code=${code}&org_id=${orgId}`, null, {
      timeout: 300000, // 5 minutes for initial sync
    });
    return response.data;
  }

  async connectStripeDirect(apiKey: string) {
    // Initial connection includes historical sync which can take a long time
    const response = await this.client.post('/oauth/stripe/connect-direct', {
      api_key: apiKey
    }, {
      timeout: 300000, // 5 minutes for initial sync
    });
    return response.data;
  }

  async syncStripeData(forceFull: boolean = false, syncRecent: boolean = false) {
    // Sync operations can take a long time, especially for full historical syncs
    // Use a longer timeout (5 minutes) for sync operations
    const response = await this.client.post('/integrations/stripe/sync', null, {
      params: { force_full: forceFull, sync_recent: syncRecent },
      timeout: 300000, // 5 minutes for sync operations
    });
    cache.deleteByPrefix(CACHE_KEYS.FINANCES_SUMMARY);
    cache.delete(CACHE_KEYS.TERMINAL_SUMMARY);
    return response.data;
  }

  /** Single call: sync from Stripe then reconcile. One round-trip for speed. */
  async syncAndReconcileStripeData(forceFull: boolean = false, syncRecent: boolean = false) {
    const response = await this.client.post('/integrations/stripe/sync-and-reconcile', null, {
      params: { force_full: forceFull, sync_recent: syncRecent },
      timeout: 300000, // 5 minutes
    });
    cache.deleteByPrefix(CACHE_KEYS.FINANCES_SUMMARY);
    cache.delete(CACHE_KEYS.TERMINAL_SUMMARY);
    return response.data;
  }

  async reconcileStripeData() {
    // Reconciliation can also take time
    const response = await this.client.post('/integrations/stripe/reconcile', null, {
      timeout: 120000, // 2 minutes for reconciliation
    });
    return response.data;
  }

  async startBrevoOAuth() {
    const response = await this.client.post('/oauth/brevo/start');
    return response.data;
  }

  async disconnectBrevo() {
    await this.client.delete('/oauth/brevo/disconnect');
    cache.delete(CACHE_KEYS.BREVO_STATUS);
  }

  async connectBrevoWithApiKey(apiKey: string) {
    const response = await this.client.post('/oauth/brevo/connect-direct', {
      api_key: apiKey
    });
    cache.delete(CACHE_KEYS.BREVO_STATUS);
    return response.data;
  }

  // Cal.com
  async connectCalComWithApiKey(apiKey: string) {
    const response = await this.client.post('/oauth/calcom/connect-direct', {
      api_key: apiKey
    });
    dispatchCalendarIntegrationChanged();
    return response.data;
  }

  async getCalComStatus() {
    const key = calComStatusCacheKey();
    const cached = cache.get<unknown>(key);
    if (cached != null) return cached;
    const response = await this.client.get('/integrations/calcom/status');
    const data = response.data;
    cache.set(key, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async disconnectCalCom() {
    await this.client.delete('/oauth/calcom/disconnect');
    dispatchCalendarIntegrationChanged();
  }

  async getCalComBookings(limit: number = 50, offset: number = 0) {
    // Backend accepts both 'limit'/'offset' and 'take'/'skip' for backward compatibility
    // Cal.com API uses 'take'/'skip', but we keep 'limit'/'offset' in frontend for consistency
    const response = await this.client.get('/integrations/calcom/bookings', {
      params: { limit, offset }
    });
    return response.data;
  }

  async getCalComEventTypes() {
    const response = await this.client.get('/integrations/calcom/event-types');
    return response.data;
  }

  /** Fetch Cal.com booking by UID (string). Uses GET /v2/bookings/{bookingUid} with cal-api-version 2026-02-25. */
  async getCalComBookingDetails(bookingUid: string) {
    return withRetry(async () => {
      const response = await this.client.get(`/integrations/calcom/booking/${encodeURIComponent(bookingUid)}`, {
        timeout: 20000,
      });
      return response.data;
    }, 2, 1200);
  }

  // Calendly
  async connectCalendlyWithApiKey(apiKey: string) {
    const response = await this.client.post('/oauth/calendly/connect-direct', {
      api_key: apiKey
    });
    dispatchCalendarIntegrationChanged();
    return response.data;
  }

  async getCalendlyStatus() {
    const key = calendlyStatusCacheKey();
    const cached = cache.get<unknown>(key);
    if (cached != null) return cached;
    const response = await this.client.get('/integrations/calendly/status');
    const data = response.data;
    cache.set(key, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async disconnectCalendly() {
    await this.client.delete('/oauth/calendly/disconnect');
    dispatchCalendarIntegrationChanged();
  }

  async getCalendlyScheduledEvents(params?: {
    count?: number;
    page_token?: string;
    sort?: string;
    user?: string;
    invitee_email?: string;
    status?: string;
    min_start_time?: string;
    max_start_time?: string;
  }) {
    const response = await this.client.get('/integrations/calendly/scheduled-events', {
      params: params || {}
    });
    return response.data;
  }

  async getCalendarUpcomingSummary() {
    const response = await this.client.get('/integrations/calendar/upcoming-summary');
    return response.data;
  }

  async getCalendarSalesCloseRate() {
    const response = await this.client.get('/integrations/calendar/sales-close-rate');
    return response.data;
  }

  /** Same shape as getCalendarSalesCloseRate; all orgs combined (admin only). Owner Health tab KPI. */
  async getPlatformCalendarSalesCloseRate() {
    const response = await this.client.get('/integrations/calendar/platform-sales-close-rate');
    return response.data as {
      all_time: { total_sales_calls: number; closed_count: number; close_rate_pct: number };
      last_30d: { total_sales_calls: number; closed_count: number; close_rate_pct: number };
    };
  }

  /** Monthly show-up % vs sales close % for the current org (Calendar tab). */
  async getCalendarMonthlyCoachingMetrics() {
    const response = await this.client.get('/clients/calendar/monthly-coaching-metrics');
    return response.data as {
      periods: Array<{
        period_label: string;
        period_start: string;
        period_end: string;
        show_up_rate_pct: number | null;
        close_rate_pct: number | null;
      }>;
    };
  }

  /** Monthly combined cash + calendar rates for unified Terminal dashboard. */
  async getTerminalMonthlyTrends(forceRefresh?: boolean) {
    if (forceRefresh) {
      cache.delete(CACHE_KEYS.TERMINAL_MONTHLY_TRENDS);
      terminalMonthlyTrendsInflight = null;
    } else {
      const cached = cache.get<TerminalMonthlyTrendsPayload>(CACHE_KEYS.TERMINAL_MONTHLY_TRENDS);
      if (cached != null) return cached;
      if (terminalMonthlyTrendsInflight) return terminalMonthlyTrendsInflight;
    }

    const req = this.client
      .get('/clients/terminal/monthly-trends', { timeout: 60000 })
      .then((response) => {
        const data = response.data as TerminalMonthlyTrendsPayload;
        cache.set(CACHE_KEYS.TERMINAL_MONTHLY_TRENDS, data, TERMINAL_CACHE_TTL_MS);
        return data;
      })
      .finally(() => {
        if (terminalMonthlyTrendsInflight === req) {
          terminalMonthlyTrendsInflight = null;
        }
      });
    terminalMonthlyTrendsInflight = req;
    return req;
  }

  /** Manual check-ins for the calendar grid (date range YYYY-MM-DD). */
  async getCalendarManualEvents(start: string, end: string) {
    const response = await this.client.get('/integrations/calendar/manual-events', {
      params: { start, end },
    });
    return response.data;
  }

  /** Lightweight: when Cal.com / Calendly check-ins last changed (webhook or sync). */
  async getCalendarLastUpdated(): Promise<{ last_updated: string | null; last_updated_ms: number | null }> {
    const response = await this.client.get('/integrations/calendar/last-updated');
    return response.data;
  }

  /** Scoped show-up / close-rate KPIs from full synced check-in history (not capped like bookings list). */
  async getCalendarTrendSummary(
    params?: { scope?: 'mtd' | 'all'; range_days?: number },
    bypassCache?: boolean
  ) {
    const cacheKey = `calendar_trend_summary_${orgIdFromAccessToken()}_${JSON.stringify(params || {})}`;
    if (!bypassCache) {
      const cached = cache.get<CalendarTrendSummary>(cacheKey);
      if (cached != null) return cached;
    } else {
      cache.delete(cacheKey);
    }

    const data = await withRetry(
      async () => {
        const response = await this.client.get('/integrations/calendar/trend-summary', {
          params: params || {},
          timeout: 90000,
        });
        return response.data as CalendarTrendSummary;
      },
      3,
      2000
    );
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  /** Canonical Cal.com / Calendly rows from synced `client_check_ins` (after `syncCheckIns`). */
  async getCalendarSyncedBookings(params?: {
    upcoming_limit?: number;
    past_limit?: number;
    past_since?: string;
    provider?: 'calcom' | 'calendly';
  }) {
    // DB-backed read must stay under Postgres statement_timeout (see backend session); allow headroom
    // for pool wait + JSON when the API is busy right after check-in sync.
    return withRetry(
      async () => {
        const response = await this.client.get('/integrations/calendar/synced-bookings', {
          params: params || {},
          timeout: 120000,
        });
        return response.data as {
          server_time: string;
          upcoming: CalendarSyncedBookingRow[];
          past: CalendarSyncedBookingRow[];
        };
      },
      3,
      2000
    );
  }

  async getCalendlyEventTypes(params?: {
    count?: number;
    page_token?: string;
    sort?: string;
    user?: string;
    active?: boolean;
  }) {
    const response = await this.client.get('/integrations/calendly/event-types', {
      params: params || {}
    });
    return response.data;
  }

  async getCalendlyEventDetails(eventUri: string) {
    // Encode the URI for the path parameter
    const encodedUri = encodeURIComponent(eventUri);
    return withRetry(async () => {
      const response = await this.client.get(`/integrations/calendly/event/${encodedUri}`, {
        timeout: 20000,
      });
      return response.data;
    }, 2, 1200);
  }

  async cancelCalComBooking(bookingUid: string, reason?: string) {
    const response = await this.client.post(
      `/integrations/calcom/booking/${encodeURIComponent(bookingUid)}/cancel`,
      reason ? { reason } : {}
    );
    return response.data;
  }

  async cancelCalendlyEvent(eventUriOrUuid: string, reason?: string) {
    const encoded = encodeURIComponent(eventUriOrUuid);
    const response = await this.client.post(
      `/integrations/calendly/event/${encoded}/cancel`,
      reason ? { reason } : {}
    );
    return response.data;
  }

  // Calendar sales call tracking (sales vs check-in, close rate)
  async updateCalendarBookingSales(provider: 'calcom' | 'calendly', eventId: string, updates: { is_sales_call?: boolean; sale_closed?: boolean | null; event_uri?: string }) {
    const response = await this.client.patch('/integrations/calendar/bookings/sales', {
      provider,
      event_id: eventId,
      ...updates
    });
    return response.data;
  }
  async listSalesCallEventTypes(provider: 'calcom' | 'calendly') {
    const response = await this.client.get('/integrations/calendar/event-types/sales-call', {
      params: { provider }
    });
    return response.data;
  }
  async addSalesCallEventType(provider: 'calcom' | 'calendly', eventTypeId: string) {
    const response = await this.client.post('/integrations/calendar/event-types/sales-call', {
      provider,
      event_type_id: eventTypeId
    });
    return response.data;
  }
  async removeSalesCallEventType(provider: 'calcom' | 'calendly', eventTypeId: string) {
    const response = await this.client.delete('/integrations/calendar/event-types/sales-call', {
      params: { provider, event_type_id: eventTypeId }
    });
    return response.data;
  }

  // Integrations (Stripe endpoints cached for fast dashboard tab switching)
  async getStripeStatus(bypassCache?: boolean) {
    if (!bypassCache) {
      const cached = cache.get<unknown>(CACHE_KEYS.STRIPE_STATUS);
      if (cached != null) return cached;
    }
    const response = await this.client.get('/integrations/stripe/status');
    const data = response.data;
    if (!bypassCache) cache.set(CACHE_KEYS.STRIPE_STATUS, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  /** Lightweight: when Stripe data was last updated by webhook. Terminal uses this to refetch only when webhook fired. */
  async getStripeLastUpdated(): Promise<{ last_updated: string | null; last_updated_ms: number | null }> {
    const response = await this.client.get('/integrations/stripe/last-updated');
    return response.data;
  }

  /**
   * Combined Stripe + Whop cash KPIs. Pass `fin` to match the All Finances time range (see Finances dashboard).
   * `last_30_days_revenue` in the response is the selected **primary** window, not always 30d.
   */
  async getFinancesSummary(
    bypassCache?: boolean,
    fin?: { range?: number; scope?: 'mtd' | 'all' }
  ) {
    const range = fin?.range ?? 30;
    const scope = fin?.scope;
    const cacheKey = `${CACHE_KEYS.FINANCES_SUMMARY}:${scope ?? 'r'}:${range}`;
    if (!bypassCache) {
      const cached = cache.get<unknown>(cacheKey);
      if (cached != null) return cached;
    }
    const params: Record<string, string | number> = { range };
    if (scope) params.scope = scope;
    const response = await this.client.get('/integrations/finances/summary', { params });
    const data = response.data;
    if (!bypassCache) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getFinancesRevenueTimeline(
    rangeDays: number = 30,
    groupBy: 'day' | 'week' = 'day',
    scope?: 'mtd' | 'all' | null
  ) {
    const params: Record<string, string | number> = { range: rangeDays, group_by: groupBy };
    if (scope) params.scope = scope;
    const response = await this.client.get('/integrations/finances/revenue-timeline', { params });
    return response.data;
  }

  async getWhopStatus(bypassCache?: boolean) {
    if (!bypassCache) {
      const cached = cache.get<unknown>(CACHE_KEYS.WHOP_STATUS);
      if (cached != null) return cached;
    }
    const response = await this.client.get('/integrations/whop/status');
    const data = response.data;
    if (!bypassCache) cache.set(CACHE_KEYS.WHOP_STATUS, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async postWhopConnect(body: { api_key: string; company_id: string }) {
    const response = await this.client.post('/integrations/whop/connect', body);
    cache.delete(CACHE_KEYS.WHOP_STATUS);
    cache.deleteByPrefix(CACHE_KEYS.FINANCES_SUMMARY);
    cache.delete(CACHE_KEYS.TERMINAL_SUMMARY);
    return response.data;
  }

  async postWhopDisconnect() {
    await this.client.post('/integrations/whop/disconnect');
    cache.delete(CACHE_KEYS.WHOP_STATUS);
    cache.deleteByPrefix(CACHE_KEYS.FINANCES_SUMMARY);
    cache.delete(CACHE_KEYS.TERMINAL_SUMMARY);
  }

  async postWhopSync(forceFull?: boolean) {
    const response = await this.client.post('/integrations/whop/sync', null, {
      params: { force_full: !!forceFull },
      timeout: 300000,
    });
    cache.deleteByPrefix(CACHE_KEYS.FINANCES_SUMMARY);
    cache.delete(CACHE_KEYS.TERMINAL_SUMMARY);
    cache.deleteByPrefix('whop_payments');
    return response.data;
  }

  async getWhopPayments(page: number = 1, pageSize: number = 50) {
    const response = await this.client.get('/integrations/whop/payments', {
      params: { page, page_size: pageSize },
    });
    return response.data;
  }

  async getWhopRevenueTimeline(rangeDays: number = 30, groupBy: 'day' | 'week' = 'day') {
    const response = await this.client.get('/integrations/whop/revenue-timeline', {
      params: { range_days: rangeDays, group_by: groupBy },
    });
    return response.data;
  }

  async getStripeSummary(range?: number | 'mtd' | 'all', bypassCache?: boolean) {
    const cacheKey = `stripe_summary_${range ?? 'all'}`;
    if (!bypassCache) {
      const cached = cache.get<unknown>(cacheKey);
      if (cached != null) return cached;
    }
    const params: Record<string, string | number> = {};
    if (range === 'mtd') params.scope = 'mtd';
    else if (range && range !== 'all') params.range = range;
    const response = await this.client.get('/integrations/stripe/summary', { params });
    const data = response.data;
    if (!bypassCache) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getStripeCustomers(limit?: number) {
    const params = limit ? { limit } : {};
    const response = await this.client.get('/integrations/stripe/customers', { params });
    return response.data;
  }

  async getStripeSubscriptions(status?: string, limit?: number) {
    const params: any = {};
    if (status) params.status = status;
    if (limit) params.limit = limit;
    const response = await this.client.get('/integrations/stripe/subscriptions', { params });
    return response.data;
  }

  async getStripeInvoices(limit?: number) {
    const params = limit ? { limit } : {};
    const response = await this.client.get('/integrations/stripe/invoices', { params });
    return response.data;
  }

  async getBrevoStatus() {
    const cached = cache.get<unknown>(CACHE_KEYS.BREVO_STATUS);
    if (cached != null) return cached;
    const response = await this.client.get('/integrations/brevo/status');
    const data = response.data;
    cache.set(CACHE_KEYS.BREVO_STATUS, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  // Brevo Contacts
  async getBrevoContacts(limit: number = 50, offset: number = 0) {
    const response = await this.client.get('/integrations/brevo/contacts', {
      params: { limit, offset }
    });
    return response.data;
  }

  async getBrevoContact(contactId: number) {
    const response = await this.client.get(`/integrations/brevo/contacts/${contactId}`);
    return response.data;
  }

  async createBrevoContact(data: { email: string; attributes?: Record<string, any>; listIds?: number[]; updateEnabled?: boolean }) {
    const response = await this.client.post('/integrations/brevo/contacts', data);
    return response.data;
  }

  async updateBrevoContact(identifier: string, data: { attributes?: Record<string, any>; listIds?: number[]; unlinkListIds?: number[] }, identifierType?: string) {
    const params = identifierType ? { identifierType } : {};
    const response = await this.client.put(`/integrations/brevo/contacts/${encodeURIComponent(identifier)}`, data, { params });
    return response.data;
  }

  async getBrevoContactByEmail(email: string) {
    try {
      // Use the dedicated endpoint for getting contact by email
      const response = await this.client.get(`/integrations/brevo/contacts/by-email/${encodeURIComponent(email)}`);
      return response.data;
    } catch (error: any) {
      // 404 means contact doesn't exist, which is fine
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async deleteBrevoContact(contactId: number) {
    const response = await this.client.delete(`/integrations/brevo/contacts/${contactId}`);
    return response.data;
  }

  async bulkDeleteBrevoContacts(contactIds: number[]) {
    const response = await this.client.post('/integrations/brevo/contacts/bulk-delete', { contactIds });
    return response.data;
  }

  async createClientsFromBrevoContacts(contactIds: number[]) {
    const response = await this.client.post('/integrations/brevo/contacts/create-clients', { contactIds });
    return response.data;
  }

  // Brevo Lists
  async getBrevoLists(limit: number = 50, offset: number = 0) {
    const response = await this.client.get('/integrations/brevo/lists', {
      params: { limit, offset }
    });
    return response.data;
  }

  async createBrevoList(data: { name: string; folderId?: number }) {
    const response = await this.client.post('/integrations/brevo/lists', data);
    return response.data;
  }

  async deleteBrevoList(listId: number) {
    const response = await this.client.delete(`/integrations/brevo/lists/${listId}`);
    return response.data;
  }

  async getBrevoListContacts(listId: number, limit: number = 50, offset: number = 0) {
    const response = await this.client.get(`/integrations/brevo/lists/${listId}/contacts`, {
      params: { limit, offset }
    });
    return response.data;
  }

  async moveBrevoContacts(data: { contactIds: number[]; sourceListId: number; destinationListId: number }) {
    const response = await this.client.post('/integrations/brevo/contacts/move', data);
    return response.data;
  }

  async addBrevoContactsToList(data: { contactIds: number[]; listId: number }) {
    const response = await this.client.post('/integrations/brevo/contacts/add-to-list', data);
    return response.data;
  }

  async removeBrevoContactsFromList(data: { contactIds: number[]; listId: number }) {
    const response = await this.client.post('/integrations/brevo/contacts/remove-from-list', data);
    return response.data;
  }

  // Brevo Transactional Emails
  async sendBrevoTransactionalEmail(data: {
    contactIds?: number[];
    listId?: number;
    recipients?: Array<{ email: string; name?: string }>;
    sender: { email: string; name: string };
    subject: string;
    htmlContent?: string;
    textContent?: string;
    templateId?: number;
    params?: Record<string, any>;
    tags?: string[];
    replyTo?: { email: string; name?: string };
  }) {
    const response = await this.client.post('/integrations/brevo/transactional/send', data);
    return response.data;
  }

  async getBrevoSenders() {
    const response = await this.client.get('/integrations/brevo/senders');
    return response.data;
  }

  async getBrevoAnalytics(period: string = '30days') {
    const response = await this.client.get('/integrations/brevo/analytics', {
      params: { period }
    });
    return response.data;
  }

  // Stripe Analytics (bypassCache=true used by Stripe tab so it never overwrites Terminal's cache)
  async getStripeRevenueTimeline(range?: number | 'mtd', groupBy?: 'day' | 'week', bypassCache?: boolean) {
    const cacheKey = `stripe_revenue_${range ?? 'all'}_${groupBy ?? 'day'}`;
    if (!bypassCache) {
      const cached = cache.get<unknown>(cacheKey);
      if (cached != null) return cached;
    }
    const params: Record<string, string | number> = {};
    if (range === 'mtd') params.scope = 'mtd';
    else if (range) params.range = range;
    if (groupBy) params.group_by = groupBy;
    const response = await this.client.get('/integrations/stripe/revenue-timeline', { params });
    const data = response.data;
    if (!bypassCache) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getStripeChurn(months?: number, bypassCache?: boolean) {
    const cacheKey = `stripe_churn_${months ?? 6}`;
    if (!bypassCache) {
      const cached = cache.get<unknown>(cacheKey);
      if (cached != null) return cached;
    }
    const params = months ? { months } : {};
    const response = await this.client.get('/integrations/stripe/churn', { params });
    const data = response.data;
    if (!bypassCache) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getStripeMRRTrend(range?: number | 'mtd', groupBy?: 'day' | 'week' | 'month', bypassCache?: boolean) {
    const cacheKey = `stripe_mrr_${range ?? 'all'}_${groupBy ?? 'day'}`;
    if (!bypassCache) {
      const cached = cache.get<unknown>(cacheKey);
      if (cached != null) return cached;
    }
    const params: Record<string, string | number> = {};
    if (range === 'mtd') params.scope = 'mtd';
    else if (range) params.range = range;
    if (groupBy) params.group_by = groupBy;
    const response = await this.client.get('/integrations/stripe/mrr-trend', { params });
    const data = response.data;
    if (!bypassCache) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getStripePayments(
    status?: string,
    range?: number | 'mtd',
    page?: number,
    pageSize?: number,
    useTreasury?: boolean,
    bypassCache?: boolean
  ) {
    const cacheKey = `stripe_payments_${status ?? 'all'}_${range ?? 'all'}_${page ?? 1}_${pageSize ?? 100}_${useTreasury ?? false}`;
    if (!bypassCache) {
      const cached = cache.get<unknown>(cacheKey);
      if (cached != null) return cached;
    }
    const params: Record<string, string | number> = {};
    if (status) params.status = status;
    if (range === 'mtd') params.scope = 'mtd';
    else if (range !== undefined) params.range = range;
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    if (useTreasury !== undefined) params.use_treasury = String(useTreasury);
    const response = await this.client.get('/integrations/stripe/payments', { params });
    const data = response.data;
    if (!bypassCache) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async deleteStripePayment(paymentId: string, useTreasury: boolean = true) {
    const response = await this.client.delete(`/integrations/stripe/payments/${paymentId}`, {
      params: { use_treasury: useTreasury }
    });
    return response.data;
  }

  async getStripeFailedPayments(
    page?: number,
    pageSize?: number,
    excludeResolved?: boolean,
    bypassCache?: boolean,
    range?: number,
    scope?: 'mtd' | 'all'
  ) {
    const cacheKey = `${CACHE_KEYS.STRIPE_FAILED_PAYMENTS}_${page ?? 1}_${pageSize ?? 10}_${excludeResolved ?? false}_${range ?? ''}_${scope ?? ''}`;
    if (!bypassCache) {
      const cached = cache.get<unknown>(cacheKey);
      if (cached != null) return cached;
    }
    const params: Record<string, string | number | boolean> = {};
    if (page) params.page = page;
    if (pageSize) params.page_size = pageSize;
    if (excludeResolved !== undefined) params.exclude_resolved = excludeResolved;
    if (range != null) params.range = range;
    if (scope) params.scope = scope;
    const response = await this.client.get('/integrations/stripe/failed-payments', { params });
    const data = response.data;
    if (!bypassCache) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async findDuplicatePayments() {
    const response = await this.client.get('/integrations/stripe/payments/duplicates');
    return response.data;
  }

  async mergeDuplicatePayments(paymentIds: string[], autoReconcile: boolean = true) {
    const response = await this.client.post('/integrations/stripe/payments/merge-duplicates', {
      payment_ids: paymentIds,
      auto_reconcile: autoReconcile
    });
    return response.data;
  }

  async assignPaymentToClient(paymentId: string, clientId: string, autoReconcile: boolean = true) {
    const response = await this.client.patch(`/integrations/stripe/payments/${paymentId}/assign`, null, {
      params: {
        client_id: clientId,
        auto_reconcile: autoReconcile
      }
    });
    return response.data;
  }

  async resolveFailedPaymentAlert(paymentId: string) {
    const response = await this.client.post(`/integrations/stripe/failed-payments/${paymentId}/resolve`);
    cache.deleteByPrefix(CACHE_KEYS.STRIPE_FAILED_PAYMENTS);
    return response.data;
  }

  // Funnels (cached for terminal - LeadsBySource and BookingRateByFunnel both call this)
  async getFunnels(clientId?: string) {
    const cacheKey = clientId ? `${CACHE_KEYS.FUNNELS}_${clientId}` : CACHE_KEYS.FUNNELS;
    if (!clientId) {
      const cached = cache.get<unknown[]>(cacheKey);
      if (cached != null) return cached;
    }
    const params = clientId ? { client_id: clientId } : {};
    const response = await this.client.get('/funnels', { params });
    const data = response.data;
    if (!clientId) cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getFunnel(funnelId: string) {
    const response = await this.client.get(`/funnels/${funnelId}`);
    return response.data;
  }

  async createFunnel(data: any) {
    const response = await this.client.post('/funnels', data);
    return response.data;
  }

  async updateFunnel(funnelId: string, data: any) {
    const response = await this.client.patch(`/funnels/${funnelId}`, data);
    return response.data;
  }

  async deleteFunnel(funnelId: string) {
    const response = await this.client.delete(`/funnels/${funnelId}`);
    return response.data;
  }

  async updateMyOrganization(data: { name?: string }) {
    const response = await this.client.patch('/users/me/organization', data);
    return response.data;
  }

  async leaveOrganization(orgId: string) {
    const response = await this.client.delete(`/auth/organizations/${orgId}`);
    return response.data;
  }

  // Funnel Steps
  async createFunnelStep(funnelId: string, data: any) {
    const response = await this.client.post(`/funnels/${funnelId}/steps`, data);
    return response.data;
  }

  async updateFunnelStep(funnelId: string, stepId: string, data: any) {
    const response = await this.client.patch(`/funnels/${funnelId}/steps/${stepId}`, data);
    return response.data;
  }

  async deleteFunnelStep(funnelId: string, stepId: string) {
    const response = await this.client.delete(`/funnels/${funnelId}/steps/${stepId}`);
    return response.data;
  }

  async reorderFunnelSteps(funnelId: string, stepOrders: Array<{ step_id: string; step_order: number }>) {
    const response = await this.client.post(`/funnels/${funnelId}/steps/reorder`, stepOrders);
    return response.data;
  }

  // Funnel Analytics
  async getFunnelHealth(funnelId: string) {
    const response = await this.client.get(`/funnels/${funnelId}/health`);
    return response.data;
  }

  async getFunnelAnalytics(funnelId: string, range?: number, forceRefresh?: boolean) {
    const cacheKey = `funnel_analytics_${funnelId}_${range ?? 30}`;
    if (!forceRefresh) {
      const cached = cache.get<unknown>(cacheKey);
      if (cached != null) return cached;
    }
    const params = range ? { range } : {};
    // Analytics can scan large event tables; default 20s axios timeout caused ECONNABORTED on busy orgs.
    const response = await this.client.get(`/funnels/${funnelId}/analytics`, {
      params,
      timeout: 120000,
    });
    const data = response.data;
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  // Event Explorer
  async exploreEvents(filters?: {
    funnel_id?: string;
    event_name?: string;
    visitor_id?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = filters || {};
    const response = await this.client.get('/funnels/events', { params });
    return response.data;
  }

  // Event Ingestion (for client-side tracking)
  async trackEvent(data: any) {
    const response = await this.client.post('/funnels/events', data);
    return response.data;
  }

  // Admin APIs
  async getOrganizations() {
    const cached = cache.get<unknown>(CACHE_KEYS.ADMIN_ORGANIZATIONS);
    if (cached != null) return cached;
    const response = await this.client.get('/admin/organizations');
    const data = response.data;
    cache.set(CACHE_KEYS.ADMIN_ORGANIZATIONS, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getOrganization(orgId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}`);
    return response.data;
  }

  async updateOrganization(orgId: string, data: { name?: string; max_user_seats?: number | null }) {
    const response = await this.client.patch(`/admin/organizations/${orgId}`, data);
    return response.data;
  }

  async deleteOrganization(orgId: string) {
    const response = await this.client.delete(`/admin/organizations/${orgId}`);
    return response.data;
  }

  // Admin: Invite organization (email-based onboarding)
  async inviteOrganization(data: { name: string; admin_email: string }) {
    const response = await this.client.post('/admin/organizations/invite', data);
    cache.delete(CACHE_KEYS.ADMIN_INVITATIONS);
    cache.delete(CACHE_KEYS.ADMIN_ORGANIZATIONS);
    return response.data;
  }

  async listAdminInvitations() {
    const cached = cache.get<unknown>(CACHE_KEYS.ADMIN_INVITATIONS);
    if (cached != null) return cached;
    const response = await this.client.get('/admin/organizations/invitations');
    const data = response.data;
    cache.set(CACHE_KEYS.ADMIN_INVITATIONS, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getGlobalHealth(options?: { refresh?: boolean }) {
    if (!options?.refresh) {
      const cached = cache.get<unknown>(CACHE_KEYS.ADMIN_HEALTH);
      if (cached != null) return cached;
    } else {
      cache.delete(CACHE_KEYS.ADMIN_HEALTH);
    }
    const response = await this.client.get('/admin/health');
    const data = response.data;
    cache.set(CACHE_KEYS.ADMIN_HEALTH, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getGlobalSettings() {
    const cached = cache.get<unknown>(CACHE_KEYS.ADMIN_SETTINGS);
    if (cached != null) return cached;
    const response = await this.client.get('/admin/settings');
    const data = response.data;
    cache.set(CACHE_KEYS.ADMIN_SETTINGS, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async getOrganizationDashboard(orgId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}/dashboard`);
    return response.data;
  }

  // Admin: Organization Funnel Management
  async getOrganizationFunnels(orgId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}/funnels`);
    return response.data;
  }

  async createOrganizationFunnel(orgId: string, data: any) {
    const response = await this.client.post(`/admin/organizations/${orgId}/funnels`, data);
    return response.data;
  }

  async getOrganizationFunnel(orgId: string, funnelId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}/funnels/${funnelId}`);
    return response.data;
  }

  async updateOrganizationFunnel(orgId: string, funnelId: string, data: any) {
    const response = await this.client.patch(`/admin/organizations/${orgId}/funnels/${funnelId}`, data);
    return response.data;
  }

  async deleteOrganizationFunnel(orgId: string, funnelId: string) {
    const response = await this.client.delete(`/admin/organizations/${orgId}/funnels/${funnelId}`);
    return response.data;
  }

  // Admin: Organization Tab Permissions
  async getOrganizationTabPermissions(orgId: string) {
    const response = await this.client.get(`/admin/organizations/${orgId}/tabs`);
    return response.data;
  }

  async createOrganizationTabPermission(orgId: string, data: any) {
    const response = await this.client.post(`/admin/organizations/${orgId}/tabs`, data);
    return response.data;
  }

  async updateOrganizationTabPermission(orgId: string, tabName: string, data: any) {
    const response = await this.client.patch(`/admin/organizations/${orgId}/tabs/${tabName}`, data);
    return response.data;
  }

  // Organization-scoped invitations (org admin/owner)
  async inviteUserToOrg(orgId: string, data: { email: string; role?: string }) {
    const response = await this.client.post(`/organizations/${orgId}/invite-user`, data);
    cache.delete(`org_invitations_${orgId}`);
    return response.data;
  }

  async listOrgInvitations(orgId: string) {
    const cacheKey = `org_invitations_${orgId}`;
    const cached = cache.get<unknown>(cacheKey);
    if (cached != null) return cached;
    const response = await this.client.get(`/organizations/${orgId}/invitations`);
    const data = response.data;
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async resendOrgInvitation(orgId: string, invitationId: string) {
    const response = await this.client.post(`/organizations/${orgId}/invitations/${invitationId}/resend`);
    cache.delete(`org_invitations_${orgId}`);
    return response.data;
  }

  async cancelOrgInvitation(orgId: string, invitationId: string) {
    await this.client.delete(`/organizations/${orgId}/invitations/${invitationId}`);
    cache.delete(`org_invitations_${orgId}`);
  }

  async addSystemOwnerToOrg(orgId: string) {
    const response = await this.client.post(`/organizations/${orgId}/add-system-owner`);
    return response.data;
  }

  // User Management
  async getUsers() {
    const cached = cache.get<unknown>(CACHE_KEYS.USERS);
    if (cached != null) return cached;
    const response = await this.client.get('/users');
    const data = response.data;
    cache.set(CACHE_KEYS.USERS, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async createUser(data: { email: string; password?: string; role?: string }) {
    const response = await this.client.post('/users', data);
    cache.delete(CACHE_KEYS.USERS);
    return response.data;
  }

  async getUser(userId: string) {
    const response = await this.client.get(`/users/${userId}`);
    return response.data;
  }

  async updateUser(userId: string, data: any) {
    const response = await this.client.patch(`/users/${userId}`, data);
    return response.data;
  }

  async deleteUser(userId: string) {
    const response = await this.client.delete(`/users/${userId}`);
    cache.delete(CACHE_KEYS.USERS);
    return response.data;
  }

  // Performance tab
  async getPerformanceSnapshot(forceRefresh = false): Promise<PerformanceSnapshot> {
    const cacheKey = `performance_snapshot_${orgIdFromAccessToken()}`;
    if (!forceRefresh) {
      const cached = cache.get<PerformanceSnapshot>(cacheKey);
      if (cached != null) return cached;
    }

    const data = await withRetry(
      async () => {
        const response = await this.client.get('/performance/snapshot', { timeout: 90000 });
        return response.data as PerformanceSnapshot;
      },
      3,
      2000
    );
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }

  async patchPerformanceTasks(completed_task_ids: string[]) {
    const response = await this.client.patch('/performance/tasks', { completed_task_ids });
    return response.data as { completed_task_ids: string[]; updated_at?: string };
  }

  async postPerformancePrescription(task_ids?: string[]) {
    const response = await this.client.post(
      '/performance/prescription',
      { task_ids: task_ids ?? [] },
      { timeout: 60000 }
    );
    return response.data as {
      tasks: { id: string; why: string; prescription: string; next_step: string }[];
      source: string;
    };
  }

  /**
   * Auto-generate (and persist) send-ready emails for one or more Performance task ids.
   * Empty `task_ids` = top open tasks. `force` true regenerates even if a saved draft exists.
   * Backend rate-limits these (429) — caller should surface a friendly message.
   */
  async postPerformanceEmailDrafts(
    task_ids?: string[],
    options?: { force?: boolean }
  ): Promise<PerformanceEmailDraftsResponse> {
    const response = await this.client.post(
      '/performance/email-drafts',
      { task_ids: task_ids ?? [], force: !!options?.force },
      { timeout: 120000 }
    );
    return response.data as PerformanceEmailDraftsResponse;
  }

  // Marketing Intel / content_studio (bootstrap may draft the v2 bundle via LLM when signals change — long timeout)
  async getContentStudioBootstrap(): Promise<ContentStudioBootstrap> {
    return withRetry(async () => {
      const response = await this.client.get('/content-studio/bootstrap', { timeout: 120000 });
      return response.data;
    });
  }

  /**
   * Fathom sync + health cache bust + queued bundle regeneration (rate-limited server-side).
   */
  async postContentStudioReanalyze(): Promise<{
    fathom_sync: Record<string, unknown>;
    bundle_regenerating: boolean;
    health_clients_invalidated: number;
  }> {
    const response = await this.client.post('/content-studio/reanalyze', null, {
      timeout: 180000,
    });
    return response.data;
  }

  async putContentStudioKnowledge(body: {
    objections: string[];
    closing: string[];
    reframes: string[];
  }) {
    const response = await this.client.put('/content-studio/knowledge', body, { timeout: 60000 });
    return response.data as ContentStudioBootstrap['knowledge'];
  }

  async patchContentStudioCompletions(completed_idea_ids: string[]) {
    const response = await this.client.patch(
      '/content-studio/ideas/complete',
      { completed_idea_ids },
      { timeout: 30000 }
    );
    return response.data as { completed_idea_ids: string[]; batch_id?: string; updated_at?: string };
  }

  async postContentStudioTranscriptAnalyze(body: {
    transcript: string;
    purpose: 'TOF' | 'MOF' | 'BOF' | 'mixed';
    mixed_note?: string;
  }) {
    const response = await this.client.post('/content-studio/transcripts/analyze', body, { timeout: 120000 });
    return response.data as { id: string; purpose: string; analysis: Record<string, unknown> };
  }

  async getContentStudioTranscripts(limit?: number) {
    const response = await this.client.get('/content-studio/transcripts', {
      params: limit ? { limit } : undefined,
    });
    return response.data as {
      items: { id: string; purpose: string; mixed_note?: string; created_at?: string; summary?: string }[];
    };
  }

  async getCallLibrary(params?: { limit?: number; offset?: number }): Promise<CallLibraryListResponse> {
    const response = await this.client.get('/call-library', {
      params,
      timeout: 25000,
    });
    return response.data as CallLibraryListResponse;
  }

  async patchCallLibraryReport(reportId: string, callTitle: string): Promise<{ ok: boolean; id: string }> {
    const response = await this.client.patch(`/call-library/${reportId}`, { call_title: callTitle });
    return response.data as { ok: boolean; id: string };
  }

  /** Re-run LLM report for rows with failure_reason llm_failed (Refresh button also calls this). */
  async retryCallLibraryLlmFailed(): Promise<{ requeued: number }> {
    const response = await this.client.post('/call-library/retry-llm-failed', null, {
      timeout: 120000,
    });
    return response.data as { requeued: number };
  }

  // Tab Permissions
  async getMyTabPermissions() {
    const response = await this.client.get('/users/tabs/access');
    return response.data;
  }

  async checkTabAccess(tabName: string) {
    const response = await this.client.get(`/users/tabs/${tabName}/access`);
    return response.data;
  }

  async getUserTabPermissions(userId: string) {
    const response = await this.client.get(`/users/${userId}/tabs`);
    return response.data;
  }

  async createUserTabPermission(userId: string, data: any) {
    const response = await this.client.post(`/users/${userId}/tabs`, data);
    return response.data;
  }

  async updateUserTabPermission(userId: string, tabName: string, data: any) {
    const response = await this.client.patch(`/users/${userId}/tabs/${tabName}`, data);
    return response.data;
  }

  async deleteUserTabPermission(userId: string, tabName: string) {
    const response = await this.client.delete(`/users/${userId}/tabs/${tabName}`);
    return response.data;
  }

  // ----- Automation engine ----------------------------------------------------

  async listAutomationRules(): Promise<AutomationRule[]> {
    const response = await this.client.get('/automations/rules');
    return response.data as AutomationRule[];
  }

  async updateAutomationRule(
    playbook: AutomationPlaybook,
    body: AutomationRuleUpdate
  ): Promise<AutomationRule> {
    const response = await this.client.put(`/automations/rules/${playbook}`, body);
    return response.data as AutomationRule;
  }

  async listAutomationJobs(params?: {
    state?: AutomationJobState;
    playbook?: AutomationPlaybook;
    client_id?: string;
    limit?: number;
    offset?: number;
  }): Promise<AutomationEmailJobListResponse> {
    const response = await this.client.get('/automations/jobs', { params });
    return response.data as AutomationEmailJobListResponse;
  }

  async updateAutomationJobState(
    jobId: string,
    state: AutomationJobState
  ): Promise<AutomationEmailJob> {
    const response = await this.client.patch(`/automations/jobs/${jobId}/state`, { state });
    return response.data as AutomationEmailJob;
  }

  async getAutomationDispatcherHealth(): Promise<AutomationDispatcherHealth> {
    const response = await this.client.get('/automations/dispatcher/health');
    return response.data as AutomationDispatcherHealth;
  }

  async previewAutomationDraft(
    body: AutomationPreviewRequest
  ): Promise<AutomationPreviewResponse> {
    const response = await this.client.post('/automations/preview', body, { timeout: 60000 });
    return response.data as AutomationPreviewResponse;
  }

  async getOutreachInbox(
    params?: {
      include_performance?: boolean;
      include_automations?: boolean;
      limit?: number;
    },
    forceRefresh = false
  ): Promise<OutreachInboxResponse> {
    const cacheKey = `outreach_inbox_${orgIdFromAccessToken()}_${JSON.stringify(params || {})}`;
    if (!forceRefresh) {
      const cached = cache.get<OutreachInboxResponse>(cacheKey);
      if (cached != null) return cached;
    }

    const data = await withRetry(
      async () => {
        const response = await this.client.get('/outreach/inbox', {
          params: params || {},
          timeout: 60000,
        });
        return response.data as OutreachInboxResponse;
      },
      3,
      2000
    );
    cache.set(cacheKey, data, TERMINAL_CACHE_TTL_MS);
    return data;
  }
}

export const apiClient = new ApiClient();

