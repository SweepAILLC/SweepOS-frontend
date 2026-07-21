import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import Navbar, { type TabId } from '@/components/ui/Navbar';
import { useSidebar } from '@/contexts/SidebarContext';
import TerminalDashboard from '@/components/terminal/TerminalDashboard';
import PipelineDashboard from '@/components/pipeline/PipelineDashboard';
import FunnelListPanel from '@/components/FunnelListPanel';
import FunnelDetailPanel from '@/components/funnels/FunnelDetailPanel';
import AdminPanel from '@/components/AdminPanel';
import RestrictedTabView from '@/components/ui/RestrictedTabView';
import SettingsPanel from '@/components/ui/SettingsPanel';
import IntelligencePanel from '@/components/ui/IntelligencePanel';
import ContentStudioPanel from '@/components/ui/ContentStudioPanel';
import CallLibraryPanel from '@/components/ui/CallLibraryPanel';
import ResourcesPanel from '@/components/ui/ResourcesPanel';
import AutomationsTab from '@/components/automations/AutomationsTab';
import OrgPortalPanel from '@/components/portal/OrgPortalPanel';
import type { ConsultingTier } from '@/types/admin';
import {
  resolveLegacyTab,
  legacyTabOpensTerminal,
  legacyTabOpensPipeline,
  VALID_TAB_IDS,
} from '@/lib/tabs';
import {
  canAccessTab,
  canAccessTerminalPriorities,
  defaultTabPermissions,
  hasConsultingTier,
  MEMBER_RESTRICTED_BOTTOM_NAV_TAB_IDS,
} from '@/lib/tabAccess';
import { useLoading } from '@/contexts/LoadingContext';
import { clearSessionCaches } from '@/lib/cache';

