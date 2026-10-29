'use client';

import { useEffect, useState } from 'react';
import { AdsAlert, AdsDashboard, apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';

// Below the scorecard grid: alerts only. The campaign-level Spend/Results/CPR
// numbers folded into the scorecard grid itself as real rows (backend:
// funnel_scorecard.py's _campaign_rows) — this is deliberately not a second
// table repeating that data, per the "one unified grid, not separate tables"
// decision. Reuses ads_signal_engine.py's alerts (same ones the Ads tab shows),
// filtered to this one funnel — see docs/features/META_ADS_PERFORMANCE_PRD.md,
// "Below the scorecard".

const SEVERITY_CLS: Record<string, string> = {
  critical: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  warn: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  info: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
};

function AlertRow({ alert }: { alert: AdsAlert }) {
  const cls = SEVERITY_CLS[alert.severity] || SEVERITY_CLS.info;
  return (
    <div className="flex items-start gap-2 py-1.5 border-t border-gray-200/40 dark:border-gray-700/40 first:border-t-0">
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cls}`}>{alert.severity}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-900 dark:text-gray-100">
          {alert.entity_name || alert.entity_id} — {alert.recommended_action}
        </p>
      </div>
    </div>
  );
}

export default function FunnelAdsBreakdown({ funnelId }: { funnelId: string }) {
  const [dash, setDash] = useState<AdsDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const end = new Date().toISOString().slice(0, 10);
    apiClient
      .getAdsDashboard({ end, funnelId })
      .then((data) => {
        if (!cancelled) setDash(data);
      })
      .catch((e) => {
        if (!cancelled) setError(formatApiError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [funnelId]);

  // Quiet no-op for funnels with no Meta Ads connection, no linked campaigns,
  // or no open alerts — don't clutter the Funnels tab otherwise (link a
  // campaign from the Ads tab's Funnel column; its numbers show in the grid above).
  if (error || !dash?.connected || !dash.campaigns.length || !dash.alerts.length) return null;

  return (
    <div className="glass-card rounded-xl border border-white/10 p-3 sm:p-4 min-w-0">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        Alerts
      </div>
      {dash.alerts.map((alert) => (
        <AlertRow key={alert.id} alert={alert} />
      ))}
    </div>
  );
}
