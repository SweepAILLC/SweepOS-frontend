import { useState, useEffect, useMemo, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { Client } from '@/types/client';
import { TERMINAL_CLIENTS_UPDATED_EVENT } from '@/lib/cache';

interface PipelineSnapshotProps {
  onFilterChange: (column: string | null) => void;
  onLoadComplete?: () => void;
}

const COLUMNS = [
  { id: 'cold_lead', title: 'Cold' },
  { id: 'warm_lead', title: 'Warm' },
  { id: 'active', title: 'Active' },
  { id: 'offboarding', title: 'Offboarding' },
  { id: 'dead', title: 'Dead' },
] as const;

const SEGMENT_COUNT = COLUMNS.length;
const SEGMENT_WIDTH = 100 / SEGMENT_COUNT; // equal segments

// Lerp and ease for smooth animation
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

export default function PipelineSnapshot({ onFilterChange, onLoadComplete }: PipelineSnapshotProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const hasCalledOnLoadComplete = useRef(false);
  const [displayHeights, setDisplayHeights] = useState<number[]>([28, 28, 28, 28, 28]);
  const animRef = useRef<number | null>(null);
  const displayHeightsRef = useRef(displayHeights);
  displayHeightsRef.current = displayHeights;

  useEffect(() => {
    loadClients();
  }, []);

  // Live update when client board changes (move, create, delete, drawer save)
  useEffect(() => {
    const handleClientsUpdated = () => loadClients();
    window.addEventListener(TERMINAL_CLIENTS_UPDATED_EVENT, handleClientsUpdated);
    return () => window.removeEventListener(TERMINAL_CLIENTS_UPDATED_EVENT, handleClientsUpdated);
  }, []);

  const loadClients = async () => {
    try {
      const data = await apiClient.getClients();
      setClients(data);
    } catch (error) {
      console.error('Failed to load clients:', error);
    } finally {
      setLoading(false);
      if (!hasCalledOnLoadComplete.current && onLoadComplete) {
        hasCalledOnLoadComplete.current = true;
        onLoadComplete();
      }
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      cold_lead: 0,
      warm_lead: 0,
      active: 0,
      offboarding: 0,
      dead: 0,
    };
    clients.forEach((client) => {
      c[client.lifecycle_state] = (c[client.lifecycle_state] || 0) + 1;
    });
    return c;
  }, [clients]);

  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + b, 0), [counts]);
  const maxCount = useMemo(() => Math.max(...Object.values(counts), 1), [counts]);

  const targetHeightPcts = useMemo(() => {
    return COLUMNS.map((col) => {
      const count = counts[col.id] || 0;
      if (count === 0) return 0;
      return maxCount > 0 ? (count / maxCount) * 100 : 0;
    });
  }, [counts, maxCount]);

  // Animate displayHeights toward targetHeightPcts for smooth shrink/grow
  useEffect(() => {
    const duration = 400;
    const startHeights = [...displayHeightsRef.current];
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(t);
      setDisplayHeights(
        targetHeightPcts.map((target, i) => lerp(startHeights[i], target, eased))
      );
      if (t < 1) animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    };
  }, [targetHeightPcts]);

  const handleSegmentClick = (columnId: string) => {
    if (activeFilter === columnId) {
      setActiveFilter(null);
      onFilterChange(null);
    } else {
      setActiveFilter(columnId);
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

  // Symmetrical horizontal band: centerline y=50, amplitude (distance to top/bottom) = f(count), smooth curves
  const pathD = useMemo(() => {
    const CENTER = 50;
    const MAX_AMP = 45; // max distance from center to top/bottom (stays inside 0–100)
    const xs = [0, 20, 40, 60, 80, 100];
    const dx = 20 / 3;
    const a = displayHeights.map((h) => (h / 100) * MAX_AMP); // 0 count → 0 amplitude → no line
    const a5 = a[4];

    let d = `M 0 ${CENTER - a[0]}`;
    for (let i = 0; i < 5; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      const a0 = a[i];
      const a1 = i + 1 < 5 ? a[i + 1] : a5;
      d += ` C ${x0 + dx} ${CENTER - a0} ${x1 - dx} ${CENTER - a1} ${x1} ${CENTER - a1}`;
    }
    d += ` L 100 ${CENTER + a5}`;
    for (let i = 4; i >= 0; i--) {
      const x1 = xs[i + 1];
      const x0 = xs[i];
      const a1 = i + 1 < 5 ? a[i + 1] : a5;
      const a0 = a[i];
      d += ` C ${x1 - dx} ${CENTER + a1} ${x0 + dx} ${CENTER + a0} ${x0} ${CENTER + a0}`;
    }
    d += ' Z';
    return d;
  }, [displayHeights]);

  if (loading) {
    return (
      <div className="glass-card p-4 min-w-0 max-w-full overflow-hidden">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading pipeline snapshot...</p>
      </div>
    );
  }

  return (
    <div className="glass-card p-3 sm:p-4 min-w-0 max-w-full overflow-hidden">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 digitized-text">
        Pipeline Snapshot
      </h3>

      {/* Top row: equal-width columns, labels + counts */}
      <div className="flex gap-0 mb-1 min-w-0">
        {COLUMNS.map((column) => {
          const count = counts[column.id] || 0;
          const isActive = activeFilter === column.id;
          return (
            <button
              key={column.id}
              type="button"
              onClick={() => handleSegmentClick(column.id)}
              className={`flex-1 min-w-0 flex flex-col items-center justify-center gap-0 py-1 px-0.5 rounded-t-lg transition-colors touch-manipulation ${
                !isActive ? 'hover:bg-black/5 dark:hover:bg-white/10' : ''
              }`}
              style={{
                ...(isActive
                  ? { backgroundColor: 'rgba(59, 130, 246, 0.2)', boxShadow: 'inset 0 0 0 1px rgb(96 165 250)' }
                  : {}),
              }}
              title={`${column.title}: ${count}. Click to filter board.`}
            >
              <span className="text-[10px] sm:text-xs font-medium text-gray-600 dark:text-gray-400 truncate w-full text-center">
                {column.title}
              </span>
              <span className="text-base sm:text-xl font-bold text-gray-900 dark:text-gray-100 tabular-nums truncate w-full min-w-0 text-center">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Single funnel entity: one SVG path with gradient, equal segments by x, heights drive shape */}
      <div className="relative overflow-hidden rounded-b-xl rounded-t border border-gray-300 dark:border-white/20 shadow-inner h-24 sm:h-28 bg-gray-100 dark:bg-gray-800/50">
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="funnelGrad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
              <stop offset="0%" stopColor="#93c5fd" stopOpacity="1" />
              <stop offset="25%" stopColor="#60a5fa" stopOpacity="1" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
              <stop offset="75%" stopColor="#2563eb" stopOpacity="1" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d={pathD} fill="url(#funnelGrad)" className="transition-none" />
        </svg>
        {/* Invisible hit areas: equal segments */}
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
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <span className="min-w-0 break-words">
            Biggest drop: <strong>{biggestDrop.fromTitle} → {biggestDrop.toTitle}</strong> ({biggestDrop.pct}%)
          </span>
        </div>
      )}

      <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-2">
        Click a stage to filter the board below. Click again to clear.
      </p>
    </div>
  );
}
