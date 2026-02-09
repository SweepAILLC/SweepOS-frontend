import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { FunnelAnalytics, StepCount, UTMSourceStats, ReferrerStats } from '@/types/funnel';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface FunnelAnalyticsTabProps {
  funnelId: string;
}

export default function FunnelAnalyticsTab({ funnelId }: FunnelAnalyticsTabProps) {
  const [analytics, setAnalytics] = useState<FunnelAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<number>(30);

  useEffect(() => {
    loadAnalytics();
  }, [funnelId, timeRange]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await apiClient.getFunnelAnalytics(funnelId, timeRange);
      setAnalytics(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !analytics) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading analytics...</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div className="glass-card p-4 border-red-400/40">
        <p className="text-red-800 dark:text-red-200">Error: {error || 'Failed to load analytics'}</p>
        <button
          onClick={loadAnalytics}
          className="mt-2 text-red-600 dark:text-red-300 hover:text-red-200 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Prepare chart data
  const chartData = analytics.step_counts.map((step) => ({
    name: step.label || step.event_name,
    count: step.count,
    conversion: step.conversion_rate || 0,
  }));

  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex items-center space-x-4">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Time Range:</label>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(Number(e.target.value))}
          className="px-3 py-2 glass-input rounded-md"
        >
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
          <option value={365}>365 days</option>
        </select>
        <button
          onClick={loadAnalytics}
          className="text-sm text-blue-400 hover:text-blue-200"
        >
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Total Visitors</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {analytics.total_visitors.toLocaleString()}
          </p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Conversions</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {analytics.total_conversions.toLocaleString()}
          </p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Conversion Rate</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {analytics.overall_conversion_rate.toFixed(1)}%
          </p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Revenue</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {formatCurrency(analytics.revenue_cents)}
          </p>
        </div>
      </div>

      {/* Funnel Drop-off Chart */}
      {analytics.step_counts.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Funnel Drop-off ({timeRange} days)
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#3b82f6" name="Event Count" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Step Details Table */}
      {analytics.step_counts.length > 0 && (
        <div className="glass-card overflow-hidden">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/10 dark:bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Step
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Event Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conversion Rate
                </th>
              </tr>
            </thead>
            <tbody className="bg-transparent divide-y divide-white/10">
              {analytics.step_counts.map((step, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {step.step_order}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-100">
                    {step.label || step.event_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {step.count.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {step.conversion_rate !== null && step.conversion_rate !== undefined
                      ? `${step.conversion_rate.toFixed(1)}%`
                      : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analytics.step_counts.length === 0 && (
        <div className="glass-card p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400">No analytics data available. Start tracking events to see analytics.</p>
        </div>
      )}

      {/* UTM Sources */}
      {analytics.top_utm_sources && analytics.top_utm_sources.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top UTM Sources</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Traffic sources by UTM parameter</p>
          </div>
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/10 dark:bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Source
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Events
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conversions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conversion Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody className="bg-transparent divide-y divide-white/10">
              {analytics.top_utm_sources.map((utm, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {utm.source}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {utm.count.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {utm.conversions.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {utm.count > 0 ? `${((utm.conversions / utm.count) * 100).toFixed(1)}%` : '0%'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {formatCurrency(utm.revenue_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top Referrers */}
      {analytics.top_referrers && analytics.top_referrers.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Top Referrers</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Where your visitors are coming from</p>
          </div>
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/10 dark:bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Referrer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Events
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conversions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Conversion Rate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Revenue
                </th>
              </tr>
            </thead>
            <tbody className="bg-transparent divide-y divide-white/10">
              {analytics.top_referrers.map((ref, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {ref.referrer === 'Direct' ? (
                      <span className="text-gray-500 dark:text-gray-100 italic">Direct (no referrer)</span>
                    ) : (
                      <a
                        href={`https://${ref.referrer}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        {ref.referrer}
                      </a>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {ref.count.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {ref.conversions.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {ref.count > 0 ? `${((ref.conversions / ref.count) * 100).toFixed(1)}%` : '0%'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {formatCurrency(ref.revenue_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

