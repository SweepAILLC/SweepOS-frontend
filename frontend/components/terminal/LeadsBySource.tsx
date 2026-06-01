import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { cache, CACHE_KEYS, TERMINAL_CACHE_TTL_MS } from '@/lib/cache';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface LeadSource {
  source: string;
  visitors: number; // Visitor count (using event count as proxy until backend tracks unique visitors)
  conversions: number;
}

interface LeadsBySourceProps {
  onLoadComplete?: () => void;
}

export default function LeadsBySource({ onLoadComplete }: LeadsBySourceProps = {}) {
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [loading, setLoading] = useState(true);
  const hasCalledOnLoadComplete = useRef(false);

  const initialLoadDone = useRef(false);

  useEffect(() => {
    const run = () => void loadLeadSources(false, true);
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const id = window.requestIdleCallback(run, { timeout: 2500 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(run, 400);
    return () => clearTimeout(t);
  }, []);

  // Live polling: avoid forceRefresh — same N×analytics pattern as BookingRateByFunnel.
  useEffect(() => {
    const interval = setInterval(() => loadLeadSources(false, false), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadLeadSources = async (forceRefresh = false, showLoading = false) => {
    try {
      if (showLoading || !initialLoadDone.current) setLoading(true);

      if (!forceRefresh) {
        const cached = cache.get<LeadSource[]>(CACHE_KEYS.TERMINAL_LEADS_BY_SOURCE);
        if (cached?.length) {
          setLeadSources(cached);
          initialLoadDone.current = true;
          setLoading(false);
          if (!hasCalledOnLoadComplete.current && onLoadComplete) {
            hasCalledOnLoadComplete.current = true;
            onLoadComplete();
          }
          return;
        }
      }

      const funnels = await apiClient.getFunnels();
      const sourceMap = new Map<string, { visitors: number; conversions: number }>();

      const analyticsResults = await Promise.allSettled(
        funnels.map((funnel: { id: string }) =>
          apiClient.getFunnelAnalytics(funnel.id, 30, forceRefresh)
        )
      );

      for (const result of analyticsResults) {
        if (result.status !== 'fulfilled') continue;
        const analytics = result.value;
        analytics.top_utm_sources?.forEach((utm: { source?: string; unique_visitors?: number; count?: number; conversions?: number }) => {
          const source = utm.source || 'Unknown';
          const existing = sourceMap.get(source) || { visitors: 0, conversions: 0 };
          sourceMap.set(source, {
            visitors: existing.visitors + (utm.unique_visitors || utm.count || 0),
            conversions: existing.conversions + (utm.conversions || 0),
          });
        });

        analytics.top_referrers?.forEach((ref: { referrer?: string; unique_visitors?: number; count?: number; conversions?: number }) => {
          let source = 'Direct';
          if (ref.referrer && ref.referrer !== 'Direct') {
            const referrer = ref.referrer.toLowerCase();
            if (referrer.includes('instagram') || referrer.includes('ig')) {
              source = 'Instagram';
            } else if (referrer.includes('facebook') || referrer.includes('fb')) {
              source = 'Facebook';
            } else if (referrer.includes('google') || referrer.includes('gclid')) {
              source = 'Google';
            } else if (referrer.includes('organic') || referrer.includes('search')) {
              source = 'Organic';
            } else if (referrer.includes('paid') || referrer.includes('ad')) {
              source = 'Paid';
            } else if (referrer.includes('referral') || referrer.includes('ref')) {
              source = 'Referral';
            } else {
              source = ref.referrer;
            }
          }

          const existing = sourceMap.get(source) || { visitors: 0, conversions: 0 };
          sourceMap.set(source, {
            visitors: existing.visitors + (ref.unique_visitors || ref.count || 0),
            conversions: existing.conversions + (ref.conversions || 0),
          });
        });
      }

      const sources: LeadSource[] = Array.from(sourceMap.entries())
        .map(([source, data]) => ({
          source,
          visitors: data.visitors,
          conversions: data.conversions,
        }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 10);

      setLeadSources(sources);
      cache.set(CACHE_KEYS.TERMINAL_LEADS_BY_SOURCE, sources, TERMINAL_CACHE_TTL_MS);
      initialLoadDone.current = true;
    } catch (error) {
      console.error('Failed to load lead sources:', error);
    } finally {
      setLoading(false);
      if (!hasCalledOnLoadComplete.current && onLoadComplete) {
        hasCalledOnLoadComplete.current = true;
        onLoadComplete();
      }
    }
  };

  const getConversionRate = (conversions: number, visitors: number) => {
    if (visitors === 0) return '0.0';
    return ((conversions / visitors) * 100).toFixed(1);
  };

  const COLORS = [
    '#93c5fd',
    '#60a5fa',
    '#3b82f6',
    '#2563eb',
    '#1d4ed8',
    '#93c5fd',
    '#60a5fa',
    '#3b82f6',
    '#2563eb',
    '#1d4ed8',
  ];

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0 max-w-full overflow-hidden">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        Leads by Source
        <span className="text-xs sm:text-sm font-normal text-gray-500 dark:text-gray-400 ml-1 sm:ml-2">(Last 30d)</span>
      </h3>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : leadSources.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          No lead source data available.
        </p>
      ) : (
        <div className="flex flex-col gap-4 min-w-0">
          <div className="w-full min-w-0 max-w-full h-[220px] overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={({ payload }: any) => {
                    const p0 = payload?.[0];
                    if (!p0) return null;
                    const data = p0.payload as LeadSource;
                    return (
                      <div className="glass-panel px-3 py-2 rounded-lg text-xs text-gray-900 dark:text-gray-100">
                        <div className="font-semibold">{data.source}</div>
                        <div className="text-gray-600 dark:text-gray-300">
                          {data.visitors.toLocaleString()} visitors
                        </div>
                        <div className="text-gray-600 dark:text-gray-300">
                          {getConversionRate(data.conversions, data.visitors)}% conversion rate
                        </div>
                      </div>
                    );
                  }}
                />
                <Pie
                  data={leadSources}
                  dataKey="visitors"
                  nameKey="source"
                  innerRadius={45}
                  outerRadius={72}
                  paddingAngle={2}
                  cornerRadius={10}
                  isAnimationActive={true}
                  animationDuration={500}
                  labelLine={false}
                  label={({ percent }: any) =>
                    percent != null && percent > 0.04 ? `${Math.round(percent * 100)}%` : ''
                  }
                >
                  {leadSources.map((entry, index) => (
                    <Cell key={`cell-${entry.source}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend dropdown */}
          <details className="glass-panel rounded-lg px-3 py-2 min-w-0 overflow-hidden">
            <summary className="cursor-pointer select-none list-none flex items-center justify-between gap-3 min-w-0">
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate min-w-0">
                Sources
              </span>
              <span className="text-gray-500 dark:text-gray-400 text-xs group-open:rotate-180 transition-transform">
                ▼
              </span>
            </summary>
            <div className="mt-3 space-y-2">
              {leadSources.map((source, index) => {
                const color = COLORS[index % COLORS.length];
                return (
                  <div
                    key={source.source}
                    className="flex items-center justify-between gap-3 glass-panel rounded-lg px-3 py-2 min-w-0 max-w-full overflow-hidden"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {source.source}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0 min-w-0">
                      <div className="text-sm font-bold text-gray-900 dark:text-gray-100 digitized-text tabular-nums truncate">
                        {source.visitors.toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {getConversionRate(source.conversions, source.visitors)}% conv.
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

