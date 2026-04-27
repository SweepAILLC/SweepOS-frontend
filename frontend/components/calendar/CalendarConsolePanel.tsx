import { useState, useEffect, useRef } from 'react';
import Cookies from 'js-cookie';
import { apiClient, type CalendarSyncedBookingRow } from '@/lib/api';
import { clearCalendarIntegrationStatusCache } from '@/lib/cache';
import { 
  CalComStatus, CalComEventType,
  CalendlyStatus, CalendlyScheduledEvent, CalendlyEventType
} from '@/types/integration';
import type { Client } from '@/types/client';
import EventDetailsModal from './EventDetailsModal';
import { useLoading } from '@/contexts/LoadingContext';
import { ShowUpVsCloseRateChart } from '@/components/owner/OwnerHealthTrendCharts';

type BookingsTab = 'upcoming' | 'past';
type CalendarProvider = 'calcom' | 'calendly' | null;

function orgIdFromAccessToken(): string {
  if (typeof window === 'undefined') return 'anon';
  const token = Cookies.get('access_token');
  if (!token) return 'anon';
  try {
    const parts = token.split('.');
    if (parts.length < 2) return 'anon';
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = JSON.parse(atob(padded)) as { org_id?: string };
    return json.org_id != null ? String(json.org_id) : 'anon';
  } catch {
    return 'anon';
  }
}

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
  const connectedProviderRef = useRef<CalendarProvider>(connectedProvider);
  connectedProviderRef.current = connectedProvider;
  /** Serialize sync+fetch so opening Calendar never stacks multiple POST /check-ins/sync (blocks API / exhausts browser connections). */
  const calendarRefreshChainRef = useRef<Promise<void>>(Promise.resolve());

  // Bookings: canonical rows from synced client_check_ins (after POST /clients/check-ins/sync)
  const [bookingsTab, setBookingsTab] = useState<BookingsTab>('upcoming');
  const [syncedUpcoming, setSyncedUpcoming] = useState<CalendarSyncedBookingRow[]>([]);
  const [syncedPast, setSyncedPast] = useState<CalendarSyncedBookingRow[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  
  // Event types state
  const [calcomEventTypes, setCalcomEventTypes] = useState<CalComEventType[]>([]);
  const [calendlyEventTypes, setCalendlyEventTypes] = useState<CalendlyEventType[]>([]);
  const [eventTypesLoading, setEventTypesLoading] = useState(false);
  const [eventTypesError, setEventTypesError] = useState<string | null>(null);
  const [salesCallEventTypeIds, setSalesCallEventTypeIds] = useState<string[]>([]);
  
  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  type CloseRateSection = { total_sales_calls: number; closed_count: number; close_rate_pct: number | null };

  // Calendar data summary (close rate from API)
  const [closeRateData, setCloseRateData] = useState<{ all_time: CloseRateSection; last_30d: CloseRateSection } | null>(null);
  // Show up rate from calendar upcoming summary (for Calendar data summary box)
  const [showUpRateSummary, setShowUpRateSummary] = useState<{ show_up_rate: number | null; last_month_count?: number } | null>(null);
  const [showUpRateLoading, setShowUpRateLoading] = useState(false);

  type MonthlyCoachingRow = {
    period_label: string;
    period_start: string;
    period_end: string;
    show_up_rate_pct: number | null;
    close_rate_pct: number | null;
  };
  const [monthlyCoachingPeriods, setMonthlyCoachingPeriods] = useState<MonthlyCoachingRow[]>([]);
  const [monthlyCoachingLoading, setMonthlyCoachingLoading] = useState(false);

  // Manual booking modal (same as client detail drawer: create manual check-in)
  const [showManualBookingModal, setShowManualBookingModal] = useState(false);
  const [manualBookingPrefillDate, setManualBookingPrefillDate] = useState<Date | null>(null);
  const [manualBookingClients, setManualBookingClients] = useState<Client[]>([]);
  const [manualBookingClientsLoading, setManualBookingClientsLoading] = useState(false);
  const [manualBookingForm, setManualBookingForm] = useState({
    clientId: '',
    title: 'Manual Check-In',
    date: '',
    time: '12:00',
    duration: 60,
    status: 'scheduled' as 'scheduled' | 'completed' | 'cancelled' | 'no_show',
  });
  const [submittingManualBooking, setSubmittingManualBooking] = useState(false);

  useEffect(() => {
    if (showManualBookingModal) {
      setManualBookingClientsLoading(true);
      apiClient.getClients(undefined, true)
        .then((list: Client[]) => setManualBookingClients(list || []))
        .catch(() => setManualBookingClients([]))
        .finally(() => setManualBookingClientsLoading(false));
      const d = manualBookingPrefillDate || new Date();
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setManualBookingForm(prev => ({ ...prev, date: dateStr }));
    } else {
      setManualBookingPrefillDate(null);
    }
  }, [showManualBookingModal]);

  // Event details modal state (bookings table → full API modal)
  const [selectedEvent, setSelectedEvent] = useState<{
    checkInId?: string;
    provider: 'calcom' | 'calendly' | 'manual';
    id: string | number;
    uri?: string;
  } | null>(null);

  useEffect(() => {
    loadStatuses();
  }, []);

  useEffect(() => {
    setMonthlyCoachingLoading(true);
    apiClient
      .getCalendarMonthlyCoachingMetrics()
      .then((d) => setMonthlyCoachingPeriods(Array.isArray(d?.periods) ? d.periods : []))
      .catch(() => setMonthlyCoachingPeriods([]))
      .finally(() => setMonthlyCoachingLoading(false));
  }, []);

  /** Re-fetch synced bookings from the DB without triggering a provider re-sync. */
  const refetchSyncedBookings = async (): Promise<boolean> => {
    const provider = connectedProviderRef.current;
    if (!provider) return false;
    try {
      const data = await apiClient.getCalendarSyncedBookings({
        upcoming_limit: 150,
        past_limit: 150,
        provider,
      });
      setSyncedUpcoming(data.upcoming || []);
      setSyncedPast(data.past || []);
      setLastSyncedAt(data.server_time || null);
      // Persist for instant loads on tab open / refresh.
      if (typeof sessionStorage !== 'undefined') {
        const org = orgIdFromAccessToken();
        sessionStorage.setItem(
          `calendar_synced_bookings_${provider}_${org}`,
          JSON.stringify({
            server_time: data.server_time || null,
            upcoming: data.upcoming || [],
            past: data.past || [],
            saved_at_ms: Date.now(),
          })
        );
      }
      return true;
    } catch {
      return false;
    }
  };

  const refreshSyncedCalendar = async (opts?: { silent?: boolean }) => {
    const provider = connectedProviderRef.current;
    if (!provider) return;

    const task = async () => {
      if (!opts?.silent) {
        setBookingsLoading(true);
        setBookingsError(null);
      }
      const bookingParams = {
        upcoming_limit: 150,
        past_limit: 150,
        provider,
      } as const;
      try {
        // Mount effect calls refetchSyncedBookings() for immediate DB rows; avoid an extra GET here
        // while POST /check-ins/sync runs (reduces DB pool pressure on the API).
        await apiClient.syncCheckIns();
        // Mark last successful provider sync (used to avoid doing this every tab open).
        try {
          if (typeof sessionStorage !== 'undefined') {
            const org = orgIdFromAccessToken();
            sessionStorage.setItem(`calendar_last_sync_ms_${provider}_${org}`, String(Date.now()));
          }
        } catch {
          // ignore storage errors
        }
        let data: Awaited<ReturnType<typeof apiClient.getCalendarSyncedBookings>>;
        try {
          data = await apiClient.getCalendarSyncedBookings(bookingParams);
        } catch {
          await new Promise((r) => setTimeout(r, 1500));
          data = await apiClient.getCalendarSyncedBookings(bookingParams);
        }
        setSyncedUpcoming(data.upcoming || []);
        setSyncedPast(data.past || []);
        setLastSyncedAt(data.server_time || null);
        // Persist for instant loads on tab open / refresh.
        try {
          if (typeof sessionStorage !== 'undefined') {
            const org = orgIdFromAccessToken();
            sessionStorage.setItem(
              `calendar_synced_bookings_${provider}_${org}`,
              JSON.stringify({
                server_time: data.server_time || null,
                upcoming: data.upcoming || [],
                past: data.past || [],
                saved_at_ms: Date.now(),
              })
            );
          }
        } catch {
          // ignore storage errors
        }
      } catch (error: unknown) {
        const err = error as { response?: { data?: { detail?: string }; status?: number }; message?: string };
        console.error('Calendar sync failed:', error);
        if (!opts?.silent) {
          const recovered = await refetchSyncedBookings();
          if (recovered) {
            setBookingsError(null);
          } else {
            setBookingsError(err?.response?.data?.detail || err?.message || 'Failed to sync calendar');
          }
        }
      } finally {
        if (!opts?.silent) setBookingsLoading(false);
      }
    };

    const next = calendarRefreshChainRef.current.then(() => task());
    calendarRefreshChainRef.current = next.catch(() => {});
    await next;
  };

  // Load data when a provider is connected: sync from provider APIs into DB, then show canonical rows
  useEffect(() => {
    setSyncedUpcoming([]);
    setSyncedPast([]);
    setLastSyncedAt(null);
    setBookingsError(null);

    if (connectedProvider === 'calcom') {
      // 1) Instant paint from last known DB rows (session cache)
      try {
        if (typeof sessionStorage !== 'undefined') {
          const org = orgIdFromAccessToken();
          const raw = sessionStorage.getItem(`calendar_synced_bookings_calcom_${org}`);
          if (raw) {
            const parsed = JSON.parse(raw) as { server_time?: string | null; upcoming?: CalendarSyncedBookingRow[]; past?: CalendarSyncedBookingRow[] };
            if (Array.isArray(parsed?.upcoming)) setSyncedUpcoming(parsed.upcoming);
            if (Array.isArray(parsed?.past)) setSyncedPast(parsed.past);
            if (typeof parsed?.server_time === 'string') setLastSyncedAt(parsed.server_time);
          }
        }
      } catch {
        // ignore cache parse errors
      }
      // 2) Revalidate from DB quickly
      void refetchSyncedBookings();
      // 3) Heavy provider sync only when stale (or user hits Refresh)
      const t = setTimeout(() => {
        try {
          if (typeof sessionStorage === 'undefined') return void refreshSyncedCalendar({ silent: true });
          const org = orgIdFromAccessToken();
          const lastMsStr = sessionStorage.getItem(`calendar_last_sync_ms_calcom_${org}`);
          const lastMs = lastMsStr ? parseInt(lastMsStr, 10) : 0;
          const stale = !Number.isFinite(lastMs) || Date.now() - lastMs > 10 * 60 * 1000;
          if (stale) void refreshSyncedCalendar({ silent: true });
        } catch {
          void refreshSyncedCalendar({ silent: true });
        }
      }, 250);
      loadCalcomEventTypes();
      return () => clearTimeout(t);
    }
    if (connectedProvider === 'calendly') {
      // 1) Instant paint from last known DB rows (session cache)
      try {
        if (typeof sessionStorage !== 'undefined') {
          const org = orgIdFromAccessToken();
          const raw = sessionStorage.getItem(`calendar_synced_bookings_calendly_${org}`);
          if (raw) {
            const parsed = JSON.parse(raw) as { server_time?: string | null; upcoming?: CalendarSyncedBookingRow[]; past?: CalendarSyncedBookingRow[] };
            if (Array.isArray(parsed?.upcoming)) setSyncedUpcoming(parsed.upcoming);
            if (Array.isArray(parsed?.past)) setSyncedPast(parsed.past);
            if (typeof parsed?.server_time === 'string') setLastSyncedAt(parsed.server_time);
          }
        }
      } catch {
        // ignore cache parse errors
      }
      // 2) Revalidate from DB quickly
      void refetchSyncedBookings();
      // 3) Heavy provider sync only when stale (or user hits Refresh)
      const t = setTimeout(() => {
        try {
          if (typeof sessionStorage === 'undefined') return void refreshSyncedCalendar({ silent: true });
          const org = orgIdFromAccessToken();
          const lastMsStr = sessionStorage.getItem(`calendar_last_sync_ms_calendly_${org}`);
          const lastMs = lastMsStr ? parseInt(lastMsStr, 10) : 0;
          const stale = !Number.isFinite(lastMs) || Date.now() - lastMs > 10 * 60 * 1000;
          if (stale) void refreshSyncedCalendar({ silent: true });
        } catch {
          void refreshSyncedCalendar({ silent: true });
        }
      }, 250);
      loadCalendlyEventTypes();
      return () => clearTimeout(t);
    }
    if (!connectedProvider && !loading && !bookingsLoading && !eventTypesLoading) {
      setGlobalLoading(false);
    }
  }, [connectedProvider]);

  // Poll DB only (no provider re-sync) — full sync is heavy and was starving Terminal + other tabs.
  useEffect(() => {
    if (!connectedProvider) return;
    const id = setInterval(() => void refetchSyncedBookings(), 45000);
    return () => clearInterval(id);
  }, [connectedProvider]);

  // Load close rate when connected and refetch periodically so it updates after Stripe webhooks
  useEffect(() => {
    if (!connectedProvider) {
      setCloseRateData(null);
      return;
    }
    const loadCloseRate = () =>
      apiClient.getCalendarSalesCloseRate().then(setCloseRateData).catch(() => setCloseRateData(null));
    loadCloseRate();
    const interval = setInterval(loadCloseRate, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [connectedProvider]);

  // Load show up rate when connected (for Show up rate section)
  useEffect(() => {
    if (!connectedProvider) {
      setShowUpRateSummary(null);
      return;
    }
    setShowUpRateLoading(true);
    apiClient.getCalendarUpcomingSummary()
      .then((data: any) => {
        setShowUpRateSummary({
          show_up_rate: data?.show_up_rate ?? null,
          last_month_count: data?.last_month_count,
        });
      })
      .catch(() => setShowUpRateSummary(null))
      .finally(() => setShowUpRateLoading(false));
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
    clearCalendarIntegrationStatusCache();
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
      setGlobalLoading(false);
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

  const loadSalesCallEventTypes = async () => {
    if (!connectedProvider) return;
    try {
      const data = await apiClient.listSalesCallEventTypes(connectedProvider);
      setSalesCallEventTypeIds(data.event_type_ids || []);
    } catch {
      setSalesCallEventTypeIds([]);
    }
  };

  useEffect(() => {
    if (connectedProvider) {
      loadSalesCallEventTypes();
    } else {
      setSalesCallEventTypeIds([]);
    }
  }, [connectedProvider]);

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

      const detail = error?.response?.data?.detail;
      if (detail != null && typeof detail !== 'string') {
        try {
          errorMessage = JSON.stringify(detail);
        } catch {
          errorMessage = String(detail);
        }
      } else if (typeof detail === 'string') {
        errorMessage = detail;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      // Ghost token row can make status look "not connected" while connect-* still blocks the other provider.
      if (
        typeof detail === 'string' &&
        ((selectedProvider === 'calendly' && detail.includes('Cal.com is already connected')) ||
          (selectedProvider === 'calcom' && detail.includes('Calendly is already connected')))
      ) {
        clearCalendarIntegrationStatusCache();
        await loadStatuses();
        errorMessage =
          `${detail}\n\n` +
          'Connection status was just refreshed. If a provider still appears connected above, disconnect it first, then try again. ' +
          'If you now see Not connected, submit your API key again.';
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
      setSyncedUpcoming([]);
      setSyncedPast([]);
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

  const PAST_BOOKINGS_LIMIT = 50;

  // Get filtered bookings/events based on selected tab. Past tab limited to last 50 (most recent first).
  const getFilteredBookings = (): CalendarSyncedBookingRow[] => {
    if (!connectedProvider) return [];
    if (bookingsTab === 'upcoming') return syncedUpcoming;
    return syncedPast.slice(0, PAST_BOOKINGS_LIMIT);
  };

  const filteredBookings = getFilteredBookings();
  const currentStatus = connectedProvider === 'calcom' ? calcomStatus : calendlyStatus;
  const currentEventTypes = connectedProvider === 'calcom' ? calcomEventTypes : calendlyEventTypes;

  // Count upcoming vs past from full list for "all calendar data" summary
  const upcomingCount = syncedUpcoming.length;
  const pastCount = syncedPast.length;

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
                  void refreshSyncedCalendar();
                  if (connectedProvider === 'calcom') loadCalcomEventTypes();
                  else loadCalendlyEventTypes();
                  apiClient.getCalendarSalesCloseRate().then(setCloseRateData).catch(() => setCloseRateData(null));
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

      {/* Monthly coaching trends — visible to all roles on Calendar tab */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Calendar trends</h2>
        <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 p-4">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
            Show-up vs close rate by month
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Past Cal.com / Calendly check-ins in your workspace. Close rate uses the same definition as elsewhere (sales
            calls where the client has a succeeded Stripe payment).
          </p>
          {monthlyCoachingLoading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Loading trends…</p>
          ) : monthlyCoachingPeriods.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No monthly data yet — connect a calendar and sync check-ins to build history.
            </p>
          ) : (
            <ShowUpVsCloseRateChart
              data={monthlyCoachingPeriods}
              xAxisMode="tilted"
              title=""
              description=""
            />
          )}
        </div>
      </div>

      {/* All calendar data summary */}
      {connectedProvider && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Calendar data
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{upcomingCount}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Upcoming</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{pastCount}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Past</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {closeRateData?.all_time?.close_rate_pct != null ? `${closeRateData.all_time.close_rate_pct}%` : '—'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                Sales close rate
                {closeRateData && closeRateData.all_time.total_sales_calls > 0 && (
                  <span className="block text-xs text-gray-500 dark:text-gray-500">
                    All time: {closeRateData.all_time.closed_count} / {closeRateData.all_time.total_sales_calls} closed
                  </span>
                )}
                {closeRateData && closeRateData.last_30d && (
                  <span className="block text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                    Last 30 days: {closeRateData.last_30d.close_rate_pct}%
                  </span>
                )}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {showUpRateSummary?.show_up_rate != null ? `${showUpRateSummary.show_up_rate}%` : '—'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">Show up rate</div>
            </div>
          </div>
        </div>
      )}

      {/* Bookings/Events Section */}
      {connectedProvider && (
        <div className="glass-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {connectedProvider === 'calcom' ? 'Bookings' : 'Scheduled Events'}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setManualBookingPrefillDate(null);
                  setShowManualBookingModal(true);
                }}
                className="px-3 py-1.5 text-sm font-medium rounded-md glass-button neon-glow"
              >
                Add manual booking
              </button>
              <button
                onClick={() => {
                  void refreshSyncedCalendar();
                  apiClient.getCalendarSalesCloseRate().then(setCloseRateData).catch(() => setCloseRateData(null));
                }}
                disabled={bookingsLoading}
                className="px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
              >
                {bookingsLoading ? 'Syncing…' : 'Refresh'}
              </button>
            </div>
          </div>
          {lastSyncedAt && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Last synced: {new Date(lastSyncedAt).toLocaleString()} · Data is pulled from {connectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'} into your workspace, then shown here.
            </p>
          )}

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

          {bookingsTab === 'past' && !bookingsLoading && closeRateData && (
            <div className="mb-3 text-sm text-gray-600 dark:text-gray-400 space-y-1">
              <div>
                All time sales close rate:{" "}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {closeRateData.all_time.close_rate_pct}%
                </span>{" "}
                <span className="ml-1">
                  ({closeRateData.all_time.closed_count} closed / {closeRateData.all_time.total_sales_calls} sales calls)
                </span>
              </div>
              <div>
                Last 30 days sales close rate:{" "}
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {closeRateData.last_30d.close_rate_pct}%
                </span>{" "}
                <span className="ml-1">
                  ({closeRateData.last_30d.closed_count} closed / {closeRateData.last_30d.total_sales_calls} sales calls)
                </span>
              </div>
            </div>
          )}

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
                        Client / attendee
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Call type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {(filteredBookings as CalendarSyncedBookingRow[]).map((row) => {
                      const loc = row.meeting_url || row.location || '';
                      const statusClass =
                        row.display_status === 'cancelled'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : row.display_status === 'no_show'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                          : row.display_status === 'confirmed'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200';
                      const statusText =
                        row.display_status === 'cancelled'
                          ? 'Cancelled'
                          : row.display_status === 'no_show'
                          ? 'No-show'
                          : row.display_status === 'confirmed'
                          ? 'Confirmed'
                          : 'Completed';
                      return (
                        <tr
                          key={row.id}
                          className="hover:bg-white/5 cursor-pointer"
                          onClick={() =>
                            setSelectedEvent({
                              checkInId: row.id,
                              provider: row.provider,
                              id: row.event_id,
                              uri: row.event_uri || undefined,
                            })
                          }
                        >
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {row.title || 'Untitled'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {row.start_time ? formatDateTime(row.start_time) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {row.end_time ? formatDateTime(row.end_time) : '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            <div className="font-medium">{row.client_name || '—'}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{row.attendee_email}</div>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs ${statusClass}`}>{statusText}</span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {row.is_sales_call ? (
                              <span className="text-xs">
                                <span className="px-2 py-1 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">Sales</span>
                                {row.sale_closed === true && (
                                  <span className="ml-1 px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">Closed</span>
                                )}
                                {row.sale_closed === false && (
                                  <span className="ml-1 px-2 py-1 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Open</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500 dark:text-gray-400">Check-in</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {loc ? (
                              isUrl(loc) ? (
                                <a
                                  href={loc}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline cursor-pointer transition-colors"
                                  title="Open meeting link in a new tab"
                                >
                                  Link
                                </a>
                              ) : (
                                loc
                              )
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {bookingsTab === 'past' && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                  Showing the {Math.min(filteredBookings.length, PAST_BOOKINGS_LIMIT)} most recent past {connectedProvider === 'calcom' ? 'bookings' : 'events'}.
                  {' '}
                  <a
                    href={connectedProvider === 'calcom' ? 'https://app.cal.com' : 'https://calendly.com'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 underline"
                  >
                    View all past {connectedProvider === 'calcom' ? 'bookings' : 'events'} in {connectedProvider === 'calcom' ? 'Cal.com' : 'Calendly'}
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Manual booking modal (same as client detail drawer: manual check-in) */}
      {showManualBookingModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowManualBookingModal(false)} aria-hidden />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Add manual booking</h3>
              <button
                type="button"
                onClick={() => setShowManualBookingModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!manualBookingForm.clientId) {
                  alert('Please select a client.');
                  return;
                }
                const dateStr = manualBookingForm.date || new Date().toISOString().split('T')[0];
                const [h, m] = manualBookingForm.time.split(':').map(Number);
                const startTime = new Date(dateStr + 'T00:00:00');
                startTime.setHours(h || 12, m || 0, 0, 0);
                const endTime = new Date(startTime);
                endTime.setMinutes(endTime.getMinutes() + manualBookingForm.duration);
                const options =
                  manualBookingForm.status === 'completed'
                    ? { completed: true, cancelled: false, no_show: false }
                    : manualBookingForm.status === 'cancelled'
                    ? { completed: false, cancelled: true, no_show: false }
                    : manualBookingForm.status === 'no_show'
                    ? { completed: false, cancelled: false, no_show: true }
                    : undefined;
                setSubmittingManualBooking(true);
                try {
                  await apiClient.createManualCheckIn(
                    manualBookingForm.clientId,
                    manualBookingForm.title,
                    startTime.toISOString(),
                    endTime.toISOString(),
                    options
                  );
                  setShowManualBookingModal(false);
                  setManualBookingForm({ clientId: '', title: 'Manual Check-In', date: '', time: '12:00', duration: 60, status: 'scheduled' });
                  apiClient.getCalendarUpcomingSummary().then((data: any) => setShowUpRateSummary({ show_up_rate: data?.show_up_rate ?? null, last_month_count: data?.last_month_count })).catch(() => {});
                  void refetchSyncedBookings();
                  window.dispatchEvent(new CustomEvent('calendarBookingsUpdated'));
                } catch (err: any) {
                  console.error(err);
                  alert(err?.response?.data?.detail || err?.message || 'Failed to create manual booking.');
                } finally {
                  setSubmittingManualBooking(false);
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client *</label>
                <select
                  required
                  value={manualBookingForm.clientId}
                  onChange={(e) => setManualBookingForm(f => ({ ...f, clientId: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
                  disabled={manualBookingClientsLoading}
                >
                  <option value="">Select client...</option>
                  {manualBookingClients.map(c => (
                    <option key={c.id} value={c.id}>
                      {([c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || c.id)}
                    </option>
                  ))}
                </select>
                {manualBookingClientsLoading && <p className="text-xs text-gray-500 mt-1">Loading clients...</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  value={manualBookingForm.title}
                  onChange={(e) => setManualBookingForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={manualBookingForm.date}
                  onChange={(e) => setManualBookingForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
                <input
                  type="time"
                  value={manualBookingForm.time}
                  onChange={(e) => setManualBookingForm(f => ({ ...f, time: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (minutes)</label>
                <select
                  value={manualBookingForm.duration}
                  onChange={(e) => setManualBookingForm(f => ({ ...f, duration: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value={15}>15 min</option>
                  <option value={30}>30 min</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  value={manualBookingForm.status}
                  onChange={(e) => setManualBookingForm(f => ({ ...f, status: e.target.value as 'scheduled' | 'completed' | 'cancelled' | 'no_show' }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="no_show">No-show</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submittingManualBooking || !manualBookingForm.clientId}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
                >
                  {submittingManualBooking ? 'Creating...' : 'Create booking'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualBookingModal(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 text-sm font-medium rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
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
                loadSalesCallEventTypes();
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
                (currentEventTypes as CalComEventType[]).map((eventType) => {
                  const etId = String(eventType.id);
                  const isSalesCall = salesCallEventTypeIds.includes(etId);
                  return (
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
                        <p className="pt-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                if (isSalesCall) {
                                  await apiClient.removeSalesCallEventType('calcom', etId);
                                } else {
                                  await apiClient.addSalesCallEventType('calcom', etId);
                                }
                                await loadSalesCallEventTypes();
                                void refreshSyncedCalendar({ silent: true });
                              } catch (e: any) {
                                console.error(e);
                                const msg = e?.response?.data?.detail || e?.message || 'Request failed';
                                alert(msg);
                              }
                            }}
                            className={`text-xs font-medium px-2 py-1 rounded ${isSalesCall ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                          >
                            {isSalesCall ? '✓ Sales call' : 'Mark as sales call'}
                          </button>
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                (currentEventTypes as CalendlyEventType[]).map((eventType) => {
                  const etId = eventType.uri;
                  const isSalesCall = salesCallEventTypeIds.includes(etId);
                  return (
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
                        <p className="pt-2">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                if (isSalesCall) {
                                  await apiClient.removeSalesCallEventType('calendly', etId);
                                } else {
                                  await apiClient.addSalesCallEventType('calendly', etId);
                                }
                                await loadSalesCallEventTypes();
                                void refreshSyncedCalendar({ silent: true });
                              } catch (e: any) {
                                console.error(e);
                                const msg = e?.response?.data?.detail || e?.message || 'Request failed';
                                alert(msg);
                              }
                            }}
                            className={`text-xs font-medium px-2 py-1 rounded ${isSalesCall ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                          >
                            {isSalesCall ? '✓ Sales call' : 'Mark as sales call'}
                          </button>
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Event Details Modal (from bookings table only) */}
      {selectedEvent && (
        <EventDetailsModal
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          provider={selectedEvent.provider}
          eventId={selectedEvent.id}
          eventUri={selectedEvent.uri}
          checkInId={selectedEvent.checkInId}
          onSalesUpdated={() => {
            // Re-fetch DB rows without a provider re-sync so manual edits
            // made in the modal are reflected immediately.
            void refetchSyncedBookings();

            apiClient
              .getCalendarSalesCloseRate()
              .then(setCloseRateData)
              .catch(() => setCloseRateData(null));

            setShowUpRateLoading(true);
            apiClient
              .getCalendarUpcomingSummary()
              .then((data: any) => {
                setShowUpRateSummary({
                  show_up_rate: data?.show_up_rate ?? null,
                  last_month_count: data?.last_month_count,
                });
              })
              .catch(() => setShowUpRateSummary(null))
              .finally(() => setShowUpRateLoading(false));

            window.dispatchEvent(new CustomEvent('calendarSalesFlagsUpdated'));
            window.dispatchEvent(new CustomEvent('calendarBookingsUpdated'));
          }}
        />
      )}
    </div>
  );
}

