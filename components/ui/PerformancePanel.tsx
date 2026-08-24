'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  apiClient,
  AutomationPlaybook,
  OutreachInboxItem,
  PerformanceSnapshot,
  PerformanceTask,
  PerformanceTaskEmailDraft,
} from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { useLoading } from '@/contexts/LoadingContext';
import PipelineSnapshot from '@/components/pipeline/PipelineSnapshot';
import EmailComposer from '@/components/brevo/EmailComposer';
import {
  hydratePipelineStoreFromCache,
  peekPipelineColumnFilter,
  setPipelineColumnFilter,
} from '@/lib/pipelineStore';
import {
  hydratePerformanceApprovals,
  hydratePerformanceSnapshot,
  persistPerformanceApprovals,
  persistPerformanceSnapshot,
} from '@/lib/performancePrioritiesCache';
import { TERMINAL_DATA_REFRESHED_EVENT } from '@/lib/cache';
import {
  isTerminalRefreshInFlight,
  isTerminalSyncOnLoadPending,
} from '@/lib/terminalRefresh';
import { useRouter } from 'next/router';

type RxMap = Record<string, { why: string; prescription: string; next_step: string }>;
type DraftMap = Record<string, PerformanceTaskEmailDraft>;
type ComposerPayload = {
  recipients: Array<{ email: string; name?: string }>;
  subject: string;
  htmlContent: string;
  textContent: string;
};
/** Cap how many auto-drafts we kick off per snapshot load to keep LLM cost predictable. */
const AUTO_EMAIL_DRAFT_CAP = 6;
/** How long a just-completed priority stays in the open list with a checked visual before moving to Completed. */
const COMPLETE_VISUAL_GRACE_MS = 850;
/** Defer LLM prescription/draft batch so calendar + finance loads finish first. */
const PRESCRIPTION_DEFER_MS = 3200;
/** Defer approvals inbox while terminal session sync runs. */
const APPROVALS_DEFER_BUSY_MS = 2200;
const APPROVALS_DEFER_DEFAULT_MS = 700;
const APPROVALS_INBOX_LIMIT = 50;

/**
 * Each automation playbook maps to one or more focus tags that overlap with Performance
 * task ROI tags. Used both for the focus chips on approval rows and to dedupe Performance
 * tasks that recommend the same outreach for the same client (no double to-dos).
 */
const PLAYBOOK_FOCUS_TAGS: Record<AutomationPlaybook, string[]> = {
  pre_sale_post_booking: ['onboarding', 'sales_call_prep'],
  first_payment_onboarding: ['onboarding'],
  first_payment_referral: ['referral'],
  win_combined_ask: ['referral', 'upsell', 'testimonial'],
  offboarding_recap_ask: ['offboarding', 'win_back', 're_sign'],
};

const PLAYBOOK_LABEL: Record<AutomationPlaybook, string> = {
  pre_sale_post_booking: 'Post-booking · pre-sale primer',
  first_payment_onboarding: 'Onboarding email',
  first_payment_referral: 'Referral ask · first payment',
  win_combined_ask: 'Win-detected combined ask',
  offboarding_recap_ask: 'Offboarding recap & ask',
};

const FOCUS_TAG_LABEL: Record<string, string> = {
  referral: 'Referral',
  upsell: 'Upsell',
  testimonial: 'Testimonial',
  onboarding: 'Onboarding',
  offboarding: 'Offboarding',
  win_back: 'Win back',
  re_sign: 'Re-sign',
  conversion: 'Conversion',
  deal_follow_up: 'Deal follow-up',
  revive: 'Revive',
};

function focusTagsForPlaybook(playbook?: AutomationPlaybook | null): string[] {
  if (!playbook) return [];
  return PLAYBOOK_FOCUS_TAGS[playbook] ?? [];
}

function focusChipLabel(tag: string): string {
  return FOCUS_TAG_LABEL[tag] ?? tag.replace(/_/g, ' ');
}

function recipientsForTask(
  task: PerformanceTask,
  draft?: PerformanceTaskEmailDraft
): Array<{ email: string; name?: string }> {
  const ev = (task.evidence || {}) as Record<string, unknown>;
  const email = (draft?.client_email || (ev.client_email as string) || '').trim();
  if (!email) return [];
  const name = ((ev.client_name as string) || '').trim() || undefined;
  return [{ email, name }];
}

function composerPayloadFrom(
  task: PerformanceTask,
  draft: PerformanceTaskEmailDraft
): ComposerPayload {
  return {
    recipients: recipientsForTask(task, draft),
    subject: draft.subject || '',
    htmlContent: draft.body_html || '',
    textContent: draft.body_plain || '',
  };
}

function severityStyles(level: string): string {
  const v = (level || 'ok').toLowerCase();
  if (v === 'risk') return 'bg-red-500/15 text-red-800 dark:text-red-200 ring-1 ring-red-500/30';
  if (v === 'watch') return 'bg-amber-500/15 text-amber-900 dark:text-amber-100 ring-1 ring-amber-500/30';
  return 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-100 ring-1 ring-emerald-500/25';
}

