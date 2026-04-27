import { useState, useEffect, useCallback } from 'react';
import StripeDashboardPanel from '@/components/stripe/StripeDashboardPanel';
import { apiClient } from '@/lib/api';
import type { FinancesCombinedSummary, FinancesTimelinePoint } from '@/types/integration';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type SourceTab = 'all' | 'stripe' | 'whop';

interface WhopPaymentRow {
  id: string;
  whop_id: string;
  amount_cents: number;
  currency?: string;
  status: string;
  payer_email?: string | null;
  created_at: number;
}

const tabBtn =
  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/10';
const tabActive = 'bg-white/15 text-gray-900 dark:text-gray-100';
const tabInactive = 'text-gray-600 dark:text-gray-400 hover:bg-white/10';

/** Match Stripe dashboard: MTD, rolling N days, last year (365), or combined all-time scope. */
export type FinancesTimeRange = number | 'mtd' | 'all';

function financesSummaryApiParams(tr: FinancesTimeRange): { range: number; scope?: 'mtd' | 'all' } {
  if (tr === 'mtd') return { range: 30, scope: 'mtd' };
  if (tr === 'all') return { range: 365, scope: 'all' };
  return { range: tr };
}

function financesTimelineApiParams(tr: FinancesTimeRange): { days: number; scope?: 'mtd' | 'all' } {
  if (tr === 'mtd') return { days: 31, scope: 'mtd' };
  if (tr === 'all') return { days: 365, scope: 'all' };
  return { days: tr };
}

function financesPeriodLabel(tr: FinancesTimeRange): string {
  if (tr === 'mtd') return 'Month to date';
  if (tr === 'all') return 'All recorded history';
  return `Last ${tr} days`;
}

