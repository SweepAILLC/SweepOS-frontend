export interface BrevoStatus {
  connected: boolean;
  account_email?: string;
  account_name?: string;
  message?: string;
}

export interface CalComStatus {
  connected: boolean;
  account_email?: string;
  account_name?: string;
  message?: string;
}

export interface CalComBooking {
  id: number;
  title?: string;
  description?: string;
  startTime: string; // ISO 8601 datetime string
  endTime: string; // ISO 8601 datetime string
  attendees?: Array<{
    email: string;
    name?: string;
    timeZone?: string;
    absent?: boolean; // No-show: marked via Cal.com "Mark a booking absence"
  }>;
  user?: {
    id: number;
    name?: string;
    email?: string;
    username?: string;
  };
  eventType?: {
    id: number;
    title?: string;
    slug?: string;
    length?: number;
  };
  status?: string; // accepted | cancelled | rejected | pending (Cal.com API v2)
  location?: string;
  cancellationReason?: string;
  cancelledByEmail?: string; // Who cancelled (when status is cancelled)
  absentHost?: boolean; // Host no-show (Cal.com "Mark a booking absence")
  rejectionReason?: string;
  rescheduled?: boolean;
  paid?: boolean;
  payment?: {
    id: number;
    amount: number;
    currency: string;
    success: boolean;
  };
  metadata?: Record<string, any>;
  /** Form responses keyed by field name/slug (from booking details API) */
  responses?: Record<string, unknown>;
  /** Event type booking field definitions */
  bookingFields?: Array<Record<string, unknown>>;
  /** Routing form responses (pre-call info) */
  routingFormResponses?: Array<{ formId?: string; response?: Record<string, unknown>; createdAt?: string }>;
}

export interface CalComEventType {
  id: number;
  title: string;
  slug: string;
  description?: string;
  length: number; // Duration in minutes (mapped from lengthInMinutes)
  lengthInMinutes?: number; // Original field from API
  hidden?: boolean;
  position?: number;
  eventName?: string;
  timeZone?: string;
  periodType?: string;
  periodDays?: number;
  periodStartDate?: string;
  periodEndDate?: string;
  periodCountCalendarDays?: boolean;
  requiresConfirmation?: boolean;
  bookingRequiresAuthentication?: boolean;
  recurringEvent?: Record<string, any>;
  recurrence?: Record<string, any>; // Cal.com API uses 'recurrence'
  price?: number;
  currency?: string;
  metadata?: Record<string, any>;
  locations?: Array<Record<string, any>>;
  bookingFields?: Array<Record<string, any>>;
  disableGuests?: boolean;
  bookingUrl?: string;
  lengthInMinutesOptions?: number[];
  slotInterval?: number;
  minimumBookingNotice?: number;
  beforeEventBuffer?: number;
  afterEventBuffer?: number;
  seatsPerTimeSlot?: Record<string, any>;
  seatsShowAvailabilityCount?: boolean;
  bookingLimitsCount?: Record<string, any>;
  bookerActiveBookingsLimit?: Record<string, any>;
  onlyShowFirstAvailableSlot?: boolean;
  bookingLimitsDuration?: Record<string, any>;
  bookingWindow?: Array<Record<string, any>>;
  bookerLayouts?: Record<string, any>;
  confirmationPolicy?: Record<string, any>;
  requiresBookerEmailVerification?: boolean;
  hideCalendarNotes?: boolean;
  color?: Record<string, any>;
  seats?: Record<string, any>;
  offsetStart?: number;
  customName?: string;
  destinationCalendar?: Record<string, any>;
  useDestinationCalendarEmail?: boolean;
  hideCalendarEventDetails?: boolean;
  hideOrganizerEmail?: boolean;
  calVideoSettings?: Record<string, any>;
  disableCancelling?: Record<string, any>;
  disableRescheduling?: Record<string, any>;
  interfaceLanguage?: string;
  allowReschedulingPastBookings?: boolean;
  allowReschedulingCancelledBookings?: boolean;
  showOptimizedSlots?: boolean;
}

export interface CalComBookingsResponse {
  bookings: CalComBooking[];
  total?: number;
  nextCursor?: number;
}

export interface CalComEventTypesResponse {
  event_types: CalComEventType[];
}

export interface CalendlyStatus {
  connected: boolean;
  account_email?: string;
  account_name?: string;
  message?: string;
}

export interface CalendlyScheduledEvent {
  uri: string; // Unique identifier URI
  name: string; // Event name
  status: string; // active, canceled, etc.
  start_time: string; // ISO 8601 datetime
  end_time: string; // ISO 8601 datetime
  event_type?: string; // URI to event type
  location?: Record<string, any>;
  invitees_counter?: { total: number; active: number; limit: number };
  created_at?: string;
  updated_at?: string;
  event_memberships?: Array<Record<string, any>>; // Host/organizer info
  event_guests?: Array<Record<string, any>>;
  calendar_event?: Record<string, any>;
  tracking?: Record<string, any>;
  [key: string]: any; // Allow extra fields
}

