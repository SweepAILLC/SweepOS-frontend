import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { Client, ClientPayment } from '@/types/client';

interface TopContributor {
  client_id: string;
  display_name: string;
  revenue: number;
  last_payment_date: string | null;
  merged_client_ids?: string[] | null;
}

interface TopRevenueContributorsProps {
  onLoadComplete?: () => void;
}

function normalizeEmail(email: string | undefined | null): string | null {
  if (!email) return null;
  return email.replace(/\s+/g, '').toLowerCase().trim() || null;
}

export default function TopRevenueContributors({ onLoadComplete }: TopRevenueContributorsProps = {}) {
  const [contributors30, setContributors30] = useState<TopContributor[]>([]);
  const [contributors90, setContributors90] = useState<TopContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<30 | 90>(30);
  const hasCalledOnLoadComplete = useRef(false);

  const loadFromSummary = async (): Promise<{ top30: TopContributor[]; top90: TopContributor[] } | null> => {
    const summary = await apiClient.getTerminalSummary();
    const top30 = summary.top_contributors_30d ?? [];
    const top90 = summary.top_contributors_90d ?? [];
    const hasData = top30.length > 0 || top90.length > 0;
    return hasData ? { top30, top90 } : null;
  };

  const loadFallback = async (): Promise<{ top30: TopContributor[]; top90: TopContributor[] }> => {
    const clients = await apiClient.getClients();
    const grouped = new Map<string, Client[]>();
    const processed = new Set<string>();

    clients.forEach((client: Client) => {
      if (processed.has(client.id)) return;
      const norm = normalizeEmail(client.email);
      if (norm) {
        const key = `email:${norm}`;
        const same = clients.filter(
          (c: Client) => normalizeEmail(c.email) === norm && !processed.has(c.id)
        );
        if (same.length > 0) {
          same.forEach((c: Client) => processed.add(c.id));
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(...same);
        }
      } else if (client.stripe_customer_id) {
        const key = `stripe:${client.stripe_customer_id}`;
        const same = clients.filter(
          (c: Client) => c.stripe_customer_id === client.stripe_customer_id && !processed.has(c.id)
        );
        if (same.length > 0) {
          same.forEach((c: Client) => processed.add(c.id));
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(...same);
        }
      }
      if (!processed.has(client.id)) {
        grouped.set(`id:${client.id}`, [client]);
        processed.add(client.id);
      }
    });

    const buildForRange = async (days: number): Promise<TopContributor[]> => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const list: TopContributor[] = [];

      const groups = Array.from(grouped.values());
      for (let i = 0; i < groups.length; i++) {
        const clientGroup = groups[i];
        let totalRevenue = 0;
        const seenKeys = new Set<string>();
        let latestDate: string | null = null;

        for (const client of clientGroup) {
          try {
            const res = await apiClient.getClientPayments(client.id);
            (res.payments || []).forEach((p: ClientPayment) => {
              if (p.status !== 'succeeded' || !p.created_at) return;
              const d = new Date(p.created_at);
              if (d < cutoff) return;
              const key = p.stripe_id || p.id;
              if (seenKeys.has(key)) return;
              seenKeys.add(key);
              totalRevenue += p.amount || 0;
              if (!latestDate || (p.created_at && p.created_at > latestDate)) latestDate = p.created_at;
            });
          } catch {
            // skip
          }
        }

        if (totalRevenue > 0) {
          const primary = [...clientGroup].sort(
            (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
          )[0];
          const names = new Set(
            clientGroup.map((c) => [c.first_name, c.last_name].filter(Boolean).join(' ').trim()).filter(Boolean)
          );
          const displayName = names.size > 0 ? Array.from(names).join(' / ') : (primary.email || 'Unknown');
          list.push({
            client_id: primary.id,
            display_name: displayName,
            revenue: totalRevenue,
            last_payment_date: latestDate,
            merged_client_ids: clientGroup.length > 1 ? clientGroup.map((c) => c.id) : null,
          });
        }
      }

      list.sort((a, b) => b.revenue - a.revenue);
      return list.slice(0, 5);
    };

    const [top30, top90] = await Promise.all([buildForRange(30), buildForRange(90)]);
    return { top30, top90 };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        let result: { top30: TopContributor[]; top90: TopContributor[] } | null = null;
        try {
          result = await loadFromSummary();
        } catch (err) {
          console.warn('Terminal summary failed for contributors, using fallback:', err);
        }
        if (!result) {
          result = await loadFallback();
        }
        if (cancelled) return;
        setContributors30(result.top30);
        setContributors90(result.top90);
      } catch (error) {
        if (!cancelled) console.error('Failed to load revenue contributors:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
          if (!hasCalledOnLoadComplete.current && onLoadComplete) {
            hasCalledOnLoadComplete.current = true;
            onLoadComplete();
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [onLoadComplete]);

  const contributors = timeRange === 30 ? contributors30 : contributors90;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Top 5 Revenue Contributors
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setTimeRange(30)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              timeRange === 30
                ? 'glass-button neon-glow text-white'
                : 'glass-button-secondary text-gray-700 dark:text-gray-300'
            }`}
          >
            30d
          </button>
          <button
            onClick={() => setTimeRange(90)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              timeRange === 90
                ? 'glass-button neon-glow text-white'
                : 'glass-button-secondary text-gray-700 dark:text-gray-300'
            }`}
          >
            90d
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : contributors.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          No revenue contributors found for the selected period.
        </p>
      ) : (
        <div className="space-y-3">
          {contributors.map((contributor, index) => (
            <div
              key={contributor.client_id}
              className="flex items-center justify-between p-3 glass-panel rounded-lg"
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {contributor.display_name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last payment: {formatDate(contributor.last_payment_date)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(contributor.revenue)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
