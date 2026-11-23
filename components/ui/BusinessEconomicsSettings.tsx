'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import type { BusinessEconomics, BusinessEconomicsInput, RiskTolerance } from '@/types/businessEconomics';

/**
 * Settings → Business economics. The numbers the Scale Planner needs that no
 * integration knows: fixed costs, variable share, reserves, risk tolerance.
 * Reserves and living costs are encrypted at rest and visible to owners/admins only.
 * `asOrgId`: a system owner editing another org from the owner org view.
 */

type NumField =
  | 'fixed_monthly_costs'
  | 'variable_cost_pct'
  | 'cash_reserves'
  | 'tax_reserve'
  | 'living_expenses'
  | 'target_cost_per_call'
  | 'monthly_recurring_cash'
  | 'roas_decay';

const RISK_OPTIONS: { value: RiskTolerance; label: string; hint: string }[] = [
  { value: 'conservative', label: 'Conservative', hint: 'Keep 9 months of costs in reserve, grow spend up to 1.5x a month.' },
  { value: 'balanced', label: 'Balanced', hint: 'Keep 6 months in reserve, grow spend up to 2x a month.' },
  { value: 'aggressive', label: 'Aggressive', hint: 'Keep 3 months in reserve, grow spend up to 4x a month.' },
];

function Field({
  label,
  hint,
  prefix,
  suffix,
  value,
  onChange,
  step = 'any',
}: {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</span>
      <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus-within:ring-2 focus-within:ring-indigo-500">
        {prefix ? <span className="pl-3 text-sm text-gray-500">{prefix}</span> : null}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none tabular-nums"
        />
        {suffix ? <span className="pr-3 text-sm text-gray-500 whitespace-nowrap">{suffix}</span> : null}
      </div>
      {hint ? <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span> : null}
    </label>
  );
}

