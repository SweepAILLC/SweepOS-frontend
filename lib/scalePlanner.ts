/**
 * Scale Planner math — mirrors backend app/services/scale_planner.py so sliders
 * update live. Keep the two in step.
 *
 * profit(S)       = (S * ROAS + recurring) * (1 - v) - S - F
 * break-even(S)   = (1 + F / S) / (1 - v)        (covers fixed costs at this spend)
 * marginal BE     = 1 / (1 - v)                  (the next ad dollar pays for itself)
 * ROAS(S)         = ROAS0 * (S / S0) ^ -decay    (ROAS falls as spend grows; default 0.5)
 */

export const DEFAULT_DECAY = 0.5;
export const DEFAULT_WORST_RATIO = 0.5;

function frac(pct: number | null | undefined): number {
  if (pct == null || !Number.isFinite(pct)) return 0;
  return Math.max(0, Math.min(pct, 99)) / 100;
}

export function breakEvenRoas(monthlySpend: number, fixedMonthly: number, variablePct: number | null): number | null {
  const v = frac(variablePct);
  if (!(monthlySpend > 0) || v >= 1) return null;
  return (1 + Math.max(fixedMonthly || 0, 0) / monthlySpend) / (1 - v);
}

export function marginalBreakEvenRoas(variablePct: number | null): number {
  return 1 / (1 - frac(variablePct));
}

export function monthlyProfit(
  monthlySpend: number,
  roas: number,
  fixedMonthly: number,
  variablePct: number | null,
  recurringCash = 0
): number {
  const v = frac(variablePct);
  return (monthlySpend * roas + (recurringCash || 0)) * (1 - v) - monthlySpend - (fixedMonthly || 0);
}

export function roasAtSpend(spend: number, baseSpend: number, baseRoas: number, decay: number | null): number {
  if (!(spend > 0) || !(baseSpend > 0)) return baseRoas;
  const d = decay == null ? DEFAULT_DECAY : Math.max(0, decay);
  return baseRoas * Math.pow(spend / baseSpend, -d);
}

export type GapZone = 'losing' | 'danger' | 'hold' | 'push';

export function gapZone(roas: number | null, breakeven: number | null): { gapPct: number; zone: GapZone } | null {
  if (roas == null || breakeven == null || !(breakeven > 0)) return null;
  const gap = (roas - breakeven) / breakeven;
  const zone: GapZone = gap < 0 ? 'losing' : gap < 0.1 ? 'danger' : gap < 0.5 ? 'hold' : 'push';
  return { gapPct: Math.round(gap * 1000) / 10, zone };
}

export const ZONE_STYLE: Record<GapZone, { label: string; cls: string; hint: string }> = {
  losing: {
    label: 'Below break-even',
    cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/40',
    hint: 'Every month at this ROAS loses money. Cut spend or costs.',
  },
  danger: {
    label: 'Danger',
    cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-400/40',
    hint: 'Within 10% of break-even. One bad week takes you under.',
  },
  hold: {
    label: 'Hold',
    cls: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-400/40',
    hint: 'Profitable with some room. Hold spend and improve efficiency.',
  },
  push: {
    label: 'Room to push',
    cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40',
    hint: 'Over 50% above break-even. A wide margin to scale into.',
  },
};

/** Coefficient of variation (stdev / mean) of the positive values, as a percent. */
export function volatilityPct(values: Array<number | null | undefined>): number | null {
  const clean = values.filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  if (clean.length < 2) return null;
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (!(mean > 0)) return null;
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / clean.length;
  return Math.round((Math.sqrt(variance) / mean) * 1000) / 10;
}

export interface PlannerInputs {
  monthlySpend: number;
  roas: number;
  fixedMonthly: number;
  variablePct: number | null;
  recurringCash: number;
  decay: number | null;
  /** worst ROAS as a share of current (0–1). */
  worstRatio: number;
}

export interface SweepPoint {
  multiple: number;
  spend: number;
  daily: number;
  roas: number;
  breakeven: number | null;
  profit: number;
  worstProfit: number;
}

