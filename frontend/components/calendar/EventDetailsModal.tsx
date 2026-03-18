import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { CalComBooking, CalendlyScheduledEvent } from '@/types/integration';

interface EventDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: 'calcom' | 'calendly';
  eventId: string | number;
  eventUri?: string; // For Calendly
  onSalesUpdated?: () => void;
}

export default function EventDetailsModal({
  isOpen,
  onClose,
  provider,
  eventId,
  eventUri,
  onSalesUpdated
}: EventDetailsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<CalComBooking | null>(null);
  const [event, setEvent] = useState<CalendlyScheduledEvent | null>(null);
  const [salesUpdating, setSalesUpdating] = useState(false);

  useEffect(() => {
    if (isOpen && eventId) {
      loadEventDetails();
    } else {
      // Reset state when modal closes
      setBooking(null);
      setEvent(null);
      setError(null);
      setLoading(false);
    }
  }, [isOpen, eventId, provider]);

  const loadEventDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (provider === 'calcom') {
        const data = await apiClient.getCalComBookingDetails(String(eventId));
        setBooking(data);
      } else {
        // For Calendly, use the event URI
        const uri = eventUri || eventId;
        const data = await apiClient.getCalendlyEventDetails(String(uri));
        setEvent(data);
      }
    } catch (err: any) {
      console.error('Failed to load event details:', err);
      setError(err?.response?.data?.detail || err?.message || 'Failed to load event details');
    } finally {
      setLoading(false);
    }
  };

  const updateSalesFlags = async (updates: { is_sales_call?: boolean; sale_closed?: boolean | null }) => {
    const eventIdStr = provider === 'calcom'
      ? String((booking as CalComBooking)?.uid ?? (booking as CalComBooking)?.id ?? eventId)
      : String(eventId);
    const payload: Parameters<typeof apiClient.updateCalendarBookingSales>[2] = { ...updates };
    if (provider === 'calendly' && (eventUri || (event as CalendlyScheduledEvent)?.uri)) {
      payload.event_uri = eventUri || (event as CalendlyScheduledEvent)?.uri;
    }
    setSalesUpdating(true);
    try {
      await apiClient.updateCalendarBookingSales(provider, eventIdStr, payload);
      if (provider === 'calcom' && booking) {
        setBooking({ ...booking, ...updates });
      } else if (provider === 'calendly' && event) {
        setEvent({ ...event, ...updates });
      }
      onSalesUpdated?.();
    } catch (err) {
      console.error('Failed to update sales flags:', err);
    } finally {
      setSalesUpdating(false);
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
    
    return null;
  };

  const currentEvent = provider === 'calcom' ? booking : event;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
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
            ) : currentEvent ? (
              <div className="space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Basic Information */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Basic Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Title:</span>
                      <span className="text-gray-900 dark:text-gray-100 font-medium">
                        {provider === 'calcom' 
                          ? (booking?.title || booking?.eventType?.title || 'Untitled')
                          : (event?.name || 'Untitled Event')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Start Time:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {formatDateTime(provider === 'calcom' ? booking!.startTime : event!.start_time)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">End Time:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {formatDateTime(provider === 'calcom' ? booking!.endTime : event!.end_time)}
                      </span>
                    </div>
                    {/* Status: cancelled / no-show / confirmed (Cal.com and Calendly) */}
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-gray-500 dark:text-gray-400">Status:</span>
                      <span className="text-gray-900 dark:text-gray-100">
                        {provider === 'calcom' && booking ? (() => {
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

                {/* Sales call tracking */}
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Sales call tracking
                  </h4>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!(provider === 'calcom' ? booking?.is_sales_call : event?.is_sales_call)}
                        disabled={salesUpdating}
                        onChange={(e) => updateSalesFlags({ is_sales_call: e.target.checked, sale_closed: e.target.checked ? (provider === 'calcom' ? booking?.sale_closed : event?.sale_closed) ?? false : null })}
                        className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Mark as sales call</span>
                    </label>
                    {(provider === 'calcom' ? booking?.is_sales_call : event?.is_sales_call) && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!(provider === 'calcom' ? booking?.sale_closed : event?.sale_closed)}
                          disabled={salesUpdating}
                          onChange={(e) => updateSalesFlags({ sale_closed: e.target.checked })}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Sale closed</span>
                      </label>
                    )}
                    {salesUpdating && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">Updating…</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Sales calls are used for close-rate tracking. If this contact pays (Stripe), their latest sales call is auto-marked closed.
                  </p>
                </div>

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
}

