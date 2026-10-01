import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { orgIdFromAccessToken } from '@/lib/orgScope';
import FunnelSimulatorModal, { scenarioInScope } from '@/components/portal/FunnelSimulatorModal';
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

export default function FunnelSnapshotPicker({ mode, funnelId, noneLabel, onChange }: FunnelSnapshotPickerProps) {
  const [rows, setRows] = useState<FunnelSimulatorScenario[]>([]);
  const [activeId, setActiveId] = useState('');
  const [editor, setEditor] = useState<{ scenarioId?: string } | null>(null);
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
    async (preferId?: string) => {
      try {
        const all = await apiClient.listFunnelSimulatorScenarios();
        const scoped = all.filter((r) => scenarioInScope(r, { mode, funnelId }));
        setRows(scoped);
        select(preferId ?? readActive(key), scoped);
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
      {activeId ? (
        <button
          type="button"
          onClick={() => setEditor({ scenarioId: activeId })}
          className="rounded-md px-2 py-1 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-white/10"
        >
          Edit
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setEditor({})}
        className="rounded-md border border-violet-400/40 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-500/20"
      >
        + Snapshot
      </button>
      {editor ? (
        <FunnelSimulatorModal
          scope={{ mode, funnelId }}
          initialScenarioId={editor.scenarioId}
          startFresh={!editor.scenarioId}
          onSaved={(row) => void load(row.id)}
          onDeleted={(id) => void load(id === activeId ? '' : activeId)}
          onClose={() => setEditor(null)}
        />
      ) : null}
    </div>
  );
}
