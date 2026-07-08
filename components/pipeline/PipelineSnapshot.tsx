import { useState, useEffect, useMemo, useRef, useId, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import { TERMINAL_CLIENTS_UPDATED_EVENT } from '@/lib/cache';
import { buildPipelineFunnelPath } from '@/lib/pipelineFunnel';
import { PIPELINE_COLUMNS, withNormalizedLifecycle } from '@/lib/pipelineColumns';
import {
  getPipelineClients,
  hydratePipelineStoreFromCache,
  pipelineCountsFromClients,
  setPipelineClients,
  subscribePipelineClients,
} from '@/lib/pipelineStore';
import { ORG_CHANGED_EVENT, orgIdFromAccessToken } from '@/lib/orgScope';
import type { Client } from '@/types/client';

interface PipelineSnapshotProps {
  onFilterChange: (column: string | null) => void;
  onLoadComplete?: () => void;
  /** Controlled filter — stays in sync with the board after refresh / tab switch. */
  activeFilter?: string | null;
  isActive?: boolean;
  /** Override footer hint (e.g. when embedded in Terminal priorities). */
  footerHint?: string;
}

const COLUMNS = PIPELINE_COLUMNS.map(({ id, shortTitle }) => ({ id, title: shortTitle }));

const SEGMENT_COUNT = COLUMNS.length;
const SEGMENT_WIDTH = 100 / SEGMENT_COUNT;

function hydrateSnapshotCounts(): Record<string, number> {
  hydratePipelineStoreFromCache();
  return pipelineCountsFromClients(getPipelineClients());
}

const DEFAULT_FOOTER_HINT =
  'Click a stage to filter the board below. Click again to clear.';

export default function PipelineSnapshot({
  onFilterChange,
  onLoadComplete,
  activeFilter = null,
  isActive = true,
  footerHint = DEFAULT_FOOTER_HINT,
}: PipelineSnapshotProps) {
  const gradientId = `funnelGrad-${useId().replace(/:/g, '')}`;
  const [counts, setCounts] = useState<Record<string, number>>(hydrateSnapshotCounts);
  const hasCalledOnLoadComplete = useRef(false);
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const orgIdRef = useRef(orgIdFromAccessToken());

  const syncCountsFromStore = useCallback(() => {
    setCounts(hydrateSnapshotCounts());
  }, []);

  const ensurePipelineClients = useCallback(async (forceRefresh = false) => {
    const currentOrg = orgIdFromAccessToken();
    if (orgIdRef.current !== currentOrg) {
      orgIdRef.current = currentOrg;
      forceRefresh = true;
    }
    hydratePipelineStoreFromCache();
    if (!forceRefresh && getPipelineClients().length > 0) {
      syncCountsFromStore();
      return;
    }
    if (loadInFlightRef.current) {
      await loadInFlightRef.current;
      syncCountsFromStore();
      return;
    }
    const run = (async () => {
      try {
        const data = await apiClient.getClients(undefined, forceRefresh);
        const normalized = (Array.isArray(data) ? data : []).map((row) =>
          withNormalizedLifecycle(row as Client)
        );
        if (normalized.length > 0) setPipelineClients(normalized);
      } catch {
        /* keep cache/store counts */
      } finally {
        syncCountsFromStore();
      }
    })();
    loadInFlightRef.current = run;
    try {
      await run;
    } finally {
      loadInFlightRef.current = null;
    }
  }, [syncCountsFromStore]);

  useEffect(() => {
    syncCountsFromStore();
    return subscribePipelineClients(syncCountsFromStore);
  }, [syncCountsFromStore]);

  useEffect(() => {
    if (!isActive) return;
    void ensurePipelineClients();
  }, [isActive, ensurePipelineClients]);

  useEffect(() => {
    const onOrgChanged = () => {
      orgIdRef.current = orgIdFromAccessToken();
      void ensurePipelineClients(true);
    };
    window.addEventListener(ORG_CHANGED_EVENT, onOrgChanged);
    return () => window.removeEventListener(ORG_CHANGED_EVENT, onOrgChanged);
  }, [ensurePipelineClients]);

  useEffect(() => {
    const onClientsUpdated = () => syncCountsFromStore();
    window.addEventListener(TERMINAL_CLIENTS_UPDATED_EVENT, onClientsUpdated);
    return () => window.removeEventListener(TERMINAL_CLIENTS_UPDATED_EVENT, onClientsUpdated);
  }, [syncCountsFromStore]);

  useEffect(() => {
    if (!hasCalledOnLoadComplete.current && onLoadComplete) {
      hasCalledOnLoadComplete.current = true;
      onLoadComplete();
    }
  }, [onLoadComplete]);

  const maxCount = useMemo(() => Math.max(...Object.values(counts), 1), [counts]);

  const displayHeights = useMemo(() => {
    return COLUMNS.map((col) => {
      const count = counts[col.id] || 0;
      if (count === 0) return 0;
      return maxCount > 0 ? (count / maxCount) * 100 : 0;
    });
  }, [counts, maxCount]);

  const handleSegmentClick = (columnId: string) => {
    if (activeFilter === columnId) {
      onFilterChange(null);
    } else {
      onFilterChange(columnId);
    }
  };

  const biggestDrop = useMemo(() => {
    let maxDropPct = 0;
    let fromTitle = '';
    let toTitle = '';
    for (let i = 0; i < COLUMNS.length - 1; i++) {
      const fromCount = counts[COLUMNS[i].id] || 0;
      const toCount = counts[COLUMNS[i + 1].id] || 0;
      if (fromCount > 0) {
        const dropPct = ((fromCount - toCount) / fromCount) * 100;
        if (dropPct > maxDropPct) {
          maxDropPct = dropPct;
          fromTitle = COLUMNS[i].title;
          toTitle = COLUMNS[i + 1].title;
        }
      }
    }
    return maxDropPct > 0 ? { fromTitle, toTitle, pct: Math.round(maxDropPct) } : null;
  }, [counts]);

  const pathD = useMemo(() => buildPipelineFunnelPath(displayHeights), [displayHeights]);

  return (
    <div className="glass-card p-3 sm:p-4 min-w-0 max-w-full overflow-hidden premium-reveal">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 digitized-text">
        Pipeline Snapshot
      </h3>

      <div className="flex gap-0 mb-1 min-w-0 overflow-x-auto">
        {COLUMNS.map((column) => {
          const count = counts[column.id] || 0;
          const isActive = activeFilter === column.id;
          return (
            <button
              key={column.id}
              type="button"
              onClick={() => handleSegmentClick(column.id)}
              className={`flex-1 min-w-[3.25rem] flex flex-col items-center justify-center gap-0 py-1 px-0.5 rounded-t-lg transition-colors touch-manipulation ${
                !isActive ? 'hover:bg-black/5 dark:hover:bg-white/10' : ''
              }`}
              style={{
                ...(isActive
                  ? { backgroundColor: 'rgba(59, 130, 246, 0.2)', boxShadow: 'inset 0 0 0 1px rgb(96 165 250)' }
                  : {}),
              }}
              title={`${column.title}: ${count}. Click to filter board.`}
            >
              <span className="text-[9px] sm:text-[10px] font-medium text-gray-600 dark:text-gray-400 truncate w-full text-center">
                {column.title}
              </span>
              <span className="text-sm sm:text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate w-full min-w-0 text-center">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative overflow-hidden rounded-b-xl rounded-t border border-gray-300 dark:border-white/20 shadow-inner h-28 sm:h-32 bg-gray-100 dark:bg-gray-800/50">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
              <stop offset="0%" stopColor="#93c5fd" stopOpacity="1" />
              <stop offset="25%" stopColor="#60a5fa" stopOpacity="1" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
              <stop offset="75%" stopColor="#2563eb" stopOpacity="1" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d={pathD} fill={`url(#${gradientId})`} className="transition-none" />
        </svg>
        {COLUMNS.map((column, index) => {
          const isActive = activeFilter === column.id;
          return (
            <button
              key={column.id}
              type="button"
              onClick={() => handleSegmentClick(column.id)}
              className="absolute inset-0 transition-colors touch-manipulation cursor-pointer"
              style={{
                left: `${index * SEGMENT_WIDTH}%`,
                width: `${SEGMENT_WIDTH}%`,
                backgroundColor: isActive ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!activeFilter) e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
              }}
              onMouseLeave={(e) => {
                if (activeFilter !== column.id) e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title={`${column.title}: ${counts[column.id] ?? 0}. Click to filter.`}
            />
          );
        })}
      </div>

      {biggestDrop && (
        <div className="mt-3 flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400 min-w-0">
          <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
          <span className="min-w-0 break-words">
            Biggest drop:{' '}
            <strong>
              {biggestDrop.fromTitle} → {biggestDrop.toTitle}
            </strong>{' '}
            ({biggestDrop.pct}%)
          </span>
        </div>
      )}

      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-2">{footerHint}</p>
    </div>
  );
}
