/**
 * Shared date-range filter model (docs/features/DATE_RANGE_FILTER_PRD.md).
 *
 * All dates are inclusive `YYYY-MM-DD` strings in the org's timezone; `start: null` means
 * all history. Presets are re-resolved against "today" on load so rolling ranges stay
 * rolling; custom ranges stay fixed. Weeks start Monday (matches the funnel scorecard).
 */

export type PresetId =
  | 'today'
  | 'yesterday'
  | 'today_yesterday'
  | 'last_7'
  | 'last_14'
  | 'last_28'
  | 'last_30'
  | 'last_90'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'all_time'
  | 'custom';

export type CompareMode = 'previous_period' | 'previous_year' | 'custom';

export interface CompareValue {
  mode: CompareMode;
  start: string;
  end: string;
}

export interface DateRangeValue {
  preset: PresetId;
  start: string | null;
  end: string;
  compare: CompareValue | null;
}

export const PRESETS: Array<{ id: Exclude<PresetId, 'custom'>; label: string }> = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'today_yesterday', label: 'Today and yesterday' },
  { id: 'last_7', label: 'Last 7 days' },
  { id: 'last_14', label: 'Last 14 days' },
  { id: 'last_28', label: 'Last 28 days' },
  { id: 'last_30', label: 'Last 30 days' },
  { id: 'last_90', label: 'Last 90 days' },
  { id: 'this_week', label: 'This week' },
  { id: 'last_week', label: 'Last week' },
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_year', label: 'This year' },
  { id: 'all_time', label: 'All time' },
];

export const COMPARE_MODES: Array<{ id: CompareMode; label: string }> = [
  { id: 'previous_period', label: 'Previous period' },
  { id: 'previous_year', label: 'Same period last year' },
  { id: 'custom', label: 'Custom' },
];

export function presetLabel(id: PresetId): string {
  return id === 'custom' ? 'Custom' : PRESETS.find((p) => p.id === id)?.label ?? id;
}

// --- day math on YYYY-MM-DD (UTC-noon Date objects avoid DST edge cases) ---------------

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

export function toYmd(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

export function ymdOf(year: number, month: number, day: number): string {
  return toYmd(new Date(Date.UTC(year, month, day, 12)));
}

export function addDays(ymd: string, n: number): string {
  const d = parseYmd(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return toYmd(d);
}

/** Whole days from a to b (b - a). */
export function diffDays(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86_400_000);
}

export function addYears(ymd: string, n: number): string {
  const d = parseYmd(ymd);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toYmd(d);
}

/** Monday on or before `ymd`. */
export function mondayOf(ymd: string): string {
  const dow = (parseYmd(ymd).getUTCDay() + 6) % 7;
  return addDays(ymd, -dow);
}

/** Today's date in an IANA timezone (falls back to the browser's). */
export function todayIn(timeZone?: string | null, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  }
}

// --- presets / compare -------------------------------------------------------------------

/** Rolling "Last N days" end yesterday (Meta convention): today is still in progress. */
export function resolvePreset(id: Exclude<PresetId, 'custom'>, today: string): { start: string | null; end: string } {
  const [y, m] = today.split('-').map(Number);
  const yesterday = addDays(today, -1);
  const lastN = (n: number) => ({ start: addDays(today, -n), end: yesterday });
  switch (id) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday':
      return { start: yesterday, end: yesterday };
    case 'today_yesterday':
      return { start: yesterday, end: today };
    case 'last_7':
      return lastN(7);
    case 'last_14':
      return lastN(14);
    case 'last_28':
      return lastN(28);
    case 'last_30':
      return lastN(30);
    case 'last_90':
      return lastN(90);
    case 'this_week':
      return { start: mondayOf(today), end: today };
    case 'last_week': {
      const start = addDays(mondayOf(today), -7);
      return { start, end: addDays(start, 6) };
    }
    case 'this_month':
      return { start: ymdOf(y, m - 1, 1), end: today };
    case 'last_month':
      return { start: ymdOf(y, m - 2, 1), end: ymdOf(y, m - 1, 0) };
    case 'this_year':
      return { start: ymdOf(y, 0, 1), end: today };
    case 'all_time':
      return { start: null, end: today };
  }
}

