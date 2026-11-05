'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AdsAdRow, AdsAdSetRow, AdsCampaignRow, AdsSeriesPoint, apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';

// Meta Ads Manager-style explorer: one table that switches between
// Campaigns / Ad sets / Ads via tabs, with row checkboxes. Selection
// cascades downward (checked campaigns scope the Ad sets tab's rows,
// checked ad sets scope the Ads tab's rows) and the charts below always
// reflect whatever's checked on the *currently open* tab — summed per day
// across the checked rows, or across every row on that tab when nothing
// is checked, so the panel is never blank.

type Tab = 'campaigns' | 'adsets' | 'ads';

const PILL: Record<string, { label: string; cls: string }> = {
  scale: { label: 'Scale', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  hold: { label: 'Hold', cls: 'bg-gray-500/15 text-gray-700 dark:text-gray-300' },
  pull_back: { label: 'Pull back', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-200' },
  fatigued: { label: 'Fatigued', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  learning: { label: 'Learning', cls: 'bg-sky-500/15 text-sky-800 dark:text-sky-200' },
  foundational: { label: 'Foundational', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
};

const TIP = {
  backgroundColor: 'rgba(17,24,39,0.96)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  fontSize: 12,
  color: '#f9fafb',
};

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
  return n == null || Number.isNaN(n) ? '—' : `${n.toFixed(2)}%`;
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso.slice(5);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Spark({ series }: { series: AdsSeriesPoint[] }) {
  const data = series.filter((p) => p.cpr_cents != null).map((p) => ({ v: (p.cpr_cents || 0) / 100 }));
  if (data.length < 2) return <span className="text-[11px] text-gray-400">—</span>;
  return (
    <div className="w-20 h-7">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="v" stroke="#a78bfa" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Pill({ kind }: { kind: string }) {
  const pill = PILL[kind] || PILL.hold;
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${pill.cls}`}>{pill.label}</span>;
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-violet-600 focus:ring-violet-500"
    />
  );
}

function mergeSeries(rows: { series: AdsSeriesPoint[] }[]): AdsSeriesPoint[] {
  const byDate = new Map<string, { spend: number; results: number; ctrs: number[]; freqs: number[] }>();
  for (const row of rows) {
    for (const p of row.series || []) {
      const acc = byDate.get(p.date) || { spend: 0, results: 0, ctrs: [], freqs: [] };
      acc.spend += p.spend_cents || 0;
      acc.results += p.results || 0;
      if (p.ctr != null) acc.ctrs.push(p.ctr);
      if (p.frequency != null) acc.freqs.push(p.frequency);
      byDate.set(p.date, acc);
    }
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, acc]) => ({
      date,
      spend_cents: acc.spend,
      results: acc.results,
      cpr_cents: acc.results ? Math.round(acc.spend / acc.results) : null,
      ctr: acc.ctrs.length ? acc.ctrs.reduce((a, b) => a + b, 0) / acc.ctrs.length : null,
      cpm_cents: null,
      frequency: acc.freqs.length ? acc.freqs.reduce((a, b) => a + b, 0) / acc.freqs.length : null,
    }));
}

function idKey(ids: Set<string>): string {
  return Array.from(ids).sort().join(',');
}

export default function AdsEntityExplorer({
  campaigns,
  currency,
  funnels,
  start,
  end,
  onSweep,
  onFunnelLink,
}: {
  campaigns: AdsCampaignRow[];
  currency?: string | null;
  funnels: { id: string; name: string }[];
  start?: string;
  end: string;
  onSweep: (campaignId: string, value: string | null) => void;
  onFunnelLink: (metaCampaignId: string, funnelId: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>('campaigns');
  const [search, setSearch] = useState('');

  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [selectedAdsetIds, setSelectedAdsetIds] = useState<Set<string>>(new Set());
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set());

  const [adsets, setAdsets] = useState<AdsAdSetRow[] | null>(null);
  const [adsetsLoading, setAdsetsLoading] = useState(false);
  const [adsetsError, setAdsetsError] = useState<string | null>(null);

  const [ads, setAds] = useState<AdsAdRow[] | null>(null);
  const [adsLoading, setAdsLoading] = useState(false);
  const [adsError, setAdsError] = useState<string | null>(null);

  const campaignKey = idKey(selectedCampaignIds);
  const adsetKey = idKey(selectedAdsetIds);

  // Checking/unchecking campaigns invalidates whatever was checked downstream —
  // the ad sets (and ads) that were checked may not even be in scope anymore.
  useEffect(() => {
    setSelectedAdsetIds(new Set());
    setSelectedAdIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignKey]);

  useEffect(() => {
    setSelectedAdIds(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adsetKey]);

  useEffect(() => {
    if (tab !== 'adsets') return;
    let cancelled = false;
    setAdsetsLoading(true);
    setAdsetsError(null);
    apiClient
      .getAdsAdSets({ start, end, campaignIds: selectedCampaignIds.size ? Array.from(selectedCampaignIds) : undefined })
      .then((data) => {
        if (!cancelled) setAdsets(data.ad_sets);
      })
      .catch((e) => {
        if (!cancelled) setAdsetsError(formatApiError(e));
      })
      .finally(() => {
        if (!cancelled) setAdsetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, start, end, campaignKey]);

  useEffect(() => {
    if (tab !== 'ads') return;
    let cancelled = false;
    setAdsLoading(true);
    setAdsError(null);
    apiClient
      .getAdsAds({
        start,
        end,
        adSetIds: selectedAdsetIds.size ? Array.from(selectedAdsetIds) : undefined,
        campaignIds: !selectedAdsetIds.size && selectedCampaignIds.size ? Array.from(selectedCampaignIds) : undefined,
      })
      .then((data) => {
        if (!cancelled) setAds(data.ads);
      })
      .catch((e) => {
        if (!cancelled) setAdsError(formatApiError(e));
      })
      .finally(() => {
        if (!cancelled) setAdsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, start, end, campaignKey, adsetKey, selectedAdsetIds.size, selectedCampaignIds.size]);

  const toggle = (set: Set<string>, setSet: (s: Set<string>) => void, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSet(next);
  };

  const q = search.trim().toLowerCase();
  const visibleCampaigns = useMemo(
    () => (q ? campaigns.filter((c) => (c.name || c.meta_campaign_id).toLowerCase().includes(q)) : campaigns),
    [campaigns, q]
  );
  const visibleAdsets = useMemo(
    () => (q ? (adsets || []).filter((a) => (a.name || a.meta_adset_id).toLowerCase().includes(q)) : adsets || []),
    [adsets, q]
  );
  const visibleAds = useMemo(
    () => (q ? (ads || []).filter((a) => (a.name || a.meta_ad_id).toLowerCase().includes(q)) : ads || []),
    [ads, q]
  );

  const chartRows = useMemo(() => {
    if (tab === 'campaigns') {
      return selectedCampaignIds.size ? visibleCampaigns.filter((c) => selectedCampaignIds.has(c.id)) : visibleCampaigns;
    }
    if (tab === 'adsets') {
      return selectedAdsetIds.size ? visibleAdsets.filter((a) => selectedAdsetIds.has(a.id)) : visibleAdsets;
    }
    return selectedAdIds.size ? visibleAds.filter((a) => selectedAdIds.has(a.id)) : visibleAds;
  }, [tab, visibleCampaigns, visibleAdsets, visibleAds, selectedCampaignIds, selectedAdsetIds, selectedAdIds]);

  const ceilingCents = useMemo(() => {
    if (tab !== 'campaigns' || selectedCampaignIds.size !== 1) return null;
    const only = campaigns.find((c) => selectedCampaignIds.has(c.id));
    return only?.ceiling_daily_spend_cents ?? null;
  }, [tab, selectedCampaignIds, campaigns]);

  const chartSeries = useMemo(() => {
    const series = mergeSeries(chartRows);
    const flags = new Set<string>();
    for (let i = 5; i < series.length; i += 1) {
      const recent = series.slice(i - 2, i + 1);
      const prior = series.slice(i - 5, i - 2);
      const rCpr = recent.map((p) => p.cpr_cents).filter((n): n is number => n != null);
      const pCpr = prior.map((p) => p.cpr_cents).filter((n): n is number => n != null);
      if (!rCpr.length || !pCpr.length) continue;
      const rAvg = rCpr.reduce((a, b) => a + b, 0) / rCpr.length;
      const pAvg = pCpr.reduce((a, b) => a + b, 0) / pCpr.length;
      const rRes = recent.reduce((a, p) => a + p.results, 0);
      const pRes = prior.reduce((a, p) => a + p.results, 0);
      if (rAvg > pAvg && rRes < pRes) flags.add(series[i].date);
    }
    return series.map((p) => ({
      date: shortDate(p.date),
      cpr: p.cpr_cents != null ? p.cpr_cents / 100 : null,
      results: p.results,
      spend: p.spend_cents / 100,
      frequency: p.frequency,
      ctr: p.ctr,
      cross: flags.has(p.date) && p.cpr_cents != null ? p.cpr_cents / 100 : null,
    }));
  }, [chartRows]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'campaigns', label: 'Campaigns', count: selectedCampaignIds.size },
    { id: 'adsets', label: 'Ad sets', count: selectedAdsetIds.size },
    { id: 'ads', label: 'Ads', count: selectedAdIds.size },
  ];

  return (
    <section className="space-y-4">
      <div className="glass-card rounded-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden">
        <div className="px-3 py-2 border-b border-gray-200/50 dark:border-gray-700/50">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search to filter by name"
            className="w-full text-sm bg-transparent outline-none placeholder:text-gray-400"
          />
        </div>
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-200/50 dark:border-gray-700/50">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                tab === t.id
                  ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                  : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'
              }`}
            >
              {t.label}
              {t.count > 0 ? (
                <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-600 text-white">
                  {t.count} selected
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === 'campaigns' ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Tag</th>
                  <th className="px-3 py-2 font-medium">Spend</th>
                  <th className="px-3 py-2 font-medium">Results</th>
                  <th className="px-3 py-2 font-medium">CPR</th>
                  <th className="px-3 py-2 font-medium">Trend</th>
                  <th className="px-3 py-2 font-medium">Funnel</th>
                </tr>
              </thead>
              <tbody>
                {!visibleCampaigns.length ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-sm text-gray-500">
                      No campaigns synced yet.
                    </td>
                  </tr>
                ) : (
                  visibleCampaigns.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-gray-200/40 dark:border-gray-700/40 ${
                        selectedCampaignIds.has(row.id) ? 'bg-violet-500/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selectedCampaignIds.has(row.id)}
                          onChange={() => toggle(selectedCampaignIds, setSelectedCampaignIds, row.id)}
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{row.name || row.meta_campaign_id}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{row.status || '—'}</td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Pill kind={row.pill} />
                          <select
                            value={row.sweep_status || ''}
                            onChange={(e) => onSweep(row.id, e.target.value || null)}
                            className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-1.5 py-1"
                          >
                            <option value="">—</option>
                            <option value="testing">Testing</option>
                            <option value="foundational">Foundational</option>
                            <option value="paused">Paused</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2">{money(row.spend_cents, currency)}</td>
                      <td className="px-3 py-2">{fmtNum(row.results)}</td>
                      <td className="px-3 py-2">{money(row.cpr_cents, currency)}</td>
                      <td className="px-3 py-2">
                        <Spark series={row.series} />
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={row.funnel_id || ''}
                          onChange={(e) => onFunnelLink(row.meta_campaign_id, e.target.value || null)}
                          className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-1.5 py-1 max-w-[150px]"
                        >
                          <option value="">Unlinked</option>
                          {funnels.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'adsets' ? (
          <div className="overflow-x-auto">
            {adsetsError ? <p className="px-3 py-4 text-sm text-red-600 dark:text-red-400">{adsetsError}</p> : null}
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2 font-medium">Ad set</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Tag</th>
                  <th className="px-3 py-2 font-medium">Spend</th>
                  <th className="px-3 py-2 font-medium">Results</th>
                  <th className="px-3 py-2 font-medium">CPR</th>
                  <th className="px-3 py-2 font-medium">CTR</th>
                  <th className="px-3 py-2 font-medium">Frequency</th>
                  <th className="px-3 py-2 font-medium">Bench</th>
                </tr>
              </thead>
              <tbody>
                {adsetsLoading && !adsets ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : !visibleAdsets.length ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-sm text-gray-500">
                      {selectedCampaignIds.size ? 'No ad sets for the checked campaigns.' : 'No ad sets synced yet.'}
                    </td>
                  </tr>
                ) : (
                  visibleAdsets.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-gray-200/40 dark:border-gray-700/40 ${
                        selectedAdsetIds.has(row.id) ? 'bg-violet-500/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={selectedAdsetIds.has(row.id)}
                          onChange={() => toggle(selectedAdsetIds, setSelectedAdsetIds, row.id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-gray-900 dark:text-gray-100">{row.name || row.meta_adset_id}</p>
                        <p className="text-[11px] text-gray-500 truncate max-w-[14rem]">{row.campaign_name || '—'}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {row.effective_status || '—'}
                        {row.learning_stage ? <span className="block text-[10px]">{row.learning_stage}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <Pill kind={row.pill} />
                      </td>
                      <td className="px-3 py-2">{money(row.spend_cents, currency)}</td>
                      <td className="px-3 py-2">{fmtNum(row.results)}</td>
                      <td className="px-3 py-2">{money(row.cpr_cents, currency)}</td>
                      <td className="px-3 py-2">{fmtPct(row.ctr)}</td>
                      <td className="px-3 py-2">{row.frequency != null ? row.frequency.toFixed(2) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {row.active_ads} / {row.bench_target}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === 'ads' ? (
          <div className="overflow-x-auto">
            {adsError ? <p className="px-3 py-4 text-sm text-red-600 dark:text-red-400">{adsError}</p> : null}
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2 font-medium">Creative</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Spend</th>
                  <th className="px-3 py-2 font-medium">Results</th>
                  <th className="px-3 py-2 font-medium">CPR</th>
                  <th className="px-3 py-2 font-medium">CTR</th>
                  <th className="px-3 py-2 font-medium">Frequency</th>
                </tr>
              </thead>
              <tbody>
                {adsLoading && !ads ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">
                      Loading…
                    </td>
                  </tr>
                ) : !visibleAds.length ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">
                      {selectedAdsetIds.size || selectedCampaignIds.size
                        ? 'No ads for the checked rows.'
                        : 'No ads synced yet.'}
                    </td>
                  </tr>
                ) : (
                  visibleAds.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-gray-200/40 dark:border-gray-700/40 ${
                        selectedAdIds.has(row.id) ? 'bg-violet-500/10' : ''
                      }`}
                    >
                      <td className="px-3 py-2">
                        <Checkbox checked={selectedAdIds.has(row.id)} onChange={() => toggle(selectedAdIds, setSelectedAdIds, row.id)} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-md bg-gray-200 dark:bg-gray-800 overflow-hidden shrink-0">
                            {row.thumbnail_url ? (
                              <img src={row.thumbnail_url} alt="" className="w-full h-full object-cover" />
                            ) : null}
                          </div>
                          <div className="min-w-0">
                            <p className="text-gray-900 dark:text-gray-100 truncate max-w-[14rem]">{row.name || row.meta_ad_id}</p>
                            <p className="text-[11px] text-gray-500 truncate max-w-[14rem]">
                              {row.ad_set_name || '—'} · {row.campaign_name || '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">{row.effective_status || '—'}</span>
                          <Pill kind={row.pill} />
                        </div>
                      </td>
                      <td className="px-3 py-2">{money(row.spend_cents, currency)}</td>
                      <td className="px-3 py-2">{fmtNum(row.results)}</td>
                      <td className="px-3 py-2">{money(row.cpr_cents, currency)}</td>
                      <td className="px-3 py-2">{fmtPct(row.ctr)}</td>
                      <td className="px-3 py-2">{row.frequency != null ? row.frequency.toFixed(2) : '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Cost per result vs results</p>
        <p className="text-xs text-gray-500 mb-3">
          {chartRows.length
            ? `Summed across ${chartRows.length} checked ${tab === 'campaigns' ? 'campaign(s)' : tab === 'adsets' ? 'ad set(s)' : 'ad(s)'}. Shaded points are a 3-day window where cost rose and volume fell.`
            : 'Nothing to show yet.'}
        </p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="cpr" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="results" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TIP} />
              <Bar yAxisId="cpr" dataKey="cross" fill="#f43f5e" fillOpacity={0.25} />
              <Line yAxisId="cpr" type="monotone" dataKey="cpr" name="CPR" stroke="#f59e0b" dot={false} />
              <Line yAxisId="results" type="monotone" dataKey="results" name="Results" stroke="#38bdf8" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">Cost per result vs daily spend</p>
        <p className="text-xs text-gray-500 mb-3">Each point is one day. Across is daily spend. Up is cost per result.</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
              <XAxis
                dataKey="spend"
                name="Daily spend"
                className="text-gray-600 dark:text-gray-200"
                tick={{ fontSize: 11, fill: 'currentColor' }}
                tickFormatter={(value: number) => money(Math.round(value * 100), currency)}
              />
              <YAxis
                dataKey="cpr"
                name="Cost per result"
                width={72}
                className="text-gray-600 dark:text-gray-200"
                tick={{ fontSize: 11, fill: 'currentColor' }}
                tickFormatter={(value: number) => money(Math.round(value * 100), currency)}
              />
              <Tooltip cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }} contentStyle={TIP} />
              {ceilingCents != null ? (
                <ReferenceLine x={ceilingCents / 100} stroke="#f43f5e" label={{ value: 'Efficient spend', fill: '#f43f5e', fontSize: 11 }} />
              ) : null}
              <Scatter data={chartSeries.filter((p) => p.cpr != null)} fill="#a78bfa" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Frequency and CTR</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.25)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="freq" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="ctr" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={TIP} />
              <ReferenceLine yAxisId="freq" y={2.5} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine yAxisId="freq" y={3.5} stroke="#f43f5e" strokeDasharray="4 4" />
              <Line yAxisId="freq" type="monotone" dataKey="frequency" name="Frequency" stroke="#f59e0b" dot={false} />
              <Line yAxisId="ctr" type="monotone" dataKey="ctr" name="CTR %" stroke="#34d399" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
