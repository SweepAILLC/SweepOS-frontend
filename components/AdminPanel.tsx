import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '@/lib/api';
import {
  Organization,
  GlobalHealth,
  GlobalSettings,
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
import { healthTrendPeriodsWithFinancesCash } from '@/lib/healthTrendMetrics';

/** Human-readable tab name for org tab permissions (internal keys stay snake_case). */
function tabPermissionDisplayName(tab: string): string {
  if (tab === 'content_studio') return 'Marketing Intel';
  return tab.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AdminPanel() {
  const { setLoading: setGlobalLoading } = useLoading();
  const [activeTab, setActiveTab] = useState<'organizations' | 'health' | 'settings'>('organizations');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [health, setHealth] = useState<GlobalHealth | null>(null);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
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
  const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
  const [maxUserSeatsInput, setMaxUserSeatsInput] = useState('');
  const [savingSeats, setSavingSeats] = useState(false);
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
      } else if (activeTab === 'settings') {
        const data = await apiClient.getGlobalSettings();
        setSettings(data);
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
      });
      setInviteOrgName('');
      setInviteOrgAdminEmail('');
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

  const handleViewDashboard = async (orgId: string) => {
    setGlobalLoading(true, 'Loading organization dashboard...');
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getOrganizationDashboard(orgId);
      setDashboardData(data);
      setMaxUserSeatsInput(data.max_user_seats != null ? String(data.max_user_seats) : '');
      setViewingDashboard(orgId);
      
      // Load tab permissions for this org
      await loadOrgTabPermissions(orgId);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const loadOrgTabPermissions = async (orgId: string) => {
    try {
      setLoadingTabPermissions(true);
      const permissions = await apiClient.getOrganizationTabPermissions(orgId);
      setOrgTabPermissions(permissions);
    } catch (err: any) {
      console.error('Failed to load tab permissions:', err);
      // Set defaults if loading fails
      setOrgTabPermissions([
        { tab_name: 'terminal', enabled: true },
        { tab_name: 'pipeline', enabled: true },
        { tab_name: 'clients', enabled: true },
        { tab_name: 'stripe', enabled: true },
        { tab_name: 'funnels', enabled: true },
        { tab_name: 'content_studio', enabled: true },
        { tab_name: 'call_library', enabled: true },
        { tab_name: 'integrations', enabled: true },
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

  if (loading && !organizations.length && !health && !settings) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-white/20">
        <nav className="-mb-px flex space-x-8">
          {(['organizations', 'health', 'settings'] as const).map((tab) => (
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
        <div className="space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
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
                <div className="flex gap-2">
                  <button onClick={handleInviteOrganization} className="glass-button neon-glow px-4 py-2 rounded-md">
                    Send Invitation
                  </button>
                  <button
                    onClick={() => { setShowInviteOrg(false); setInviteOrgName(''); setInviteOrgAdminEmail(''); setError(null); }}
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

          <div className="glass-card overflow-hidden">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/10 dark:bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                    Users
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                    Clients
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                    Funnels
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider digitized-text">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-white/10">
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {editingOrg === org.id ? (
                        <input
                          type="text"
                          value={editOrgName}
                          onChange={(e) => setEditOrgName(e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded"
                          onKeyPress={(e) => e.key === 'Enter' && handleUpdateOrg(org.id)}
                        />
                      ) : (
                        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{org.name}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {org.user_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {org.client_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {org.funnel_count || 0}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {editingOrg === org.id ? (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleUpdateOrg(org.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingOrg(null);
                              setEditOrgName('');
                            }}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewDashboard(org.id)}
                            className="text-green-600 hover:text-green-900"
                          >
                            View Dashboard
                          </button>
                          <button
                            onClick={() => {
                              setEditingOrg(org.id);
                              setEditOrgName(org.name);
                            }}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteOrg(org.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Health Tab — platform impact & growth */}
      {activeTab === 'health' && health && (
        <div className="space-y-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Platform health</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Revenue, scale, funnel traffic, and 30-day growth signals across all organizations.
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
                        {health.llm_usage_last_30d.by_org.slice(0, 10).map((row) => (
                          <tr
                            key={row.org_id}
                            className="border-b border-gray-100 dark:border-white/5 text-gray-800 dark:text-gray-200"
                          >
                            <td className="py-2 pr-4">{row.organization_name}</td>
                            <td className="py-2 pr-4 tabular-nums">{row.calls.toLocaleString()}</td>
                            <td className="py-2 pr-4 tabular-nums">{row.total_tokens.toLocaleString()}</td>
                            <td className="py-2 tabular-nums">
                              ${row.estimated_cost_usd.toLocaleString(undefined, {
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

          {/* Scale */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 digitized-text">
              Platform scale
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Organizations</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.total_organizations}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Users</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.total_users}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Clients</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.total_clients}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Funnels</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.total_funnels}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Payment records</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.total_payments.toLocaleString()}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Subscriptions (all)</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.total_subscriptions.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Active + trialing: {health.active_subscriptions}</p>
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

          {/* Growth (30 days) */}
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3 digitized-text">
              Growth (last 30 days)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="glass-card p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                <p className="text-sm text-gray-700 dark:text-gray-300 digitized-text">New organizations</p>
                <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">{health.organizations_created_last_30_days}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                <p className="text-sm text-gray-700 dark:text-gray-300 digitized-text">New users</p>
                <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">{health.users_created_last_30_days}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
                <p className="text-sm text-gray-700 dark:text-gray-300 digitized-text">New clients</p>
                <p className="text-2xl font-bold text-emerald-800 dark:text-emerald-200">{health.clients_created_last_30_days}</p>
              </div>
              <div className="glass-card p-4 rounded-lg border border-gray-200 dark:border-white/10">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Pending invitations</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{health.pending_invitations}</p>
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

      {/* Settings Tab */}
      {activeTab === 'settings' && settings && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Global Settings</h2>
          <div className="glass-card p-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 digitized-text">Sudo Admin Email</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{settings.sudo_admin_email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 digitized-text">Frontend URL</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{settings.frontend_url}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 digitized-text">Stripe Configured</dt>
                <dd className="mt-1 text-sm">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    settings.stripe_configured
                      ? 'bg-green-500/20 text-green-900 border-green-400/30'
                      : 'bg-red-500/20 text-red-900 border-red-400/30'
                  }`}>
                    {settings.stripe_configured ? 'Yes' : 'No'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 digitized-text">Brevo Configured</dt>
                <dd className="mt-1 text-sm">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                    settings.brevo_configured
                      ? 'bg-green-500/20 text-green-900 border-green-400/30'
                      : 'bg-red-500/20 text-red-900 border-red-400/30'
                  }`}>
                    {settings.brevo_configured ? 'Yes' : 'No'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}

      {/* Organization Dashboard View */}
      {viewingDashboard && dashboardData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:glass-card dark:neon-glow max-w-6xl w-full max-h-[90vh] overflow-y-auto rounded-lg shadow-lg">
            <div className="bg-white dark:glass-panel px-6 py-4 flex justify-between items-center border-b border-gray-200 dark:border-white/10">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                Dashboard: {dashboardData.organization_name}
              </h2>
              <button
                onClick={() => {
                  setViewingDashboard(null);
                  setDashboardData(null);
                }}
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                <div className="bg-white dark:glass-card dark:neon-glow p-4 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                  <p className="text-sm text-blue-600 dark:text-blue-300 digitized-text">Total Clients</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.total_clients}</p>
                </div>
                <div className="bg-white dark:glass-card dark:neon-glow p-4 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                  <p className="text-sm text-purple-600 dark:text-purple-300 digitized-text">Total Funnels</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.total_funnels}</p>
                  <p className="text-xs text-purple-600 dark:text-purple-300 mt-1">{dashboardData.active_funnels} active</p>
                </div>
                <div className="bg-white dark:glass-card dark:neon-glow p-4 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                  <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Stripe / Treasury (all time)</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    $
                    {(dashboardData.cash_collected_all_time_usd ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Primary payment rail for this org</p>
                </div>
                <div className="bg-white dark:glass-card dark:neon-glow p-4 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                  <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Manual cash (all time)</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                    $
                    {(dashboardData.manual_cash_all_time_usd ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Entered in-app</p>
                </div>
                <div className="bg-white dark:glass-card dark:neon-glow p-4 rounded-lg border border-amber-200/80 dark:border-amber-500/25 shadow-sm">
                  <p className="text-sm text-amber-800 dark:text-amber-200 digitized-text">Total processor revenue</p>
                  <p className="text-2xl font-bold text-amber-900 dark:text-amber-100 tabular-nums">
                    $
                    {(dashboardData.total_processor_revenue_all_time_usd ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-1">Stripe/Treasury + manual</p>
                </div>
              </div>

              {dashboardData.llm_usage_last_30d && (
                <div className="bg-white dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      LLM API usage (last 30 days)
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Token usage and estimated cost for this organization.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
                      <p className="text-xs text-gray-500">Calls</p>
                      <p className="text-xl font-bold tabular-nums">
                        {dashboardData.llm_usage_last_30d.calls.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
                      <p className="text-xs text-gray-500">Tokens</p>
                      <p className="text-xl font-bold tabular-nums">
                        {dashboardData.llm_usage_last_30d.total_tokens.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-white/10 p-3">
                      <p className="text-xs text-gray-500">Prompt / out</p>
                      <p className="text-sm font-semibold tabular-nums">
                        {dashboardData.llm_usage_last_30d.prompt_tokens.toLocaleString()} /{' '}
                        {dashboardData.llm_usage_last_30d.completion_tokens.toLocaleString()}
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-200/80 dark:border-amber-500/25 p-3">
                      <p className="text-xs text-amber-800 dark:text-amber-200">Est. cost</p>
                      <p className="text-xl font-bold tabular-nums text-amber-900 dark:text-amber-100">
                        $
                        {dashboardData.llm_usage_last_30d.estimated_cost_usd.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                  </div>
                  {(dashboardData.llm_usage_last_30d.by_feature?.length ?? 0) > 0 && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500 border-b border-gray-200 dark:border-white/10">
                            <th className="py-2 pr-4 font-medium">Feature</th>
                            <th className="py-2 pr-4 font-medium">Calls</th>
                            <th className="py-2 pr-4 font-medium">Tokens</th>
                            <th className="py-2 font-medium">Est. cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardData.llm_usage_last_30d.by_feature.map((row) => (
                            <tr
                              key={row.feature}
                              className="border-b border-gray-100 dark:border-white/5"
                            >
                              <td className="py-2 pr-4 font-mono text-xs">{row.feature}</td>
                              <td className="py-2 pr-4 tabular-nums">{row.calls.toLocaleString()}</td>
                              <td className="py-2 pr-4 tabular-nums">{row.total_tokens.toLocaleString()}</td>
                              <td className="py-2 tabular-nums">
                                ${row.estimated_cost_usd.toLocaleString(undefined, {
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
              )}

              {(dashboardData.monthly_health_since_onboarding?.length ?? 0) > 0 && (
                <div className="bg-white dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                      Coaching & revenue trends
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Monthly cash follows the Finances tab (Stripe + Whop when the API reports combined revenue; otherwise
                      Stripe-only for that month). Show-up and close rates use synced calendar data; LTV proxy uses the
                      same cumulative cash ÷ roster as platform health.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-200 dark:border-white/10 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 digitized-text">Platform onboarding</p>
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {dashboardData.organization_onboarded_at
                          ? new Date(dashboardData.organization_onboarded_at).toLocaleDateString(undefined, {
                              dateStyle: 'medium',
                            })
                          : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-white/10 p-4">
                      <p className="text-xs text-gray-500 dark:text-gray-400 digitized-text">
                        Combined cash since onboarding (Finances)
                      </p>
                      <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums">
                        $
                        {(
                          dashboardData.finances_combined_since_onboarding_usd ??
                          dashboardData.cash_collected_since_onboarding_usd ??
                          0
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        Stripe + Whop when reported; otherwise matches legacy Stripe/Treasury onboarding total
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-gray-200 dark:border-white/10 p-4">
                      <ShowUpVsCloseRateChart
                        data={dashboardData.monthly_health_since_onboarding ?? []}
                        xAxisMode="tilted"
                        description="Per-month show-up and close rate for this organization."
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-white/10 p-4">
                      <CashAndLtvTrendChart
                        data={dashboardData.monthly_health_since_onboarding ?? []}
                        xAxisMode="tilted"
                        heightPx={256}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* User seats (owner-only: limit org seats) */}
              <div className="bg-white dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">User seats</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Limit how many users this organization can have. Leave empty for unlimited.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-gray-700 dark:text-gray-300">
                    Current: <strong>{dashboardData.total_users ?? 0}</strong> users
                    {dashboardData.max_user_seats != null && (
                      <> / <strong>{dashboardData.max_user_seats}</strong> max</>
                    )}
                    {dashboardData.max_user_seats == null && (
                      <span className="text-gray-500 dark:text-gray-400"> (unlimited)</span>
                    )}
                  </span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Unlimited"
                    value={maxUserSeatsInput}
                    onChange={(e) => setMaxUserSeatsInput(e.target.value)}
                    className="w-28 px-3 py-1.5 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-white/5 text-gray-900 dark:text-gray-100"
                  />
                  <ShinyButton
                    onClick={handleSaveMaxUserSeats}
                    disabled={savingSeats}
                    className="px-4 py-1.5"
                  >
                    {savingSeats ? 'Saving…' : 'Save limit'}
                  </ShinyButton>
                </div>
              </div>

              {/* Clients by Status */}
              <div className="bg-white dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Clients by Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(dashboardData.clients_by_status).map(([status, count]) => (
                    <div key={status} className="text-center">
                      <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{count}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 capitalize digitized-text">{status}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Funnel Stats */}
              <div className="bg-white dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Funnel Analytics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Total Events</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.total_events.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Total Visitors</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.total_visitors.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Active Funnels</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.active_funnels}</p>
                  </div>
                </div>
              </div>

              {/* Stripe Stats */}
              <div className="bg-white dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Stripe Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Active Subscriptions</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.active_subscriptions}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Total Payments</p>
                    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{dashboardData.total_payments.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Brevo Connected</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                      dashboardData.brevo_connected
                        ? 'bg-green-500/20 text-green-200 border-green-400/30'
                        : 'bg-red-500/20 text-red-200 border-red-400/30'
                    }`}>
                      {dashboardData.brevo_connected ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Funnel Conversion Metrics (last 30 days) */}
              {dashboardData.funnel_conversion_metrics && dashboardData.funnel_conversion_metrics.length > 0 && (
                <div className="bg-white dark:bg-gray-50 dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Funnel Conversion Metrics (30 days)</h3>
                  <div className="space-y-6">
                    {dashboardData.funnel_conversion_metrics.map((funnel) => (
                      <div key={funnel.funnel_id} className="border border-gray-300 dark:border-white/10 rounded-lg p-4 bg-gray-50 dark:bg-white/5">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">{funnel.funnel_name}</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                          <div>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 digitized-text">Visitors</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{funnel.total_visitors.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 digitized-text">Conversions</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{funnel.total_conversions.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 digitized-text">Conversion rate</p>
                            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{funnel.overall_conversion_rate.toFixed(1)}%</p>
                          </div>
                        </div>
                        {funnel.step_counts && funnel.step_counts.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-300 dark:border-white/10">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 digitized-text">Steps</p>
                            <div className="flex flex-wrap gap-2">
                              {funnel.step_counts.map((step, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-200 text-gray-800 dark:bg-white/10 dark:text-gray-200 border border-gray-300 dark:border-white/10"
                                >
                                  {step.label || step.event_name}: {step.count.toLocaleString()}
                                  {step.conversion_rate != null && (
                                    <span className="ml-1 text-green-700 dark:text-green-400">({step.conversion_rate.toFixed(0)}%)</span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Funnels (list only; create is done in org's own dashboard) */}
              <div className="bg-white dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Funnels</h3>
                </div>

                {editingFunnel && (
                  <div className="mb-4 p-4 bg-white dark:glass-panel rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                      Edit Funnel
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name *</label>
                        <input
                          type="text"
                          value={funnelFormData.name}
                          onChange={(e) => setFunnelFormData({ ...funnelFormData, name: e.target.value })}
                          className="w-full px-3 py-2 glass-input rounded-md"
                          placeholder="Funnel name"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Domain</label>
                          <input
                            type="text"
                            value={funnelFormData.domain}
                            onChange={(e) => setFunnelFormData({ ...funnelFormData, domain: e.target.value })}
                            className="w-full px-3 py-2 glass-input rounded-md"
                            placeholder="example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
                          <input
                            type="text"
                            value={funnelFormData.slug}
                            onChange={(e) => setFunnelFormData({ ...funnelFormData, slug: e.target.value })}
                            className="w-full px-3 py-2 glass-input rounded-md"
                            placeholder="funnel-slug"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Environment</label>
                        <select
                          value={funnelFormData.env}
                          onChange={(e) => setFunnelFormData({ ...funnelFormData, env: e.target.value })}
                          className="w-full px-3 py-2 glass-input rounded-md"
                        >
                          <option value="">Select environment</option>
                          <option value="production">Production</option>
                          <option value="staging">Staging</option>
                          <option value="development">Development</option>
                        </select>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleUpdateFunnel(editingFunnel)}
                          className="glass-button neon-glow px-4 py-2 rounded-md"
                        >
                          Update
                        </button>
                        <button
                          onClick={() => {
                            setShowFunnelForm(false);
                            setEditingFunnel(null);
                            setFunnelFormData({ name: '', client_id: '', slug: '', domain: '', env: '' });
                          }}
                          className="glass-button-secondary px-4 py-2 rounded-md hover:bg-white/20"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {dashboardData.recent_funnels.length > 0 ? (
                  <div className="space-y-2">
                    {dashboardData.recent_funnels.map((funnel) => (
                      <div key={funnel.id} className="flex justify-between items-center py-3 px-4 bg-white dark:glass-panel rounded-lg border border-gray-200 dark:border-white/10 shadow-sm hover:shadow-md">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{funnel.name}</p>
                          <div className="flex space-x-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {funnel.domain && <span>Domain: {funnel.domain}</span>}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              setEditingFunnel(funnel.id);
                              setFunnelFormData({
                                name: funnel.name,
                                client_id: '',
                                slug: '',
                                domain: funnel.domain || '',
                                env: ''
                              });
                            }}
                            className="text-blue-400 hover:text-blue-200 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteFunnel(funnel.id)}
                            className="text-red-400 hover:text-red-200 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No funnels yet.</p>
                )}
              </div>

              {/* Tab Permissions Management */}
              <div className="bg-white dark:glass-card p-6 rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Tab Permissions</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Control which tabs are accessible to users in this organization. Disabled tabs will show a contact message instead of the dashboard.
                </p>
                
                {loadingTabPermissions ? (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Loading permissions...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {orgTabPermissions.map((permission) => (
                      <div key={permission.tab_name} className="flex items-center justify-between gap-3 py-3 px-4 bg-white dark:glass-panel rounded-lg border border-gray-200 dark:border-white/10 shadow-sm">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-gray-100">
                            {tabPermissionDisplayName(permission.tab_name)}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {permission.enabled 
                              ? 'Users can access this tab' 
                              : 'Users will see contact message'}
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={permission.enabled}
                            onChange={(e) => {
                              if (viewingDashboard) {
                                handleToggleTabPermission(viewingDashboard, permission.tab_name, e.target.checked);
                              }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-white/20 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