/** Default compare window for a range; null for all-time ranges (nothing before them). */
export function resolveCompare(mode: Exclude<CompareMode, 'custom'>, start: string | null, end: string): CompareValue | null {
  if (start == null) return null;
  if (mode === 'previous_year') return { mode, start: addYears(start, -1), end: addYears(end, -1) };
  const len = diffDays(start, end) + 1;
  return { mode, start: addDays(start, -len), end: addDays(start, -1) };
}

export function makeRange(preset: Exclude<PresetId, 'custom'>, today: string, compareMode: CompareMode | null = null): DateRangeValue {
  const { start, end } = resolvePreset(preset, today);
  const compare = compareMode && compareMode !== 'custom' ? resolveCompare(compareMode, start, end) : null;
  return { preset, start, end, compare };
}

/** Re-resolve a stored range against today (rolling presets roll; custom stays fixed). */
export function refreshRange(value: DateRangeValue, today: string): DateRangeValue {
  const base =
    value.preset === 'custom' ? { start: value.start, end: value.end } : resolvePreset(value.preset, today);
  let compare = value.compare;
  if (compare && compare.mode !== 'custom') compare = resolveCompare(compare.mode, base.start, base.end);
  if (base.start == null) compare = null;
  return { preset: value.preset, start: base.start, end: base.end, compare };
}

export function isValidRange(v: unknown): v is DateRangeValue {
  if (!v || typeof v !== 'object') return false;
  const r = v as DateRangeValue;
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  return (
    typeof r.preset === 'string' &&
    typeof r.end === 'string' &&
    ymd.test(r.end) &&
    (r.start === null || (typeof r.start === 'string' && ymd.test(r.start))) &&
    (r.compare === null ||
      (typeof r.compare === 'object' && ymd.test(r.compare.start) && ymd.test(r.compare.end)))
  );
}

// --- labels / API params -------------------------------------------------------------------

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatYmd(ymd: string, withYear = true): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return withYear ? `${MONTH_SHORT[m - 1]} ${d}, ${y}` : `${MONTH_SHORT[m - 1]} ${d}`;
}

/** "Aug 28 – Sep 26, 2026", "Sep 26, 2026", "Dec 28, 2025 – Jan 3, 2026", "All time". */
export function formatRange(start: string | null, end: string): string {
  if (start == null) return `All time through ${formatYmd(end)}`;
  if (start === end) return formatYmd(end);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatYmd(start, !sameYear)} – ${formatYmd(end)}`;
}

/** Short relative-free label for inline use ("last 30 days" → the dates). */
export function rangeTitle(v: DateRangeValue): string {
  if (v.preset === 'all_time') return 'All time';
  return v.preset === 'custom' ? formatRange(v.start, v.end) : presetLabel(v.preset);
}

export function rangeParams(v: DateRangeValue): { start?: string; end: string } {
  return v.start ? { start: v.start, end: v.end } : { end: v.end };
}

export function compareParams(v: DateRangeValue): { compare_start?: string; compare_end?: string } {
  return v.compare ? { compare_start: v.compare.start, compare_end: v.compare.end } : {};
}

/** Days in the range (null for all time). */
export function rangeLength(v: { start: string | null; end: string }): number | null {
  return v.start ? diffDays(v.start, v.end) + 1 : null;
}

/** Months (year, month0) the range touches, oldest first — for month-grid views. */
export function monthsInRange(start: string, end: string): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  m -= 1;
  while (y < ey || (y === ey && m <= em - 1)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/** % change current vs previous (null when there is no usable previous). */
export function pctChange(current: number | null | undefined, previous: number | null | undefined): number | null {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
