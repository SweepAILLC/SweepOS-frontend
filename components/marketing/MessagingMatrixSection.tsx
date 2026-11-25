'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { isOrgAdminRole } from '@/lib/tabAccess';
import type {
  MessagingAngle,
  MessagingAngleDetail,
  MessagingChannel,
  MessagingMatrixResponse,
} from '@/types/messagingMatrix';

const STAGE_LABEL: Record<string, string> = {
  unaware: 'Unaware',
  problem_aware: 'Problem aware',
  solution_aware: 'Solution aware',
  product_aware: 'Product aware',
  most_aware: 'Most aware',
};

const POLL_MS = 4000;

function scoreTone(score: number | null): string {
  if (score == null) return 'text-gray-400 dark:text-gray-500';
  if (score >= 65) return 'text-emerald-700 dark:text-emerald-300';
  if (score <= 40) return 'text-red-600 dark:text-red-300';
  return 'text-gray-800 dark:text-gray-200';
}

function Score({ value, samples }: { value: number | null; samples?: number }) {
  return (
    <span className={`tabular-nums font-semibold ${scoreTone(value)}`}>
      {value == null ? '—' : Math.round(value)}
      {samples != null && value != null ? (
        <span className="ml-1 text-[10px] font-normal text-gray-500 dark:text-gray-400">({samples})</span>
      ) : null}
    </span>
  );
}

