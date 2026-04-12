'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient, CallLibraryItem } from '@/lib/api';
import { useLoading } from '@/contexts/LoadingContext';
import { APP_CALL_LIBRARY_SIDEBAR_WIDTH } from '@/components/ui/layoutConstants';
import { usePerformanceDrawer } from '@/components/ui/PerformanceDrawer';

// Local keyframes for shimmer (Tailwind arbitrary animations need a defined keyframe name)
// Kept here to avoid touching global CSS.
const shimmerStyle = `
@keyframes shimmer {
  0% { transform: translateX(-100%); opacity: .0; }
  20% { opacity: .8; }
  100% { transform: translateX(100%); opacity: .0; }
}
`;

function formatCtx(ctx: Record<string, unknown> | undefined): string {
  if (!ctx || typeof ctx !== 'object') return '';
  const salesperson = String(ctx.salesperson || 'Salesperson');
  const prospect = String(ctx.prospect || 'Prospect');
  const topic = String(ctx.topic || '');
  const background = String(ctx.background || '');
  const parts = [
    `The salesperson (${salesperson}) is speaking with ${prospect}${topic ? `. ${topic}` : ''}.`,
  ];
  if (background) parts.push(background);
  return parts.join(' ');
}

export default function CallLibraryPanel() {
  const { setLoading: setGlobalLoading } = useLoading();
  const perfDrawer = usePerformanceDrawer();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const [data, setData] = useState<{ items: CallLibraryItem[]; total: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshPulse, setRefreshPulse] = useState(0);
  const [postSyncPollUntilMs, setPostSyncPollUntilMs] = useState<number | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const itemsSorted = (data?.items ?? []).slice().sort((a, b) => {
    const da = a.meeting_at || a.computed_at || '';
    const db = b.meeting_at || b.computed_at || '';
    // ISO strings sort lexicographically in chronological order
    if (da < db) return 1;
    if (da > db) return -1;
    return 0;
  });

  const selectedItem = selectedId ? itemsSorted.find((i) => i.id === selectedId) : itemsSorted[0];
  const itemIdSet = useMemo(() => new Set((data?.items ?? []).map((i) => i.id)), [data?.items]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiClient.getCallLibrary({ limit: 50, offset: 0 });
      setData(res);
      setSelectedId((prev) => {
        if (prev && res.items.some((i) => i.id === prev)) return prev;
        return res.items[0]?.id ?? null;
      });
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as Error)?.message ||
        'Failed to load Call Library';
      setError(String(msg));
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  }, [setGlobalLoading]);

  useEffect(() => {
    if (!selectedItem) {
      setRenaming(false);
      setRenameDraft('');
      return;
    }
    if (!renaming) {
      setRenameDraft(selectedItem.call_title);
    }
  }, [selectedItem?.id, selectedItem?.call_title, renaming]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshPulse((x) => x + 1);
    setRefreshNote(null);
    try {
      // Refresh should *sync* from Fathom first, then reload the library.
      // The backend only ingests meetings associated to client emails for this org.
      const beforeIds = new Set(itemIdSet);
      const syncRes = await apiClient.syncFathomMeetings();
      let llmRetried = 0;
      try {
        const r = await apiClient.retryCallLibraryLlmFailed();
        llmRetried = Number(r?.requeued ?? 0);
      } catch (e) {
        console.warn('[CallLibrary] retry LLM failed reports:', e);
      }
      await load();

      // User-facing result summary.
      const skipped = Boolean((syncRes as { skipped?: boolean }).skipped);
      if (skipped) {
        const reason = String((syncRes as { reason?: string }).reason || 'Sync skipped');
        setRefreshNote(`Sync skipped: ${reason}`);
        setPostSyncPollUntilMs(null);
        return;
      }

      const ingested = Number((syncRes as { ingested?: number }).ingested ?? 0);
      const seen = Number((syncRes as { meetings_seen?: number }).meetings_seen ?? 0);
      const skippedNoClient = Number((syncRes as { skipped_no_client_match?: number }).skipped_no_client_match ?? 0);

      const llmNote =
        llmRetried > 0
          ? ` Re-queued ${llmRetried} failed analysis${llmRetried === 1 ? '' : 'es'} (LLM retry).`
          : '';

      if (!ingested) {
        const parts: string[] = [];
        if (seen > 0 && skippedNoClient > 0) {
          parts.push(
            'No new client-matched calls found (meetings were seen, but none matched existing client emails).'
          );
        } else {
          parts.push('No new calls available.');
        }
        if (llmRetried > 0) {
          parts.push(`Re-queued ${llmRetried} failed analysis${llmRetried === 1 ? '' : 'es'} (LLM retry).`);
        }
        setRefreshNote(parts.join(' '));
        setPostSyncPollUntilMs(llmRetried > 0 ? Date.now() + 60_000 : null);
        return;
      }

      // New Fathom rows ingested — background report generation; optionally LLM retries too.
      const afterIds = new Set((data?.items ?? []).map((i) => i.id));
      const newAppeared = Array.from(afterIds).some((id) => !beforeIds.has(id));
      let note = '';
      if (newAppeared) {
        note = `Found ${ingested} new call${ingested === 1 ? '' : 's'}.`;
        setPostSyncPollUntilMs(llmRetried > 0 ? Date.now() + 60_000 : null);
      } else {
        note = `Found ${ingested} new call${ingested === 1 ? '' : 's'} — analyzing in the background…`;
        setPostSyncPollUntilMs(Date.now() + (llmRetried > 0 ? 60_000 : 45_000));
      }
      note += llmNote;
      setRefreshNote(note.trim());
    } finally {
      setRefreshing(false);
    }
  }, [itemIdSet, load, data?.items]);

  useEffect(() => {
    void load();
  }, [load]);

  // While there are pending calls, keep refreshing quietly in the background.
  useEffect(() => {
    const hasPending = itemsSorted.some((i) => i.status !== 'complete');
    if (!hasPending) return;
    const t = window.setTimeout(() => {
      void load();
    }, 5000);
    return () => window.clearTimeout(t);
  }, [itemsSorted, load]);

  // After a sync that ingested new calls, poll until reports show up (or timeout).
  useEffect(() => {
    if (!postSyncPollUntilMs) return;
    if (Date.now() > postSyncPollUntilMs) {
      setPostSyncPollUntilMs(null);
      setRefreshNote((n) => n || 'Sync finished. Reports can take a moment to appear.');
      return;
    }
    const t = window.setTimeout(() => {
      void load();
    }, 3000);
    return () => window.clearTimeout(t);
  }, [postSyncPollUntilMs, load]);

  const saveRename = async () => {
    if (!selectedItem) return;
    const t = renameDraft.trim();
    if (!t) return;
    setRenameSaving(true);
    try {
      await apiClient.patchCallLibraryReport(selectedItem.id, t);
      setRenaming(false);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as Error)?.message ||
        'Could not rename';
      alert(String(msg));
    } finally {
      setRenameSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse px-1">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg w-1/3" />
        <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="w-full px-1 pb-12">
      <style>{shimmerStyle}</style>
      <div className="max-w-6xl mx-auto w-full">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Call Library</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              AI coaching reports from synced Fathom calls—context, strengths, weaknesses, and scores. Sync meetings
              under{' '}
              <Link href="/?tab=intelligence" className="text-violet-600 dark:text-violet-400 underline">
                Intelligence
              </Link>
              .
            </p>
          </div>
        </div>

        {error && (
          <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm mb-4">
            {error}
          </div>
        )}
        {refreshNote && !error ? (
          <div className="glass-card border border-violet-500/20 text-gray-700 dark:text-gray-200 px-4 py-3 rounded-xl text-sm mb-4">
            {refreshNote}
          </div>
        ) : null}

        {!itemsSorted.length ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No calls yet. Connect Fathom and run a sync; new meetings will appear here with reports.
          </p>
        ) : (
          <>
            {/* Secondary sidebar: fixed panel that visually extends the main nav rail */}
            <aside
              className={`hidden lg:flex fixed top-0 bottom-0 z-[44] ${APP_CALL_LIBRARY_SIDEBAR_WIDTH} flex-col glass-panel border-r border-gray-200/60 dark:border-white/10 shadow-lg transition-[left] duration-300 ease-out`}
              aria-label="Call Library list"
              style={{ left: perfDrawer?.isOpen ? 'calc(14rem + 24rem)' : '14rem' }}
            >
              <div className="flex-shrink-0 p-3 border-b border-gray-200/50 dark:border-white/10 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Call Library</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">{itemsSorted.length} calls</p>
                </div>
                <button
                  type="button"
                  className="glass-button-secondary px-3 py-1.5 rounded-md text-xs disabled:opacity-60"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                  aria-label="Refresh calls"
                >
                  <span
                    className={[
                      'inline-flex items-center gap-1.5',
                      refreshing ? 'animate-pulse' : '',
                    ].join(' ')}
                    key={refreshPulse}
                  >
                    <svg
                      className={['w-4 h-4', refreshing ? 'animate-spin' : ''].join(' ')}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v6h6M20 20v-6h-6M20 9A8 8 0 006.34 6.34M4 15a8 8 0 0013.66 2.66"
                      />
                    </svg>
                    {refreshing ? 'Refreshing…' : 'Refresh'}
                  </span>
                </button>
              </div>
              <div className="relative flex-1 min-h-0 flex flex-col">
                {/* Graceful loading overlay that preserves clickability */}
                {refreshing ? (
                  <div className="pointer-events-none absolute inset-0 z-[2]">
                    <div className="absolute inset-0 bg-gradient-to-b from-violet-500/10 via-transparent to-transparent" />
                    <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-r from-transparent via-white/25 to-transparent dark:via-white/10 animate-[shimmer_1.2s_linear_infinite]" />
                  </div>
                ) : null}
                <ul className="flex-1 min-h-0 overflow-auto overscroll-contain relative z-[1]">
                {itemsSorted.map((item) => {
                  const active = (selectedItem?.id ?? null) === item.id;
                  const isPending = item.status !== 'complete';
                  return (
                    <li key={item.id} className="border-b border-gray-200/40 dark:border-white/10 last:border-b-0">
                      <button
                        type="button"
                        className={[
                          'w-full text-left px-3 py-3 transition-colors',
                          active
                            ? 'bg-violet-500/10 dark:bg-violet-400/10'
                            : 'hover:bg-white/10 dark:hover:bg-white/5',
                        ].join(' ')}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                              {item.call_title}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400">
                              {item.meeting_at ? new Date(item.meeting_at).toLocaleString() : '—'}
                              {item.client_name ? ` · ${item.client_name}` : ''}
                              {item.status !== 'complete' ? ` · ${item.status}` : ''}
                            </p>
                            {item.attendees?.length ? (
                              <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
                                {item.attendees
                                  .map((a) => a.name || a.email)
                                  .filter(Boolean)
                                  .join(', ')}
                              </p>
                            ) : null}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1">
                            {item.call_score != null && item.status === 'complete' ? (
                              <span className="text-xs font-bold tabular-nums text-violet-600 dark:text-violet-400">
                                {Math.round(item.call_score)}
                              </span>
                            ) : null}
                            {isPending ? (
                              <span className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                Analyzing…
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
                </ul>
              </div>
            </aside>

            {/* Mobile/tablet: inline list at top */}
            <div className="lg:hidden glass-card rounded-2xl border border-gray-200/60 dark:border-white/10 overflow-hidden mb-4">
              <div className="p-3 border-b border-gray-200/50 dark:border-white/10 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Calls</p>
                <button
                  type="button"
                  className="glass-button-secondary px-3 py-1.5 rounded-md text-xs disabled:opacity-60"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                >
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              <ul className="max-h-64 overflow-auto">
                {itemsSorted.map((item) => {
                  const active = (selectedItem?.id ?? null) === item.id;
                  return (
                    <li key={item.id} className="border-b border-gray-200/40 dark:border-white/10 last:border-b-0">
                      <button
                        type="button"
                        className={[
                          'w-full text-left px-3 py-3 transition-colors',
                          active
                            ? 'bg-violet-500/10 dark:bg-violet-400/10'
                            : 'hover:bg-white/30 dark:hover:bg-gray-900/40',
                        ].join(' ')}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.call_title}</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {item.meeting_at ? new Date(item.meeting_at).toLocaleString() : '—'}
                          {item.client_name ? ` · ${item.client_name}` : ''}
                          {item.status !== 'complete' ? ` · ${item.status}` : ''}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Main pane */}
            <section className="glass-card rounded-2xl border border-gray-200/60 dark:border-white/10 overflow-hidden">
              {!selectedItem ? (
                <div className="p-6 text-sm text-gray-500 dark:text-gray-400">Select a call to view its report.</div>
              ) : (
                <>
                  <div className="p-4 border-b border-gray-200/50 dark:border-white/10 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {renaming ? (
                        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
                          <input
                            type="text"
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            className="flex-1 min-w-0 max-w-xl px-3 py-2 text-base font-semibold rounded-md glass-input border border-gray-200/60 dark:border-white/10 text-gray-900 dark:text-gray-100"
                            maxLength={500}
                            disabled={renameSaving}
                            aria-label="Call name"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveRename();
                              if (e.key === 'Escape') {
                                setRenaming(false);
                                setRenameDraft(selectedItem.call_title);
                              }
                            }}
                          />
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void saveRename()}
                              disabled={renameSaving || !renameDraft.trim()}
                              className="text-xs glass-button px-3 py-1.5 rounded-md disabled:opacity-50"
                            >
                              {renameSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRenaming(false);
                                setRenameDraft(selectedItem.call_title);
                              }}
                              disabled={renameSaving}
                              className="text-xs glass-button-secondary px-3 py-1.5 rounded-md"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 group">
                          <p className="text-lg font-bold text-gray-900 dark:text-gray-100 flex-1 min-w-0 break-words">
                            {selectedItem.call_title}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setRenaming(true);
                              setRenameDraft(selectedItem.call_title);
                            }}
                            className="shrink-0 p-1.5 rounded-md text-gray-500 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-white/10 opacity-80 group-hover:opacity-100"
                            title="Rename this call"
                            aria-label="Rename this call"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                              />
                            </svg>
                          </button>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {selectedItem.meeting_at ? new Date(selectedItem.meeting_at).toLocaleString() : '—'}
                        {selectedItem.client_name ? ` · ${selectedItem.client_name}` : ''}
                        {selectedItem.status !== 'complete' ? ` · ${selectedItem.status}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedItem.recording_url ? (
                        <a
                          href={selectedItem.recording_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs glass-button-secondary px-3 py-1.5 rounded-md"
                        >
                          Open recording
                        </a>
                      ) : null}
                      {selectedItem.call_score != null && selectedItem.status === 'complete' ? (
                        <span className="text-sm font-bold tabular-nums text-violet-600 dark:text-violet-400">
                          {Math.round(selectedItem.call_score)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {selectedItem.status !== 'complete' ? (
                    <div className="px-4 py-4 text-sm text-amber-800 dark:text-amber-200 bg-amber-500/10">
                      {selectedItem.failure_reason || 'Report not available yet. It will appear automatically when analysis completes.'}
                    </div>
                  ) : selectedItem.report ? (
                    <div className="px-4 py-5 space-y-6 text-sm text-gray-700 dark:text-gray-300 bg-white/20 dark:bg-gray-900/30">
                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Call context</h4>
                        <p className="leading-relaxed">
                          {formatCtx(selectedItem.report.call_context as Record<string, unknown>)}
                        </p>
                      </section>

                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mb-2">
                          Strengths observed
                        </h4>
                        <ul className="space-y-3">
                          {Array.isArray(selectedItem.report.strengths)
                            ? (selectedItem.report.strengths as Record<string, unknown>[]).map((s, i) => (
                                <li key={i} className="leading-relaxed">
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {String(s.title || 'Strength')}
                                  </span>
                                  {s.timestamp ? (
                                    <span className="text-xs text-gray-500 ml-1">({String(s.timestamp)})</span>
                                  ) : null}
                                  <p className="mt-1">{String(s.detail || '')}</p>
                                  {s.quote ? (
                                    <p className="mt-1 text-xs italic text-gray-500 border-l-2 border-emerald-500/40 pl-2">
                                      “{String(s.quote)}”
                                    </p>
                                  ) : null}
                                </li>
                              ))
                            : null}
                        </ul>
                      </section>

                      <section>
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400 mb-2">
                          Weaknesses observed
                        </h4>
                        <ul className="space-y-3">
                          {Array.isArray(selectedItem.report.weaknesses)
                            ? (selectedItem.report.weaknesses as Record<string, unknown>[]).map((w, i) => (
                                <li key={i} className="leading-relaxed">
                                  <span className="font-medium text-gray-900 dark:text-gray-100">
                                    {String(w.title || 'Weakness')}
                                  </span>
                                  {w.timestamp ? (
                                    <span className="text-xs text-gray-500 ml-1">({String(w.timestamp)})</span>
                                  ) : null}
                                  <p className="mt-1">{String(w.detail || '')}</p>
                                  {w.quote ? (
                                    <p className="mt-1 text-xs italic text-gray-500 border-l-2 border-rose-500/40 pl-2">
                                      “{String(w.quote)}”
                                    </p>
                                  ) : null}
                                </li>
                              ))
                            : null}
                        </ul>
                      </section>

                      {selectedItem.report.customer_response && typeof selectedItem.report.customer_response === 'object' ? (
                        <section>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                            Customer response
                          </h4>
                          <p className="leading-relaxed mb-2">
                            {String(
                              (selectedItem.report.customer_response as { emotional_tone?: string }).emotional_tone || ''
                            )}
                          </p>
                          {Array.isArray(
                            (selectedItem.report.customer_response as { questions_asked?: string[] }).questions_asked
                          ) &&
                          (selectedItem.report.customer_response as { questions_asked: string[] }).questions_asked
                            .length ? (
                            <ul className="list-disc list-inside text-xs space-y-1">
                              {(selectedItem.report.customer_response as { questions_asked: string[] }).questions_asked.map(
                                (q, i) => (
                                  <li key={i}>{q}</li>
                                )
                              )}
                            </ul>
                          ) : null}
                        </section>
                      ) : null}

                      {typeof selectedItem.report.overall_impression === 'string' && selectedItem.report.overall_impression ? (
                        <section>
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                            Overall impression
                          </h4>
                          <p className="leading-relaxed">{selectedItem.report.overall_impression}</p>
                        </section>
                      ) : null}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-sm text-gray-500 dark:text-gray-400">No report available.</div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
