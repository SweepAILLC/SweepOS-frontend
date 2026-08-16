'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '@/lib/api';
import { orgIdFromAccessToken } from '@/lib/orgScope';
import {
  calculateOrganicDm,
  calculatePaidVsl,
  defaultSimulatorInputs,
  formatNum,
  formatRoas,
  formatUsd,
  parseNumInput,
} from '@/lib/funnelSimulator';
import type {
  BaselineField,
  FunnelSimulatorBaselines,
  FunnelSimulatorScenario,
  OrganicDmInputs,
  PaidVslInputs,
  SimulatorInputs,
  SimulatorLookback,
  SimulatorMode,
} from '@/types/funnelSimulator';

function lastScenarioKey(): string {
  return `sweepos:funnel-simulator:last-scenario:${orgIdFromAccessToken()}`;
}

function applyHistoric(
  inputs: SimulatorInputs,
  baselines: FunnelSimulatorBaselines
): SimulatorInputs {
  const f = baselines.fields;
  const paid = { ...inputs.paid };
  const organic = { ...inputs.organic };
  if (f.show_pct.value != null) {
    paid.showPct = f.show_pct.value;
    organic.showPct = f.show_pct.value;
  }
  if (f.close_pct.value != null) {
    paid.closePct = f.close_pct.value;
    organic.closePct = f.close_pct.value;
  }
  if (f.aov.value != null) {
    paid.aov = f.aov.value;
    organic.aov = f.aov.value;
  }
  if (f.book_call_pct.value != null) paid.bookCallPct = f.book_call_pct.value;
  if (f.lp_conv_pct.value != null) paid.lpConvPct = f.lp_conv_pct.value;
  if (f.convo_to_book_pct.value != null) organic.convoToBookPct = f.convo_to_book_pct.value;
  if (f.pitch_to_book_pct.value != null) organic.pitchToBookPct = f.pitch_to_book_pct.value;
  return { paid, organic };
}

type Props = { onClose: () => void };

function NumField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  placeholder,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}
      </span>
      <div className="flex items-center rounded-lg bg-gray-100 dark:bg-white/10 border border-gray-200/80 dark:border-white/10 focus-within:ring-2 focus-within:ring-sky-500/40">
        {prefix ? (
          <span className="pl-2.5 text-xs text-gray-400">{prefix}</span>
        ) : null}
        <input
          type="text"
          inputMode="decimal"
          value={value == null ? '' : String(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(parseNumInput(e.target.value))}
          className="w-full bg-transparent px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
        />
        {suffix ? (
          <span className="pr-2.5 text-xs text-gray-400">{suffix}</span>
        ) : null}
      </div>
      {hint ? <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p> : null}
    </label>
  );
}

