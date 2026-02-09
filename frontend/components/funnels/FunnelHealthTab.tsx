import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { FunnelHealth } from '@/types/funnel';

interface FunnelHealthTabProps {
  funnelId: string;
}

export default function FunnelHealthTab({ funnelId }: FunnelHealthTabProps) {
  const [health, setHealth] = useState<FunnelHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [funnelId]);

  const loadHealth = async () => {
    try {
      const data = await apiClient.getFunnelHealth(funnelId);
      setHealth(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load health data');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !health) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading health data...</p>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="glass-card p-4 border-red-400/40">
        <p className="text-red-800 dark:text-red-200">Error: {error || 'Failed to load health data'}</p>
        <button
          onClick={loadHealth}
          className="mt-2 text-red-600 dark:text-red-300 hover:text-red-200 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // Determine health status
  const lastEventTime = health.last_event_at
    ? new Date(health.last_event_at)
    : null;
  const minutesSinceLastEvent = lastEventTime
    ? Math.floor((Date.now() - lastEventTime.getTime()) / 60000)
    : null;

  const getStatusColor = () => {
    if (!lastEventTime) return 'bg-gray-500';
    if (minutesSinceLastEvent! < 2) return 'bg-green-500';
    if (minutesSinceLastEvent! < 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (!lastEventTime) return 'No events yet';
    if (minutesSinceLastEvent! < 2) return 'Live';
    if (minutesSinceLastEvent! < 30) return 'Warning';
    return 'Stale';
  };

  const getStatusDescription = () => {
    if (!lastEventTime) return 'Funnel created but no events received yet';
    if (minutesSinceLastEvent! < 2) return 'Funnel is actively receiving events (last event < 2 min ago)';
    if (minutesSinceLastEvent! < 30) return 'Activity has slowed (last event 2-30 min ago)';
    return 'No events received in over 30 minutes - check tracking code and traffic';
  };

  return (
    <div className="space-y-6">
      {/* Health Status Card */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Health Status</h3>
        <div className="flex items-center space-x-4 mb-2">
          <div className={`w-4 h-4 rounded-full ${getStatusColor()}`}></div>
          <span className="font-medium text-gray-900 dark:text-gray-100">{getStatusText()}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">{getStatusDescription()}</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Last Event</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {lastEventTime
              ? `${minutesSinceLastEvent} min ago`
              : 'Never'}
          </p>
          {lastEventTime && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {lastEventTime.toLocaleString()}
            </p>
          )}
        </div>

        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Events/Min</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {health.events_per_minute.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Last hour average</p>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Total Events</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {health.total_events.toLocaleString()}
          </p>
        </div>

        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Errors (24h)</p>
          <p className={`text-lg font-semibold ${
            health.error_count_last_24h > 0 ? 'text-red-400' : 'text-gray-900 dark:text-gray-100'
          }`}>
            {health.error_count_last_24h}
          </p>
        </div>
      </div>
    </div>
  );
}