export const SWEEP_MULTIPLES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6];

/** Profit at multiples of current spend, with ROAS decaying as spend grows. */
export function spendSweep(p: PlannerInputs, multiples = SWEEP_MULTIPLES): SweepPoint[] {
  return multiples.map((m) => {
    const spend = p.monthlySpend * m;
    const roas = roasAtSpend(spend, p.monthlySpend, p.roas, p.decay);
    return {
      multiple: m,
      spend,
      daily: spend / 30,
      roas,
      breakeven: breakEvenRoas(spend, p.fixedMonthly, p.variablePct),
      profit: monthlyProfit(spend, roas, p.fixedMonthly, p.variablePct, p.recurringCash),
      worstProfit: monthlyProfit(spend, roas * p.worstRatio, p.fixedMonthly, p.variablePct, p.recurringCash),
    };
  });
}

/**
 * Spend that maximises monthly profit under ROAS decay (0 < d < 1):
 * dP/dS = 0  =>  S* = ((1 - v) * ROAS0 * (1 - d) * S0^d) ^ (1 / d).
 * Null when decay is 0 (profit grows without bound) or ≥ 1 (any extra spend loses).
 */
export function profitMaxSpend(p: PlannerInputs): number | null {
  const d = p.decay == null ? DEFAULT_DECAY : p.decay;
  if (!(d > 0) || d >= 1 || !(p.monthlySpend > 0) || !(p.roas > 0)) return null;
  const v = frac(p.variablePct);
  const s = Math.pow((1 - v) * p.roas * (1 - d) * Math.pow(p.monthlySpend, d), 1 / d);
  return Number.isFinite(s) && s > 0 ? s : null;
}

export interface GoalMonth {
  month: number;
  spend: number;
  daily: number;
  roas: number;
  cash: number;
  profit: number;
  /** Reserves after this month's profit or loss. */
  cushion: number | null;
}

export interface GoalPlan {
  months: GoalMonth[];
  /** First month (1-based) whose profit reaches the goal, or null. */
  hitsGoalAt: number | null;
  lowestCushion: number | null;
  peakProfit: number;
}

/** Grow spend by `growthPct` every month for `months` months from today's numbers. */
export function projectGoal(
  p: PlannerInputs,
  opts: { growthPct: number; months: number; goalProfit: number; startCushion: number | null }
): GoalPlan {
  const out: GoalMonth[] = [];
  let cushion = opts.startCushion;
  let hitsGoalAt: number | null = null;
  let lowest: number | null = cushion;
  let peak = -Infinity;
  for (let i = 1; i <= opts.months; i += 1) {
    const spend = p.monthlySpend * Math.pow(1 + opts.growthPct / 100, i);
    const roas = roasAtSpend(spend, p.monthlySpend, p.roas, p.decay);
    const profit = monthlyProfit(spend, roas, p.fixedMonthly, p.variablePct, p.recurringCash);
    if (cushion != null) {
      cushion += profit;
      lowest = lowest == null ? cushion : Math.min(lowest, cushion);
    }
    if (hitsGoalAt == null && profit >= opts.goalProfit) hitsGoalAt = i;
    peak = Math.max(peak, profit);
    out.push({ month: i, spend, daily: spend / 30, roas, cash: spend * roas, profit, cushion });
  }
  return { months: out, hitsGoalAt, lowestCushion: lowest, peakProfit: peak };
}

/** Smallest monthly growth % (0–300, steps of 5) that reaches the goal within `months`, or null. */
export function growthNeeded(
  p: PlannerInputs,
  opts: { months: number; goalProfit: number }
): number | null {
  for (let g = 0; g <= 300; g += 5) {
    const plan = projectGoal(p, { growthPct: g, months: opts.months, goalProfit: opts.goalProfit, startCushion: null });
    if (plan.hitsGoalAt != null) return g;
  }
  return null;
}

export function usd0(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

export function ratio2(n: number | null | undefined): string {
  return n == null || !Number.isFinite(n) ? '—' : `${n.toFixed(2)}x`;
}
