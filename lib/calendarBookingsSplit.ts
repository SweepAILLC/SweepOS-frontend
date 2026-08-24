import type { CalendarSyncedBookingRow } from '@/lib/api';

/** Effective end instant for upcoming/past split (end_time when present, else start_time). */
export function bookingBoundaryMs(row: CalendarSyncedBookingRow): number | null {
  const raw = row.end_time || row.start_time;
  if (!raw) return null;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : null;
}

export function isBookingUpcoming(row: CalendarSyncedBookingRow, nowMs = Date.now()): boolean {
  const boundary = bookingBoundaryMs(row);
  return boundary != null && boundary >= nowMs;
}

/** Re-classify API rows by current time; dedupe when backend buckets disagree. */
export function splitCalendarBookingRows(
  upcoming: CalendarSyncedBookingRow[],
  past: CalendarSyncedBookingRow[],
  nowMs = Date.now()
): { upcoming: CalendarSyncedBookingRow[]; past: CalendarSyncedBookingRow[] } {
  const byId = new Map<string, CalendarSyncedBookingRow>();
  for (const row of [...upcoming, ...past]) {
    if (row?.id) byId.set(row.id, row);
  }

  const upcomingOut: CalendarSyncedBookingRow[] = [];
  const pastOut: CalendarSyncedBookingRow[] = [];

  for (const row of Array.from(byId.values())) {
    if (isBookingUpcoming(row, nowMs)) upcomingOut.push(row);
    else if (bookingBoundaryMs(row) != null) pastOut.push(row);
  }

  upcomingOut.sort(
    (a, b) => new Date(a.start_time || 0).getTime() - new Date(b.start_time || 0).getTime()
  );
  pastOut.sort(
    (a, b) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime()
  );

  return { upcoming: upcomingOut, past: pastOut };
}

export function applyCalendarBookingLimits(
  upcoming: CalendarSyncedBookingRow[],
  past: CalendarSyncedBookingRow[],
  limits: { upcoming_limit?: number; past_limit?: number }
): { upcoming: CalendarSyncedBookingRow[]; past: CalendarSyncedBookingRow[] } {
  return {
    upcoming:
      limits.upcoming_limit != null ? upcoming.slice(0, limits.upcoming_limit) : upcoming,
    past: limits.past_limit != null ? past.slice(0, limits.past_limit) : past,
  };
}

export function normalizeCalendarSyncedBookings(
  data: { upcoming?: CalendarSyncedBookingRow[]; past?: CalendarSyncedBookingRow[] },
  limits?: { upcoming_limit?: number; past_limit?: number }
): { upcoming: CalendarSyncedBookingRow[]; past: CalendarSyncedBookingRow[] } {
  const split = splitCalendarBookingRows(data.upcoming || [], data.past || []);
  return limits ? applyCalendarBookingLimits(split.upcoming, split.past, limits) : split;
}
