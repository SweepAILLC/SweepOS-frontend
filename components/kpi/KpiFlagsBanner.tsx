import Link from 'next/link';
import { useMemo } from 'react';
import type { KpiFlag } from '@/types/kpi';
import type { TeamAttentionItem } from '@/components/team/TeamOverviewView';
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

const SEV_DOT: Record<KpiFlag['severity'], string> = {
  critical: 'bg-red-500',
  watch: 'bg-amber-500',
  info: 'bg-gray-400',
};

interface Props {
  flags: KpiFlag[];
  loading?: boolean;
  /** Vertical sticky column on the right of the KPI tab. */
  variant?: 'banner' | 'sidebar';
  /**
   * Organic: team accountability items (missed EODs), shown as
   * their own violet "Team" card at the top of the list. null/undefined = no sales team.
   */
  teamItems?: TeamAttentionItem[] | null;
}

/** People problems, styled apart from the metric bottleneck flags below it. */
function TeamAttentionListItem({ items }: { items: TeamAttentionItem[] }) {
  return (
    <li className="rounded-lg border border-violet-400/40 bg-violet-500/10 px-3 py-2 text-sm min-h-0 border-l-4 border-l-violet-500">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-500/20 text-violet-700 dark:text-violet-200">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3" aria-hidden>
            <path d="M7 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.5 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM1.6 15.6A5.5 5.5 0 0 1 12.4 15.6 1 1 0 0 1 11.4 17H2.6a1 1 0 0 1-1-1.4ZM14.5 11a4.5 4.5 0 0 1 4 2.4 1 1 0 0 1-.9 1.6h-3.9a7 7 0 0 0-1.5-3.4 4.5 4.5 0 0 1 2.3-.6Z" />
          </svg>
          Team
        </span>
        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">Accountability</span>
      </div>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((a) => (
            <li key={a.key} className="flex items-start gap-1.5 text-xs text-gray-800 dark:text-gray-100 leading-snug">
              <span
                className={`mt-1 inline-block h-1.5 w-1.5 rounded-full shrink-0 ${a.tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`}
                aria-hidden
              />
              {a.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-emerald-700 dark:text-emerald-300">✓ Team on track — no missed EODs.</p>
      )}
    </li>
  );
}

export default function KpiFlagsBanner({ flags, loading, variant = 'banner', teamItems = null }: Props) {
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

  const topSeverity = topFlags[0]?.severity ?? 'info';
  const isSidebar = variant === 'sidebar';

  const teamCount = teamItems?.length ?? 0;
  const issueCount = flags.length + teamCount;

  if (loading && flags.length === 0 && !teamItems) {
    return (
      <div
        className={`rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-gray-400 animate-pulse ${
          isSidebar ? 'min-h-[8rem]' : ''
        }`}
      >
        Scanning for bottlenecks…
      </div>
    );
  }

  if (!flags.length && !teamItems) {
    return (
      <div className="rounded-xl border border-green-400/20 bg-green-500/10 px-4 py-2.5 text-sm text-green-800 dark:text-green-200">
        No bottlenecks detected in the recent window. Keep logging daily metrics.
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-xl border border-white/10 bg-white/5 ${
        isSidebar ? 'flex flex-col min-h-0' : 'space-y-2'
      }`}
    >
      {loading ? (
        <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 bg-black/30 rounded px-2 py-0.5 pointer-events-none">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          Updating…
        </div>
      ) : null}

      <div
        className={`flex items-center gap-2 px-4 py-2.5 ${
          isSidebar ? 'border-b border-white/10 shrink-0' : ''
        }`}
      >
        <span
          className={`inline-block h-2 w-2 rounded-full shrink-0 ${
            flags.length ? SEV_DOT[topSeverity] : teamCount ? 'bg-violet-500' : 'bg-green-500'
          }`}
          aria-hidden
        />
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
          {issueCount ? `${issueCount} issue${issueCount === 1 ? '' : 's'} need attention` : 'Nothing needs attention'}
        </span>
      </div>

      <ul
        className={
          isSidebar
            ? 'flex flex-col gap-2 p-3 overflow-y-auto min-h-0'
            : 'grid grid-cols-2 gap-2 px-3 pb-3'
        }
      >
        {teamItems ? <TeamAttentionListItem items={teamItems} /> : null}
        {teamItems && !flags.length && !loading ? (
          <li className="rounded-lg border border-green-400/20 bg-green-500/10 px-3 py-2 text-xs text-green-800 dark:text-green-200">
            No metric bottlenecks in the recent window.
          </li>
        ) : null}
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
                : 'border-white/10 bg-white/[0.03]';
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
              <p className="text-xs text-gray-800 dark:text-gray-100 leading-snug">
                {flag.message}
              </p>
              {flag.comparison && (
                <p className="mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
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
