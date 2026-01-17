import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import Navbar from '@/components/Navbar';
import ClientKanbanBoard from '@/components/ClientKanbanBoard';
import BrevoConsolePanel from '@/components/BrevoConsolePanel';
import StripeDashboardPanel from '@/components/StripeDashboardPanel';
import FunnelListPanel from '@/components/FunnelListPanel';
import AdminPanel from '@/components/AdminPanel';
import UsersPanel from '@/components/UsersPanel';
import RestrictedTabView from '@/components/RestrictedTabView';

export default function Dashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'brevo' | 'clients' | 'stripe' | 'funnels' | 'users' | 'owner'>('clients');
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isMainOrg, setIsMainOrg] = useState(false);
  const [tabPermissions, setTabPermissions] = useState<Record<string, boolean>>({});
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
          if (isMounted) {
            setTabPermissions({
              brevo: true,
              clients: true,
              stripe: true,
              funnels: true,
              users: true
            });
          }
        }
        
        if (isMounted) {
          setLoading(false);
        }
      } catch (error: any) {
        console.error('Auth check failed:', error);
        if (isMounted) {
          // Only redirect if it's actually an auth error, not a network error
          if (error.response?.status === 401 || error.code === 'ERR_NETWORK') {
            router.push('/login');
          } else {
            // For other errors, still show the UI but with defaults
            setTabPermissions({
              brevo: true,
              clients: true,
              stripe: true,
              funnels: true,
              users: true
            });
            setLoading(false);
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
    
    if (tab && typeof tab === 'string' && ['brevo', 'clients', 'stripe', 'funnels', 'users', 'owner'].includes(tab)) {
      setActiveTab(tab as 'brevo' | 'clients' | 'stripe' | 'funnels' | 'users' | 'owner');
      // Clear the query parameter after setting the tab
      router.replace('/', undefined, { shallow: true });
      return; // Don't process OAuth params if we're handling tab navigation
    }

    // Handle OAuth callback parameters
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
    } else if (stripe_error) {
      const errorMsg = error_description || 'Failed to connect Stripe';
      setNotification({ type: 'error', message: `Stripe connection error: ${errorMsg}` });
      setActiveTab('stripe');
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
    } else if (brevo_connected === 'true') {
      setNotification({ type: 'success', message: 'Brevo connected successfully!' });
      setActiveTab('brevo');
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
    } else if (brevo_error) {
      const errorMsg = error_description || 'Failed to connect Brevo';
      setNotification({ type: 'error', message: `Brevo connection error: ${errorMsg}` });
      setActiveTab('brevo');
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
    }
  }, [router.isReady, router.query]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // Check if current tab is accessible
  const hasTabAccess = (tab: string): boolean => {
    // Owner tab only for owners
    if (tab === 'owner') {
      return isOwner;
    }
    // Check permissions for other tabs
    return tabPermissions[tab] !== false; // Default to true if not set
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        isOwner={isOwner}
        tabPermissions={tabPermissions}
      />

      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
          notification.type === 'success' 
            ? 'bg-green-500 text-white' 
            : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center justify-between">
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 text-white hover:text-gray-200"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'clients' && (
          hasTabAccess('clients') ? (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Client Management</h2>
              <ClientKanbanBoard />
            </div>
          ) : (
            <RestrictedTabView tabName="clients" />
          )
        )}

        {activeTab === 'brevo' && (
          hasTabAccess('brevo') ? (
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Brevo Console</h2>
              <BrevoConsolePanel />
            </div>
          ) : (
            <RestrictedTabView tabName="brevo" />
          )
        )}

        {activeTab === 'stripe' && (
          hasTabAccess('stripe') ? (
            <div className="max-w-4xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Stripe Financial Dashboard</h2>
              <StripeDashboardPanel />
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
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Owner Panel</h2>
            <AdminPanel />
          </div>
        )}
      </main>
    </div>
  );
}

