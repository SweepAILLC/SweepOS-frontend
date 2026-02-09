import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { CalComStatus, CalComBooking, CalComEventType } from '@/types/integration';

type BookingsTab = 'upcoming' | 'past';

export default function CalComConsolePanel() {
  const [status, setStatus] = useState<CalComStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  
  // Bookings state
  const [bookingsTab, setBookingsTab] = useState<BookingsTab>('upcoming');
  const [allBookings, setAllBookings] = useState<CalComBooking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsOffset, setBookingsOffset] = useState(0);
  const [bookingsTotal, setBookingsTotal] = useState<number | undefined>();
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  
  // Event types state
  const [eventTypes, setEventTypes] = useState<CalComEventType[]>([]);
  const [eventTypesLoading, setEventTypesLoading] = useState(false);
  const [eventTypesError, setEventTypesError] = useState<string | null>(null);
  
  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
  }, []);

  // Load all data when connected
  useEffect(() => {
    if (status?.connected) {
      console.log('[CALCOM] Status connected, loading bookings and event types...');
      console.log('[CALCOM] Current status object:', status);
      // Use setTimeout to ensure state is fully updated
      setTimeout(() => {
        loadBookings();
        loadEventTypes();
      }, 100);
    } else {
      console.log('[CALCOM] Status not connected, skipping data load');
    }
  }, [status?.connected]);

  // Debug: Log when eventTypes state changes
  useEffect(() => {
    console.log('[CALCOM] eventTypes state changed:', eventTypes);
    console.log('[CALCOM] eventTypes length:', eventTypes.length);
    if (eventTypes.length > 0) {
      console.log('[CALCOM] First event type:', eventTypes[0]);
    }
  }, [eventTypes]);

  const loadStatus = async () => {
    try {
      console.log('[CALCOM] Loading status...');
      const data = await apiClient.getCalComStatus();
      console.log('[CALCOM] Status loaded:', data);
      setStatus(data);
    } catch (error: any) {
      console.error('[CALCOM] Failed to load status:', error);
      if (error?.response?.status === 500) {
        setStatus({
          connected: false,
          message: 'Unable to check Cal.com status. Please ensure the backend has been restarted after running migrations.'
        });
      } else {
        setStatus({
          connected: false,
          message: 'Cal.com not connected. Click "Connect Cal.com" to connect.'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async (offset: number = 0) => {
    console.log('[CALCOM] loadBookings called, status?.connected:', status?.connected);
    if (!status?.connected) {
      console.log('[CALCOM] Not connected, skipping bookings load');
      return;
    }
    
    console.log('[CALCOM] Loading bookings, offset:', offset);
    setBookingsLoading(true);
    setBookingsError(null);
    try {
      console.log('[CALCOM] Making API call to getCalComBookings...');
      const data = await apiClient.getCalComBookings(50, offset);
      console.log('[CALCOM] Bookings API response received:', data);
      console.log('[CALCOM] Response type:', typeof data);
      console.log('[CALCOM] Response keys:', Object.keys(data || {}));
      console.log('[CALCOM] Bookings array:', data?.bookings);
      console.log('[CALCOM] Bookings array type:', Array.isArray(data?.bookings));
      console.log('[CALCOM] Bookings count:', data?.bookings?.length || 0);
      
      const bookingsArray = data?.bookings || [];
      console.log('[CALCOM] Setting bookings state with:', bookingsArray);
      setAllBookings(bookingsArray);
      setBookingsTotal(data?.total);
      setBookingsOffset(offset);
      
      if (!bookingsArray || bookingsArray.length === 0) {
        console.log('[CALCOM] No bookings found in response');
        console.log('[CALCOM] Full response data:', JSON.stringify(data, null, 2));
      } else {
        console.log('[CALCOM] Successfully loaded', bookingsArray.length, 'bookings');
      }
    } catch (error: any) {
      console.error('[CALCOM] Failed to load bookings:', error);
      console.error('[CALCOM] Error type:', error?.constructor?.name);
      console.error('[CALCOM] Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        stack: error?.stack
      });
      setBookingsError(error?.response?.data?.detail || error?.message || 'Failed to load bookings');
      setAllBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  };

  const loadEventTypes = async () => {
    console.log('[CALCOM] loadEventTypes called, status?.connected:', status?.connected);
    if (!status?.connected) {
      console.log('[CALCOM] Not connected, skipping event types load');
      return;
    }
    
    console.log('[CALCOM] Loading event types...');
    setEventTypesLoading(true);
    setEventTypesError(null);
    try {
      console.log('[CALCOM] Making API call to getCalComEventTypes...');
      const data = await apiClient.getCalComEventTypes();
      console.log('[CALCOM] Event types API response received:', data);
      console.log('[CALCOM] Response type:', typeof data);
      console.log('[CALCOM] Response keys:', Object.keys(data || {}));
      console.log('[CALCOM] Full response JSON:', JSON.stringify(data, null, 2));
      
      // Handle different possible response structures
      let eventTypesArray: CalComEventType[] = [];
      
      if (Array.isArray(data)) {
        // Response is directly an array
        console.log('[CALCOM] Response is directly an array');
        eventTypesArray = data;
      } else if (data?.event_types && Array.isArray(data.event_types)) {
        // Response has event_types key
        console.log('[CALCOM] Response has event_types key');
        eventTypesArray = data.event_types;
      } else if (data?.data && Array.isArray(data.data)) {
        // Response has data key (like Cal.com API format)
        console.log('[CALCOM] Response has data key');
        eventTypesArray = data.data;
      } else {
        console.log('[CALCOM] Unknown response structure, trying to extract event types');
        // Try to find any array in the response
        for (const key in data) {
          if (Array.isArray(data[key])) {
            console.log(`[CALCOM] Found array in key: ${key}`);
            eventTypesArray = data[key];
            break;
          }
        }
      }
      
      console.log('[CALCOM] Event types array:', eventTypesArray);
      console.log('[CALCOM] Event types array type:', Array.isArray(eventTypesArray));
      console.log('[CALCOM] Event types count:', eventTypesArray.length);
      console.log('[CALCOM] Setting event types state with:', eventTypesArray);
      
      setEventTypes(eventTypesArray);
      
      if (!eventTypesArray || eventTypesArray.length === 0) {
        console.log('[CALCOM] No event types found in response');
        console.log('[CALCOM] Full response data:', JSON.stringify(data, null, 2));
      } else {
        console.log('[CALCOM] Successfully loaded', eventTypesArray.length, 'event types');
      }
    } catch (error: any) {
      console.error('[CALCOM] Failed to load event types:', error);
      console.error('[CALCOM] Error type:', error?.constructor?.name);
      console.error('[CALCOM] Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        stack: error?.stack
      });
      setEventTypesError(error?.response?.data?.detail || error?.message || 'Failed to load event types');
      setEventTypes([]);
    } finally {
      setEventTypesLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      if (!apiKey || !apiKey.trim()) {
        alert('Please enter your Cal.com API key');
        setConnecting(false);
        return;
      }
      
      console.log('[CALCOM] Connecting with API key...');
      await apiClient.connectCalComWithApiKey(apiKey.trim());
      setApiKey('');
      await loadStatus();
    } catch (error: any) {
      console.error('[CALCOM] Failed to connect:', error);
      let errorMessage = 'Failed to connect Cal.com. Please check your configuration.';
      
      if (error?.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      alert(`Cal.com Connection Error:\n\n${errorMessage}\n\nPlease verify:\n1. Your API key is correct\n2. The API key hasn't expired\n3. You copied the full API key (including the "cal_" or "cal_live_" prefix)`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Cal.com account?')) {
      return;
    }
    
    setDisconnecting(true);
    try {
      await apiClient.disconnectCalCom();
      await loadStatus();
      setAllBookings([]);
      setEventTypes([]);
    } catch (error) {
      console.error('Failed to disconnect Cal.com:', error);
      alert('Failed to disconnect Cal.com account.');
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

  const formatDuration = (minutes: number) => {
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

  // Filter bookings based on selected tab
  const getFilteredBookings = () => {
    const now = new Date();
    if (bookingsTab === 'upcoming') {
      return allBookings.filter(booking => {
        try {
          const startTime = new Date(booking.startTime);
          return startTime >= now;
        } catch {
          return false;
        }
      });
    } else {
      return allBookings.filter(booking => {
        try {
          const startTime = new Date(booking.startTime);
          return startTime < now;
        } catch {
          return false;
        }
      });
    }
  };

  const filteredBookings = getFilteredBookings();

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="text-gray-500 dark:text-gray-400">Loading Cal.com status...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cal.com Integration</h2>
          {status?.connected && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  loadBookings(0);
                  loadEventTypes();
                }}
                disabled={bookingsLoading || eventTypesLoading}
                className="px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
              >
                Refresh All
              </button>
              <a
                href="https://app.cal.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
              >
                Open Cal.com Dashboard
              </a>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          )}
        </div>

        {status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-3 w-3 bg-green-400 rounded-full"></div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Connected</p>
                {status.account_email && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{status.account_email}</p>
                )}
                {status.account_name && status.account_name !== status.account_email && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{status.account_name}</p>
                )}
              </div>
            </div>

            {status.message && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{status.message}</p>
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
              </div>
            </div>

            {status?.message && (
              <p className="text-sm text-gray-600 dark:text-gray-400">{status.message}</p>
            )}

            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="calcom-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Cal.com API Key
                </label>
                <input
                  id="calcom-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Cal.com API key"
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Get your API key from{' '}
                  <a
                    href="https://app.cal.com/settings/developer/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-500 hover:underline"
                  >
                    Cal.com Settings → Developer → API Keys
                  </a>
                </p>
              </div>

              <button
                onClick={handleConnect}
                disabled={connecting || !apiKey.trim()}
                className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? 'Connecting...' : 'Connect with API Key'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bookings Section */}
      {status?.connected && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bookings</h2>
            <button
              onClick={() => loadBookings(0)}
              disabled={bookingsLoading}
              className="px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
            >
              {bookingsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {bookingsError && (
            <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-md">
              <p className="text-sm text-red-800 dark:text-red-200">
                <strong>Error loading bookings:</strong> {bookingsError}
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

          {bookingsLoading && allBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading bookings...</div>
          ) : filteredBookings.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="text-base font-medium mb-2">
                No {bookingsTab === 'upcoming' ? 'upcoming' : 'past'} bookings found
              </p>
              <p className="text-sm">
                {bookingsError 
                  ? `Error: ${bookingsError}` 
                  : bookingsTab === 'upcoming'
                  ? "You don't have any upcoming bookings. Bookings will appear here once someone schedules a meeting through your Cal.com links."
                  : "You don't have any past bookings yet."}
              </p>
              {!bookingsError && allBookings.length > 0 && (
                <p className="text-xs mt-2 text-gray-400">
                  Showing {filteredBookings.length} of {allBookings.length} total bookings.
                </p>
              )}
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
                        Attendees
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
                    {filteredBookings.map((booking) => (
                      <tr key={booking.id} className="hover:bg-white/5">
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
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination and Summary */}
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Showing {filteredBookings.length} {bookingsTab === 'upcoming' ? 'upcoming' : 'past'} booking{filteredBookings.length !== 1 ? 's' : ''}
                  {allBookings.length !== filteredBookings.length && (
                    <span className="ml-2">({allBookings.length} total loaded)</span>
                  )}
                </div>
                {bookingsTotal && bookingsTotal > 50 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadBookings(Math.max(0, bookingsOffset - 50))}
                      disabled={bookingsOffset === 0 || bookingsLoading}
                      className="px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => loadBookings(bookingsOffset + 50)}
                      disabled={!bookingsTotal || bookingsOffset + 50 >= bookingsTotal || bookingsLoading}
                      className="px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Event Types Section */}
      {status?.connected && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Event Types</h2>
            <button
              onClick={loadEventTypes}
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

          {eventTypesLoading && eventTypes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading event types...</div>
          ) : eventTypes.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="text-base font-medium mb-2">No event types found</p>
              <p className="text-sm">
                {eventTypesError 
                  ? `Error: ${eventTypesError}` 
                  : "You don't have any event types configured yet. Create event types in your Cal.com dashboard to allow people to book meetings with you."}
              </p>
              {!eventTypesError && (
                <div className="mt-4">
                  <a
                    href="https://app.cal.com/event-types"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
                  >
                    Create Event Type in Cal.com
                  </a>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {eventTypes.map((eventType) => (
                <div
                  key={eventType.id}
                  className="p-4 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {eventType.title}
                  </h3>
                  {eventType.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                      {eventType.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">
                      Duration: {eventType.length || eventType.lengthInMinutes 
                        ? formatDuration(eventType.length || eventType.lengthInMinutes || 0)
                        : 'N/A'}
                    </span>
                    {eventType.price && (
                      <span className="text-gray-900 dark:text-gray-100 font-medium">
                        {eventType.currency || '$'}{eventType.price}
                      </span>
                    )}
                  </div>
                  {eventType.requiresConfirmation && (
                    <div className="mt-2">
                      <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded">
                        Requires Confirmation
                      </span>
                    </div>
                  )}
                  {eventType.hidden && (
                    <div className="mt-2">
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200 rounded">
                        Hidden
                      </span>
                    </div>
                  )}
                  {eventType.bookingUrl && (
                    <div className="mt-3 pt-3 border-t border-white/10">
                      <button
                        onClick={() => copyToClipboard(eventType.bookingUrl!, `booking-url-${eventType.id}`, 'invite link')}
                        className={`w-full text-left text-sm text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline cursor-pointer transition-colors break-all ${
                          copiedId === `booking-url-${eventType.id}` ? 'text-green-500 dark:text-green-400' : ''
                        }`}
                        title="Click to copy invite link"
                      >
                        {copiedId === `booking-url-${eventType.id}` ? '✓ Copied!' : `📋 ${eventType.bookingUrl}`}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
