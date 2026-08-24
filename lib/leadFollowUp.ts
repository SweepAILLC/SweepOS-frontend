import type { Client } from '@/types/client';

const DEFAULT_FOLLOW_UP_MS = 14 * 24 * 60 * 60 * 1000;

/** Pre-payment pipeline columns (show follow-up bar + lead call-insight rules). */
export const LEAD_PIPELINE_COLUMNS = [
  'cold_lead',
  'nurturing',
  'qualified',
  'booked',
] as const;

export type LeadPipelineColumn = (typeof LEAD_PIPELINE_COLUMNS)[number];

export function isLeadPipelineColumn(columnId: string): columnId is LeadPipelineColumn {
  return (LEAD_PIPELINE_COLUMNS as readonly string[]).includes(columnId);
}

export type LeadFollowUpBar = {
  percent: number;
  dueMs: number;
  subtitle: string;
  /** True when an explicit due instant is stored on the client (profile or call insight) */
  hasExplicitDue: boolean;
};

/** YYYY-MM-DD in the user's local calendar from a stored ISO instant (for date inputs). */
export function followUpIsoToDateInput(iso: string | undefined | null): string {
  if (!iso || typeof iso !== 'string') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** End of the chosen local calendar day as ISO UTC (matches manual profile edits). */
export function dateInputToFollowUpIso(ymd: string): string {
  const parts = ymd.trim().split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    throw new Error('Invalid date');
  }
  const [y, m, d] = parts;
  const localEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
  return localEnd.toISOString();
}

export function formatFollowUpDueLabel(dueMs: number): string {
  return new Date(dueMs).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Elapsed fraction from anchor (last_activity_at or created_at) toward due date.
 * Due = client.meta.follow_up_due_at when set, else anchor + 14 days.
 */
export function computeLeadFollowUpBar(client: Client): LeadFollowUpBar | null {
  const anchorStr = client.last_activity_at || client.created_at || client.updated_at;
  if (!anchorStr) return null;
  const anchor = new Date(anchorStr).getTime();
  if (Number.isNaN(anchor)) return null;

  const rawMetaDue =
    client.meta && typeof client.meta.follow_up_due_at === 'string'
      ? (client.meta.follow_up_due_at as string)
      : null;
  let dueMs: number;
  let hasExplicitDue = false;
  if (rawMetaDue) {
    const parsed = new Date(rawMetaDue).getTime();
    if (!Number.isNaN(parsed)) {
      dueMs = parsed;
      hasExplicitDue = true;
    } else {
      dueMs = anchor + DEFAULT_FOLLOW_UP_MS;
    }
  } else {
    dueMs = anchor + DEFAULT_FOLLOW_UP_MS;
  }

  const span = dueMs - anchor;
  const now = Date.now();
  let percent: number;
  if (span <= 0) {
    percent = now >= dueMs ? 100 : 0;
  } else {
    percent = ((now - anchor) / span) * 100;
  }
  percent = Math.min(100, Math.max(0, percent));

  return {
    percent,
    dueMs,
    subtitle: `Follow up by: ${formatFollowUpDueLabel(dueMs)}`,
    hasExplicitDue,
  };
}

/** Kanban columns — lifecycle bucket for urgency rules when sorting. */
export type BoardLifecycleColumn =
  | LeadPipelineColumn
  | 'active'
  | 'offboarding'
  | 'dead';

/**
 * Effective "due" instant for sorting (lower = follow up sooner).
 * Uses touch-base timeline from computeLeadFollowUpBar; for active/offboarding also considers program end.
 */
export function getBoardSortDueMs(client: Client, columnId: BoardLifecycleColumn): number {
  const bar = computeLeadFollowUpBar(client);
  const touchDue = bar?.dueMs ?? Number.MAX_SAFE_INTEGER;

  if (columnId === 'active' || columnId === 'offboarding') {
    if (client.program_end_date) {
      const end = new Date(client.program_end_date).getTime();
      if (!Number.isNaN(end)) {
        return Math.min(touchDue, end);
      }
    }
  }
  return touchDue;
}

export function compareClientsForBoardColumn(
  a: Client,
  b: Client,
  columnId: BoardLifecycleColumn,
  healthScoreForId: (id: string) => number | undefined,
): number {
  // Manually created / recently added nurturing leads: newest at top.
  if (columnId === 'nurturing') {
    const ca = new Date(a.created_at).getTime();
    const cb = new Date(b.created_at).getTime();
    if (ca !== cb) return cb - ca;
    const ha = healthScoreForId(a.id);
    const hb = healthScoreForId(b.id);
    const na = ha != null && !Number.isNaN(ha) ? ha : -1;
    const nb = hb != null && !Number.isNaN(hb) ? hb : -1;
    if (na !== nb) return nb - na;
    return 0;
  }

  const da = getBoardSortDueMs(a, columnId);
  const db = getBoardSortDueMs(b, columnId);
  if (da !== db) return da - db;
  const ha = healthScoreForId(a.id);
  const hb = healthScoreForId(b.id);
  const na = ha != null && !Number.isNaN(ha) ? ha : -1;
  const nb = hb != null && !Number.isNaN(hb) ? hb : -1;
  if (na !== nb) return nb - na;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}
