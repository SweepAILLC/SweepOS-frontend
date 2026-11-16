/** Safe profile URL from a stored handle or an instagram.com link. */
export function instagramProfileUrl(raw: string | null | undefined): string | null {
  const text = (raw || '').trim();
  if (!text) return null;

  const fromUrl = text.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const handle = (fromUrl ? fromUrl[1] : text.replace(/^@+/, '').split(/[/?#\s]/)[0] || '')
    .replace(/^\.+|\.+$/g, '');
  if (!handle || !/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null;
  if (['p', 'reel', 'reels', 'stories', 'explore'].includes(handle.toLowerCase())) return null;
  return `https://www.instagram.com/${handle}/`;
}

export default function InstagramProfileLink({
  instagram,
}: {
  instagram?: string | null;
}) {
  const href = instagramProfileUrl(instagram);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open Instagram profile"
      title="Instagram"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex shrink-0 items-center text-gray-500 hover:text-pink-600 dark:text-gray-400 dark:hover:text-pink-400"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    </a>
  );
}
