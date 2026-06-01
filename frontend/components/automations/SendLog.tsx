'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiClient,
  type AutomationEmailJob,
  type AutomationJobState,
  type AutomationPlaybook,
} from '@/lib/api';

const STATE_FILTERS: AutomationJobState[] = [
  'sent',
  'failed',
  'skipped',
  'canceled',
  'awaiting_approval',
  'scheduled',
  'ready',
  'sending',
];

const PLAYBOOK_LABEL: Record<AutomationPlaybook, string> = {
  pre_sale_post_booking: 'Post-booking (pre-sale)',
  first_payment_onboarding: 'Onboarding',
  first_payment_referral: 'Referral',
  win_combined_ask: 'Win combined ask',
  offboarding_recap_ask: 'Offboarding recap',
};

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function SendLog() {
  const [filter, setFilter] = useState<AutomationJobState | 'all'>('all');
  const [items, setItems] = useState<AutomationEmailJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listAutomationJobs({
        state: filter === 'all' ? undefined : filter,
        limit: 100,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load jobs';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRetry = useCallback(
    async (job: AutomationEmailJob) => {
      setBusyId(job.id);
      try {
        await apiClient.updateAutomationJobState(job.id, 'scheduled');
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Retry failed';
        setError(msg);
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const onCancel = useCallback(
    async (job: AutomationEmailJob) => {
      setBusyId(job.id);
      try {
        await apiClient.updateAutomationJobState(job.id, 'canceled');
        await load();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Cancel failed';
        setError(msg);
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const summary = useMemo(() => {
    const map = new Map<AutomationJobState, number>();
    for (const it of items) map.set(it.state, (map.get(it.state) ?? 0) + 1);
    return map;
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-gray-700 dark:text-gray-200">Filter:</label>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as AutomationJobState | 'all')}
          className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-sm"
        >
          <option value="all">All</option>
          {STATE_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          Refresh
        </button>
        <span className="text-xs text-gray-500">{total} total · {items.length} shown</span>
      </div>

      {error ? (
        <div className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-2 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800/40 text-xs uppercase text-gray-600 dark:text-gray-300">
              <tr>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2 text-left">Playbook</th>
                <th className="px-3 py-2 text-left">State</th>
                <th className="px-3 py-2 text-left">Attempts</th>
                <th className="px-3 py-2 text-left">Dispatched</th>
                <th className="px-3 py-2 text-left">Brevo Msg</th>
                <th className="px-3 py-2 text-left">Error</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr
                  key={j.id}
                  className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/30"
                >
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-200">
                    {fmt(j.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    {PLAYBOOK_LABEL[j.playbook] ?? j.playbook}
                  </td>
                  <td className="px-3 py-2 capitalize">{j.state.replace(/_/g, ' ')}</td>
                  <td className="px-3 py-2">{j.attempts}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmt(j.dispatched_at)}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">
                    {j.brevo_message_id ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-red-600 dark:text-red-300 max-w-xs truncate">
                    {j.error_text ?? ''}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {j.state === 'failed' ? (
                        <button
                          type="button"
                          onClick={() => onRetry(j)}
                          disabled={busyId === j.id}
                          className="rounded-md border border-violet-300 dark:border-violet-500 text-xs px-2 py-0.5 hover:bg-violet-100 dark:hover:bg-violet-900/20"
                        >
                          Retry
                        </button>
                      ) : null}
                      {(j.state === 'scheduled' || j.state === 'awaiting_approval' || j.state === 'ready') ? (
                        <button
                          type="button"
                          onClick={() => onCancel(j)}
                          disabled={busyId === j.id}
                          className="rounded-md border border-gray-300 dark:border-gray-600 text-xs px-2 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">
                    No jobs match this filter yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] text-gray-500 flex flex-wrap gap-3">
        {Array.from(summary.entries()).map(([s, n]) => (
          <span key={s}>
            {s.replace(/_/g, ' ')}: <strong>{n}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}