function toStr(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

function toNum(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export default function BusinessEconomicsSettings({
  asOrgId,
  onSaved,
}: {
  asOrgId?: string;
  onSaved?: (row: BusinessEconomics) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [values, setValues] = useState<Record<NumField, string>>({
    fixed_monthly_costs: '',
    variable_cost_pct: '',
    cash_reserves: '',
    tax_reserve: '',
    living_expenses: '',
    target_cost_per_call: '',
    monthly_recurring_cash: '',
    roas_decay: '',
  });
  const [risk, setRisk] = useState<RiskTolerance>('balanced');
  const [includeLiving, setIncludeLiving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiClient
      .getBusinessEconomics(asOrgId)
      .then((row) => {
        if (cancelled) return;
        setValues({
          fixed_monthly_costs: toStr(row.fixed_monthly_costs),
          variable_cost_pct: toStr(row.variable_cost_pct),
          cash_reserves: toStr(row.cash_reserves),
          tax_reserve: toStr(row.tax_reserve),
          living_expenses: toStr(row.living_expenses),
          target_cost_per_call: toStr(row.target_cost_per_call),
          monthly_recurring_cash: toStr(row.monthly_recurring_cash),
          roas_decay: toStr(row.roas_decay),
        });
        setRisk(row.risk_tolerance || 'balanced');
        setIncludeLiving(Boolean(row.include_living_in_breakeven));
        setSavedAt(row.updated_at);
        setError(null);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.response?.data?.detail || 'Could not load business economics.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asOrgId]);

  const set = (k: NumField) => (v: string) => setValues((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    const variable = toNum(values.variable_cost_pct);
    if (variable != null && variable > 95) {
      setError('Variable costs must be under 95% of revenue.');
      return;
    }
    const decay = toNum(values.roas_decay);
    if (decay != null && decay > 2) {
      setError('ROAS decay must be between 0 and 2.');
      return;
    }
    const body: BusinessEconomicsInput = {
      fixed_monthly_costs: toNum(values.fixed_monthly_costs),
      variable_cost_pct: variable,
      cash_reserves: toNum(values.cash_reserves),
      tax_reserve: toNum(values.tax_reserve),
      living_expenses: toNum(values.living_expenses),
      target_cost_per_call: toNum(values.target_cost_per_call),
      monthly_recurring_cash: toNum(values.monthly_recurring_cash),
      roas_decay: decay,
      risk_tolerance: risk,
      include_living_in_breakeven: includeLiving,
    };
    setSaving(true);
    setError(null);
    try {
      const row = await apiClient.putBusinessEconomics(body, asOrgId);
      setSavedAt(row.updated_at);
      onSaved?.(row);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Loading business economics…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Business economics</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Powers the Scale Planner (Funnels tab): break-even ROAS, how much you can safely spend, and the
          bulk / hold / cut verdict. Reserves and living costs are encrypted and only owners and admins can see
          them.
        </p>
      </div>

      <section className="glass-card rounded-xl border border-gray-200/60 dark:border-white/10 p-4 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Costs</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Fixed monthly costs"
            hint="Software, team salaries, coaching programs, rent — anything that doesn't move with ad spend."
            prefix="$"
            value={values.fixed_monthly_costs}
            onChange={set('fixed_monthly_costs')}
          />
          <Field
            label="Variable costs"
            hint="Share of each sale that goes out again: sales commission + payment processor + delivery."
            suffix="% of revenue"
            value={values.variable_cost_pct}
            onChange={set('variable_cost_pct')}
          />
          <Field
            label="Recurring cash per month"
            hint="Renewals and installments from existing clients. Cash-only ROAS misses this."
            prefix="$"
            value={values.monthly_recurring_cash}
            onChange={set('monthly_recurring_cash')}
          />
          <Field
            label="Target cost per booked call"
            hint="Ads that spend 3x this with no result get a Kill alert. Typical call funnels: $100–$300."
            prefix="$"
            value={values.target_cost_per_call}
            onChange={set('target_cost_per_call')}
          />
        </div>
      </section>

      <section className="glass-card rounded-xl border border-gray-200/60 dark:border-white/10 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Cushion</h3>
          <span title="Encrypted at rest" aria-hidden className="text-gray-400">🔒</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field
            label="Cash reserves"
            hint="Operating account + war chest you'd be willing to draw on."
            prefix="$"
            value={values.cash_reserves}
            onChange={set('cash_reserves')}
          />
          <Field
            label="Tax set-aside"
            hint="Counted as a loss buffer: tax is only owed on profit. Check with your accountant."
            prefix="$"
            value={values.tax_reserve}
            onChange={set('tax_reserve')}
          />
          <Field
            label="Owner living costs / month"
            hint="Your personal monthly nut. Sets how many months of runway you have."
            prefix="$"
            value={values.living_expenses}
            onChange={set('living_expenses')}
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={includeLiving}
            onChange={(e) => setIncludeLiving(e.target.checked)}
            className="mt-0.5"
          />
          <span>Count living costs in break-even ROAS (the business must pay you before it profits).</span>
        </label>
      </section>

      <section className="glass-card rounded-xl border border-gray-200/60 dark:border-white/10 p-4 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Risk</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Risk tolerance">
          {RISK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={risk === opt.value}
              onClick={() => setRisk(opt.value)}
              className={`text-left rounded-lg border px-3 py-2 transition-colors ${
                risk === opt.value
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-500/5'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{opt.label}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{opt.hint}</div>
            </button>
          ))}
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-600 dark:text-gray-300">Advanced: ROAS decay</summary>
          <div className="mt-3 max-w-xs">
            <Field
              label="ROAS decay"
              hint="How fast ROAS falls as spend grows. 0.5 (default) means tripling spend takes 3.5x to about 2x. 0 = no drop."
              value={values.roas_decay}
              onChange={set('roas_decay')}
              step="0.05"
            />
          </div>
        </details>
      </section>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {savedAt ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">Last saved {new Date(savedAt).toLocaleString()}</span>
        ) : null}
      </div>
    </div>
  );
}
