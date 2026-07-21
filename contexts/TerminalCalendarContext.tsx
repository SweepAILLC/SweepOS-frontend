'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Cookies from 'js-cookie';
import { apiClient, type CalendarSyncedBookingRow } from '@/lib/api';
import {
  CALENDAR_BOOKINGS_UPDATED_EVENT,
  CALENDAR_INTEGRATION_CHANGED_EVENT,
  TERMINAL_DATA_REFRESHED_EVENT,
  cache,
  invalidateTerminalAfterCalendarWebhook,
  setSeenCalendarDataMs,
} from '@/lib/cache';
import { runCalendarCheckInSync } from '@/lib/calendarSync';
import {
  CALENDAR_DEFERRED_PROVIDER_SYNC_MS,
  CALENDAR_DB_REFETCH_INTERVAL_MS,
  CALENDAR_PROVIDER_SYNC_INTERVAL_MS,
  CALENDAR_PROVIDER_SYNC_STALE_MS,
  CALENDAR_WEBHOOK_MARKER_INTERVAL_MS,
} from '@/lib/calendarPollConstants';
import { normalizeCalendarSyncedBookings } from '@/lib/calendarBookingsSplit';
import {
  checkCalendarWebhookAndRefresh,
  isTerminalSyncOnLoadPending,
} from '@/lib/terminalRefresh';
import type { CalComStatus, CalendlyStatus } from '@/types/integration';

export type CalendarProvider = 'calcom' | 'calendly' | null;

/** Terminal bookings table — smaller payload for faster first paint. */
const TERMINAL_UPCOMING_LIMIT = 150;
const TERMINAL_PAST_LIMIT = 150;
const TERMINAL_PAST_SINCE_MS = 365 * 24 * 60 * 60 * 1000;
const SYNC_STALE_MS = CALENDAR_PROVIDER_SYNC_STALE_MS;
const PROVIDER_SYNC_INTERVAL_MS = CALENDAR_PROVIDER_SYNC_INTERVAL_MS;
const DEFERRED_PROVIDER_SYNC_MS = CALENDAR_DEFERRED_PROVIDER_SYNC_MS;

function terminalBookingsFetchParams() {
  return {
    upcoming_limit: TERMINAL_UPCOMING_LIMIT,
    past_limit: TERMINAL_PAST_LIMIT,
    past_since: new Date(Date.now() - TERMINAL_PAST_SINCE_MS).toISOString(),
  };
}

function terminalBookingsLimits() {
  return { upcoming_limit: TERMINAL_UPCOMING_LIMIT, past_limit: TERMINAL_PAST_LIMIT };
}

function bookingsDataFingerprint(
  upcoming: CalendarSyncedBookingRow[],
  past: CalendarSyncedBookingRow[]
): string {
  const rowKey = (r: CalendarSyncedBookingRow) =>
    `${r.id}|${r.start_time}|${r.display_status}|${r.is_sales_call}|${r.sale_closed}|${r.cancelled}`;
  return `${upcoming.length}:${past.length}:${upcoming.map(rowKey).join(';')}:${past.map(rowKey).join(';')}`;
}

function shouldDeferProviderSync(): boolean {
  return isTerminalSyncOnLoadPending();
}

function orgIdFromAccessToken(): string {
  if (typeof window === 'undefined') return 'anon';
  const token = Cookies.get('access_token');
  if (!token) return 'anon';
  try {
    const parts = token.split('.');
    if (parts.length < 2) return 'anon';
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = JSON.parse(atob(padded)) as { org_id?: string };
    return json.org_id != null ? String(json.org_id) : 'anon';
  } catch {
    return 'anon';
  }
}

function storageKey(suffix: string) {
  const org = orgIdFromAccessToken();
  return `calendar_${suffix}_all_${org}`;
}

function isProviderSyncStale(): boolean {
  if (typeof sessionStorage === 'undefined') return true;
  const lastMsStr = sessionStorage.getItem(storageKey('last_sync_ms'));
  const lastMs = lastMsStr ? parseInt(lastMsStr, 10) : 0;
  return !Number.isFinite(lastMs) || Date.now() - lastMs > SYNC_STALE_MS;
}

interface TerminalCalendarContextValue {
  calcomStatus: CalComStatus | null;
  calendlyStatus: CalendlyStatus | null;
  connectedProvider: CalendarProvider;
  statusLoading: boolean;
  syncedUpcoming: CalendarSyncedBookingRow[];
  syncedPast: CalendarSyncedBookingRow[];
  lastSyncedAt: string | null;
  bookingsLoading: boolean;
  bookingsError: string | null;
  refetchSyncedBookings: () => Promise<boolean>;
  /** Pull from Cal.com/Calendly APIs into DB, then reload canonical rows. */
  refreshSyncedCalendar: (opts?: { silent?: boolean; force?: boolean }) => Promise<void>;
}

const TerminalCalendarContext = createContext<TerminalCalendarContextValue | null>(null);

