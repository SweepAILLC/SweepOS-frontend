import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Organization, GlobalHealth, GlobalSettings, OrganizationDashboardSummary } from '@/types/admin';

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'organizations' | 'health' | 'settings'>('organizations');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [health, setHealth] = useState<GlobalHealth | null>(null);
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
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

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (activeTab === 'organizations') {
        const data = await apiClient.getOrganizations();
        setOrganizations(data);
      } else if (activeTab === 'health') {
        const data = await apiClient.getGlobalHealth();
        setHealth(data);
      } else if (activeTab === 'settings') {
        const data = await apiClient.getGlobalSettings();
        setSettings(data);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim()) return;
    
    try {
      const org = await apiClient.createOrganization({ name: newOrgName });
      setNewOrgName('');
      setShowCreateOrg(false);
      
      // Show success message with credentials
      const message = org.admin_email && org.admin_password
        ? `Organization "${org.name}" created successfully!\n\nAdmin user created:\nEmail: ${org.admin_email}\nPassword: ${org.admin_password}\n\nPlease save these credentials securely.`
        : `Organization "${org.name}" created successfully!\n\nA default admin user has been created for this organization.`;
      
      alert(message);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to create organization');
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
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getOrganizationDashboard(orgId);
      setDashboardData(data);
      setViewingDashboard(orgId);
      
      // Load tab permissions for this org
      await loadOrgTabPermissions(orgId);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
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
        { tab_name: 'brevo', enabled: true },
        { tab_name: 'clients', enabled: true },
        { tab_name: 'stripe', enabled: true },
        { tab_name: 'funnels', enabled: true },
        { tab_name: 'users', enabled: true }
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

  const handleCreateFunnel = async () => {
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
      
      await apiClient.createOrganizationFunnel(viewingDashboard, data);
      setShowFunnelForm(false);
      setFunnelFormData({ name: '', client_id: '', slug: '', domain: '', env: '' });
      // Reload dashboard to refresh funnel list
      if (viewingDashboard) {
        handleViewDashboard(viewingDashboard);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to create funnel');
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
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-600">Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['organizations', 'health', 'settings'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-4 px-1 border-b-2 font-medium text-sm capitalize ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-600 hover:text-red-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Organizations Tab */}
      {activeTab === 'organizations' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900">Organizations</h2>
            <button
              onClick={() => setShowCreateOrg(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              + Create Organization
            </button>
          </div>

          {showCreateOrg && (
            <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Create New Organization</h3>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Organization name"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateOrg()}
                />
                <button
                  onClick={handleCreateOrg}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setShowCreateOrg(false);
                    setNewOrgName('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Users
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Clients
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Funnels
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
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
                        <span className="text-sm font-medium text-gray-900">{org.name}</span>
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

      {/* Health Tab */}
      {activeTab === 'health' && health && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Global Health Stats</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Organizations</p>
              <p className="text-2xl font-bold text-gray-900">{health.total_organizations}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Users</p>
              <p className="text-2xl font-bold text-gray-900">{health.total_users}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Clients</p>
              <p className="text-2xl font-bold text-gray-900">{health.total_clients}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Funnels</p>
              <p className="text-2xl font-bold text-gray-900">{health.total_funnels}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Events</p>
              <p className="text-2xl font-bold text-gray-900">{health.total_events.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Payments</p>
              <p className="text-2xl font-bold text-gray-900">{health.total_payments.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Subscriptions</p>
              <p className="text-2xl font-bold text-gray-900">{health.total_subscriptions.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && settings && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">Global Settings</h2>
          <div className="bg-white rounded-lg shadow p-6">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500">Sudo Admin Email</dt>
                <dd className="mt-1 text-sm text-gray-900">{settings.sudo_admin_email}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Frontend URL</dt>
                <dd className="mt-1 text-sm text-gray-900">{settings.frontend_url}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Stripe Configured</dt>
                <dd className="mt-1 text-sm">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    settings.stripe_configured
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {settings.stripe_configured ? 'Yes' : 'No'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Brevo Configured</dt>
                <dd className="mt-1 text-sm">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    settings.brevo_configured
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
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
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Dashboard: {dashboardData.organization_name}
              </h2>
              <button
                onClick={() => {
                  setViewingDashboard(null);
                  setDashboardData(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <p className="text-sm text-blue-600">Total Clients</p>
                  <p className="text-2xl font-bold text-blue-900">{dashboardData.total_clients}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <p className="text-sm text-purple-600">Total Funnels</p>
                  <p className="text-2xl font-bold text-purple-900">{dashboardData.total_funnels}</p>
                  <p className="text-xs text-purple-600 mt-1">{dashboardData.active_funnels} active</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                  <p className="text-sm text-green-600">MRR</p>
                  <p className="text-2xl font-bold text-green-900">${dashboardData.total_mrr.toFixed(2)}</p>
                  <p className="text-xs text-green-600 mt-1">ARR: ${dashboardData.total_arr.toFixed(2)}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                  <p className="text-sm text-yellow-600">30-Day Revenue</p>
                  <p className="text-2xl font-bold text-yellow-900">${dashboardData.last_30_days_revenue.toFixed(2)}</p>
                </div>
              </div>

              {/* Clients by Status */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Clients by Status</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(dashboardData.clients_by_status).map(([status, count]) => (
                    <div key={status} className="text-center">
                      <p className="text-2xl font-bold text-gray-900">{count}</p>
                      <p className="text-sm text-gray-600 capitalize">{status}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Funnel Stats */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Funnel Analytics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Events</p>
                    <p className="text-xl font-bold text-gray-900">{dashboardData.total_events.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Visitors</p>
                    <p className="text-xl font-bold text-gray-900">{dashboardData.total_visitors.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Active Funnels</p>
                    <p className="text-xl font-bold text-gray-900">{dashboardData.active_funnels}</p>
                  </div>
                </div>
              </div>

              {/* Stripe Stats */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Stripe Metrics</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Active Subscriptions</p>
                    <p className="text-xl font-bold text-gray-900">{dashboardData.active_subscriptions}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Payments</p>
                    <p className="text-xl font-bold text-gray-900">{dashboardData.total_payments.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Brevo Connected</p>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      dashboardData.brevo_connected
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {dashboardData.brevo_connected ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Recent Clients */}
              {dashboardData.recent_clients.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Clients</h3>
                  <div className="space-y-2">
                    {dashboardData.recent_clients.map((client) => (
                      <div key={client.id} className="flex justify-between items-center py-2 border-b border-gray-200">
                        <div>
                          <p className="font-medium text-gray-900">{client.name}</p>
                          <p className="text-sm text-gray-500">{client.email || 'No email'}</p>
                        </div>
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded capitalize">
                          {client.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Funnels Management */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Funnels</h3>
                  <button
                    onClick={() => {
                      setShowFunnelForm(true);
                      setEditingFunnel(null);
                      setFunnelFormData({ name: '', client_id: '', slug: '', domain: '', env: '' });
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    + Create Funnel
                  </button>
                </div>

                {showFunnelForm && (
                  <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-3">
                      {editingFunnel ? 'Edit Funnel' : 'Create New Funnel'}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input
                          type="text"
                          value={funnelFormData.name}
                          onChange={(e) => setFunnelFormData({ ...funnelFormData, name: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="Funnel name"
                        />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
                          <input
                            type="text"
                            value={funnelFormData.domain}
                            onChange={(e) => setFunnelFormData({ ...funnelFormData, domain: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="example.com"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                          <input
                            type="text"
                            value={funnelFormData.slug}
                            onChange={(e) => setFunnelFormData({ ...funnelFormData, slug: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md"
                            placeholder="funnel-slug"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
                        <select
                          value={funnelFormData.env}
                          onChange={(e) => setFunnelFormData({ ...funnelFormData, env: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        >
                          <option value="">Select environment</option>
                          <option value="production">Production</option>
                          <option value="staging">Staging</option>
                          <option value="development">Development</option>
                        </select>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={editingFunnel ? () => handleUpdateFunnel(editingFunnel) : handleCreateFunnel}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          {editingFunnel ? 'Update' : 'Create'}
                        </button>
                        <button
                          onClick={() => {
                            setShowFunnelForm(false);
                            setEditingFunnel(null);
                            setFunnelFormData({ name: '', client_id: '', slug: '', domain: '', env: '' });
                          }}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
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
                      <div key={funnel.id} className="flex justify-between items-center py-3 px-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{funnel.name}</p>
                          <div className="flex space-x-4 mt-1 text-sm text-gray-500">
                            {funnel.domain && <span>Domain: {funnel.domain}</span>}
                            {funnel.slug && <span>Slug: {funnel.slug}</span>}
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => {
                              setEditingFunnel(funnel.id);
                              setShowFunnelForm(true);
                              setFunnelFormData({
                                name: funnel.name,
                                client_id: '',
                                slug: funnel.slug || '',
                                domain: funnel.domain || '',
                                env: ''
                              });
                            }}
                            className="text-blue-600 hover:text-blue-900 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteFunnel(funnel.id)}
                            className="text-red-600 hover:text-red-900 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No funnels yet. Create one to get started.</p>
                )}
              </div>

              {/* Tab Permissions Management */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Tab Permissions</h3>
                <p className="text-sm text-gray-600 mb-4">
                  Control which tabs are accessible to users in this organization. Disabled tabs will show a contact message instead of the dashboard.
                </p>
                
                {loadingTabPermissions ? (
                  <div className="text-center py-4">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                    <p className="mt-2 text-sm text-gray-600">Loading permissions...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orgTabPermissions.map((permission) => (
                      <div key={permission.tab_name} className="flex items-center justify-between py-3 px-4 border border-gray-200 rounded-lg">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 capitalize">{permission.tab_name}</p>
                          <p className="text-xs text-gray-500 mt-1">
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
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
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