export default function Dashboard() {
  const router = useRouter();
  const { setLoading: setGlobalLoading } = useLoading();
  const { mainPaddingClass, callLibraryPaddingClass, mobileTopPaddingClass } = useSidebar();
  
  // Tab ids are centralized in lib/tabs.ts (Navbar imports the same type).
  type DashboardTabId = TabId;

  const getInitialTab = (): DashboardTabId => {
    if (typeof window === 'undefined') return 'terminal';
    if (sessionStorage.getItem('newSession') === '1') {
      sessionStorage.removeItem('newSession');
      sessionStorage.setItem('terminalSyncOnLoad', '1');
      return 'terminal';
    }
    let savedTab = localStorage.getItem('activeTab');
    if (savedTab === 'stripe' || savedTab === 'finances' || savedTab === 'calcom') {
      localStorage.setItem('activeTab', 'terminal');
      return 'terminal';
    }
    if (savedTab && legacyTabOpensTerminal(savedTab)) {
      return 'terminal';
    }
    if (savedTab && legacyTabOpensPipeline(savedTab)) {
      return 'pipeline';
    }
    if (savedTab === 'brevo' || savedTab === 'integrations') {
      localStorage.setItem('activeTab', 'settings');
      sessionStorage.setItem('openSettingsIntegrations', '1');
      return 'settings';
    }
    const resolved = resolveLegacyTab(savedTab);
    if (resolved) return resolved;
    return 'terminal';
  };

  const [activeTab, setActiveTab] = useState<DashboardTabId>(() => getInitialTab());
  /** Pipeline board mounts on first visit and stays mounted for instant return. */
  const [pipelineMounted, setPipelineMounted] = useState(
    () => getInitialTab() === 'pipeline',
  );
  const [loading, setLoadingState] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  /** Platform operators (sudo / Sweep Internal admin|owner) — see AdminPanel on org portal. */
  const [isSystemOwner, setIsSystemOwner] = useState(false);
  const [isMainOrg, setIsMainOrg] = useState(false);
  const [userRole, setUserRole] = useState<string>('member'); // Track user role for permission checks
  const [tabPermissions, setTabPermissions] = useState<Record<string, boolean>>(() =>
    defaultTabPermissions()
  );
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [automationsAwaitingApproval, setAutomationsAwaitingApproval] = useState(0);
  const [consultingTier, setConsultingTier] = useState<ConsultingTier | null>(null);
  const [bookingUrl, setBookingUrl] = useState<string | null>(null);

  // Persist tab so refresh keeps the same tab (new session after login still starts on terminal via newSession flag)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeTab', activeTab);
    }
  }, [activeTab]);

  // Navbar clears global loading on tab change; no blocking overlay on switch.
  useEffect(() => {
    setGlobalLoading(false);
  }, [activeTab, setGlobalLoading]);

  useEffect(() => {
    if (activeTab === 'pipeline') setPipelineMounted(true);
  }, [activeTab]);

  // Lightweight poll for awaiting-approval automation jobs so the navbar badge stays fresh
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const health = await apiClient.getAutomationDispatcherHealth();
        if (!cancelled) {
          setAutomationsAwaitingApproval(health?.awaiting_approval || 0);
        }
      } catch {
        if (!cancelled) setAutomationsAwaitingApproval(0);
      }
    };
    refresh();
    const id = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    
    // Check authentication, admin status, and tab permissions
    const checkAuth = async () => {
      try {
        const user = await apiClient.getCurrentUser();
        if (!isMounted) return;

        const userIsOwner = String(user.role || '').toLowerCase().trim() === 'owner';
        setIsOwner(userIsOwner);
        setIsSystemOwner(Boolean((user as { is_system_owner?: boolean }).is_system_owner));
        const normalizedRole = String(user.role || 'member').toLowerCase().trim();
        setUserRole(normalizedRole);

        const MAIN_ORG_ID = '00000000-0000-0000-0000-000000000001';
        setIsMainOrg(user.org_id === MAIN_ORG_ID);

        // Show the shell immediately; permissions and org name can hydrate after.
        setLoadingState(false);

        const u = user as {
          org_id?: string;
          org_name?: string | null;
          email?: string;
          consulting_tier?: ConsultingTier | null;
          booking_url?: string | null;
        };
        const tier = u.consulting_tier;
        setConsultingTier(
          tier === 'pro_consulting' || tier === 'core_consulting' ? tier : null
        );
        setBookingUrl(u.booking_url ?? null);
        if (u.org_name) {
          setOrganizationName(u.org_name);
        } else if (u.email && u.org_id) {
          apiClient
            .getUserOrganizations(u.email)
            .then((orgs) => {
              if (!isMounted) return;
              const match = Array.isArray(orgs)
                ? orgs.find((o: { id: string }) => String(o.id) === String(u.org_id))
                : null;
              setOrganizationName(match?.name ?? null);
            })
            .catch(() => {
              if (isMounted) setOrganizationName(null);
            });
        }

        apiClient.getMyTabPermissions().then(
          (permissions) => {
            if (isMounted) setTabPermissions(permissions as Record<string, boolean>);
          },
          (permError) => {
            console.warn('Failed to load tab permissions, using defaults:', permError);
            if (isMounted) setTabPermissions(defaultTabPermissions());
          }
        );

        apiClient.getTerminalSummary().catch(() => {});
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
            const defaultPermissions = defaultTabPermissions();
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

    const { tab, stripe_connected, stripe_error, error_description, brevo_connected, brevo_error, google, google_error } = router.query;

    // Google account connect return → Settings > Profile (keep query for SettingsPanel toast)
    if (google === 'connected' || (typeof google_error === 'string' && google_error)) {
      setActiveTab('settings');
      if (google === 'connected') {
        setNotification({ type: 'success', message: 'Google account connected successfully.' });
        setTimeout(() => setNotification(null), 5000);
      } else if (typeof google_error === 'string') {
        const msg =
          (typeof router.query.message === 'string' && router.query.message) ||
          google_error.replace(/_/g, ' ');
        setNotification({ type: 'error', message: msg });
        setTimeout(() => setNotification(null), 7000);
      }
      // Do not strip query here — SettingsPanel reads section/google and cleans up
      return;
    }
    
    // Handle OAuth callback parameters first (they may also set the tab)
    if (stripe_connected === 'true') {
      setNotification({ type: 'success', message: 'Stripe connected successfully! Syncing customers...' });
      setActiveTab('terminal');
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
      setActiveTab('terminal');
      router.replace('/', undefined, { shallow: true });
      setTimeout(() => setNotification(null), 5000);
      return;
    } else if (brevo_connected === 'true') {
      setNotification({ type: 'success', message: 'Brevo connected successfully!' });
      setActiveTab('settings');
      router.replace(
        { pathname: '/', query: { tab: 'settings', section: 'integrations' } },
        undefined,
        { shallow: true }
      );
      setTimeout(() => setNotification(null), 5000);
      return;
    } else if (brevo_error) {
      const errorMsg = error_description || 'Failed to connect Brevo';
      setNotification({ type: 'error', message: `Brevo connection error: ${errorMsg}` });
      setActiveTab('settings');
      router.replace(
        { pathname: '/', query: { tab: 'settings', section: 'integrations' } },
        undefined,
        { shallow: true }
      );
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
        setActiveTab('terminal');
        router.replace('/', undefined, { shallow: true });
        return;
      }
      if (tab === 'clients') {
        setActiveTab('pipeline');
        router.replace('/', undefined, { shallow: true });
        return;
      }
      if (tab === 'stripe' || tab === 'finances' || tab === 'calcom') {
        setActiveTab('terminal');
        router.replace('/', undefined, { shallow: true });
        return;
      }
      if (tab === 'brevo' || tab === 'integrations') {
        setActiveTab('settings');
        router.replace(
          { pathname: '/', query: { tab: 'settings', section: 'integrations' } },
          undefined,
          { shallow: true }
        );
        return;
      }
      if (VALID_TAB_IDS.includes(tab as TabId)) {
        const tabValue = tab as TabId;
        setActiveTab(tabValue);
        const rawFid = router.query.funnelId;
        if (tabValue === 'funnels' && rawFid && typeof rawFid === 'string') {
          router.replace({ pathname: '/', query: { tab: 'funnels', funnelId: rawFid } }, undefined, { shallow: true });
        } else if (tabValue === 'settings' && (router.query.section || router.query.google || router.query.google_error)) {
          // Keep settings deep-link query for SettingsPanel
        } else {
          router.replace('/', undefined, { shallow: true });
        }
      }
    }
  }, [router.isReady, router.query]);

  useEffect(() => {
    if (!router.isReady) return;
    if (activeTab === 'funnels') return;
    if (router.query.funnelId) {
      router.replace({ pathname: '/', query: { tab: activeTab } }, undefined, { shallow: true });
    }
  }, [activeTab, router.isReady, router.query.funnelId, router.replace]);

  // Members must not stay on admin-only tabs (URL/localStorage). Settings stays open for logout/org switch.
  useEffect(() => {
    if (loading) return;
    const roleLower = String(userRole || 'member').toLowerCase().trim();
    if (roleLower !== 'member') return;
    if (
      MEMBER_RESTRICTED_BOTTOM_NAV_TAB_IDS.includes(activeTab) ||
      activeTab === 'automations'
    ) {
      setActiveTab('terminal');
      setGlobalLoading(false);
    }
  }, [loading, activeTab, userRole, setGlobalLoading]);

  // System owners open Owner Panel via logo/org_portal — redirect legacy owner tab.
  useEffect(() => {
    if (loading || !isSystemOwner) return;
    if (activeTab === 'owner') {
      setActiveTab('org_portal');
      setGlobalLoading(false);
    }
  }, [loading, activeTab, isSystemOwner, setGlobalLoading]);

  // Client portal requires a consulting tier (system owners keep Owner Panel).
  useEffect(() => {
    if (loading || activeTab !== 'org_portal' || isSystemOwner) return;
    if (!hasConsultingTier(consultingTier)) {
      setActiveTab('terminal');
      setGlobalLoading(false);
    }
  }, [loading, activeTab, isSystemOwner, consultingTier, setGlobalLoading]);

  // Integrations live under Settings → Integrations.
  useEffect(() => {
    if (loading) return;
    const openIntegrations = sessionStorage.getItem('openSettingsIntegrations') === '1';
    if (openIntegrations) sessionStorage.removeItem('openSettingsIntegrations');
    if (activeTab === 'integrations' || openIntegrations) {
      setActiveTab('settings');
      void router.replace(
        { pathname: '/', query: { tab: 'settings', section: 'integrations' } },
        undefined,
        { shallow: true }
      );
      setGlobalLoading(false);
    }
  }, [loading, activeTab, router, setGlobalLoading]);

  // Refresh consulting portal fields when opening the portal (booking URL can change after admin save).
  useEffect(() => {
    if (loading || activeTab !== 'org_portal' || isSystemOwner) return;
    let cancelled = false;
    void apiClient
      .getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        const u = user as {
          org_name?: string | null;
          consulting_tier?: ConsultingTier | null;
          booking_url?: string | null;
        };
        const tier = u.consulting_tier;
        setConsultingTier(
          tier === 'pro_consulting' || tier === 'core_consulting' ? tier : null
        );
        setBookingUrl(typeof u.booking_url === 'string' && u.booking_url.trim() ? u.booking_url.trim() : null);
        if (u.org_name) setOrganizationName(u.org_name);
      })
      .catch(() => {
        /* keep existing portal props */
      });
    return () => {
      cancelled = true;
    };
  }, [loading, activeTab, isSystemOwner]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  // Check if current tab is accessible
  const hasTabAccess = (tab: string): boolean =>
    canAccessTab(tab, {
      isOwner,
      userRole,
      tabPermissions,
      consultingTier,
      isSystemOwner,
    });

  const showTerminalPriorities = canAccessTerminalPriorities(tabPermissions);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          if (tab !== activeTab) setActiveTab(tab);
        }} 
        isOwner={isOwner && !isSystemOwner}
        tabPermissions={tabPermissions}
        userRole={userRole || 'member'}
        organizationName={organizationName}
        automationsAwaitingApproval={automationsAwaitingApproval}
        consultingTier={consultingTier}
        isSystemOwner={isSystemOwner}
      />

      {notification && (
        <div className={`fixed top-[calc(var(--app-mobile-topbar-height,0px)+env(safe-area-inset-top,0px)+0.75rem)] right-3 z-[65] p-3 sm:p-4 rounded-lg shadow-lg max-w-[min(24rem,calc(100vw-1.5rem))] lg:top-4 ${
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

      <div
        className={`min-w-0 w-full min-h-[100dvh] transition-[padding] duration-300 ease-out ${mobileTopPaddingClass} ${
          activeTab === 'call_library' ? callLibraryPaddingClass : mainPaddingClass
        }`}
      >
        <main
          className={`min-w-0 mx-auto px-3 sm:px-4 lg:px-5 py-3 sm:py-6 overflow-x-hidden ${
            activeTab === 'pipeline' || activeTab === 'terminal' || activeTab === 'org_portal'
              ? 'max-w-none w-full'
              : 'max-w-7xl'
          }`}
        >
        {activeTab === 'terminal' && (
          hasTabAccess('terminal') ? (
            <TerminalDashboard showPriorities={showTerminalPriorities} />
          ) : (
            <RestrictedTabView tabName="terminal" />
          )
        )}

        {hasTabAccess('pipeline') && pipelineMounted ? (
          <div className={activeTab === 'pipeline' ? undefined : 'hidden'} aria-hidden={activeTab !== 'pipeline'}>
            <PipelineDashboard isActive={activeTab === 'pipeline'} />
          </div>
        ) : activeTab === 'pipeline' ? (
          <RestrictedTabView tabName="pipeline" />
        ) : null}

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

        {activeTab === 'resources' && (
          hasTabAccess('resources') ? (
            <ResourcesPanel />
          ) : (
            <RestrictedTabView tabName="resources" />
          )
        )}

        {activeTab === 'org_portal' && (
          isSystemOwner ? (
            <AdminPanel />
          ) : hasTabAccess('org_portal') ? (
            <OrgPortalPanel
              organizationName={organizationName}
              consultingTier={consultingTier}
              bookingUrl={bookingUrl}
              isActive={activeTab === 'org_portal'}
            />
          ) : (
            <RestrictedTabView tabName="org_portal" />
          )
        )}

        {activeTab === 'owner' && isOwner && !isSystemOwner && (
          <AdminPanel />
        )}

        {activeTab === 'intelligence' && (
          hasTabAccess('intelligence') ? (
            <div className="w-full">
              <IntelligencePanel onOpenAutomations={() => setActiveTab('automations')} />
            </div>
          ) : (
            <RestrictedTabView tabName="intelligence" />
          )
        )}

        {activeTab === 'automations' && (
          hasTabAccess('automations') ? (
            <div className="w-full">
              <AutomationsTab />
            </div>
          ) : (
            <RestrictedTabView tabName="automations" />
          )
        )}

        {activeTab === 'settings' && (
          hasTabAccess('settings') ? (
            <div className="w-full">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h2>
              <SettingsPanel />
            </div>
          ) : (
            <RestrictedTabView tabName="settings" />
          )
        )}
        </main>
      </div>
    </div>
  );
}

