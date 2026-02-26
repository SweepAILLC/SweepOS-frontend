import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { CalendarNotificationsSummary } from '@/types/integration';

interface NotificationsCardProps {
  onLoadComplete?: () => void;
}

export default function NotificationsCard({ onLoadComplete }: NotificationsCardProps = {}) {
  const [summary, setSummary] = useState<CalendarNotificationsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const hasCalledOnLoadComplete = useRef(false);

  useEffect(() => {
    loadSummary();
    // Refresh every 5 minutes
    const interval = setInterval(loadSummary, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const loadSummary = async () => {
    const startTime = Date.now();
    const minDuration = 800; // Minimum 800ms to ensure animation is visible
    
    try {
      setLoading(true);
      setRefreshing(true);
      setError(null);
      console.log('[NOTIFICATIONS] Loading calendar summary...');
      const data = await apiClient.getCalendarUpcomingSummary();
      console.log('[NOTIFICATIONS] Received data:', data);
      console.log('[NOTIFICATIONS] Data type:', typeof data);
      console.log('[NOTIFICATIONS] Data keys:', Object.keys(data || {}));
      setSummary(data);
      // Clear error if we successfully got data
      if (data) {
        setError(null);
      }
    } catch (err: any) {
      console.error('[NOTIFICATIONS] Failed to load calendar summary:', err);
      console.error('[NOTIFICATIONS] Error details:', {
        message: err?.message,
        response: err?.response?.data,
        status: err?.response?.status,
        stack: err?.stack
      });
      const errorMessage = err?.response?.data?.detail || err?.message || 'Failed to load calendar notifications';
      setError(errorMessage);
      // Don't set summary on error - let it stay null so we can show error message
      setSummary(null);
    } finally {
      // Ensure minimum duration for animation visibility
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDuration - elapsed);
      await new Promise(resolve => setTimeout(resolve, remaining));
      setLoading(false);
      setRefreshing(false);
      
      // Call onLoadComplete only once
      if (onLoadComplete && !hasCalledOnLoadComplete.current) {
        hasCalledOnLoadComplete.current = true;
        onLoadComplete();
      }
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 7) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    } else if (diffDays > 0) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} from now`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''} from now`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} from now`;
    } else {
      return 'Starting soon';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const isUrl = (str: string | undefined): boolean => {
    if (!str) return false;
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  if (loading && !summary) {
    return (
      <div className="glass-card p-4 sm:p-6 min-w-0">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!summary) {
    // Show error or loading state
    return (
      <div className="glass-card p-4 sm:p-6 min-w-0">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Calendar Notifications
            </h3>
            {error ? (
              <div>
                <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                  {error}
                </p>
                <button
                  onClick={loadSummary}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading calendar data...
              </p>
            )}
          </div>
          <div className="text-4xl text-gray-300 dark:text-gray-600">📅</div>
        </div>
      </div>
    );
  }

  if (!summary.connected) {
    return (
      <div className="glass-card p-4 sm:p-6 min-w-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Calendar Notifications
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Connect Cal.com or Calendly to see upcoming appointments
            </p>
          </div>
          <div className="text-4xl text-gray-300 dark:text-gray-600">📅</div>
        </div>
      </div>
    );
  }

  const weekChange = summary.last_week_percentage_change;
  const monthChange = summary.last_month_percentage_change;

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            Calendar Notifications
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {summary.provider === 'calcom' ? 'Cal.com' : 'Calendly'} • {summary.upcoming_count} upcoming appointment{summary.upcoming_count !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={loadSummary}
          disabled={refreshing}
          className="p-2.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] min-w-[44px] flex items-center justify-center flex-shrink-0"
          title="Refresh"
        >
          <svg 
            className={`w-5 h-5 flex-shrink-0 ${refreshing ? 'animate-spin' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2.5} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {/* Upcoming Count */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 sm:p-3 min-w-0">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {summary.upcoming_count}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Upcoming
          </div>
        </div>

        {/* Last Week Comparison */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 sm:p-3 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {summary.last_week_count}
            </div>
            {weekChange !== null && weekChange !== undefined && (
              <span className={`text-xs font-medium ${weekChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {weekChange >= 0 ? '+' : ''}{weekChange.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Last 7 Days
          </div>
        </div>

        {/* Last Month Comparison */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 sm:p-3 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {summary.last_month_count}
            </div>
            {monthChange !== null && monthChange !== undefined && (
              <span className={`text-xs font-medium ${monthChange >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {monthChange >= 0 ? '+' : ''}{monthChange.toFixed(1)}%
              </span>
            )}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Last 30 Days
          </div>
        </div>

        {/* Show-up Rate */}
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5 sm:p-3 min-w-0">
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {summary.show_up_rate != null ? `${summary.show_up_rate}%` : '—'}
          </div>
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            Show-up Rate
          </div>
        </div>
      </div>

      {/* Upcoming Appointments (up to 3) */}
      {summary.upcoming_appointments && summary.upcoming_appointments.length > 0 && (
        <div className="space-y-3">
          {summary.upcoming_appointments.map((appointment, index) => (
            <div key={appointment.id || index} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                      {index === 0 ? 'Next Appointment' : `Upcoming ${index + 1}`}
                    </span>
                    {appointment.provider === 'manual' && (
                      <span className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                        Manual
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {appointment.title}
                  </h4>
                  {appointment.client_name && (
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 font-medium">
                      {appointment.client_name}
                    </p>
                  )}
                  <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>{formatDate(appointment.start_time)}</span>
                      <span className="text-gray-400">•</span>
                      <span>{formatTime(appointment.start_time)}</span>
                    </div>
                    {appointment.location && (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {isUrl(appointment.location) ? (
                          <a
                            href={appointment.location}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline cursor-pointer transition-colors"
                          >
                            {appointment.location}
                          </a>
                        ) : (
                          <span>{appointment.location}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {appointment.link && (
                  <a
                    href={appointment.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                  >
                    View Details
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Fallback to most_upcoming if upcoming_appointments is not available */}
      {(!summary.upcoming_appointments || summary.upcoming_appointments.length === 0) && summary.most_upcoming && (
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  Next Appointment
                </span>
              </div>
              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
                {summary.most_upcoming.title}
              </h4>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>{formatDate(summary.most_upcoming.start_time)}</span>
                  <span className="text-gray-400">•</span>
                  <span>{formatTime(summary.most_upcoming.start_time)}</span>
                </div>
                {summary.most_upcoming.location && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {isUrl(summary.most_upcoming.location) ? (
                      <a
                        href={summary.most_upcoming.location}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline cursor-pointer transition-colors"
                      >
                        {summary.most_upcoming.location}
                      </a>
                    ) : (
                      <span>{summary.most_upcoming.location}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            {summary.most_upcoming.link && (
              <a
                href={summary.most_upcoming.link}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              >
                View Details
              </a>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

