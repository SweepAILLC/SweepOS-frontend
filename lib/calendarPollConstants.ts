/** Shared calendar polling intervals (Terminal + Calendar tab). */

/** Pull Cal.com/Calendly into DB when last provider sync is older than this. */
export const CALENDAR_PROVIDER_SYNC_STALE_MS = 90 * 1000;

/** Interval for background provider → DB sync while tab is visible. */
export const CALENDAR_PROVIDER_SYNC_INTERVAL_MS = 90 * 1000;

/** Poll DB canonical rows (GET /calendar/synced-bookings). */
export const CALENDAR_DB_REFETCH_INTERVAL_MS = 30 * 1000;

/** Poll webhook/sync marker (GET /calendar/last-updated). */
export const CALENDAR_WEBHOOK_MARKER_INTERVAL_MS = 10 * 1000;

/** Defer first provider sync after mount so login sync can finish. */
export const CALENDAR_DEFERRED_PROVIDER_SYNC_MS = 4000;

/** Minimum gap between POST /clients/check-ins/sync calls. */
export const MIN_CALENDAR_CHECKIN_SYNC_GAP_MS = 60 * 1000;
