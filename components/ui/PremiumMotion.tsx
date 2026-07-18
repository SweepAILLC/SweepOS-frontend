'use client';

import type { CSSProperties, ReactNode } from 'react';

interface PremiumRevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms */
  delayMs?: number;
  /** Skip entrance when false (e.g. silent refresh) */
  animate?: boolean;
}

export function PremiumReveal({
  children,
  className = '',
  delayMs = 0,
  animate = true,
}: PremiumRevealProps) {
  if (!animate) {
    return <div className={className}>{children}</div>;
  }
  return (
    <div
      className={`premium-reveal ${className}`}
      style={{ animationDelay: `${delayMs}ms` } as CSSProperties}
    >
      {children}
    </div>
  );
}

interface PremiumContentGateProps {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
  /** When false, skip the outer fade-in (e.g. chart has its own reveal). */
  animate?: boolean;
}

/** Crossfade from skeleton → content on first load. */
export function PremiumContentGate({
  loading,
  skeleton,
  children,
  className = '',
  animate = true,
}: PremiumContentGateProps) {
  if (loading) {
    return <div className={`premium-skeleton-enter ${className}`}>{skeleton}</div>;
  }
  if (!animate) {
    return <div className={className}>{children}</div>;
  }
  return <div className={`premium-reveal ${className}`}>{children}</div>;
}

export function ShimmerBlock({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`premium-shimmer relative overflow-hidden rounded-md bg-gray-200/80 dark:bg-white/[0.06] ${className}`}
      style={style}
    />
  );
}

const CHART_BAR_HEIGHTS = [38, 52, 28, 64, 44, 72, 36, 58, 42, 68, 34, 50];

export function ChartSkeleton({ height = 400 }: { height?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-white/10 bg-black/[0.02] dark:bg-white/[0.02]"
      style={{ height }}
      aria-hidden
    >
      <div className="absolute inset-x-0 bottom-8 top-6 flex items-end gap-1 px-3 sm:gap-1.5 sm:px-4">
        {CHART_BAR_HEIGHTS.map((h, i) => (
          <ShimmerBlock
            key={i}
            className="flex-1 rounded-t-sm opacity-90"
            style={{
              height: `${h}%`,
              animationDelay: `${i * 90}ms`,
            }}
          />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-between px-4 pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <ShimmerBlock key={i} className="h-2 w-8 rounded-full opacity-60" />
        ))}
      </div>
      <div className="absolute left-3 top-1/2 flex h-[55%] -translate-y-1/2 flex-col justify-between">
        {Array.from({ length: 5 }).map((_, i) => (
          <ShimmerBlock key={i} className="h-1.5 w-6 rounded-full opacity-50" />
        ))}
      </div>
      <div className="premium-scanline pointer-events-none absolute inset-0 opacity-40" />
    </div>
  );
}

export function PieChartSkeleton({ height = 220 }: { height?: number }) {
  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-lg"
      style={{ height }}
      aria-hidden
    >
      <div className="premium-shimmer relative h-[140px] w-[140px] rounded-full bg-gray-200/80 dark:bg-white/[0.06] ring-[18px] ring-gray-100/80 dark:ring-white/[0.04] ring-inset" />
      <div className="premium-scanline pointer-events-none absolute inset-0 opacity-35" />
    </div>
  );
}

export function KpiGridSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 landscape:grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1.5 sm:gap-2 min-w-0">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="premium-skeleton-enter bg-gray-50 dark:bg-gray-700/50 rounded-md px-2 py-2 sm:px-2.5 sm:py-2 space-y-2"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <ShimmerBlock className="h-5 w-16" />
          <ShimmerBlock className="h-3 w-full max-w-[5.5rem]" />
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="premium-skeleton-enter rounded-lg border border-white/10 p-3 space-y-2"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <ShimmerBlock className="h-3.5 w-2/3" />
          <ShimmerBlock className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeletonPremium({
  rows = 6,
  columns = 6,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg min-w-0" aria-hidden>
      <div className="flex gap-3 border-b border-white/10 px-3 py-2.5">
        {Array.from({ length: columns }).map((_, i) => (
          <ShimmerBlock key={i} className="h-3 flex-1 max-w-[4.5rem]" />
        ))}
      </div>
      <div className="divide-y divide-white/10">
        {Array.from({ length: rows }).map((_, row) => (
          <div
            key={row}
            className="premium-skeleton-enter flex gap-3 px-3 py-3"
            style={{ animationDelay: `${row * 50}ms` }}
          >
            {Array.from({ length: columns }).map((_, col) => (
              <ShimmerBlock
                key={col}
                className={`h-3.5 flex-1 ${col === 0 ? 'max-w-[8rem]' : 'max-w-[5rem]'}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingPulseLabel({ label = 'Synchronizing…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-6">
      <div className="premium-pulse-ring h-8 w-8 rounded-full border border-indigo-400/40" />
      <p className="digitized-text text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
