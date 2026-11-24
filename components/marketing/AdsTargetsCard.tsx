'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { AdsDashboard, AdsTargetSource, apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';

/**
 * Ads tab → Targets. "Follow Scale Planner" (on by default) derives target cost per
 * result and minimum ROAS from the business numbers: a booked call's worth ÷ break-even
 * ROAS, and break-even ROAS itself. Off: the typed values, with the planner's figures
 * shown beside them and an Apply button.
 */

function usd(dollars?: number | null, currency?: string | null): string {
  if (dollars == null || Number.isNaN(dollars)) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: dollars >= 100 ? 0 : 2,
    }).format(dollars);
  } catch {
    return `$${dollars.toFixed(2)}`;
  }
}

const SOURCE_LABEL: Record<AdsTargetSource, string> = {
  planner: 'From Scale Planner',
  manual: 'Manual',
  business_numbers: 'Your typed cost per call',
};

export default function AdsTargetsCard({
  settings,
  currency,
  connected,
  onSaved,
}: {
  settings: AdsDashboard['settings'];
  currency?: string | null;
  connected: boolean;
  onSaved: () => unknown;
}) {
  const router = useRouter();
  const follow = settings.follow_planner ?? true;
  const eff = settings.effective;
  const sug = settings.suggested ?? null;
  const [targetDollars, setTargetDollars] = useState('');
  const [minRoas, setMinRoas] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTargetDollars(settings.target_cpr_cents != null ? (settings.target_cpr_cents / 100).toFixed(2) : '');
    setMinRoas(settings.min_roas != null ? String(settings.min_roas) : '');
  }, [settings.target_cpr_cents, settings.min_roas]);

  const save = async (nextFollow: boolean, cpr = targetDollars, roas = minRoas) => {
    setBusy(true);
    setError(null);
    try {
      const cents = cpr.trim() === '' ? null : Math.round(Number(cpr) * 100);
      const r = roas.trim() === '' ? null : Number(roas);
      if (cents != null && Number.isNaN(cents)) throw new Error('Target cost per result must be a number');
      if (r != null && Number.isNaN(r)) throw new Error('Minimum ROAS must be a number');
      await apiClient.putAdsSettings({ target_cpr_cents: cents, min_roas: r, follow_planner: nextFollow });
      await onSaved();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const applySuggested = () => {
    const cpr = sug?.target_cost_per_booking != null ? sug.target_cost_per_booking.toFixed(2) : targetDollars;
    const roas = sug?.min_roas != null ? String(sug.min_roas) : minRoas;
    setTargetDollars(cpr);
    setMinRoas(roas);
    void save(false, cpr, roas);
  };

  const plannerReady = sug != null && (sug.target_cost_per_booking != null || sug.min_roas != null);
  const openPlanner = () => void router.push({ pathname: '/', query: { tab: 'funnels', funnelView: 'planner' } });

  return (
    <section className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Targets</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            The kill rule, scale-ready and ROAS floor alerts use these.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-200 cursor-pointer select-none">
          <span>Follow Scale Planner</span>
          <button
            type="button"
            role="switch"
            aria-checked={follow}
            disabled={busy || !connected}
            onClick={() => void save(!follow)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${
              follow ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                follow ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </label>
      </div>

      {follow ? (
        <div className="space-y-2">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200/60 dark:border-white/10 p-3">
              <dt className="text-xs text-gray-500 dark:text-gray-400">Target cost per booked call</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                {eff?.target_cpr_cents != null ? usd(eff.target_cpr_cents / 100, currency) : '—'}
              </dd>
              <dd className="text-[11px] text-gray-500 dark:text-gray-400">
                {eff?.target_cpr_source ? SOURCE_LABEL[eff.target_cpr_source] : 'Not set'}
                {eff?.target_cpr_source === 'planner' && sug?.cash_per_booking != null && sug.min_roas != null
                  ? ` · ${usd(sug.cash_per_booking, currency)} per booked call ÷ ${sug.min_roas.toFixed(2)} break-even`
                  : ''}
              </dd>
              {sug?.target_cost_per_lead != null ? (
                <dd className="text-[11px] text-gray-500 dark:text-gray-400">
                  Ads optimising for leads: about {usd(sug.target_cost_per_lead, currency)} per lead
                </dd>
              ) : null}
            </div>
            <div className="rounded-lg border border-gray-200/60 dark:border-white/10 p-3">
              <dt className="text-xs text-gray-500 dark:text-gray-400">Minimum ROAS</dt>
              <dd className="mt-0.5 text-lg font-bold tabular-nums text-gray-900 dark:text-white">
                {eff?.min_roas != null ? eff.min_roas.toFixed(2) : '—'}
              </dd>
              <dd className="text-[11px] text-gray-500 dark:text-gray-400">
                {eff?.min_roas_source ? SOURCE_LABEL[eff.min_roas_source] : 'Not set'}
                {eff?.min_roas_source === 'planner' ? ' · business break-even at current spend' : ''}
              </dd>
              {eff?.marginal_breakeven_roas != null ? (
                <dd className="text-[11px] text-gray-500 dark:text-gray-400">
                  Below {eff.marginal_breakeven_roas.toFixed(2)} every ad dollar loses money
                </dd>
              ) : null}
            </div>
          </dl>
          {!plannerReady ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              The planner can&apos;t work these out yet: it needs your business numbers and a few weeks of booked
              calls.{' '}
              <button type="button" onClick={openPlanner} className="underline font-medium">
                Open Scale Planner
              </button>
            </p>
          ) : (
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Updates each sync from the last 4 weeks of paid cash, bookings and your costs.{' '}
              <button type="button" onClick={openPlanner} className="underline">
                Change business numbers
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
              <span className="block">Target cost per result</span>
              <input
                value={targetDollars}
                onChange={(e) => setTargetDollars(e.target.value)}
                inputMode="decimal"
                placeholder="25.00"
                className="w-32 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2.5 py-1.5"
              />
            </label>
            <label className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
              <span className="block">Minimum ROAS</span>
              <input
                value={minRoas}
                onChange={(e) => setMinRoas(e.target.value)}
                inputMode="decimal"
                placeholder="2.5"
                className="w-28 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2.5 py-1.5"
              />
            </label>
            <button
              type="button"
              onClick={() => void save(false)}
              disabled={busy || !connected}
              className="glass-button px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save targets'}
            </button>
          </div>
          {plannerReady ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
              <span>
                Scale Planner suggests{' '}
                <span className="font-semibold tabular-nums">
                  {sug?.target_cost_per_booking != null ? usd(sug.target_cost_per_booking, currency) : '—'}
                </span>{' '}
                per booked call
                {sug?.target_cost_per_lead != null ? ` (${usd(sug.target_cost_per_lead, currency)} per lead)` : ''} ·
                ROAS <span className="font-semibold tabular-nums">{sug?.min_roas != null ? sug.min_roas.toFixed(2) : '—'}</span>
              </span>
              <button
                type="button"
                onClick={applySuggested}
                disabled={busy || !connected}
                className="rounded-md border border-indigo-400/50 px-2 py-0.5 font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/10 disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          ) : null}
        </div>
      )}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </section>
  );
}
