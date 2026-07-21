import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';
import { clearSessionCaches } from '@/lib/cache';
import { useTheme } from '@/contexts/ThemeContext';
import { useLoading } from '@/contexts/LoadingContext';
import UsersPanel from '@/components/UsersPanel';
import IntegrationsPanel from '@/components/ui/IntegrationsPanel';

type SettingsSection = 'appearance' | 'accounts' | 'team' | 'profile' | 'privacy' | 'integrations';

interface OrgOption {
  id: string;
  name: string;
  is_primary: boolean;
}

const SIDEBAR_ITEMS: { id: SettingsSection; label: string; adminOnly?: boolean }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'team', label: 'Team', adminOnly: true },
  { id: 'integrations', label: 'Integrations', adminOnly: true },
  { id: 'profile', label: 'Profile' },
  { id: 'privacy', label: 'Privacy & Data' },
];

export default function SettingsPanel() {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { setLoading: setGlobalLoading } = useLoading();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [section, setSection] = useState<SettingsSection>('appearance');
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string>('member');
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);
  const [leavingOrgId, setLeavingOrgId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    current_password: '',
    new_password: '',
    confirm_password: '',
    data_sharing_enabled: true,
    analytics_enabled: true,
    org_name: '',
  });
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleOAuthAvailable, setGoogleOAuthAvailable] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const [googleBusy, setGoogleBusy] = useState(false);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const [settings, user] = await Promise.all([
        apiClient.getUserSettings(),
        apiClient.getCurrentUser(),
      ]);
      setFormData({
        email: settings.email || '',
        current_password: '',
        new_password: '',
        confirm_password: '',
        data_sharing_enabled: settings.data_sharing_enabled ?? true,
        analytics_enabled: settings.analytics_enabled ?? true,
        org_name: '',
      });
      setGoogleConnected(!!settings.google_connected);
      setGoogleEmail(settings.google_email || null);
      setGoogleOAuthAvailable(!!settings.google_oauth_available);
      setHasPassword(settings.has_password !== false);
      const orgId = user?.org_id != null ? String(user.org_id) : null;
      setCurrentOrgId(orgId);
      setCurrentUserRole(user?.role || 'member');
      const orgEmail = user?.email || settings.email;
      if (orgEmail) {
        const orgs = await apiClient.getUserOrganizations(orgEmail);
        const orgList = Array.isArray(orgs)
          ? orgs.map((o: any) => ({
              id: String(o.id),
              name: o.name || 'Unnamed',
              is_primary: !!o.is_primary,
            }))
          : [];
        setOrganizations(orgList);
        if (orgId) {
          const currentOrg = orgList.find((o) => o.id === String(orgId));
          if (currentOrg) {
            setFormData((prev) => ({
              ...prev,
              org_name: currentOrg.name || '',
            }));
          }
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  // Deep-links: /?tab=settings&section=… and Google connect return
  useEffect(() => {
    if (!router.isReady) return;
    const tab = router.query.tab;
    const sectionQ = router.query.section;
    const google = router.query.google;
    const googleError = router.query.google_error;
    const message = typeof router.query.message === 'string' ? router.query.message : '';

    if (tab === 'settings' || sectionQ || google || googleError) {
      if (sectionQ === 'profile' || google || googleError) {
        setSection('profile');
      } else if (
        typeof sectionQ === 'string' &&
        ['appearance', 'accounts', 'team', 'profile', 'privacy', 'integrations'].includes(sectionQ)
      ) {
        setSection(sectionQ as SettingsSection);
      }
    }
    if (google === 'connected') {
      setSuccess('Google account connected. You can sign in with Google next time.');
      setGoogleConnected(true);
      loadSettings();
      // Clean query params without full reload
      router.replace({ pathname: router.pathname, query: {} }, undefined, { shallow: true });
    } else if (typeof googleError === 'string' && googleError) {
      setError(message || googleError.replace(/_/g, ' '));
      router.replace({ pathname: router.pathname, query: {} }, undefined, { shallow: true });
    }
  }, [router.isReady, router.query.tab, router.query.section, router.query.google, router.query.google_error]);

  const isAdminOrOwner = currentUserRole === 'admin' || currentUserRole === 'owner';

  useEffect(() => {
    if (!loading && section === 'integrations' && !isAdminOrOwner) {
      setSection('appearance');
    }
  }, [loading, section, isAdminOrOwner]);

  const handleConnectGoogle = async () => {
    try {
      setGoogleBusy(true);
      setError(null);
      const { authorization_url } = await apiClient.startGoogleConnect();
      if (!authorization_url) {
        throw new Error('Google connect is not available');
      }
      window.location.href = authorization_url;
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : err.message || 'Failed to start Google connect');
      setGoogleBusy(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      setGoogleBusy(true);
      setError(null);
      await apiClient.disconnectGoogle();
      setGoogleConnected(false);
      setGoogleEmail(null);
      setSuccess('Google account disconnected.');
      await loadSettings();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : err.message || 'Failed to disconnect Google');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleLogout = () => {
    clearSessionCaches();
    Cookies.remove('access_token');
    router.push('/login');
  };

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === currentOrgId) return;
    try {
      setSwitchingOrgId(orgId);
      setError(null);
      await apiClient.switchOrganization(orgId);
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to switch organization');
    } finally {
      setSwitchingOrgId(null);
    }
  };

  const handleLeaveOrg = async (orgId: string) => {
    if (!organizations.length) return;
    const org = organizations.find((o) => o.id === orgId);
    if (!org) return;
    if (org.is_primary) {
      setError('You cannot leave your primary organization.');
      return;
    }
    if (String(org.id) === String(currentOrgId)) {
      setError('Switch to another organization before leaving this one.');
      return;
    }
    const confirmed = window.confirm(`Leave organization “${org.name}”? You can rejoin later if re-invited.`);
    if (!confirmed) return;
    try {
      setLeavingOrgId(orgId);
      setError(null);
      await apiClient.leaveOrganization(orgId);
      await loadSettings();
      setSuccess(`Left organization “${org.name}”.`);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to leave organization');
    } finally {
      setLeavingOrgId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (formData.new_password) {
      if (!formData.current_password) {
        setError('Current password is required to change password');
        return;
      }
      if (formData.new_password !== formData.confirm_password) {
        setError('New passwords do not match');
        return;
      }
      if (formData.new_password.length < 8) {
        setError('Password must be at least 8 characters long');
        return;
      }
    }

    try {
      setSaving(true);
      const updateData: any = {
        email: formData.email,
        data_sharing_enabled: formData.data_sharing_enabled,
        analytics_enabled: formData.analytics_enabled,
      };
      if (formData.new_password) {
        updateData.current_password = formData.current_password;
        updateData.new_password = formData.new_password;
      }
      await apiClient.updateUserSettings(updateData);

      // If org name changed in Profile section, update org as well (owner/admin only)
      if (section === 'profile' && formData.org_name.trim() && currentOrgId) {
        try {
          await apiClient.updateMyOrganization({ name: formData.org_name.trim() });
        } catch (orgErr: any) {
          // Don't fail the whole save if org rename fails; surface best-effort message.
          setError((orgErr.response?.data?.detail || orgErr.message || 'Failed to update organization name') as string);
        }
      }
      setSuccess('Settings updated successfully.');
      setFormData((prev) => ({
        ...prev,
        current_password: '',
        new_password: '',
        confirm_password: '',
      }));
      await loadSettings();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-3 text-gray-600 dark:text-gray-400">Loading settings...</p>
        </div>
      </div>
    );
  }

  const visibleSidebarItems = SIDEBAR_ITEMS.filter(
    (item) => !item.adminOnly || isAdminOrOwner
  );

  return (
    <div className="flex flex-col sm:flex-row gap-6 min-h-0 min-w-0">
      {/* Sidebar */}
      <aside className="flex-shrink-0 w-full sm:w-56 lg:w-64">
        <nav className="glass-card p-2 space-y-0.5">
          {visibleSidebarItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSection(item.id);
                if (item.id === 'integrations') {
                  void router.replace(
                    { pathname: '/', query: { tab: 'settings', section: 'integrations' } },
                    undefined,
                    { shallow: true }
                  );
                } else if (router.query.section) {
                  void router.replace({ pathname: '/', query: { tab: 'settings' } }, undefined, {
                    shallow: true,
                  });
                }
              }}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                section === item.id
                  ? 'bg-white/20 dark:bg-white/10 text-gray-900 dark:text-gray-100'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white/10 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {item.label}
            </button>
          ))}
          <div className="border-t border-gray-200/50 dark:border-white/10 mt-1 pt-1">
            <button
              type="button"
              onClick={handleLogout}
              className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-300"
            >
              Log out
            </button>
          </div>
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {section === 'integrations' && isAdminOrOwner ? (
          <IntegrationsPanel />
        ) : (
        <div className="glass-card p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
            </div>
          )}

          {section === 'appearance' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Appearance</h2>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Dark Mode</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Switch between light and dark theme</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={theme === 'dark'}
                    onChange={toggleTheme}
                    className="sr-only peer"
                    aria-label="Toggle dark mode"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500" />
                </label>
              </div>
            </div>
          )}

          {section === 'accounts' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Accounts</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Switch between organizations you belong to.</p>
              {organizations.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">No other organizations.</p>
              ) : (
                <ul className="space-y-1">
                  {organizations.map((org) => {
                    const isCurrent = currentOrgId != null && String(org.id) === String(currentOrgId);
                    const isSwitching = switchingOrgId === org.id;
                    const isLeaving = leavingOrgId === org.id;
                    return (
                      <li key={org.id}>
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => handleSwitchOrg(org.id)}
                            disabled={isCurrent || isSwitching}
                            className={`flex-1 text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                              isCurrent
                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 cursor-default'
                                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50'
                            } disabled:opacity-70`}
                          >
                            <span className="flex items-center justify-between">
                              <span>
                                {org.name}
                                {org.is_primary && (
                                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(primary)</span>
                                )}
                                {isCurrent && (
                                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-400">Current</span>
                                )}
                              </span>
                              {isSwitching && (
                                <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                              )}
                            </span>
                          </button>
                          {!org.is_primary && (
                            <button
                              type="button"
                              onClick={() => handleLeaveOrg(org.id)}
                              disabled={isCurrent || isLeaving}
                              className="text-xs px-3 py-2 rounded-md border border-red-300/60 text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-60"
                            >
                              {isLeaving ? 'Leaving…' : 'Leave'}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {section === 'team' && isAdminOrOwner && (
            <UsersPanel />
          )}

          {section === 'profile' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Profile</h2>
              {currentOrgId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={formData.org_name}
                    onChange={(e) => setFormData({ ...formData, org_name: e.target.value })}
                    className="w-full max-w-md px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Your organization name"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Owners and admins can rename their organization for all members.
                  </p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full max-w-md px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="max-w-md rounded-lg border border-gray-200 dark:border-white/10 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Google account</h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Connect the Google account that uses the same email as SweepOS. Existing password login keeps working.
                    </p>
                  </div>
                  {!googleOAuthAvailable ? (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Google sign-in is not configured on this server. Set{' '}
                      <code className="text-[11px]">GOOGLE_OAUTH_CLIENT_ID</code> /{' '}
                      <code className="text-[11px]">GOOGLE_CLIENT_ID</code>, secret, and{' '}
                      <code className="text-[11px]">GOOGLE_OAUTH_REDIRECT_URI</code> (local:{' '}
                      <code className="text-[11px]">http://localhost:8000/auth/google/callback</code>), then restart the backend.
                    </p>
                  ) : googleConnected ? (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        Connected{googleEmail ? ` as ${googleEmail}` : ''}
                      </p>
                      <button
                        type="button"
                        disabled={googleBusy || !hasPassword}
                        onClick={handleDisconnectGoogle}
                        title={!hasPassword ? 'Set a password before disconnecting Google' : undefined}
                        className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
                      >
                        {googleBusy ? 'Working…' : 'Disconnect'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={googleBusy}
                      onClick={handleConnectGoogle}
                      className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
                        <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.6S8.9 6.2 12 6.2c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 3.7 14.6 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12S6.9 21.2 12 21.2c5.2 0 8.6-3.6 8.6-8.7 0-.6-.1-1-.2-1.5H12z"/>
                      </svg>
                      {googleBusy ? 'Redirecting…' : 'Connect Google'}
                    </button>
                  )}
                  {googleConnected && !hasPassword && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Set a password below before disconnecting Google so you can still sign in.
                    </p>
                  )}
                </div>

              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  {hasPassword ? 'Change Password' : 'Set a Password'}
                </h3>
                <div className="space-y-3 max-w-md">
                  {hasPassword && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Current Password</label>
                    <input
                      type="password"
                      value={formData.current_password}
                      onChange={(e) => setFormData({ ...formData, current_password: e.target.value })}
                      className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="Leave blank to keep current password"
                    />
                  </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      {hasPassword ? 'New Password' : 'Password'}
                    </label>
                    <input
                      type="password"
                      value={formData.new_password}
                      onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                      className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder={hasPassword ? 'Leave blank to keep current password' : 'Set a password for email login'}
                      minLength={8}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Confirm New Password</label>
                    <input
                      type="password"
                      value={formData.confirm_password}
                      onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                      className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="Leave blank to keep current password"
                      minLength={8}
                    />
                  </div>
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {section === 'privacy' && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Privacy & Data Settings</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Data Sharing</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Allow sharing of anonymized data for product improvement</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.data_sharing_enabled}
                      onChange={(e) => setFormData({ ...formData, data_sharing_enabled: e.target.checked })}
                      className="sr-only peer"
                      aria-label="Toggle data sharing"
                    />
                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500" />
                  </label>
                </div>
                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Analytics</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Enable usage analytics to improve your experience</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.analytics_enabled}
                      onChange={(e) => setFormData({ ...formData, analytics_enabled: e.target.checked })}
                      className="sr-only peer"
                      aria-label="Toggle analytics"
                    />
                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500" />
                  </label>
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

        </div>
        )}
      </div>
    </div>
  );
}
