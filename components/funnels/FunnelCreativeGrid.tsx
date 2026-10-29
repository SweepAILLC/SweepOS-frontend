'use client';

import { useEffect, useMemo, useState } from 'react';
import { FunnelCreativeAd, FunnelCreativeGrid as FunnelCreativeGridData, apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { trendClass, trendOf } from '@/lib/kpiFormat';

// Replaces the 23-metric sheet for a funnel that has linked campaigns: one
// unified table, rows = creatives (ads), columns = metrics. Ad-native columns
// (Spend/Results/CPR/CTR) are real, synced data. The 20 funnel-economics
// columns (Leads, Close Rate, Cash Collected, CAC, ROAS, etc.) have no
// attribution path down to an individual ad yet — shown as a static "—"
// placeholder group, not computed, until the Content Engine PRD's UTM-to-ad
// attribution exists. See docs/features/META_ADS_PERFORMANCE_PRD.md, "Creative grid".

const PENDING_ATTRIBUTION_COLUMNS = [
  'Visitors',
  'Cost per LPV',
  'Leads',
  'LP Conv Rate',
  'Booked Calls',
  'Lead to Book Rate',
  'Live Calls',
  'Show Rate',
  'Deals Closed',
  'Cash Collected',
  'Cash Per Close',
  'Cost per Lead',
  'Cost per Booking',
  'CAC',
  'Profit',
];

function money(cents?: number | null, currency?: string | null): string {
  if (cents == null || Number.isNaN(cents)) return '—';
  const n = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: n >= 100 ? 0 : 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

function fmtNum(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtPct(n?: number | null): string {
  // ctr/frequency on AdsSeriesPoint are already percent-scale (2.5 = 2.5%), not a fraction.
  return n == null || Number.isNaN(n) ? '—' : `${n.toFixed(2)}%`;
}

/** Same up/down arrow the aggregate scorecard uses (lib/kpiFormat's trendOf/trendClass),
 * reused here: current period vs the immediately-preceding period of equal length
 * (backend's prior_spend_cents/prior_results), driven by whatever range the page's
 * shared date picker currently has selected — not a sparkline. */
function TrendArrow({ value, prior, better }: { value: number | null; prior: number | null | undefined; better: 'up' | 'down' | 'neutral' }) {
  const trend = trendOf(value, prior ?? null);
  if (!trend || trend === 'flat') return null;
  const arrow = trend === 'up' ? '▲' : '▼';
  return (
    <span className={`ml-1 text-[10px] ${trendClass(trend, better)}`} aria-label={trend === 'up' ? 'up on the prior period' : 'down on the prior period'}>
      {arrow}
    </span>
  );
}

export default function FunnelCreativeGrid({
  funnelId,
  campaignId,
  start,
  end,
}: {
  funnelId: string;
  campaignId?: string | null;
  start: string;
  end: string;
}) {
  const [grid, setGrid] = useState<FunnelCreativeGridData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adSetId, setAdSetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getFunnelCreativeGrid(funnelId, { start, end, campaignId })
      .then((data) => {
        if (!cancelled) setGrid(data);
      })
      .catch((e) => {
        if (!cancelled) setError(formatApiError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [funnelId, campaignId, start, end]);

  useEffect(() => {
    setAdSetId(null);
  }, [campaignId]);

  const adSets = useMemo(() => {
    const seen = new Map<string, string>();
    for (const ad of grid?.ads || []) {
      if (ad.ad_set_id && !seen.has(ad.ad_set_id)) seen.set(ad.ad_set_id, ad.ad_set_name || ad.ad_set_id);
    }
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [grid]);

  const visibleAds = useMemo(
    () => (adSetId ? (grid?.ads || []).filter((ad) => ad.ad_set_id === adSetId) : grid?.ads || []),
    [grid, adSetId]
  );

  if (error) {
    return <p className="px-1 py-6 text-center text-sm text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!grid) {
    return <p className="px-1 py-6 text-center text-sm text-gray-500 dark:text-gray-400">Loading…</p>;
  }
  if (!grid.ads.length) {
    return (
      <p className="px-1 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
        No ads synced yet for this funnel&apos;s linked campaign(s).
      </p>
    );
  }

  const currency = grid.currency;
  const stickyCell = 'sticky left-0 z-10 bg-white dark:bg-gray-950';

  return (
    <div className="space-y-2">
      {adSets.length > 1 ? (
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Ad set</label>
          <select
            value={adSetId ?? ''}
            onChange={(e) => setAdSetId(e.target.value || null)}
            className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
          >
            <option value="">All ad sets</option>
            {adSets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-black/5 dark:border-white/10">
      <table className="w-auto text-sm border-separate border-spacing-0">
        <thead>
          <tr>
            <th
              scope="colgroup"
              colSpan={3 + 4}
              className="sticky left-0 z-10 bg-gray-100 dark:bg-gray-900 text-left text-[11px] font-bold uppercase tracking-wide text-gray-700 dark:text-gray-300 py-1.5 pl-1 pr-3"
            >
              Ad performance
            </th>
            <th
              scope="colgroup"
              colSpan={PENDING_ATTRIBUTION_COLUMNS.length}
              className="bg-gray-100 dark:bg-gray-900 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-500 py-1.5 pl-3 pr-3"
              title="Needs per-ad UTM attribution (Content Engine PRD) — not built yet"
            >
              Funnel metrics (pending ad-level attribution)
            </th>
          </tr>
          <tr className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <th scope="col" className={`${stickyCell} text-left font-medium py-1.5 pr-3 pl-1 whitespace-nowrap`}>
              Creative
            </th>
            <th scope="col" className="text-left font-medium py-1.5 px-2 whitespace-nowrap">
              Ad set
            </th>
            <th scope="col" className="text-left font-medium py-1.5 px-2 whitespace-nowrap">
              Campaign
            </th>
            <th scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
              Spend
            </th>
            <th scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
              Results
            </th>
            <th scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
              CPR
            </th>
            <th scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
              CTR
            </th>
            {PENDING_ATTRIBUTION_COLUMNS.map((label) => (
              <th key={label} scope="col" className="text-right font-medium py-1.5 px-2 whitespace-nowrap text-gray-400 dark:text-gray-600">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleAds.map((ad: FunnelCreativeAd) => (
            <tr key={ad.id} className="hover:bg-white/[0.03]">
              <th
                scope="row"
                className={`${stickyCell} text-left font-normal py-1 pr-3 pl-1 border-t border-white/5 whitespace-nowrap text-gray-800 dark:text-gray-200`}
              >
                <span className="inline-flex items-center gap-2">
                  {ad.thumbnail_url ? (
                    <img src={ad.thumbnail_url} alt="" className="w-6 h-6 rounded object-cover" />
                  ) : null}
                  <span className="truncate max-w-[12rem]">{ad.name || ad.meta_ad_id}</span>
                  {ad.fatigued ? <span className="text-[9px] uppercase text-rose-600 shrink-0">fatigued</span> : null}
                </span>
              </th>
              <td className="py-1 px-2 border-t border-white/5 whitespace-nowrap text-gray-600 dark:text-gray-400 truncate max-w-[9rem]">
                {ad.ad_set_name || '—'}
              </td>
              <td className="py-1 px-2 border-t border-white/5 whitespace-nowrap text-gray-600 dark:text-gray-400 truncate max-w-[9rem]">
                {ad.campaign_name || '—'}
              </td>
              <td className="text-right py-1 px-2 tabular-nums border-t border-white/5 whitespace-nowrap text-gray-900 dark:text-gray-100">
                {money(ad.spend_cents, currency)}
                <TrendArrow value={ad.spend_cents} prior={ad.prior_spend_cents} better="neutral" />
              </td>
              <td className="text-right py-1 px-2 tabular-nums border-t border-white/5 whitespace-nowrap text-gray-900 dark:text-gray-100">
                {fmtNum(ad.results)}
                <TrendArrow value={ad.results} prior={ad.prior_results} better="up" />
              </td>
              <td className="text-right py-1 px-2 tabular-nums border-t border-white/5 whitespace-nowrap text-gray-900 dark:text-gray-100">
                {money(ad.cpr_cents, currency)}
              </td>
              <td className="text-right py-1 px-2 tabular-nums border-t border-white/5 whitespace-nowrap text-gray-900 dark:text-gray-100">
                {fmtPct(ad.ctr)}
              </td>
              {PENDING_ATTRIBUTION_COLUMNS.map((label) => (
                <td
                  key={label}
                  className="text-right py-1 px-2 tabular-nums border-t border-white/5 whitespace-nowrap text-gray-400 dark:text-gray-600"
                >
                  —
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="px-1 py-2 text-[10px] text-gray-500 dark:text-gray-400">
        Rows are individual ad creatives across this funnel&apos;s linked campaign(s), for the page&apos;s selected date range.
        Spend/Results carry an arrow against the immediately-preceding period of equal length; the grayed columns
        need per-ad lead/revenue attribution, not built yet.
      </p>
    </div>
  );
}
