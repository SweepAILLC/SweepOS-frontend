import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';

/**
 * Legacy login org-picker route.
 * Multi-org users now enter their primary account at login and switch in Settings → Accounts.
 */
export default function SelectOrganization() {
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;
    const hasToken = Boolean(Cookies.get('access_token'));
    window.location.replace(hasToken ? '/' : '/login');
  }, [router.isReady]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center max-w-sm px-4">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          Redirecting… Switch accounts anytime in Settings → Accounts.
        </p>
      </div>
    </div>
  );
}
