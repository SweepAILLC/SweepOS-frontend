import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Surface Google OAuth errors from callback redirects
  useEffect(() => {
    if (!router.isReady) return;
    const gerr = typeof router.query.google_error === 'string' ? router.query.google_error : '';
    const msg = typeof router.query.message === 'string' ? router.query.message : '';
    if (gerr === 'no_account') {
      setError(msg || 'No SweepOS account for this Google email. Use your invite link to sign up.');
    } else if (gerr) {
      setError(msg || gerr.replace(/_/g, ' '));
    }
  }, [router.isReady, router.query.google_error, router.query.message]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent double submission
    if (submitting || loading) {
      return;
    }
    
    setError('');
    setSubmitting(true);
    setLoading(true);

    try {
      // Normalize email and password (match backend normalization)
      const normalizedEmail = email.toLowerCase().trim();
      const normalizedPassword = password.trim();
      
      if (!normalizedEmail || !normalizedPassword) {
        throw new Error('Email and password are required');
      }
      
      // Multi-org users land on their primary account; switch later in Settings → Accounts.
      let result = await apiClient.login(normalizedEmail, normalizedPassword);

      // Legacy fallback: if an older API still asks for org selection, pick primary and continue.
      if (result.requires_org_selection && result.organizations?.length) {
        const primary =
          result.organizations.find((o: { is_primary?: boolean }) => o.is_primary) ||
          result.organizations[0];
        result = await apiClient.login(normalizedEmail, normalizedPassword, primary.id);
      }

      if (!result.access_token) {
        throw new Error('No access token received');
      }

      sessionStorage.removeItem('login_email');
      sessionStorage.removeItem('login_password');

      // Small delay so the auth cookie is available before the dashboard loads
      await new Promise((resolve) => setTimeout(resolve, 150));

      const token = document.cookie.split('; ').find((row) => row.startsWith('access_token='));
      if (!token) {
        console.error('Cookie not found after login. This may indicate a CORS or cookie setting issue.');
      }

      // Mark as new session so dashboard starts on Terminal (refresh keeps current tab)
      sessionStorage.setItem('newSession', '1');
      window.location.href = '/';
    } catch (err: any) {
      console.error('Login error:', err);
      let errorMessage = 'Login failed';
      
      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
          // Handle validation errors array
          errorMessage = detail.map((e: any) => e.msg || JSON.stringify(e)).join(', ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = JSON.stringify(detail);
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      setLoading(false);
      setSubmitting(false);
      
      // Clear session storage on error
      sessionStorage.removeItem('login_email');
      sessionStorage.removeItem('login_password');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 glass-card p-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Sweep Coach OS
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Sign in to your account
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md glass-card p-4 border-red-400/40">
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 glass-input rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 glass-input rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading || submitting}
              className="group relative w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md glass-button neon-glow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-900 disabled:opacity-50"
            >
              {loading || submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </div>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-transparent text-gray-500 dark:text-gray-400">or</span>
          </div>
        </div>

        <button
          type="button"
          disabled={loading || submitting}
          onClick={async () => {
            setError('');
            setLoading(true);
            try {
              const base = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
              window.location.href = `${base}/auth/google/start?mode=login&redirect=1`;
            } catch (err: any) {
              setError(err?.message || 'Could not start Google sign-in');
              setLoading(false);
            }
          }}
          className="w-full flex justify-center items-center gap-2 py-2 px-4 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 glass-card hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.6 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12S6.9 21.2 12 21.2c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.5H12z"/>
          </svg>
          Sign in with Google
        </button>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          New here? Use the invite link you received — you can{' '}
          <span className="text-gray-700 dark:text-gray-300 font-medium">Sign up with Google</span> on the invite page.
        </p>
      </div>
    </div>
  );
}

