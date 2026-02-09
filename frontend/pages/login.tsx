import { useState } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
      
      // Store email and password in session storage for org selection if needed
      sessionStorage.setItem('login_email', normalizedEmail);
      sessionStorage.setItem('login_password', normalizedPassword);
      
      const result = await apiClient.login(normalizedEmail, normalizedPassword);
      
      // Check if organization selection is required
      if (result.requires_org_selection && result.organizations) {
        // Redirect to organization selection page
        router.push({
          pathname: '/select-organization',
          query: { email: normalizedEmail }
        });
        return;
      }
      
      // Verify we got a token
      if (!result.access_token) {
        throw new Error('No access token received');
      }
      
      // Clear session storage on successful login
      sessionStorage.removeItem('login_email');
      sessionStorage.removeItem('login_password');
      
      // Small delay to ensure cookie is set before redirect
      // This prevents race condition where dashboard loads before cookie is available
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Verify cookie is set before redirecting
      const token = document.cookie.split('; ').find(row => row.startsWith('access_token='));
      if (!token) {
        console.error('Cookie not found after login. This may indicate a CORS or cookie setting issue.');
        // Still redirect - the dashboard will handle the auth error
      }
      
      // Use window.location instead of router.push to ensure full page reload
      // This ensures the cookie is available when the dashboard loads
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
      </div>
    </div>
  );
}

