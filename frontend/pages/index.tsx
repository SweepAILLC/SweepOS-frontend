import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import Navbar from '@/components/ui/Navbar';
import {
  APP_MAIN_PL_OFFSET,
  APP_MAIN_PL_WITH_PERF_OPEN,
  APP_MAIN_PL_WITH_CALL_LIBRARY,
  APP_MAIN_PL_WITH_CALL_LIBRARY_AND_PERF_OPEN,
} from '@/components/ui/layoutConstants';
import TerminalDashboard from '@/components/TerminalDashboard';
import BrevoConsolePanel from '@/components/BrevoConsolePanel';
import StripeDashboardPanel from '@/components/stripe/StripeDashboardPanel';
import CalendarConsolePanel from '@/components/calendar/CalendarConsolePanel';
import FunnelListPanel from '@/components/FunnelListPanel';
import FunnelDetailPanel from '@/components/funnels/FunnelDetailPanel';
import AdminPanel from '@/components/AdminPanel';
import UsersPanel from '@/components/UsersPanel';
import RestrictedTabView from '@/components/ui/RestrictedTabView';
import SettingsPanel from '@/components/ui/SettingsPanel';
import IntegrationsPanel from '@/components/ui/IntegrationsPanel';
import IntelligencePanel from '@/components/ui/IntelligencePanel';
import ContentStudioPanel from '@/components/ui/ContentStudioPanel';
import CallLibraryPanel from '@/components/ui/CallLibraryPanel';
import { usePerformanceDrawer } from '@/components/ui/PerformanceDrawer';
import { useLoading } from '@/contexts/LoadingContext';
import { clearSessionCaches } from '@/lib/cache';

