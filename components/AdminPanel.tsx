import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import {
  Organization,
  GlobalHealth,
  OrganizationDashboardSummary,
  Invitation,
} from '@/types/admin';
import ShinyButton from './ui/ShinyButton';
import { useLoading } from '@/contexts/LoadingContext';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  ShowUpVsCloseRateChart,
  CashAndLtvTrendChart,
} from '@/components/owner/OwnerHealthTrendCharts';
import { ApiCostsTrendChart } from '@/components/owner/ApiCostsTrendChart';
import OrgOwnerDashboardModal from '@/components/owner/OrgOwnerDashboardModal';
import OwnerOrgsLeaderboard, { formatActiveTime } from '@/components/owner/OwnerOrgsLeaderboard';
import PortalSopDrawer, {
  SOP_DRAWER_WIDTH_COLLAPSED,
  SOP_DRAWER_WIDTH_OPEN,
} from '@/components/portal/PortalSopDrawer';
import { healthTrendPeriodsWithFinancesCash } from '@/lib/healthTrendMetrics';
import {
  type DashboardTimeRange,
  financesSummaryApiParams,
} from '@/lib/dashboardTimeRange';

/** Human-readable tab name for org tab permissions (internal keys stay snake_case). */
function tabPermissionDisplayName(tab: string): string {
  if (tab === 'content_studio') return 'Marketing Intel';
  if (tab === 'kpi_command_center') return 'KPI Command Center';
  if (tab === 'call_library') return 'Call Library';
  return tab.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminPanel() {
  const { setLoading: setGlobalLoading } = useLoading();
  const [activeTab, setActiveTab] = useState<'organizations' | 'health'>('organizations');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [health, setHealth] = useState<GlobalHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingOrg, setEditingOrg] = useState<string | null>(null);
  const [editOrgName, setEditOrgName] = useState('');
  const [viewingDashboard, setViewingDashboard] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<OrganizationDashboardSummary | null>(null);
  const [showFunnelForm, setShowFunnelForm] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<string | null>(null);
  const [funnelFormData, setFunnelFormData] = useState({
    name: '',
    client_id: '',
    slug: '',
    domain: '',
    env: ''
  });
  const [orgClients, setOrgClients] = useState<Array<{ id: string; name: string }>>([]);
  const [orgTabPermissions, setOrgTabPermissions] = useState<Array<{ tab_name: string; enabled: boolean }>>([]);
  const [loadingTabPermissions, setLoadingTabPermissions] = useState(false);
  const [showInviteOrg, setShowInviteOrg] = useState(false);
  const [inviteOrgName, setInviteOrgName] = useState('');
  const [inviteOrgAdminEmail, setInviteOrgAdminEmail] = useState('');
  const [inviteOrgConsultingTier, setInviteOrgConsultingTier] = useState<'' | 'pro_consulting' | 'core_consulting'>('');
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [maxUserSeatsInput, setMaxUserSeatsInput] = useState('');
  const [savingSeats, setSavingSeats] = useState(false);
  const [consultingTierInput, setConsultingTierInput] = useState<'' | 'pro_consulting' | 'core_consulting'>('');
  const [bookingUrlInput, setBookingUrlInput] = useState('');
  const [savingConsulting, setSavingConsulting] = useState(false);
  const [sopDrawerOpen, setSopDrawerOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgDashTimeRange, setOrgDashTimeRange] = useState<DashboardTimeRange>('mtd');
  /** Rollup from GET /integrations/calendar/platform-sales-close-rate (matches each org Calendar tab). */
  const [platformCalendarCloseRollup, setPlatformCalendarCloseRollup] = useState<{
    all_time: { total_sales_calls: number; closed_count: number; close_rate_pct: number };
    last_30d: { total_sales_calls: number; closed_count: number; close_rate_pct: number };
  } | null>(null);

  const healthFinancesTrendData = useMemo(
    () => healthTrendPeriodsWithFinancesCash(health?.health_trend_periods ?? []),
    [health?.health_trend_periods]
  );

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async (opts?: { refreshHealth?: boolean }) => {
    setGlobalLoading(
      true,
      opts?.refreshHealth ? 'Refreshing platform health…' : 'Loading admin panel...'
    );
    try {
      setLoading(true);
      setError(null);

      if (activeTab === 'organizations') {
        const [orgsData, invsData] = await Promise.all([
          apiClient.getOrganizations(),
          apiClient.listAdminInvitations().catch(() => []),
        ]);
        setOrganizations(orgsData);
        setPendingInvitations(Array.isArray(invsData) ? invsData : []);
      } else if (activeTab === 'health') {
        setPlatformCalendarCloseRollup(null);
        const [data, rollup, orgsData] = await Promise.all([
          apiClient.getGlobalHealth({
            refresh: opts?.refreshHealth,
          }) as Promise<GlobalHealth>,
          apiClient.getPlatformCalendarSalesCloseRate().catch(() => null),
          apiClient.getOrganizations().catch(() => [] as Organization[]),
        ]);
        setHealth(data);
        setPlatformCalendarCloseRollup(rollup);
        if (Array.isArray(orgsData) && orgsData.length) {
          setOrganizations(orgsData);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const handleInviteOrganization = async () => {
    if (!inviteOrgName.trim() || !inviteOrgAdminEmail.trim()) {
      setError('Organization name and admin email are required');
      return;
    }
    try {
      await apiClient.inviteOrganization({
        name: inviteOrgName.trim(),
        admin_email: inviteOrgAdminEmail.trim().toLowerCase(),
        consulting_tier: inviteOrgConsultingTier || null,
      });
      setInviteOrgName('');
      setInviteOrgAdminEmail('');
      setInviteOrgConsultingTier('');
      setShowInviteOrg(false);
      setError(null);
      alert(`Invitation sent to ${inviteOrgAdminEmail.trim()}. They will receive an email to set up their account.`);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to send invitation');
    }
  };

  const handleUpdateOrg = async (orgId: string) => {
    if (!editOrgName.trim()) return;
    
    try {
      await apiClient.updateOrganization(orgId, { name: editOrgName });
      setEditingOrg(null);
      setEditOrgName('');
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update organization');
    }
  };

  const handleSaveMaxUserSeats = async () => {
    if (!viewingDashboard || !dashboardData) return;
    const raw = maxUserSeatsInput.trim();
    const parsed = raw === '' ? null : parseInt(raw, 10);
    if (parsed !== null && (Number.isNaN(parsed) || parsed < 0)) {
      setError('Max user seats must be a non-negative number or empty for unlimited');
      return;
    }
    setSavingSeats(true);
    setError(null);
    const maxSeatsToSave: number | null = parsed;
    try {
      await apiClient.updateOrganization(viewingDashboard, { max_user_seats: maxSeatsToSave });
      const data = await apiClient.getOrganizationDashboard(viewingDashboard);
      setDashboardData(data);
      setMaxUserSeatsInput(data.max_user_seats != null ? String(data.max_user_seats) : '');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update user seat limit');
    } finally {
      setSavingSeats(false);
    }
  };

  const handleDeleteOrg = async (orgId: string) => {
    if (!confirm('Are you sure you want to delete this organization? This will delete all associated data.')) {
      return;
    }
    
    try {
      await apiClient.deleteOrganization(orgId);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to delete organization');
    }
  };

  const handleViewDashboard = async (orgId: string, timeRange: DashboardTimeRange = 'mtd') => {
    setGlobalLoading(true, 'Loading organization dashboard...');
    try {
      setLoading(true);
      setError(null);
      setOrgDashTimeRange(timeRange);
      const sumParams = financesSummaryApiParams(timeRange);
      const data = await apiClient.getOrganizationDashboard(orgId, {
        range: sumParams.range,
        scope: sumParams.scope,
      });
      setDashboardData(data);
      setMaxUserSeatsInput(data.max_user_seats != null ? String(data.max_user_seats) : '');
      setViewingDashboard(orgId);

      // Always fetch org detail so booking_url / tier aren't stale from the list payload
      const listed = organizations.find((o) => o.id === orgId);
      let tier = listed?.consulting_tier ?? null;
      let booking = listed?.booking_url ?? null;
      try {
        const orgDetail = (await apiClient.getOrganization(orgId)) as Organization;
        tier = orgDetail.consulting_tier ?? tier ?? null;
        booking = orgDetail.booking_url ?? booking ?? null;
      } catch {
        /* keep list values */
      }
      setConsultingTierInput(
        tier === 'pro_consulting' || tier === 'core_consulting' ? tier : ''
      );
      setBookingUrlInput(booking || '');

      // Load tab permissions for this org
      await loadOrgTabPermissions(orgId);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  /** Quiet live refresh while org dashboard modal is open (no global overlay). */
  const refreshOrgDashboard = useCallback(
    async (timeRange: DashboardTimeRange = orgDashTimeRange) => {
      if (!viewingDashboard) return;
      try {
        const sumParams = financesSummaryApiParams(timeRange);
        const data = await apiClient.getOrganizationDashboard(viewingDashboard, {
          range: sumParams.range,
          scope: sumParams.scope,
        });
        setDashboardData(data);
      } catch {
        /* keep last good snapshot */
      }
    },
    [viewingDashboard, orgDashTimeRange]
  );

  const handleOrgDashTimeRangeChange = useCallback(
    (tr: DashboardTimeRange) => {
      setOrgDashTimeRange(tr);
      void refreshOrgDashboard(tr);
    },
    [refreshOrgDashboard]
  );

  const closeOrgDashboard = useCallback(() => {
    setViewingDashboard(null);
    setDashboardData(null);
    setEditingFunnel(null);
    setShowFunnelForm(false);
    setOrgDashTimeRange('mtd');
  }, []);

  const handleSaveConsultingProgram = async () => {
    if (!viewingDashboard) return;
    setSavingConsulting(true);
    setError(null);
    try {
      const updated = (await apiClient.updateOrganization(viewingDashboard, {
        consulting_tier: consultingTierInput,
        booking_url: bookingUrlInput.trim(),
      })) as Organization;
      setConsultingTierInput(
        updated.consulting_tier === 'pro_consulting' || updated.consulting_tier === 'core_consulting'
          ? updated.consulting_tier
          : ''
      );
      setBookingUrlInput(updated.booking_url || '');
      setOrganizations((prev) =>
        prev.map((o) =>
          o.id === viewingDashboard
            ? {
                ...o,
                consulting_tier: updated.consulting_tier ?? null,
                booking_url: updated.booking_url ?? null,
              }
            : o
        )
      );
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update consulting program');
    } finally {
      setSavingConsulting(false);
    }
  };

  const loadOrgTabPermissions = async (orgId: string) => {
    try {
      setLoadingTabPermissions(true);
      const permissions = await apiClient.getOrganizationTabPermissions(orgId);
      setOrgTabPermissions(permissions);
    } catch (err: any) {
      console.error('Failed to load tab permissions:', err);
      // Set defaults if loading fails — keep in sync with backend AVAILABLE_TABS
      setOrgTabPermissions([
        { tab_name: 'terminal', enabled: true },
        { tab_name: 'pipeline', enabled: true },
        { tab_name: 'funnels', enabled: true },
        { tab_name: 'content_studio', enabled: true },
        { tab_name: 'call_library', enabled: true },
        { tab_name: 'kpi_command_center', enabled: true },
        { tab_name: 'automations', enabled: true },
        { tab_name: 'resources', enabled: true },
        { tab_name: 'intelligence', enabled: true },
      ]);
    } finally {
      setLoadingTabPermissions(false);
    }
  };

  const handleToggleTabPermission = async (orgId: string, tabName: string, enabled: boolean) => {
    try {
      await apiClient.updateOrganizationTabPermission(orgId, tabName, { enabled });
      await loadOrgTabPermissions(orgId);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update tab permission');
    }
  };

  const handleUpdateFunnel = async (funnelId: string) => {
    if (!viewingDashboard || !funnelFormData.name.trim()) return;
    
    try {
      const data: any = {
        name: funnelFormData.name,
        slug: funnelFormData.slug || undefined,
        domain: funnelFormData.domain || undefined,
        env: funnelFormData.env || undefined
      };
      
      if (funnelFormData.client_id) {
        data.client_id = funnelFormData.client_id;
      }
      
      await apiClient.updateOrganizationFunnel(viewingDashboard, funnelId, data);
      setEditingFunnel(null);
      setShowFunnelForm(false);
      setFunnelFormData({ name: '', client_id: '', slug: '', domain: '', env: '' });
      // Reload dashboard
      if (viewingDashboard) {
        handleViewDashboard(viewingDashboard);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update funnel');
    }
  };

  const handleDeleteFunnel = async (funnelId: string) => {
    if (!viewingDashboard) return;
    
    if (!confirm('Are you sure you want to delete this funnel? This will delete all associated steps and events.')) {
      return;
    }
    
    try {
      await apiClient.deleteOrganizationFunnel(viewingDashboard, funnelId);
      // Reload dashboard
      if (viewingDashboard) {
        handleViewDashboard(viewingDashboard);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to delete funnel');
    }
  };

  if (loading && !organizations.length && !health) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-[calc(100vh-1.5rem)]">
      <div
        className="min-w-0 w-full max-w-full space-y-6 transition-[padding-right] duration-300 ease-out"
        style={{
          paddingRight: sopDrawerOpen ? SOP_DRAWER_WIDTH_OPEN : SOP_DRAWER_WIDTH_COLLAPSED,
        }}
      >
      {viewingDashboard && dashboardData ? (
        <OrgOwnerDashboardModal
          orgId={viewingDashboard}
          dashboardData={dashboardData}
          organizations={organizations}
          onClose={closeOrgDashboard}
          onRefreshDashboard={refreshOrgDashboard}
          timeRange={orgDashTimeRange}
          onTimeRangeChange={handleOrgDashTimeRangeChange}
          maxUserSeatsInput={maxUserSeatsInput}
          setMaxUserSeatsInput={setMaxUserSeatsInput}
          savingSeats={savingSeats}
          onSaveSeats={handleSaveMaxUserSeats}
          consultingTierInput={consultingTierInput}
          setConsultingTierInput={setConsultingTierInput}
          bookingUrlInput={bookingUrlInput}
          setBookingUrlInput={setBookingUrlInput}
          savingConsulting={savingConsulting}
          onSaveConsulting={handleSaveConsultingProgram}
          editingFunnel={editingFunnel}
          setEditingFunnel={setEditingFunnel}
          funnelFormData={funnelFormData}
          setFunnelFormData={setFunnelFormData}
          onUpdateFunnel={handleUpdateFunnel}
          onDeleteFunnel={handleDeleteFunnel}
          orgTabPermissions={orgTabPermissions}
          loadingTabPermissions={loadingTabPermissions}
          onToggleTabPermission={(tabName, enabled) =>
            void handleToggleTabPermission(viewingDashboard, tabName, enabled)
          }
          tabPermissionDisplayName={tabPermissionDisplayName}
        />
      ) : (
        <>
      {/* Tabs */}
      <div className="border-b border-white/20">
        <nav className="-mb-px flex space-x-8">
          {(['organizations', 'health'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 font-medium text-sm capitalize transition-colors ${
                activeTab === tab
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              style={activeTab === tab ? {
                textShadow: '0 0 8px rgba(139, 92, 246, 0.5), 0 0 12px rgba(59, 130, 246, 0.3)'
              } : {}}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="glass-card p-4 border-red-400/40">
          <p className="text-red-800 dark:text-red-200">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 dark:text-red-300 hover:text-red-200 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Organizations Tab */}
      {activeTab === 'organizations' && (
        <div className="space-y-4 min-w-0 w-full max-w-full">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Organizations</h2>
            <ShinyButton onClick={() => setShowInviteOrg(true)}>
              Invite Organization
            </ShinyButton>
          </div>

          {showInviteOrg && (
            <div className="glass-card p-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Invite Organization (email onboarding)</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Create a new organization and send an invitation email. The admin will set their own password via the link.
              </p>
              <div className="space-y-3 max-w-md">
                <input
                  type="text"
                  value={inviteOrgName}
                  onChange={(e) => setInviteOrgName(e.target.value)}
                  placeholder="Organization name"
                  className="w-full px-3 py-2 glass-input rounded-md"
                />
                <input
                  type="email"
                  value={inviteOrgAdminEmail}
                  onChange={(e) => setInviteOrgAdminEmail(e.target.value)}
                  placeholder="Admin email address"
                  className="w-full px-3 py-2 glass-input rounded-md"
                />
                <label className="block text-sm text-gray-600 dark:text-gray-400">
                  Consulting tier
                  <select
                    value={inviteOrgConsultingTier}
                    onChange={(e) =>
                      setInviteOrgConsultingTier(e.target.value as '' | 'pro_consulting' | 'core_consulting')
                    }
                    className="mt-1 w-full px-3 py-2 glass-input rounded-md"
                  >
                    <option value="">Not a consulting org</option>
                    <option value="core_consulting">Core consulting</option>
                    <option value="pro_consulting">Pro consulting</option>
                  </select>
                </label>
                <div className="flex gap-2">
                  <button onClick={handleInviteOrganization} className="glass-button neon-glow px-4 py-2 rounded-md">
                    Send Invitation
                  </button>
                  <button
                    onClick={() => {
                      setShowInviteOrg(false);
                      setInviteOrgName('');
                      setInviteOrgAdminEmail('');
                      setInviteOrgConsultingTier('');
                      setError(null);
                    }}
                    className="glass-button-secondary px-4 py-2 rounded-md hover:bg-white/20"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {pendingInvitations.length > 0 && (
            <div className="glass-card p-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-3">Pending invitations</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-white/10">
                      <th className="pb-2 pr-4">Email</th>
                      <th className="pb-2 pr-4">Type</th>
                      <th className="pb-2 pr-4">Organization</th>
                      <th className="pb-2">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvitations.map((inv) => (
                      <tr key={inv.id} className="border-b border-white/5">
                        <td className="py-2 pr-4 text-gray-900 dark:text-gray-100">{inv.invitee_email}</td>
                        <td className="py-2 pr-4 text-gray-600 dark:text-gray-400 capitalize">{inv.invitation_type.replace('_', ' ')}</td>
                        <td className="py-2 pr-4 text-gray-600 dark:text-gray-400">
                          {organizations.find((o) => o.id === inv.org_id)?.name || inv.org_id}
                        </td>
                        <td className="py-2 text-gray-500 dark:text-gray-500">{new Date(inv.expires_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <OwnerOrgsLeaderboard
            organizations={organizations}
            orgSearch={orgSearch}
            onOrgSearchChange={setOrgSearch}
            editingOrg={editingOrg}
            editOrgName={editOrgName}
            onEditOrgNameChange={setEditOrgName}
            onViewDashboard={handleViewDashboard}
            onStartEdit={(org) => {
              setEditingOrg(org.id);
              setEditOrgName(org.name);
            }}
            onSaveEdit={handleUpdateOrg}
            onCancelEdit={() => {
              setEditingOrg(null);
              setEditOrgName('');
            }}
            onDelete={handleDeleteOrg}
          />
        </div>
      )}

      {/* Health Tab — platform impact & growth */}
      {activeTab === 'health' && health && (
        <div className="space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Platform health</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Revenue, coaching signals, API cost, and time on app across all organizations.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadData({ refreshHealth: true })}
              disabled={loading}
              className="shrink-0 inline-flex items-center justify-center rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {/* Owner-focused product & coaching signals */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 digitized-text">
              Product & coaching (30 days)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">
                  Combined revenue (Finances, post-onboarding)
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  $
                  {(
                    health.combined_revenue_post_onboarding_usd ?? health.stripe_revenue_post_onboarding_usd ??
                    0
                  ).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Same basis as the Finances tab (Stripe + Whop when reported). Falls back to Stripe-only if combined
                  totals are not available from the API.
                </p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Show-up rate (last 30d)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {health.show_up_rate_last_30d_pct == null ? '—' : `${health.show_up_rate_last_30d_pct}%`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Past Cal.com / Calendly check-ins</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">
                  Sales close rate (last 30d, Calendar definition)
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {platformCalendarCloseRollup?.last_30d
                    ? platformCalendarCloseRollup.last_30d.total_sales_calls > 0
                      ? `${platformCalendarCloseRollup.last_30d.close_rate_pct}%`
                      : '—'
                    : health.close_rate_last_30d_pct == null
                      ? '—'
                      : `${health.close_rate_last_30d_pct}%`}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {platformCalendarCloseRollup?.last_30d &&
                  platformCalendarCloseRollup.last_30d.total_sales_calls > 0
                    ? `All orgs: ${platformCalendarCloseRollup.last_30d.closed_count} / ${platformCalendarCloseRollup.last_30d.total_sales_calls} past sales calls closed (marked closed or succeeded Stripe on client)`
                    : platformCalendarCloseRollup
                      ? 'No past Cal.com / Calendly sales calls in the last 30 days across workspaces'
                      : 'Rollup unavailable; showing legacy health metric if present'}
                </p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Invitation emails (app)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {(health.invitation_emails_sent_last_30d ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Prior 30d: {(health.invitation_emails_sent_previous_30d ?? 0).toLocaleString()} invitations created
                </p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Calls booked (calendar sync)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {(health.calls_booked_last_30d ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Prior 30d: {(health.calls_booked_previous_30d ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Active clients (lifecycle)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  {(health.lifecycle_active_clients_current ?? 0).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  Tenured active (record older than 30d):{' '}
                  {(health.lifecycle_active_clients_previous_30d_cohort ?? 0).toLocaleString()}
                </p>
              </div>
            </div>
          </section>

          {/* Monthly trends since first org onboarding */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 digitized-text">
              Monthly trends (since first org onboarding)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
              Calendar months from the earliest organization&apos;s creation (up to 36 months back). Cash series use
              Finances combined revenue (Stripe + Whop) per month when the API provides it; otherwise Stripe-only for
              that month, scoped post-onboarding like before. Show-up and close rates use synced calendar check-ins.
              Client series compare cumulative client records to active clients created before each month end.
            </p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <ShowUpVsCloseRateChart
                  data={health.health_trend_periods ?? []}
                  description="Synced calendar check-ins vs sales close rate (same rules as each org Calendar tab)."
                />
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4">
                  Combined cash by month (Finances, post-onboarding)
                </p>
                <div className="h-72 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={healthFinancesTrendData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-white/10" />
                      <XAxis dataKey="period_label" tick={{ fontSize: 11 }} className="fill-gray-600 dark:fill-gray-400" />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 11 }}
                        className="fill-gray-600 dark:fill-gray-400"
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                        className="fill-gray-600 dark:fill-gray-400"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'rgba(17, 24, 39, 0.95)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: '#e5e7eb' }}
                      />
                      <Legend />
                      <Bar
                        yAxisId="left"
                        dataKey="finances_cash_usd"
                        name="Combined ($)"
                        fill="#f59e0b"
                        radius={[4, 4, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="calls_booked_count"
                        name="Calls booked"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 xl:col-span-2">
                <CashAndLtvTrendChart data={health.health_trend_periods ?? []} />
              </div>
            </div>
          </section>

          {/* LLM API usage */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 digitized-text">
              LLM API usage (last 30 days)
            </h3>
            {health.llm_usage_last_30d ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Calls</p>
                    <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {health.llm_usage_last_30d.calls.toLocaleString()}
                    </p>
                  </div>
                  <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total tokens</p>
                    <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                      {health.llm_usage_last_30d.total_tokens.toLocaleString()}
                    </p>
                  </div>
                  <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Prompt / completion</p>
                    <p className="text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                      {health.llm_usage_last_30d.prompt_tokens.toLocaleString()}
                      <span className="text-gray-400 font-normal"> / </span>
                      {health.llm_usage_last_30d.completion_tokens.toLocaleString()}
                    </p>
                  </div>
                  <div className="glass-card p-4 rounded-lg border border-amber-200/80 dark:border-amber-500/25">
                    <p className="text-xs text-amber-800 dark:text-amber-200">Est. cost (USD)</p>
                    <p className="text-2xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
                      ${health.llm_usage_last_30d.estimated_cost_usd.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {(health.llm_usage_last_30d.by_feature?.length ?? 0) > 0 && (
                    <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 overflow-x-auto">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">
                        Cost by feature
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Includes Call Library, call insights, Fathom sentiment, Content Studio,
                        automations, and health score — not only new calls.
                      </p>
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-white/10">
                            <th className="py-2 pr-4 font-medium">Feature</th>
                            <th className="py-2 pr-4 font-medium">Calls</th>
                            <th className="py-2 pr-4 font-medium">Tokens</th>
                            <th className="py-2 font-medium">Est. cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(health.llm_usage_last_30d.by_feature ?? []).map((row) => (
                            <tr
                              key={row.feature}
                              className="border-b border-gray-100 dark:border-white/5 text-gray-800 dark:text-gray-200"
                            >
                              <td className="py-2 pr-4 font-mono text-xs">{row.feature}</td>
                              <td className="py-2 pr-4 tabular-nums">{row.calls.toLocaleString()}</td>
                              <td className="py-2 pr-4 tabular-nums">
                                {row.total_tokens.toLocaleString()}
                              </td>
                              <td className="py-2 tabular-nums">
                                $
                                {row.estimated_cost_usd.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {(health.llm_usage_last_30d.by_org?.length ?? 0) > 0 && (
                    <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 overflow-x-auto">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
                        Top orgs by estimated cost
                      </p>
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-white/10">
                            <th className="py-2 pr-4 font-medium">Organization</th>
                            <th className="py-2 pr-4 font-medium">Calls</th>
                            <th className="py-2 pr-4 font-medium">Tokens</th>
                            <th className="py-2 font-medium">Est. cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(health.llm_usage_last_30d.by_org ?? []).slice(0, 10).map((row) => (
                            <tr
                              key={row.org_id}
                              className="border-b border-gray-100 dark:border-white/5 text-gray-800 dark:text-gray-200"
                            >
                              <td className="py-2 pr-4">{row.organization_name}</td>
                              <td className="py-2 pr-4 tabular-nums">{row.calls.toLocaleString()}</td>
                              <td className="py-2 pr-4 tabular-nums">
                                {row.total_tokens.toLocaleString()}
                              </td>
                              <td className="py-2 tabular-nums">
                                $
                                {row.estimated_cost_usd.toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No LLM usage recorded yet for this window.
              </p>
            )}
            <div className="mt-6">
              <ApiCostsTrendChart organizations={organizations} />
            </div>
          </section>

          {/* Revenue & billing */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 digitized-text">
              Revenue & billing
            </h3>
            <div className="glass-card p-4 rounded-lg border border-amber-200/80 dark:border-amber-500/25 bg-amber-50/90 dark:bg-amber-950/20 mb-4">
              <p className="text-sm text-gray-700 dark:text-gray-300 digitized-text">
                Total processor revenue (all time)
              </p>
              <p className="text-3xl font-bold text-amber-900 dark:text-amber-100 tabular-nums mt-1">
                $
                {(health.total_processor_revenue_all_time_usd ?? 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 space-y-0.5">
                <span className="block">
                  Stripe + Treasury (combined): $
                  {(health.cash_collected_all_time_combined_usd ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}{' '}
                  — Stripe succeeded ${(health.total_revenue_stripe_succeeded_usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} + Treasury posted $
                  {(health.treasury_posted_all_time_usd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="block">
                  Manual (entered in-app): $
                  {(health.manual_cash_all_time_usd ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Total revenue (Stripe, all time)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  ${health.total_revenue_stripe_succeeded_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Succeeded payment volume</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">MRR (active + trialing)</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                  ${health.total_mrr_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">ARR ≈ ${(health.total_mrr_usd * 12).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Revenue last 30 days (Finances combined)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  $
                  {(health.last_30_days_combined_revenue_usd ?? health.last_30_days_revenue_stripe_usd).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Stripe + Whop when reported; else Stripe-only</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Treasury posted (30d)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  ${health.treasury_posted_last_30_days_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Where Treasury is used</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Treasury posted (all time)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  ${(health.treasury_posted_all_time_usd ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-white/80 dark:bg-white/5">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Manual cash (all time)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                  ${(health.manual_cash_all_time_usd ?? 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Not via Stripe</p>
              </div>
            </div>
          </section>

          {/* Time on app */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 digitized-text">
              Time on app
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Visible-tab time from org members (heartbeat while Sweep is open in the foreground).
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400">Online now</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {health.currently_online_users ?? 0}
                </p>
                <p className="text-xs text-gray-500 mt-1">{health.currently_online_orgs ?? 0} orgs</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400">Active time (7d)</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatActiveTime(health.active_seconds_7d)}
                </p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400">Active time (30d)</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {formatActiveTime(health.active_seconds_30d)}
                </p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400">Orgs with activity (7d)</p>
                <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {(health.org_activity ?? []).filter((r) => r.active_seconds_7d > 0).length}
                </p>
              </div>
            </div>
            <div className="glass-card overflow-hidden rounded-lg border border-gray-200 dark:border-white/10">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-white/10 dark:bg-white/5">
                    <tr className="text-left text-gray-500 dark:text-gray-400">
                      <th className="px-3 py-2 font-medium">Organization</th>
                      <th className="px-3 py-2 font-medium">7d</th>
                      <th className="px-3 py-2 font-medium">30d</th>
                      <th className="px-3 py-2 font-medium">Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(health.org_activity ?? []).slice(0, 15).map((row) => (
                      <tr key={row.org_id} className="border-t border-white/10">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={`h-2 w-2 rounded-full ${row.currently_online ? 'bg-emerald-500' : 'bg-gray-400/40'}`}
                            />
                            {row.organization_name}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{formatActiveTime(row.active_seconds_7d)}</td>
                        <td className="px-3 py-2 tabular-nums">{formatActiveTime(row.active_seconds_30d)}</td>
                        <td className="px-3 py-2 text-gray-500">
                          {row.last_seen_at ? new Date(row.last_seen_at).toLocaleString() : '—'}
                        </td>
                      </tr>
                    ))}
                    {(health.org_activity ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-500">
                          No in-app time recorded yet. Totals start as teams keep Sweep open.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Funnels & engagement */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 digitized-text">
              Funnels & engagement
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-indigo-50/80 dark:bg-indigo-950/30">
                <p className="text-sm text-gray-700 dark:text-gray-300 digitized-text">Funnel first-step views (all time)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.funnel_first_step_views_all_time.toLocaleString()}</p>
                <p className="text-xs text-gray-600 dark:text-gray-500 mt-1">Events matching each funnel&apos;s first step</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 bg-indigo-50/80 dark:bg-indigo-950/30">
                <p className="text-sm text-gray-700 dark:text-gray-300 digitized-text">First-step views (30 days)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.funnel_first_step_views_last_30_days.toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Unique visitors (all time)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.unique_visitors_all_time.toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Unique visitors (30 days)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.unique_visitors_last_30_days.toLocaleString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">All funnel events (all time)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.total_events.toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Funnel events (30 days)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.total_events_last_30_days.toLocaleString()}</p>
              </div>
            </div>
          </section>

          {/* Integrations */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 digitized-text">
              Integrations
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">Orgs with Stripe connected</span>
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{health.orgs_with_stripe_connected}</span>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10 flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">Orgs with Brevo connected</span>
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100">{health.orgs_with_brevo_connected}</span>
              </div>
            </div>
          </section>
        </div>
      )}
        </>
      )}
      </div>
      <PortalSopDrawer
        isActive
        allowManage
        open={sopDrawerOpen}
        onOpenChange={setSopDrawerOpen}
      />
    </div>
  );
}

