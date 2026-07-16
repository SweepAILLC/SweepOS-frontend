import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';

interface Organization {
  id: string;
  name: string;
  is_primary: boolean;
}

export default function SelectOrganization() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  /** Google / already-authed flow uses bearer token + switch-organization (no password). */
  const [tokenAuth, setTokenAuth] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;

    const bootstrap = async () => {
      const emailParam = typeof router.query.email === 'string' ? router.query.email : '';
      const storedEmail = sessionStorage.getItem('login_email') || '';
      const hasPassword = Boolean(sessionStorage.getItem('login_password'));
      const hasToken = Boolean(Cookies.get('access_token'));

      // Prefer authenticated Google/session flow when a token is present without a password login.
      if (hasToken && !hasPassword) {
        try {
          const me = await apiClient.getCurrentUser();
          const emailToUse = (me?.email || emailParam || storedEmail || '').toLowerCase().trim();
          if (!emailToUse) {
            router.replace('/login');
            return;
          }
          setTokenAuth(true);
          setEmail(emailToUse);
          sessionStorage.setItem('login_email', emailToUse);
          await loadOrganizations(emailToUse);
          return;
        } catch {
          Cookies.remove('access_token');
          router.replace('/login');
          return;
        }
      }

      const emailToUse = (emailParam || storedEmail || '').toLowerCase().trim();
      if (!emailToUse) {
        router.replace('/login');
        return;
      }

      setTokenAuth(false);
      setEmail(emailToUse);
      await loadOrganizations(emailToUse);
    };

    void bootstrap();
  }, [router.isReady, router.query.email]);

  const loadOrganizations = async (userEmail: string) => {
    try {
      setLoading(true);
      const orgs = await apiClient.getUserOrganizations(userEmail);
      setOrganizations(orgs);

      const primaryOrg = orgs.find((org: Organization) => org.is_primary);
      if (primaryOrg) {
        setSelectedOrgId(primaryOrg.id);
      } else if (orgs.length > 0) {
        setSelectedOrgId(orgs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load organizations:', err);
      let errorMessage = 'Failed to load organizations';

      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
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
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedOrgId) {
      setError('Please select an organization');
      return;
    }

    if (submitting) return;

    setError('');
    setSubmitting(true);

    try {
      if (tokenAuth || (Cookies.get('access_token') && !sessionStorage.getItem('login_password'))) {
        await apiClient.switchOrganization(selectedOrgId);
        sessionStorage.removeItem('login_email');
        sessionStorage.removeItem('login_password');
        sessionStorage.setItem('newSession', '1');
        await new Promise((resolve) => setTimeout(resolve, 150));
        window.location.href = '/';
        return;
      }

      const password = sessionStorage.getItem('login_password');
      if (!password) {
        throw new Error('Session expired. Please login again.');
      }

      const result = await apiClient.login(email, password, selectedOrgId);

      if (result.requires_org_selection) {
        setError('Organization selection still required. Please try again.');
        return;
      }

      if (!result.access_token) {
        throw new Error('No access token received');
      }

      sessionStorage.removeItem('login_email');
      sessionStorage.removeItem('login_password');
      sessionStorage.setItem('newSession', '1');

      await new Promise((resolve) => setTimeout(resolve, 150));
      window.location.href = '/';
    } catch (err: any) {
      console.error('Failed to login with organization:', err);
      let errorMessage = 'Failed to login';

      if (err.response?.data?.detail) {
        const detail = err.response.data.detail;
        if (Array.isArray(detail)) {
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

      if (errorMessage.includes('Session expired') || errorMessage.includes('expired')) {
        sessionStorage.clear();
        setTimeout(() => {
          router.push('/login');
        }, 2000);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleBack = () => {
    sessionStorage.clear();
    Cookies.remove('access_token');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading organizations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 glass-card p-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Select Organization
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Choose which organization you want to access
            {email ? (
              <>
                {' '}
                for <span className="font-medium text-gray-800 dark:text-gray-200">{email}</span>
              </>
            ) : null}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md glass-card p-4 border-red-400/40">
              <div className="text-sm text-red-800 dark:text-red-200">{error}</div>
            </div>
          )}

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Organization
            </label>
            {organizations.length === 0 ? (
              <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                <p>No organizations found for this account.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {organizations.map((org) => (
                  <label
                    key={org.id}
                    className={`
                      flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all
                      ${
                        selectedOrgId === org.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }
                    `}
                  >
                    <input
                      type="radio"
                      name="organization"
                      value={org.id}
                      checked={selectedOrgId === org.id}
                      onChange={(e) => setSelectedOrgId(e.target.value)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {org.name}
                        </span>
                        {org.is_primary && (
                          <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded">
                            Primary
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md glass-button focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || submitting || !selectedOrgId || organizations.length === 0}
              className="flex-1 px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
            >
              {submitting ? 'Signing in...' : 'Continue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
