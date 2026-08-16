'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  apiClient,
  InstagramPerformance,
  InstagramPostCard,
  InstagramStatus,
  InstagramTrendPoint,
} from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

function fmtNum(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fmtWeek(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtPct(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(0)}%`;
}

function Delta({ value }: { value?: number | null }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span className={`text-[11px] font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      {fmtPct(value)}
    </span>
  );
}

function PostMediaCard({
  post,
  tone = 'default',
}: {
  post: InstagramPostCard;
  tone?: 'default' | 'under';
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const border =
    tone === 'under'
      ? 'border-rose-400/25 hover:ring-rose-400/30'
      : 'border-gray-200/40 dark:border-gray-700/40 hover:ring-violet-400/30';
  const showImg = Boolean(post.thumbnail_url) && !imgFailed;

  return (
    <a
      href={post.permalink || '#'}
      target="_blank"
      rel="noreferrer"
      className={`group glass-card rounded-xl overflow-hidden border ${border} hover:ring-2 transition block`}
    >
      <div className="relative w-full aspect-[4/5] bg-gray-200 dark:bg-gray-800">
        {showImg ? (
          <img
            src={post.thumbnail_url!}
            alt=""
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {post.format_bucket || 'post'}
            </span>
            <span className="text-xs text-gray-500 line-clamp-4">
              {post.hook_text || post.caption || 'Open on Instagram'}
            </span>
          </div>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
          {post.format_bucket || 'post'}
          {post.engagement_rate_pct != null ? ` · ${post.engagement_rate_pct.toFixed(1)}% eng` : ''}
        </p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-3 leading-snug">
          {post.hook_text || post.caption || 'Untitled'}
        </p>
        <p className="text-[11px] text-gray-500">
          {fmtNum(post.reach)} reach · {fmtNum(post.saved)} saves · {fmtNum(post.views)} views
        </p>
      </div>
    </a>
  );
}

export default function PerformanceTab() {
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [perf, setPerf] = useState<InstagramPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'connect' | 'sync' | null>(null);
  const [days, setDays] = useState(90);
  const [trendMetric, setTrendMetric] = useState<'reach' | 'saved' | 'engagement_rate_pct'>('reach');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [, setTick] = useState(0);

  const SYNC_COOLDOWN_MS = 15 * 60 * 1000;

  const load = useCallback(async () => {
    setError(null);
    try {
      const [st, pf] = await Promise.all([
        apiClient.getInstagramStatus(),
        apiClient.getInstagramPerformance(days).catch(() => null),
      ]);
      setStatus(st);
      setPerf(pf);
      if (st?.last_sync_at) {
        const last = new Date(st.last_sync_at).getTime();
        if (!Number.isNaN(last)) {
          setCooldownUntil((prev) => {
            const fromLast = last + SYNC_COOLDOWN_MS;
            if (prev != null && prev > fromLast) return prev;
            return fromLast;
          });
        }
      }
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  useEffect(() => {
    if (cooldownUntil == null) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownRemainingSec = useMemo(() => {
    if (cooldownUntil == null) return 0;
    return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  }, [cooldownUntil]);

  const handleConnect = async () => {
    setBusy('connect');
    setError(null);
    try {
      const { redirect_url } = await apiClient.postInstagramConnect();
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
      const res = await apiClient.postInstagramSync(false);
      const cdSec = Number(res.cooldown_seconds || 900);
      setCooldownUntil(Date.now() + cdSec * 1000);
      setSyncMessage(res.message || 'Sync queued — refreshing shortly.');
      // Poll a few times for last_sync_at / metrics to land.
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

  const trendSeries = useMemo(() => {
    const rows = perf?.trend || [];
    return rows.map((r: InstagramTrendPoint) => ({
      week: fmtWeek(r.week_start),
      week_start: r.week_start,
      reach: Number(r.reach || 0),
      saved: Number(r.saved || 0),
      engagement_rate_pct: Number(r.engagement_rate_pct || 0),
    }));
  }, [perf]);

  const trendMeta =
    trendMetric === 'reach'
      ? { label: 'Reach', color: '#22d3ee' }
      : trendMetric === 'saved'
      ? { label: 'Saves', color: '#a78bfa' }
      : { label: 'Engagement rate', color: '#34d399' };

  const compareLabel = perf?.summary?.comparison_label || `vs prior ${days} days`;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-56 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    );
  }

  const connected = Boolean(status?.connected);
  const summary = perf?.summary;

  return (
    <div className="space-y-6">
      {error && (
        <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!connected && (
        <section className="glass-card rounded-xl p-5 space-y-3 border border-violet-400/25">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Connect Instagram</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Pull reach, saves, and engagement so this dashboard can compare periods and ground ideas in real winners.
          </p>
          {!(status?.composio_configured ?? status?.configured) ? (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              Save your Composio API key and Instagram auth config in{' '}
              <Link href="/?tab=integrations" className="underline font-semibold">
                Integrations → Instagram
              </Link>
              , then connect your account.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={busy === 'connect'}
              className="glass-button px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {busy === 'connect' ? 'Redirecting…' : 'Connect with Instagram'}
            </button>
          )}
        </section>
      )}

      {connected && (
        <>
          <section className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                @{status?.username || 'Instagram'}
                {status?.followers_count != null ? (
                  <span className="text-sm font-normal text-gray-500 ml-2">
                    {fmtNum(status.followers_count)} followers
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Last sync:{' '}
                {status?.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : 'pending'}
                {' · '}Auto-checks daily (manual sync limited)
              </p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <label className="text-[11px] text-gray-500 font-medium">Period</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2.5 py-1.5"
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
              </select>
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={busy === 'sync' || cooldownRemainingSec > 0}
                title={
                  cooldownRemainingSec > 0
                    ? `Available again in ${Math.ceil(cooldownRemainingSec / 60)} min`
                    : 'Queue a background Instagram sync'
                }
                className="glass-button-secondary px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-50"
              >
                {busy === 'sync'
                  ? 'Queuing…'
                  : cooldownRemainingSec > 0
                  ? `Sync in ${Math.ceil(cooldownRemainingSec / 60)}m`
                  : 'Sync now'}
              </button>
            </div>
          </section>

          {syncMessage ? (
            <p className="text-xs text-violet-700 dark:text-violet-300 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
              {syncMessage}
            </p>
          ) : null}

          {status?.capabilities?.reason ? (
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {status.capabilities.reason}
            </p>
          ) : null}

          {(perf?.unsettled_post_count || 0) > 0 ? (
            <p className="text-xs text-sky-800 dark:text-sky-200 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2">
              {perf!.unsettled_post_count} recent post{perf!.unsettled_post_count === 1 ? '' : 's'} may still be
              filling in — Instagram insights can lag up to ~48 hours. Sync again later if reach/views look empty
              on brand-new posts.
            </p>
          ) : null}

          {summary ? (
            <section className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Period comparison</h3>
                <p className="text-[11px] text-gray-500">
                  Current {days}d vs previous {days}d ({compareLabel})
                </p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {(
                  [
                    {
                      label: 'Reach',
                      cur: summary.reach,
                      prev: summary.prev_reach,
                      delta: summary.reach_delta_pct,
                      fmt: (v: number | null | undefined) => fmtNum(v),
                    },
                    {
                      label: 'Views',
                      cur: summary.views,
                      prev: summary.prev_views,
                      delta: summary.views_delta_pct,
                      fmt: (v: number | null | undefined) => fmtNum(v),
                    },
                    {
                      label: 'Saves',
                      cur: summary.saved,
                      prev: summary.prev_saved,
                      delta: summary.saved_delta_pct,
                      fmt: (v: number | null | undefined) => fmtNum(v),
                    },
                    {
                      label: 'Eng. rate',
                      cur: summary.engagement_rate_pct,
                      prev: summary.prev_engagement_rate_pct,
                      delta: summary.engagement_rate_delta_pct,
                      fmt: (v: number | null | undefined) =>
                        v == null ? '—' : `${Number(v).toFixed(1)}%`,
                    },
                    {
                      label: 'Posts',
                      cur: summary.posts,
                      prev: summary.prev_period_posts,
                      delta: null,
                      fmt: (v: number | null | undefined) => fmtNum(v),
                    },
                  ] as const
                ).map((m) => (
                  <div key={m.label} className="glass-card rounded-xl p-3.5 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{m.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{m.fmt(m.cur)}</p>
                      <Delta value={m.delta} />
                    </div>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Prior: {m.fmt(m.prev)}
                    </p>
                  </div>
                ))}
              </div>
              {summary.follower_growth != null ? (
                <p className="text-[11px] text-gray-500">
                  Followers change in window:{' '}
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {summary.follower_growth >= 0 ? '+' : ''}
                    {fmtNum(summary.follower_growth)}
                  </span>
                </p>
              ) : null}
            </section>
          ) : null}

          {trendSeries.length > 1 ? (
            <section className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Weekly trend</h3>
                <div className="flex gap-1">
                  {(['reach', 'saved', 'engagement_rate_pct'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTrendMetric(m)}
                      className={`text-[10px] px-2 py-1 rounded-md font-semibold ${
                        trendMetric === m
                          ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300'
                          : 'text-gray-500 hover:bg-gray-500/10'
                      }`}
                    >
                      {m === 'engagement_rate_pct' ? 'Eng rate' : m}
                    </button>
                  ))}
                </div>
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendSeries} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
                    <XAxis dataKey="week" tick={{ fontSize: 11 }} className="fill-gray-500" />
                    <YAxis tick={{ fontSize: 11 }} className="fill-gray-500" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'rgba(17, 24, 39, 0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) =>
                        trendMetric === 'engagement_rate_pct'
                          ? [`${Number(v || 0).toFixed(1)}%`, trendMeta.label]
                          : [fmtNum(Number(v || 0)), trendMeta.label]
                      }
                      labelFormatter={(label) => `Week of ${label}`}
                    />
                    <Line
                      type="monotone"
                      dataKey={trendMetric}
                      stroke={trendMeta.color}
                      strokeWidth={2}
                      dot={{ r: 2.5 }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {(perf?.flags || []).length > 0 ? (
                <ul className="space-y-1 pt-2 border-t border-gray-200/40 dark:border-gray-700/40">
                  {perf!.flags.map((f) => (
                    <li key={f.id} className="text-xs text-amber-800 dark:text-amber-200">
                      <span className="font-semibold">{f.title}: </span>
                      {f.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Top posts</h3>
            {(perf?.top_posts || []).length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {(perf?.top_posts || []).slice(0, 5).map((p) => (
                  <PostMediaCard key={p.ig_media_id} post={p} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No ranked posts in this period yet.</p>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Underperformers</h3>
            {(perf?.bottom_posts || []).length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {(perf?.bottom_posts || []).slice(0, 5).map((p) => (
                  <PostMediaCard key={p.ig_media_id} post={p} tone="under" />
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Not enough posts to rank underperformers yet.</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
