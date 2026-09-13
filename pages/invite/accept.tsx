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
  needs_email?: boolean;
  needs_org_name?: boolean;
};

export default function InviteAcceptPage() {
  const router = useRouter();
  const { token } = router.query;
  const [validateState, setValidateState] = useState<ValidateState | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || typeof token !== 'string') {
      setValidateState({ valid: false, message: 'Invalid invitation link.' });
      setLoading(false);
      return;
    }
    const gerr = typeof router.query.google_error === 'string' ? router.query.google_error : '';
    if (gerr) setError(gerr);
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
            needs_email: data.needs_email === true,
            needs_org_name: data.needs_org_name === true,
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
  }, [token, router.query.google_error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || typeof token !== 'string') return;
    setError('');
    setSubmitting(true);
    try {
      if (validateState?.needs_org_name && !orgName.trim()) {
        setError('Organization name is required.');
        setSubmitting(false);
        return;
      }
      if (validateState?.needs_email && !email.trim()) {
        setError('Email is required to create your account.');
        setSubmitting(false);
        return;
      }
      const res = await apiClient.acceptInvite({
        token,
        password: password.trim() || undefined,
        email: email.trim() || undefined,
        org_name: orgName.trim() || undefined,
      });
      if (res.access_token) {
        Cookies.set('access_token', res.access_token, {
          expires: 1,
          sameSite: 'lax',
          secure: window.location.protocol === 'https:',
          path: '/',
        });
        await new Promise((r) => setTimeout(r, 150));
        window.location.href = '/onboarding/book-call';
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
            {validateState.needs_org_name
              ? 'Create your organization'
              : `Join ${validateState.org_name || 'this organization'}`}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            {validateState.needs_org_name
              ? 'Name your org, then create an account with email or Google.'
              : validateState.invitation_type === 'ORG_ADMIN'
                ? 'Create your account as an organization admin.'
                : `You’re being added as ${validateState.role || 'a member'}.`}
          </p>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md p-3 bg-red-500/10 border border-red-400/40 text-sm text-red-800 dark:text-red-200">
              {error}
            </div>
          )}

          {validateState.needs_org_name ? (
            <div>
              <label htmlFor="orgName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Organization name
              </label>
              <input
                id="orgName"
                name="orgName"
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Your company or team name"
                className="block w-full px-3 py-2 glass-input rounded-md sm:text-sm"
              />
            </div>
          ) : null}

          <div className="space-y-4">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              Create your account
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
              Use email and a password, or sign in with Google.
            </p>

            {validateState.needs_email ? (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="block w-full px-3 py-2 glass-input rounded-md sm:text-sm"
                />
              </div>
            ) : null}

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
                placeholder="Choose a password"
                className="block w-full px-3 py-2 glass-input rounded-md sm:text-sm"
              />
            </div>
          </div>

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
            disabled={submitting || !token || typeof token !== 'string'}
            onClick={() => {
              if (!token || typeof token !== 'string') return;
              if (validateState.needs_org_name && !orgName.trim()) {
                setError('Organization name is required.');
                return;
              }
              const base = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
              const qs = new URLSearchParams({
                mode: 'invite',
                invite_token: token,
                redirect: '1',
              });
              if (orgName.trim()) qs.set('org_name', orgName.trim());
              window.location.href = `${base}/auth/google/start?${qs.toString()}`;
            }}
            className="w-full flex justify-center items-center gap-2 py-2.5 px-4 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 glass-card disabled:opacity-50"
          >
            Sign in with Google
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex justify-center py-2.5 px-4 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50"
          >
            {submitting ? 'Accepting…' : 'Accept & continue'}
          </button>
        </form>

        <div className="border-t border-gray-300 dark:border-gray-600" />

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="text-primary-500 hover:text-primary-600 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
