import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

interface BrevoCampaignStatistics {
  campaignId?: number;
  campaignName?: string;
  sent?: number;
  delivered?: number;
  opened?: number;
  uniqueOpens?: number;
  clicked?: number;
  uniqueClicks?: number;
  bounced?: number;
  unsubscribed?: number;
  spamReports?: number;
  openRate?: number;
  clickRate?: number;
  bounceRate?: number;
  createdAt?: string;
}

interface BrevoTransactionalStatistics {
  sent?: number;
  delivered?: number;
  opened?: number;
  uniqueOpens?: number;
  clicked?: number;
  uniqueClicks?: number;
  bounced?: number;
  spamReports?: number;
  openRate?: number;
  clickRate?: number;
  bounceRate?: number;
  period?: string;
}

interface BrevoAccountStatistics {
  totalContacts?: number;
  totalLists?: number;
  totalCampaigns?: number;
  totalSent?: number;
  totalDelivered?: number;
  totalOpened?: number;
  totalClicked?: number;
  totalBounced?: number;
  totalUnsubscribed?: number;
  overallOpenRate?: number;
  overallClickRate?: number;
  overallBounceRate?: number;
}

interface BrevoAnalyticsResponse {
  account?: BrevoAccountStatistics;
  transactional?: BrevoTransactionalStatistics;
  campaigns?: BrevoCampaignStatistics[];
  lastUpdated?: string;
  period?: string;
}

export default function BrevoAnalytics() {
  const [analytics, setAnalytics] = useState<BrevoAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('30days');

  const loadAnalytics = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    
    try {
      const data = await apiClient.getBrevoAnalytics(period);
      setAnalytics(data);
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || err.message || 'Failed to load analytics';
      setError(errorMessage);
      console.error('[BrevoAnalytics] Error loading analytics:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const handleRefresh = () => {
    loadAnalytics(true);
  };

  const formatNumber = (num: number | undefined) => {
    if (num === undefined || num === null) return '0';
    return num.toLocaleString();
  };

  const formatPercentage = (num: number | undefined) => {
    if (num === undefined || num === null) return '0.00';
    return num.toFixed(2);
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        Loading analytics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4 border border-red-200 dark:border-red-800">
          <div className="text-sm text-red-800 dark:text-red-200">
            Error loading analytics: {error}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with refresh button and period selector */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Analytics & Statistics
        </h3>
        <div className="flex gap-3 items-center">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
          >
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
            <option value="90days">Last 90 days</option>
          </select>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh analytics data"
          >
            {refreshing ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

      {analytics?.lastUpdated && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          Last updated: {new Date(analytics.lastUpdated).toLocaleString()}
        </div>
      )}

      {/* Account Overview */}
      {analytics?.account && (
        <div className="glass-card p-6">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Account Overview
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Contacts</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analytics.account.totalContacts)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Lists</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analytics.account.totalLists)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Campaigns</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analytics.account.totalCampaigns)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Total Sent</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analytics.account.totalSent)}
              </div>
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Open Rate</div>
              <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {formatPercentage(analytics.account.overallOpenRate)}%
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Click Rate</div>
              <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {formatPercentage(analytics.account.overallClickRate)}%
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Bounce Rate</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatPercentage(analytics.account.overallBounceRate)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transactional Email Statistics */}
      {analytics?.transactional && (
        <div className="glass-card p-6">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Transactional Email Statistics
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Sent</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analytics.transactional.sent)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Delivered</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analytics.transactional.delivered)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Opened</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analytics.transactional.uniqueOpens)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Clicked</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatNumber(analytics.transactional.uniqueClicks)}
              </div>
            </div>
          </div>
          
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Open Rate</div>
              <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {formatPercentage(analytics.transactional.openRate)}%
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Click Rate</div>
              <div className="text-2xl font-bold text-primary-600 dark:text-primary-400">
                {formatPercentage(analytics.transactional.clickRate)}%
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-600 dark:text-gray-400">Bounce Rate</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {formatPercentage(analytics.transactional.bounceRate)}%
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Statistics */}
      {analytics?.campaigns && analytics.campaigns.length > 0 && (
        <div className="glass-card p-6">
          <h4 className="text-md font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Recent Campaigns
          </h4>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Sent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Delivered
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Opened
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Clicked
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Open Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Click Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {analytics.campaigns.map((campaign) => (
                  <tr key={campaign.campaignId} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                      {campaign.campaignName || `Campaign #${campaign.campaignId}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatNumber(campaign.sent)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatNumber(campaign.delivered)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatNumber(campaign.uniqueOpens)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatNumber(campaign.uniqueClicks)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <span className="text-primary-600 dark:text-primary-400 font-medium">
                        {formatPercentage(campaign.openRate)}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <span className="text-primary-600 dark:text-primary-400 font-medium">
                        {formatPercentage(campaign.clickRate)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(!analytics?.campaigns || analytics.campaigns.length === 0) && (
        <div className="glass-card p-6">
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No campaign statistics available
          </div>
        </div>
      )}
    </div>
  );
}

