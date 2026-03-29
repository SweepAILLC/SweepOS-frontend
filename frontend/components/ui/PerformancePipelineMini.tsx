'use client';

import { useMemo } from 'react';

export type PipelineStripSegment = { id: string; title: string; count: number };

export interface PerformancePipelineMiniProps {
  segments: PipelineStripSegment[];
  totalClients: number;
}

function buildPathD(heightsPct: number[]): string {
  const CENTER = 50;
  const MAX_AMP = 40;
  const xs = [0, 20, 40, 60, 80, 100];
  const dx = 20 / 3;
  const a = heightsPct.map((h) => (h / 100) * MAX_AMP);
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
}

/**
 * Read-only mini pipeline snapshot for Performance (uses server lifecycle counts — no client list fetch).
 */
export default function PerformancePipelineMini({ segments, totalClients }: PerformancePipelineMiniProps) {
  const maxCount = useMemo(() => Math.max(...segments.map((s) => s.count), 1), [segments]);
  const displayHeights = useMemo(
    () =>
      segments.map((col) => {
        if (col.count === 0) return 0;
        return maxCount > 0 ? (col.count / maxCount) * 100 : 0;
      }),
    [segments, maxCount]
  );
  const pathD = useMemo(() => buildPathD(displayHeights), [displayHeights]);

  if (segments.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200/60 dark:border-gray-700/60">
      <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
        Pipeline snapshot
      </p>
      <div className="flex gap-0 mb-1">
        {segments.map((column) => (
          <div
            key={column.id}
            className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0 py-0.5 px-0.5"
            title={`${column.title}: ${column.count}`}
          >
            <span className="text-[9px] sm:text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate w-full text-center">
              {column.title}
            </span>
            <span className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100">{column.count}</span>
          </div>
        ))}
      </div>
      <div className="relative overflow-hidden rounded-lg border border-gray-200/80 dark:border-white/15 h-16 sm:h-[4.5rem] bg-gray-100/80 dark:bg-gray-800/40">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="perfPipelineGrad" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
              <stop offset="0%" stopColor="#93c5fd" stopOpacity="1" />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d={pathD} fill="url(#perfPipelineGrad)" />
        </svg>
      </div>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
        {totalClients} client{totalClients === 1 ? '' : 's'} total
      </p>
    </div>
  );
}
