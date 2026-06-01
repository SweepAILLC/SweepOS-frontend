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
import type { CalComStatus, CalendlyStatus } from '@/types/integration';

export type CalendarProvider = 'calcom' | 'calendly' | null;

const UPCOMING_LIMIT = 80;
const PAST_LIMIT = 80;

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

function storageKey(provider: CalendarProvider, suffix: string) {
  const org = orgIdFromAccessToken();
  return `calendar_${suffix}_${provider}_${org}`;
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
  /** Pull from Cal.com/Calendly APIs — manual refresh only (never on page load). */
  refreshSyncedCalendar: (opts?: { silent?: boolean }) => Promise<void>;
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

  const hydrateFromSession = useCallback((provider: CalendarProvider) => {
    if (!provider || typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(storageKey(provider, 'synced_bookings'));
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        server_time?: string | null;
        upcoming?: CalendarSyncedBookingRow[];
        past?: CalendarSyncedBookingRow[];
      };
      if (Array.isArray(parsed?.upcoming)) setSyncedUpcoming(parsed.upcoming);
      if (Array.isArray(parsed?.past)) setSyncedPast(parsed.past);
      if (typeof parsed?.server_time === 'string') setLastSyncedAt(parsed.server_time);
    } catch {
      /* ignore */
    }
  }, []);

  const persistToSession = useCallback(
    (provider: CalendarProvider, data: Awaited<ReturnType<typeof apiClient.getCalendarSyncedBookings>>) => {
      if (!provider || typeof sessionStorage === 'undefined') return;
      try {
        sessionStorage.setItem(
          storageKey(provider, 'synced_bookings'),
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
      const data = await apiClient.getCalendarSyncedBookings({
        upcoming_limit: UPCOMING_LIMIT,
        past_limit: PAST_LIMIT,
        provider,
      });
      setSyncedUpcoming(data.upcoming || []);
      setSyncedPast(data.past || []);
      setLastSyncedAt(data.server_time || null);
      persistToSession(provider, data);
      return true;
    } catch {
      return false;
    }
  }, [persistToSession]);

  const refreshSyncedCalendar = useCallback(
    async (opts?: { silent?: boolean }) => {
      const provider = connectedProviderRef.current;
      if (!provider) return;

      const task = async () => {
        if (!opts?.silent) {
          setBookingsLoading(true);
          setBookingsError(null);
        }
        try {
          await apiClient.syncCheckIns();
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem(storageKey(provider, 'last_sync_ms'), String(Date.now()));
          }
          let data: Awaited<ReturnType<typeof apiClient.getCalendarSyncedBookings>>;
          try {
            data = await apiClient.getCalendarSyncedBookings({
              upcoming_limit: UPCOMING_LIMIT,
              past_limit: PAST_LIMIT,
              provider,
            });
          } catch {
            await new Promise((r) => setTimeout(r, 1500));
            data = await apiClient.getCalendarSyncedBookings({
              upcoming_limit: UPCOMING_LIMIT,
              past_limit: PAST_LIMIT,
              provider,
            });
          }
          setSyncedUpcoming(data.upcoming || []);
          setSyncedPast(data.past || []);
          setLastSyncedAt(data.server_time || null);
          persistToSession(provider, data);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      try {
        const [calcom, calendly] = await Promise.all([
          apiClient.getCalComStatus().catch(() => ({ connected: false })),
          apiClient.getCalendlyStatus().catch(() => ({ connected: false })),
        ]);
        if (cancelled) return;
        setCalcomStatus(calcom as CalComStatus);
        setCalendlyStatus(calendly as CalendlyStatus);
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!connectedProvider) {
      setSyncedUpcoming([]);
      setSyncedPast([]);
      setLastSyncedAt(null);
      return;
    }
    hydrateFromSession(connectedProvider);
    void refetchSyncedBookings();
    const onCalendarUpdated = () => void refetchSyncedBookings();
    window.addEventListener('calendarBookingsUpdated', onCalendarUpdated);
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void refetchSyncedBookings();
    }, 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetchSyncedBookings();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      window.removeEventListener('calendarBookingsUpdated', onCalendarUpdated);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [connectedProvider, hydrateFromSession, refetchSyncedBookings]);

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
