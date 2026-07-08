import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';

type ValidateState = {
  valid: boolean;
  org_name?: string;
  invitation_type?: string;
  role?: string;
  message?: string;
};

export default function InviteAcceptPage() {
  const router = useRouter();
  const { token } = router.query;
  const [validateState, setValidateState] = useState<ValidateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || typeof token !== 'string') {
      setValidateState({ valid: false, message: 'Invalid invitation link.' });
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient.validateInviteToken(token);
        if (!cancelled) {
          setValidateState({
            valid: data.valid === true,
            org_name: data.org_name,
            invitation_type: data.invitation_type,
            role: data.role,
            message: data.message,
          });
        }
      } catch (err: any) {
        if (!cancelled) {
          setValidateState({ valid: false, message: 'This invitation link is invalid or has expired.' });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || typeof token !== 'string') return;
    setError('');
    setSubmitting(true);
    try {
      const res = await apiClient.acceptInvite({ token, password: password.trim() || undefined });
      if (res.access_token) {
        Cookies.set('access_token', res.access_token, {
          expires: 1,
          sameSite: 'lax',
          secure: window.location.protocol === 'https:',
          path: '/',
        });
        await new Promise((r) => setTimeout(r, 150));
        window.location.href = '/';
        return;
      }
      setError('Something went wrong. Please try again.');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Failed to accept invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">Checking invitation…</p>
        </div>
      </div>
    );
  }

  if (!validateState?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4">
        <div className="max-w-md w-full space-y-6 glass-card p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Invalid invitation</h2>
          <p className="text-gray-600 dark:text-gray-400">{validateState?.message || 'This link is invalid or has expired.'}</p>
          <Link href="/login" className="inline-block text-primary-500 hover:text-primary-600 font-medium">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 glass-card p-8">
        <div>
          <h2 className="text-center text-2xl font-bold text-gray-900 dark:text-gray-100">
            Join {validateState.org_name || 'this organization'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            {validateState.invitation_type === 'ORG_ADMIN'
              ? 'Set up your account as an organization admin.'
              : `You’re being added as ${validateState.role || 'a member'}.`}
          </p>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md p-3 bg-red-500/10 border border-red-400/40 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set your password (leave blank if you already have an account)"
              className="block w-full px-3 py-2 glass-input rounded-md sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              New users: enter a password. Existing users: leave blank and click Accept.
            </p>
          </div>
          <div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex justify-center py-2 px-4 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50"
            >
              {submitting ? 'Accepting…' : 'Accept & continue'}
            </button>
          </div>
        </form>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          <Link href="/login" className="text-primary-500 hover:text-primary-600">
            Already have an account? Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