function OutRow({
  label,
  value,
  emphasize,
  positive,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={`text-sm tabular-nums ${
          positive
            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
            : emphasize
              ? 'font-semibold text-gray-900 dark:text-gray-50'
              : 'text-gray-800 dark:text-gray-200'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function KpiCard({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200/60 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 digitized-text">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${
          positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-50'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200/60 dark:border-white/10 bg-gray-50/80 dark:bg-white/[0.03] p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 digitized-text mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function fieldHint(field: BaselineField | undefined): string | undefined {
  if (!field) return undefined;
  if (field.value != null && field.sample_n != null && field.sample_d != null) {
    return `Historic ${field.sample_n} / ${field.sample_d}`;
  }
  if (field.missing_reason) return field.missing_reason;
  return undefined;
}

export default function FunnelSimulatorModal({ onClose }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<SimulatorMode>('paid_vsl');
  const [lookback, setLookback] = useState<SimulatorLookback>(90);
  const [funnelId, setFunnelId] = useState<string>('');
  const [inputs, setInputs] = useState<SimulatorInputs>(defaultSimulatorInputs);
  const [baselines, setBaselines] = useState<FunnelSimulatorBaselines | null>(null);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [loadingBaselines, setLoadingBaselines] = useState(true);
  const [scenarios, setScenarios] = useState<FunnelSimulatorScenario[]>([]);
  const [scenarioId, setScenarioId] = useState<string>('');
  const [scenarioName, setScenarioName] = useState('Untitled');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const appliedOnce = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const loadScenarios = useCallback(async () => {
    try {
      const rows = await apiClient.listFunnelSimulatorScenarios();
      setScenarios(rows);
      const last = typeof window !== 'undefined' ? window.localStorage.getItem(lastScenarioKey()) : null;
      if (last && rows.some((r) => r.id === last)) {
        const row = rows.find((r) => r.id === last)!;
        applyScenario(row);
      }
    } catch {
      setScenarios([]);
    }
  }, []);

  const loadBaselines = useCallback(async () => {
    setLoadingBaselines(true);
    setBaselineError(null);
    try {
      const data = await apiClient.getFunnelSimulatorBaselines({
        days: lookback === 'mtd' ? 30 : lookback,
        mtd: lookback === 'mtd',
        funnel_id: funnelId || null,
      });
      setBaselines(data);
      if (!appliedOnce.current) {
        appliedOnce.current = true;
        setInputs((prev) => applyHistoric(prev, data));
      }
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setBaselineError(detail || 'Could not load historic averages.');
    } finally {
      setLoadingBaselines(false);
    }
  }, [funnelId, lookback]);

  useEffect(() => {
    void loadScenarios();
  }, [loadScenarios]);

  useEffect(() => {
    void loadBaselines();
  }, [loadBaselines]);

  const paidOut = useMemo(() => calculatePaidVsl(inputs.paid), [inputs.paid]);
  const organicOut = useMemo(() => calculateOrganicDm(inputs.organic), [inputs.organic]);

  function patchPaid(patch: Partial<PaidVslInputs>) {
    setInputs((prev) => ({ ...prev, paid: { ...prev.paid, ...patch } }));
  }
  function patchOrganic(patch: Partial<OrganicDmInputs>) {
    setInputs((prev) => ({ ...prev, organic: { ...prev.organic, ...patch } }));
  }

  function applyScenario(row: FunnelSimulatorScenario) {
    appliedOnce.current = true;
    setScenarioId(row.id);
    setScenarioName(row.name);
    setMode(row.mode);
    setFunnelId(row.funnel_id || '');
    const lb = row.lookback_days;
    if (lb === 'mtd') setLookback('mtd');
    else if (lb === '30') setLookback(30);
    else setLookback(90);
    const next = defaultSimulatorInputs();
    if (row.inputs?.paid) next.paid = { ...next.paid, ...row.inputs.paid };
    if (row.inputs?.organic) next.organic = { ...next.organic, ...row.inputs.organic };
    setInputs(next);
    try {
      window.localStorage.setItem(lastScenarioKey(), row.id);
    } catch {
      /* ignore */
    }
  }

  async function handleSave() {
    const name = scenarioName.trim() || 'Untitled';
    setSaving(true);
    setSaveError(null);
    const payload = {
      name,
      mode,
      funnel_id: funnelId || null,
      lookback_days: lookback,
      inputs,
    };
    try {
      if (scenarioId) {
        const row = await apiClient.updateFunnelSimulatorScenario(scenarioId, payload);
        setScenarios((prev) => prev.map((s) => (s.id === row.id ? row : s)));
        setScenarioName(row.name);
      } else {
        const row = await apiClient.createFunnelSimulatorScenario(payload);
        setScenarios((prev) => [row, ...prev]);
        setScenarioId(row.id);
        setScenarioName(row.name);
        try {
          window.localStorage.setItem(lastScenarioKey(), row.id);
        } catch {
          /* ignore */
        }
      }
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setSaveError(detail || 'Failed to save scenario.');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAs() {
    const name = window.prompt('Scenario name', `${scenarioName.trim() || 'Untitled'} copy`);
    if (!name?.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const row = await apiClient.createFunnelSimulatorScenario({
        name: name.trim(),
        mode,
        funnel_id: funnelId || null,
        lookback_days: lookback,
        inputs,
      });
      setScenarios((prev) => [row, ...prev]);
      setScenarioId(row.id);
      setScenarioName(row.name);
      try {
        window.localStorage.setItem(lastScenarioKey(), row.id);
      } catch {
        /* ignore */
      }
    } catch (err: unknown) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setSaveError(detail || 'Failed to save scenario.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!scenarioId) return;
    if (!window.confirm('Delete this scenario?')) return;
    setSaving(true);
    try {
      await apiClient.deleteFunnelSimulatorScenario(scenarioId);
      setScenarios((prev) => prev.filter((s) => s.id !== scenarioId));
      setScenarioId('');
      setScenarioName('Untitled');
      try {
        window.localStorage.removeItem(lastScenarioKey());
      } catch {
        /* ignore */
      }
    } catch {
      setSaveError('Failed to delete scenario.');
    } finally {
      setSaving(false);
    }
  }

  const f = baselines?.fields;
  const funnels = baselines?.funnels || [];

  if (!mounted) return null;

  return createPortal(
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-5xl my-6 sm:my-0 max-h-[92vh] bg-white dark:bg-gray-900 border border-gray-200/30 dark:border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-200/40 dark:border-white/8">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Funnel Simulator</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Outputs update live as you edit.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setMode('paid_vsl')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  mode === 'paid_vsl'
                    ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                Paid VSL
              </button>
              <button
                type="button"
                onClick={() => setMode('organic_dm')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                  mode === 'organic_dm'
                    ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                Organic DM
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700/40"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-shrink-0 flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-gray-200/30 dark:border-white/8 bg-gray-50/60 dark:bg-white/[0.02]">
          <select
            value={funnelId}
            onChange={(e) => {
              appliedOnce.current = false;
              setFunnelId(e.target.value);
            }}
            className="text-xs rounded-md bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/10 px-2 py-1.5 text-gray-800 dark:text-gray-100"
          >
            <option value="">All funnels</option>
            {funnels.map((fn) => (
              <option key={fn.id} value={fn.id}>
                {fn.name}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-md border border-gray-200 dark:border-white/10 p-0.5">
            {([30, 90, 'mtd'] as SimulatorLookback[]).map((lb) => (
              <button
                key={String(lb)}
                type="button"
                onClick={() => {
                  appliedOnce.current = false;
                  setLookback(lb);
                }}
                className={`px-2 py-1 text-[11px] font-semibold rounded ${
                  lookback === lb
                    ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200'
                    : 'text-gray-500'
                }`}
              >
                {lb === 'mtd' ? 'MTD' : `${lb}d`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => baselines && setInputs((prev) => applyHistoric(prev, baselines))}
            disabled={!baselines || loadingBaselines}
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md bg-violet-600/90 hover:bg-violet-500 text-white disabled:opacity-50"
          >
            {loadingBaselines ? 'Loading…' : 'Use historic averages'}
          </button>
          <select
            value={scenarioId}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) {
                setScenarioId('');
                setScenarioName('Untitled');
                return;
              }
              const row = scenarios.find((s) => s.id === id);
              if (row) applyScenario(row);
            }}
            className="text-xs rounded-md bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/10 px-2 py-1.5 text-gray-800 dark:text-gray-100 min-w-[8rem]"
          >
            <option value="">New scenario</option>
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Scenario name"
            className="text-xs rounded-md bg-white/80 dark:bg-black/30 border border-gray-200 dark:border-white/10 px-2 py-1.5 text-gray-800 dark:text-gray-100 w-36"
          />
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md bg-gray-800 dark:bg-gray-700 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAs()}
            disabled={saving}
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-white/10"
          >
            Save as
          </button>
          {scenarioId ? (
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={saving}
              className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md text-rose-400 hover:bg-rose-500/10"
            >
              Delete
            </button>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {baselineError ? <p className="text-xs text-amber-500">{baselineError}</p> : null}
          {saveError ? <p className="text-xs text-rose-400">{saveError}</p> : null}
          {baselines ? (
            <p className="text-[11px] text-gray-500">
              Historic window {baselines.lookback_start} → {baselines.lookback_end}
              {baselines.aov_basis === 'cash_collected'
                ? ' · AOV from cash collected / closes'
                : baselines.aov_basis === 'revenue'
                  ? ' · AOV from deal revenue / closes'
                  : ''}
              {!baselines.calendar_available ? ' · Calendar not connected (book rate uses pipeline stage)' : ''}
            </p>
          ) : null}

          {mode === 'paid_vsl' ? (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <KpiCard label="Monthly Revenue" value={formatUsd(paidOut.revenue)} />
                <KpiCard label="Monthly Net" value={formatUsd(paidOut.net)} positive />
                <KpiCard label="ROAS" value={formatRoas(paidOut.roas)} />
                <KpiCard label="# Sales / Mo" value={formatNum(paidOut.sales)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="space-y-3">
                  <Section title="Ads">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <NumField
                        label="Daily Ad Spend"
                        prefix="$"
                        placeholder="300"
                        value={inputs.paid.dailyAdSpend}
                        onChange={(v) => patchPaid({ dailyAdSpend: v })}
                        hint="Not in SweepOS — enter manually"
                      />
                      <NumField
                        label="Initial CPC"
                        prefix="$"
                        placeholder="2.70"
                        value={inputs.paid.cpc}
                        onChange={(v) => patchPaid({ cpc: v })}
                        hint="Not in SweepOS — enter manually"
                      />
                      <NumField
                        label="Landing Page Conv."
                        suffix="%"
                        placeholder="7"
                        value={inputs.paid.lpConvPct}
                        onChange={(v) => patchPaid({ lpConvPct: v })}
                        hint={fieldHint(f?.lp_conv_pct)}
                      />
                    </div>
                    <div className="mt-3 border-t border-gray-200/50 dark:border-white/10 pt-2 space-y-0.5">
                      <OutRow label="Monthly Ad Spend" value={formatUsd(paidOut.monthlyAdSpend)} />
                      <OutRow label="Est. Daily Visitors" value={formatNum(paidOut.dailyVisitors, 0)} />
                      <OutRow label="Cost Per Lead" value={formatUsd(paidOut.cpl, { cents: true })} />
                      <OutRow label="Monthly Leads" value={formatNum(paidOut.monthlyLeads, 0)} />
                    </div>
                  </Section>
                  <Section title="Sales Funnel">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <NumField
                        label="% Book Call"
                        suffix="%"
                        placeholder="30"
                        value={inputs.paid.bookCallPct}
                        onChange={(v) => patchPaid({ bookCallPct: v })}
                        hint={fieldHint(f?.book_call_pct) || 'New funnel leads who booked'}
                      />
                      <NumField
                        label="% Show"
                        suffix="%"
                        placeholder="60"
                        value={inputs.paid.showPct}
                        onChange={(v) => patchPaid({ showPct: v })}
                        hint={fieldHint(f?.show_pct)}
                      />
                      <NumField
                        label="% Close"
                        suffix="%"
                        placeholder="40"
                        value={inputs.paid.closePct}
                        onChange={(v) => patchPaid({ closePct: v })}
                        hint={fieldHint(f?.close_pct)}
                      />
                      <NumField
                        label="Cash per close"
                        prefix="$"
                        placeholder="6000"
                        value={inputs.paid.aov}
                        onChange={(v) => patchPaid({ aov: v })}
                        hint={fieldHint(f?.aov)}
                      />
                    </div>
                    <div className="mt-3 border-t border-gray-200/50 dark:border-white/10 pt-2 space-y-0.5">
                      <OutRow label="Booked Calls / Mo" value={formatNum(paidOut.booked, 0)} />
                      <OutRow label="Actual Calls / Mo" value={formatNum(paidOut.showed, 0)} />
                      <OutRow label="# Sales / Mo" value={formatNum(paidOut.sales)} emphasize />
                      <OutRow label="Cost Per Call" value={formatUsd(paidOut.costPerCall)} />
                      <OutRow label="CPA" value={formatUsd(paidOut.cpa)} />
                      <OutRow label="Monthly Revenue" value={formatUsd(paidOut.revenue)} emphasize />
                    </div>
                  </Section>
                </div>
                <Section title="Costs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <NumField
                      label="Sales Team (% of revenue)"
                      suffix="%"
                      placeholder="10"
                      value={inputs.paid.salesTeamPct}
                      onChange={(v) => patchPaid({ salesTeamPct: v })}
                    />
                    <NumField
                      label="Operator (% of revenue)"
                      suffix="%"
                      placeholder="0"
                      value={inputs.paid.operatorPct}
                      onChange={(v) => patchPaid({ operatorPct: v })}
                    />
                    <NumField
                      label="Tech"
                      prefix="$"
                      placeholder="500"
                      value={inputs.paid.tech}
                      onChange={(v) => patchPaid({ tech: v })}
                    />
                    <NumField
                      label="Extras"
                      prefix="$"
                      placeholder="0"
                      value={inputs.paid.extras}
                      onChange={(v) => patchPaid({ extras: v })}
                    />
                    <NumField
                      label="Payment Processor"
                      suffix="%"
                      placeholder="2.9"
                      value={inputs.paid.processorPct}
                      onChange={(v) => patchPaid({ processorPct: v })}
                    />
                    <NumField
                      label="Days in month"
                      placeholder="30"
                      value={inputs.paid.daysInMonth}
                      onChange={(v) => patchPaid({ daysInMonth: v ?? 30 })}
                    />
                  </div>
                  <div className="mt-3 border-t border-gray-200/50 dark:border-white/10 pt-2 space-y-0.5">
                    <OutRow label="Total Costs" value={formatUsd(paidOut.totalCosts)} />
                    <OutRow label="Monthly Net" value={formatUsd(paidOut.net)} positive />
                  </div>
                </Section>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                <KpiCard label="Cash Goal" value={formatUsd(organicOut.ccGoal)} />
                <KpiCard label="Closes Needed" value={formatNum(organicOut.closesNeeded)} />
                <KpiCard label="Convos / Day" value={formatNum(organicOut.dailyConvos)} />
                <KpiCard label="Bookings / Day" value={formatNum(organicOut.dailyBookings)} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Section title="Goals">
                  <div className="flex gap-1 mb-3">
                    <button
                      type="button"
                      onClick={() => patchOrganic({ goalMode: 'cash' })}
                      className={`px-2 py-1 text-[11px] font-semibold rounded ${
                        inputs.organic.goalMode === 'cash'
                          ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200'
                          : 'text-gray-500'
                      }`}
                    >
                      Cash collected
                    </button>
                    <button
                      type="button"
                      onClick={() => patchOrganic({ goalMode: 'commission' })}
                      className={`px-2 py-1 text-[11px] font-semibold rounded ${
                        inputs.organic.goalMode === 'commission'
                          ? 'bg-sky-500/20 text-sky-800 dark:text-sky-200'
                          : 'text-gray-500'
                      }`}
                    >
                      Commission
                    </button>
                  </div>
                  {inputs.organic.goalMode === 'commission' ? (
                    <div className="space-y-3">
                      <NumField
                        label="Monthly commission goal"
                        prefix="$"
                        placeholder="5000"
                        value={inputs.organic.commissionGoal}
                        onChange={(v) => patchOrganic({ commissionGoal: v })}
                      />
                      <NumField
                        label="Commission %"
                        suffix="%"
                        placeholder="5"
                        value={inputs.organic.commissionPct}
                        onChange={(v) => patchOrganic({ commissionPct: v })}
                      />
                    </div>
                  ) : (
                    <NumField
                      label="Monthly cash-collected goal"
                      prefix="$"
                      placeholder="100000"
                      value={inputs.organic.cashCollectedGoal}
                      onChange={(v) => patchOrganic({ cashCollectedGoal: v })}
                    />
                  )}
                  <div className="mt-3 space-y-3">
                    <NumField
                      label="AOV / cash per close"
                      prefix="$"
                      placeholder="3500"
                      value={inputs.organic.aov}
                      onChange={(v) => patchOrganic({ aov: v })}
                      hint={fieldHint(f?.aov)}
                    />
                    <NumField
                      label="Days in month"
                      placeholder="30"
                      value={inputs.organic.daysInMonth}
                      onChange={(v) => patchOrganic({ daysInMonth: v ?? 30 })}
                    />
                  </div>
                  <div className="mt-3 border-t border-gray-200/50 dark:border-white/10 pt-2 space-y-0.5">
                    <OutRow label="CC Goal" value={formatUsd(organicOut.ccGoal)} emphasize />
                    <OutRow label="Closes Needed" value={formatNum(organicOut.closesNeeded)} emphasize />
                  </div>
                </Section>
                <Section title="Conversion rates">
                  <div className="space-y-3">
                    <NumField
                      label="Convo → Book"
                      suffix="%"
                      placeholder="5"
                      value={inputs.organic.convoToBookPct}
                      onChange={(v) => patchOrganic({ convoToBookPct: v })}
                      hint={fieldHint(f?.convo_to_book_pct)}
                    />
                    <NumField
                      label="Pitch → Book"
                      suffix="%"
                      placeholder="80"
                      value={inputs.organic.pitchToBookPct}
                      onChange={(v) => patchOrganic({ pitchToBookPct: v })}
                      hint={fieldHint(f?.pitch_to_book_pct)}
                    />
                    <NumField
                      label="Qualified bookings"
                      suffix="%"
                      placeholder="100"
                      value={inputs.organic.qualifiedBookingsPct}
                      onChange={(v) => patchOrganic({ qualifiedBookingsPct: v })}
                    />
                    <NumField
                      label="Show-up"
                      suffix="%"
                      placeholder="90"
                      value={inputs.organic.showPct}
                      onChange={(v) => patchOrganic({ showPct: v })}
                      hint={fieldHint(f?.show_pct)}
                    />
                    <NumField
                      label="Close"
                      suffix="%"
                      placeholder="50"
                      value={inputs.organic.closePct}
                      onChange={(v) => patchOrganic({ closePct: v })}
                      hint={fieldHint(f?.close_pct)}
                    />
                  </div>
                </Section>
                <Section title="Required activity">
                  <p className="text-[10px] text-gray-400 mb-2">
                    Back-solved with show × close (not the spreadsheet shortcut that skipped show rate).
                  </p>
                  <div className="space-y-0.5">
                    <OutRow label="Convos / mo" value={formatNum(organicOut.convos, 0)} emphasize />
                    <OutRow label="Calls pitched / mo" value={formatNum(organicOut.callsPitched)} />
                    <OutRow label="Calls booked / mo" value={formatNum(organicOut.callsBooked)} />
                    <OutRow label="Calls taken / mo" value={formatNum(organicOut.callsTaken)} />
                    <OutRow label="Convos / day" value={formatNum(organicOut.dailyConvos)} emphasize />
                    <OutRow label="Pitches / day" value={formatNum(organicOut.dailyPitched)} />
                    <OutRow label="Bookings / day" value={formatNum(organicOut.dailyBookings)} />
                  </div>
                  <div className="mt-4 pt-3 border-t border-gray-200/50 dark:border-white/10">
                    <NumField
                      label="Forward check — daily convos"
                      placeholder="37"
                      value={inputs.organic.dailyConvosOverride}
                      onChange={(v) => patchOrganic({ dailyConvosOverride: v })}
                      hint="Optional: project closes from actual daily volume"
                    />
                    {inputs.organic.dailyConvosOverride != null ? (
                      <div className="mt-2 space-y-0.5">
                        <OutRow label="Projected booked" value={formatNum(organicOut.forwardBooked)} />
                        <OutRow label="Projected sales" value={formatNum(organicOut.forwardSales)} />
                        <OutRow label="Projected revenue" value={formatUsd(organicOut.forwardRevenue)} positive />
                      </div>
                    ) : null}
                  </div>
                </Section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
