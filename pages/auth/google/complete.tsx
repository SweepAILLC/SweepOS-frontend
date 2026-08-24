import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';

/**
 * Completes Google OAuth by reading `token` from the query string
 * (set by the backend callback redirect) and storing the access cookie.
 */
export default function GoogleAuthComplete() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    const token = typeof router.query.token === 'string' ? router.query.token : '';
    const googleError =
      typeof router.query.google_error === 'string' ? router.query.google_error : '';
    if (googleError) {
      setError(googleError);
      return;
    }
    if (!token) {
      setError('Missing sign-in token.');
      return;
    }
    Cookies.set('access_token', token, {
      expires: 1,
      sameSite: 'lax',
      secure: window.location.protocol === 'https:',
      path: '/',
    });
    sessionStorage.setItem('newSession', '1');
    sessionStorage.removeItem('login_password');
    sessionStorage.removeItem('login_email');

    // Always enter the primary (or selected) account; switch orgs in Settings → Accounts.
    window.location.href = '/';
  }, [router.isReady, router.query]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
        <div className="max-w-md w-full glass-card p-8 text-center space-y-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Google sign-in failed
          </h1>
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          <Link href="/login" className="text-primary-500 hover:text-primary-600 font-medium">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
        <p className="mt-3 text-gray-600 dark:text-gray-400">Finishing Google sign-in…</p>
      </div>
    </div>
  );
}
