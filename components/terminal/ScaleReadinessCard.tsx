'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import { ratio2, usd0 } from '@/lib/scalePlanner';
import type { ScaleReadinessResponse, ScaleVerdict } from '@/types/businessEconomics';

/**
 * Terminal sidebar: one-line Scale Planner verdict for owners/admins (bulk / hold / cut,
 * runway, recommended daily spend). Renders nothing for members (403) or orgs with no
 * paid spend yet. Click opens Funnels → Scale Planner.
 */

const STYLE: Record<ScaleVerdict, { label: string; dot: string }> = {
  bulk: { label: 'Bulk month', dot: 'bg-emerald-500' },
  hold: { label: 'Hold spend', dot: 'bg-sky-500' },
  cut: { label: 'Cut month', dot: 'bg-red-500' },
  unknown: { label: 'Not enough data', dot: 'bg-gray-400' },
};

export default function ScaleReadinessCard() {
  const router = useRouter();
  const [data, setData] = useState<ScaleReadinessResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getScaleReadiness()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data || data.trailing.weeks_with_spend === 0) return null;
  const r = data.readiness;
  const s = STYLE[r.verdict];

  return (
    <button
      type="button"
      onClick={() => void router.push({ pathname: '/', query: { tab: 'funnels', funnelView: 'planner' } })}
      className="glass-card w-full p-4 min-w-0 text-left hover:bg-white/5 transition-colors"
      title="Open the Scale Planner"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Scale readiness</h3>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">Last 4 weeks · paid</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${s.dot}`} aria-hidden />
        <span className="text-base font-bold text-gray-900 dark:text-white">{s.label}</span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div className="min-w-0">
          <dt className="text-gray-500 dark:text-gray-400">ROAS / break-even</dt>
          <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100 truncate">
            {ratio2(r.current_roas)} / {ratio2(r.breakeven_roas)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-gray-500 dark:text-gray-400">Runway</dt>
          <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">
            {r.runway_months != null ? `${r.runway_months} mo` : '—'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-gray-500 dark:text-gray-400">Suggested</dt>
          <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100 truncate">
            {r.recommended_daily_spend != null ? `${usd0(r.recommended_daily_spend)}/day` : '—'}
          </dd>
        </div>
      </dl>
      {!data.configured ? (
        <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">Add your business numbers in the Scale Planner for a real verdict.</p>
      ) : null}
    </button>
  );
}