function formatUsd(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function formatPct(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(0)}%`;
}

interface PerformancePanelProps {
  /** `embedded` — inline in Terminal tab; `standalone` — full-width page (legacy). */
  variant?: 'embedded' | 'standalone' | 'drawer';
}

export default function PerformancePanel({ variant = 'standalone' }: PerformancePanelProps) {
  const router = useRouter();
  const { setLoading: setGlobalLoading } = useLoading();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snap, setSnap] = useState<PerformanceSnapshot | null>(null);
  const [tasks, setTasks] = useState<PerformanceTask[]>([]);
  const [rx, setRx] = useState<RxMap>({});
  const [rxStatus, setRxStatus] = useState<'idle' | 'loading' | 'done' | 'skipped'>('idle');
  const [patching, setPatching] = useState(false);
  const [drafts, setDrafts] = useState<DraftMap>({});
  /** Per-task email-generation status (UI only). */
  const [draftStatus, setDraftStatus] = useState<Record<string, 'loading' | 'done' | 'error'>>({});
  const [draftBatchStatus, setDraftBatchStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  /** EmailComposer modal mounted at the panel root. */
  const [composer, setComposer] = useState<ComposerPayload | null>(null);
  /** When set, auto-open the composer the moment a draft for this task lands (after Generate-from-row click). */
  const [pendingComposerTaskId, setPendingComposerTaskId] = useState<string | null>(null);
  /** Per-task error surfaced when there's no email on the client to send to. */
  const [composerErrors, setComposerErrors] = useState<Record<string, string>>({});
  /** Single-shot reanalyze button state (snapshot + prescription + drafts batch). */
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeNotice, setReanalyzeNotice] = useState<string | null>(null);
  /** LLM prescription + email-draft batch run once per mounted panel lifetime; later refreshes go through Re-analyze. */
  const prescriptionRequestedRef = useRef(false);
  /** After first successful snapshot we soft-refresh without full-page skeleton. */
  const hasSnapshotDataRef = useRef(false);
  /** Task ids that are persisted as completed but still shown under open priorities until grace elapses. */
  const [completingGraceIds, setCompletingGraceIds] = useState<Set<string>>(() => new Set());
  const completingGraceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Automation jobs awaiting human approval — rendered at the top of the priority list. */
  const [approvals, setApprovals] = useState<OutreachInboxItem[]>([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState<Record<string, 'approve' | 'decline' | undefined>>({});
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const hasApprovalsDataRef = useRef(false);

  const clearAllCompletingGrace = useCallback(() => {
    completingGraceTimersRef.current.forEach((t) => clearTimeout(t));
    completingGraceTimersRef.current.clear();
    setCompletingGraceIds(new Set());
  }, []);

  const scheduleCompletingGrace = useCallback((id: string) => {
    const prevTimer = completingGraceTimersRef.current.get(id);
    if (prevTimer) clearTimeout(prevTimer);
    setCompletingGraceIds((s) => {
      const n = new Set(s);
      n.add(id);
      return n;
    });
    const t = setTimeout(() => {
      completingGraceTimersRef.current.delete(id);
      setCompletingGraceIds((s) => {
        if (!s.has(id)) return s;
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, COMPLETE_VISUAL_GRACE_MS);
    completingGraceTimersRef.current.set(id, t);
  }, []);

  const cancelCompletingGrace = useCallback((id: string) => {
    const prevTimer = completingGraceTimersRef.current.get(id);
    if (prevTimer) {
      clearTimeout(prevTimer);
      completingGraceTimersRef.current.delete(id);
    }
    setCompletingGraceIds((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  }, []);

  useEffect(() => {
    return () => {
      completingGraceTimersRef.current.forEach((t) => clearTimeout(t));
      completingGraceTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    hydratePipelineStoreFromCache();
    const cachedSnap = hydratePerformanceSnapshot();
    if (cachedSnap) {
      setSnap(cachedSnap);
      setTasks(cachedSnap.tasks || []);
      hasSnapshotDataRef.current = true;
      setLoading(false);
      const seededDrafts: DraftMap = {};
      for (const d of cachedSnap.drafts || []) {
        if (d?.task_id) seededDrafts[d.task_id] = d;
      }
      setDrafts(seededDrafts);
    }
    const cachedApprovals = hydratePerformanceApprovals();
    if (cachedApprovals) {
      setApprovals(cachedApprovals);
      hasApprovalsDataRef.current = true;
    }
    setPipelineFilter(peekPipelineColumnFilter());
    const syncPipelineFilter = () => setPipelineFilter(peekPipelineColumnFilter());
    document.addEventListener('visibilitychange', syncPipelineFilter);
    window.addEventListener('focus', syncPipelineFilter);
    return () => {
      document.removeEventListener('visibilitychange', syncPipelineFilter);
      window.removeEventListener('focus', syncPipelineFilter);
    };
  }, []);

  const generateDraftsBatch = useCallback(
    async (candidateTaskIds: string[], { force = false }: { force?: boolean } = {}) => {
      const ids = candidateTaskIds.slice(0, AUTO_EMAIL_DRAFT_CAP);
      if (ids.length === 0) {
        setDraftBatchStatus('done');
        return;
      }
      setDraftBatchStatus('loading');
      setDraftStatus((prev) => {
        const next = { ...prev };
        for (const id of ids) next[id] = 'loading';
        return next;
      });
      try {
        const res = await apiClient.postPerformanceEmailDrafts(ids, { force });
        setDrafts((prev) => {
          const next = { ...prev };
          for (const d of res.drafts || []) {
            if (d?.task_id) next[d.task_id] = d;
          }
          return next;
        });
        setDraftStatus((prev) => {
          const next = { ...prev };
          const made = new Set((res.drafts || []).map((d) => d.task_id));
          const skipped = new Set(res.skipped || []);
          for (const id of ids) {
            if (made.has(id)) next[id] = 'done';
            else if (skipped.has(id)) next[id] = 'error';
            else next[id] = 'error';
          }
          return next;
        });
        setDraftBatchStatus('done');
      } catch {
        setDraftStatus((prev) => {
          const next = { ...prev };
          for (const id of ids) next[id] = 'error';
          return next;
        });
        setDraftBatchStatus('error');
      }
    },
    []
  );

  const requestPrescriptionsAndDrafts = useCallback(
    async (snapshot: PerformanceSnapshot) => {
      const seededDrafts: DraftMap = {};
      for (const d of snapshot.drafts || []) {
        if (d?.task_id) seededDrafts[d.task_id] = d;
      }
      setDrafts(seededDrafts);

      setRxStatus('loading');
      try {
        const pr = await apiClient.postPerformancePrescription();
        const m: RxMap = {};
        for (const t of pr.tasks || []) {
          m[t.id] = {
            why: t.why || '',
            prescription: t.prescription || '',
            next_step: t.next_step || '',
          };
        }
        setRx(m);
        setRxStatus('done');
      } catch {
        setRxStatus('skipped');
      }

      const eligible = (snapshot.tasks || [])
        .filter((t) => !t.completed)
        .filter((t) => {
          const ev = t.evidence as Record<string, unknown> | undefined;
          return Boolean(ev?.client_id);
        })
        .sort((a, b) => b.impact_score - a.impact_score)
        .map((t) => t.id)
        .filter((id) => !seededDrafts[id]);

      if (eligible.length > 0) {
        await generateDraftsBatch(eligible);
      } else {
        setDraftBatchStatus('done');
      }
    },
    [generateDraftsBatch]
  );

  const loadSnapshot = useCallback(
    async ({
      runFollowups = true,
      force = false,
    }: { runFollowups?: boolean; force?: boolean } = {}) => {
      if (!hasSnapshotDataRef.current) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await apiClient.getPerformanceSnapshot(force);
        setError(null);
        setSnap(data);
        setTasks(data.tasks || []);
        const seededDrafts: DraftMap = {};
        for (const d of data.drafts || []) {
          if (d?.task_id) seededDrafts[d.task_id] = d;
        }
        setDrafts(seededDrafts);
        hasSnapshotDataRef.current = true;
        setLoading(false);
        setGlobalLoading(false);
        // Server is source of truth — drop any in-flight “stay in open list” grace so lists match API.
        clearAllCompletingGrace();

        persistPerformanceSnapshot(data);

        if (runFollowups && !prescriptionRequestedRef.current) {
          prescriptionRequestedRef.current = true;
          window.setTimeout(() => {
            void requestPrescriptionsAndDrafts(data);
          }, PRESCRIPTION_DEFER_MS);
        }
        return data;
      } catch (e: unknown) {
        setError(formatApiError(e, 'Failed to load performance data'));
        if (!hasSnapshotDataRef.current) {
          setSnap(null);
          setTasks([]);
        }
        setLoading(false);
        setGlobalLoading(false);
        return null;
      }
    },
    [clearAllCompletingGrace, requestPrescriptionsAndDrafts, setGlobalLoading]
  );

  /** Pull only the awaiting-approval portion of the unified inbox; performance tasks come from the snapshot. */
  const loadApprovals = useCallback(async (opts?: { silent?: boolean; force?: boolean }) => {
    if (!opts?.silent && !hasApprovalsDataRef.current) {
      setApprovalsLoading(true);
    }
    setApprovalError(null);
    try {
      const res = await apiClient.getOutreachInbox(
        {
          include_performance: false,
          include_automations: true,
          limit: APPROVALS_INBOX_LIMIT,
        },
        !!opts?.force
      );
      const pending = (res.items || []).filter(
        (it) => it.source === 'automation_job' && it.requires_approval,
      );
      setApprovals(pending);
      persistPerformanceApprovals(pending);
      hasApprovalsDataRef.current = true;
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as Error)?.message ||
        'Could not load automation approvals';
      setApprovalError(String(msg));
    } finally {
      setApprovalsLoading(false);
    }
  }, []);

  const onApproveAutomation = useCallback(
    async (item: OutreachInboxItem) => {
      const jobId = item.id.replace(/^automation:/, '');
      setApprovalBusy((m) => ({ ...m, [item.id]: 'approve' }));
      setApprovalError(null);
      try {
        await apiClient.updateAutomationJobState(jobId, 'ready');
        setApprovals((curr) => curr.filter((i) => i.id !== item.id));
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (e as Error)?.message ||
          'Could not approve';
        setApprovalError(String(msg));
        await loadApprovals();
      } finally {
        setApprovalBusy((m) => {
          const next = { ...m };
          delete next[item.id];
          return next;
        });
      }
    },
    [loadApprovals],
  );

  const onDeclineAutomation = useCallback(
    async (item: OutreachInboxItem) => {
      const jobId = item.id.replace(/^automation:/, '');
      setApprovalBusy((m) => ({ ...m, [item.id]: 'decline' }));
      setApprovalError(null);
      try {
        await apiClient.updateAutomationJobState(jobId, 'canceled');
        setApprovals((curr) => curr.filter((i) => i.id !== item.id));
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (e as Error)?.message ||
          'Could not decline';
        setApprovalError(String(msg));
        await loadApprovals();
      } finally {
        setApprovalBusy((m) => {
          const next = { ...m };
          delete next[item.id];
          return next;
        });
      }
    },
    [loadApprovals],
  );

  const handleReanalyze = useCallback(async () => {
    if (reanalyzing) return;
    setReanalyzing(true);
    setReanalyzeNotice(null);
    void loadApprovals({ force: true });
    const notices: string[] = [];
    try {
      // loadSnapshot swallows API errors and returns null (it also sets panel `error` state).
      const data = await loadSnapshot({ runFollowups: false });
      if (!data) {
        notices.push(
          'Could not refresh pipeline snapshot. Check your connection, reload if needed, and try Re-analyze again.'
        );
        return;
      }
      // Force a fresh prescription pass.
      setRxStatus('loading');
      try {
        const pr = await apiClient.postPerformancePrescription();
        const m: RxMap = {};
        for (const t of pr.tasks || []) {
          m[t.id] = {
            why: t.why || '',
            prescription: t.prescription || '',
            next_step: t.next_step || '',
          };
        }
        setRx(m);
        setRxStatus('done');
      } catch (e: unknown) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 429) {
          notices.push('Rate limit reached for AI re-analysis — try again shortly.');
        } else {
          notices.push(formatApiError(e, 'AI prescriptions could not be refreshed.'));
        }
        setRxStatus('skipped');
      }
      // Force-regenerate emails for the top eligible tasks.
      const eligible = (data.tasks || [])
        .filter((t) => !t.completed)
        .filter((t) => {
          const ev = t.evidence as Record<string, unknown> | undefined;
          return Boolean(ev?.client_id);
        })
        .sort((a, b) => b.impact_score - a.impact_score)
        .map((t) => t.id);
      if (eligible.length > 0) {
        try {
          await generateDraftsBatch(eligible, { force: true });
        } catch (e: unknown) {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status === 429) {
            notices.push('Rate limit reached for email drafts — try again shortly.');
          } else {
            notices.push(formatApiError(e, 'Email drafts could not be regenerated.'));
          }
        }
      }
    } finally {
      setReanalyzing(false);
      if (notices.length) {
        setReanalyzeNotice(notices.filter(Boolean).join(' — '));
      }
    }
  }, [generateDraftsBatch, loadApprovals, loadSnapshot, reanalyzing]);

  const generateDraftForTask = useCallback(
    async (taskId: string, { force = false }: { force?: boolean } = {}) => {
      setDraftStatus((prev) => ({ ...prev, [taskId]: 'loading' }));
      try {
        const res = await apiClient.postPerformanceEmailDrafts([taskId], { force });
        const made = (res.drafts || []).find((d) => d.task_id === taskId);
        if (made) {
          setDrafts((prev) => ({ ...prev, [taskId]: made }));
          setDraftStatus((prev) => ({ ...prev, [taskId]: 'done' }));
          return made;
        }
        setDraftStatus((prev) => ({ ...prev, [taskId]: 'error' }));
        return null;
      } catch {
        setDraftStatus((prev) => ({ ...prev, [taskId]: 'error' }));
        return null;
      }
    },
    []
  );

  const tryOpenComposerWith = useCallback((task: PerformanceTask, draft: PerformanceTaskEmailDraft) => {
    const payload = composerPayloadFrom(task, draft);
    if (payload.recipients.length === 0) {
      setComposerErrors((prev) => ({
        ...prev,
        [task.id]: 'No email on file for this client — add one to their contact, then re-open.',
      }));
      return;
    }
    setComposerErrors((prev) => {
      if (!(task.id in prev)) return prev;
      const next = { ...prev };
      delete next[task.id];
      return next;
    });
    setComposer(payload);
  }, []);

  /**
   * Open the email composer modal for a task. If no draft exists yet, generate one first
   * (Performance auto-batches drafts on load, so this is mostly for stragglers / regenerate).
   */
  const openComposerForTask = useCallback(
    async (task: PerformanceTask, { force = false }: { force?: boolean } = {}) => {
      const existing = drafts[task.id];
      if (existing && !force) {
        tryOpenComposerWith(task, existing);
        return;
      }
      setPendingComposerTaskId(task.id);
      const made = await generateDraftForTask(task.id, { force });
      if (!made) {
        setPendingComposerTaskId((curr) => (curr === task.id ? null : curr));
      }
    },
    [drafts, generateDraftForTask, tryOpenComposerWith]
  );

  // Auto-open the composer when the draft we asked for arrives.
  useEffect(() => {
    if (!pendingComposerTaskId) return;
    const draft = drafts[pendingComposerTaskId];
    if (!draft) return;
    const task = tasks.find((t) => t.id === pendingComposerTaskId);
    if (!task) {
      setPendingComposerTaskId(null);
      return;
    }
    tryOpenComposerWith(task, draft);
    setPendingComposerTaskId(null);
  }, [drafts, pendingComposerTaskId, tasks, tryOpenComposerWith]);

  useEffect(() => {
    const delayMs =
      isTerminalSyncOnLoadPending() || isTerminalRefreshInFlight()
        ? APPROVALS_DEFER_BUSY_MS
        : APPROVALS_DEFER_DEFAULT_MS;
    const snapshotTimer = window.setTimeout(() => {
      void loadSnapshot();
    }, delayMs);
    return () => window.clearTimeout(snapshotTimer);
  }, [loadSnapshot]);

  useEffect(() => {
    const delayMs =
      isTerminalSyncOnLoadPending() || isTerminalRefreshInFlight()
        ? APPROVALS_DEFER_BUSY_MS + 400
        : APPROVALS_DEFER_DEFAULT_MS + 400;
    const approvalsTimer = window.setTimeout(() => {
      void loadApprovals();
    }, delayMs);
    return () => window.clearTimeout(approvalsTimer);
  }, [loadApprovals]);

  useEffect(() => {
    const onTerminalRefresh = () => {
      void loadSnapshot({ runFollowups: false });
      void loadApprovals({ silent: true });
    };
    window.addEventListener(TERMINAL_DATA_REFRESHED_EVENT, onTerminalRefresh);
    return () => window.removeEventListener(TERMINAL_DATA_REFRESHED_EVENT, onTerminalRefresh);
  }, [loadApprovals, loadSnapshot]);

  /**
   * For each pending automation approval, build a (client_id → focus_tag set) map.
   * A Performance task is suppressed from the open list when the same client already
   * has an awaiting-approval automation whose focus tags intersect the task's roi_tags.
   * This prevents the same to-do appearing twice (e.g. "Ask Jane for a referral" perf
   * task while a `first_payment_referral` automation is queued for Jane).
   */
  const approvalDedupeMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const it of approvals) {
      if (!it.client_id) continue;
      const tags = focusTagsForPlaybook(it.playbook ?? null);
      if (tags.length === 0) continue;
      const existing = map.get(it.client_id) ?? new Set<string>();
      for (const t of tags) existing.add(t);
      map.set(it.client_id, existing);
    }
    return map;
  }, [approvals]);

  const isPerfTaskSupersededByApproval = useCallback(
    (task: PerformanceTask): boolean => {
      const ev = (task.evidence || {}) as Record<string, unknown>;
      const cid = typeof ev.client_id === 'string' ? ev.client_id : null;
      if (!cid) return false;
      const tagSet = approvalDedupeMap.get(cid);
      if (!tagSet || tagSet.size === 0) return false;
      const taskTags = Array.isArray(ev.roi_tags) ? (ev.roi_tags as unknown[]) : [];
      for (const raw of taskTags) {
        if (typeof raw !== 'string') continue;
        if (tagSet.has(raw.toLowerCase())) return true;
      }
      return false;
    },
    [approvalDedupeMap],
  );

  const { topOpen, backlogOpen, completedTasks } = useMemo(() => {
    const open = tasks
      .filter((t) => !t.completed || completingGraceIds.has(t.id))
      .filter((t) => !isPerfTaskSupersededByApproval(t))
      .sort((a, b) => b.impact_score - a.impact_score);
    const done = tasks
      .filter((t) => t.completed && !completingGraceIds.has(t.id))
      .sort((a, b) => b.impact_score - a.impact_score);
    return {
      topOpen: open.slice(0, 10),
      backlogOpen: open.slice(10, 40),
      completedTasks: done,
    };
  }, [tasks, completingGraceIds, isPerfTaskSupersededByApproval]);

  const flushCompleted = useCallback(
    async (nextTasks: PerformanceTask[]) => {
      const ids = nextTasks.filter((t) => t.completed).map((t) => t.id);
      setPatching(true);
      try {
        await apiClient.patchPerformanceTasks(ids);
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          (e as Error)?.message ||
          'Could not save';
        setError(String(msg));
        await loadSnapshot();
      } finally {
        setPatching(false);
      }
    },
    [loadSnapshot]
  );

  const toggleCompleted = (id: string) => {
    const current = tasks.find((t) => t.id === id);
    if (!current) return;
    const willComplete = !current.completed;
    if (willComplete) {
      scheduleCompletingGrace(id);
    } else {
      cancelCompletingGrace(id);
    }
    const next = tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTasks(next);
    void flushCompleted(next);
  };

  const diagnosis = snap?.diagnosis;

  const handlePipelineSnapshotFilter = useCallback(
    (column: string | null) => {
      setPipelineFilter(column);
      setPipelineColumnFilter(column);
      router.push({ pathname: '/', query: { tab: 'pipeline' } }, undefined, { shallow: true });
    },
    [router]
  );

  if (loading && !snap) {
    return (
      <div
        className={`w-full space-y-4 animate-pulse px-1 ${
          variant === 'embedded' ? 'max-w-none' : 'max-w-3xl mx-auto'
        }`}
      >
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/3" />
        <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    );
  }

  if (error && !snap) {
    return (
      <div className="w-full max-w-lg mx-auto glass-card p-6 text-center">
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button type="button" onClick={() => loadSnapshot({ force: true })} className="glass-button px-4 py-2 rounded-md text-sm">
          Retry
        </button>
      </div>
    );
  }

  const reanalyzeButton = (
    <button
      type="button"
      onClick={() => void handleReanalyze()}
      disabled={reanalyzing}
      aria-busy={reanalyzing}
      title="Re-pull pipeline signals, re-run AI prescriptions, and regenerate emails for top tasks (rate limited)."
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/15 bg-white/70 dark:bg-white/5 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        className={`h-3.5 w-3.5 ${reanalyzing ? 'animate-spin' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {reanalyzing ? 'Re-analyzing…' : 'Re-analyze'}
    </button>
  );

  const instructionLine = (
    <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
      Tasks blend org metrics, per-client ROI signals from call drawers, your Intelligence pipeline order, and your
      offer ladder — every prescription and auto-drafted email proposes the next move toward ROI from that ladder.
    </p>
  );

  return (
    <div
      className={`w-full mx-auto px-1 ${
        variant === 'embedded' ? 'max-w-none pb-2' : variant === 'drawer' ? 'max-w-none pb-8' : 'max-w-3xl pb-12'
      }`}
    >
      {variant === 'embedded' ? (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0 flex-1">{instructionLine}</div>
          {reanalyzeButton}
        </div>
      ) : variant === 'drawer' ? (
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-end">{reanalyzeButton}</div>
          {instructionLine}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Priorities</h2>
            <div className="mt-1">{instructionLine}</div>
          </div>
          {reanalyzeButton}
        </div>
      )}

      {reanalyzeNotice && (
        <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">{reanalyzeNotice}</p>
      )}

      <div className="mb-6">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Cold Lead → Nurturing → Qualified → Booked → Active → Offboarding → Dead
        </p>
        <PipelineSnapshot
          onFilterChange={handlePipelineSnapshotFilter}
          activeFilter={pipelineFilter}
          isActive
          footerHint="Click a stage to open the Pipeline tab and filter the board. Click again to clear."
        />
      </div>

      {diagnosis && (
        <div className="glass-card neon-glow p-4 mb-6 rounded-xl">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            Pipeline signals
          </p>
          <div className="flex flex-wrap gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityStyles(diagnosis.traffic)}`}>
              Traffic: {diagnosis.traffic}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityStyles(diagnosis.nurture)}`}>
              Nurture: {diagnosis.nurture}
            </span>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityStyles(diagnosis.conversion)}`}>
              Conversion: {diagnosis.conversion}
            </span>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-3 leading-relaxed">
            {diagnosis.traffic_hint} {diagnosis.nurture_hint} {diagnosis.conversion_hint}
          </p>

          {(diagnosis.revenue_compare || diagnosis.funnel_compare) && (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {diagnosis.revenue_compare && (
                <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 border border-gray-200/60 dark:border-gray-600/40">
                  <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Cash & MRR</p>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-300">
                    <li>
                      Rolling 30d:{' '}
                      <strong className="text-gray-900 dark:text-gray-100">
                        {formatUsd(diagnosis.revenue_compare.cash_last_30_days)}
                      </strong>
                      {diagnosis.revenue_compare.pct_change_30d != null &&
                      diagnosis.revenue_compare.pct_change_30d !== undefined ? (
                        <span
                          className={
                            diagnosis.revenue_compare.pct_change_30d < 0
                              ? ' text-red-600 dark:text-red-400'
                              : diagnosis.revenue_compare.pct_change_30d > 0
                                ? ' text-emerald-600 dark:text-emerald-400'
                                : ''
                          }
                        >
                          {' '}
                          ({formatPct(diagnosis.revenue_compare.pct_change_30d)} vs prior 30d)
                        </span>
                      ) : null}
                    </li>
                    <li className="text-gray-500 dark:text-gray-400">
                      Prior 30d: {formatUsd(diagnosis.revenue_compare.cash_prior_30_days)}
                    </li>
                    <li>
                      MTD vs same days last month:{' '}
                      <strong>{formatUsd(diagnosis.revenue_compare.cash_mtd)}</strong>
                      {diagnosis.revenue_compare.pct_change_mtd != null &&
                      diagnosis.revenue_compare.pct_change_mtd !== undefined ? (
                        <span
                          className={
                            diagnosis.revenue_compare.pct_change_mtd < 0
                              ? ' text-red-600 dark:text-red-400'
                              : diagnosis.revenue_compare.pct_change_mtd > 0
                                ? ' text-emerald-600 dark:text-emerald-400'
                                : ''
                          }
                        >
                          {' '}
                          ({formatPct(diagnosis.revenue_compare.pct_change_mtd)})
                        </span>
                      ) : null}
                    </li>
                    <li className="text-gray-500 dark:text-gray-400">
                      Same span prior month: {formatUsd(diagnosis.revenue_compare.cash_mtd_prev_month_same_range)}
                    </li>
                    {typeof diagnosis.revenue_compare.mrr === 'number' ? (
                      <li>
                        MRR:{' '}
                        <strong className="text-gray-900 dark:text-gray-100">
                          {formatUsd(diagnosis.revenue_compare.mrr)}
                        </strong>
                      </li>
                    ) : null}
                  </ul>
                </div>
              )}
              {diagnosis.funnel_compare && (
                <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2.5 border border-gray-200/60 dark:border-gray-600/40">
                  <p className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Funnel (blended, last 30d)</p>
                  <ul className="space-y-1 text-gray-600 dark:text-gray-300">
                    <li>
                      Visitors:{' '}
                      <strong>{diagnosis.funnel_compare.visitors_last_30 ?? 0}</strong>
                      {diagnosis.funnel_compare.pct_change_visitors != null &&
                      diagnosis.funnel_compare.pct_change_visitors !== undefined ? (
                        <span
                          className={
                            diagnosis.funnel_compare.pct_change_visitors < 0
                              ? ' text-red-600 dark:text-red-400'
                              : diagnosis.funnel_compare.pct_change_visitors > 0
                                ? ' text-emerald-600 dark:text-emerald-400'
                                : ''
                          }
                        >
                          {' '}
                          ({formatPct(diagnosis.funnel_compare.pct_change_visitors)} vs prior 30d)
                        </span>
                      ) : null}
                    </li>
                    <li className="text-gray-500 dark:text-gray-400">
                      Prior 30d visitors: {diagnosis.funnel_compare.visitors_prior_30 ?? 0}
                    </li>
                    <li>
                      Conversions:{' '}
                      <strong>{diagnosis.funnel_compare.conversions_last_30 ?? 0}</strong>
                      {diagnosis.funnel_compare.pct_change_conversions != null &&
                      diagnosis.funnel_compare.pct_change_conversions !== undefined ? (
                        <span
                          className={
                            diagnosis.funnel_compare.pct_change_conversions < 0
                              ? ' text-red-600 dark:text-red-400'
                              : diagnosis.funnel_compare.pct_change_conversions > 0
                                ? ' text-emerald-600 dark:text-emerald-400'
                                : ''
                          }
                        >
                          {' '}
                          ({formatPct(diagnosis.funnel_compare.pct_change_conversions)})
                        </span>
                      ) : null}
                    </li>
                    <li>
                      Conv. rate:{' '}
                      <strong>
                        {(diagnosis.funnel_compare.conversion_rate_last_30 ?? 0).toFixed(1)}%
                      </strong>
                      <span className="text-gray-500 dark:text-gray-400">
                        {' '}
                        (was {(diagnosis.funnel_compare.conversion_rate_prior_30 ?? 0).toFixed(1)}%)
                      </span>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          )}

          {diagnosis.insights && diagnosis.insights.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-gray-700 dark:text-gray-200 list-disc list-inside leading-relaxed">
              {diagnosis.insights.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {rxStatus === 'loading' && (
        <p className="text-xs text-violet-600 dark:text-violet-400 mb-3">Tailoring copy to your Intelligence profile…</p>
      )}
      {rxStatus === 'skipped' && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Showing baseline recommendations (AI optional).</p>
      )}

      {error && snap && <p className="text-sm text-amber-600 dark:text-amber-400 mb-3">{error}</p>}

      <section className="mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">Top priorities</h3>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3 leading-snug">
          Automations awaiting your approval are pinned at the top of the queue, followed by the
          highest-ROI Performance tasks — each tailored to your voice, the client&apos;s ROI signals, and the next
          rung on your offer ladder. Click <span className="font-medium text-gray-600 dark:text-gray-300">Open email</span>{' '}
          on a task to review and send via Brevo, or Approve / Decline an automation in place. Use Re-analyze to
          refresh after new calls or pipeline changes.
          {draftBatchStatus === 'loading' ? ' Drafting emails…' : ''}
          {approvalsLoading && approvals.length === 0 ? ' Checking approvals…' : ''}
        </p>
        {approvalError && (
          <p className="text-xs text-amber-700 dark:text-amber-300 mb-2">{approvalError}</p>
        )}
        {topOpen.length === 0 && approvals.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 glass-card p-4 rounded-xl">
            No open tasks or pending approvals — great job. Refresh after new leads or funnel traffic.
          </p>
        ) : (
          <ul className="space-y-3">
            {approvals.map((it) => (
              <ApprovalRow
                key={it.id}
                item={it}
                busy={approvalBusy[it.id]}
                onApprove={() => void onApproveAutomation(it)}
                onDecline={() => void onDeclineAutomation(it)}
              />
            ))}
            {topOpen.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                rx={rx[t.id]}
                draft={drafts[t.id]}
                draftStatus={draftStatus[t.id]}
                pendingComposer={pendingComposerTaskId === t.id}
                composerError={composerErrors[t.id]}
                completingGrace={completingGraceIds.has(t.id) && t.completed}
                onOpenEmail={(force) => void openComposerForTask(t, { force })}
                disabled={patching}
                onToggle={() => toggleCompleted(t.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {backlogOpen.length > 0 && (
        <details className="glass-card rounded-xl mb-6 group">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800 dark:text-gray-200 list-none flex items-center justify-between">
            <span>Backlog ({backlogOpen.length})</span>
            <span className="text-gray-400 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <ul className="px-4 pb-4 space-y-3 border-t border-gray-200/50 dark:border-gray-700/50 pt-3">
            {backlogOpen.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                rx={rx[t.id]}
                draft={drafts[t.id]}
                draftStatus={draftStatus[t.id]}
                pendingComposer={pendingComposerTaskId === t.id}
                composerError={composerErrors[t.id]}
                completingGrace={completingGraceIds.has(t.id) && t.completed}
                onOpenEmail={(force) => void openComposerForTask(t, { force })}
                disabled={patching}
                onToggle={() => toggleCompleted(t.id)}
              />
            ))}
          </ul>
        </details>
      )}

      {completedTasks.length > 0 && (
        <details className="glass-card rounded-xl">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-600 dark:text-gray-400 list-none">
            Completed ({completedTasks.length})
          </summary>
          <ul className="px-4 pb-4 space-y-3 opacity-90 pt-2">
            {completedTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                rx={rx[t.id]}
                draft={drafts[t.id]}
                draftStatus={draftStatus[t.id]}
                pendingComposer={pendingComposerTaskId === t.id}
                composerError={composerErrors[t.id]}
                completingGrace={false}
                onOpenEmail={(force) => void openComposerForTask(t, { force })}
                disabled={patching}
                onToggle={() => toggleCompleted(t.id)}
              />
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-500 mt-8 text-center">
        {snap?.generated_at ? `Snapshot ${new Date(snap.generated_at).toLocaleString()}` : ''}
      </p>

      {composer && composer.recipients.length > 0 && (
        <EmailComposer
          key={`perf-email-${composer.recipients[0]?.email ?? 'blank'}-${composer.subject}-${composer.textContent.length}`}
          recipients={composer.recipients}
          initialSubject={composer.subject}
          initialHtmlContent={composer.htmlContent}
          initialTextContent={composer.textContent}
          onClose={() => setComposer(null)}
          onSuccess={() => setComposer(null)}
        />
      )}
    </div>
  );
}

function TaskRow({
  task,
  rx,
  draft,
  draftStatus,
  pendingComposer,
  composerError,
  completingGrace,
  onOpenEmail,
  disabled,
  onToggle,
}: {
  task: PerformanceTask;
  rx?: { why: string; prescription: string; next_step: string };
  draft?: PerformanceTaskEmailDraft;
  draftStatus?: 'loading' | 'done' | 'error';
  pendingComposer?: boolean;
  composerError?: string;
  /** True while the row stays in open priorities after check — before it slides to Completed. */
  completingGrace?: boolean;
  onOpenEmail?: (force?: boolean) => void;
  disabled: boolean;
  onToggle: () => void;
}) {
  const why = (rx?.why || task.why || '').trim();
  const prescription = (rx?.prescription || task.prescription || '').trim();
  const nextStep = (rx?.next_step || task.next_step || '').trim();
  const actions = task.recommended_actions?.filter(Boolean) || [];
  const fix = actions[0] || prescription;
  const ev = task.evidence as Record<string, unknown> | undefined;
  const fromTerminal = ev?.source === 'client_card';
  const fromRoi = ev?.source === 'call_insight_roi';
  const hasClient = Boolean(ev?.client_id);
  const roiTags = Array.isArray(ev?.roi_tags) ? (ev.roi_tags as string[]).filter(Boolean) : [];
  const healthLabel =
    typeof ev?.health_score === 'number' ? `${(ev.health_score as number).toFixed(0)} health` : null;
  const offerSuggestion = (() => {
    const raw = (ev as Record<string, unknown> | undefined)?.offer_suggestion;
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    return {
      kind_label: typeof o.kind_label === 'string' ? o.kind_label : '',
      name: typeof o.name === 'string' ? o.name : '',
      promise: typeof o.promise === 'string' ? o.promise : '',
      rationale: typeof o.rationale === 'string' ? o.rationale : '',
      script_hint: typeof o.script_hint === 'string' ? o.script_hint : '',
    };
  })();

  const evidenceEntries = (() => {
    if (!ev || typeof ev !== 'object') return [] as [string, string][];
    const skip = new Set(['source', 'roi_tags', 'offer_suggestion']);
    const rows: [string, string][] = [];
    for (const [k, v] of Object.entries(ev)) {
      if (skip.has(k) || v === undefined || v === null) continue;
      if (typeof v === 'object') {
        rows.push([k, JSON.stringify(v)]);
      } else {
        rows.push([k, String(v)]);
      }
    }
    return rows;
  })();

  const archivedStyle = task.completed && !completingGrace;

  return (
    <li
      className={`glass-card rounded-xl overflow-hidden transition-[opacity,box-shadow,background-color] duration-300 ${
        completingGrace
          ? 'ring-2 ring-emerald-500/40 border border-emerald-500/30 bg-emerald-500/[0.07] dark:bg-emerald-950/20'
          : ''
      } ${archivedStyle ? 'opacity-75' : ''}`}
    >
      <div className="flex gap-3 p-4">
        <input
          type="checkbox"
          checked={task.completed}
          onChange={onToggle}
          disabled={disabled}
          className="mt-1.5 h-4 w-4 shrink-0 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
          aria-label={`Mark complete: ${task.title}`}
          onClick={(e) => e.stopPropagation()}
        />
        <details className="group min-w-0 flex-1">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className={`flex flex-wrap items-baseline gap-2 ${archivedStyle ? 'line-through' : ''}`}>
                  <span className="font-medium text-gray-900 dark:text-gray-100">{task.title}</span>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {task.category === 'client'
                      ? 'Terminal'
                      : task.category === 'roi_signal'
                        ? 'ROI signal'
                        : task.category}
                  </span>
                  {fromRoi && roiTags.length > 0 && (
                    <span className="text-[10px] text-sky-700 dark:text-sky-300 font-medium">
                      {roiTags.join(' · ')}
                    </span>
                  )}
                  {offerSuggestion && offerSuggestion.name && (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-500/25"
                      title={offerSuggestion.rationale}
                    >
                      <span className="opacity-70">Prescribe:</span>
                      {offerSuggestion.kind_label} · {offerSuggestion.name}
                    </span>
                  )}
                  {fromTerminal && healthLabel && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {healthLabel}
                    </span>
                  )}
                  <span className="text-xs text-violet-600 dark:text-violet-400 tabular-nums">
                    ROI {task.impact_score.toFixed(0)}
                  </span>
                </div>
                {why && (
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2 pr-6">{why}</p>
                )}
                {fix && !why && (
                  <p className="text-sm text-gray-700 dark:text-gray-200 mt-1 line-clamp-2 pr-6">Fix: {fix}</p>
                )}
                {completingGrace ? (
                  <span className="mt-1 block text-[11px] font-medium text-emerald-700 dark:text-emerald-300 group-open:hidden">
                    Saved — moving to Completed…
                  </span>
                ) : (
                  <span className="mt-1 block text-xs text-violet-600/90 dark:text-violet-400/90 group-open:hidden">
                    Expand for full details
                  </span>
                )}
              </div>
              <span
                className="mt-0.5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                aria-hidden
              >
                ▼
              </span>
            </div>
          </summary>
          <div className="mt-3 space-y-3 border-t border-gray-200/60 pt-3 text-sm dark:border-gray-700/60">
            {hasClient && onOpenEmail && (
              <EmailDraftActionRow
                draft={draft}
                status={draftStatus}
                pendingComposer={pendingComposer}
                error={composerError}
                onOpenEmail={onOpenEmail}
              />
            )}
            {offerSuggestion && offerSuggestion.name && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                  Suggested offer · {offerSuggestion.kind_label}
                </p>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
                  {offerSuggestion.name}
                </p>
                {offerSuggestion.promise && (
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
                    {offerSuggestion.promise}
                  </p>
                )}
                {offerSuggestion.rationale && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1.5 italic">
                    {offerSuggestion.rationale}
                  </p>
                )}
                {offerSuggestion.script_hint && (
                  <p className="text-xs text-gray-700 dark:text-gray-300 mt-1.5 leading-relaxed">
                    <span className="font-medium text-gray-800 dark:text-gray-200">Script hint: </span>
                    {offerSuggestion.script_hint}
                  </p>
                )}
              </div>
            )}
            {why && <p className="text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{why}</p>}
            {prescription && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Prescription
                </p>
                <p className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap">{prescription}</p>
              </div>
            )}
            {actions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Recommended actions
                </p>
                <ul className="list-disc list-inside space-y-1 text-gray-700 dark:text-gray-300">
                  {actions.map((a, i) => (
                    <li key={i} className="leading-relaxed">
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {nextStep && (
              <p className="text-gray-600 dark:text-gray-300">
                <span className="font-medium text-gray-800 dark:text-gray-200">Next step: </span>
                {nextStep}
              </p>
            )}
            {evidenceEntries.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                  Evidence
                </p>
                <ul className="space-y-2 text-xs list-none">
                  {evidenceEntries.map(([k, v]) => (
                    <li key={k} className="border-l-2 border-violet-500/25 pl-2.5">
                      <span className="font-medium text-gray-500 dark:text-gray-400 capitalize block">
                        {k.replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-800 dark:text-gray-200 break-words block mt-0.5">{v}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </div>
    </li>
  );
}

/**
 * Awaiting-approval automation drafts share the TaskRow card chrome so the priority
 * stream feels like one unified queue. The amber accent + "Awaiting approval" chip
 * make it visually obvious these need a yes/no rather than a "do it" decision, while
 * the focus chips (Referral / Upsell / Testimonial / Onboarding / Offboarding) explain
 * exactly what the email is asking for — same justification model as Performance tasks.
 */
function ApprovalRow({
  item,
  busy,
  onApprove,
  onDecline,
}: {
  item: OutreachInboxItem;
  busy?: 'approve' | 'decline';
  onApprove: () => void;
  onDecline: () => void;
}) {
  const playbook = (item.playbook as AutomationPlaybook | null) ?? null;
  const focusTags = focusTagsForPlaybook(playbook);
  const playbookLabel = playbook ? PLAYBOOK_LABEL[playbook] : 'Performance automation';
  const summary = (item.summary || '').trim();

  return (
    <li className="glass-card rounded-xl overflow-hidden ring-1 ring-amber-500/30 border border-amber-500/30 bg-amber-500/[0.05] dark:bg-amber-950/15">
      <details className="group">
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden p-4">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-200"
              aria-hidden
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495a1.75 1.75 0 0 1 3.03 0l6.28 10.875A1.75 1.75 0 0 1 16.28 16H3.72a1.75 1.75 0 0 1-1.515-2.63l6.28-10.875ZM10 7a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 10 7Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate">{item.title}</span>
                <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Awaiting approval
                </span>
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{playbookLabel}</span>
                {focusTags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {focusTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 ring-1 ring-emerald-500/25"
                      >
                        {focusChipLabel(tag)}
                      </span>
                    ))}
                  </span>
                )}
                {item.client_name && (
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate max-w-[16rem]">
                    {item.client_name}
                  </span>
                )}
              </div>
              {summary && (
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2 pr-6">{summary}</p>
              )}
              <span className="mt-1 block text-xs text-amber-700/90 dark:text-amber-300/90 group-open:hidden">
                Expand to approve, decline, or read why this was queued
              </span>
            </div>
            <span
              className="mt-0.5 shrink-0 text-amber-500 transition-transform group-open:rotate-180"
              aria-hidden
            >
              ▼
            </span>
          </div>
        </summary>
        <div className="border-t border-amber-500/20 px-4 py-3 space-y-3 bg-amber-500/[0.04] dark:bg-amber-950/10">
          <div className="rounded-lg border border-amber-500/30 bg-white/60 dark:bg-white/[0.04] p-3 text-xs space-y-1">
            <p className="font-medium text-amber-800 dark:text-amber-200">
              Why this is queued for approval
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
              The {playbookLabel.toLowerCase()} rule fired
              {item.client_name ? ` for ${item.client_name}` : ''} based on{' '}
              {summary || 'a recent trigger'}. The email is held until you approve so you can vet
              wording before it sends — declining moves it to canceled and won&apos;t send.
            </p>
            {focusTags.length > 0 && (
              <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                <span className="font-medium text-gray-700 dark:text-gray-300">Focus: </span>
                {focusTags.map((t) => focusChipLabel(t)).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {item.client_id && (
              <a
                href={`/?tab=pipeline&client=${item.client_id}`}
                className="rounded-md border border-gray-300 dark:border-gray-600 text-xs px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Open client
              </a>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDecline();
              }}
              disabled={busy != null}
              className="rounded-md border border-gray-300 dark:border-gray-600 text-xs px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'decline' ? 'Declining…' : 'Decline'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onApprove();
              }}
              disabled={busy != null}
              className="rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5"
            >
              {busy === 'approve' ? 'Approving…' : 'Approve & send'}
            </button>
          </div>
        </div>
      </details>
    </li>
  );
}

function EmailDraftActionRow({
  draft,
  status,
  pendingComposer,
  error,
  onOpenEmail,
}: {
  draft?: PerformanceTaskEmailDraft;
  status?: 'loading' | 'done' | 'error';
  pendingComposer?: boolean;
  error?: string;
  onOpenEmail: (force?: boolean) => void;
}) {
  const generating = status === 'loading' || pendingComposer === true;
  const hasDraft = Boolean(draft && (draft.subject || draft.body_plain));
  const errored = status === 'error';

  const generatedLabel =
    draft?.generated_at ? new Date(draft.generated_at).toLocaleString() : '';

  let helper: string;
  if (error) {
    helper = error;
  } else if (generating && !hasDraft) {
    helper = 'Drafting a send-ready email tailored to your voice and offer ladder…';
  } else if (generating && hasDraft) {
    helper = 'Regenerating — the modal will reopen with the fresh draft.';
  } else if (errored && !hasDraft) {
    helper = 'Could not draft an email — try again or check Intelligence settings.';
  } else if (hasDraft) {
    helper = generatedLabel
      ? `Pre-drafted ${generatedLabel} · opens in the email modal ready to send.`
      : 'Pre-drafted · opens in the email modal ready to send.';
  } else {
    helper = 'Click Open email to draft a send-ready message and open it in the modal.';
  }

  return (
    <div className="rounded-lg border border-violet-500/25 bg-violet-500/[0.06] p-3 text-xs flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-violet-800 dark:text-violet-200">
          Email
          {hasDraft && draft?.source ? (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-violet-700/70 dark:text-violet-300/70">
              {draft.source}
            </span>
          ) : null}
        </p>
        <p
          className={`mt-0.5 text-[11px] leading-snug ${error ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-gray-400'}`}
        >
          {helper}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpenEmail(false);
          }}
          disabled={generating}
          className="px-3 py-1.5 rounded-md text-[11px] font-medium border border-violet-500/40 bg-white/70 dark:bg-white/5 text-violet-800 dark:text-violet-100 hover:bg-violet-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {generating ? 'Drafting…' : hasDraft ? 'Open email' : 'Generate & open'}
        </button>
        {hasDraft && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpenEmail(true);
            }}
            disabled={generating}
            title="Regenerate this draft and open the modal"
            className="px-2 py-1.5 rounded-md text-[10px] font-medium border border-violet-500/30 bg-white/60 dark:bg-white/5 text-violet-800 dark:text-violet-100 hover:bg-violet-500/10 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Regenerate
          </button>
        )}
      </div>
    </div>
  );
}
