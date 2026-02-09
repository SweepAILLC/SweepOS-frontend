import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import Navbar from '@/components/ui/Navbar';
import TerminalDashboard from '@/components/TerminalDashboard';
import BrevoConsolePanel from '@/components/BrevoConsolePanel';
import StripeDashboardPanel from '@/components/stripe/StripeDashboardPanel';
import CalendarConsolePanel from '@/components/calendar/CalendarConsolePanel';
import FunnelListPanel from '@/components/FunnelListPanel';
import AdminPanel from '@/components/AdminPanel';
import UsersPanel from '@/components/UsersPanel';
import RestrictedTabView from '@/components/ui/RestrictedTabView';
import { useLoading } from '@/contexts/LoadingContext';

export default function Dashboard() {
  const router = useRouter();
  const { setLoading: setGlobalLoading } = useLoading();
  
  // Initialize activeTab from localStorage or default to 'terminal'
  const getInitialTab = (): 'brevo' | 'terminal' | 'stripe' | 'funnels' | 'users' | 'owner' | 'calcom' => {
    if (typeof window === 'undefined') return 'terminal';
    const savedTab = localStorage.getItem('activeTab');
    const validTabs = ['brevo', 'terminal', 'stripe', 'funnels', 'users', 'owner', 'calcom'];
    if (savedTab && validTabs.includes(savedTab)) {
      return savedTab as 'brevo' | 'terminal' | 'stripe' | 'funnels' | 'users' | 'owner' | 'calcom';
    }
    return 'terminal';
  };
  
  const [activeTab, setActiveTab] = useState<'brevo' | 'terminal' | 'stripe' | 'funnels' | 'users' | 'owner' | 'calcom'>(getInitialTab());
  const [loading, setLoadingState] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isMainOrg, setIsMainOrg] = useState(false);
  const [userRole, setUserRole] = useState<string>('member'); // Track user role for permission checks
  const [tabPermissions, setTabPermissions] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Save activeTab to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]);

  useEffect(() => {
    let isMounted = true;
    
    // Check authentication, admin status, and tab permissions
    const checkAuth = async () => {
      try {
        const user = await apiClient.getCurrentUser();
        
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
            funnels: true,
            users: true,
            calcom: true
          };
          if (isMounted) {
            setTabPermissions(defaultPermissions);
          }
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
            // Clear any stale token
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
      if (typeof window !== 'undefined') {
        localStorage.setItem('activeTab', 'stripe');
      }
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
      if (typeof window !== 'undefined') {
        localStorage.setItem('activeTab', 'stripe');
      }
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
      return;
    } else if (brevo_connected === 'true') {
      setNotification({ type: 'success', message: 'Brevo connected successfully!' });
      setActiveTab('brevo');
      if (typeof window !== 'undefined') {
        localStorage.setItem('activeTab', 'brevo');
      }
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
      return;
    } else if (brevo_error) {
      const errorMsg = error_description || 'Failed to connect Brevo';
      setNotification({ type: 'error', message: `Brevo connection error: ${errorMsg}` });
      setActiveTab('brevo');
      if (typeof window !== 'undefined') {
        localStorage.setItem('activeTab', 'brevo');
      }
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
      return;
    }
    
    // Handle standalone tab navigation (only if no OAuth params)
    if (tab && typeof tab === 'string' && ['brevo', 'terminal', 'stripe', 'funnels', 'users', 'owner', 'calcom'].includes(tab)) {
      const tabValue = tab as 'brevo' | 'terminal' | 'stripe' | 'funnels' | 'users' | 'owner' | 'calcom';
      setActiveTab(tabValue);
      if (typeof window !== 'undefined') {
        localStorage.setItem('activeTab', tabValue);
      }
      // Clear the query parameter after setting the tab
      router.replace('/', undefined, { shallow: true });
    }
  }, [router.isReady, router.query]);

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
          // Only set loading if actually switching to a different tab
          if (tab !== activeTab) {
            setGlobalLoading(true, 'Switching tabs...');
            setActiveTab(tab);
            // Loading will be turned off by the individual panel components when they finish loading
          }
        }} 
        isOwner={isOwner}
        tabPermissions={tabPermissions}
        userRole={userRole || 'member'}
      />

      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pt-24">
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
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Stripe Financial Dashboard</h2>
              <StripeDashboardPanel userRole={userRole} />
            </div>
          ) : (
            <RestrictedTabView tabName="stripe" />
          )
        )}

        {activeTab === 'funnels' && (
          hasTabAccess('funnels') ? (
            <div>
              <FunnelListPanel />
            </div>
          ) : (
            <RestrictedTabView tabName="funnels" />
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
      </main>
    </div>
  );
}

