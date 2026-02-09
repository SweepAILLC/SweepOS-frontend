import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { BrevoStatus } from '@/types/integration';
import BrevoDashboard from './brevo/BrevoDashboard';
import { useLoading } from '@/contexts/LoadingContext';

interface BrevoConsolePanelProps {
  userRole?: string; // 'owner' | 'admin' | 'member'
}

export default function BrevoConsolePanel({ userRole = 'member' }: BrevoConsolePanelProps) {
  const { setLoading: setGlobalLoading } = useLoading();
  const [status, setStatus] = useState<BrevoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  // OAuth temporarily disabled - only API key available
  const [apiKey, setApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  
  // Check if user can manage integrations (admin or owner only)
  // Normalize role to lowercase for comparison - be explicit about member check
  const roleLower = String(userRole || 'member').toLowerCase().trim();
  // Explicitly check - only admin and owner can manage, members cannot
  // If role is member or anything other than admin/owner, cannot manage
  const canManageIntegrations = roleLower === 'admin' || roleLower === 'owner';

  useEffect(() => {
    loadStatus();
    
    // Check for OAuth callback parameters in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('brevo_connected') === 'true') {
      // Reload status after successful connection
      setTimeout(() => {
        loadStatus();
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }, 1000);
    } else if (params.get('brevo_error')) {
      const errorMsg = params.get('error_description') || 'Failed to connect Brevo';
      alert(`Brevo connection error: ${errorMsg}`);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const loadStatus = async () => {
    setGlobalLoading(true, 'Loading Brevo dashboard...');
    try {
      const data = await apiClient.getBrevoStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to load Brevo status:', error);
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setGlobalLoading(true, 'Connecting to Brevo...');
    try {
      // OAuth temporarily disabled - only API key connection available
      if (!apiKey || !apiKey.trim()) {
        alert('Please enter your Brevo API key');
        setConnecting(false);
        setGlobalLoading(false);
        return;
      }
      
      const response = await apiClient.connectBrevoWithApiKey(apiKey.trim());
      
      // Clear API key input
      setApiKey('');
      setShowApiKeyInput(false);
      
      // Reload status
      await loadStatus();
    } catch (error: any) {
      console.error('[BREVO] Failed to connect:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to connect Brevo. Please check your configuration.';
      alert(`Brevo Connection Error: ${errorMessage}`);
    } finally {
      setConnecting(false);
      setGlobalLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Brevo account?')) {
      return;
    }
    
    setDisconnecting(true);
    try {
      await apiClient.disconnectBrevo();
      await loadStatus();
    } catch (error) {
      console.error('Failed to disconnect Brevo:', error);
      alert('Failed to disconnect Brevo account.');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="text-gray-500 dark:text-gray-400">Loading Brevo status...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Brevo Console</h2>

        {status?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-3 w-3 bg-green-400 rounded-full"></div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">Connected</p>
                {status.account_email && (
                  <p className="text-sm text-gray-500">{status.account_email}</p>
                )}
                {status.account_name && status.account_name !== status.account_email && (
                  <p className="text-sm text-gray-500">{status.account_name}</p>
                )}
              </div>
            </div>

            {status.message && (
              <p className="text-sm text-gray-600">{status.message}</p>
            )}

            <div className="flex gap-3">
              <a
                href="https://app.brevo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
              >
                Open Brevo Dashboard
              </a>
              {canManageIntegrations ? (
                <button
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
                >
                  {disconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
        <div className="space-y-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-3 w-3 bg-gray-400 rounded-full"></div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">Not Connected</p>
            </div>
          </div>

          {status?.message && (
            <p className="text-sm text-gray-600">{status.message}</p>
          )}

          {/* API Key Connection - OAuth temporarily disabled for deployment */}
          {canManageIntegrations ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="brevo-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Brevo API Key
                </label>
                <input
                  id="brevo-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Brevo API key"
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  onFocus={() => setShowApiKeyInput(true)}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Get your API key from{' '}
                  <a
                    href="https://app.brevo.com/settings/keys/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-500 hover:underline"
                  >
                    Brevo Settings → API Keys
                  </a>
                </p>
              </div>

              <button
                onClick={handleConnect}
                disabled={connecting || !apiKey.trim()}
                className="w-full inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? 'Connecting...' : 'Connect with API Key'}
              </button>
            </div>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Only administrators and owners can connect or disconnect integrations. Please contact an admin to manage Brevo settings.
              </p>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Brevo Dashboard - Only show when connected */}
      {status?.connected && (
        <div className="glass-card p-6">
          <BrevoDashboard />
        </div>
      )}
    </div>
  );
}

