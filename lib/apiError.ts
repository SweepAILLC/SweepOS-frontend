/**
 * Normalize axios/API errors into a single user-facing message.
 */
export function formatApiError(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const anyErr = err as {
    response?: { data?: { detail?: unknown }; status?: number };
    message?: string;
  };
  const detail = anyErr.response?.data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d) => {
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object' && 'msg' in d) return String((d as { msg?: string }).msg || '').trim();
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  if (detail && typeof detail === 'object' && 'msg' in detail) {
    const m = (detail as { msg?: string }).msg;
    if (typeof m === 'string' && m.trim()) return m.trim();
  }
  const status = anyErr.response?.status;
  if (status === 401) return 'Your session expired — refresh the page and sign in again.';
  if (status === 403) return 'You don’t have permission to do that.';
  if (status === 404) return 'That resource was not found.';
  if (status === 429) return 'Too many requests — wait a moment and try again.';
  if (status === 502 || status === 503) return 'The service is temporarily unavailable. Try again shortly.';
  const msg = anyErr.message;
  if (typeof msg === 'string' && msg.trim() && !/^Request failed with status code \d+$/i.test(msg)) {
    return msg.trim();
  }
  return fallback;
}
