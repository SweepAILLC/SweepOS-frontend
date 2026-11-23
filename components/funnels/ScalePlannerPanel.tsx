'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiClient } from '@/lib/api';
import {
  DEFAULT_DECAY,
  DEFAULT_WORST_RATIO,
  ZONE_STYLE,
  breakEvenRoas,
  gapZone,
  growthNeeded,
  marginalBreakEvenRoas,
  monthlyProfit,
  profitMaxSpend,
  projectGoal,
  ratio2,
  spendSweep,
  usd0,
  type PlannerInputs,
} from '@/lib/scalePlanner';
import type { BusinessEconomics, ScaleReadinessResponse, ScaleVerdict } from '@/types/businessEconomics';

/**
 * Scale Planner (Funnels tab). Three tools on one page:
 *  1. Break-even ROAS — fixed + variable costs at today's spend, and the gap above it.
 *  2. Spend vs profit — absolute monthly profit at 0.25x–6x today's spend, with ROAS
 *     decaying as spend grows, plus the worst case (ROAS at the worst week seen).
 *  3. Goal path — grow spend X% a month: when profit reaches the goal, and the lowest
 *     the cash cushion gets on the way.
 * Prefilled from the last 4 complete weeks of paid data + Settings → Business economics;
 * every input can be overridden for what-ifs. Nothing here is saved except via Settings.
 */

const PROFIT_COLOR = '#10b981';
const WORST_COLOR = '#f59e0b';
const CUSHION_COLOR = '#6366f1';
const GRID_STROKE = 'rgba(148, 163, 184, 0.2)';
const AXIS_TICK = { fill: '#94a3b8', fontSize: 11 };
const TOOLTIP_STYLE = {
  contentStyle: { borderRadius: 8, border: '1px solid rgba(148,163,184,0.3)', fontSize: 12 },
};

const VERDICT_STYLE: Record<ScaleVerdict, { label: string; cls: string; blurb: string }> = {
  bulk: {
    label: 'Bulk month',
    cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/40',
    blurb: 'Wide margin and enough cushion: push spend, accept a lower ROAS for more profit and data.',
  },
  hold: {
    label: 'Hold',
    cls: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-400/40',
    blurb: 'Keep spend steady. Improve efficiency or build reserves before the next push.',
  },
  cut: {
    label: 'Cut month',
    cls: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-400/40',
    blurb: 'Too close to break-even or too little cushion. Pull spend back and stack cash.',
  },
  unknown: {
    label: 'Not enough data',
    cls: 'bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-400/40',
    blurb: 'Log paid ad spend and cash for a few weeks, or type numbers below to model it.',
  },
};

type Draft = {
  monthlySpend: string;
  roas: string;
  fixedMonthly: string;
  variablePct: string;
  recurringCash: string;
  worstRoas: string;
  decay: string;
};

