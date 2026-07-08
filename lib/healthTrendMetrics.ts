import type { HealthTrendPeriod } from '@/types/admin';

/** Finances-tab style monthly cash: combined (Stripe + Whop) when API sends it, else Stripe-only for that month. */
export function periodFinancesCashUsd(p: HealthTrendPeriod): number {
  const c = p.combined_revenue_usd;
  if (c != null && Number.isFinite(c)) return Number(c);
  return Number(p.stripe_revenue_usd ?? 0);
}

/** Rows for Recharts: same keys as `HealthTrendPeriod` plus `finances_cash_usd` for bar/line series. */
export function healthTrendPeriodsWithFinancesCash(
  periods: HealthTrendPeriod[]
): Array<HealthTrendPeriod & { finances_cash_usd: number }> {
  return periods.map((p) => ({
    ...p,
    finances_cash_usd: periodFinancesCashUsd(p),
  }));
}

export type LtvEnrichedPeriod = HealthTrendPeriod & {
  cumulative_finances_cash_usd: number;
  display_ltv_usd: number | null;
};

/** Cumulative Finances cash (combined when reported) ÷ cumulative client records. Uses API LTV when present. */
export function enrichPeriodsWithLtv(periods: HealthTrendPeriod[]): LtvEnrichedPeriod[] {
  let cum = 0;
  return periods.map((p) => {
    cum += periodFinancesCashUsd(p);
    const clients = Number(p.cumulative_total_clients ?? 0);
    const fromApi = p.avg_client_ltv_usd;
    const derived = clients > 0 ? cum / clients : null;
    const display =
      fromApi != null && Number.isFinite(fromApi) && fromApi > 0 ? fromApi : derived;
    return {
      ...p,
      cumulative_finances_cash_usd: cum,
      display_ltv_usd: display,
    };
  });
}

export function lastTwoDefined(values: (number | null | undefined)[]): [number, number] | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length < 2) return null;
  return [nums[nums.length - 2]!, nums[nums.length - 1]!];
}

export function formatPctMoM(prev: number, curr: number): string {
  if (prev === 0) return curr === 0 ? '0%' : '—';
  const ch = ((curr - prev) / Math.abs(prev)) * 100;
  const sign = ch > 0 ? '+' : '';
  return `${sign}${ch.toFixed(1)}%`;
}

/** Percentage-point change (for 0–100 rates). */
export function formatPpMoM(prev: number, curr: number): string {
  const d = curr - prev;
  const sign = d > 0 ? '+' : '';
  return `${sign}${d.toFixed(1)} pp`;
}
