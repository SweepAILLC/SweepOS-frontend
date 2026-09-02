import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import { TERMINAL_CHART_REFRESH_EVENT } from '@/lib/cache';
import type {
  KpiAutopopulateStatusResponse,
  KpiBenchmarks,
  KpiDailyEntry,
  KpiEntryUpdatePayload,
  KpiFlag,
  KpiMonthlyRollup,
} from '@/types/kpi';
import { DEFAULT_THRESHOLDS } from '@/lib/kpiBenchmarks';
import KpiGrid from './KpiGrid';
import KpiCalendar, { COLOR_METRICS } from './KpiCalendar';
import KpiBenchmarkSettings from './KpiBenchmarkSettings';
import KpiFlagsBanner from './KpiFlagsBanner';
import KpiCsvImportModal from './KpiCsvImportModal';
import KpiRepPerformancePanel from './KpiRepPerformancePanel';

type ViewId = 'calendar' | 'by-rep' | 'settings';

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function monthFromYmd(ymd: string): { year: number; month: number } {
  const d = new Date(`${ymd}T12:00:00`);
  return { year: d.getFullYear(), month: d.getMonth() };
}

function monthTitle(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

function applyMonthRange(
  year: number,
  month: number,
  compare: boolean
): { start: string; end: string } {
  const endMonth = new Date(year, month, 1);
  if (compare) {
    const startMonth = new Date(year, month - 1, 1);
    return {
      start: toYmd(startOfMonth(startMonth)),
      end: toYmd(endOfMonth(endMonth)),
    };
  }
  return {
    start: toYmd(startOfMonth(endMonth)),
    end: toYmd(endOfMonth(endMonth)),
  };
}

export default function KpiCommandCenterPanel() {
  const router = useRouter();
  const [view, setView] = useState<ViewId>('calendar');
  const [entries, setEntries] = useState<KpiDailyEntry[]>([]);
  const [rollups, setRollups] = useState<KpiMonthlyRollup[]>([]);
  const [benchmarks, setBenchmarks] = useState<KpiBenchmarks | null>(null);
  const [flags, setFlags] = useState<KpiFlag[]>([]);
  const [autopopStatus, setAutopopStatus] = useState<KpiAutopopulateStatusResponse>({
    calendar_available: false,
    payments_available: false,
    autopopulated_columns: ['new_followers'],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** Quiet month-nav indicator — never dims the painted calendar/grid. */
  const [softUpdating, setSoftUpdating] = useState(false);
  const [flagsLoading, setFlagsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [dataView, setDataView] = useState<'calendar' | 'grid'>('calendar');
  const [colorMetric, setColorMetric] = useState('overall');
  const loadGen = React.useRef(0);
  const hasLoadedOnce = React.useRef(false);
  const syncOnNextLoad = React.useRef(true);

  const [rangeStart, setRangeStart] = useState(() => toYmd(startOfMonth(new Date())));
  const [rangeEnd, setRangeEnd] = useState(() => toYmd(endOfMonth(new Date())));
  /** Shared with calendar two-month compare so grid/calendar show the same window. */
  const [compareMonths, setCompareMonths] = useState(false);

  const visibleMonth = useMemo(() => monthFromYmd(rangeEnd), [rangeEnd]);
  const visibleStartMonth = useMemo(() => monthFromYmd(rangeStart), [rangeStart]);
  const visibleWindowLabel = useMemo(() => {
    if (!compareMonths) return monthTitle(visibleMonth.year, visibleMonth.month);
    const startLabel = monthTitle(visibleStartMonth.year, visibleStartMonth.month);
    const endLabel = monthTitle(visibleMonth.year, visibleMonth.month);
    if (startLabel === endLabel) return endLabel;
    return `${startLabel} + ${endLabel}`;
  }, [compareMonths, visibleMonth.year, visibleMonth.month, visibleStartMonth.year, visibleStartMonth.month]);

  // Deep-link: /?tab=kpi_command_center&view=settings|calendar|by-rep|grid
  useEffect(() => {
    if (!router.isReady) return;
    const v = router.query.view;
    if (v === 'settings' || v === 'calendar' || v === 'by-rep') {
      setView(v);
      if (v === 'calendar') setDataView('calendar');
    } else if (v === 'grid') {
      setView('calendar');
      setDataView('grid');
    }
  }, [router.isReady, router.query.view]);

  const loadCore = useCallback(async () => {
    const gen = ++loadGen.current;
    const requestedStart = rangeStart;
    const requestedEnd = rangeEnd;
    const shouldSync = syncOnNextLoad.current || !hasLoadedOnce.current;
    syncOnNextLoad.current = false;
    if (!hasLoadedOnce.current) setLoading(true);
    else if (shouldSync) setRefreshing(true);
    else setSoftUpdating(true);
    setError(null);
    try {
      const [ents, rolls, bench] = await Promise.all([
        apiClient.getKpiEntries({
          start: requestedStart,
          end: requestedEnd,
          sync: shouldSync,
        }),
        apiClient.getKpiRollups(18),
        apiClient.getKpiBenchmarks(),
      ]);
      if (gen !== loadGen.current) return;
      // Keep a cross-month cache so compare / month nav stays painted; replace only
      // the requested window with server truth (clear stale days in that window).
      setEntries((prev) => {
        const byDate = new Map<string, KpiDailyEntry>();
        for (const e of prev) byDate.set(e.entry_date, e);
        const returned = new Set(ents.map((e) => e.entry_date));
        for (const key of Array.from(byDate.keys())) {
          if (key >= requestedStart && key <= requestedEnd && !returned.has(key)) {
            byDate.delete(key);
          }
        }
        for (const e of ents) byDate.set(e.entry_date, e);
        return Array.from(byDate.values()).sort((a, b) =>
          a.entry_date.localeCompare(b.entry_date)
        );
      });
      setRollups(rolls);
      setBenchmarks(bench);
      hasLoadedOnce.current = true;

      // After a fast (sync=false) nav fetch, reconcile live fields in the background
      // so month switches stay instant while Color-by data catches up.
      if (!shouldSync) {
        const bgGen = gen;
        const bgStart = requestedStart;
        const bgEnd = requestedEnd;
        void (async () => {
          try {
            const fresh = await apiClient.getKpiEntries({
              start: bgStart,
              end: bgEnd,
              sync: true,
            });
            if (bgGen !== loadGen.current) return;
            setEntries((prev) => {
              const byDate = new Map<string, KpiDailyEntry>();
              for (const e of prev) byDate.set(e.entry_date, e);
              const returned = new Set(fresh.map((e) => e.entry_date));
              for (const key of Array.from(byDate.keys())) {
                if (key >= bgStart && key <= bgEnd && !returned.has(key)) {
                  byDate.delete(key);
                }
              }
              for (const e of fresh) byDate.set(e.entry_date, e);
              return Array.from(byDate.values()).sort((a, b) =>
                a.entry_date.localeCompare(b.entry_date)
              );
            });
          } catch {
            /* keep fast-path data */
          }
        })();
      }
    } catch (err: unknown) {
      if (gen !== loadGen.current) return;
      setError(formatApiError(err, 'Failed to load KPI data'));
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
        setSoftUpdating(false);
      }
    }
  }, [rangeStart, rangeEnd]);

  const loadAutopopStatus = useCallback(async () => {
    try {
      const status = await apiClient.getKpiAutopopulateStatus();
      setAutopopStatus(status);
    } catch {
      setAutopopStatus({
        calendar_available: false,
        payments_available: false,
        autopopulated_columns: ['new_followers'],
      });
    }
  }, []);

  const loadFlags = useCallback(async (opts?: { hard?: boolean }) => {
    // Soft by default: keep painted flags while refreshing to avoid banner flicker.
    if (opts?.hard) setFlagsLoading(true);
    try {
      // Focus bottlenecks on the dashboard's visible end month.
      const res = await apiClient.getKpiFlags({ month: rangeEnd });
      setFlags(res.flags || []);
    } catch {
      if (opts?.hard) setFlags([]);
    } finally {
      setFlagsLoading(false);
    }
  }, [rangeEnd]);

  const forceReload = useCallback(() => {
    syncOnNextLoad.current = true;
    void loadCore().then(() => {
      void loadFlags();
    });
  }, [loadCore, loadFlags]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    // Soft refresh when the shared month changes — keep painted flags until new ones arrive.
    void loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    void loadAutopopStatus();
  }, [loadAutopopStatus]);

  const thresholds = useMemo(
    () => benchmarks?.thresholds || DEFAULT_THRESHOLDS,
    [benchmarks]
  );

  const setVisibleMonth = useCallback((year: number, month: number, compare = compareMonths) => {
    const { start, end } = applyMonthRange(year, month, compare);
    setRangeStart(start);
    setRangeEnd(end);
  }, [compareMonths]);

  const shiftMonth = (delta: number) => {
    // Always shift relative to the visible end month so compare ranges don't collapse oddly.
    const next = new Date(visibleMonth.year, visibleMonth.month + delta, 1);
    setVisibleMonth(next.getFullYear(), next.getMonth(), compareMonths);
  };

  const onCompareChange = useCallback(
    (compare: boolean) => {
      setCompareMonths(compare);
      setVisibleMonth(visibleMonth.year, visibleMonth.month, compare);
    },
    [setVisibleMonth, visibleMonth.year, visibleMonth.month]
  );

  const rangeDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCalendarVisibleRangeChange = useCallback((start: string, end: string) => {
    if (rangeDebounceRef.current) clearTimeout(rangeDebounceRef.current);
    // Short debounce collapses rapid month clicks / compare toggles into one fetch.
    rangeDebounceRef.current = setTimeout(() => {
      setRangeStart((prev) => (prev === start ? prev : start));
      setRangeEnd((prev) => (prev === end ? prev : end));
    }, 80);
  }, []);

  const setViewAndUrl = (v: ViewId) => {
    setView(v);
    if (router.isReady) {
      void router.replace(
        { pathname: '/', query: { tab: 'kpi_command_center', view: v } },
        undefined,
        { shallow: true }
      );
    }
  };

  const upsertEntry = useCallback(async (
    entryDate: string,
    data: KpiEntryUpdatePayload,
    repUserId?: string | null
  ) => {
    const updated = await apiClient.upsertKpiEntry(entryDate, data, repUserId);
    // A per-rep save doesn't belong in this org-aggregate-only entries list
    // (GET /kpi/entries excludes rep rows) — only merge in aggregate saves.
    if (!repUserId) {
      setEntries((prev) => {
        const next = [...prev];
        const idx = next.findIndex((e) => e.entry_date === entryDate);
        if (idx >= 0) next[idx] = updated;
        else next.push(updated);
        return next;
      });
    }
    void loadFlags();
    if (
      typeof window !== 'undefined' &&
      ('revenue' in data ||
        'closes' in data ||
        'calls_taken' in data ||
        'calls_booked' in data ||
        'outreach_sent' in data)
    ) {
      window.dispatchEvent(new CustomEvent(TERMINAL_CHART_REFRESH_EVENT));
    }
    return updated;
  }, [loadFlags]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            KPI Command Center
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Daily business tracker with calendar view and automated bottleneck detection.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(loading || refreshing || softUpdating) && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              {loading ? 'Loading…' : refreshing ? 'Refreshing…' : 'Updating…'}
            </span>
          )}
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {(
              [
                ['calendar', 'Calendar'],
                ['by-rep', 'By Rep'],
                ['settings', 'Benchmarks'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewAndUrl(id)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  view === id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Consolidated toolbar — month + calendar/grid live here. */}
      <div className="glass-card rounded-xl border border-white/10 px-3 py-2.5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 text-gray-800 dark:text-gray-100 text-xs"
        >
          ← Prev
        </button>
        <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-gray-800 dark:text-gray-100">
          <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Viewing
          </span>
          <div className="text-xs font-semibold leading-tight">{visibleWindowLabel}</div>
          <div className="text-[10px] text-gray-500 dark:text-gray-400">
            {rangeStart} → {rangeEnd}
          </div>
        </div>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 text-gray-800 dark:text-gray-100 text-xs"
        >
          Next →
        </button>

        {view === 'calendar' && (
          <>
            <span className="hidden sm:block w-px self-stretch bg-white/10 mx-1" aria-hidden />
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              {(
                [
                  ['calendar', 'Calendar'],
                  ['grid', 'Grid'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDataView(id)}
                  className={`px-3 py-1 text-xs font-medium ${
                    dataView === id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/5 text-gray-700 dark:text-gray-200 hover:bg-white/10'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {dataView === 'calendar' && (
              <>
                <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                  Color by
                  <select
                    className="rounded-lg solid-input px-2 py-1 text-xs"
                    value={colorMetric}
                    onChange={(e) => setColorMetric(e.target.value)}
                  >
                    {COLOR_METRICS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={compareMonths}
                    onChange={(e) => onCompareChange(e.target.checked)}
                    className="rounded"
                  />
                  Two-month compare
                </label>
              </>
            )}
          </>
        )}

        <div className="flex-1 min-w-0" />

        <button
          type="button"
          onClick={() => forceReload()}
          disabled={loading || refreshing}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-100 hover:bg-white/10 disabled:opacity-50"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => setImportOpen(true)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-100 hover:bg-white/10"
        >
          Import CSV
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200 flex flex-wrap items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => forceReload()}
            className="rounded border border-red-400/40 px-2 py-1 text-xs hover:bg-red-500/20"
          >
            Retry
          </button>
        </div>
      )}

      {view === 'settings' ? (
        <KpiBenchmarkSettings
          initial={benchmarks}
          onSaved={(b) => {
            setBenchmarks(b);
            void loadFlags();
          }}
        />
      ) : (
        <div className="flex flex-col lg:flex-row gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-4 w-full">
            {view === 'calendar' && dataView === 'calendar' && (
              <KpiCalendar
                entries={entries}
                thresholds={thresholds}
                loading={loading}
                refreshing={refreshing || softUpdating}
                onUpsertEntry={upsertEntry}
                year={visibleMonth.year}
                month={visibleMonth.month}
                compareMonths={compareMonths}
                onVisibleRangeChange={onCalendarVisibleRangeChange}
                colorMetric={colorMetric}
              />
            )}

            {view === 'calendar' && dataView === 'grid' && (
              <div className="glass-card rounded-xl border border-white/10 p-3 sm:p-4 overflow-x-auto">
                <KpiGrid
                  entries={entries}
                  rollups={rollups}
                  thresholds={thresholds}
                  autoPopulatedColumns={autopopStatus.autopopulated_columns}
                  loading={loading}
                  refreshing={refreshing || softUpdating}
                  onEntriesChange={(next) => {
                    setEntries(next);
                  }}
                  rangeStart={rangeStart}
                  rangeEnd={rangeEnd}
                />
              </div>
            )}

            {view === 'by-rep' && (
              <KpiRepPerformancePanel isActive rangeStart={rangeStart} rangeEnd={rangeEnd} />
            )}

          </div>

          <aside
            className="w-full lg:w-72 xl:w-80 shrink-0 lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
            aria-label="Issues that need attention"
          >
            <KpiFlagsBanner flags={flags} loading={flagsLoading} variant="sidebar" />
          </aside>
        </div>
      )}

      <KpiCsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(imported) => {
          setEntries((prev) => {
            const byDate = new Map(prev.map((e) => [e.entry_date, e]));
            for (const e of imported) byDate.set(e.entry_date, e);
            return Array.from(byDate.values());
          });
          void loadCore();
          void loadFlags();
        }}
      />
    </div>
  );
}
