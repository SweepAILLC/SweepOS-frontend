import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { orgIdFromAccessToken } from '@/lib/orgScope';
import { scenarioInScope } from '@/components/portal/FunnelSimulatorModal';
import type { FunnelSimulatorScenario, SimulatorMode } from '@/types/funnelSimulator';

/**
 * Funnels tab: the snapshots (Funnel Simulator models) saved for one funnel, and which
 * one — if any — the view compares against. Paid funnels swap the scorecard's
 * historic-average benchmark for it; Organic compares it against the KPI grid.
 * The chosen snapshot is remembered per viewer, per funnel.
 */

interface FunnelSnapshotPickerProps {
  mode: SimulatorMode;
  /** Paid funnel id; null = all paid funnels (or Organic, which has no funnel id). */
  funnelId: string | null;
  /** What the select's "no snapshot" option means in this view. */
  noneLabel: string;
  onChange: (scenario: FunnelSimulatorScenario | null) => void;
  /** Bump after saving a snapshot elsewhere (Targets) so the list refreshes. */
  refreshKey?: number;
  /** After a save, select this id if present. */
  preferId?: string;
}

function activeKey(mode: SimulatorMode, funnelId: string | null): string {
  return `sweepos:funnel-snapshot:active:${orgIdFromAccessToken()}:${mode}:${funnelId ?? 'all'}`;
}

function readActive(key: string): string {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeActive(key: string, id: string) {
  try {
    if (id) window.localStorage.setItem(key, id);
    else window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export default function FunnelSnapshotPicker({
  mode,
  funnelId,
  noneLabel,
  onChange,
  refreshKey = 0,
  preferId,
}: FunnelSnapshotPickerProps) {
  const [rows, setRows] = useState<FunnelSimulatorScenario[]>([]);
  const [activeId, setActiveId] = useState('');
  const key = activeKey(mode, funnelId);

  const select = useCallback(
    (id: string, list: FunnelSimulatorScenario[]) => {
      const row = list.find((r) => r.id === id) ?? null;
      const next = row ? row.id : '';
      setActiveId(next);
      writeActive(key, next);
      onChange(row);
    },
    [key, onChange],
  );

  const load = useCallback(
    async (pickId?: string) => {
      try {
        const all = await apiClient.listFunnelSimulatorScenarios();
        const scoped = all.filter((r) => scenarioInScope(r, { mode, funnelId }));
        setRows(scoped);
        select(pickId ?? readActive(key), scoped);
      } catch {
        setRows([]);
        select('', []);
      }
    },
    [mode, funnelId, key, select],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (refreshKey === 0) return;
    void load(preferId);
    // refreshKey is the trigger; preferId is the post-save selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const selectId = `snapshot-${mode}-${funnelId ?? 'all'}`;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <label className="text-[11px] text-gray-500 dark:text-gray-400" htmlFor={selectId}>
        Compare to
      </label>
      <select
        id={selectId}
        value={activeId}
        onChange={(e) => select(e.target.value, rows)}
        className="rounded-md border border-gray-300 dark:border-white/10 bg-white/80 dark:bg-black/30 px-2 py-1 text-[11px] text-gray-800 dark:text-gray-100 max-w-[12rem]"
      >
        <option value="">{noneLabel}</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            Snapshot · {r.name}
          </option>
        ))}
      </select>
    </div>
  );
}
