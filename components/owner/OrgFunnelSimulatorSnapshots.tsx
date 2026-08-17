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

type Props = {
  orgId: string;
};

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

export default function OrgFunnelSimulatorSnapshots({ orgId }: Props) {
  const [rows, setRows] = useState<FunnelSimulatorScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [editScenarioId, setEditScenarioId] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiClient.listFunnelSimulatorScenarios(orgId);
      setRows(Array.isArray(list) ? list : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

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
    <section className="glass-card p-4 rounded-xl border border-gray-200 dark:border-white/10 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 digitized-text">
            Funnel simulator snapshots
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Saved scenarios for this org. Create or edit from here — clients also see them in their portal.
          </p>
        </div>
        <ShinyButton onClick={openNew} className="px-3 py-1.5 text-sm">
          New snapshot
        </ShinyButton>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No snapshots yet. Create one to model this org’s funnel.</p>
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
                className="w-full text-left rounded-lg border border-gray-200/60 dark:border-white/10 px-3 py-3 space-y-2 hover:border-violet-400/50 dark:hover:border-violet-400/40"
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
          orgId={orgId}
          initialScenarioId={editScenarioId}
          startFresh={!editScenarioId}
          onClose={closeSimulator}
        />
      ) : null}
    </section>
  );
}
