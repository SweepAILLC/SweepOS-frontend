import Link from 'next/link';
import type { KpiFlag } from '@/types/kpi';
import {
  KPI_RELATED_FEATURE_HREF,
  KPI_RELATED_FEATURE_LABEL,
  kpiTierBadgeClass,
} from '@/lib/kpiBenchmarks';

interface Props {
  flags: KpiFlag[];
  loading?: boolean;
}

export default function KpiFlagsBanner({ flags, loading }: Props) {
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
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Bottleneck flags ({flags.length})
        </h3>
      </div>
      <ul className="space-y-2">
        {flags.map((flag) => {
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
              className={`rounded-xl border px-4 py-3 text-sm ${border}`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${kpiTierBadgeClass(flag.tier)}`}>
                  {flag.tier}
                </span>
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                  {flag.stage}
                </span>
                <span className="text-xs text-gray-400">· {flag.metric}</span>
                {flag.severity === 'critical' && (
                  <span className="text-xs font-semibold text-red-600 dark:text-red-300 uppercase tracking-wide">
                    Critical
                  </span>
                )}
              </div>
              <p className="text-gray-800 dark:text-gray-100 leading-relaxed">{flag.message}</p>
              {flag.comparison && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Comparison: {flag.comparison}
                </p>
              )}
              {href && label && (
                <Link
                  href={href}
                  className="inline-flex mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:underline"
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