function num(s: string): number | null {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function str(n: number | null | undefined, digits?: number): string {
  if (n == null || !Number.isFinite(n)) return '';
  return digits == null ? String(Math.round(n)) : String(Math.round(n * 10 ** digits) / 10 ** digits);
}

function Input({
  label,
  value,
  onChange,
  prefix,
  suffix,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="block min-w-0" title={hint}>
      <span className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">{label}</span>
      <div className="mt-1 flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-indigo-500">
        {prefix ? <span className="pl-2 text-xs text-gray-500">{prefix}</span> : null}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent px-2 py-1.5 text-sm tabular-nums text-gray-900 dark:text-gray-100 outline-none"
        />
        {suffix ? <span className="pr-2 text-xs text-gray-500">{suffix}</span> : null}
      </div>
    </label>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  const toneCls =
    tone === 'good'
      ? 'text-emerald-600 dark:text-emerald-400'
      : tone === 'bad'
        ? 'text-red-600 dark:text-red-400'
        : 'text-gray-900 dark:text-white';
  return (
    <div className="glass-panel rounded-lg px-3 py-2 min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 truncate">{label}</div>
      <div className={`text-lg font-bold tabular-nums truncate ${toneCls}`}>{value}</div>
      {sub ? <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{sub}</div> : null}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="glass-card rounded-xl border border-white/10 p-4 min-w-0">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          {subtitle ? <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ScalePlannerPanel({
  asOrgId,
  onOpenEconomics,
}: {
  /** System owner viewing another org. */
  asOrgId?: string;
  /** Jump to Settings → Business economics. */
  onOpenEconomics?: () => void;
}) {
  const [readiness, setReadiness] = useState<ScaleReadinessResponse | null>(null);
  const [econ, setEcon] = useState<BusinessEconomics | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft>({
    monthlySpend: '',
    roas: '',
    fixedMonthly: '',
    variablePct: '',
    recurringCash: '',
    worstRoas: '',
    decay: '',
  });
  const [goalProfit, setGoalProfit] = useState('');
  const [goalMonths, setGoalMonths] = useState(6);
  const [growthPct, setGrowthPct] = useState(30);

  const prefill = useCallback((r: ScaleReadinessResponse | null, e: BusinessEconomics | null) => {
    const fixed = (e?.fixed_monthly_costs ?? 0) + (e?.include_living_in_breakeven ? e?.living_expenses ?? 0 : 0);
    setDraft({
      monthlySpend: str(r?.trailing.monthly_spend),
      roas: str(r?.trailing.roas, 2),
      fixedMonthly: fixed > 0 ? str(fixed) : '',
      variablePct: str(e?.variable_cost_pct, 1),
      recurringCash: str(e?.monthly_recurring_cash),
      worstRoas: str(r?.trailing.worst_week_roas, 2),
      decay: str(e?.roas_decay ?? null, 2),
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([apiClient.getScaleReadiness(asOrgId), apiClient.getBusinessEconomics(asOrgId)]).then(
      ([r, e]) => {
        if (cancelled) return;
        const rv = r.status === 'fulfilled' ? r.value : null;
        const ev = e.status === 'fulfilled' ? e.value : null;
        const denied =
          (r.status === 'rejected' && (r.reason as any)?.response?.status === 403) ||
          (e.status === 'rejected' && (e.reason as any)?.response?.status === 403);
        setRestricted(denied);
        setReadiness(rv);
        setEcon(ev);
        prefill(rv, ev);
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [asOrgId, prefill]);

  const set = (k: keyof Draft) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const inputs: PlannerInputs | null = useMemo(() => {
    const spend = num(draft.monthlySpend);
    const roas = num(draft.roas);
    if (spend == null || spend <= 0 || roas == null || roas <= 0) return null;
    const worst = num(draft.worstRoas);
    return {
      monthlySpend: spend,
      roas,
      fixedMonthly: num(draft.fixedMonthly) ?? 0,
      variablePct: num(draft.variablePct),
      recurringCash: num(draft.recurringCash) ?? 0,
      decay: num(draft.decay) ?? DEFAULT_DECAY,
      worstRatio: worst != null && worst >= 0 ? Math.min(1, worst / roas) : DEFAULT_WORST_RATIO,
    };
  }, [draft]);

  const be = inputs ? breakEvenRoas(inputs.monthlySpend, inputs.fixedMonthly, inputs.variablePct) : null;
  const zone = inputs ? gapZone(inputs.roas, be) : null;
  const profitNow = inputs
    ? monthlyProfit(inputs.monthlySpend, inputs.roas, inputs.fixedMonthly, inputs.variablePct, inputs.recurringCash)
    : null;
  const sweep = useMemo(() => (inputs ? spendSweep(inputs) : []), [inputs]);
  const peakSpend = inputs ? profitMaxSpend(inputs) : null;
  const cushion =
    econ && (econ.cash_reserves != null || econ.tax_reserve != null)
      ? (econ.cash_reserves ?? 0) + (econ.tax_reserve ?? 0)
      : null;
  const goal = num(goalProfit);
  const plan = useMemo(
    () =>
      inputs
        ? projectGoal(inputs, { growthPct, months: goalMonths, goalProfit: goal ?? Infinity, startCushion: cushion })
        : null,
    [inputs, growthPct, goalMonths, goal, cushion]
  );
  const needed = useMemo(
    () => (inputs && goal != null ? growthNeeded(inputs, { months: goalMonths, goalProfit: goal }) : null),
    [inputs, goal, goalMonths]
  );

  const verdict = readiness?.readiness.verdict ?? 'unknown';
  const vs = VERDICT_STYLE[verdict];
  const volatility = readiness?.trailing.cost_per_booking_volatility_pct ?? null;
  const r = readiness?.readiness;

  if (loading) {
    return <div className="glass-card rounded-xl border border-white/10 p-6 text-sm text-gray-500">Loading Scale Planner…</div>;
  }

  return (
    <div className="space-y-4">
      {/* Verdict */}
      <section className="glass-card rounded-xl border border-white/10 p-4">
        {restricted ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Only org owners and admins see the verdict and business economics. Type numbers below to model scenarios.
          </p>
        ) : (
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold ${vs.cls}`}>
                  {vs.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Last 4 complete weeks · {r?.risk_tolerance ?? 'balanced'} risk
                </span>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-200">{vs.blurb}</p>
              {r?.reasons.length ? (
                <ul className="list-disc pl-5 text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
                  {r.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : null}
              {readiness && !readiness.configured ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Fixed costs and reserves aren&apos;t set yet, so break-even and runway are rough.{' '}
                  {onOpenEconomics ? (
                    <button type="button" className="underline font-semibold" onClick={onOpenEconomics}>
                      Add business economics
                    </button>
                  ) : (
                    'Add them in Settings → Business economics.'
                  )}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:w-[34rem]">
              <Stat
                label="Recommended / day"
                value={usd0(r?.recommended_daily_spend)}
                sub={`now ${usd0((readiness?.trailing.monthly_spend ?? 0) / 30)}/day`}
              />
              <Stat
                label="Expected profit"
                value={usd0(r?.recommended_expected_profit)}
                sub="per month at that spend"
                tone={(r?.recommended_expected_profit ?? 0) >= 0 ? 'good' : 'bad'}
              />
              <Stat
                label="Worst month"
                value={usd0(r?.recommended_worst_profit)}
                sub={`max safe loss ${usd0(r?.max_safe_loss)}`}
                tone={(r?.recommended_worst_profit ?? 0) >= 0 ? 'good' : 'bad'}
              />
              <Stat
                label="Runway"
                value={r?.runway_months != null ? `${r.runway_months} mo` : '—'}
                sub={`floor ${r?.reserve_floor_months ?? 6} mo`}
              />
            </div>
          </div>
        )}
      </section>

      {/* Inputs */}
      <Card
        title="Your numbers"
        subtitle="Prefilled from the last 4 weeks of paid ads + Business economics. Change any to run a what-if."
        action={
          <button
            type="button"
            onClick={() => prefill(readiness, econ)}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-white/10"
          >
            Reset to actuals
          </button>
        }
      >
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <Input label="Ad spend / month" prefix="$" value={draft.monthlySpend} onChange={set('monthlySpend')} />
          <Input label="ROAS (cash)" suffix="x" value={draft.roas} onChange={set('roas')} />
          <Input label="Fixed costs / mo" prefix="$" value={draft.fixedMonthly} onChange={set('fixedMonthly')} />
          <Input label="Variable costs" suffix="%" value={draft.variablePct} onChange={set('variablePct')} />
          <Input label="Recurring cash / mo" prefix="$" value={draft.recurringCash} onChange={set('recurringCash')} />
          <Input
            label="Worst-week ROAS"
            suffix="x"
            value={draft.worstRoas}
            onChange={set('worstRoas')}
            hint="Blank = assume ROAS halves on a push"
          />
          <Input
            label="ROAS decay"
            value={draft.decay}
            onChange={set('decay')}
            hint="How fast ROAS falls as spend grows. 0.5 default."
          />
        </div>
        {!inputs ? (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">Enter monthly ad spend and ROAS to see the plan.</p>
        ) : null}
      </Card>

      {inputs ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* 1. Break-even */}
            <Card title="Break-even ROAS" subtitle="The ROAS where this month's profit is exactly $0">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Break-even at this spend" value={ratio2(be)} sub="covers fixed + variable costs" />
                <Stat
                  label="Marginal break-even"
                  value={ratio2(marginalBreakEvenRoas(inputs.variablePct))}
                  sub="next ad dollar pays for itself"
                />
                <Stat label="Current ROAS" value={ratio2(inputs.roas)} />
                <Stat label="Profit this month" value={usd0(profitNow)} tone={(profitNow ?? 0) >= 0 ? 'good' : 'bad'} />
              </div>
              {zone ? (
                <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${ZONE_STYLE[zone.zone].cls}`}>
                  <span className="font-semibold">
                    {ZONE_STYLE[zone.zone].label} · {zone.gapPct > 0 ? '+' : ''}
                    {zone.gapPct}% vs break-even
                  </span>
                  <div className="text-xs opacity-90">{ZONE_STYLE[zone.zone].hint}</div>
                </div>
              ) : null}
            </Card>

            {/* 2. Spend vs profit */}
            <div className="xl:col-span-2 min-w-0">
              <Card title="Spend vs. profit" subtitle="Absolute monthly profit as spend scales — ROAS drops, but profit can still grow">
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5" style={{ backgroundColor: PROFIT_COLOR }} /> Expected profit
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 border-t-2 border-dashed" style={{ borderColor: WORST_COLOR }} /> Worst case
                  </span>
                  {peakSpend ? (
                    <span>
                      Profit peaks near <strong className="tabular-nums">{usd0(peakSpend / 30)}/day</strong>
                    </span>
                  ) : null}
                </div>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={sweep} margin={{ left: 0, right: 12, top: 16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                      <XAxis
                        dataKey="daily"
                        type="number"
                        domain={['dataMin', 'dataMax']}
                        tick={AXIS_TICK}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => usd0(Number(v))}
                      />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => usd0(Number(v))} width={72} />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        labelFormatter={(_l, payload) => {
                          const p = payload?.[0]?.payload as (typeof sweep)[number] | undefined;
                          if (!p) return '';
                          return `${usd0(p.daily)}/day (${p.multiple}x) · ROAS ${ratio2(p.roas)} · break-even ${ratio2(p.breakeven)}`;
                        }}
                        formatter={(value: number, name: string) => [usd0(value), name]}
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      <ReferenceLine
                        x={inputs.monthlySpend / 30}
                        stroke={CUSHION_COLOR}
                        strokeDasharray="4 4"
                        label={{ value: 'today', position: 'top', fill: CUSHION_COLOR, fontSize: 11 }}
                      />
                      <Line type="monotone" dataKey="profit" name="Expected profit" stroke={PROFIT_COLOR} strokeWidth={2} dot={{ r: 3 }} />
                      <Line
                        type="monotone"
                        dataKey="worstProfit"
                        name="Worst case"
                        stroke={WORST_COLOR}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-gray-600 dark:text-gray-300">Show table</summary>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-right tabular-nums">
                      <thead className="text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="text-left font-medium py-1">Spend</th>
                          <th className="font-medium">/ day</th>
                          <th className="font-medium">ROAS</th>
                          <th className="font-medium">Break-even</th>
                          <th className="font-medium">Profit</th>
                          <th className="font-medium">Worst case</th>
                        </tr>
                      </thead>
                      <tbody className="text-gray-800 dark:text-gray-200">
                        {sweep.map((p) => (
                          <tr key={p.multiple} className={p.multiple === 1 ? 'font-semibold' : ''}>
                            <td className="text-left py-0.5">{p.multiple}x</td>
                            <td>{usd0(p.daily)}</td>
                            <td>{ratio2(p.roas)}</td>
                            <td>{ratio2(p.breakeven)}</td>
                            <td className={p.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                              {usd0(p.profit)}
                            </td>
                            <td className={p.worstProfit >= 0 ? '' : 'text-red-600 dark:text-red-400'}>{usd0(p.worstProfit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </Card>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* 3. Goal path */}
            <div className="xl:col-span-2 min-w-0">
              <Card title="Goal path" subtitle="Grow spend a fixed % every month and see when profit hits your goal">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <Input label="Monthly profit goal" prefix="$" value={goalProfit} onChange={setGoalProfit} />
                  <label className="block">
                    <span className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Within</span>
                    <select
                      value={goalMonths}
                      onChange={(e) => setGoalMonths(Number(e.target.value))}
                      className="mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                    >
                      {[3, 6, 9, 12].map((m) => (
                        <option key={m} value={m}>
                          {m} months
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Spend growth: {growthPct}% / month
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={growthPct}
                      onChange={(e) => setGrowthPct(Number(e.target.value))}
                      className="mt-2 w-full accent-indigo-500"
                      aria-label="Monthly spend growth"
                    />
                  </label>
                </div>
                {goal != null ? (
                  <p className="mb-2 text-sm text-gray-700 dark:text-gray-200">
                    {needed != null ? (
                      <>
                        Growing spend <strong>{needed}% a month</strong> reaches {usd0(goal)}/mo profit within {goalMonths} months.
                        {plan?.hitsGoalAt
                          ? ` At ${growthPct}%, you get there in month ${plan.hitsGoalAt}.`
                          : ` ${growthPct}% isn't enough.`}
                      </>
                    ) : (
                      <>
                        {usd0(goal)}/mo isn&apos;t reachable in {goalMonths} months at this ROAS decay — profit peaks around{' '}
                        {usd0(plan?.peakProfit)}. Improve the funnel (ROAS) or costs, not just spend.
                      </>
                    )}
                  </p>
                ) : null}
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={plan?.months ?? []} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
                      <XAxis dataKey="month" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(m) => `M${m}`} />
                      <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => usd0(Number(v))} width={72} />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        labelFormatter={(m, payload) => {
                          const p = payload?.[0]?.payload as { daily: number; roas: number } | undefined;
                          return `Month ${m}${p ? ` · ${usd0(p.daily)}/day · ROAS ${ratio2(p.roas)}` : ''}`;
                        }}
                        formatter={(value: number, name: string) => [usd0(value), name]}
                      />
                      <ReferenceLine y={0} stroke="#94a3b8" />
                      {goal != null ? <ReferenceLine y={goal} stroke={PROFIT_COLOR} strokeDasharray="4 4" /> : null}
                      <Line type="monotone" dataKey="profit" name="Monthly profit" stroke={PROFIT_COLOR} strokeWidth={2} dot={{ r: 3 }} />
                      {cushion != null ? (
                        <Line type="monotone" dataKey="cushion" name="Cash cushion" stroke={CUSHION_COLOR} strokeWidth={2} dot={false} />
                      ) : null}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                {plan && cushion != null && plan.lowestCushion != null ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Cash cushion starts at {usd0(cushion)} and is lowest at {usd0(plan.lowestCushion)} on this path.
                  </p>
                ) : null}
              </Card>
            </div>

            {/* Consistency */}
            <Card title="Consistency" subtitle="How much cost per booked call swings week to week">
              <Stat
                label="Cost per booking volatility"
                value={volatility != null ? `±${volatility}%` : '—'}
                sub={`${readiness?.trailing.weeks_with_spend ?? 0} weeks with spend`}
              />
              <p className="mt-3 text-xs text-gray-600 dark:text-gray-400">
                {volatility == null
                  ? 'Needs at least two weeks with ad spend and bookings.'
                  : volatility <= 25
                    ? 'Stable. Well-run call funnels hold within about ±20%, so you can plan spend with confidence.'
                    : volatility <= 60
                      ? 'Moderate swings. Judge pushes over 7+ days, not single days.'
                      : 'Very volatile — typical of DM and follower funnels. Size pushes off the worst week, not the average.'}
              </p>
              {readiness?.target_cost_per_call != null ? (
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Target cost per booked call: <strong>{usd0(readiness.target_cost_per_call)}</strong>. Ads that spend 3x this with no
                  result get a Kill alert in Marketing Intel → Ads.
                </p>
              ) : null}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