export interface CalendlyEventType {
  uri: string; // Unique identifier URI
  name: string; // Event type name
  active: boolean;
  slug: string;
  scheduling_url?: string;
  duration?: number; // Duration in minutes
  kind?: string; // "solo", "group", "collective", etc.
  pooling_type?: string;
  type?: string; // "StandardEventType", "AdhocEventType", etc.
  color?: string;
  created_at?: string;
  updated_at?: string;
  internal_note?: string;
  description_plain?: string;
  description_html?: string;
  profile?: Record<string, any>; // User profile info
  secret?: boolean;
  booking_questions?: Array<Record<string, any>>;
  custom_questions?: Array<Record<string, any>>;
  [key: string]: any; // Allow extra fields
}

export interface CalendlyScheduledEventsResponse {
  collection: CalendlyScheduledEvent[];
  pagination?: {
    count?: number;
    next_page?: string;
    previous_page?: string;
    next_page_token?: string;
  };
}

export interface CalendlyEventTypesResponse {
  collection: CalendlyEventType[];
  pagination?: {
    count?: number;
    next_page?: string;
    previous_page?: string;
    next_page_token?: string;
  };
}

export interface Payment {
  id: string;
  amount_cents: number; // Amount in cents
  currency?: string;
  status: string;
  created_at: number; // Unix timestamp
  client_id?: string;
  client_name?: string;
  client_email?: string;
  subscription_id?: string;
  receipt_url?: string;
}

export interface Subscription {
  id: string;
  customer_id: string;
  status: string;
  current_period_end: number; // Unix timestamp
  current_period_start?: number; // Unix timestamp
  amount: number;
}

export interface StripeSummary {
  total_mrr: number;
  total_arr: number;
  mrr_change?: number;
  mrr_change_percent?: number;
  new_customers?: number;
  churned_subscriptions?: number;
  failed_payments?: number;
  last_30_days_revenue: number;
  active_subscriptions: number;
  total_customers: number;
  average_client_ltv?: number;  // Average Lifetime Value (average total spend of all customers)
  payments: Payment[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  customers: Customer[];
}

export interface Invoice {
  id: string;
  amount: number;
  status: string;
  created_at: number;
  customer_id: string;
}

export interface Customer {
  id: string;
  email?: string;
  name?: string;
  created_at: number;
}

export interface RevenueTimelinePoint {
  date: string;
  revenue: number;
}

export interface RevenueTimeline {
  timeline: RevenueTimelinePoint[];
  total_revenue: number;
}

export interface ChurnMonthData {
  month: string;
  churn_rate: number;
  canceled: number;
  active: number;
}

export interface CohortMonthData {
  month: string;
  new_customers: number;
  churned: number;
}

export interface ChurnData {
  churn_by_month: ChurnMonthData[];
  cohort_snapshot: CohortMonthData[];
}

export interface MRRTrendPoint {
  date: string;
  mrr: number;
  subscriptions_count: number;
}

export interface MRRTrend {
  trend_data: MRRTrendPoint[];
  current_mrr: number;
  previous_mrr: number;
  growth_percent: number;
}

export interface FailedPayment extends Payment {
  has_recovery_recommendation: boolean;
  recovery_recommendation_id?: string;
  attempt_count?: number;  // Number of failed attempts for this subscription/client
  first_attempt_at?: number;  // Unix timestamp of first failed attempt
  latest_attempt_at?: number;  // Unix timestamp of most recent failed attempt
}

export interface CalendarUpcomingAppointment {
  id?: string;
  title: string;
  start_time: string; // ISO 8601 datetime
  end_time?: string; // ISO 8601 datetime
  link?: string; // Link to view/edit the appointment
  provider: string; // "calcom" or "calendly" or "manual"
  attendees?: Array<Record<string, any>>;
  location?: string;
  client_name?: string; // Client/contact name (for manual check-ins)
}

export interface CalendarNotificationsSummary {
  upcoming_count: number;
  last_week_count: number;
  last_month_count: number;
  last_week_percentage_change?: number | null;
  last_month_percentage_change?: number | null;
  show_up_rate?: number | null; // % of past appointments (last 30 days) that showed up; 0-100
  most_upcoming?: CalendarUpcomingAppointment | null;
  upcoming_appointments?: CalendarUpcomingAppointment[] | null; // Up to 3 upcoming appointments (including manual check-ins)
  provider?: string | null; // "calcom" or "calendly" or null
  connected: boolean;
}

