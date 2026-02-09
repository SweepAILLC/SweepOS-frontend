import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { 
  CalComStatus, CalComBooking, CalComEventType,
  CalendlyStatus, CalendlyScheduledEvent, CalendlyEventType
} from '@/types/integration';
import EventDetailsModal from './EventDetailsModal';
import { useLoading } from '@/contexts/LoadingContext';

type BookingsTab = 'upcoming' | 'past';
type CalendarProvider = 'calcom' | 'calendly' | null;

interface CalendarConsolePanelProps {
  userRole?: string; // 'owner' | 'admin' | 'member'
}

export default function CalendarConsolePanel({ userRole = 'member' }: CalendarConsolePanelProps) {
  const { setLoading: setGlobalLoading } = useLoading();
  // Status for both providers
  const [calcomStatus, setCalcomStatus] = useState<CalComStatus | null>(null);
  const [calendlyStatus, setCalendlyStatus] = useState<CalendlyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Check if user can manage integrations (admin or owner only)
  // Normalize role to lowercase for comparison - be explicit about member check
  const roleLower = String(userRole || 'member').toLowerCase().trim();
  // Explicitly check - only admin and owner can manage, members cannot
  // If role is member or anything other than admin/owner, cannot manage
  const canManageIntegrations = roleLower === 'admin' || roleLower === 'owner';
  
  // Connection state
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<CalendarProvider>(null);
  
  // Determine which provider is connected
  const connectedProvider: CalendarProvider = calcomStatus?.connected ? 'calcom' : 
                                               calendlyStatus?.connected ? 'calendly' : null;
  
  // Bookings state (works for both providers)
  const [bookingsTab, setBookingsTab] = useState<BookingsTab>('upcoming');
  const [calcomBookings, setCalcomBookings] = useState<CalComBooking[]>([]);
  const [calendlyEvents, setCalendlyEvents] = useState<CalendlyScheduledEvent[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  
  // Event types state
  const [calcomEventTypes, setCalcomEventTypes] = useState<CalComEventType[]>([]);
  const [calendlyEventTypes, setCalendlyEventTypes] = useState<CalendlyEventType[]>([]);
  const [eventTypesLoading, setEventTypesLoading] = useState(false);
  const [eventTypesError, setEventTypesError] = useState<string | null>(null);
  
  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Event details modal state
  const [selectedEvent, setSelectedEvent] = useState<{
    provider: 'calcom' | 'calendly';
    id: string | number;
    uri?: string;
  } | null>(null);

  useEffect(() => {
    loadStatuses();
  }, []);

  // Load data when a provider is connected
  useEffect(() => {
    if (connectedProvider === 'calcom') {
      setTimeout(() => {
        loadCalcomBookings();
        loadCalcomEventTypes();
      }, 100);
    } else if (connectedProvider === 'calendly') {
      setTimeout(() => {
        loadCalendlyEvents();
        loadCalendlyEventTypes();
      }, 100);
    } else if (!connectedProvider && !loading && !bookingsLoading && !eventTypesLoading) {
      // No provider connected and all loading is done
      setGlobalLoading(false);
    }
  }, [connectedProvider]);

  // Turn off global loading when all data is loaded
  useEffect(() => {
    if (!loading && !bookingsLoading && !eventTypesLoading) {
      // Small delay to ensure smooth transition
      setTimeout(() => {
        setGlobalLoading(false);
      }, 300);
    }
  }, [loading, bookingsLoading, eventTypesLoading, setGlobalLoading]);

  const loadStatuses = async () => {
    setLoading(true);
    setGlobalLoading(true, 'Loading Calendar dashboard...');
    try {
      const [calcom, calendly] = await Promise.all([
        apiClient.getCalComStatus().catch(() => ({ connected: false, message: 'Cal.com not connected' })),
        apiClient.getCalendlyStatus().catch(() => ({ connected: false, message: 'Calendly not connected' }))
      ]);
      setCalcomStatus(calcom);
      setCalendlyStatus(calendly);
    } catch (error) {
      console.error('Failed to load calendar statuses:', error);
    } finally {
      setLoading(false);
      // Global loading will be turned off by useEffect when all data is loaded
    }
  };

  const loadCalcomBookings = async (offset: number = 0) => {
    if (!calcomStatus?.connected) return;
    
    setBookingsLoading(true);
    setBookingsError(null);
    try {
      const data = await apiClient.getCalComBookings(50, offset);
      setCalcomBookings(data.bookings || []);
    } catch (error: any) {
      console.error('Failed to load Cal.com bookings:', error);
      setBookingsError(error?.response?.data?.detail || 'Failed to load bookings');
      setCalcomBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  };

  const loadCalendlyEvents = async (pageToken?: string) => {
    if (!calendlyStatus?.connected) return;
    
    setBookingsLoading(true);
    setBookingsError(null);
    try {
      const data = await apiClient.getCalendlyScheduledEvents({
        count: 50,
        page_token: pageToken,
        sort: 'start_time:asc'
      });
      setCalendlyEvents(data.collection || []);
    } catch (error: any) {
      console.error('Failed to load Calendly events:', error);
      setBookingsError(error?.response?.data?.detail || 'Failed to load scheduled events');
      setCalendlyEvents([]);
    } finally {
      setBookingsLoading(false);
    }
  };

  const loadCalcomEventTypes = async () => {
    if (!calcomStatus?.connected) return;
    
    setEventTypesLoading(true);
    setEventTypesError(null);
    try {
      const data = await apiClient.getCalComEventTypes();
      setCalcomEventTypes(data.event_types || []);
    } catch (error: any) {
      console.error('Failed to load Cal.com event types:', error);
      setEventTypesError(error?.response?.data?.detail || 'Failed to load event types');
      setCalcomEventTypes([]);
    } finally {
      setEventTypesLoading(false);
    }
  };

  const loadCalendlyEventTypes = async () => {
    if (!calendlyStatus?.connected) return;
    
    setEventTypesLoading(true);
    setEventTypesError(null);
    try {
      const data = await apiClient.getCalendlyEventTypes({
        count: 50,
        sort: 'name:asc'
      });
      setCalendlyEventTypes(data.collection || []);
    } catch (error: any) {
      console.error('Failed to load Calendly event types:', error);
      setEventTypesError(error?.response?.data?.detail || 'Failed to load event types');
      setCalendlyEventTypes([]);
    } finally {
      setEventTypesLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedProvider || !apiKey.trim()) {
      alert('Please select a calendar provider and enter your API key');
      return;
    }

    setConnecting(true);
    setGlobalLoading(true, `Connecting to ${selectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'}...`);
    try {
      if (selectedProvider === 'calcom') {
        await apiClient.connectCalComWithApiKey(apiKey.trim());
      } else {
        await apiClient.connectCalendlyWithApiKey(apiKey.trim());
      }
      setApiKey('');
      setSelectedProvider(null);
      await loadStatuses();
    } catch (error: any) {
      console.error(`Failed to connect ${selectedProvider}:`, error);
      let errorMessage = `Failed to connect ${selectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'}. Please check your configuration.`;
      
      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      alert(`${selectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'} Connection Error:\n\n${errorMessage}`);
    } finally {
      setConnecting(false);
      setGlobalLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!connectedProvider) return;
    
    const providerName = connectedProvider === 'calcom' ? 'Cal.com' : 'Calendly';
    if (!confirm(`Are you sure you want to disconnect your ${providerName} account?`)) {
      return;
    }
    
    setDisconnecting(true);
    try {
      if (connectedProvider === 'calcom') {
        await apiClient.disconnectCalCom();
      } else {
        await apiClient.disconnectCalendly();
      }
      await loadStatuses();
      setCalcomBookings([]);
      setCalendlyEvents([]);
      setCalcomEventTypes([]);
      setCalendlyEventTypes([]);
    } catch (error) {
      console.error(`Failed to disconnect ${providerName}:`, error);
      alert(`Failed to disconnect ${providerName} account.`);
    } finally {
      setDisconnecting(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateString;
    }
  };

  const formatDuration = (minutes: number | undefined) => {
    if (!minutes) return 'N/A';
    if (minutes < 60) {
      return `${minutes} min`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const copyToClipboard = async (text: string, id: string, label: string = 'Link') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert(`Failed to copy ${label} to clipboard`);
    }
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

  // Get filtered bookings/events based on selected tab
  const getFilteredBookings = () => {
    const now = new Date();
    if (connectedProvider === 'calcom') {
      if (bookingsTab === 'upcoming') {
        return calcomBookings.filter(booking => {
          try {
            const startTime = new Date(booking.startTime);
            return startTime >= now;
          } catch {
            return false;
          }
        });
      } else {
        return calcomBookings.filter(booking => {
          try {
            const startTime = new Date(booking.startTime);
            return startTime < now;
          } catch {
            return false;
          }
        });
      }
    } else if (connectedProvider === 'calendly') {
      if (bookingsTab === 'upcoming') {
        return calendlyEvents.filter(event => {
          try {
            const startTime = new Date(event.start_time);
            return startTime >= now;
          } catch {
            return false;
          }
        });
      } else {
        return calendlyEvents.filter(event => {
          try {
            const startTime = new Date(event.start_time);
            return startTime < now;
          } catch {
            return false;
          }
        });
      }
    }
    return [];
  };

  const filteredBookings = getFilteredBookings();
  const currentStatus = connectedProvider === 'calcom' ? calcomStatus : calendlyStatus;
  const currentEventTypes = connectedProvider === 'calcom' ? calcomEventTypes : calendlyEventTypes;

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="text-gray-500 dark:text-gray-400">Loading calendar status...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Calendar Integration</h2>
          {connectedProvider && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (connectedProvider === 'calcom') {
                    loadCalcomBookings(0);
                    loadCalcomEventTypes();
                  } else {
                    loadCalendlyEvents();
                    loadCalendlyEventTypes();
                  }
                }}
                disabled={bookingsLoading || eventTypesLoading}
                className="px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
              >
                Refresh All
              </button>
              <a
                href={connectedProvider === 'calcom' ? 'https://app.cal.com' : 'https://calendly.com'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
              >
                Open {connectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'} Dashboard
              </a>
              {canManageIntegrations ? (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              ) : null}
            </div>
          )}
        </div>

        {connectedProvider ? (
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-3 w-3 bg-green-400 rounded-full"></div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Connected to {connectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'}
                </p>
                {currentStatus?.account_email && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{currentStatus.account_email}</p>
                )}
                {currentStatus?.account_name && currentStatus.account_name !== currentStatus.account_email && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{currentStatus.account_name}</p>
                )}
              </div>
            </div>

            {currentStatus?.message && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{currentStatus.message}</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-3 w-3 bg-gray-400 rounded-full"></div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Not Connected</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Connect either Cal.com or Calendly to view your calendar bookings and event types.
                </p>
              </div>
            </div>

            {/* Provider Selection */}
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Select Calendar Provider
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSelectedProvider('calcom')}
                    className={`p-4 border-2 rounded-lg transition-colors ${
                      selectedProvider === 'calcom'
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">Cal.com</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Open-source calendar scheduling
                    </div>
                  </button>
                  <button
                    onClick={() => setSelectedProvider('calendly')}
                    className={`p-4 border-2 rounded-lg transition-colors ${
                      selectedProvider === 'calendly'
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'
                    }`}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100">Calendly</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Popular calendar scheduling platform
                    </div>
                  </button>
                </div>
              </div>

              {selectedProvider && canManageIntegrations && (
                <div className="space-y-2">
                  <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {selectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'} API Key
                  </label>
                  <input
                    id="api-key"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`Enter your ${selectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'} API key`}
                    className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {selectedProvider === 'calcom' ? (
                      <>
                        Get your API key from{' '}
                        <a
                          href="https://app.cal.com/settings/developer/api-keys"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-500 hover:underline"
                        >
                          Cal.com Settings → Developer → API Keys
                        </a>
                      </>
                    ) : (
                      <>
                        Get your Personal Access Token from{' '}
                        <a
                          href="https://calendly.com/integrations/api_webhooks"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary-500 hover:underline"
                        >
                          Calendly Settings → Integrations → API & Webhooks
                        </a>
                      </>
                    )}
                  </p>
                </div>
              )}

              {!canManageIntegrations && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    Only administrators and owners can connect or disconnect integrations. Please contact an admin to manage calendar settings.
                  </p>
                </div>
              )}

              {canManageIntegrations && (
                <button
                  onClick={handleConnect}
                  disabled={connecting || !apiKey.trim() || !selectedProvider}
                  className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connecting ? 'Connecting...' : `Connect ${selectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'}`}
                </button>
              )}

              {/* Show warning if other provider is connected */}
              {(calcomStatus?.connected || calendlyStatus?.connected) && (
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 rounded-md">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Note:</strong> You can only connect one calendar provider at a time. 
                    {calcomStatus?.connected && ' Cal.com is currently connected.'}
                    {calendlyStatus?.connected && ' Calendly is currently connected.'}
                    {' '}Disconnect the current provider before connecting a different one.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bookings/Events Section */}
      {connectedProvider && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {connectedProvider === 'calcom' ? 'Bookings' : 'Scheduled Events'}
            </h2>
            <button
              onClick={() => {
                if (connectedProvider === 'calcom') {
                  loadCalcomBookings(0);
                } else {
                  loadCalendlyEvents();
                }
              }}
              disabled={bookingsLoading}
              className="px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
            >
              {bookingsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {bookingsError && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-md">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Error loading {connectedProvider === 'calcom' ? 'bookings' : 'events'}:</strong> {bookingsError}
              </p>
            </div>
          )}

          {/* Bookings Tabs */}
          <div className="mb-4 border-b border-white/10">
            <div className="flex space-x-1">
              <button
                onClick={() => setBookingsTab('upcoming')}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                  bookingsTab === 'upcoming'
                    ? 'bg-primary-500 text-white border-b-2 border-primary-500'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-white/10'
                }`}
              >
                Upcoming
              </button>
              <button
                onClick={() => setBookingsTab('past')}
                className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                  bookingsTab === 'past'
                    ? 'bg-primary-500 text-white border-b-2 border-primary-500'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-white/10'
                }`}
              >
                Past
              </button>
            </div>
          </div>

          {bookingsLoading && filteredBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              Loading {connectedProvider === 'calcom' ? 'bookings' : 'events'}...
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="text-base font-medium mb-2">
                No {bookingsTab === 'upcoming' ? 'upcoming' : 'past'} {connectedProvider === 'calcom' ? 'bookings' : 'events'} found
              </p>
              <p className="text-sm">
                {bookingsError 
                  ? `Error: ${bookingsError}` 
                  : bookingsTab === 'upcoming'
                  ? `You don't have any upcoming ${connectedProvider === 'calcom' ? 'bookings' : 'events'}. ${connectedProvider === 'calcom' ? 'Bookings' : 'Events'} will appear here once someone schedules a meeting through your ${connectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'} links.`
                  : `You don't have any past ${connectedProvider === 'calcom' ? 'bookings' : 'events'} yet.`}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Title
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Start Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        End Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {connectedProvider === 'calcom' ? 'Attendees' : 'Invitees'}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {connectedProvider === 'calcom' ? (
                      // Cal.com bookings
                      (filteredBookings as CalComBooking[]).map((booking) => (
                        <tr 
                          key={booking.id} 
                          className="hover:bg-white/5 cursor-pointer"
                          onClick={() => setSelectedEvent({ provider: 'calcom', id: booking.id })}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {booking.title || booking.eventType?.title || 'Untitled'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {formatDateTime(booking.startTime)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {formatDateTime(booking.endTime)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {booking.attendees && booking.attendees.length > 0 ? (
                              <div className="space-y-1">
                                {booking.attendees.map((attendee, idx) => (
                                  <div key={idx}>
                                    {attendee.name || attendee.email}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              'No attendees'
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              booking.status === 'confirmed' || booking.status === 'accepted'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : booking.status === 'cancelled' || booking.status === 'rejected'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                            }`}>
                              {booking.status || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {booking.location ? (
                              isUrl(booking.location) ? (
                                <button
                                  onClick={() => copyToClipboard(booking.location!, `location-${booking.id}`, 'location link')}
                                  className={`text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline cursor-pointer transition-colors ${
                                    copiedId === `location-${booking.id}` ? 'text-green-500 dark:text-green-400' : ''
                                  }`}
                                  title="Click to copy location link"
                                >
                                  {copiedId === `location-${booking.id}` ? '✓ Copied!' : booking.location}
                                </button>
                              ) : (
                                booking.location
                              )
                            ) : (
                              'N/A'
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      // Calendly scheduled events
                      (filteredBookings as CalendlyScheduledEvent[]).map((event) => (
                        <tr 
                          key={event.uri} 
                          className="hover:bg-white/5 cursor-pointer"
                          onClick={() => setSelectedEvent({ 
                            provider: 'calendly', 
                            id: event.uri.split('/').pop() || event.uri,
                            uri: event.uri 
                          })}
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {event.name || 'Untitled Event'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {formatDateTime(event.start_time)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {formatDateTime(event.end_time)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {event.invitees_counter ? (
                              <div>
                                {event.invitees_counter.active || 0} / {event.invitees_counter.total || 0} invitees
                              </div>
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${
                              event.status === 'active'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : event.status === 'canceled'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                            }`}>
                              {event.status || 'unknown'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {event.location ? (
                              typeof event.location === 'string' ? (
                                isUrl(event.location) ? (
                                  <button
                                    onClick={() => copyToClipboard(event.location as string, `location-${event.uri}`, 'location link')}
                                    className={`text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline cursor-pointer transition-colors ${
                                      copiedId === `location-${event.uri}` ? 'text-green-500 dark:text-green-400' : ''
                                    }`}
                                    title="Click to copy location link"
                                  >
                                    {copiedId === `location-${event.uri}` ? '✓ Copied!' : event.location}
                                  </button>
                                ) : (
                                  event.location
                                )
                              ) : (
                                event.location?.location || 'N/A'
                              )
                            ) : (
                              'N/A'
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Event Types Section */}
      {connectedProvider && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Event Types</h2>
            <button
              onClick={() => {
                if (connectedProvider === 'calcom') {
                  loadCalcomEventTypes();
                } else {
                  loadCalendlyEventTypes();
                }
              }}
              disabled={eventTypesLoading}
              className="px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
            >
              {eventTypesLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {eventTypesError && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-md">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Error loading event types:</strong> {eventTypesError}
              </p>
            </div>
          )}

          {eventTypesLoading && currentEventTypes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading event types...</div>
          ) : currentEventTypes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="text-base font-medium mb-2">No event types found</p>
              <p className="text-sm">
                {eventTypesError 
                  ? `Error: ${eventTypesError}` 
                  : `You don't have any event types configured in ${connectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'}. Create event types in your ${connectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'} dashboard to get started.`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {connectedProvider === 'calcom' ? (
                // Cal.com event types
                (currentEventTypes as CalComEventType[]).map((eventType) => (
                  <div key={eventType.id} className="glass-card p-4">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                      {eventType.title}
                    </h3>
                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      {eventType.length && (
                        <p>Duration: {formatDuration(eventType.length)}</p>
                      )}
                      {eventType.slug && (
                        <p className="text-xs">
                          Slug: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{eventType.slug}</code>
                        </p>
                      )}
                      {eventType.bookingUrl && (
                        <button
                          onClick={() => copyToClipboard(eventType.bookingUrl!, `booking-${eventType.id}`, 'booking URL')}
                          className={`text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 text-xs underline ${
                            copiedId === `booking-${eventType.id}` ? 'text-green-500 dark:text-green-400' : ''
                          }`}
                        >
                          {copiedId === `booking-${eventType.id}` ? '✓ Copied!' : 'Copy Booking URL'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                // Calendly event types
                (currentEventTypes as CalendlyEventType[]).map((eventType) => (
                  <div key={eventType.uri} className="glass-card p-4">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                      {eventType.name}
                    </h3>
                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      {eventType.duration && (
                        <p>Duration: {formatDuration(eventType.duration)}</p>
                      )}
                      {eventType.slug && (
                        <p className="text-xs">
                          Slug: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{eventType.slug}</code>
                        </p>
                      )}
                      {eventType.scheduling_url && (
                        <button
                          onClick={() => copyToClipboard(eventType.scheduling_url!, `scheduling-${eventType.uri}`, 'scheduling URL')}
                          className={`text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 text-xs underline ${
                            copiedId === `scheduling-${eventType.uri}` ? 'text-green-500 dark:text-green-400' : ''
                          }`}
                        >
                          {copiedId === `scheduling-${eventType.uri}` ? '✓ Copied!' : 'Copy Scheduling URL'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Event Details Modal */}
      {selectedEvent && (
        <EventDetailsModal
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          provider={selectedEvent.provider}
          eventId={selectedEvent.id}
          eventUri={selectedEvent.uri}
        />
      )}
    </div>
  );
}

