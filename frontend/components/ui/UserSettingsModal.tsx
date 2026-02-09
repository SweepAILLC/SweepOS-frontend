import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '@/lib/api';
import { useTheme } from '@/contexts/ThemeContext';

interface OrgOption {
  id: string;
  name: string;
  is_primary: boolean;
}

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [switchingOrgId, setSwitchingOrgId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: '',
    current_password: '',
    new_password: '',
    confirm_password: '',
    data_sharing_enabled: true,
    analytics_enabled: true
  });

  useEffect(() => {
    if (isOpen) {
      loadSettings();
    }
  }, [isOpen]);

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
        analytics_enabled: settings.analytics_enabled ?? true
      });
      const orgId = user?.org_id != null ? String(user.org_id) : null;
      setCurrentOrgId(orgId);
      if (settings.email) {
        const orgs = await apiClient.getUserOrganizations(settings.email);
        setOrganizations(Array.isArray(orgs) ? orgs.map((o: any) => ({
          id: String(o.id),
          name: o.name || 'Unnamed',
          is_primary: !!o.is_primary,
        })) : []);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchOrg = async (orgId: string) => {
    if (orgId === currentOrgId) return;
    try {
      setSwitchingOrgId(orgId);
      setError(null);
      await apiClient.switchOrganization(orgId);
      onClose();
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to switch organization');
    } finally {
      setSwitchingOrgId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validate password change
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
        analytics_enabled: formData.analytics_enabled
      };

      if (formData.new_password) {
        updateData.current_password = formData.current_password;
        updateData.new_password = formData.new_password;
      }

      await apiClient.updateUserSettings(updateData);
      setSuccess('Settings updated successfully!');
      
      // Clear password fields
      setFormData({
        ...formData,
        current_password: '',
        new_password: '',
        confirm_password: ''
      });

      // Reload settings to get updated email
      await loadSettings();
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 z-[90] transition-opacity bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75" onClick={onClose}></div>

        <div className="relative z-[100] inline-block align-bottom bg-white dark:glass-card text-left overflow-hidden transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full rounded-lg shadow-lg border border-gray-200 dark:border-white/10">
          <div className="px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">User Settings</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-400 dark:hover:text-gray-300"
                aria-label="Close dialog"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md">
                <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100"></div>
                <p className="mt-2 text-gray-600 dark:text-gray-400">Loading settings...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Appearance Settings */}
                <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Appearance</h4>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Dark Mode
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Switch between light and dark theme
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={theme === 'dark'}
                        onChange={toggleTheme}
                        className="sr-only peer"
                        aria-label="Toggle dark mode"
                      />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500"></div>
                    </label>
                  </div>
                </div>

                {/* Accounts dropdown */}
                <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <button
                    type="button"
                    onClick={() => setAccountsOpen((o) => !o)}
                    className="flex items-center justify-between w-full text-left py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-expanded={accountsOpen}
                  >
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Accounts</h4>
                    <svg className={`w-5 h-5 text-gray-500 transition-transform ${accountsOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {accountsOpen && (
                    <div className="mt-3 space-y-1 pl-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Switch between organizations you belong to.</p>
                      {organizations.length === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">No other organizations.</p>
                      ) : (
                        <ul className="space-y-0.5">
                          {organizations.map((org) => {
                            const isCurrent = currentOrgId != null && String(org.id) === String(currentOrgId);
                            const isSwitching = switchingOrgId === org.id;
                            return (
                              <li key={org.id}>
                                <button
                                  type="button"
                                  onClick={() => handleSwitchOrg(org.id)}
                                  disabled={isCurrent || isSwitching}
                                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
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
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Profile dropdown */}
                <div className="border-b border-gray-200 dark:border-gray-700 pb-4">
                  <button
                    type="button"
                    onClick={() => setProfileOpen((o) => !o)}
                    className="flex items-center justify-between w-full text-left py-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-expanded={profileOpen}
                  >
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">Profile</h4>
                    <svg className={`w-5 h-5 text-gray-500 transition-transform ${profileOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {profileOpen && (
                    <div className="mt-3 space-y-3 pl-0">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Change Password</h4>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Current Password</label>
                            <input
                              type="password"
                              value={formData.current_password}
                              onChange={(e) => setFormData({ ...formData, current_password: e.target.value })}
                              className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              placeholder="Leave blank to keep current password"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">New Password</label>
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
                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">Confirm New Password</label>
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
                    </div>
                  )}
                </div>

                {/* Privacy Settings */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Privacy & Data Settings</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Data Sharing
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Allow sharing of anonymized data for product improvement
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.data_sharing_enabled}
                          onChange={(e) => setFormData({ ...formData, data_sharing_enabled: e.target.checked })}
                          className="sr-only peer"
                          aria-label="Toggle data sharing"
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Analytics
                        </label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Enable usage analytics to improve your experience
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.analytics_enabled}
                          onChange={(e) => setFormData({ ...formData, analytics_enabled: e.target.checked })}
                          className="sr-only peer"
                          aria-label="Toggle analytics"
                        />
                        <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 dark:peer-checked:bg-blue-500"></div>
                      </label>
                    </div>

                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={onClose}
                    className="glass-button-secondary px-4 py-2 text-sm font-medium rounded-md hover:bg-white/20"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

