import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';
import { clearSessionCaches } from '@/lib/cache';
import { useTheme } from '@/contexts/ThemeContext';
import { useLoading } from '@/contexts/LoadingContext';

type SettingsSection = 'appearance' | 'accounts' | 'profile' | 'privacy';

interface OrgOption {
  id: string;
  name: string;
  is_primary: boolean;
}

const SIDEBAR_ITEMS: { id: SettingsSection; label: string }[] = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'accounts', label: 'Accounts' },
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
      const orgId = user?.org_id != null ? String(user.org_id) : null;
      setCurrentOrgId(orgId);
      const orgEmail = user?.email || settings.email;
      if (orgEmail) {
        const orgs = await apiClient.getUserOrganizations(orgEmail);
        setOrganizations(
          Array.isArray(orgs)
            ? orgs.map((o: any) => ({
                id: String(o.id),
                name: o.name || 'Unnamed',
                is_primary: !!o.is_primary,
              }))
            : []
        );
        if (orgId) {
          const currentOrg = (orgs || []).find((o: any) => String(o.id) === String(orgId));
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

  return (
    <div className="flex flex-col sm:flex-row gap-6 min-h-0 min-w-0">
      {/* Sidebar */}
      <aside className="flex-shrink-0 w-full sm:w-56 lg:w-64">
        <nav className="glass-card p-2 space-y-0.5">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSection(item.id)}
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
              <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Change Password</h3>
                <div className="space-y-3 max-w-md">
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
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">New Password</label>
                    <input
                      type="password"
                      value={formData.new_password}
                      onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                      className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      placeholder="Leave blank to keep current password"
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
      </div>
    </div>
  );
}