export default function Dashboard() {
  const router = useRouter();
  const { setLoading: setGlobalLoading } = useLoading();
  
  // New session (after login) starts on terminal; refresh keeps current tab via localStorage
  type TabId =
    | 'brevo'
    | 'terminal'
    | 'stripe'
    | 'funnels'
    | 'content_studio'
    | 'call_library'
    | 'integrations'
    | 'users'
    | 'owner'
    | 'calcom'
    | 'intelligence'
    | 'settings';

  const getInitialTab = (): TabId => {
    if (typeof window === 'undefined') return 'terminal';
    if (sessionStorage.getItem('newSession') === '1') {
      sessionStorage.removeItem('newSession');
      return 'terminal';
    }
    const savedTab = localStorage.getItem('activeTab');
    if (savedTab === 'performance') {
      sessionStorage.setItem('openPerfDrawer', '1');
      return 'terminal';
    }
    const validTabs: string[] = [
      'brevo',
      'terminal',
      'stripe',
      'funnels',
      'content_studio',
      'call_library',
      'integrations',
      'users',
      'owner',
      'calcom',
      'intelligence',
      'settings',
    ];
    if (savedTab && validTabs.includes(savedTab)) {
      return savedTab as TabId;
    }
    return 'terminal';
  };

  const [activeTab, setActiveTab] = useState<TabId>(() => getInitialTab());
  const [loading, setLoadingState] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isMainOrg, setIsMainOrg] = useState(false);
  const [userRole, setUserRole] = useState<string>('member'); // Track user role for permission checks
  const [tabPermissions, setTabPermissions] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const perfDrawer = usePerformanceDrawer();
  const prevActiveTabForPerfRef = useRef<TabId | null>(null);

  // Persist tab so refresh keeps the same tab (new session after login still starts on terminal via newSession flag)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]);

  // Navbar sets global loading on tab change ("Switching tabs..."); clear it once the new tab is active so the overlay cannot stick.
  useEffect(() => {
    setGlobalLoading(false);
  }, [activeTab, setGlobalLoading]);

  useEffect(() => {
    if (typeof window === 'undefined' || !perfDrawer) return;
    if (sessionStorage.getItem('openPerfDrawer') === '1') {
      sessionStorage.removeItem('openPerfDrawer');
      perfDrawer.open();
    }
  }, [perfDrawer]);

  // Close Performance drawer only when the main *tab* changes — not when drawer open/close updates context.
  useEffect(() => {
    if (!perfDrawer) return;
    if (prevActiveTabForPerfRef.current === null) {
      prevActiveTabForPerfRef.current = activeTab;
      return;
    }
    if (prevActiveTabForPerfRef.current === activeTab) {
      return;
    }
    prevActiveTabForPerfRef.current = activeTab;
    perfDrawer.close();
  }, [activeTab, perfDrawer]);

  useEffect(() => {
    let isMounted = true;
    
    // Check authentication, admin status, and tab permissions
    const checkAuth = async () => {
      try {
        const user = await apiClient.getCurrentUser();
        const u = user as { org_id?: string; org_name?: string | null; email?: string };
        let resolvedOrgName: string | null = u.org_name ?? null;
        if (!resolvedOrgName && u.email && u.org_id) {
          try {
            const orgs = await apiClient.getUserOrganizations(u.email);
            const match = Array.isArray(orgs)
              ? orgs.find((o: { id: string }) => String(o.id) === String(u.org_id))
              : null;
            resolvedOrgName = match?.name ?? null;
          } catch {
            resolvedOrgName = null;
          }
        }
        if (isMounted) {
          setOrganizationName(resolvedOrgName);
        }

        if (!isMounted) return;
        
        // Check if user is owner (only 'owner' role)
        const userIsOwner = user.role === 'owner';
        setIsOwner(userIsOwner);
        
        // Store user role for permission checks (normalize to lowercase)
        const normalizedRole = String(user.role || 'member').toLowerCase().trim();
        setUserRole(normalizedRole);
        
        // Check if user is in main org (Sweep Internal)
        // Main org ID is: 00000000-0000-0000-0000-000000000001
        const MAIN_ORG_ID = '00000000-0000-0000-0000-000000000001';
        const userIsMainOrg = user.org_id === MAIN_ORG_ID;
        setIsMainOrg(userIsMainOrg);
        
        // Load tab permissions (with timeout to prevent hanging)
        try {
          const permissionsPromise = apiClient.getMyTabPermissions();
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          );
          
          const permissions = await Promise.race([permissionsPromise, timeoutPromise]) as Record<string, boolean>;
          
          if (isMounted) {
            setTabPermissions(permissions);
          }
        } catch (permError: any) {
          // If permissions endpoint fails (e.g., endpoint doesn't exist yet or migration not run), default to all enabled
          console.warn('Failed to load tab permissions, using defaults:', permError);
          const defaultPermissions = {
            brevo: true,
            terminal: true,
            stripe: true,
            performance: true,
            funnels: true,
            users: true,
            calcom: true,
            integrations: true,
          };
          if (isMounted) {
            setTabPermissions(defaultPermissions);
          }
        }
        
        // Prefetch terminal summary so Cash & MRR / Top Revenue load instantly when user opens Terminal tab
        if (isMounted) {
          apiClient.getTerminalSummary().catch(() => {});
        }
        
        if (isMounted) {
          setLoadingState(false);
        }
      } catch (error: any) {
        // Suppress console errors for auth failures - they're handled gracefully
        const isAuthError = error.response?.status === 401 || error.code === 'ERR_NETWORK' || error.response?.status === 403;
        
        if (!isAuthError) {
          console.error('Auth check failed:', error);
        }
        
        if (isMounted) {
          // Handle auth errors gracefully - redirect without showing errors
          if (isAuthError) {
            clearSessionCaches();
            const Cookies = require('js-cookie');
            Cookies.remove('access_token');
            // Redirect to login immediately
            if (typeof window !== 'undefined') {
              window.location.href = '/login';
            }
            return; // Don't update state, just redirect
          } else {
            // For other errors, still show the UI but with defaults
            const defaultPermissions = {
              brevo: true,
              terminal: true,
              stripe: true,
              funnels: true,
              users: true,
              calcom: true
            };
            setTabPermissions(defaultPermissions);
            setLoadingState(false);
          }
        }
      }
    };

    // Run auth check immediately
    checkAuth();
    
    return () => {
      isMounted = false;
    };
  }, []); // Only run once on mount

  useEffect(() => {
    // Handle query parameters after router is ready
    if (!router.isReady) return;

    const { tab, stripe_connected, stripe_error, error_description, brevo_connected, brevo_error } = router.query;
    
    // Handle OAuth callback parameters first (they may also set the tab)
    if (stripe_connected === 'true') {
      setNotification({ type: 'success', message: 'Stripe connected successfully! Syncing customers...' });
      setActiveTab('stripe');
      // Clear query params
      router.replace('/', undefined, { shallow: true });
      // Dispatch event to refresh clients list
      window.dispatchEvent(new Event('stripe-connected'));
      // Wait for sync to complete, then reload
      setTimeout(() => {
        // Force reload to refresh both Stripe dashboard and clients
        window.location.reload();
      }, 6000); // Increased to 6 seconds to allow sync to complete
      return;
    } else if (stripe_error) {
      const errorMsg = error_description || 'Failed to connect Stripe';
      setNotification({ type: 'error', message: `Stripe connection error: ${errorMsg}` });
      setActiveTab('stripe');
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
      return;
    } else if (brevo_connected === 'true') {
      setNotification({ type: 'success', message: 'Brevo connected successfully!' });
      setActiveTab('brevo');
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
      return;
    } else if (brevo_error) {
      const errorMsg = error_description || 'Failed to connect Brevo';
      setNotification({ type: 'error', message: `Brevo connection error: ${errorMsg}` });
      setActiveTab('brevo');
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
      return;
    }
    
    // Deep-link: /?funnelId=… without tab → open Funnels tab + normalize URL
    const rawFunnelId = router.query.funnelId;
    if (!tab && rawFunnelId && typeof rawFunnelId === 'string') {
      setActiveTab('funnels');
      router.replace({ pathname: '/', query: { tab: 'funnels', funnelId: rawFunnelId } }, undefined, { shallow: true });
      return;
    }

    // Handle standalone tab navigation (only if no OAuth params)
    if (tab && typeof tab === 'string') {
      if (tab === 'performance') {
        perfDrawer?.open();
        router.replace('/', undefined, { shallow: true });
        return;
      }
      if (
        [
          'brevo',
          'terminal',
          'stripe',
          'funnels',
          'content_studio',
          'call_library',
          'integrations',
          'users',
          'owner',
          'calcom',
          'intelligence',
          'settings',
        ].includes(tab)
      ) {
        const tabValue = tab as TabId;
        setActiveTab(tabValue);
        const rawFid = router.query.funnelId;
        if (tabValue === 'funnels' && rawFid && typeof rawFid === 'string') {
          router.replace({ pathname: '/', query: { tab: 'funnels', funnelId: rawFid } }, undefined, { shallow: true });
        } else {
          router.replace('/', undefined, { shallow: true });
        }
      }
    }
  }, [router.isReady, router.query, perfDrawer]);

  useEffect(() => {
    if (!router.isReady) return;
    if (activeTab === 'funnels') return;
    if (router.query.funnelId) {
      router.replace({ pathname: '/', query: { tab: activeTab } }, undefined, { shallow: true });
    }
  }, [activeTab, router.isReady, router.query.funnelId, router.replace]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // Check if current tab is accessible
  const hasTabAccess = (tab: string): boolean => {
    // Owner tab only for owners
    if (tab === 'owner') {
      return isOwner;
    }
    // Users tab: not accessible to members (check role directly)
    if (tab === 'users') {
      const roleLower = String(userRole || 'member').toLowerCase().trim();
      // Explicitly hide for members - check multiple possible formats
      if (roleLower === 'member' || roleLower === 'MEMBER' || roleLower === 'Member') {
        return false;
      }
      // Only show if user is admin or owner
      if (roleLower !== 'admin' && roleLower !== 'owner') {
        return false;
      }
      return tabPermissions[tab] !== false;
    }
    // Check permissions for other tabs
    return tabPermissions[tab] !== false; // Default to true if not set
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          if (tab !== activeTab) {
            setActiveTab(tab);
            setGlobalLoading(true, 'Switching tabs...');
          }
        }} 
        isOwner={isOwner}
        tabPermissions={tabPermissions}
        userRole={userRole || 'member'}
        organizationName={organizationName}
      />

      {notification && (
        <div className={`fixed top-4 right-4 z-[60] p-4 rounded-lg shadow-lg max-w-sm ${
          notification.type === 'success' 
            ? 'bg-green-500 dark:bg-green-600 text-white' 
            : 'bg-red-500 dark:bg-red-600 text-white'
        }`}>
          <div className="flex items-center justify-between">
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 text-white hover:text-gray-200"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Full-width shell so left padding lines up with the fixed sidebar + Performance panel; inner main stays max-w-7xl centered in the remaining width. */}
      <div
        className={`min-w-0 w-full min-h-screen transition-[padding-left] duration-300 ease-out ${
          activeTab === 'call_library'
            ? perfDrawer?.isOpen
              ? APP_MAIN_PL_WITH_CALL_LIBRARY_AND_PERF_OPEN
              : APP_MAIN_PL_WITH_CALL_LIBRARY
            : perfDrawer?.isOpen
              ? APP_MAIN_PL_WITH_PERF_OPEN
              : APP_MAIN_PL_OFFSET
        }`}
      >
        <main className="min-w-0 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 overflow-x-hidden">
        {activeTab === 'terminal' && (
          hasTabAccess('terminal') ? (
            <TerminalDashboard />
          ) : (
            <RestrictedTabView tabName="terminal" />
          )
        )}

        {activeTab === 'brevo' && (
          hasTabAccess('brevo') ? (
            <div className="w-full">
              <BrevoConsolePanel userRole={userRole} />
            </div>
          ) : (
            <RestrictedTabView tabName="brevo" />
          )
        )}

        {activeTab === 'stripe' && (
          hasTabAccess('stripe') ? (
            <div className="max-w-4xl mx-auto w-full">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 text-center">Stripe Financial Dashboard</h2>
              <StripeDashboardPanel userRole={userRole} />
            </div>
          ) : (
            <RestrictedTabView tabName="stripe" />
          )
        )}

        {activeTab === 'funnels' && (
          hasTabAccess('funnels') ? (
            <div>
              {router.isReady && typeof router.query.funnelId === 'string' && router.query.funnelId ? (
                <FunnelDetailPanel
                  funnelId={router.query.funnelId}
                  onBack={() => {
                    router.replace({ pathname: '/', query: { tab: 'funnels' } }, undefined, { shallow: true });
                  }}
                />
              ) : (
                <FunnelListPanel />
              )}
            </div>
          ) : (
            <RestrictedTabView tabName="funnels" />
          )
        )}

        {activeTab === 'content_studio' && (
          hasTabAccess('content_studio') ? (
            <ContentStudioPanel />
          ) : (
            <RestrictedTabView tabName="content_studio" />
          )
        )}

        {activeTab === 'call_library' && (
          hasTabAccess('call_library') ? (
            <CallLibraryPanel />
          ) : (
            <RestrictedTabView tabName="call_library" />
          )
        )}

        {activeTab === 'integrations' && (
          hasTabAccess('integrations') ? (
            <IntegrationsPanel />
          ) : (
            <RestrictedTabView tabName="integrations" />
          )
        )}

        {activeTab === 'users' && (
          hasTabAccess('users') ? (
            <div>
              <UsersPanel />
            </div>
          ) : (
            <RestrictedTabView tabName="users" />
          )
        )}

        {activeTab === 'owner' && isOwner && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Owner Panel</h2>
            <AdminPanel />
          </div>
        )}

        {activeTab === 'calcom' && (
          hasTabAccess('calcom') ? (
            <div className="w-full">
              <CalendarConsolePanel userRole={userRole} />
            </div>
          ) : (
            <RestrictedTabView tabName="calcom" />
          )
        )}

        {activeTab === 'intelligence' && (
          <div className="w-full">
            <IntelligencePanel />
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="w-full">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h2>
            <SettingsPanel />
          </div>
        )}
        </main>
      </div>
    </div>
  );
}