export function TerminalCalendarProvider({ children }: { children: ReactNode }) {
  const [calcomStatus, setCalcomStatus] = useState<CalComStatus | null>(null);
  const [calendlyStatus, setCalendlyStatus] = useState<CalendlyStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [syncedUpcoming, setSyncedUpcoming] = useState<CalendarSyncedBookingRow[]>([]);
  const [syncedPast, setSyncedPast] = useState<CalendarSyncedBookingRow[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingsError, setBookingsError] = useState<string | null>(null);

  const connectedProvider: CalendarProvider = calcomStatus?.connected
    ? 'calcom'
    : calendlyStatus?.connected
      ? 'calendly'
      : null;

  const connectedProviderRef = useRef<CalendarProvider>(connectedProvider);
  connectedProviderRef.current = connectedProvider;
  const calendarRefreshChainRef = useRef<Promise<void>>(Promise.resolve());
  const lastBookingsFingerprintRef = useRef<string | null>(null);

  const hydrateFromSession = useCallback(() => {
    if (typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(storageKey('synced_bookings'));
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        server_time?: string | null;
        upcoming?: CalendarSyncedBookingRow[];
        past?: CalendarSyncedBookingRow[];
      };
      if (Array.isArray(parsed?.upcoming) || Array.isArray(parsed?.past)) {
        const normalized = normalizeCalendarSyncedBookings(
          { upcoming: parsed.upcoming || [], past: parsed.past || [] },
          terminalBookingsLimits()
        );
        setSyncedUpcoming(normalized.upcoming);
        setSyncedPast(normalized.past);
        lastBookingsFingerprintRef.current = bookingsDataFingerprint(
          normalized.upcoming,
          normalized.past
        );
      }
      if (typeof parsed?.server_time === 'string') setLastSyncedAt(parsed.server_time);
    } catch {
      /* ignore */
    }
  }, []);

  const persistToSession = useCallback(
    (data: Awaited<ReturnType<typeof apiClient.getCalendarSyncedBookings>>) => {
      if (typeof sessionStorage === 'undefined') return;
      try {
        sessionStorage.setItem(
          storageKey('synced_bookings'),
          JSON.stringify({
            server_time: data.server_time || null,
            upcoming: data.upcoming || [],
            past: data.past || [],
            saved_at_ms: Date.now(),
          })
        );
      } catch {
        /* ignore */
      }
    },
    []
  );

  const refetchSyncedBookings = useCallback(async (): Promise<boolean> => {
    const provider = connectedProviderRef.current;
    if (!provider) return false;
    try {
      const data = await apiClient.getCalendarSyncedBookings(terminalBookingsFetchParams());
      const normalized = normalizeCalendarSyncedBookings(data, terminalBookingsLimits());
      const upcoming = normalized.upcoming;
      const past = normalized.past;
      const fingerprint = bookingsDataFingerprint(upcoming, past);
      const changed = fingerprint !== lastBookingsFingerprintRef.current;
      lastBookingsFingerprintRef.current = fingerprint;
      setSyncedUpcoming(upcoming);
      setSyncedPast(past);
      setLastSyncedAt(data.server_time || null);
      persistToSession({ ...data, upcoming, past });
      if (changed && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(CALENDAR_BOOKINGS_UPDATED_EVENT));
      }
      return true;
    } catch {
      return false;
    }
  }, [persistToSession]);

  const refreshSyncedCalendar = useCallback(
    async (opts?: { silent?: boolean; force?: boolean }) => {
      const provider = connectedProviderRef.current;
      if (!provider) return;

      const task = async () => {
        if (!opts?.silent) {
          setBookingsLoading(true);
          setBookingsError(null);
        }
        try {
          await runCalendarCheckInSync({
            applyPipelineRules: false,
            force: opts?.force,
          });
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(storageKey('last_sync_ms'), String(Date.now()));
          }
          const data = await apiClient.getCalendarSyncedBookings(terminalBookingsFetchParams());
          const normalized = normalizeCalendarSyncedBookings(data, terminalBookingsLimits());
          const upcoming = normalized.upcoming;
          const past = normalized.past;
          lastBookingsFingerprintRef.current = bookingsDataFingerprint(upcoming, past);
          setSyncedUpcoming(upcoming);
          setSyncedPast(past);
          setLastSyncedAt(data.server_time || null);
          persistToSession({ ...data, upcoming, past });
          try {
            const { last_updated_ms } = await apiClient.getCalendarLastUpdated();
            if (last_updated_ms != null) invalidateTerminalAfterCalendarWebhook(last_updated_ms);
          } catch {
            cache.deleteByPrefix('calendar_trend_summary_');
          }
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(CALENDAR_BOOKINGS_UPDATED_EVENT));
            window.dispatchEvent(new CustomEvent(TERMINAL_DATA_REFRESHED_EVENT));
          }
        } catch (error: unknown) {
          const err = error as { response?: { data?: { detail?: string } }; message?: string };
          if (!opts?.silent) {
            const recovered = await refetchSyncedBookings();
            setBookingsError(
              recovered ? null : err?.response?.data?.detail || err?.message || 'Failed to sync calendar'
            );
          }
        } finally {
          if (!opts?.silent) setBookingsLoading(false);
        }
      };

      const next = calendarRefreshChainRef.current.then(() => task());
      calendarRefreshChainRef.current = next.catch(() => {});
      await next;
    },
    [persistToSession, refetchSyncedBookings]
  );

  const refreshSyncedCalendarRef = useRef(refreshSyncedCalendar);
  refreshSyncedCalendarRef.current = refreshSyncedCalendar;

  const loadIntegrationStatus = useCallback(async () => {
    try {
      const [calcom, calendly] = await Promise.all([
        apiClient.getCalComStatus().catch(() => ({ connected: false })),
        apiClient.getCalendlyStatus().catch(() => ({ connected: false })),
      ]);
      setCalcomStatus(calcom as CalComStatus);
      setCalendlyStatus(calendly as CalendlyStatus);
      return calcom?.connected ? 'calcom' : calendly?.connected ? 'calendly' : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      await loadIntegrationStatus();
      if (!cancelled) setStatusLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadIntegrationStatus]);

  useEffect(() => {
    const onIntegrationChanged = () => {
      void (async () => {
        const provider = await loadIntegrationStatus();
        if (provider) {
          await refreshSyncedCalendarRef.current({ silent: true });
        }
      })();
    };
    window.addEventListener(CALENDAR_INTEGRATION_CHANGED_EVENT, onIntegrationChanged);
    return () => window.removeEventListener(CALENDAR_INTEGRATION_CHANGED_EVENT, onIntegrationChanged);
  }, [loadIntegrationStatus]);

  useEffect(() => {
    if (!connectedProvider) {
      setSyncedUpcoming([]);
      setSyncedPast([]);
      setLastSyncedAt(null);
      return;
    }
    hydrateFromSession();

    const seedSeenMarker = async () => {
      try {
        const { last_updated_ms } = await apiClient.getCalendarLastUpdated();
        if (last_updated_ms != null) setSeenCalendarDataMs(last_updated_ms);
      } catch {
        /* ignore */
      }
    };

    void refetchSyncedBookings().then(() => seedSeenMarker());

    const staleSyncTimer = setTimeout(() => {
      if (shouldDeferProviderSync()) return;
      if (isProviderSyncStale()) {
        void refreshSyncedCalendar({ silent: true });
      }
    }, DEFERRED_PROVIDER_SYNC_MS);

    const onCalendarUpdated = () => void refetchSyncedBookings();
    window.addEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, onCalendarUpdated);

    const pollCalendarWebhook = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void checkCalendarWebhookAndRefresh();
    };

    const pollId = setInterval(pollCalendarWebhook, CALENDAR_WEBHOOK_MARKER_INTERVAL_MS);
    const dbRefetchId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refetchSyncedBookings();
    }, CALENDAR_DB_REFETCH_INTERVAL_MS);
    const providerSyncId = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (shouldDeferProviderSync()) return;
      if (isProviderSyncStale()) {
        void refreshSyncedCalendar({ silent: true });
      }
    }, PROVIDER_SYNC_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void pollCalendarWebhook();
        void refetchSyncedBookings();
        if (!shouldDeferProviderSync() && isProviderSyncStale()) {
          void refreshSyncedCalendar({ silent: true });
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(staleSyncTimer);
      clearInterval(pollId);
      clearInterval(dbRefetchId);
      clearInterval(providerSyncId);
      window.removeEventListener(CALENDAR_BOOKINGS_UPDATED_EVENT, onCalendarUpdated);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [connectedProvider, hydrateFromSession, refetchSyncedBookings, refreshSyncedCalendar]);

  const value = useMemo<TerminalCalendarContextValue>(
    () => ({
      calcomStatus,
      calendlyStatus,
      connectedProvider,
      statusLoading,
      syncedUpcoming,
      syncedPast,
      lastSyncedAt,
      bookingsLoading,
      bookingsError,
      refetchSyncedBookings,
      refreshSyncedCalendar,
    }),
    [
      calcomStatus,
      calendlyStatus,
      connectedProvider,
      statusLoading,
      syncedUpcoming,
      syncedPast,
      lastSyncedAt,
      bookingsLoading,
      bookingsError,
      refetchSyncedBookings,
      refreshSyncedCalendar,
    ]
  );

  return <TerminalCalendarContext.Provider value={value}>{children}</TerminalCalendarContext.Provider>;
}

export function useTerminalCalendar(): TerminalCalendarContextValue {
  const ctx = useContext(TerminalCalendarContext);
  if (!ctx) {
    throw new Error('useTerminalCalendar must be used within TerminalCalendarProvider');
  }
  return ctx;
}
