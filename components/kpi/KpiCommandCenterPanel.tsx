import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
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
import KpiCalendar from './KpiCalendar';
import KpiBenchmarkSettings from './KpiBenchmarkSettings';
import KpiFlagsBanner from './KpiFlagsBanner';
import KpiCsvImportModal from './KpiCsvImportModal';

type ViewId = 'grid' | 'calendar' | 'settings';

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
  const loadGen = React.useRef(0);
  const hasLoadedOnce = React.useRef(false);
  const syncOnNextLoad = React.useRef(true);

  const [rangeStart, setRangeStart] = useState(() => toYmd(startOfMonth(new Date())));
  const [rangeEnd, setRangeEnd] = useState(() => toYmd(endOfMonth(new Date())));

  // Deep-link: /?tab=kpi_command_center&view=settings|calendar|grid
  useEffect(() => {
    if (!router.isReady) return;
    const v = router.query.view;
    if (v === 'settings' || v === 'calendar' || v === 'grid') {
      setView(v);
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
      const res = await apiClient.getKpiFlags();
      setFlags(res.flags || []);
    } catch {
      if (opts?.hard) setFlags([]);
    } finally {
      setFlagsLoading(false);
    }
  }, []);

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
    void loadFlags({ hard: true });
  }, [loadFlags]);

  useEffect(() => {
    void loadAutopopStatus();
  }, [loadAutopopStatus]);

  const thresholds = useMemo(
    () => benchmarks?.thresholds || DEFAULT_THRESHOLDS,
    [benchmarks]
  );

  const shiftMonth = (delta: number) => {
    // Always shift relative to the visible end month so compare ranges don't collapse oddly.
    const base = new Date(rangeEnd + 'T12:00:00');
    const next = new Date(base.getFullYear(), base.getMonth() + delta, 1);
    setRangeStart(toYmd(startOfMonth(next)));
    setRangeEnd(toYmd(endOfMonth(next)));
  };

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

  const upsertEntry = useCallback(async (entryDate: string, data: KpiEntryUpdatePayload) => {
    const updated = await apiClient.upsertKpiEntry(entryDate, data);
    setEntries((prev) => {
      const next = [...prev];
      const idx = next.findIndex((e) => e.entry_date === entryDate);
      if (idx >= 0) next[idx] = updated;
      else next.push(updated);
      return next;
    });
    void loadFlags();
    return updated;
  }, [loadFlags]);

  return (
    <div className="w-full space-y-5">
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
          <div className="flex rounded-lg border border-white/10 overflow-hidden">
            {(
              [
                ['grid', 'Grid'],
                ['calendar', 'Calendar'],
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

      <KpiFlagsBanner flags={flags} loading={flagsLoading} />

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

      {/* Grid owns this range bar; calendar has its own month nav + compare (avoids fighting ranges). */}
      {view === 'grid' && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5"
          >
            ← Prev month
          </button>
          <span className="text-gray-600 dark:text-gray-300 font-medium px-2">
            {rangeStart} → {rangeEnd}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5"
          >
            Next month →
          </button>
          <button
            type="button"
            onClick={() => {
              const n = new Date();
              setRangeStart(toYmd(startOfMonth(n)));
              setRangeEnd(toYmd(endOfMonth(n)));
            }}
            className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5"
          >
            This month
          </button>
          <label className="ml-2 text-gray-500 flex items-center gap-1">
            From
            <input
              type="date"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
              className="rounded border border-white/10 bg-white/5 px-1 py-0.5"
            />
          </label>
          <label className="text-gray-500 flex items-center gap-1">
            To
            <input
              type="date"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
              className="rounded border border-white/10 bg-white/5 px-1 py-0.5"
            />
          </label>
        </div>
      )}

      {view === 'grid' && (
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
      )}

      {view === 'calendar' && (
        <KpiCalendar
          entries={entries}
          thresholds={thresholds}
          loading={loading}
          refreshing={refreshing || softUpdating}
          onUpsertEntry={upsertEntry}
          onVisibleRangeChange={onCalendarVisibleRangeChange}
        />
      )}

      {view === 'settings' && (
        <KpiBenchmarkSettings
          initial={benchmarks}
          onSaved={(b) => {
            setBenchmarks(b);
            void loadFlags();
          }}
        />
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
