/**
 * Shared time-range presets for dashboard charts (Finances revenue timeline, Calendar trends).
 * Matches Finances dashboard: MTD, rolling N days, last year (365), or all-time scope.
 */
import type { CalendarSyncedBookingRow, CalendarTrendSummary as CalendarTrendSummaryApi } from '@/lib/api';
import type { FinancesCombinedSummary } from '@/types/integration';

export type DashboardTimeRange = number | 'mtd' | 'all';

export function dashboardPeriodLabel(tr: DashboardTimeRange): string {
  if (tr === 'mtd') return 'Month to date';
  if (tr === 'all') return 'All recorded history';
  return `Last ${tr} days`;
}

/** Params for GET finances summary — same semantics as FinancesDashboardPanel. */
export function financesSummaryApiParams(tr: DashboardTimeRange): { range: number; scope?: 'mtd' | 'all' } {
  if (tr === 'mtd') return { range: 30, scope: 'mtd' };
  if (tr === 'all') return { range: 365, scope: 'all' };
  return { range: tr };
}

/** Params for finances revenue timeline — same semantics as FinancesDashboardPanel. */
export function financesTimelineApiParams(tr: DashboardTimeRange): { days: number; scope?: 'mtd' | 'all' } {
  if (tr === 'mtd') return { days: 31, scope: 'mtd' };
  if (tr === 'all') return { days: 365, scope: 'all' };
  return { days: tr };
}

/**
 * Activity window for Calendar trends summary counts (UTC — matches Stripe/finances `scope=mtd`).
 * - Past meetings: start in [pastStart, now).
 * - Upcoming meetings: start in [now, upcomingEnd].
 */
export function getCalendarTrendsActivityWindow(tr: DashboardTimeRange, now = new Date()) {
  const t = now.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (tr === 'all') {
    return {
      pastStart: new Date(0),
      pastEnd: now,
      upcomingStart: now,
      upcomingEnd: new Date(t + 10 * 365 * dayMs),
    };
  }

  if (tr === 'mtd') {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const monthStart = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const upcomingEnd = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    return {
      pastStart: monthStart,
      pastEnd: now,
      upcomingStart: now,
      upcomingEnd,
    };
  }

  const n = tr as number;
  const utcMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0,
    0,
    0,
    0
  );
  return {
    pastStart: new Date(utcMidnight - n * dayMs),
    pastEnd: now,
    upcomingStart: now,
    upcomingEnd: new Date(t + n * dayMs),
  };
}

/** Params for GET /integrations/calendar/trend-summary */
export function calendarTrendSummaryApiParams(
  tr: DashboardTimeRange
): { scope?: 'mtd' | 'all'; range_days?: number } {
  if (tr === 'mtd') return { scope: 'mtd' };
  if (tr === 'all') return { scope: 'all' };
  return { range_days: tr };
}

export function calendarSyncedBookingsFetchParams(tr: DashboardTimeRange): {
  upcoming_limit: number;
  past_limit: number;
  past_since?: string;
} {
  const w = getCalendarTrendsActivityWindow(tr);
  return {
    upcoming_limit: tr === 'all' ? 200 : 150,
    past_limit: tr === 'all' ? 500 : 300,
    past_since: tr === 'all' ? undefined : w.pastStart.toISOString(),
  };
}

export interface CalendarTrendSummary {
  upcomingCount: number;
  pastCount: number;
  closeRatePct: number | null;
  salesCallsInRange: number;
  closedSalesCount: number;
  showUpRatePct: number | null;
  attendanceEligiblePast: number;
  showedUpCount: number;
}

export function mapCalendarTrendSummaryFromApi(row: CalendarTrendSummaryApi): CalendarTrendSummary {
  return {
    upcomingCount: row.upcoming_count,
    pastCount: row.past_count,
    closeRatePct: row.close_rate_pct,
    salesCallsInRange: row.sales_calls_in_range,
    closedSalesCount: row.closed_sales_count,
    showUpRatePct: row.show_up_rate_pct,
    attendanceEligiblePast: row.attendance_eligible_past,
    showedUpCount: row.showed_up_count,
  };
}

