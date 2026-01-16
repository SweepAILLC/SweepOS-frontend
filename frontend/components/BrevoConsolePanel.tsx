import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { BrevoStatus } from '@/types/integration';

export default function BrevoConsolePanel() {
  const [status, setStatus] = useState<BrevoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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
    try {
      const data = await apiClient.getBrevoStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to load Brevo status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const response = await apiClient.startBrevoOAuth();
      // Redirect to Brevo OAuth page (same window, so callback can redirect back)
      window.location.href = response.redirect_url;
    } catch (error: any) {
      console.error('Failed to start Brevo OAuth:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to start Brevo connection. Please check your configuration.';
      alert(`Brevo OAuth Error: ${errorMessage}\n\nPlease check:\n1. BREVO_REDIRECT_URI in .env includes the full callback path (e.g., /api/oauth/brevo/callback)\n2. BREVO_CLIENT_ID is set correctly\n3. Backend server has been restarted after .env changes`);
      setConnecting(false);
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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-gray-500">Loading Brevo status...</div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Brevo Console</h2>

      {status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-3 w-3 bg-green-400 rounded-full"></div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">Connected</p>
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
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              Open Brevo Dashboard
            </a>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="h-3 w-3 bg-gray-400 rounded-full"></div>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-900">Not Connected</p>
            </div>
          </div>

          {status?.message && (
            <p className="text-sm text-gray-600">{status.message}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
          >
            {connecting ? 'Connecting...' : 'Install Brevo'}
          </button>
        </div>
      )}
    </div>
  );
}

