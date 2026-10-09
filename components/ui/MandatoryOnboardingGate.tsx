import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';

export const ONBOARDING_CALL_BOOKED_KEY = 'onboarding_call_booked';

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

function sessionCallBooked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(ONBOARDING_CALL_BOOKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingCallBooked(): void {
  try {
    sessionStorage.setItem(ONBOARDING_CALL_BOOKED_KEY, '1');
  } catch {
    /* private mode */
  }
}

export default function MandatoryOnboardingGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = router.pathname;
  const [checking, setChecking] = useState(true);
  const [callBooked, setCallBooked] = useState(true);

  const applyUser = useCallback((user: { onboarding_call_booked?: boolean }) => {
    const booked = user.onboarding_call_booked !== false;
    if (booked) markOnboardingCallBooked();
    setCallBooked(booked || sessionCallBooked());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !router.isReady) return;
    if (sessionCallBooked()) {
      setCallBooked(true);
      setChecking(false);
      return;
    }
    if (isPublicPath(pathname) || !Cookies.get('access_token')) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    setChecking(true);
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
  }, [applyUser, pathname, router.isReady]);

  useEffect(() => {
    if (checking || callBooked || sessionCallBooked()) return;
    if (isPublicPath(pathname)) return;
    void router.replace('/onboarding/book-call');
  }, [checking, callBooked, pathname, router]);

  return <>{children}</>;
}
