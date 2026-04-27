import type { Client } from '@/types/client';

const DEFAULT_FOLLOW_UP_MS = 14 * 24 * 60 * 60 * 1000;

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
 * Due = client.meta.follow_up_due_at when set (from LLM lead_follow_up on Fathom insight), else anchor + 14 days.
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
