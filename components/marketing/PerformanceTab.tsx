'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  apiClient,
  InstagramPerformance,
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

function Delta({ value }: { value?: number | null }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span className={`text-[10px] font-semibold ${up ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
      {up ? '+' : ''}
      {value.toFixed(0)}%
    </span>
  );
}

function Sparkline({ points, metric }: { points: InstagramTrendPoint[]; metric: keyof InstagramTrendPoint }) {
  const vals = points.map((p) => Number(p[metric] ?? 0));
  if (vals.length < 2) return <div className="h-8" />;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 120;
  const h = 32;
  const d = vals
    .map((v, i) => {
      const x = (i / (vals.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8 text-violet-500" aria-hidden>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export type PerformanceTabProps = {
  onGoToIdeas?: () => void;
};

const ACTION_DIMS = [
  { id: 'funnel_stage', label: 'Awareness level (TOF / MOF / BOF)' },
  { id: 'format_bucket', label: 'Format' },
  { id: 'hook_pattern', label: 'Hook style' },
] as const;

export default function PerformanceTab({ onGoToIdeas }: PerformanceTabProps) {
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [perf, setPerf] = useState<InstagramPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'connect' | null>(null);
  const [days, setDays] = useState(90);
  const [trendMetric, setTrendMetric] = useState<'reach' | 'saved' | 'engagement_rate_pct'>('reach');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [st, pf] = await Promise.all([
        apiClient.getInstagramStatus(),
        apiClient.getInstagramPerformance(days).catch(() => null),
      ]);
      setStatus(st);
      setPerf(pf);
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

  const doubleDown = useMemo(
    () => (perf?.what_works || []).filter((w) => w.verdict === 'double_down'),
    [perf]
  );
  const stopDoing = useMemo(
    () => (perf?.what_works || []).filter((w) => w.verdict === 'stop'),
    [perf]
  );

  const actionRows = useMemo(() => {
    const rows = perf?.what_works || [];
    return ACTION_DIMS.map((dim) => {
      const options = rows.filter((r) => r.dimension === dim.id);
      const best = options.length
        ? [...options].sort((a, b) => (Number(b.lift_vs_median_pct) - Number(a.lift_vs_median_pct)))[0]
        : null;
      const worst = options.length
        ? [...options].sort((a, b) => (Number(a.lift_vs_median_pct) - Number(b.lift_vs_median_pct)))[0]
        : null;
      return { ...dim, best, worst };
    });
  }, [perf]);

  const trendSeries = useMemo(() => {
    const rows = perf?.trend || [];
    return rows.map((r) => ({
      week: fmtWeek(r.week_start),
      week_start: r.week_start,
      reach: Number(r.reach || 0),
      saved: Number(r.saved || 0),
      engagement_rate_pct: Number(r.engagement_rate_pct || 0),
    }));
  }, [perf]);

  const trendMeta =
    trendMetric === 'reach'
      ? { label: 'Reach', color: '#22d3ee', unit: '' }
      : trendMetric === 'saved'
      ? { label: 'Saves', color: '#a78bfa', unit: '' }
      : { label: 'Engagement rate', color: '#34d399', unit: '%' };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-28 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    );
  }

  const connected = Boolean(status?.connected);

  return (
    <div className="space-y-5">
      {error && (
        <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!connected && (
        <section className="glass-card neon-glow rounded-xl p-4 space-y-3 border border-violet-400/30">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Connect Instagram</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            Pull real content performance (reach, saves, engagement) so Marketing Intel can show what&apos;s working
            and ground new ideas in results. Requires a Business or Creator account.
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
          <section className="glass-card rounded-xl p-3.5 sm:p-4 flex flex-wrap items-center gap-2.5 justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                @{status?.username || 'Instagram'}
                <span className="text-xs font-normal text-gray-500 ml-1.5">
                  {status?.followers_count != null ? `· ${fmtNum(status.followers_count)} followers` : ''}
                </span>
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Last sync:{' '}
                {status?.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : 'pending'}
                {' · '}Auto-updates daily in the background
              </p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1.5"
              >
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
              </select>
            </div>
          </section>

          {status?.capabilities?.reason ? (
            <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {status.capabilities.reason}
            </p>
          ) : null}

          {(perf?.unsettled_post_count || 0) > 0 ? (
            <p className="text-xs text-sky-800 dark:text-sky-200 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2">
              {perf!.unsettled_post_count} recent post{perf!.unsettled_post_count === 1 ? '' : 's'} still settling —
              Instagram insights can lag ~48 hours.
            </p>
          ) : null}

          {perf?.summary ? (
            <section className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              {(
                [
                  ['Reach', perf.summary.reach, perf.summary.reach_delta_pct, 'reach'],
                  ['Views', perf.summary.views, perf.summary.views_delta_pct, 'views'],
                  ['Saves', perf.summary.saved, perf.summary.saved_delta_pct, 'saved'],
                  ['Eng. rate', perf.summary.engagement_rate_pct, perf.summary.engagement_rate_delta_pct, 'engagement_rate_pct'],
                  ['Followers Δ', perf.summary.follower_growth, null, null],
                ] as const
              ).map(([label, value, delta, sparkKey]) => (
                <div key={label} className="glass-card rounded-xl p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {label === 'Eng. rate' && value != null ? `${Number(value).toFixed(1)}%` : fmtNum(value as number)}
                    </p>
                    <Delta value={delta as number | null | undefined} />
                  </div>
                  {sparkKey && perf.trend?.length ? (
                    <Sparkline points={perf.trend} metric={sparkKey} />
                  ) : (
                    <div className="h-8" />
                  )}
                </div>
              ))}
            </section>
          ) : null}

          {(trendSeries || []).length > 1 ? (
            <section className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Weekly trend</h3>
                <div className="flex gap-1">
                  {(['reach', 'saved', 'engagement_rate_pct'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTrendMetric(m)}
                      className={`text-[10px] px-2 py-1 rounded-full font-semibold ${
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

              <div className="h-56 w-full">
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

          {(perf?.verdicts || []).length > 0 ? (
            <section className="glass-card neon-glow rounded-xl p-4 space-y-2 border border-violet-400/25">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">What to do next</h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                One action each for awareness level, format, and hook style. Early signals are marked when sample size is thin.
              </p>
              <ul className="space-y-2">
                {perf!.verdicts.map((v, i) => (
                  <li key={i} className="text-sm text-gray-800 dark:text-gray-200 leading-snug flex gap-2">
                    <span className="text-violet-500 font-bold shrink-0">→</span>
                    <span>{v}</span>
                  </li>
                ))}
              </ul>
              {onGoToIdeas ? (
                <button
                  type="button"
                  onClick={onGoToIdeas}
                  className="text-xs font-semibold text-violet-600 dark:text-violet-400 underline"
                >
                  Generate ideas from these winners →
                </button>
              ) : null}
            </section>
          ) : null}

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {actionRows.map((row) => (
              <div key={row.id} className="glass-card rounded-xl p-4 space-y-2 border border-gray-300/20">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{row.label}</h3>
                <div className="text-xs space-y-1.5">
                  <p className="text-emerald-700 dark:text-emerald-300">
                    <span className="font-semibold">What&apos;s working:</span>{' '}
                    {row.best?.summary || 'Not enough posts yet.'}
                  </p>
                  <p className="text-sky-700 dark:text-sky-300">
                    <span className="font-semibold">What to test next:</span>{' '}
                    {row.worst
                      ? `Test a new variation of ${row.worst.value_label || row.worst.value} to improve results in this dimension.`
                      : 'No clear gap yet — keep scaling the current winner while testing one variant.'}
                  </p>
                </div>
              </div>
            ))}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Top posts</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {(perf?.top_posts || []).slice(0, 8).map((p) => (
                <a
                  key={p.ig_media_id}
                  href={p.permalink || '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="glass-card rounded-xl overflow-hidden hover:ring-2 hover:ring-violet-400/40 transition"
                >
                  {p.thumbnail_url ? (
                    <img src={p.thumbnail_url} alt="" className="w-full h-28 object-cover bg-gray-200 dark:bg-gray-800" />
                  ) : (
                    <div className="w-full h-28 bg-gray-200 dark:bg-gray-800" />
                  )}
                  <div className="p-3 space-y-1">
                    <p className="text-[10px] uppercase text-gray-500 font-semibold">
                      {p.format_bucket || 'post'} · {p.engagement_rate_pct != null ? `${p.engagement_rate_pct.toFixed(1)}% eng` : '—'}
                    </p>
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">
                      {p.hook_text || p.caption || 'Untitled'}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      {fmtNum(p.reach)} reach · {fmtNum(p.saved)} saves
                    </p>
                  </div>
                </a>
              ))}
            </div>

            {(perf?.bottom_posts || []).length > 0 ? (
              <>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pt-2">Underperformers</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {perf!.bottom_posts.slice(0, 3).map((p) => (
                    <a
                      key={p.ig_media_id}
                      href={p.permalink || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="glass-card rounded-xl p-3 space-y-1 border border-rose-400/15"
                    >
                      <p className="text-[10px] uppercase text-rose-500 font-semibold">
                        {p.format_bucket} · {p.engagement_rate_pct != null ? `${p.engagement_rate_pct.toFixed(1)}%` : '—'}
                      </p>
                      <p className="text-xs text-gray-800 dark:text-gray-200 line-clamp-2">
                        {p.hook_text || p.caption || 'Untitled'}
                      </p>
                    </a>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