/** Aggregate synced booking rows for the Calendar trends summary cards (client-side, matches selected range). */
export function computeCalendarTrendSummaryFromRows(
  upcoming: CalendarSyncedBookingRow[],
  past: CalendarSyncedBookingRow[],
  tr: DashboardTimeRange,
  now = new Date()
): CalendarTrendSummary {
  const w = getCalendarTrendsActivityWindow(tr, now);
  const nowMs = now.getTime();

  const boundaryMs = (r: CalendarSyncedBookingRow) => {
    const raw = r.end_time || r.start_time;
    if (!raw) return null;
    const t = new Date(raw).getTime();
    return Number.isFinite(t) ? t : null;
  };

  const pastRows = past.filter((r) => {
    const t = boundaryMs(r);
    if (t == null || t >= nowMs) return false;
    if (tr === 'all') return true;
    return t >= w.pastStart.getTime();
  });

  const upcomingRows = upcoming.filter((r) => {
    const t = boundaryMs(r);
    if (t == null || t < nowMs) return false;
    if (tr === 'all') return true;
    const startMs = r.start_time ? new Date(r.start_time).getTime() : t;
    return startMs >= w.upcomingStart.getTime() && startMs <= w.upcomingEnd.getTime();
  });

  const salesCalls = pastRows.filter((r) => r.is_sales_call && !r.cancelled);
  const closedSalesCount = salesCalls.filter((r) => r.sale_closed === true).length;
  const closeRatePct =
    salesCalls.length > 0 ? Math.round((closedSalesCount / salesCalls.length) * 100) : null;

  // Past sales calls count as attended unless explicitly marked no-show (matches calendar display_status).
  const showedUpCount = salesCalls.filter((r) => !r.no_show).length;
  const showUpRatePct =
    salesCalls.length > 0 ? Math.round((showedUpCount / salesCalls.length) * 100) : null;

  return {
    upcomingCount: upcomingRows.length,
    pastCount: pastRows.length,
    closeRatePct,
    salesCallsInRange: salesCalls.length,
    closedSalesCount,
    showUpRatePct,
    attendanceEligiblePast: salesCalls.length,
    showedUpCount,
  };
}

