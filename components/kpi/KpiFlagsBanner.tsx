import Link from 'next/link';
import { useMemo } from 'react';
import type { KpiFlag } from '@/types/kpi';
import {
  KPI_RELATED_FEATURE_HREF,
  KPI_RELATED_FEATURE_LABEL,
  kpiTierBadgeClass,
} from '@/lib/kpiBenchmarks';

const TOP_FLAGS = 6;

const SEV_RANK: Record<KpiFlag['severity'], number> = {
  critical: 0,
  watch: 1,
  info: 2,
};

interface Props {
  flags: KpiFlag[];
  loading?: boolean;
}

export default function KpiFlagsBanner({ flags, loading }: Props) {
  const topFlags = useMemo(() => {
    const sorted = [...flags].sort((a, b) => {
      const sev = (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9);
      if (sev !== 0) return sev;
      const stage = a.stage.localeCompare(b.stage);
      if (stage !== 0) return stage;
      return a.metric.localeCompare(b.metric);
    });
    return sorted.slice(0, TOP_FLAGS);
  }, [flags]);

  // Soft load: only blank the banner on the very first scan (no flags yet).
  if (loading && flags.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-400 animate-pulse">
        Scanning for bottlenecks…
      </div>
    );
  }

  if (!flags.length) {
    return (
      <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-4 py-3 text-sm text-green-800 dark:text-green-200">
        No bottlenecks detected in the recent window. Keep logging daily metrics.
      </div>
    );
  }

  return (
    <div className="space-y-2 relative">
      {loading ? (
        <div className="absolute top-0 right-0 z-10 inline-flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 bg-black/30 rounded px-2 py-0.5 pointer-events-none">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Updating insights…
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Top bottlenecks
          <span className="ml-1.5 font-normal text-gray-500 dark:text-gray-400">
            ({topFlags.length}
            {flags.length > TOP_FLAGS ? ` of ${flags.length}` : ''})
          </span>
        </h3>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {topFlags.map((flag) => {
          const href = flag.related_feature
            ? KPI_RELATED_FEATURE_HREF[flag.related_feature]
            : null;
          const label = flag.related_feature
            ? KPI_RELATED_FEATURE_LABEL[flag.related_feature]
            : null;
          const border =
            flag.severity === 'critical'
              ? 'border-red-400/30 bg-red-500/10'
              : flag.severity === 'watch'
                ? 'border-amber-400/30 bg-amber-500/10'
                : 'border-white/10 bg-white/5';
          return (
            <li
              key={flag.id}
              className={`rounded-lg border px-3 py-2 text-sm min-h-0 ${border}`}
            >
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                <span
                  className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${kpiTierBadgeClass(flag.tier)}`}
                >
                  {flag.tier}
                </span>
                <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300 truncate">
                  {flag.stage}
                </span>
                <span className="text-[11px] text-gray-400 truncate">· {flag.metric}</span>
                {flag.severity === 'critical' && (
                  <span className="text-[10px] font-semibold text-red-600 dark:text-red-300 uppercase tracking-wide">
                    Critical
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-800 dark:text-gray-100 leading-snug line-clamp-2">
                {flag.message}
              </p>
              {flag.comparison && (
                <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400 line-clamp-1">
                  {flag.comparison}
                </p>
              )}
              {href && label && (
                <Link
                  href={href}
                  className="inline-flex mt-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
                >
                  Open {label} →
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
