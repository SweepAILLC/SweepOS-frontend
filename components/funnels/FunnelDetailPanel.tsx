import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { FunnelWithSteps } from '@/types/funnel';
import FunnelOverviewTab from '@/components/funnels/FunnelOverviewTab';
import FunnelStepsTab from '@/components/funnels/FunnelStepsTab';
import FunnelHealthTab from '@/components/funnels/FunnelHealthTab';
import FunnelAnalyticsTab from '@/components/funnels/FunnelAnalyticsTab';

type Props = {
  funnelId: string;
  onBack: () => void;
};

export default function FunnelDetailPanel({ funnelId, onBack }: Props) {
  const [funnel, setFunnel] = useState<FunnelWithSteps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'steps' | 'health' | 'analytics'>('overview');

  useEffect(() => {
    setActiveTab('overview');
  }, [funnelId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.getFunnel(funnelId);
        if (!cancelled) {
          setFunnel(data);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load funnel');
          setFunnel(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [funnelId]);

  const loadFunnel = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getFunnel(funnelId);
      setFunnel(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load funnel');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !funnel) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading funnel...</p>
        </div>
      </div>
    );
  }

  if (error || !funnel) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-200">Error: {error || 'Funnel not found'}</p>
          <button type="button" onClick={onBack} className="mt-2 text-red-600 dark:text-red-400 hover:underline">
            Back to Funnels
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <button
          type="button"
          onClick={onBack}
          className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-4"
        >
          ← Back to Funnels
        </button>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 truncate">{funnel.name}</h1>
            {funnel.domain && <p className="text-gray-600 dark:text-gray-400 mt-1">Domain: {funnel.domain}</p>}
          </div>
          <button
            type="button"
            onClick={() => void loadFunnel()}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 glass-button neon-glow rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <svg
              className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 mb-6">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {(['overview', 'steps', 'health', 'analytics'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 font-medium text-sm capitalize transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              style={
                activeTab === tab
                  ? { textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)' }
                  : undefined
              }
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'overview' && <FunnelOverviewTab funnel={funnel} onReload={loadFunnel} />}
      {activeTab === 'steps' && <FunnelStepsTab funnel={funnel} onReload={loadFunnel} />}
      {activeTab === 'health' && <FunnelHealthTab funnelId={funnel.id} />}
      {activeTab === 'analytics' && <FunnelAnalyticsTab funnelId={funnel.id} />}
    </div>
  );
}
