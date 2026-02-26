import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { Funnel } from '@/types/funnel';

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

  useEffect(() => {
    loadLeadSources();
  }, []);

  // Live polling for accurate terminal funnel data (refresh every 60s; bypass cache)
  useEffect(() => {
    const interval = setInterval(() => loadLeadSources(true), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadLeadSources = async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      // Get all funnels
      const funnels = await apiClient.getFunnels();
      
      // Aggregate data from all funnels (last 30 days)
      const sourceMap = new Map<string, { visitors: number; conversions: number }>();
      
      for (const funnel of funnels) {
        try {
          const analytics = await apiClient.getFunnelAnalytics(funnel.id, 30, forceRefresh);
          
          // Process UTM sources
          analytics.top_utm_sources?.forEach((utm: any) => {
            const source = utm.source || 'Unknown';
            const existing = sourceMap.get(source) || { visitors: 0, conversions: 0 };
            sourceMap.set(source, {
              visitors: existing.visitors + (utm.unique_visitors || utm.count), // Use unique_visitors if available
              conversions: existing.conversions + utm.conversions,
            });
          });
          
          // Process referrers (categorize them)
          // Use unique_visitors from backend (now tracked and returned)
          analytics.top_referrers?.forEach((ref: any) => {
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
                // Use the actual referrer name instead of "Other"
                source = ref.referrer;
              }
            }
            
            const existing = sourceMap.get(source) || { visitors: 0, conversions: 0 };
            sourceMap.set(source, {
              visitors: existing.visitors + (ref.unique_visitors || ref.count), // Use unique_visitors if available
              conversions: existing.conversions + ref.conversions,
            });
          });
        } catch (error) {
          console.warn(`Failed to load analytics for funnel ${funnel.id}:`, error);
        }
      }
      
      // Convert to array and sort by visitor count
      const sources: LeadSource[] = Array.from(sourceMap.entries())
        .map(([source, data]) => ({
          source,
          visitors: data.visitors,
          conversions: data.conversions,
        }))
        .sort((a, b) => b.visitors - a.visitors)
        .slice(0, 10); // Top 10
      
      setLeadSources(sources);
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

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0">
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
        <div className="space-y-3">
          {leadSources.map((source) => (
            <div
              key={source.source}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 glass-panel rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {source.source}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {getConversionRate(source.conversions, source.visitors)}% conversion rate
                </p>
              </div>
              <div className="text-left sm:text-right sm:ml-4 flex-shrink-0">
                <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                  {source.visitors.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 digitized-text">
                  visitors
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