function money(cents: unknown): string | null {
  return typeof cents === 'number' ? `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : null;
}

function metricLine(m: Record<string, unknown>): string {
  const parts: string[] = [];
  if (typeof m.views === 'number') parts.push(`${m.views.toLocaleString()} views`);
  if (typeof m.engagement_rate_pct === 'number') parts.push(`${m.engagement_rate_pct.toFixed(1)}% engagement`);
  const spend = money(m.spend_cents);
  if (spend) parts.push(`${spend} spend`);
  if (typeof m.booked_calls === 'number' && m.booked_calls > 0) parts.push(`${m.booked_calls} booked calls`);
  if (typeof m.results === 'number') parts.push(`${m.results} results`);
  return parts.join(' · ');
}

function AngleDetailPanel({
  angleId,
  isAdmin,
  onArchived,
}: {
  angleId: string;
  isAdmin: boolean;
  onArchived: () => void;
}) {
  const [detail, setDetail] = useState<MessagingAngleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiClient
      .getMessagingAngle(angleId)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch((e) => {
        if (alive) setError(formatApiError(e));
      });
    return () => {
      alive = false;
    };
  }, [angleId]);

  const recreate = async (channel: MessagingChannel) => {
    setBusy(channel);
    setError(null);
    try {
      const draft = await apiClient.recreateMessagingAngle(angleId, channel);
      setDetail((d) => (d ? { ...d, last_draft: draft } : d));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setBusy(null);
    }
  };

  const archive = async () => {
    setBusy('archive');
    try {
      await apiClient.setMessagingAngleStatus(angleId, 'archived');
      onArchived();
    } catch (e) {
      setError(formatApiError(e));
      setBusy(null);
    }
  };

  if (!detail) {
    return <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{error || 'Loading evidence…'}</div>;
  }

  const draft = detail.last_draft;
  const facts: [string, string | null][] = [
    ['Speaks to', detail.persona],
    ['Promise', detail.promise],
    ['Hook', detail.hook_mechanic ? detail.hook_mechanic.replace('_', ' ') : null],
  ];
  return (
    <div className="px-4 py-4 space-y-4 bg-gray-50/60 dark:bg-gray-900/30">
      {detail.reasoning ? (
        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{detail.reasoning}</p>
      ) : (
        <p className="text-sm italic text-gray-500 dark:text-gray-400">No reasoning yet. It is written on the next refresh.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3 text-sm">
        {facts.map(([label, value]) =>
          value ? (
            <div key={label} className="min-w-0">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">{label}</p>
              <p className="text-gray-800 dark:text-gray-200 break-words">{value}</p>
            </div>
          ) : null,
        )}
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Evidence ({detail.sources.length})</p>
        <ul className="space-y-2">
          {detail.sources.map((s) => (
            <li key={`${s.source_type}-${s.source_id}`} className="glass-card rounded-lg p-3 flex gap-3">
              {s.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.thumbnail_url} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
              ) : null}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="px-1.5 py-0.5 rounded-full bg-gray-200/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300 font-semibold">
                    {s.source_type === 'instagram' ? 'Organic' : 'Paid'}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">
                    Score <Score value={s.item_score} />
                  </span>
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-violet-600 dark:text-violet-400 underline">
                      Open post
                    </a>
                  ) : (
                    <span className="text-gray-500 dark:text-gray-400 truncate">{s.title}</span>
                  )}
                </div>
                {s.quote ? <p className="text-sm text-gray-800 dark:text-gray-200 italic break-words">“{s.quote}”</p> : null}
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{metricLine(s.metrics)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {draft ? (
        <div className="glass-card rounded-lg p-3 space-y-2 border border-amber-400/40">
          <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
            Draft for {draft.channel === 'paid' ? 'a Meta ad' : 'an Instagram reel'} · not approved · review before using
          </p>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Hooks</p>
            <ol className="list-decimal pl-5 text-sm text-gray-800 dark:text-gray-200 space-y-0.5">
              {draft.hooks.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Outline</p>
            <ol className="list-decimal pl-5 text-sm text-gray-800 dark:text-gray-200 space-y-0.5">
              {draft.outline.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ol>
          </div>
          {draft.cta ? <p className="text-sm text-gray-800 dark:text-gray-200">CTA: {draft.cta}</p> : null}
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600 dark:text-red-300">{error}</p> : null}

      {isAdmin ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void recreate('organic')}
            disabled={busy != null}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy === 'organic' ? 'Drafting…' : 'Recreate as reel'}
          </button>
          <button
            type="button"
            onClick={() => void recreate('paid')}
            disabled={busy != null}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-violet-500/50 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
          >
            {busy === 'paid' ? 'Drafting…' : 'Recreate as ad'}
          </button>
          <button
            type="button"
            onClick={() => void archive()}
            disabled={busy != null}
            className="px-3 py-1.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-700/60 disabled:opacity-50"
          >
            Archive angle
          </button>
        </div>
      ) : null}
    </div>
  );
}

function AngleRows({
  angle,
  open,
  onToggle,
  detail,
}: {
  angle: MessagingAngle;
  open: boolean;
  onToggle: () => void;
  detail: React.ReactNode;
}) {
  return (
    <>
      <tr
        className={`border-b border-gray-200/40 dark:border-gray-700/40 cursor-pointer hover:bg-violet-500/5 ${
          open ? 'bg-violet-500/5' : ''
        }`}
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <button
            type="button"
            aria-expanded={open}
            className="text-left font-semibold text-gray-900 dark:text-gray-100"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {angle.name}
          </button>
          {angle.awareness_stage ? (
            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200/70 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300 whitespace-nowrap">
              {STAGE_LABEL[angle.awareness_stage] ?? angle.awareness_stage}
            </span>
          ) : null}
        </td>
        <td className="px-3 py-2.5 text-right">
          <Score value={angle.organic_score} samples={angle.organic_samples} />
        </td>
        <td className="px-3 py-2.5 text-right">
          <Score value={angle.paid_score} samples={angle.paid_samples} />
        </td>
        <td className="px-4 py-2.5 text-right text-base">
          <Score value={angle.overall_score} />
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={4} className="p-0">
            {detail}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function MessagingMatrixSection() {
  const [data, setData] = useState<MessagingMatrixResponse | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<MessagingChannel | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.getMessagingMatrix(channel === 'all' ? {} : { channel });
      setData(res);
      setError(null);
      return res;
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403) setHidden(true); // not a consulting-tier org
      else setError(formatApiError(e));
      return null;
    }
  }, [channel]);

  const stopPolling = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    setRefreshing(true);
    pollRef.current = window.setInterval(async () => {
      try {
        const st = await apiClient.getMessagingMatrixStatus();
        if (st.state !== 'queued' && st.state !== 'running') {
          stopPolling();
          setRefreshing(false);
          if (st.state === 'failed') setError(st.error || 'Refresh failed. Try again.');
          await load();
        }
      } catch {
        stopPolling();
        setRefreshing(false);
      }
    }, POLL_MS);
  }, [load, stopPolling]);

  useEffect(() => {
    void load().then((res) => {
      const state = res?.refresh?.state;
      if (state === 'queued' || state === 'running') startPolling();
    });
    return stopPolling;
  }, [load, startPolling, stopPolling]);

  useEffect(() => {
    apiClient
      .getCurrentUser()
      .then((user) => setIsAdmin(isOrgAdminRole((user as { role?: string })?.role || '')))
      .catch(() => setIsAdmin(false));
  }, []);

  const refresh = async () => {
    setError(null);
    try {
      await apiClient.refreshMessagingMatrix();
      startPolling();
    } catch (e) {
      setError(formatApiError(e));
    }
  };

  if (hidden) return null;

  const angles: MessagingAngle[] = data?.angles ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Messaging Matrix</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            The angles in your transcribed reels and Meta ads, scored by how that content actually performed. Open one
            to see the proof and recreate it.
          </p>
        </div>
        {isAdmin ? (
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 shrink-0"
          >
            {refreshing ? 'Analyzing…' : 'Refresh'}
          </button>
        ) : null}
      </div>

      <div className="flex gap-1.5" role="tablist" aria-label="Score channel">
        {(['all', 'organic', 'paid'] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={channel === c}
            onClick={() => setChannel(c)}
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              channel === c ? 'bg-violet-600 text-white' : 'bg-gray-200/70 dark:bg-gray-700/70 text-gray-700 dark:text-gray-300'
            }`}
          >
            {c === 'all' ? 'Overall' : c === 'organic' ? 'Organic' : 'Paid'}
          </button>
        ))}
      </div>

      {error ? (
        <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">{error}</div>
      ) : null}

      {!data ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading messaging matrix…</p>
      ) : angles.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
          {refreshing
            ? 'Reading your transcripts and ads. This can take a few minutes.'
            : 'No scored angles yet. Refresh to analyze your transcribed reels and ads with at least $50 spend.'}
        </p>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-gray-500 border-b border-gray-200/60 dark:border-gray-700/60">
                  <th className="px-4 py-2 font-semibold">Angle</th>
                  <th className="px-3 py-2 font-semibold text-right">Organic</th>
                  <th className="px-3 py-2 font-semibold text-right">Paid</th>
                  <th className="px-4 py-2 font-semibold text-right">Overall</th>
                </tr>
              </thead>
              <tbody>
                {angles.map((a) => {
                  const open = openId === a.id;
                  return (
                    <AngleRows
                      key={a.id}
                      angle={a}
                      open={open}
                      onToggle={() => setOpenId(open ? null : a.id)}
                      detail={
                        open ? (
                          <AngleDetailPanel
                            angleId={a.id}
                            isAdmin={isAdmin}
                            onArchived={() => {
                              setOpenId(null);
                              void load();
                            }}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-200/60 dark:border-gray-700/60">
            {data.score_note} Numbers in brackets are how many posts or ads back the score.
          </p>
        </div>
      )}
    </section>
  );
}
