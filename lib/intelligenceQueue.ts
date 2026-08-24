/**
 * Priority queues for intelligence drawer: max pool size, visible slice, stable keys for persistence.
 */

export const INTELLIGENCE_MAX_POOL = 10;
/** Show 4 at a time (within 3–5). */
export const INTELLIGENCE_VISIBLE_CLIPS = 4;
export const INTELLIGENCE_VISIBLE_ACTIONS = 4;

const CLIP_KIND_RANK: Record<string, number> = {
  testimonial: 0,
  win: 1,
  objection: 2,
  other: 99,
};

/** Stable id for persisting dismissals in client.meta.intelligence_ui.dismissed_clip_ids */
export function clipStableKey(clip: Record<string, unknown>): string {
  const raw = `${clip.meeting_at ?? ''}|${clip.quote ?? ''}|${clip.start_timestamp ?? ''}|${clip.label ?? ''}`;
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = (Math.imul(31, h) + raw.charCodeAt(i)) | 0;
  }
  return `c${Math.abs(h).toString(36)}`;
}

export function sortClipsByPriority(clips: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...clips].sort((a, b) => {
    const ka = String(a.kind || 'other');
    const kb = String(b.kind || 'other');
    const ra = CLIP_KIND_RANK[ka] ?? 99;
    const rb = CLIP_KIND_RANK[kb] ?? 99;
    if (ra !== rb) return ra - rb;
    const ta = String(a.meeting_at || '');
    const tb = String(b.meeting_at || '');
    return tb.localeCompare(ta);
  });
}

export function buildClipQueueView(
  clips: Record<string, unknown>[],
  dismissedIds: Set<string>,
  maxPool = INTELLIGENCE_MAX_POOL,
  visibleCount = INTELLIGENCE_VISIBLE_CLIPS
): {
  visible: Record<string, unknown>[];
  queuedCount: number;
  poolSize: number;
} {
  const sorted = sortClipsByPriority(clips);
  const active = sorted.filter((c) => !dismissedIds.has(clipStableKey(c)));
  const pool = active.slice(0, maxPool);
  const visible = pool.slice(0, visibleCount);
  const queuedCount = Math.max(0, pool.length - visible.length);
  return { visible, queuedCount, poolSize: pool.length };
}

export function readDismissedClipIds(meta: Record<string, unknown> | undefined | null): Set<string> {
  if (!meta || typeof meta !== 'object') return new Set();
  const ui = meta.intelligence_ui as Record<string, unknown> | undefined;
  if (!ui || typeof ui !== 'object') return new Set();
  const raw = ui.dismissed_clip_ids;
  if (!Array.isArray(raw)) return new Set();
  return new Set(raw.filter((x): x is string => typeof x === 'string'));
}

export function mergeMetaWithDismissedClip(
  meta: Record<string, unknown> | undefined | null,
  clipKey: string
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(meta || {}) };
  const ui: Record<string, unknown> = { ...((next.intelligence_ui as Record<string, unknown>) || {}) };
  const prev = Array.isArray(ui.dismissed_clip_ids) ? [...(ui.dismissed_clip_ids as string[])] : [];
  if (!prev.includes(clipKey)) prev.push(clipKey);
  ui.dismissed_clip_ids = prev.slice(-400);
  next.intelligence_ui = ui;
  return next;
}
