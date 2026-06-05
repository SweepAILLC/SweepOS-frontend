'use client';

import {
  calendarStatusBadgeClass,
  calendarStatusLabel,
  type CalendarDisplayStatus,
} from '@/lib/calendarBookingStatus';

interface CalendarStatusBadgeProps {
  status: CalendarDisplayStatus;
  className?: string;
}

export default function CalendarStatusBadge({ status, className = '' }: CalendarStatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${calendarStatusBadgeClass(status)} ${className}`}
    >
      {calendarStatusLabel(status)}
    </span>
  );
}
