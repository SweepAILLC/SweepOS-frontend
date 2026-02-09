import type { AppProps } from 'next/app';
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import '../styles/globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LoadingProvider } from '@/contexts/LoadingContext';
import GlobalLoadingOverlay from '@/components/ui/GlobalLoadingOverlay';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';

export default function App({ Component, pageProps }: AppProps) {
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Global error handler to catch unhandled promise rejections (like auth errors)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      // Check if it's an auth error (401/403)
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        // Suppress the error - it's already handled by the API interceptor
        event.preventDefault();
        // Clear token if not already cleared
        Cookies.remove('access_token');
        // Redirect if not already on login page
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    };

    // Global error handler for runtime errors
    const handleError = (event: ErrorEvent) => {
      // Check if error message contains auth-related keywords
      const errorMessage = event.message?.toLowerCase() || '';
      const isAuthError = errorMessage.includes('unauthorized') || 
                        errorMessage.includes('401') || 
                        errorMessage.includes('403') ||
                        errorMessage.includes('credentials');
      
      if (isAuthError) {
        // Suppress auth-related runtime errors
        event.preventDefault();
        // Clear token and redirect
        Cookies.remove('access_token');
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Keep-alive mechanism to maintain session while tab is open
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const keepSessionAlive = async () => {
      // Only keep alive if:
      // 1. We're not on the login page
      // 2. We have an access token
      // 3. The tab is visible
      const currentPath = window.location.pathname;
      const hasToken = Cookies.get('access_token');
      const isVisible = !document.hidden;

      if (currentPath === '/login' || !hasToken || !isVisible) {
        return;
      }

      try {
        // Call /auth/me to refresh the session
        // This will extend the session if the backend supports it
        // or at least validate the token is still valid
        await apiClient.getCurrentUser();
      } catch (error: any) {
        // If we get a 401/403, the interceptor will handle logout
        // Just silently fail here - the error handler will take care of it
        if (error?.response?.status !== 401 && error?.response?.status !== 403) {
          console.warn('Keep-alive request failed:', error);
        }
      }
    };

    // Run keep-alive immediately on mount (if conditions are met)
    keepSessionAlive();

    // Set up interval to keep session alive every 30 minutes
    // Token expires in 60 minutes, so refreshing every 30 minutes keeps it alive
    keepAliveIntervalRef.current = setInterval(keepSessionAlive, 30 * 60 * 1000); // 30 minutes

    // Also refresh when tab becomes visible (user switches back to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        keepSessionAlive();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LoadingProvider>
          <GlobalLoadingOverlay />
          <Component {...pageProps} />
        </LoadingProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

