'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import EventDetailsModal from '@/components/calendar/EventDetailsModal';
import CalendarStatusBadge from '@/components/calendar/CalendarStatusBadge';
import CalendarEventTypeNodes from '@/components/calendar/CalendarEventTypeNodes';
import { useTerminalCalendar } from '@/contexts/TerminalCalendarContext';
import ClientSearchCombobox from '@/components/client/ClientSearchCombobox';
import { deduplicateClientsForAssign } from '@/lib/clientBoardSearch';
import type { Client } from '@/types/client';
import { ListSkeleton, PremiumReveal, TableSkeletonPremium } from '@/components/ui/PremiumMotion';

type BookingsTab = 'upcoming' | 'past';

const PAST_BOOKINGS_LIMIT = 50;

export default function TerminalBookingsTable() {
  const {
    connectedProvider,
    statusLoading,
    syncedUpcoming,
    syncedPast,
    lastSyncedAt,
    bookingsLoading,
    bookingsError,
    refetchSyncedBookings,
    refreshSyncedCalendar,
  } = useTerminalCalendar();

  const [bookingsTab, setBookingsTab] = useState<BookingsTab>('upcoming');
  const [selectedEvent, setSelectedEvent] = useState<{
    checkInId?: string;
    provider: 'calcom' | 'calendly' | 'manual';
    id: string | number;
    uri?: string;
  } | null>(null);
  const [showManualBookingModal, setShowManualBookingModal] = useState(false);
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
  const [eventTypesRefreshKey, setEventTypesRefreshKey] = useState(0);

  useEffect(() => {
    if (showManualBookingModal) {
      setManualBookingClientsLoading(true);
      apiClient
        .getClients()
        .then((list) => setManualBookingClients(deduplicateClientsForAssign(list || [])))
        .catch(() => setManualBookingClients([]))
        .finally(() => setManualBookingClientsLoading(false));
      const d = new Date();
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      setManualBookingForm((prev) => ({
        ...prev,
        clientId: '',
        date: dateStr,
      }));
    }
  }, [showManualBookingModal]);

  const formatDateTime = (dateString: string) => new Date(dateString).toLocaleString();

  const isUrl = (str: string | undefined): boolean => {
    if (!str) return false;
    try {
      const url = new URL(str);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const filteredBookings =
    bookingsTab === 'upcoming' ? syncedUpcoming : syncedPast.slice(0, PAST_BOOKINGS_LIMIT);

  if (statusLoading && !connectedProvider) {
    return (
      <div className="glass-card p-6 min-w-0">
        <TableSkeletonPremium rows={5} columns={6} />
      </div>
    );
  }

  if (!connectedProvider) {
    return (
      <div className="glass-card p-6 min-w-0">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Bookings</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
          Connect Cal.com or Calendly to view synced bookings.
        </p>
        <Link href="/?tab=integrations" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          Go to Integrations
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0 flex flex-col min-h-0" aria-busy={bookingsLoading}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 shrink-0">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Bookings</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowManualBookingModal(true)}
            className="px-3 py-1.5 text-sm font-medium rounded-md glass-button neon-glow"
          >
            Add manual booking
          </button>
          <button
            type="button"
            onClick={() => {
              setEventTypesRefreshKey((k) => k + 1);
              void refreshSyncedCalendar({ force: true });
            }}
            disabled={bookingsLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-60"
          >
            {bookingsLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {lastSyncedAt && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 shrink-0">
          Last synced: {new Date(lastSyncedAt).toLocaleString()}
        </p>
      )}

      {bookingsError && (
        <p className="text-sm text-red-600 dark:text-red-400 mb-2 shrink-0">{bookingsError}</p>
      )}

      <CalendarEventTypeNodes
        provider={connectedProvider}
        refreshKey={eventTypesRefreshKey}
        compact
        onSalesCallChanged={() => void refreshSyncedCalendar({ force: true })}
        className="mb-4 pb-4 border-b border-gray-200/80 dark:border-white/10 shrink-0"
      />

      <div className="mb-4 border-b border-white/10 shrink-0">
        <div className="flex space-x-1">
          {(['upcoming', 'past'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setBookingsTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                bookingsTab === tab
                  ? 'bg-primary-500 text-white border-b-2 border-primary-500'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-white/10'
              }`}
            >
              {tab === 'upcoming' ? 'Upcoming' : 'Past'}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0">
      {bookingsLoading && filteredBookings.length === 0 ? (
        <TableSkeletonPremium rows={5} columns={6} />
      ) : filteredBookings.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center premium-reveal">
          No {bookingsTab} bookings found
        </p>
      ) : (
        <PremiumReveal className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-white/10">
                {['Title', 'Start', 'Client', 'Status', 'Type', 'Location'].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredBookings.map((row) => {
                const loc = row.meeting_url || row.location || '';
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
                    <td className="px-3 py-2 text-sm">{row.title || 'Untitled'}</td>
                    <td className="px-3 py-2 text-sm whitespace-nowrap">
                      {row.start_time ? formatDateTime(row.start_time) : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <div className="font-medium">{row.client_name || '—'}</div>
                      <div className="text-xs text-gray-500">{row.attendee_email}</div>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <CalendarStatusBadge status={row.display_status} />
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {row.is_sales_call ? (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          <span className="px-2 py-0.5 rounded text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
                            Sales
                          </span>
                          {row.sale_closed === true && (
                            <span className="px-2 py-0.5 rounded text-xs bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                              Closed
                            </span>
                          )}
                          {row.sale_closed === false && (
                            <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                              Open
                            </span>
                          )}
                        </span>
                      ) : (
                        'Check-in'
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {loc && isUrl(loc) ? (
                        <a
                          href={loc}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary-500 hover:underline"
                        >
                          Link
                        </a>
                      ) : (
                        loc || '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PremiumReveal>
      )}
      </div>

      {selectedEvent && (
        <EventDetailsModal
          isOpen={!!selectedEvent}
          onClose={() => setSelectedEvent(null)}
          provider={selectedEvent.provider}
          eventId={selectedEvent.id}
          eventUri={selectedEvent.uri}
          checkInId={selectedEvent.checkInId}
          onSalesUpdated={() => {
            void refetchSyncedBookings();
            window.dispatchEvent(new CustomEvent('calendarSalesFlagsUpdated'));
            window.dispatchEvent(new CustomEvent('calendarBookingsUpdated'));
          }}
        />
      )}

      {showManualBookingModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowManualBookingModal(false)} aria-hidden />
          <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Add manual booking</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!manualBookingForm.clientId) {
                  alert('Please select a client.');
                  return;
                }
                const dateStr = manualBookingForm.date || new Date().toISOString().split('T')[0];
                const [h, m] = manualBookingForm.time.split(':').map(Number);
                const startTime = new Date(`${dateStr}T00:00:00`);
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
                  void refetchSyncedBookings();
                  window.dispatchEvent(new CustomEvent('calendarBookingsUpdated'));
                } catch (err: unknown) {
                  const ax = err as { response?: { data?: { detail?: string } }; message?: string };
                  alert(ax?.response?.data?.detail || ax?.message || 'Failed to create booking.');
                } finally {
                  setSubmittingManualBooking(false);
                }
              }}
              className="space-y-3"
            >
              <ClientSearchCombobox
                clients={manualBookingClients}
                loading={manualBookingClientsLoading}
                clientId={manualBookingForm.clientId}
                onClientIdChange={(id) => setManualBookingForm((f) => ({ ...f, clientId: id }))}
                resetKey={showManualBookingModal}
                inputId="manual-booking-client-search"
              />
              <div>
                <label className="block text-sm font-medium mb-1">Title</label>
                <input
                  type="text"
                  value={manualBookingForm.title}
                  onChange={(e) => setManualBookingForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={manualBookingForm.date}
                    onChange={(e) => setManualBookingForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Time</label>
                  <input
                    type="time"
                    value={manualBookingForm.time}
                    onChange={(e) => setManualBookingForm((f) => ({ ...f, time: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualBookingModal(false)}
                  className="flex-1 px-4 py-2 text-sm rounded-md border dark:border-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingManualBooking}
                  className="flex-1 px-4 py-2 text-sm rounded-md glass-button neon-glow disabled:opacity-50"
                >
                  {submittingManualBooking ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
