import { useMemo, useState } from 'react';
import type { Organization } from '@/types/admin';

type SortKey =
  | 'cash_30d'
  | 'cash_all'
  | 'mrr'
  | 'activity_7d'
  | 'name'
  | 'created';

type TierFilter = 'all' | 'consulting' | 'none';
type CashFilter = 'all' | 'positive' | '1k' | '10k';

function formatUsd(n: number | null | undefined, digits = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatActiveTime(seconds: number | null | undefined) {
  const s = Math.max(0, Math.floor(seconds || 0));
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

function cashDeltaPct(curr: number, prev: number): number | null {
  if (!curr && !prev) return null;
  if (!prev) return 100;
  return ((curr - prev) / prev) * 100;
}

function tierBadge(tier: string | null | undefined) {
  if (tier === 'pro_consulting') return { label: 'Pro', className: 'bg-violet-500/20 text-violet-900 dark:text-violet-100 border-violet-400/40' };
  if (tier === 'core_consulting') return { label: 'Core', className: 'bg-blue-500/20 text-blue-900 dark:text-blue-100 border-blue-400/40' };
  return null;
}

type Props = {
  organizations: Organization[];
  orgSearch: string;
  onOrgSearchChange: (v: string) => void;
  editingOrg: string | null;
  editOrgName: string;
  onEditOrgNameChange: (v: string) => void;
  onViewDashboard: (id: string) => void;
  onStartEdit: (org: Organization) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
};

export default function OwnerOrgsLeaderboard({
  organizations,
  orgSearch,
  onOrgSearchChange,
  editingOrg,
  editOrgName,
  onEditOrgNameChange,
  onViewDashboard,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('cash_30d');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [cashFilter, setCashFilter] = useState<CashFilter>('all');
  const [onlineOnly, setOnlineOnly] = useState(false);

  const rows = useMemo(() => {
    const q = orgSearch.trim().toLowerCase();
    let list = organizations.filter((org) => {
      if (q) {
        const name = String(org.name || '').toLowerCase();
        const id = String(org.id || '').toLowerCase();
        const tier = String(org.consulting_tier || '').toLowerCase();
        if (!name.includes(q) && !id.includes(q) && !tier.includes(q)) return false;
      }
      if (tierFilter === 'consulting' && !org.consulting_tier) return false;
      if (tierFilter === 'none' && org.consulting_tier) return false;
      const cash = org.cash_collected_30d_usd ?? 0;
      if (cashFilter === 'positive' && cash <= 0) return false;
      if (cashFilter === '1k' && cash < 1000) return false;
      if (cashFilter === '10k' && cash < 10000) return false;
      if (onlineOnly && !org.currently_online) return false;
      return true;
    });

    const val = (org: Organization) => {
      if (sortKey === 'cash_30d') return org.cash_collected_30d_usd ?? 0;
      if (sortKey === 'cash_all') return org.cash_collected_all_time_usd ?? 0;
      if (sortKey === 'mrr') return org.mrr_usd ?? 0;
      if (sortKey === 'activity_7d') return org.active_seconds_7d ?? 0;
      if (sortKey === 'created') return new Date(org.created_at).getTime();
      return 0;
    };

    list = [...list].sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      return val(b) - val(a);
    });
    return list;
  }, [organizations, orgSearch, sortKey, tierFilter, cashFilter, onlineOnly]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:flex-initial sm:w-64 min-w-0">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            value={orgSearch}
            onChange={(e) => onOrgSearchChange(e.target.value)}
            placeholder="Search orgs…"
            className="w-full pl-9 pr-3 py-2 text-sm glass-input rounded-md"
            aria-label="Search organizations"
          />
        </div>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="text-sm glass-input rounded-md px-3 py-2"
          aria-label="Sort organizations"
        >
          <option value="cash_30d">Leaderboard: cash 30d</option>
          <option value="cash_all">Leaderboard: cash all-time</option>
          <option value="mrr">Leaderboard: MRR</option>
          <option value="activity_7d">Leaderboard: time on app (7d)</option>
          <option value="name">Name A–Z</option>
          <option value="created">Newest first</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value as TierFilter)}
          className="text-sm glass-input rounded-md px-3 py-2"
          aria-label="Filter by consulting tier"
        >
          <option value="all">All tiers</option>
          <option value="consulting">Consulting only</option>
          <option value="none">No consulting tier</option>
        </select>
        <select
          value={cashFilter}
          onChange={(e) => setCashFilter(e.target.value as CashFilter)}
          className="text-sm glass-input rounded-md px-3 py-2"
          aria-label="Filter by cash collected"
        >
          <option value="all">Any cash 30d</option>
          <option value="positive">Cash 30d &gt; $0</option>
          <option value="1k">Cash 30d ≥ $1k</option>
          <option value="10k">Cash 30d ≥ $10k</option>
        </select>
        <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 px-2 py-1.5">
          <input
            type="checkbox"
            checked={onlineOnly}
            onChange={(e) => setOnlineOnly(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-violet-600"
          />
          Online now
        </label>
      </div>

      <div className="glass-card w-full min-w-0 max-w-full overflow-hidden">
        <div className="w-full min-w-0 overflow-x-auto">
          <table className="w-full divide-y divide-white/10 text-sm">
            <thead className="bg-white/10 dark:bg-white/5">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">#</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Org</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cash 30d</th>
                <th className="hidden md:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">vs prior</th>
                <th className="hidden lg:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Cash all-time</th>
                <th className="hidden sm:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">MRR</th>
                <th className="hidden md:table-cell px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time 7d</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-500">
                    {orgSearch.trim() ? `No organizations match “${orgSearch.trim()}”.` : 'No organizations match these filters.'}
                  </td>
                </tr>
              ) : (
                rows.map((org, idx) => {
                  const delta = cashDeltaPct(org.cash_collected_30d_usd ?? 0, org.cash_collected_prev_30d_usd ?? 0);
                  const badge = tierBadge(org.consulting_tier);
                  return (
                    <tr key={org.id} className={org.currently_online ? 'bg-emerald-500/5' : undefined}>
                      <td className="px-3 py-3 tabular-nums text-gray-500">{idx + 1}</td>
                      <td className="px-3 py-3 min-w-0">
                        {editingOrg === org.id ? (
                          <input
                            type="text"
                            value={editOrgName}
                            onChange={(e) => onEditOrgNameChange(e.target.value)}
                            className="w-full max-w-full px-2 py-1 border border-gray-300 dark:border-white/20 rounded bg-transparent"
                            onKeyDown={(e) => e.key === 'Enter' && onSaveEdit(org.id)}
                          />
                        ) : (
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              {org.currently_online ? (
                                <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Online now" />
                              ) : (
                                <span className="h-2 w-2 rounded-full bg-gray-400/40 shrink-0" />
                              )}
                              <span className="font-medium text-gray-900 dark:text-gray-100 truncate" title={org.name}>
                                {org.name}
                              </span>
                              {badge ? (
                                <span className={`shrink-0 inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${badge.className}`}>
                                  {badge.label}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[11px] text-gray-500 mt-0.5">
                              {org.user_count || 0} users · {org.client_count || 0} clients
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 tabular-nums font-semibold text-gray-900 dark:text-gray-100">
                        {formatUsd(org.cash_collected_30d_usd ?? 0)}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 tabular-nums">
                        {delta == null ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <span className={delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
                            {delta >= 0 ? '+' : ''}
                            {delta.toFixed(0)}%
                          </span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell px-3 py-3 tabular-nums text-gray-700 dark:text-gray-300">
                        {formatUsd(org.cash_collected_all_time_usd ?? 0)}
                      </td>
                      <td className="hidden sm:table-cell px-3 py-3 tabular-nums text-gray-700 dark:text-gray-300">
                        {formatUsd(org.mrr_usd ?? 0)}
                      </td>
                      <td className="hidden md:table-cell px-3 py-3 tabular-nums text-gray-600 dark:text-gray-400">
                        {formatActiveTime(org.active_seconds_7d)}
                      </td>
                      <td className="px-3 py-3 font-medium">
                        {editingOrg === org.id ? (
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            <button type="button" onClick={() => onSaveEdit(org.id)} className="text-blue-600 dark:text-blue-400">
                              Save
                            </button>
                            <button type="button" onClick={onCancelEdit} className="text-gray-600 dark:text-gray-400">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            <button type="button" onClick={() => onViewDashboard(org.id)} className="text-green-600 dark:text-green-400">
                              Dashboard
                            </button>
                            <button type="button" onClick={() => onStartEdit(org)} className="text-blue-600 dark:text-blue-400">
                              Edit
                            </button>
                            <button type="button" onClick={() => onDelete(org.id)} className="text-red-600 dark:text-red-400">
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11px] text-gray-500 border-t border-white/10">
          Showing {rows.length} of {organizations.length} · cash = Stripe + Whop + manual
        </p>
      </div>
    </div>
  );
}
