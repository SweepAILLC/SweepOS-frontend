/** Display status values from synced check-ins (`display_status` on GET /calendar/synced-bookings). */
export type CalendarDisplayStatus = 'cancelled' | 'no_show' | 'confirmed' | 'completed' | (string & {});

export function calendarStatusLabel(status: CalendarDisplayStatus): string {
  switch (status) {
    case 'cancelled':
      return 'Cancelled';
    case 'no_show':
      return 'No-show';
    case 'confirmed':
      return 'Confirmed';
    case 'completed':
      return 'Completed';
    default:
      if (!status) return '—';
      return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  }
}

/** Pill colors for completed / cancelled / no-show (+ confirmed upcoming). */
export function calendarStatusBadgeClass(status: CalendarDisplayStatus): string {
  switch (status) {
    case 'cancelled':
      return 'bg-red-500/15 text-red-800 dark:text-red-200 border border-red-400/30';
    case 'no_show':
      return 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-400/30';
    case 'completed':
      return 'bg-green-500/15 text-green-800 dark:text-green-200 border border-green-400/30';
    case 'confirmed':
      return 'bg-blue-500/15 text-blue-800 dark:text-blue-200 border border-blue-400/30';
    default:
      return 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-400/20';
  }
}

export function displayStatusFromCheckInFlags(ci: {
  cancelled?: boolean;
  no_show?: boolean;
  completed?: boolean;
}): CalendarDisplayStatus {
  if (ci.cancelled) return 'cancelled';
  if (ci.no_show) return 'no_show';
  if (ci.completed) return 'completed';
  return 'confirmed';
}
