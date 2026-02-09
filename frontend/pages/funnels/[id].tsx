import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import Navbar from '@/components/ui/Navbar';
import { FunnelWithSteps } from '@/types/funnel';
import FunnelOverviewTab from '@/components/funnels/FunnelOverviewTab';
import FunnelStepsTab from '@/components/funnels/FunnelStepsTab';
import FunnelHealthTab from '@/components/funnels/FunnelHealthTab';
import FunnelAnalyticsTab from '@/components/funnels/FunnelAnalyticsTab';

export default function FunnelDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [funnel, setFunnel] = useState<FunnelWithSteps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'steps' | 'health' | 'analytics'>('overview');

  const handleNavbarTabChange = (tab: 'brevo' | 'terminal' | 'stripe' | 'funnels' | 'users' | 'owner' | 'calcom') => {
    // Navigate to main dashboard with the selected tab as query parameter
    router.push(`/?tab=${tab}`);
  };

  useEffect(() => {
    if (id && typeof id === 'string') {
      loadFunnel();
    }
  }, [id]);

  const loadFunnel = async () => {
    if (!id || typeof id !== 'string') return;
    
    try {
      setLoading(true);
      const data = await apiClient.getFunnel(id);
      setFunnel(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load funnel');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar activeTab="funnels" onTabChange={handleNavbarTabChange} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-2 text-gray-600">Loading funnel...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !funnel) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar activeTab="funnels" onTabChange={handleNavbarTabChange} />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">Error: {error || 'Funnel not found'}</p>
            <button
              onClick={() => router.push('/')}
              className="mt-2 text-red-600 hover:text-red-800 underline"
            >
              Back to Funnels
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar activeTab="funnels" onTabChange={handleNavbarTabChange} />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to Funnels
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{funnel.name}</h1>
              {funnel.domain && (
                <p className="text-gray-600 mt-1">Domain: {funnel.domain}</p>
              )}
            </div>
            <button
              onClick={loadFunnel}
              disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 glass-button neon-glow rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

        {/* Tabs */}
        <div className="border-b border-white/10 mb-6">
          <nav className="-mb-px flex space-x-8">
            {(['overview', 'steps', 'health', 'analytics'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-4 px-1 font-medium text-sm capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-gray-900 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
                style={activeTab === tab ? {
                  textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
                } : {}}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <FunnelOverviewTab funnel={funnel} onReload={loadFunnel} />
        )}
        {activeTab === 'steps' && (
          <FunnelStepsTab funnel={funnel} onReload={loadFunnel} />
        )}
        {activeTab === 'health' && (
          <FunnelHealthTab funnelId={funnel.id} />
        )}
        {activeTab === 'analytics' && (
          <FunnelAnalyticsTab funnelId={funnel.id} />
        )}
      </div>
    </div>
  );
}

