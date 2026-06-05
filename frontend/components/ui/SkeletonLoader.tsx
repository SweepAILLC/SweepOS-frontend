interface SkeletonLoaderProps {
  className?: string;
  lines?: number;
  height?: string;
  width?: string;
}

export function SkeletonLoader({ 
  className = '', 
  lines = 1, 
  height = 'h-4',
  width = 'w-full'
}: SkeletonLoaderProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`premium-shimmer relative overflow-hidden rounded ${height} ${width} bg-gray-200/80 dark:bg-white/[0.06]`}
        />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="glass-card p-6 rounded-lg premium-skeleton-enter space-y-3">
      <div className="premium-shimmer h-4 w-3/4 rounded bg-gray-200/80 dark:bg-white/[0.06]" />
      <div className="premium-shimmer h-4 w-full rounded bg-gray-200/80 dark:bg-white/[0.06]" />
      <div className="premium-shimmer h-4 w-5/6 rounded bg-gray-200/80 dark:bg-white/[0.06]" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="glass-card rounded-lg overflow-hidden">
      <div className="p-4 border-b border-gray-200 dark:border-white/10">
        <div className="premium-shimmer h-4 w-1/4 rounded bg-gray-200/80 dark:bg-white/[0.06]" />
      </div>
      <div className="divide-y divide-gray-200 dark:divide-white/10">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="premium-skeleton-enter p-4 flex space-x-4"
            style={{ animationDelay: `${i * 45}ms` }}
          >
            <div className="premium-shimmer h-4 flex-1 rounded bg-gray-200/80 dark:bg-white/[0.06]" />
            <div className="premium-shimmer h-4 w-24 rounded bg-gray-200/80 dark:bg-white/[0.06]" />
            <div className="premium-shimmer h-4 w-32 rounded bg-gray-200/80 dark:bg-white/[0.06]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex-shrink-0 w-64 premium-skeleton-enter" style={{ animationDelay: `${i * 100}ms` }}>
          <div className="glass-card p-4 min-h-[400px] space-y-3">
            <div className="premium-shimmer h-6 w-32 rounded bg-gray-200/80 dark:bg-white/[0.06]" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="premium-shimmer h-24 rounded bg-gray-200/80 dark:bg-white/[0.06]" />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


