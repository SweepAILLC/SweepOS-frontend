import { useEffect, useState } from 'react';
import type { KpiRevenueContributorsResponse } from '@/types/kpi';
import { apiClient } from '@/lib/api';
import { formatKpiValue } from '@/lib/kpiBenchmarks';
import { formatApiError } from '@/lib/apiError';

function sourceLabel(source: string): string {
  if (source === 'stripe') return 'Stripe';
  if (source === 'whop') return 'Whop';
  return 'Manual';
}

interface Props {
  entryDate: string;
  onClose: () => void;
}

/** Small popover-style modal listing which clients' payments made up a day's cash_collected. */
export default function KpiRevenueContributorsModal({ entryDate, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<KpiRevenueContributorsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient
      .getKpiRevenueContributors(entryDate)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err, 'Could not load contributors'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryDate]);

  return (
    <div className="fixed inset-y-0 right-0 left-0 lg:left-[var(--app-sidebar-width,14rem)] z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-500/75 dark:bg-gray-900/75" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-4 max-h-[70vh] overflow-auto">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Revenue contributors — {entryDate}
          </h4>
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {loading && <p className="text-xs text-gray-500 dark:text-gray-400">Loading…</p>}
        {!loading && error && <p className="text-xs text-red-500">{error}</p>}
        {!loading && !error && data && data.contributors.length === 0 && (
          <p className="text-xs text-gray-500">
            No itemized contributors for this day — cash_collected may have been entered
            manually without a linked payment.
          </p>
        )}
        {!loading && !error && data && data.contributors.length > 0 && (
          <ul className="space-y-1.5 text-xs">
            {data.contributors.map((c) => (
              <li
                key={c.payment_id}
                className="flex items-center justify-between gap-2 border-b border-gray-200 dark:border-white/5 pb-1.5 last:border-0"
              >
                <span className="truncate text-gray-800 dark:text-gray-100">{c.client_name}</span>
                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-white/10 text-gray-500 dark:text-gray-400">
                  {sourceLabel(c.source)}
                </span>
                <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">
                  {formatKpiValue(c.amount_cents / 100, 'currency')}
                </span>
              </li>
            ))}
            <li className="flex items-center justify-between pt-1.5 font-semibold text-gray-900 dark:text-gray-100">
              <span>Total</span>
              <span>{formatKpiValue(data.total_cents / 100, 'currency')}</span>
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}
