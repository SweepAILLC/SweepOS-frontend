import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { 
  CalComStatus, CalComBooking, CalComEventType,
  CalendlyStatus, CalendlyScheduledEvent, CalendlyEventType
} from '@/types/integration';
import type { Client } from '@/types/client';
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
  const [salesCallEventTypeIds, setSalesCallEventTypeIds] = useState<string[]>([]);
  
  // Copy feedback state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  type CloseRateSection = { total_sales_calls: number; closed_count: number; close_rate_pct: number | null };

  // Calendar data summary (close rate from API)
  const [closeRateData, setCloseRateData] = useState<{ all_time: CloseRateSection; last_30d: CloseRateSection } | null>(null);
  // Show up rate from calendar upcoming summary (for Calendar data summary box)
  const [showUpRateSummary, setShowUpRateSummary] = useState<{ show_up_rate: number | null; last_month_count?: number } | null>(null);
  const [showUpRateLoading, setShowUpRateLoading] = useState(false);

  // Calendar view (month navigation)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  // Manual check-ins for the visible month (shown on calendar grid)
  const [manualCalendarEvents, setManualCalendarEvents] = useState<Array<{
    id: string;
    title: string;
    start_time: string;
    end_time?: string | null;
    provider: 'manual';
    is_sales_call?: boolean;
    sale_closed?: boolean | null;
    completed?: boolean;
    cancelled?: boolean;
    no_show?: boolean;
    client_name?: string | null;
  }>>([]);
  const [manualCalendarEventsLoading, setManualCalendarEventsLoading] = useState(false);

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

  // Prevent accidental modal open when the user drags a manual event.
  const dragInProgressRef = useRef(false);
  const [manualUpdating, setManualUpdating] = useState(false);

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
    provider: 'calcom' | 'calendly' | 'manual';
    id: string | number;
    uri?: string;
  } | null>(null);
  // Calendar grid event (no API call – show inline details modal)
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<{
    id?: string;
    title: string;
    start: Date;
    provider: 'calcom' | 'calendly' | 'manual';
    is_sales_call?: boolean;
    sale_closed?: boolean | null;
    completed?: boolean;
    cancelled?: boolean;
    no_show?: boolean;
    eventStatus: 'cancelled' | 'no_show' | 'showed_up' | 'upcoming';
  } | null>(null);

  const [selectedDayMoreEvents, setSelectedDayMoreEvents] = useState<{
    date: Date;
    events: Array<{
      id: string;
      title: string;
      start: Date;
      provider: 'calcom' | 'calendly' | 'manual';
      uri?: string;
      is_sales_call?: boolean;
      sale_closed?: boolean | null;
      completed?: boolean;
      cancelled?: boolean;
      no_show?: boolean;
      eventStatus: 'cancelled' | 'no_show' | 'showed_up' | 'upcoming';
    }>;
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

  // Load manual check-ins for the visible calendar month so they appear on the grid
  useEffect(() => {
    if (!connectedProvider) {
      setManualCalendarEvents([]);
      return;
    }
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0);
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    setManualCalendarEventsLoading(true);
    apiClient.getCalendarManualEvents(start, end)
      .then((data: any) => setManualCalendarEvents(Array.isArray(data) ? data : []))
      .catch(() => setManualCalendarEvents([]))
      .finally(() => setManualCalendarEventsLoading(false));
  }, [connectedProvider, calendarMonth]);

  const refreshManualCalendarEventsForCurrentMonth = async () => {
    if (!connectedProvider) return;
    const y = calendarMonth.getFullYear();
    const m = calendarMonth.getMonth();
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m + 1, 0);
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    setManualCalendarEventsLoading(true);
    try {
      const data: any = await apiClient.getCalendarManualEvents(start, end);
      setManualCalendarEvents(Array.isArray(data) ? data : []);
    } catch {
      setManualCalendarEvents([]);
    } finally {
      setManualCalendarEventsLoading(false);
    }
  };

  const handleDropRescheduleManualEvent = async (draggedEventId: string, targetDate: Date | null) => {
    if (!draggedEventId || !targetDate) return;
    if (!draggedEventId.startsWith('manual_')) return;

    const original = manualCalendarEvents.find(ev => ev.id === draggedEventId);
    if (!original) return;

    // draggedEventId = manual_{uuid}
    const checkInId = draggedEventId.replace(/^manual_/, '');
    const originalStart = new Date(original.start_time);
    const durationMs = original.end_time
      ? new Date(original.end_time).getTime() - originalStart.getTime()
      : 60 * 60 * 1000;

    const newStart = new Date(targetDate);
    newStart.setHours(originalStart.getHours(), originalStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);

    try {
      await apiClient.rescheduleCheckIn(
        checkInId,
        newStart.toISOString(),
        newEnd.toISOString()
      );
      await refreshManualCalendarEventsForCurrentMonth();
      window.dispatchEvent(new CustomEvent('calendarBookingsUpdated'));
    } catch (err: any) {
      console.error('Failed to reschedule manual check-in:', err);
      alert(err?.response?.data?.detail || err?.message || 'Failed to reschedule appointment');
    }
  };

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
      setGlobalLoading(false);
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

  const PAST_BOOKINGS_LIMIT = 50;

  // Get filtered bookings/events based on selected tab. Past tab limited to last 50 (most recent first).
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
        const past = calcomBookings.filter(booking => {
          try {
            const startTime = new Date(booking.startTime);
            return startTime < now;
          } catch {
            return false;
          }
        });
        past.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
        return past.slice(0, PAST_BOOKINGS_LIMIT);
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
        const past = calendlyEvents.filter(event => {
          try {
            const startTime = new Date(event.start_time);
            return startTime < now;
          } catch {
            return false;
          }
        });
        past.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        return past.slice(0, PAST_BOOKINGS_LIMIT);
      }
    }
    return [];
  };

  const filteredBookings = getFilteredBookings();
  const currentStatus = connectedProvider === 'calcom' ? calcomStatus : calendlyStatus;
  const currentEventTypes = connectedProvider === 'calcom' ? calcomEventTypes : calendlyEventTypes;

  // Count upcoming vs past from full list for "all calendar data" summary
  const now = new Date();
  const upcomingCount = connectedProvider === 'calcom'
    ? calcomBookings.filter(b => { try { return new Date(b.startTime) >= now; } catch { return false; } }).length
    : connectedProvider === 'calendly'
    ? calendlyEvents.filter(e => { try { return new Date(e.start_time) >= now; } catch { return false; } }).length
    : 0;
  const pastCount = connectedProvider === 'calcom'
    ? calcomBookings.filter(b => { try { return new Date(b.startTime) < now; } catch { return false; } }).length
    : connectedProvider === 'calendly'
    ? calendlyEvents.filter(e => { try { return new Date(e.start_time) < now; } catch { return false; } }).length
    : 0;

  // Normalized list of all events for calendar (current + past) with status for color coding
  type EventDisplayStatus = 'cancelled' | 'no_show' | 'showed_up' | 'upcoming';
  type CalendarEventItem = {
    id: string;
    title: string;
    start: Date;
    end?: Date | null;
    provider: 'calcom' | 'calendly' | 'manual';
    uri?: string;
    is_sales_call?: boolean;
    sale_closed?: boolean | null;
    completed?: boolean;
    cancelled?: boolean;
    no_show?: boolean;
    eventStatus: EventDisplayStatus;
  };
  const providerEvents: CalendarEventItem[] = connectedProvider === 'calcom'
    ? calcomBookings.map(b => {
        const booking = b as CalComBooking & { uid?: string };
        const start = new Date(booking.startTime);
        const isPast = start < now;
        const isCancelled = booking.status === 'cancelled' || booking.status === 'rejected';
        const isNoShow = !isCancelled && (booking.absentHost === true || (Array.isArray(booking.attendees) && booking.attendees.some((a: { absent?: boolean }) => a.absent === true)));
        let eventStatus: EventDisplayStatus = 'upcoming';
        if (isCancelled) eventStatus = 'cancelled';
        else if (isNoShow && isPast) eventStatus = 'no_show';
        else if (isPast && booking.status === 'accepted') eventStatus = 'showed_up';
        else if (isPast) eventStatus = 'showed_up'; // default past to showed_up
        return {
          id: String(booking.uid ?? booking.id),
          title: booking.title || booking.eventType?.title || 'Untitled',
          start,
          provider: 'calcom' as const,
          is_sales_call: booking.is_sales_call,
          sale_closed: booking.sale_closed,
          eventStatus,
        };
      })
    : connectedProvider === 'calendly'
    ? calendlyEvents.map(e => {
        const ev = e as CalendlyScheduledEvent;
        const start = new Date(ev.start_time);
        const isPast = start < now;
        const isCancelled = ev.status === 'canceled' || ev.status === 'cancelled';
        let eventStatus: EventDisplayStatus = 'upcoming';
        if (isCancelled) eventStatus = 'cancelled';
        else if (isPast) eventStatus = 'showed_up';
        return {
          id: ev.uri?.split('/').pop() || ev.uri || '',
          title: ev.name || 'Untitled',
          start,
          provider: 'calendly',
          uri: ev.uri,
          is_sales_call: ev.is_sales_call,
          sale_closed: ev.sale_closed,
          eventStatus,
        };
      })
    : [];
  const manualEventsAsItems: CalendarEventItem[] = manualCalendarEvents.map(ev => {
    const start = new Date(ev.start_time);
    let eventStatus: EventDisplayStatus = 'upcoming';
    if (ev.cancelled) eventStatus = 'cancelled';
    else if (ev.no_show) eventStatus = 'no_show';
    else if (ev.completed) eventStatus = 'showed_up';
    else eventStatus = 'upcoming';
    return {
      id: ev.id,
      title: ev.client_name ? `${ev.title} (${ev.client_name})` : ev.title,
      start,
      end: ev.end_time ? new Date(ev.end_time) : null,
      provider: 'manual' as const,
      is_sales_call: ev.is_sales_call,
      sale_closed: ev.sale_closed,
      completed: ev.completed,
      cancelled: ev.cancelled,
      no_show: ev.no_show,
      eventStatus,
    };
  });
  const allCalendarEvents: CalendarEventItem[] = [...providerEvents, ...manualEventsAsItems].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) days.push(null);
    for (let day = 1; day <= daysInMonth; day++) days.push(new Date(year, month, day));
    return days;
  };

  const getEventsForDate = (date: Date | null): CalendarEventItem[] => {
    if (!date) return [];
    return allCalendarEvents.filter(ev => (
      ev.start.getFullYear() === date.getFullYear() &&
      ev.start.getMonth() === date.getMonth() &&
      ev.start.getDate() === date.getDate()
    ));
  };

  const getEventButtonClasses = (ev: CalendarEventItem): string => {
    const base = 'block w-full text-left truncate px-1.5 py-0.5 rounded text-xs border-l-2 ';
    const salesBorder = ev.is_sales_call ? 'border-l-indigo-500 ' : 'border-l-slate-400 dark:border-l-slate-500 ';
    switch (ev.eventStatus) {
      case 'cancelled':
        return base + salesBorder + 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 hover:bg-red-200 dark:hover:bg-red-900/60';
      case 'no_show':
        return base + salesBorder + 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900/60';
      case 'showed_up':
        return base + salesBorder + 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-900/60';
      case 'upcoming':
      default:
        return base + salesBorder + (ev.is_sales_call
          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-900/60'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700/60');
    }
  };

  const isTodayDate = (date: Date | null) => {
    if (!date) return false;
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  };

  const calendarMonthName = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const calendarDays = getDaysInMonth(calendarMonth);

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
                apiClient.getCalendarSalesCloseRate().then(setCloseRateData).catch(() => setCloseRateData(null));
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
                        {connectedProvider === 'calcom' ? 'Attendees' : 'Invitees'}
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
                    {connectedProvider === 'calcom' ? (
                      // Cal.com bookings
                      (filteredBookings as CalComBooking[]).map((booking) => (
                        <tr 
                          key={booking.uid ?? booking.id} 
                          className="hover:bg-white/5 cursor-pointer"
                          onClick={() => setSelectedEvent({ provider: 'calcom', id: booking.uid ?? booking.id })}
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
                            {(() => {
                              const isNoShow = booking.status === 'accepted' && (
                                booking.absentHost === true ||
                                (Array.isArray(booking.attendees) && booking.attendees.some((a: { absent?: boolean }) => a.absent === true))
                              );
                              const statusLabel = isNoShow ? 'No-show' : (booking.status === 'accepted' ? 'Confirmed' : booking.status || 'unknown');
                              const title = booking.status === 'cancelled' && booking.cancellationReason
                                ? `Cancelled: ${booking.cancellationReason}${booking.cancelledByEmail ? ` (by ${booking.cancelledByEmail})` : ''}`
                                : isNoShow ? 'Marked as no-show' : undefined;
                              return (
                                <span
                                  title={title}
                                  className={`px-2 py-1 rounded text-xs ${
                                    booking.status === 'accepted' && !isNoShow
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                      : booking.status === 'cancelled' || booking.status === 'rejected'
                                      ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                      : isNoShow
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                                  }`}
                                >
                                  {statusLabel}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {booking.is_sales_call ? (
                              <span className="text-xs">
                                <span className="px-2 py-1 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">Sales</span>
                                {booking.sale_closed === true && (
                                  <span className="ml-1 px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">Closed</span>
                                )}
                                {booking.sale_closed === false && (
                                  <span className="ml-1 px-2 py-1 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Open</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500 dark:text-gray-400">Check-in</span>
                            )}
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
                                : event.status === 'canceled' || event.status === 'cancelled'
                                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                            }`}>
                              {event.status === 'canceled' || event.status === 'cancelled' ? 'Canceled' : (event.status || 'unknown')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {event.is_sales_call ? (
                              <span className="text-xs">
                                <span className="px-2 py-1 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">Sales</span>
                                {event.sale_closed === true && (
                                  <span className="ml-1 px-2 py-1 rounded bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">Closed</span>
                                )}
                                {event.sale_closed === false && (
                                  <span className="ml-1 px-2 py-1 rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">Open</span>
                                )}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500 dark:text-gray-400">Check-in</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                            {event.location ? (
                              typeof event.location === 'string' ? (
                                isUrl(event.location) ? (
                                  <button
                                    onClick={() => copyToClipboard(String(event.location), `location-${event.uri}`, 'location link')}
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

      {/* Full calendar: all current and past events */}
      {connectedProvider && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Calendar</h2>
            <button
              type="button"
              onClick={() => { setManualBookingPrefillDate(null); setShowManualBookingModal(true); }}
              className="px-3 py-1.5 text-sm font-medium rounded-md glass-button neon-glow"
            >
              Add manual booking
            </button>
          </div>
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() - 1))}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <span className="text-lg font-medium text-gray-900 dark:text-gray-100">{calendarMonthName}</span>
            <button
              type="button"
              onClick={() => setCalendarMonth(d => new Date(d.getFullYear(), d.getMonth() + 1))}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-gray-600 dark:text-gray-400"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium text-gray-700 dark:text-gray-300">Type:</span>
            <span className="border-l-2 border-l-indigo-500 pl-1.5">Sales call</span>
            <span className="border-l-2 border-l-slate-400 dark:border-l-slate-500 pl-1.5">Check-in</span>
            <span className="font-medium text-gray-700 dark:text-gray-300 ml-2">Outcome:</span>
            <span className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 px-1.5 py-0.5 rounded">Cancelled</span>
            <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded">No-show</span>
            <span className="bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded">Showed up</span>
            <span className="bg-slate-100 dark:bg-slate-700/40 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded">Upcoming</span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2">{day}</div>
            ))}
            {calendarDays.map((date, idx) => {
              const dayEvents = getEventsForDate(date);
              const isToday = isTodayDate(date);
              const isEmpty = date && dayEvents.length === 0;
              return (
                <div
                  key={idx}
                  onClick={isEmpty ? () => { setManualBookingPrefillDate(date); setShowManualBookingModal(true); } : undefined}
                  onDragOver={(e) => {
                    // Allow dropping for manual reschedules.
                    e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const draggedId = e.dataTransfer.getData('text/plain');
                    handleDropRescheduleManualEvent(draggedId, date);
                  }}
                  className={`min-h-[80px] p-1.5 rounded-lg border text-sm ${
                    date
                      ? isToday
                        ? 'bg-primary-500/20 border-primary-500/50 dark:bg-primary-400/20'
                        : 'bg-gray-50/50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700'
                      : 'border-transparent'
                  } ${isEmpty ? 'cursor-pointer hover:ring-2 hover:ring-primary-400 dark:hover:ring-primary-500' : ''}`}
                >
                  {date && (
                    <>
                      <div className="text-gray-600 dark:text-gray-400 mb-1 flex items-center justify-between">
                        <span>{date.getDate()}</span>
                        {isEmpty && <span className="text-[10px] text-gray-400 dark:text-gray-500">+ add</span>}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map(ev => (
                          <button
                            key={ev.id}
                            type="button"
                            draggable={ev.provider === 'manual'}
                            onDragStart={(e) => {
                              if (ev.provider !== 'manual') return;
                              dragInProgressRef.current = true;
                              e.dataTransfer.setData('text/plain', ev.id);
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragEnd={() => {
                              dragInProgressRef.current = false;
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (dragInProgressRef.current) return;
                              setSelectedCalendarEvent(null);
                              if (ev.provider === 'manual') {
                                setSelectedEvent({ provider: 'manual', id: ev.id });
                              } else if (ev.provider === 'calcom') {
                                setSelectedEvent({ provider: 'calcom', id: ev.id });
                              } else if (ev.provider === 'calendly') {
                                setSelectedEvent({ provider: 'calendly', id: ev.id, uri: ev.uri });
                              }
                            }}
                            className={getEventButtonClasses(ev) + (ev.provider === 'manual' ? ' cursor-grab' : '')}
                            title={`${ev.title} — ${ev.is_sales_call ? 'Sales call' : 'Check-in'} · ${ev.eventStatus === 'cancelled' ? 'Cancelled' : ev.eventStatus === 'no_show' ? 'No-show' : ev.eventStatus === 'showed_up' ? 'Showed up' : 'Upcoming'}`}
                          >
                            {ev.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })} {ev.title}
                          </button>
                        ))}
                        {dayEvents.length > 3 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!date) return;
                              setSelectedDayMoreEvents({ date, events: dayEvents });
                            }}
                            className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                            title="Click to view all events for this day"
                          >
                            +{dayEvents.length - 3} more
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
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
                  const y = calendarMonth.getFullYear();
                  const m = calendarMonth.getMonth();
                  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                  const lastDay = new Date(y, m + 1, 0);
                  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
                  apiClient.getCalendarManualEvents(start, end).then((data: any) => setManualCalendarEvents(Array.isArray(data) ? data : [])).catch(() => {});
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
                                loadCalcomBookings();
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
                                loadCalendlyEvents();
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

      {/* Day 'more' events modal (grid) */}
      {selectedDayMoreEvents && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSelectedDayMoreEvents(null)}
            aria-hidden
          />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Events on{" "}
                {selectedDayMoreEvents.date.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </h3>
              <button
                type="button"
                onClick={() => setSelectedDayMoreEvents(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-2">
              {selectedDayMoreEvents.events
                .slice()
                .sort((a, b) => a.start.getTime() - b.start.getTime())
                .map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => {
                      setSelectedDayMoreEvents(null);
                      setSelectedCalendarEvent(null);
                      if (ev.provider === 'manual') {
                        setSelectedEvent({ provider: 'manual', id: ev.id });
                      } else if (ev.provider === 'calcom') {
                        setSelectedEvent({ provider: 'calcom', id: ev.id });
                      } else if (ev.provider === 'calendly') {
                        setSelectedEvent({ provider: 'calendly', id: ev.id, uri: ev.uri });
                      }
                    }}
                    className={getEventButtonClasses(ev)}
                    title={ev.title}
                  >
                    {ev.start.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })}{" "}
                    {ev.title}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Calendar event details modal (from grid – no API, avoids session errors) */}
      {selectedCalendarEvent && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedCalendarEvent(null)} aria-hidden />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Event details</h3>
              <button
                type="button"
                onClick={() => setSelectedCalendarEvent(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Title</dt>
                <dd className="font-medium text-gray-900 dark:text-gray-100">{selectedCalendarEvent.title}</dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Date & time</dt>
                <dd className="text-gray-900 dark:text-gray-100">
                  {selectedCalendarEvent.start.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Call type</dt>
                <dd className="text-gray-900 dark:text-gray-100">{selectedCalendarEvent.is_sales_call ? 'Sales call' : 'Check-in'}</dd>
              </div>
              {selectedCalendarEvent.is_sales_call && (
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Sale closed</dt>
                  <dd className="text-gray-900 dark:text-gray-100">
                    {selectedCalendarEvent.sale_closed === true ? 'Yes' : selectedCalendarEvent.sale_closed === false ? 'No' : '—'}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Outcome</dt>
                <dd className="text-gray-900 dark:text-gray-100">
                  {selectedCalendarEvent.eventStatus === 'cancelled' ? 'Cancelled' : selectedCalendarEvent.eventStatus === 'no_show' ? 'No-show' : selectedCalendarEvent.eventStatus === 'showed_up' ? 'Showed up' : 'Upcoming'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 dark:text-gray-400">Provider</dt>
                <dd className="text-gray-900 dark:text-gray-100 capitalize">{selectedCalendarEvent.provider}</dd>
              </div>
            </dl>

            {/* Manual event editor */}
            {selectedCalendarEvent.provider === 'manual' && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                  <select
                    disabled={manualUpdating}
                    value={
                      selectedCalendarEvent.cancelled
                        ? 'cancelled'
                        : selectedCalendarEvent.no_show
                        ? 'no_show'
                        : selectedCalendarEvent.completed
                        ? 'completed'
                        : 'scheduled'
                    }
                    onChange={async (e) => {
                      if (!selectedCalendarEvent.id) return;
                      const checkInId = selectedCalendarEvent.id.replace(/^manual_/, '');
                      const v = e.target.value as 'scheduled' | 'completed' | 'cancelled' | 'no_show';

                      const updates: any = {
                        completed: v === 'completed',
                        cancelled: v === 'cancelled',
                        no_show: v === 'no_show',
                      };

                      setManualUpdating(true);
                      try {
                        await apiClient.updateCheckInDetails(checkInId, updates);
                        await refreshManualCalendarEventsForCurrentMonth();

                        const eventStatus: typeof selectedCalendarEvent.eventStatus =
                          v === 'cancelled'
                            ? 'cancelled'
                            : v === 'no_show'
                            ? 'no_show'
                            : v === 'completed'
                            ? 'showed_up'
                            : 'upcoming';

                        setSelectedCalendarEvent((prev) =>
                          prev
                            ? {
                                ...prev,
                                completed: updates.completed,
                                cancelled: updates.cancelled,
                                no_show: updates.no_show,
                                eventStatus,
                              }
                            : prev
                        );

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
                      } catch (err: any) {
                        console.error('Failed to update manual check-in:', err);
                        alert(err?.response?.data?.detail || err?.message || 'Failed to update appointment');
                      } finally {
                        setManualUpdating(false);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="no_show">No-show</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={manualUpdating}
                      checked={!!selectedCalendarEvent.is_sales_call}
                      onChange={async (e) => {
                        if (!selectedCalendarEvent.id) return;
                        const checkInId = selectedCalendarEvent.id.replace(/^manual_/, '');
                        const isSalesCall = e.target.checked;
                        const newSaleClosed = isSalesCall ? (selectedCalendarEvent.sale_closed ?? false) : null;

                        setManualUpdating(true);
                        try {
                          await apiClient.updateCheckInDetails(checkInId, { is_sales_call: isSalesCall, sale_closed: newSaleClosed });
                          await refreshManualCalendarEventsForCurrentMonth();

                          setSelectedCalendarEvent((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  is_sales_call: isSalesCall,
                                  sale_closed: newSaleClosed,
                                }
                              : prev
                          );

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
                        } catch (err: any) {
                          console.error('Failed to update manual sales flags:', err);
                          alert(err?.response?.data?.detail || err?.message || 'Failed to update sales flags');
                        } finally {
                          setManualUpdating(false);
                        }
                      }}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Mark as sales call</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={manualUpdating || !selectedCalendarEvent.is_sales_call}
                      checked={selectedCalendarEvent.sale_closed === true}
                      onChange={async (e) => {
                        if (!selectedCalendarEvent.id) return;
                        const checkInId = selectedCalendarEvent.id.replace(/^manual_/, '');
                        const saleClosed = e.target.checked;

                        setManualUpdating(true);
                        try {
                          await apiClient.updateCheckInDetails(checkInId, { sale_closed: saleClosed });
                          await refreshManualCalendarEventsForCurrentMonth();

                          setSelectedCalendarEvent((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  sale_closed: saleClosed,
                                }
                              : prev
                          );

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
                        } catch (err: any) {
                          console.error('Failed to update manual sale closed flag:', err);
                          alert(err?.response?.data?.detail || err?.message || 'Failed to update sale closed flag');
                        } finally {
                          setManualUpdating(false);
                        }
                      }}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Sale closed</span>
                  </label>
                </div>

                {manualUpdating && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">Updating…</div>
                )}
              </div>
            )}

            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              {selectedCalendarEvent.provider === 'manual'
                ? 'Drag to reschedule manual appointments. Use the controls above to edit status and sales flags.'
                : 'For full details and to mark as sales call, open the event from the bookings table above.'}
            </p>
          </div>
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
          onSalesUpdated={() => {
            if (connectedProvider === 'calcom') loadCalcomBookings();
            else loadCalendlyEvents();

            // Ensure dashboard metrics update immediately after sales flags change.
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

            // Let the NotificationsCard refresh immediately too.
            window.dispatchEvent(new CustomEvent('calendarSalesFlagsUpdated'));
          }}
        />
      )}
    </div>
  );
}

