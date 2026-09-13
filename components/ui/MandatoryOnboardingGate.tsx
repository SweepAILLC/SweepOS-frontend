import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/invite',
  '/kpi-entry',
  '/close-survey',
  '/auth/google',
  '/auth/mcp',
  '/select-organization',
  '/onboarding',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function MandatoryOnboardingGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [callBooked, setCallBooked] = useState(true);

  const applyUser = useCallback((user: { onboarding_call_booked?: boolean }) => {
    setCallBooked(user.onboarding_call_booked !== false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isPublicPath(window.location.pathname) || !Cookies.get('access_token')) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    apiClient
      .getCurrentUser()
      .then((user) => {
        if (!cancelled) applyUser(user as { onboarding_call_booked?: boolean });
      })
      .catch(() => {
        /* auth interceptor handles 401 */
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyUser]);

  useEffect(() => {
    if (checking || callBooked) return;
    void router.replace('/onboarding/book-call');
  }, [checking, callBooked, router]);

  return <>{children}</>;
}
