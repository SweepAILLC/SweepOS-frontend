import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '@/lib/api';
import { CalComBooking, CalendlyScheduledEvent } from '@/types/integration';

interface EventDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: 'calcom' | 'calendly' | 'manual';
  eventId: string | number;
  eventUri?: string; // For Calendly
  /** When set, load/edit the canonical synced row via check-in API (recommended for Calendar tab). */
  checkInId?: string | null;
  onSalesUpdated?: () => void;
}

type ManualCheckIn = {
  id: string;
  provider: 'manual' | 'calcom' | 'calendly';
  title?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  cancelled?: boolean;
  completed?: boolean;
  no_show?: boolean;
  is_sales_call?: boolean;
  sale_closed?: boolean | null;
  location?: string | null;
  meeting_url?: string | null;
  attendee_name?: string | null;
  attendee_email?: string | null;
  event_id?: string;
  event_uri?: string | null;
  calcom_uid?: string | null;
};

export default function EventDetailsModal({
  isOpen,
  onClose,
  provider,
  eventId,
  eventUri,
  checkInId,
  onSalesUpdated
}: EventDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<CalComBooking | null>(null);
  const [event, setEvent] = useState<CalendlyScheduledEvent | null>(null);
  const [manualCheckIn, setManualCheckIn] = useState<ManualCheckIn | null>(null);
  const [providerDetailsLoading, setProviderDetailsLoading] = useState(false);
  const [salesUpdating, setSalesUpdating] = useState(false);
  const [attendanceUpdating, setAttendanceUpdating] = useState(false);
  const [actionUpdating, setActionUpdating] = useState<'cancel' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rescheduleDraft, setRescheduleDraft] = useState<{ start?: string; end?: string }>({});
  const [rescheduleUpdating, setRescheduleUpdating] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (isOpen && (checkInId || eventId)) {
      loadEventDetails();
    } else {
      // Reset state when modal closes
      setBooking(null);
      setEvent(null);
      setManualCheckIn(null);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, eventId, provider, checkInId, eventUri]);

  const loadEventDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      if (checkInId) {
        const data = await apiClient.getCheckIn(checkInId);
        setManualCheckIn({ ...(data as ManualCheckIn), id: String((data as { id?: string }).id), provider: (data as { provider?: string }).provider as ManualCheckIn['provider'] });
        setBooking(null);
        setEvent(null);
        setRescheduleDraft({
          start: data?.start_time ? toDateTimeLocalInputValue(data.start_time) : undefined,
          end: data?.end_time ? toDateTimeLocalInputValue(data.end_time) : undefined,
        });
        // Do NOT block the modal on live provider fetches (those can be slow and time out).
        // Fetch provider details in the background for extra context (forms / invitees).
        const prov = (data as { provider?: string }).provider;
        setProviderDetailsLoading(true);
        if (prov === 'calcom') {
          const calcomUid = (data as { calcom_uid?: string | null }).calcom_uid;
          const eventIdStr = String((data as { event_id?: string }).event_id || '').trim();
          const candidates = [calcomUid, eventIdStr].filter((x): x is string => !!x && String(x).length > 0);
          void (async () => {
            try {
              for (const uidOrId of candidates) {
                try {
                  const full = await apiClient.getCalComBookingDetails(uidOrId);
                  setBooking(full);
                  break;
                } catch {
                  /* try next candidate (uid vs numeric id) */
                }
              }
            } finally {
              setProviderDetailsLoading(false);
            }
          })();
        } else if (prov === 'calendly') {
          const uri = String((data as { event_uri?: string | null }).event_uri || eventUri || '').trim();
          void (async () => {
            try {
              if (uri) {
                const full = await apiClient.getCalendlyEventDetails(uri);
                setEvent(full);
              }
            } finally {
              setProviderDetailsLoading(false);
            }
          })();
        } else {
          setProviderDetailsLoading(false);
        }
        return;
      }
      
      if (provider === 'calcom') {
        const data = await apiClient.getCalComBookingDetails(String(eventId));
        setBooking(data);
        setManualCheckIn(null);
        setRescheduleDraft({});
      } else {
        if (provider === 'manual') {
          const raw = String(eventId);
          const checkInId = raw.replace(/^manual_/, '');
          const data = await apiClient.getCheckIn(checkInId);
          setManualCheckIn({ ...data, provider: 'manual' });
          setBooking(null);
          setEvent(null);
          setRescheduleDraft({
            start: data?.start_time ? toDateTimeLocalInputValue(data.start_time) : undefined,
            end: data?.end_time ? toDateTimeLocalInputValue(data.end_time) : undefined,
          });
        } else {
          // For Calendly, use the event URI
          const uri = eventUri || eventId;
          const data = await apiClient.getCalendlyEventDetails(String(uri));
          setEvent(data);
          setManualCheckIn(null);
          setRescheduleDraft({});
        }
      }
    } catch (err: any) {
      console.error('Failed to load event details:', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load event details');
    } finally {
      setLoading(false);
    }
  };

  const updateSalesFlags = async (updates: { sale_closed?: boolean | null; is_sales_call?: boolean }) => {
    if (checkInId || provider === 'manual') {
      const cid = checkInId ? checkInId : String(eventId).replace(/^manual_/, '');
      setSalesUpdating(true);
      try {
        const payload: Parameters<typeof apiClient.updateCheckInDetails>[1] = {};
        if ('sale_closed' in updates) payload.sale_closed = updates.sale_closed ?? null;
        if (updates.is_sales_call !== undefined) payload.is_sales_call = updates.is_sales_call;
        const updated = await apiClient.updateCheckInDetails(cid, payload);
        setManualCheckIn({
          ...(updated as ManualCheckIn),
          provider: ((updated as { provider?: string }).provider || provider) as ManualCheckIn['provider'],
        });
        onSalesUpdated?.();
      } catch (err) {
        console.error('Failed to update check-in flags:', err);
      } finally {
        setSalesUpdating(false);
      }
      return;
    }
    const payloadBase: Parameters<typeof apiClient.updateCalendarBookingSales>[2] = { ...updates };

    // Cal.com stores sales-call tracking in multiple places; close-rate queries are tied to
    // `ClientCheckIn.event_id` which is populated from Cal.com numeric `id` in check-in sync.
    // The modal booking object often has both `id` and `uid`, so we write to both when possible.
    const eventIdCandidates: string[] = (() => {
      if (provider !== 'calcom') return [String(eventId)];
      const b = booking as CalComBooking | null;
      const idCandidate = b?.id != null ? String(b.id) : null;
      const uidCandidate = b?.uid ? String(b.uid) : null;
      return Array.from(new Set([idCandidate, uidCandidate].filter(Boolean))) as string[];
    })();

    const payloadForCalendly: Parameters<typeof apiClient.updateCalendarBookingSales>[2] = {
      ...payloadBase,
    };
    if (provider === 'calendly' && (eventUri || (event as CalendlyScheduledEvent)?.uri)) {
      payloadForCalendly.event_uri = eventUri || (event as CalendlyScheduledEvent)?.uri;
    }
    setSalesUpdating(true);
    try {
      let firstUpdated: Awaited<ReturnType<typeof apiClient.updateCalendarBookingSales>> | null = null;
      for (const cand of eventIdCandidates) {
        const payload = provider === 'calendly' ? payloadForCalendly : payloadBase;
        const updated = await apiClient.updateCalendarBookingSales(provider, cand, payload);
        if (!firstUpdated) firstUpdated = updated;
      }

      if (firstUpdated) {
        if (provider === 'calcom' && booking) {
          setBooking({
            ...booking,
            is_sales_call: firstUpdated.is_sales_call,
            sale_closed: firstUpdated.sale_closed,
          });
        } else if (provider === 'calendly' && event) {
          setEvent({ ...event, is_sales_call: firstUpdated.is_sales_call, sale_closed: firstUpdated.sale_closed });
        }
      }
      onSalesUpdated?.();
    } catch (err) {
      console.error('Failed to update sales flags:', err);
    } finally {
      setSalesUpdating(false);
    }
  };

  type AttendanceStatus = 'confirmed' | 'completed' | 'cancelled' | 'no_show';

  const attendanceValue = (ci: ManualCheckIn | null | undefined): AttendanceStatus => {
    if (!ci) return 'confirmed';
    if (ci.cancelled) return 'cancelled';
    if (ci.no_show) return 'no_show';
    if (ci.completed) return 'completed';
    return 'confirmed';
  };

  const resolveCheckInIdForPatch = (): string | null => {
    if (checkInId) return checkInId;
    const raw = manualCheckIn?.id != null ? String(manualCheckIn.id) : '';
    const stripped = raw.replace(/^manual_/, '');
    return stripped.length > 0 ? stripped : null;
  };

  const setAttendanceStatus = async (next: AttendanceStatus) => {
    const cid = resolveCheckInIdForPatch();
    if (!cid) return;
    const payload: Parameters<typeof apiClient.updateCheckInDetails>[1] =
      next === 'confirmed'
        ? { completed: false, cancelled: false, no_show: false }
        : next === 'completed'
          ? { completed: true, cancelled: false, no_show: false }
          : next === 'cancelled'
            ? { completed: false, cancelled: true, no_show: false }
            : { completed: false, cancelled: false, no_show: true };
    setAttendanceUpdating(true);
    try {
      const u = await apiClient.updateCheckInDetails(cid, payload);
      setManualCheckIn({
        ...(u as ManualCheckIn),
        provider: (manualCheckIn?.provider ??
          (u as { provider?: string }).provider ??
          provider) as ManualCheckIn['provider'],
      });
      onSalesUpdated?.();
    } catch (err) {
      console.error('Failed to update event status:', err);
    } finally {
      setAttendanceUpdating(false);
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

  if (!isOpen) return null;

  function toDateTimeLocalInputValue(isoString: string): string {
    // Convert ISO to datetime-local (yyyy-MM-ddTHH:mm)
    const d = new Date(isoString);
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }

  const openProviderPage = () => {
    try {
      if (provider === 'calcom' && booking) {
        const uid = booking.uid || String(booking.id);
        window.open(`https://app.cal.com/bookings/${encodeURIComponent(uid)}`, '_blank', 'noopener,noreferrer');
      } else if (provider === 'calendly') {
        const uri = (event as any)?.uri || eventUri || String(eventId);
        // If we have full API URI, try to open Calendly UI fallback
        // (Calendly doesn't expose a consistent public URL here, so we open the integrations page)
        window.open('https://calendly.com/app/scheduled_events', '_blank', 'noopener,noreferrer');
      }
    } catch {
      // ignore
    }
  };

  const cancelEvent = async () => {
    setActionError(null);
    setActionUpdating('cancel');
    try {
      const reason = window.prompt('Cancellation reason (optional):') || undefined;
      if (checkInId && manualCheckIn) {
        if (manualCheckIn.provider === 'calcom') {
          const uid = manualCheckIn.calcom_uid || String(manualCheckIn.event_id);
          await apiClient.cancelCalComBooking(String(uid), reason);
        } else if (manualCheckIn.provider === 'calendly') {
          const uri = manualCheckIn.event_uri || eventUri || String(eventId);
          await apiClient.cancelCalendlyEvent(String(uri), reason);
        }
        await loadEventDetails();
        onSalesUpdated?.();
        return;
      }
      if (provider === 'calcom') {
        const uid = booking?.uid || (booking?.id != null ? String(booking.id) : String(eventId));
        await apiClient.cancelCalComBooking(String(uid), reason);
      } else if (provider === 'manual') {
        const raw = String(eventId);
        const mid = raw.replace(/^manual_/, '');
        await apiClient.updateCheckInDetails(mid, { cancelled: true, completed: false, no_show: false });
      } else {
        const uri = (event as any)?.uri || eventUri || String(eventId);
        await apiClient.cancelCalendlyEvent(String(uri), reason);
      }
      await loadEventDetails();
      onSalesUpdated?.();
    } catch (err: any) {
      console.error('Failed to cancel event:', err);
      setActionError(err?.response?.data?.detail || err?.message || 'Failed to cancel event');
    } finally {
      setActionUpdating(null);
    }
  };

  const renderFormResponses = () => {
    if (provider === 'calcom' && booking) {
      // Cal.com form responses: use bookingFieldsResponses from JSON when present, else responses
      const responses = (booking.bookingFieldsResponses && typeof booking.bookingFieldsResponses === 'object')
        ? (booking.bookingFieldsResponses as Record<string, unknown>)
        : (booking.responses || {});
      const bookingFields = booking.bookingFields || [];
      const routingFormResponses = booking.routingFormResponses || [];

      const hasResponses = Object.keys(responses).length > 0;
      const hasBookingFields = bookingFields.length > 0 && hasResponses;
      const hasRoutingForms = routingFormResponses.length > 0;

      if (!hasResponses && !hasRoutingForms) {
        return (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No form responses collected for this booking.
          </div>
        );
      }

      return (
        <div className="space-y-6">
          {/* Routing Form Responses (Pre-call information) */}
          {hasRoutingForms && (
            <div>
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Pre-Call Routing Form Responses
              </h5>
              {routingFormResponses.map((formResponse: any, idx: number) => (
                <div key={idx} className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <div className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                    Form ID: {formResponse.formId || 'N/A'}
                  </div>
                  {formResponse.response && typeof formResponse.response === 'object' && (
                    <div className="space-y-2">
                      {Object.entries(formResponse.response).map(([fieldId, fieldData]: [string, any]) => (
                        <div key={fieldId} className="border-b border-blue-200 dark:border-blue-700 pb-2">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {fieldData.label || fieldId}
                          </div>
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {fieldData.value || (typeof fieldData === 'string' ? fieldData : JSON.stringify(fieldData))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {formResponse.createdAt && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Submitted: {new Date(formResponse.createdAt).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Booking Form Responses: from bookingFields when available, else raw key/value */}
          {hasResponses && (
            <div>
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Booking Form Responses
              </h5>
              {bookingFields.length > 0 ? (
                <>
                  {bookingFields.map((field: any, idx: number) => {
                    const fieldValue = responses[field.name] ?? responses[field.label] ?? responses[field.slug] ?? field.value;
                    if (fieldValue == null || fieldValue === '') return null;
                    return (
                      <div key={idx} className="border-b border-gray-200 dark:border-gray-700 pb-3 mb-3">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          {field.label || field.name || field.slug || `Question ${idx + 1}`}
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-100">
                          {typeof fieldValue === 'object' ? JSON.stringify(fieldValue) : String(fieldValue)}
                        </div>
                      </div>
                    );
                  })}
                  {/* Unmapped response keys (slug in responses but not in bookingFields) */}
                  {(() => {
                    const mappedKeys = new Set(
                      bookingFields.flatMap((f: any) => [f.name, f.label, f.slug].filter(Boolean))
                    );
                    const unmapped = Object.entries(responses).filter(([k]) => !mappedKeys.has(k));
                    if (unmapped.length === 0) return null;
                    return (
                      <div className="mt-4">
                        {unmapped.map(([key, value]) => (
                          <div key={key} className="border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{key}</div>
                            <div className="text-sm text-gray-900 dark:text-gray-100">
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </>
              ) : (
                /* No bookingFields: show all responses by key (e.g. from bookingFieldsResponses only) */
                <div className="space-y-2">
                  {Object.entries(responses).map(([key, value]) => (
                    <div key={key} className="border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{key}</div>
                      <div className="text-sm text-gray-900 dark:text-gray-100">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      );
    } else if (provider === 'calendly' && event) {
      // Calendly invitee form responses and routing form submissions
      const invitees = event.invitees || [];
      const routingFormSubmissions = event.routingFormSubmissions || [];
      
      const hasInvitees = invitees.length > 0;
      const hasRoutingForms = routingFormSubmissions.length > 0;
      
      if (!hasInvitees && !hasRoutingForms) {
        return (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            No form responses available for this event.
          </div>
        );
      }

      return (
        <div className="space-y-6">
          {/* Routing Form Submissions (Pre-call information) */}
          {hasRoutingForms && (
            <div>
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Pre-Call Routing Form Submissions
              </h5>
              {routingFormSubmissions.map((submission: any, idx: number) => {
                // Prefer questions_and_answers from Calendly API GET /routing_form_submissions/{uuid}
                const qa = Array.isArray(submission.questions_and_answers)
                  ? submission.questions_and_answers
                  : (submission.answers || []);
                const hasQa = qa.length > 0;
                return (
                  <div key={idx} className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-2">
                      Submitted by: {submission.submitter_email || submission.email || 'N/A'}
                    </div>
                    {hasQa ? (
                      <div className="space-y-2">
                        {qa.map((item: any, answerIdx: number) => (
                          <div key={answerIdx} className="border-b border-blue-200 dark:border-blue-700 pb-2">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                              {item.question || item.label || `Question ${answerIdx + 1}`}
                            </div>
                            <div className="text-sm text-gray-900 dark:text-gray-100">
                              {item.answer ?? item.value ?? 'No answer provided'}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        No answers in this submission.
                      </div>
                    )}
                    {(submission.submitted_at || submission.created_at) && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        Submitted: {new Date(submission.submitted_at || submission.created_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Invitee Form Responses */}
          {hasInvitees && (
            <div>
              <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Invitee Form Responses
              </h5>
              {invitees.map((invitee: any, idx: number) => (
                <div key={idx} className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Invitee {idx + 1}
                    {invitee.name && `: ${invitee.name}`}
                    {invitee.email && ` (${invitee.email})`}
                  </h4>
                  
                  {/* Form answers */}
                  {invitee.answers && invitee.answers.length > 0 ? (
                    <div className="space-y-3">
                      {invitee.answers.map((answer: any, answerIdx: number) => (
                        <div key={answerIdx} className="pl-4 border-l-2 border-primary-300 dark:border-primary-700">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {answer.question || `Question ${answerIdx + 1}`}
                          </div>
                          <div className="text-sm text-gray-900 dark:text-gray-100">
                            {answer.answer || answer.value || 'No answer provided'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      No form responses collected for this invitee.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (checkInId && provider === 'calcom' && !booking) {
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Could not load live Cal.com booking details (needed for pre-call routing and booking questions). Try syncing
          the calendar again, or open the booking in Cal.com.
        </div>
      );
    }
    if (checkInId && provider === 'calendly' && !event) {
      return (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Could not load live Calendly event details (needed for routing forms and invitee answers). Ensure the event
          still exists and the integration is connected.
        </div>
      );
    }

    return null;
  };

  const currentEvent = provider === 'calcom' ? booking : event;
  const effectiveEvent =
    checkInId && manualCheckIn ? manualCheckIn : provider === 'manual' ? manualCheckIn : currentEvent;

  if (!isOpen || !portalReady) return null;

  const modal = (
    <div className="fixed inset-0 z-[200] overflow-y-auto" onClick={onClose}>
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose}></div>

        {/* Modal panel */}
        <div
          className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Event Details
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading event details...</p>
              </div>
            ) : error ? (
              <div className="text-center py-8">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                <button
                  onClick={loadEventDetails}
                  className="mt-4 px-4 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Retry
                </button>
              </div>
            ) : effectiveEvent ? (
              <div className="space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {!checkInId ? (
                  <button
                    onClick={openProviderPage}
                    className="px-3 py-1.5 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20"
                    type="button"
                  >
                    Open in {provider === 'calcom' ? 'Cal.com' : 'Calendly'}
                  </button>
                  ) : null}
                  <button
                    onClick={cancelEvent}
                    disabled={actionUpdating === 'cancel'}
                    className="px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                    type="button"
                  >
                    {actionUpdating === 'cancel' ? 'Cancelling…' : 'Cancel event'}
                  </button>
                  {actionError && (
                    <div className="text-sm text-red-600 dark:text-red-400">{actionError}</div>
                  )}
                </div>

                {/* Basic Information */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Basic Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Title:</span>
                      <span className="text-gray-900 dark:text-gray-100 font-medium">
                        {checkInId && manualCheckIn
                          ? (manualCheckIn.title || 'Booking')
                          : provider === 'calcom' 
                          ? (booking?.title || booking?.eventType?.title || 'Untitled')
                          : provider === 'manual'
                          ? (manualCheckIn?.title || 'Manual check-in')
                          : (event?.name || 'Untitled Event')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Start Time:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {formatDateTime(
                          checkInId && manualCheckIn?.start_time
                            ? String(manualCheckIn.start_time)
                            : provider === 'calcom'
                            ? booking!.startTime
                            : provider === 'manual'
                            ? String(manualCheckIn?.start_time || '')
                            : event!.start_time
                        )}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">End Time:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {formatDateTime(
                          checkInId && manualCheckIn?.end_time
                            ? String(manualCheckIn.end_time)
                            : provider === 'calcom'
                            ? booking!.endTime
                            : provider === 'manual'
                            ? String(manualCheckIn?.end_time || '')
                            : event!.end_time
                        )}
                      </span>
                    </div>
                    {/* Status: cancelled / no-show / confirmed (Cal.com and Calendly) */}
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Status:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {checkInId && manualCheckIn ? (
                          manualCheckIn.cancelled ? (
                            <span className="text-red-600 dark:text-red-400 font-medium">Cancelled</span>
                          ) : manualCheckIn.no_show ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">No-show</span>
                          ) : manualCheckIn.completed ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">Completed</span>
                          ) : (
                            <span className="text-green-600 dark:text-green-400">Confirmed</span>
                          )
                        ) : provider === 'calcom' && booking ? (() => {
                          const isNoShow = booking.status === 'accepted' && (
                            booking.absentHost === true ||
                            (Array.isArray(booking.attendees) && booking.attendees.some((a: { absent?: boolean }) => a.absent === true))
                          );
                          if (isNoShow) return <span className="text-amber-600 dark:text-amber-400 font-medium">No-show</span>;
                          if (booking.status === 'cancelled') {
                            return (
                              <span>
                                <span className="text-red-600 dark:text-red-400 font-medium">Cancelled</span>
                                {booking.cancellationReason && (
                                  <span className="block text-gray-600 dark:text-gray-400 text-xs mt-1">{booking.cancellationReason}</span>
                                )}
                                {booking.cancelledByEmail && (
                                  <span className="block text-gray-500 dark:text-gray-500 text-xs">by {booking.cancelledByEmail}</span>
                                )}
                              </span>
                            );
                          }
                          if (booking.status === 'accepted') return <span className="text-green-600 dark:text-green-400">Confirmed</span>;
                          if (booking.status === 'rejected') return <span className="text-red-600 dark:text-red-400">Rejected</span>;
                          return <span>{booking.status || '—'}</span>;
                        })() : event ? (
                          event.status === 'canceled' || event.status === 'cancelled'
                            ? <span className="text-red-600 dark:text-red-400 font-medium">Canceled</span>
                            : event.status === 'active'
                            ? <span className="text-green-600 dark:text-green-400">Active</span>
                            : <span>{event.status || '—'}</span>
                        ) : manualCheckIn ? (
                          manualCheckIn.cancelled
                            ? <span className="text-red-600 dark:text-red-400 font-medium">Cancelled</span>
                            : manualCheckIn.no_show
                            ? <span className="text-amber-600 dark:text-amber-400 font-medium">No-show</span>
                            : manualCheckIn.completed
                            ? <span className="text-green-600 dark:text-green-400 font-medium">Completed</span>
                            : <span className="text-gray-700 dark:text-gray-300">Scheduled</span>
                        ) : '—'}
                      </span>
                    </div>
                    {provider === 'calcom' && booking?.location && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Location:</span>
                        <span className="text-gray-900 dark:text-gray-100">{booking.location}</span>
                      </div>
                    )}
                    {provider === 'calendly' && event?.location && (
                      <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Location:</span>
                        <span className="text-gray-900 dark:text-gray-100">
                          {typeof event.location === 'string' 
                            ? event.location 
                            : event.location.location || 'N/A'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Check-in row (synced Cal.com/Calendly + manual): event outcome */}
                {manualCheckIn && resolveCheckInIdForPatch() && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Event status
                    </h4>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-sm text-gray-700 dark:text-gray-300">
                        <span className="sr-only">Outcome</span>
                        <select
                          value={attendanceValue(manualCheckIn)}
                          disabled={attendanceUpdating || salesUpdating}
                          onChange={(e) => void setAttendanceStatus(e.target.value as AttendanceStatus)}
                          className="mt-1 block w-full max-w-xs px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                        >
                          <option value="confirmed">Confirmed / upcoming</option>
                          <option value="completed">Completed (showed up)</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="no_show">No-show</option>
                        </select>
                      </label>
                      {attendanceUpdating && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">Saving…</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {manualCheckIn.provider === 'manual'
                        ? 'Updates the sales calendar and metrics for this manual booking.'
                        : 'Updates the sales calendar, close-rate, and show-up metrics. Provider sync may overwrite these unless you override again.'}
                    </p>
                  </div>
                )}

                {/* Sales call tracking */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Sales call tracking
                  </h4>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!(checkInId && manualCheckIn ? manualCheckIn.is_sales_call : provider === 'calcom' ? booking?.is_sales_call : provider === 'manual' ? manualCheckIn?.is_sales_call : event?.is_sales_call)}
                        disabled={salesUpdating}
                        onChange={(e) => updateSalesFlags({ is_sales_call: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Sales call</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!(checkInId && manualCheckIn ? manualCheckIn.sale_closed : provider === 'calcom' ? booking?.sale_closed : provider === 'manual' ? manualCheckIn?.sale_closed : event?.sale_closed)}
                        disabled={salesUpdating}
                        onChange={(e) => updateSalesFlags({ sale_closed: e.target.checked })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Sale closed</span>
                    </label>
                    {salesUpdating && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Updating…</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Sales call close-rate counts as <span className="font-medium">closed</span> when either the sale is marked closed or the client has a succeeded Stripe payment. Setting “Sale closed” also marks it as a sales call for tracking.
                  </p>
                </div>

                {/* Reschedule (manual only) */}
                {provider === 'manual' && manualCheckIn && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Reschedule
                    </h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="block mb-1 text-gray-500 dark:text-gray-400">Start</span>
                          <input
                            type="datetime-local"
                            value={rescheduleDraft.start || ''}
                            onChange={(e) => setRescheduleDraft((p) => ({ ...p, start: e.target.value }))}
                            className="w-full px-3 py-2 glass-input rounded-md"
                          />
                        </label>
                        <label className="text-sm text-gray-700 dark:text-gray-300">
                          <span className="block mb-1 text-gray-500 dark:text-gray-400">End (optional)</span>
                          <input
                            type="datetime-local"
                            value={rescheduleDraft.end || ''}
                            onChange={(e) => setRescheduleDraft((p) => ({ ...p, end: e.target.value }))}
                            className="w-full px-3 py-2 glass-input rounded-md"
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          disabled={rescheduleUpdating || !rescheduleDraft.start}
                          onClick={async () => {
                            setRescheduleError(null);
                            setRescheduleUpdating(true);
                            try {
                              const raw = String(eventId);
                              const checkInId = raw.replace(/^manual_/, '');
                              const startISO = new Date(rescheduleDraft.start!).toISOString();
                              const endISO = rescheduleDraft.end ? new Date(rescheduleDraft.end).toISOString() : undefined;
                              await apiClient.rescheduleCheckIn(checkInId, startISO, endISO);
                              await loadEventDetails();
                              onSalesUpdated?.();
                            } catch (err: any) {
                              console.error('Failed to reschedule manual event:', err);
                              setRescheduleError(err?.response?.data?.detail || err?.message || 'Failed to reschedule');
                            } finally {
                              setRescheduleUpdating(false);
                            }
                          }}
                          className="px-3 py-1.5 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
                        >
                          {rescheduleUpdating ? 'Saving…' : 'Save new time'}
                        </button>
                        {rescheduleError && <span className="text-sm text-red-600 dark:text-red-400">{rescheduleError}</span>}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Manual events can be rescheduled here or by dragging on the calendar.
                      </p>
                    </div>
                  </div>
                )}

                {/* Form Responses */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Pre-Call Information & Form Responses
                  </h4>
                  {renderFormResponses()}
                </div>

                {/* Additional Details */}
                {provider === 'calcom' && booking && (
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                      Additional Details
                    </h4>
                    <div className="space-y-2 text-sm">
                      {booking.description && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Description:</span>
                          <p className="text-gray-900 dark:text-gray-100 mt-1">{booking.description}</p>
                        </div>
                      )}
                      {booking.attendees && booking.attendees.length > 0 && (
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Attendees:</span>
                          <div className="mt-1 space-y-1">
                            {booking.attendees.map((attendee: any, idx: number) => (
                              <div key={idx} className="text-gray-900 dark:text-gray-100">
                                {attendee.name || attendee.email}
                                {attendee.email && attendee.name && ` (${attendee.email})`}
                                {attendee.absent === true && (
                                  <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-medium">No-show</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {booking.absentHost === true && (
                        <div className="text-amber-600 dark:text-amber-400 text-sm">
                          Host was marked absent (no-show).
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              onClick={onClose}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-primary-600 text-base font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