export default function FinancesDashboardPanel({ userRole = 'member' }: { userRole?: string }) {
  const [source, setSource] = useState<SourceTab>('all');
  const [timeRange, setTimeRange] = useState<FinancesTimeRange>('mtd');
  const [summary, setSummary] = useState<FinancesCombinedSummary | null>(null);
  const [timeline, setTimeline] = useState<FinancesTimelinePoint[]>([]);
  const [loadingAll, setLoadingAll] = useState(false);
  const [whopStatus, setWhopStatus] = useState<{ connected: boolean; company_id?: string | null } | null>(null);
  const [whopPayments, setWhopPayments] = useState<WhopPaymentRow[]>([]);
  const [whopKey, setWhopKey] = useState('');
  const [whopCompanyId, setWhopCompanyId] = useState('');
  const [whopBusy, setWhopBusy] = useState(false);
  const [whopErr, setWhopErr] = useState<string | null>(null);

  const loadCombined = useCallback(async () => {
    setLoadingAll(true);
    try {
      const sumP = financesSummaryApiParams(timeRange);
      const tlP = financesTimelineApiParams(timeRange);
      const [s, tl] = await Promise.all([
        apiClient.getFinancesSummary(true, sumP),
        apiClient.getFinancesRevenueTimeline(tlP.days, 'day', tlP.scope ?? null),
      ]);
      setSummary(s as FinancesCombinedSummary);
      const pts = (tl?.timeline || []) as FinancesTimelinePoint[];
      setTimeline(pts);
    } catch {
      setSummary(null);
      setTimeline([]);
    } finally {
      setLoadingAll(false);
    }
  }, [timeRange]);

  const loadWhop = useCallback(async () => {
    try {
      const st = await apiClient.getWhopStatus(true);
      setWhopStatus(st as { connected: boolean; company_id?: string | null });
      if ((st as { connected?: boolean }).connected) {
        const pay = await apiClient.getWhopPayments(1, 50);
        setWhopPayments(Array.isArray(pay) ? pay : []);
      } else {
        setWhopPayments([]);
      }
    } catch {
      setWhopStatus({ connected: false });
      setWhopPayments([]);
    }
  }, []);

  useEffect(() => {
    if (source === 'all') {
      loadCombined();
    }
    if (source === 'whop') {
      loadWhop();
    }
  }, [source, loadCombined, loadWhop]);

  const connectWhop = async () => {
    setWhopErr(null);
    setWhopBusy(true);
    try {
      await apiClient.postWhopConnect({ api_key: whopKey.trim(), company_id: whopCompanyId.trim() });
      setWhopKey('');
      await loadWhop();
      await loadCombined();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: unknown } } };
      const d = ax?.response?.data?.detail;
      const msg =
        typeof d === 'string'
          ? d
          : Array.isArray(d)
            ? d.map((x: unknown) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x))).join(' ')
            : 'Whop connect failed';
      setWhopErr(msg);
    } finally {
      setWhopBusy(false);
    }
  };

  const disconnectWhop = async () => {
    if (!confirm('Disconnect Whop for this organization?')) return;
    setWhopBusy(true);
    try {
      await apiClient.postWhopDisconnect();
      await loadWhop();
      await loadCombined();
    } catch {
      setWhopErr('Disconnect failed');
    } finally {
      setWhopBusy(false);
    }
  };

  const syncWhop = async () => {
    setWhopBusy(true);
    setWhopErr(null);
    try {
      await apiClient.postWhopSync(false);
      await loadWhop();
      await loadCombined();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      setWhopErr(ax?.response?.data?.detail || 'Sync failed');
    } finally {
      setWhopBusy(false);
    }
  };

  const chartData = timeline.map((p) => ({
    ...p,
    stripe: p.stripe_revenue,
    whop: p.whop_revenue,
    total: p.total_revenue,
  }));

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button type="button" className={`${tabBtn} ${source === 'all' ? tabActive : tabInactive}`} onClick={() => setSource('all')}>
          All
        </button>
        <button type="button" className={`${tabBtn} ${source === 'stripe' ? tabActive : tabInactive}`} onClick={() => setSource('stripe')}>
          Stripe
        </button>
        <button type="button" className={`${tabBtn} ${source === 'whop' ? tabActive : tabInactive}`} onClick={() => setSource('whop')}>
          Whop
        </button>
      </div>

      {source === 'all' && (
        <div className="space-y-6">
          <div className="glass-card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Combined revenue</h3>
              <select
                value={timeRange === 'all' ? 'all' : timeRange === 'mtd' ? 'mtd' : String(timeRange)}
                onChange={(e) => {
                  const v = e.target.value;
                  setTimeRange(v === 'all' ? 'all' : v === 'mtd' ? 'mtd' : Number(v));
                }}
                className="text-sm glass-input rounded-md px-3 py-1"
              >
                <option value="mtd">Month to Date</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
                <option value={365}>Last year</option>
                <option value="all">All Time</option>
              </select>
            </div>
            {loadingAll && <p className="text-sm text-gray-500">Loading…</p>}
            {!loadingAll && summary && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="rounded-lg bg-white/5 p-4">
                  <p className="text-xs text-gray-500 uppercase">
                    Combined ({financesPeriodLabel(timeRange)})
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    ${summary.combined.last_30_days_revenue.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 p-4">
                  <p className="text-xs text-gray-500 uppercase">Combined MTD</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    ${summary.combined.last_mtd_revenue.toFixed(2)}
                  </p>
                </div>
                <div className="rounded-lg bg-white/5 p-4 text-sm text-left space-y-1">
                  <p>
                    <span className="text-gray-500">Stripe:</span>{' '}
                    <span className="font-medium">${summary.stripe.last_30_days_revenue.toFixed(2)}</span>{' '}
                    <span className="text-gray-500">({financesPeriodLabel(timeRange)})</span>
                  </p>
                  <p>
                    <span className="text-gray-500">Whop:</span>{' '}
                    <span className="font-medium">${summary.whop.last_30_days_revenue.toFixed(2)}</span>{' '}
                    <span className="text-gray-500">({financesPeriodLabel(timeRange)})</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Stripe {summary.stripe_connected ? 'connected' : 'not connected'} · Whop{' '}
                    {summary.whop_connected ? 'connected' : 'not connected'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="glass-card p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Revenue by source ({financesPeriodLabel(timeRange)})
            </h3>
            {chartData.length === 0 ? (
              <p className="text-sm text-gray-500">No timeline data yet. Connect Stripe and/or Whop and sync.</p>
            ) : (
              <div className="h-72 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: number) => `$${Number(v).toFixed(2)}`} />
                    <Legend />
                    <Line type="monotone" dataKey="stripe" name="Stripe" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="whop" name="Whop" stroke="#10b981" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="total" name="Total" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {source === 'stripe' && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 text-center">Stripe</h2>
          <StripeDashboardPanel userRole={userRole} />
        </div>
      )}

      {source === 'whop' && (
        <div className="glass-card p-6 space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Whop</h2>
          {whopStatus?.connected ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Connected · company <code className="text-xs">{whopStatus.company_id}</code>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={whopBusy}
                  onClick={syncWhop}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50"
                >
                  Sync payments
                </button>
                <button
                  type="button"
                  disabled={whopBusy}
                  onClick={disconnectWhop}
                  className="px-4 py-2 rounded-lg border border-red-500/50 text-red-600 text-sm"
                >
                  Disconnect
                </button>
              </div>
              <div className="overflow-x-auto border border-white/10 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-white/10">
                      <th className="p-2">Date</th>
                      <th className="p-2">Email</th>
                      <th className="p-2">Amount</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whopPayments.map((p) => (
                      <tr key={p.id} className="border-b border-white/5">
                        <td className="p-2">
                          {p.created_at ? new Date(p.created_at * 1000).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-2">{p.payer_email || '—'}</td>
                        <td className="p-2">${((p.amount_cents || 0) / 100).toFixed(2)}</td>
                        <td className="p-2">{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {whopPayments.length === 0 && <p className="p-4 text-gray-500 text-sm">No payments synced yet.</p>}
              </div>
            </div>
          ) : (
            <div className="space-y-3 max-w-md">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Use a Whop Company API key and your company ID (<code className="text-xs">biz_…</code>). See Whop docs
                for required permissions on the key.
              </p>
              <input
                type="password"
                autoComplete="off"
                placeholder="API key"
                value={whopKey}
                onChange={(e) => setWhopKey(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
              />
              <input
                placeholder="Company ID (biz_…)"
                value={whopCompanyId}
                onChange={(e) => setWhopCompanyId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
              />
              {whopErr && <p className="text-sm text-red-500">{whopErr}</p>}
              <button
                type="button"
                disabled={whopBusy || !whopKey.trim() || !whopCompanyId.trim()}
                onClick={connectWhop}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm disabled:opacity-50"
              >
                Connect Whop
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
