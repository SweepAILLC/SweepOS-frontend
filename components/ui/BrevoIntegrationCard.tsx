'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';
import type { BrevoStatus } from '@/types/integration';

interface BrevoIntegrationCardProps {
  canManage: boolean;
  /** When true, omit outer glass card (e.g. inside Integrations square modal). */
  embedded?: boolean;
  /** Called after status refresh (connect / disconnect / load) so parent can update grid badges. */
  onConnectionChange?: () => void;
}

/**
 * Org-level Brevo (email) connection: API key connect/disconnect and status.
 * Used from Integrations; sending happens from Terminal client management.
 */
export default function BrevoIntegrationCard({
  canManage,
  embedded = false,
  onConnectionChange,
}: BrevoIntegrationCardProps) {
  const [status, setStatus] = useState<BrevoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getBrevoStatus();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
      onConnectionChangeRef.current?.();
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (params.get('brevo_connected') === 'true') {
      setTimeout(() => {
        void loadStatus();
        window.history.replaceState({}, '', window.location.pathname);
      }, 500);
    } else if (params.get('brevo_error')) {
      const errorMsg = params.get('error_description') || 'Failed to connect Brevo';
      alert(`Brevo connection error: ${errorMsg}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadStatus]);

  const handleConnect = async () => {
    if (!apiKey?.trim()) {
      alert('Please enter your Brevo API key');
      return;
    }
    setConnecting(true);
    try {
      await apiClient.connectBrevoWithApiKey(apiKey.trim());
      setApiKey('');
      await loadStatus();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      const msg = err?.response?.data?.detail || err?.message || 'Failed to connect Brevo.';
      alert(`Brevo: ${msg}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Brevo for this organization?')) return;
    setDisconnecting(true);
    try {
      await apiClient.disconnectBrevo();
      await loadStatus();
    } catch {
      alert('Failed to disconnect Brevo.');
    } finally {
      setDisconnecting(false);
    }
  };

  const shell = embedded
    ? 'flex flex-col min-h-0 h-full space-y-4 text-left'
    : 'glass-card p-6 space-y-4';

  if (loading) {
    return (
      <div className={embedded ? 'py-2' : 'glass-card p-6'}>
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading Brevo status…</p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Email (Brevo)</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Same connection as the former Email tab: add your Brevo API key (or disconnect) for this organization. Once
          connected, you can send from Terminal (email all or per pipeline column), failed-payment recovery, and each
          client&apos;s profile.
        </p>
      </div>

      {status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400 flex-shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Connected</p>
              {status.account_email ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{status.account_email}</p>
              ) : null}
              {status.account_name && status.account_name !== status.account_email ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">{status.account_name}</p>
              ) : null}
            </div>
          </div>
          {status.message ? <p className="text-sm text-gray-600 dark:text-gray-300">{status.message}</p> : null}
          <div className="flex flex-wrap gap-2">
            <a
              href="https://app.brevo.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow"
            >
              Open Brevo
            </a>
            {canManage ? (
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-400 flex-shrink-0" aria-hidden />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Not connected</p>
          </div>
          {status?.message ? <p className="text-sm text-gray-600 dark:text-gray-300">{status.message}</p> : null}
          {canManage ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="integrations-brevo-api-key" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Brevo API key
                </label>
                <input
                  id="integrations-brevo-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Brevo API key"
                  className="mt-1 w-full max-w-md px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  <a
                    href="https://app.brevo.com/settings/keys/api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Brevo → Settings → API Keys
                  </a>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={connecting || !apiKey.trim()}
                className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? 'Connecting…' : 'Connect Brevo'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-200">
              Only admins and owners can connect Brevo. Ask an admin to add the API key for this workspace.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
