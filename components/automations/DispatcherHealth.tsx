'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, type AutomationDispatcherHealth } from '@/lib/api';

function fmtSeconds(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n < 60) return `${Math.round(n)}s`;
  if (n < 3600) return `${Math.round(n / 60)}m`;
  return `${Math.round(n / 3600)}h`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function DispatcherHealth() {
  const [health, setHealth] = useState<AutomationDispatcherHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const h = await apiClient.getAutomationDispatcherHealth();
      setHealth(h);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load worker health';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !health) {
    return <div className="text-sm text-gray-500">Loading worker status…</div>;
  }

  if (error) {
    return (
      <div className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-200">
        {error}
      </div>
    );
  }

  if (!health) return null;

  const cls = health.healthy
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-200 ring-emerald-500/30'
    : 'bg-red-500/15 text-red-700 dark:text-red-200 ring-red-500/30';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium px-2 py-1 rounded-full ring-1 ${cls}`}>
          {health.healthy ? 'Worker healthy' : 'Worker not responding'}
        </span>
        <span className="text-xs text-gray-500">
          last tick: {fmtDate(health.last_tick_at)} ({fmtSeconds(health.seconds_since_tick)} ago)
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Queue depth" value={health.queue_depth} />
        <Stat label="In flight" value={health.in_flight} />
        <Stat label="Awaiting approval" value={health.awaiting_approval} />
        <Stat label="RQ enabled" value={health.rq_enabled ? 'yes' : 'no'} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-600 dark:text-gray-300">
        <div>
          <div className="text-[11px] uppercase text-gray-500">Worker host</div>
          <div className="font-mono break-all">{health.worker_host ?? '—'}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-gray-500">Worker PID</div>
          <div className="font-mono">{health.worker_pid ?? '—'}</div>
        </div>
      </div>

      {health.notes ? (
        <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-200">
          {health.notes}
        </div>
      ) : null}

      <div className="text-[11px] text-gray-500">
        Workers run as a separate process (<code>python -m app.worker</code>). If this status stays
        red, check that the worker container is up and connected to the database.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</div>
    </div>
  );
}
