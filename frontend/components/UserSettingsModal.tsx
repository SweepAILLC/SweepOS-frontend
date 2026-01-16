import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UserSettingsModal({ isOpen, onClose }: UserSettingsModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
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
      const settings = await apiClient.getUserSettings();
      setFormData({
        email: settings.email || '',
        current_password: '',
        new_password: '',
        confirm_password: '',
        data_sharing_enabled: settings.data_sharing_enabled ?? true,
        analytics_enabled: settings.analytics_enabled ?? true
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose}></div>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">User Settings</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
                <p className="text-sm text-green-800">{success}</p>
              </div>
            )}

            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-600">Loading settings...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                {/* Password Change Section */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Change Password</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        value={formData.current_password}
                        onChange={(e) => setFormData({ ...formData, current_password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Leave blank to keep current password"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={formData.new_password}
                        onChange={(e) => setFormData({ ...formData, new_password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Leave blank to keep current password"
                        minLength={8}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={formData.confirm_password}
                        onChange={(e) => setFormData({ ...formData, confirm_password: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Leave blank to keep current password"
                        minLength={8}
                      />
                    </div>
                  </div>
                </div>

                {/* Privacy Settings */}
                <div className="border-t border-gray-200 pt-4">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Privacy & Data Settings</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-gray-700">
                          Data Sharing
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          Allow sharing of anonymized data for product improvement
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.data_sharing_enabled}
                          onChange={(e) => setFormData({ ...formData, data_sharing_enabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <label className="text-sm font-medium text-gray-700">
                          Analytics
                        </label>
                        <p className="text-xs text-gray-500 mt-1">
                          Enable usage analytics to improve your experience
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.analytics_enabled}
                          onChange={(e) => setFormData({ ...formData, analytics_enabled: e.target.checked })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>

                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
}

