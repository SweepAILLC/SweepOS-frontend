'use client';

/**
 * Normalize a Cal.com booking URL or path into an embeddable iframe src.
 * Docs: https://cal.com/help/embedding/embed-instructions
 *
 * Accepts:
 * - https://cal.com/username/30min
 * - https://app.cal.com/username/30min
 * - username/30min
 */
export function toCalEmbedSrc(raw: string | null | undefined): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;

  try {
    if (!/^https?:\/\//i.test(trimmed)) {
      const path = trimmed.replace(/^\//, '').replace(/\/$/, '');
      if (!path || /\s/.test(path)) return null;
      return `https://cal.com/${path}?embed=true`;
    }

    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const isCal =
      host === 'cal.com' ||
      host.endsWith('.cal.com') ||
      host === 'cal.eu' ||
      host.endsWith('.cal.eu');

    if (isCal) {
      const path = u.pathname.replace(/^\//, '').replace(/\/$/, '');
      if (!path) return null;
      // Prefer public cal.com host for embeds (app.cal.com booking links still work as path)
      const origin =
        host === 'app.cal.com' || host.endsWith('.app.cal.com') ? 'https://cal.com' : `${u.protocol}//${u.host}`;
      const embedUrl = new URL(`${origin}/${path}`);
      embedUrl.searchParams.set('embed', 'true');
      // Preserve theme/layout query params if present
      u.searchParams.forEach((value, key) => {
        if (key !== 'embed') embedUrl.searchParams.set(key, value);
      });
      return embedUrl.toString();
    }

    // Non-Cal booking pages: still iframe when possible
    u.searchParams.set('embed', 'true');
    return u.toString();
  } catch {
    return null;
  }
}

type PortalBookingEmbedProps = {
  bookingUrl: string;
  className?: string;
};

export default function PortalBookingEmbed({ bookingUrl, className = '' }: PortalBookingEmbedProps) {
  const src = toCalEmbedSrc(bookingUrl);

  if (!src) {
    return (
      <p className="text-sm text-amber-700 dark:text-amber-300">
        Booking link looks invalid. Use a Cal.com event URL like{' '}
        <code className="text-xs">https://cal.com/your-user/30min</code>.
      </p>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-black/20 ${className}`}
    >
      <iframe
        src={src}
        title="Book a call"
        className="w-full border-0"
        style={{ minHeight: '420px', height: 'min(52vh, 480px)' }}
        loading="lazy"
        allow="camera; microphone; fullscreen; payment"
      />
    </div>
  );
}
