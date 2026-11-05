'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AdsAlert, AdsDashboard, apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { isOrgAdminRole } from '@/lib/tabAccess';
import PageDateRange from '@/components/ui/PageDateRange';
import { useDateRange } from '@/contexts/DateRangeContext';
import { playbookSection } from '@/components/marketing/AdsPlaybooks';
import AdsEntityExplorer from '@/components/marketing/AdsEntityExplorer';

const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

const PILL: Record<string, { label: string; cls: string }> = {
  scale: { label: 'Scale', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  hold: { label: 'Hold', cls: 'bg-gray-500/15 text-gray-700 dark:text-gray-300' },
  pull_back: { label: 'Pull back', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-200' },
  fatigued: { label: 'Fatigued', cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300' },
  learning: { label: 'Learning', cls: 'bg-sky-500/15 text-sky-800 dark:text-sky-200' },
  foundational: { label: 'Foundational', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
};

const ALERT_LABEL: Record<string, string> = {
  creative_fatigue: 'Creative fatigue',
  fatigue_crossover: 'Fatigue crossover',
  messaging_ceiling: 'Messaging ceiling',
  pullback_watch: 'Pullback watch',
  ceiling_confirmed: 'Ceiling confirmed',
  fatigue_confirmed: 'Fatigue confirmed',
  scale_ready: 'Ready to scale',
  learning_limited: 'Learning limited',
  spend_concentration: 'Spend concentration',
  creative_bench_low: 'Creative bench low',
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
  if (n == null || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;
}

function Delta({ value, invert }: { value?: number | null; invert?: boolean }) {
  if (value == null) return null;
  const good = invert ? value <= 0 : value >= 0;
  return (
    <span className={`text-[11px] font-semibold ${good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      {fmtPct(value)}
    </span>
  );
}

const SEV_RANK: Record<string, number> = { critical: 0, warn: 1, info: 2 };
const TYPE_RANK: Record<string, number> = {
  fatigue_confirmed: 0,
  creative_fatigue: 1,
  fatigue_crossover: 2,
  messaging_ceiling: 3,
  pullback_watch: 4,
  ceiling_confirmed: 5,
  learning_limited: 6,
  scale_ready: 7,
  spend_concentration: 8,
  creative_bench_low: 9,
};

function rankOpenAlerts(alerts: AdsAlert[]): AdsAlert[] {
  return alerts
    .filter((alert) => alert.status === 'open')
    .slice()
    .sort((a, b) => {
      const severity = (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9);
      if (severity) return severity;
      const type = (TYPE_RANK[a.alert_type] ?? 20) - (TYPE_RANK[b.alert_type] ?? 20);
      if (type) return type;
      return (b.first_detected_at || '').localeCompare(a.first_detected_at || '');
    });
}

function placeSlots(prev: [string | null, string | null], queue: string[]): [string | null, string | null] {
  const alive = new Set(queue);
  const next: [string | null, string | null] = [
    prev[0] && alive.has(prev[0]) ? prev[0] : null,
    prev[1] && alive.has(prev[1]) ? prev[1] : null,
  ];
  const used = new Set(next.filter((id): id is string => Boolean(id)));
  for (const id of queue) {
    if (used.has(id)) continue;
    if (next[0] == null) {
      next[0] = id;
    } else if (next[1] == null) {
      next[1] = id;
    } else {
      break;
    }
    used.add(id);
  }
  return next;
}

function AlertNotice({
  alert,
  fading,
  grow,
  busy,
  isAdmin,
  onAck,
  onPause,
}: {
  alert: AdsAlert;
  fading: boolean;
  grow: boolean;
  busy: boolean;
  isAdmin: boolean;
  onAck: () => void;
  onPause: () => void;
}) {
  const [expanded, setExpanded] = useState(!grow);
  useLayoutEffect(() => {
    if (!grow) {
      setExpanded(true);
      return;
    }
    setExpanded(false);
    const frame = requestAnimationFrame(() => setExpanded(true));
    return () => cancelAnimationFrame(frame);
  }, [grow]);
  const [playbookOpen, setPlaybookOpen] = useState(false);
  const evidence = evidenceLine(alert.metrics || {});
  const playbook = playbookSection(alert.playbook);
  const hidden = fading || (grow && !expanded);
  return (
    <article
      style={{ opacity: hidden ? 0 : 1 }}
      className="w-full overflow-hidden rounded-lg border border-red-400/30 bg-red-500/10 text-gray-900 shadow-sm transition-opacity duration-300 ease-out dark:text-gray-100"
    >
      <div className="space-y-1.5 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">
            {alert.severity}
          </span>
          <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
            {ALERT_LABEL[alert.alert_type] || alert.alert_type}
          </span>
          {alert.entity_name ? (
            <span className="truncate text-[11px] text-gray-400">· {alert.entity_name}</span>
          ) : null}
        </div>
        <p className="text-xs leading-snug text-gray-800 dark:text-gray-100">{alert.recommended_action}</p>
        {evidence ? <p className="text-[10px] text-gray-500 dark:text-gray-400">{evidence}</p> : null}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            type="button"
            onClick={onAck}
            disabled={busy || fading}
            className="rounded-md border border-red-400/40 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-800 shadow-sm hover:bg-white disabled:opacity-50 dark:border-red-400/30 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/15"
          >
            Acknowledge
          </button>
          {isAdmin ? (
            <button
              type="button"
              onClick={onPause}
              disabled={busy || fading}
              className="rounded-md border border-red-400/40 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-gray-800 shadow-sm hover:bg-white disabled:opacity-50 dark:border-red-400/30 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/15"
            >
              Pause in Meta
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={playbookOpen}
            onClick={() => setPlaybookOpen((open) => !open)}
            className={`rounded-md border px-2.5 py-1 text-[11px] font-medium shadow-sm disabled:opacity-50 ${
              playbookOpen
                ? 'border-red-500/50 bg-red-500/20 text-red-800 dark:text-red-100'
                : 'border-red-400/40 bg-white/80 text-gray-800 hover:bg-white dark:border-red-400/30 dark:bg-white/10 dark:text-gray-100 dark:hover:bg-white/15'
            }`}
          >
            {playbookOpen ? 'Hide playbook' : 'Playbook'}
          </button>
        </div>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: playbookOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="border-t border-red-400/30 px-3 py-2">
            <p className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">{playbook.title}</p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-4 text-xs leading-snug text-gray-800 dark:text-gray-100">
              {playbook.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </article>
  );
}

function evidenceLine(metrics: Record<string, unknown>): string {
  if (typeof metrics.evidence === 'string' && metrics.evidence.trim()) return metrics.evidence;
  const bits: string[] = [];
  const freq = metrics.frequency;
  if (typeof freq === 'number') bits.push(`frequency ${freq}`);
  const ctr = metrics.ctr_drop_pct;
  if (typeof ctr === 'number') bits.push(`CTR down ${ctr}%`);
  const cpm = metrics.cpm_rise_pct;
  if (typeof cpm === 'number') bits.push(`CPM up ${cpm}%`);
  const ratio = metrics.cpr_ratio;
  if (typeof ratio === 'number') bits.push(`CPR ${ratio.toFixed(2)}× baseline`);
  const results7 = metrics.results_7;
  if (typeof results7 === 'number') bits.push(`${results7} results / 7d`);
  const step = metrics.step_pct;
  if (typeof step === 'number') bits.push(`suggested +${step}%`);
  const eff = metrics.efficient_daily_spend_cents;
  if (typeof eff === 'number') bits.push(`efficient day ${money(eff)}`);
  return bits.join(' · ');
}

export default function AdsTab() {
  const { range, params, compare } = useDateRange();
  const [dash, setDash] = useState<AdsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'connect' | 'sync' | 'settings' | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [, setTick] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [targetDollars, setTargetDollars] = useState('');
  const [minRoas, setMinRoas] = useState('');
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [fadingId, setFadingId] = useState<string | null>(null);
  const [growId, setGrowId] = useState<string | null>(null);
  const [slots, setSlots] = useState<[string | null, string | null]>([null, null]);
  const [pairLayout, setPairLayout] = useState(false);
  const [funnels, setFunnels] = useState<{ id: string; name: string }[]>([]);
  const [adAccounts, setAdAccounts] = useState<{ id: string; name: string | null; current: boolean }[]>([]);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const fadeTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiClient.getAdsDashboard({
        start: params.start,
        end: params.end,
        compare_start: compare.compare_start,
        compare_end: compare.compare_end,
      });
      setDash(data);
      if (data.last_sync_at) {
        const last = new Date(data.last_sync_at).getTime();
        if (!Number.isNaN(last)) {
          setCooldownUntil((prev) => {
            const fromLast = last + SYNC_COOLDOWN_MS;
            if (prev != null && prev > fromLast) return prev;
            return fromLast;
          });
        }
      }
      return data;
    } catch (e) {
      setError(formatApiError(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, [params.start, params.end, compare.compare_start, compare.compare_end]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    apiClient
      .getCurrentUser()
      .then((user) => {
        const role = (user as { role?: string })?.role || '';
        setIsAdmin(isOrgAdminRole(role));
      })
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    apiClient
      .getMetaAdsFunnelMappings()
      .then((data) => setFunnels(data.funnels.map((f) => ({ id: f.funnel_id, name: f.funnel_name }))))
      .catch(() => setFunnels([]));
  }, []);

  useEffect(() => {
    if (!dash?.connected) {
      setAdAccounts([]);
      return;
    }
    apiClient
      .getMetaAdsAdAccounts()
      .then((data) => setAdAccounts(data.accounts))
      .catch(() => setAdAccounts([]));
  }, [dash?.connected]);

  const handleAdAccountSwitch = useCallback(
    async (adAccountId: string) => {
      setSwitchingAccount(true);
      try {
        await apiClient.setMetaAdsAdAccount(adAccountId);
        setAdAccounts((prev) => prev.map((a) => ({ ...a, current: a.id === adAccountId })));
        setSyncMessage('Switching ad account — syncing now, numbers will update shortly.');
        await load();
      } catch (e) {
        setError(formatApiError(e));
      } finally {
        setSwitchingAccount(false);
      }
    },
    [load]
  );

  const handleFunnelLink = useCallback(
    async (metaCampaignId: string, funnelId: string | null) => {
      try {
        await apiClient.setCampaignFunnelLink(metaCampaignId, { funnel_id: funnelId });
        await load();
      } catch (e) {
        setError(formatApiError(e));
      }
    },
    [load]
  );

  useEffect(() => {
    if (!dash) return;
    setTargetDollars(
      dash.settings.target_cpr_cents != null ? (dash.settings.target_cpr_cents / 100).toFixed(2) : ''
    );
    setMinRoas(dash.settings.min_roas != null ? String(dash.settings.min_roas) : '');
  }, [dash]);

  useEffect(() => {
    if (cooldownUntil == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownRemainingSec = useMemo(() => {
    if (cooldownUntil == null) return 0;
    return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  }, [cooldownUntil]);

  const currency = dash?.currency;

  const handleConnect = async () => {
    setBusy('connect');
    setError(null);
    try {
      const { redirect_url } = await apiClient.connectMetaAds();
      window.location.href = redirect_url;
    } catch (e) {
      setError(formatApiError(e));
      setBusy(null);
    }
  };

  const handleSync = async () => {
    if (cooldownRemainingSec > 0 || busy === 'sync') return;
    setBusy('sync');
    setError(null);
    setSyncMessage(null);
    try {
      const res = await apiClient.syncMetaAds(true);
      setCooldownUntil(Date.now() + Number(res.cooldown_seconds || 900) * 1000);
      setSyncMessage(res.message || 'Sync queued — refreshing shortly.');
      for (const wait of [4000, 8000, 12000]) {
        await new Promise((r) => setTimeout(r, wait));
        await load();
      }
    } catch (e: unknown) {
      const ax = e as { response?: { status?: number; data?: { detail?: unknown } } };
      const detail = ax?.response?.data?.detail;
      if (ax?.response?.status === 429 && detail && typeof detail === 'object') {
        const d = detail as { message?: string; cooldown_seconds?: number };
        if (typeof d.cooldown_seconds === 'number') {
          setCooldownUntil(Date.now() + d.cooldown_seconds * 1000);
        }
        setError(d.message || formatApiError(e));
      } else {
        setError(formatApiError(e));
      }
    } finally {
      setBusy(null);
    }
  };

  const rankedAlerts = useMemo(
    () => rankOpenAlerts((dash?.alerts || []).filter((alert) => !hiddenIds.includes(alert.id))),
    [dash, hiddenIds],
  );
  const alertQueueKey = rankedAlerts.map((alert) => alert.id).join('|');

  useEffect(() => {
    if (fadingId) return;
    const queue = alertQueueKey ? alertQueueKey.split('|') : [];
    setSlots((prev) => {
      const next = placeSlots(prev, queue);
      const added = next.find((id, index) => id && id !== prev[index]);
      if (added && prev.some(Boolean)) setGrowId(added);
      return next[0] === prev[0] && next[1] === prev[1] ? prev : next;
    });
  }, [alertQueueKey, fadingId]);

  useEffect(() => {
    if (!growId) return;
    const timer = window.setTimeout(() => setGrowId((current) => (current === growId ? null : current)), 360);
    return () => window.clearTimeout(timer);
  }, [growId]);

  const slotPair: [string | null, string | null] =
    slots.some(Boolean) || fadingId
      ? slots
      : [rankedAlerts[0]?.id ?? null, rankedAlerts[1]?.id ?? null];
  const showPair = pairLayout || Boolean(slotPair[0] && slotPair[1]);

  useEffect(() => {
    if (slotPair[0] && slotPair[1]) setPairLayout(true);
    if (!slotPair[0] && !slotPair[1] && !fadingId) setPairLayout(false);
  }, [slotPair[0], slotPair[1], fadingId]);

  const handleAck = async (alert: AdsAlert) => {
    if (fadingId) return;
    setFadingId(alert.id);
    setActionId(alert.id);
    setError(null);
    const hideLater = new Promise<void>((resolve) => {
      fadeTimer.current = window.setTimeout(() => {
        setHiddenIds((ids) => (ids.includes(alert.id) ? ids : [...ids, alert.id]));
        setSlots((prev) => [prev[0] === alert.id ? null : prev[0], prev[1] === alert.id ? null : prev[1]]);
        setFadingId(null);
        resolve();
      }, 320);
    });
    try {
      await apiClient.ackAdsAlert(alert.id);
      await hideLater;
      await load();
    } catch (e) {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
      setHiddenIds((ids) => ids.filter((id) => id !== alert.id));
      setFadingId(null);
      setError(formatApiError(e));
    } finally {
      setActionId(null);
    }
  };

  const handlePause = async (alert: AdsAlert) => {
    setActionId(alert.id);
    setError(null);
    try {
      await apiClient.setMetaAdsEntityStatus(alert.entity_id, 'PAUSED');
      setSyncMessage('Paused in Meta. Status updates on the next sync.');
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setActionId(null);
    }
  };

  const handleSweep = async (campaignId: string, sweepStatus: string | null) => {
    setError(null);
    try {
      await apiClient.setAdsCampaignSweepStatus(campaignId, sweepStatus);
      await load();
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  const handleSettings = async () => {
    setBusy('settings');
    setError(null);
    try {
      const cents = targetDollars.trim() === '' ? null : Math.round(Number(targetDollars) * 100);
      const roas = minRoas.trim() === '' ? null : Number(minRoas);
      if (cents != null && Number.isNaN(cents)) throw new Error('Target cost per result must be a number');
      if (roas != null && Number.isNaN(roas)) throw new Error('Minimum ROAS must be a number');
      await apiClient.putAdsSettings({ target_cpr_cents: cents, min_roas: roas });
      await load();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading && !dash) {
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <PageDateRange caption="Applies to spend, results, and charts" />
        </div>
        <div className="space-y-4 animate-pulse">
          <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />
          <div className="h-56 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        </div>
      </div>
    );
  }

  const connected = Boolean(dash?.connected);
  const kpis = dash?.kpis;

  return (
    <div className="space-y-6">
      {!connected ? (
        <div className="flex justify-end">
          <PageDateRange caption="Applies to spend, results, and charts" />
        </div>
      ) : null}
      {error ? (
        <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      ) : null}
      {syncMessage ? (
        <div className="glass-card border border-violet-400/30 text-violet-800 dark:text-violet-200 px-4 py-3 rounded-xl text-sm">
          {syncMessage}
        </div>
      ) : null}

      {!connected ? (
        <section className="glass-card rounded-xl p-5 space-y-3 border border-violet-400/25">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Connect Meta Ads</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Sync spend, results, and frequency so Sweep can flag fatigue, a messaging ceiling, and when an ad set is ready to scale.
          </p>
          {!dash?.app_configured ? (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Meta Ads app credentials are not set. An admin can connect the account from{' '}
              <Link href="/?tab=settings&section=integrations" className="underline font-semibold">
                Settings → Integrations
              </Link>
              .
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={busy === 'connect' || !isAdmin}
              className="glass-button px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {busy === 'connect' ? 'Redirecting…' : isAdmin ? 'Connect Meta Ads' : 'Ask an admin to connect Meta Ads'}
            </button>
          )}
        </section>
      ) : (
        <section className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900 dark:text-gray-100">Meta Ads</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Last sync: {dash?.last_sync_at ? new Date(dash.last_sync_at).toLocaleString() : 'pending'}
              {' · '}Reads come from the last sync, not a live Meta call
            </p>
          </div>
          <div className="flex items-start flex-wrap justify-end gap-2">
            <PageDateRange caption="Applies to spend, results, and charts" />
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={!isAdmin || busy === 'sync' || cooldownRemainingSec > 0}
              className="glass-button-secondary self-start px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50"
            >
              {busy === 'sync'
                ? 'Queuing…'
                : cooldownRemainingSec > 0
                  ? `Sync in ${Math.ceil(cooldownRemainingSec / 60)}m`
                  : 'Sync now'}
            </button>
          </div>
        </section>
      )}

      {isAdmin && adAccounts.length > 1 ? (
        <section className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ad account</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Connect picked one automatically — switch here if it&apos;s the wrong business/portfolio. Campaigns from
              the account you leave stay synced but stop showing until you switch back.
            </p>
          </div>
          <select
            value={adAccounts.find((a) => a.current)?.id || ''}
            onChange={(e) => void handleAdAccountSwitch(e.target.value)}
            disabled={switchingAccount}
            className="text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2.5 py-1.5 disabled:opacity-50"
          >
            {adAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.id}
              </option>
            ))}
          </select>
        </section>
      ) : null}

      {isAdmin ? (
        <section className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Targets</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Minimum ROAS is the floor your unit economics allow. This dashboard stores that floor. It does not compute live ROAS from funnel cash.
            </p>
          </div>
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
              onClick={() => void handleSettings()}
              disabled={busy === 'settings' || !connected}
              className="glass-button px-3 py-1.5 text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              {busy === 'settings' ? 'Saving…' : 'Save targets'}
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Alerts</h3>
        {!rankedAlerts.length && !fadingId ? (
          <p className="text-sm text-gray-500">No open alerts. Sync after a few days of spend so the rules have a baseline.</p>
        ) : (
          <div className={`grid items-start gap-3 ${showPair ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {(showPair ? slotPair : [slotPair[0] || slotPair[1]]).map((id, index) => {
              const alert = id ? (dash?.alerts || []).find((row) => row.id === id) : undefined;
              return (
                <div key={showPair ? index : alert?.id || 'solo'} className="min-w-0">
                  {alert ? (
                    <AlertNotice
                      key={alert.id}
                      alert={alert}
                      fading={fadingId === alert.id}
                      grow={growId === alert.id}
                      busy={actionId === alert.id}
                      isAdmin={isAdmin}
                      onAck={() => void handleAck(alert)}
                      onPause={() => void handlePause(alert)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {kpis ? (
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {(
            [
              ['Spend', money(kpis.recent.spend_cents, currency), kpis.delta.spend_pct, false],
              ['Results', fmtNum(kpis.recent.results), kpis.delta.results_pct, false],
              ['CPR', money(kpis.recent.cpr_cents, currency), kpis.delta.cpr_pct, true],
              ['CTR', kpis.recent.ctr == null ? '—' : `${kpis.recent.ctr.toFixed(2)}%`, kpis.delta.ctr_pct, false],
              ['CPM', money(kpis.recent.cpm_cents, currency), kpis.delta.cpm_pct, true],
              ['Frequency', fmtNum(kpis.recent.frequency), kpis.delta.frequency_pct, true],
            ] as [string, string, number | null, boolean][]
          ).map(([label, value, delta, invert]) => (
            <div key={label} className="glass-card rounded-xl p-3 border border-gray-200/40 dark:border-gray-700/40">
              <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
              <p className="text-[11px] text-gray-500 mt-1">
                {range.compare ? (
                  <>
                    <Delta value={delta} invert={invert} />{' '}
                    {range.compare.mode === 'previous_year'
                      ? 'vs last year'
                      : range.compare.mode === 'custom'
                        ? 'vs custom range'
                        : 'vs previous period'}
                  </>
                ) : (
                  'Selected range'
                )}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      <AdsEntityExplorer
        campaigns={dash?.campaigns || []}
        currency={currency}
        funnels={funnels}
        start={params.start}
        end={params.end}
        onSweep={(campaignId, value) => void handleSweep(campaignId, value)}
        onFunnelLink={(metaCampaignId, funnelId) => void handleFunnelLink(metaCampaignId, funnelId)}
      />
    </div>
  );
}

