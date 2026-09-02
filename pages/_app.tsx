import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect, useRef } from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import '../styles/globals.css';
import 'driver.js/dist/driver.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LoadingProvider } from '@/contexts/LoadingContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { ToastProvider } from '@/contexts/ToastContext';
import GlobalLoadingOverlay from '@/components/ui/GlobalLoadingOverlay';
import ToastContainer from '@/components/ui/ToastContainer';
import Cookies from 'js-cookie';
import { apiClient, isSweepSessionAuthFailure } from '@/lib/api';
import { pingActivityHeartbeat } from '@/lib/consultingNotices';
import { clearSessionCaches } from '@/lib/cache';

export default function App({ Component, pageProps }: AppProps) {
  const keepAliveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Global error handler to catch unhandled promise rejections (like auth errors)
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const error = event.reason;
      if (isSweepSessionAuthFailure(error)) {
        // Suppress the error - it's already handled by the API interceptor
        event.preventDefault();
        clearSessionCaches();
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
        clearSessionCaches();
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

    const isActiveTab = () => {
      const currentPath = window.location.pathname;
      const hasToken = Cookies.get('access_token');
      return currentPath !== '/login' && Boolean(hasToken) && !document.hidden;
    };

    const keepSessionAlive = async () => {
      if (!isActiveTab()) return;
      try {
        await apiClient.getCurrentUser();
        await apiClient.refreshSession();
      } catch (error: any) {
        if (error?.response?.status !== 401 && error?.response?.status !== 403) {
          console.warn('Keep-alive request failed:', error);
        }
      }
    };

    const pingActivity = () => {
      if (!isActiveTab()) return;
      void pingActivityHeartbeat();
    };

    const bootTimer = setTimeout(() => {
      void keepSessionAlive();
      pingActivity();
    }, 3000);

    keepAliveIntervalRef.current = setInterval(keepSessionAlive, 20 * 60 * 1000);
    const activityInterval = setInterval(pingActivity, 60 * 1000);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void keepSessionAlive();
        pingActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(bootTimer);
      if (keepAliveIntervalRef.current) {
        clearInterval(keepAliveIntervalRef.current);
      }
      clearInterval(activityInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return (
    <ErrorBoundary>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <ThemeProvider>
        <ToastProvider>
          <SidebarProvider>
            <LoadingProvider>
              <GlobalLoadingOverlay />
              <ToastContainer />
              <Component {...pageProps} />
            </LoadingProvider>
          </SidebarProvider>
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

