'use client';

import { useEffect, useState } from 'react';

/**
 * Subscribe to a CSS media query. Returns `false` during SSR / before hydration
 * to avoid layout flashes that assume a mobile chrome.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Below Tailwind `lg` (1024px) — sidebar becomes an overlay drawer. */
export const MOBILE_NAV_QUERY = '(max-width: 1023.98px)';

export function useIsMobileNav(): boolean {
  return useMediaQuery(MOBILE_NAV_QUERY);
}