/** Past meetings in the window immediately before the selected range (% change vs current past count). */
export function computeCalendarPastCountTrendPct(
  upcoming: CalendarSyncedBookingRow[],
  past: CalendarSyncedBookingRow[],
  tr: DashboardTimeRange,
  now = new Date()
): number | null {
  if (tr === 'all') return null;

  const w = getCalendarTrendsActivityWindow(tr, now);
  const curStart = w.pastStart.getTime();
  const curEnd = w.pastEnd.getTime();
  const spanMs = Math.max(curEnd - curStart, 1);
  const prevEnd = curStart;
  const prevStart = prevEnd - spanMs;
  const nowMs = now.getTime();

  const countPastWindow = (start: number, end: number) =>
    past.filter((r) => {
      if (!r.start_time) return false;
      const t = new Date(r.start_time).getTime();
      if (t >= nowMs) return false;
      return t >= start && t <= end;
    }).length;

  const cur = countPastWindow(curStart, curEnd);
  const prev = countPastWindow(prevStart, prevEnd);
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Close rate in prior window vs current (percentage points). */
export function computeCalendarCloseRateTrendPp(
  upcoming: CalendarSyncedBookingRow[],
  past: CalendarSyncedBookingRow[],
  tr: DashboardTimeRange,
  now = new Date()
): number | null {
  if (tr === 'all') return null;

  const current = computeCalendarTrendSummaryFromRows(upcoming, past, tr, now);
  if (current.closeRatePct == null) return null;

  const w = getCalendarTrendsActivityWindow(tr, now);
  const spanMs = Math.max(w.pastEnd.getTime() - w.pastStart.getTime(), 1);
  const priorNow = new Date(w.pastStart.getTime());
  const prior = computeCalendarTrendSummaryFromRows(upcoming, past, tr, priorNow);
  if (prior.closeRatePct == null) return null;
  return current.closeRatePct - prior.closeRatePct;
}

/** Upcoming appointments in the window immediately before the selected range (% change). */
export function computeCalendarUpcomingCountTrendPct(
  upcoming: CalendarSyncedBookingRow[],
  past: CalendarSyncedBookingRow[],
  tr: DashboardTimeRange,
  now = new Date()
): number | null {
  if (tr === 'all') return null;

  const w = getCalendarTrendsActivityWindow(tr, now);
  const curStart = w.upcomingStart.getTime();
  const curEnd = w.upcomingEnd.getTime();
  const spanMs = Math.max(curEnd - curStart, 1);
  const prevEnd = curStart;
  const prevStart = prevEnd - spanMs;
  const nowMs = now.getTime();

  const countUpcomingWindow = (start: number, end: number) =>
    upcoming.filter((r) => {
      if (!r.start_time) return false;
      const t = new Date(r.start_time).getTime();
      if (t < nowMs) return false;
      return t >= start && t <= end;
    }).length;

  const cur = countUpcomingWindow(curStart, curEnd);
  const prev = countUpcomingWindow(prevStart, prevEnd);
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** Show-up rate in prior window vs current (percentage points). */
export function computeCalendarShowUpRateTrendPp(
  upcoming: CalendarSyncedBookingRow[],
  past: CalendarSyncedBookingRow[],
  tr: DashboardTimeRange,
  now = new Date()
): number | null {
  if (tr === 'all') return null;

  const current = computeCalendarTrendSummaryFromRows(upcoming, past, tr, now);
  if (current.showUpRatePct == null) return null;

  const w = getCalendarTrendsActivityWindow(tr, now);
  const spanMs = Math.max(w.pastEnd.getTime() - w.pastStart.getTime(), 1);
  const priorNow = new Date(w.pastStart.getTime());
  const prior = computeCalendarTrendSummaryFromRows(upcoming, past, tr, priorNow);
  if (prior.showUpRatePct == null) return null;
  return current.showUpRatePct - prior.showUpRatePct;
}

/** % change in Stripe revenue per customer for the period (proxy for LTV momentum). */
export function computeAvgRevenuePerCustomerTrend(
  timeline: Array<{ date: string; stripe_revenue?: number; total_revenue?: number }>,
  customerCount: number,
  tr: DashboardTimeRange,
  now = new Date()
): number | null {
  if (!timeline.length || tr === 'all' || customerCount <= 0) return null;
  const stripeOnly = timeline.map((p) => ({
    date: p.date,
    total_revenue: p.stripe_revenue ?? p.total_revenue ?? 0,
  }));
  return computeFinancesTimelineTrend(stripeOnly, tr, now);
}

/** Sum combined revenue trend: current window vs prior window of equal length (% change). */
export function computeFinancesTimelineTrend(
  timeline: Array<{ date: string; total_revenue: number }>,
  tr: DashboardTimeRange,
  now = new Date()
): number | null {
  if (!timeline.length || tr === 'all') return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const t = now.getTime();

  let curStart: number;
  let curEnd: number;
  let prevStart: number;
  let prevEnd: number;

  if (tr === 'mtd') {
    const y = now.getFullYear();
    const m = now.getMonth();
    curStart = new Date(y, m, 1, 0, 0, 0, 0).getTime();
    curEnd = t;
    const dayOfMonth = now.getDate();
    const prevMonthLastDay = new Date(y, m, 0).getDate();
    const prevDay = Math.min(dayOfMonth, prevMonthLastDay);
    prevStart = new Date(y, m - 1, 1, 0, 0, 0, 0).getTime();
    prevEnd = new Date(y, m - 1, prevDay, 23, 59, 59, 999).getTime();
  } else {
    const n = tr as number;
    curEnd = t;
    curStart = t - n * dayMs;
    prevEnd = curStart;
    prevStart = curStart - n * dayMs;
  }

  const sumWindow = (start: number, end: number) =>
    timeline
      .filter((p) => {
        const d = new Date(p.date).getTime();
        return d >= start && d <= end;
      })
      .reduce((s, p) => s + (p.total_revenue ?? 0), 0);

  const cur = sumWindow(curStart, curEnd);
  const prev = sumWindow(prevStart, prevEnd);
  if (prev === 0) return cur === 0 ? 0 : null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export function stripeSummaryRange(tr: DashboardTimeRange): number | 'mtd' | 'all' {
  if (tr === 'mtd') return 'mtd';
  if (tr === 'all') return 'all';
  return tr;
}

/** Stripe payments list on Terminal — aligned with Finances / Stripe dashboard. */
export function terminalStripePaymentsParams(tr: DashboardTimeRange): {
  range: number | 'mtd';
  useTreasury: boolean;
} {
  if (tr === 'mtd') return { range: 'mtd', useTreasury: true };
  if (tr === 'all') return { range: 365, useTreasury: false };
  return { range: tr, useTreasury: true };
}

/** Failed-payments queue on Terminal — same window as KPI toggle. */
export function terminalFailedPaymentsParams(tr: DashboardTimeRange): {
  range?: number;
  scope?: 'mtd' | 'all';
} {
  if (tr === 'mtd') return { range: 30, scope: 'mtd' };
  if (tr === 'all') return { range: 365, scope: 'all' };
  return { range: tr };
}

export function isManualStripePaymentRow(p: { stripe_id?: string | null }): boolean {
  return !!p.stripe_id?.startsWith('manual:');
}

/**
 * Primary combined cash (Stripe + Whop + manual) for the selected dashboard range.
 * Finances API maps the active window into `combined.last_30_days_revenue` (not always 30d).
 */
export function combinedCashForRange(
  summary: { combined: { last_30_days_revenue: number; last_mtd_revenue: number } },
  tr: DashboardTimeRange
): number {
  if (tr === 'mtd') return summary.combined.last_mtd_revenue ?? 0;
  return summary.combined.last_30_days_revenue ?? 0;
}

export function combinedOrderCountForRange(
  summary: {
    combined: {
      last_30_days_order_count?: number;
      last_mtd_order_count?: number;
    };
  },
  tr: DashboardTimeRange
): number {
  if (tr === 'mtd') return summary.combined.last_mtd_order_count ?? 0;
  return summary.combined.last_30_days_order_count ?? 0;
}

/** Average order value = combined cash / payment count for the selected range. */
export function combinedAovForRange(
  summary: Parameters<typeof combinedCashForRange>[0] & Parameters<typeof combinedOrderCountForRange>[0],
  tr: DashboardTimeRange
): number | null {
  const orders = combinedOrderCountForRange(summary, tr);
  if (orders <= 0) return null;
  return combinedCashForRange(summary, tr) / orders;
}

/** % change in AOV vs the prior window of equal length. */
export function computeCombinedAovTrendPct(
  summary: FinancesCombinedSummary,
  tr: DashboardTimeRange
): number | null {
  if (tr === 'all') return null;
  const curOrders = combinedOrderCountForRange(summary, tr);
  const priorOrders = summary.prior_period_order_count ?? 0;
  const priorRevenue = summary.prior_period_revenue ?? 0;
  if (curOrders <= 0 || priorOrders <= 0) return null;
  const curAov = combinedCashForRange(summary, tr) / curOrders;
  const priorAov = priorRevenue / priorOrders;
  if (priorAov === 0) return curAov === 0 ? 0 : null;
  return ((curAov - priorAov) / Math.abs(priorAov)) * 100;
}

/** Fallback when GET /integrations/finances/summary is unavailable. */
export function fallbackCashForRange(
  tr: DashboardTimeRange,
  opts: {
    terminal?: {
      cash_collected?: {
        today?: number;
        last_7_days?: number;
        last_30_days?: number;
        last_mtd?: number;
        all_time?: number;
      };
    } | null;
    stripeLast30?: number;
  }
): number {
  const c = opts.terminal?.cash_collected;
  if (tr === 'mtd') return c?.last_mtd ?? opts.stripeLast30 ?? 0;
  if (tr === 7) return c?.last_7_days ?? opts.stripeLast30 ?? 0;
  if (tr === 'all') return c?.all_time ?? c?.last_30_days ?? opts.stripeLast30 ?? 0;
  if (tr === 30) return c?.last_30_days ?? opts.stripeLast30 ?? 0;
  // Rolling N-day windows without a dedicated terminal field — approximate with 30d terminal cash.
  return c?.last_30_days ?? opts.stripeLast30 ?? 0;
}

export function filterMonthlyCoachingPeriodsForDashboardRange<
  T extends { period_start: string; period_end: string },
>(periods: T[], tr: DashboardTimeRange, now = new Date()): T[] {
  if (tr === 'all') return periods;
  const w = getCalendarTrendsActivityWindow(tr, now);
  const winStart = w.pastStart.getTime();
  const winEnd = w.upcomingEnd.getTime();
  return periods.filter((p) => {
    const ps = new Date(p.period_start).getTime();
    const pe = new Date(p.period_end).getTime();
    return pe >= winStart && ps <= winEnd;
  });
}
