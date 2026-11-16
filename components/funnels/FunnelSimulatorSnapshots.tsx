import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  calculateOrganicDm,
  calculatePaidVsl,
  defaultSimulatorInputs,
  formatNum,
  formatRoas,
  formatUsd,
} from '@/lib/funnelSimulator';
import type { FunnelSimulatorScenario } from '@/types/funnelSimulator';
import FunnelSimulatorModal from '@/components/portal/FunnelSimulatorModal';
import ShinyButton from '@/components/ui/ShinyButton';

function scenarioOutputs(row: FunnelSimulatorScenario) {
  const inputs = defaultSimulatorInputs();
  if (row.inputs?.paid) inputs.paid = { ...inputs.paid, ...row.inputs.paid };
  if (row.inputs?.organic) inputs.organic = { ...inputs.organic, ...row.inputs.organic };
  return {
    paid: calculatePaidVsl(inputs.paid),
    organic: calculateOrganicDm(inputs.organic),
  };
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-200/60 dark:border-white/10 bg-white/70 dark:bg-white/5 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 digitized-text">
        {label}
      </p>
      <p
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-50'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

/** Saved funnel-simulator scenarios for the current org, at the bottom of the Funnels tab. */
export default function FunnelSimulatorSnapshots() {
  const [rows, setRows] = useState<FunnelSimulatorScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [editScenarioId, setEditScenarioId] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiClient.listFunnelSimulatorScenarios();
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openNew = () => {
    setEditScenarioId(undefined);
    setSimulatorOpen(true);
  };

  const openExisting = (id: string) => {
    setEditScenarioId(id);
    setSimulatorOpen(true);
  };

  const closeSimulator = () => {
    setSimulatorOpen(false);
    setEditScenarioId(undefined);
    void load();
  };

  return (
    <div className="mt-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Funnel simulator snapshots</h2>
        <ShinyButton onClick={openNew}>+ New Snapshot</ShinyButton>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="glass-card p-4 flex flex-col items-center justify-center text-center">
          <p className="text-gray-600 dark:text-gray-300 mb-4">No snapshots yet</p>
          <ShinyButton onClick={openNew}>Create Your First Snapshot</ShinyButton>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const out = scenarioOutputs(row);
            const paid = row.mode !== 'organic_dm';
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => openExisting(row.id)}
                className="w-full text-left glass-card neon-glow p-4 hover:shadow-lg transition-shadow space-y-2"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.name}</p>
                  <p className="text-[11px] text-gray-500">
                    {paid ? 'Paid VSL' : 'Organic DM'}
                    {row.updated_at ? ` · ${new Date(row.updated_at).toLocaleString()}` : ''}
                  </p>
                </div>
                {paid ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Metric label="Monthly revenue" value={formatUsd(out.paid.revenue)} />
                    <Metric label="Monthly net" value={formatUsd(out.paid.net)} positive />
                    <Metric label="ROAS" value={formatRoas(out.paid.roas)} />
                    <Metric label="# Sales / mo" value={formatNum(out.paid.sales)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Metric label="Cash goal" value={formatUsd(out.organic.ccGoal)} />
                    <Metric label="Closes needed" value={formatNum(out.organic.closesNeeded)} />
                    <Metric label="Daily convos" value={formatNum(out.organic.dailyConvos)} />
                    <Metric label="Daily bookings" value={formatNum(out.organic.dailyBookings)} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
      {simulatorOpen ? (
        <FunnelSimulatorModal
          initialScenarioId={editScenarioId}
          startFresh={!editScenarioId}
          onClose={closeSimulator}
        />
      ) : null}
    </div>
  );
}
