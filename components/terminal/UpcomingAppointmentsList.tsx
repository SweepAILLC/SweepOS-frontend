'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTerminalCalendar } from '@/contexts/TerminalCalendarContext';
import { ListSkeleton, PremiumReveal } from '@/components/ui/PremiumMotion';
import { isBookingUpcoming } from '@/lib/calendarBookingsSplit';

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 7) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
  if (diffDays > 0) return `${diffDays} day${diffDays !== 1 ? 's' : ''} from now`;
  if (diffHours > 0) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} from now`;
  if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} from now`;
  return 'Starting soon';
}

function formatTime(dateString: string) {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function isUrl(str: string | undefined): boolean {
  if (!str) return false;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function UpcomingAppointmentsList() {
  const { connectedProvider, statusLoading, syncedUpcoming, bookingsLoading } = useTerminalCalendar();

  const appointments = useMemo(() => {
    return syncedUpcoming
      .filter((row) => row.start_time && !row.cancelled && isBookingUpcoming(row))
      .sort((a, b) => new Date(a.start_time!).getTime() - new Date(b.start_time!).getTime())
      .slice(0, 2)
      .map((row) => ({
        id: row.id,
        title: row.title || 'Untitled',
        start_time: row.start_time!,
        client_name: row.client_name || row.attendee_name || undefined,
        location: row.meeting_url || row.location || undefined,
        link: row.meeting_url || undefined,
      }));
  }, [syncedUpcoming]);

  const loading = statusLoading || (bookingsLoading && appointments.length === 0);

  if (loading && !connectedProvider) {
    return <ListSkeleton rows={2} />;
  }

  if (!connectedProvider) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 p-4 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">No calendar connected</p>
        <Link href="/?tab=integrations" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          Connect in Integrations
        </Link>
      </div>
    );
  }

  if (appointments.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-2">No upcoming appointments</p>
    );
  }

  return (
    <PremiumReveal className="space-y-2 min-w-0">
      {appointments.map((appointment, index) => (
        <div
          key={appointment.id || index}
          className="premium-reveal bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800 min-w-0"
          style={{ animationDelay: `${index * 80}ms` }}
        >
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="flex-1 min-w-0">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                {index === 0 ? 'Next' : `#${index + 1}`}
              </span>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate mt-0.5">
                {appointment.title}
              </h4>
              {appointment.client_name && (
                <p className="text-xs text-gray-700 dark:text-gray-300 truncate">{appointment.client_name}</p>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {formatDate(appointment.start_time)} · {formatTime(appointment.start_time)}
              </p>
              {appointment.location && isUrl(appointment.location) && (
                <a
                  href={appointment.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary-500 hover:underline mt-0.5 inline-block truncate max-w-full"
                >
                  Join link
                </a>
              )}
            </div>
            {appointment.link && (
              <a
                href={appointment.link}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
              >
                Open
              </a>
            )}
          </div>
        </div>
      ))}
    </PremiumReveal>
  );
}
