'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api';
import FathomSyncSection from '@/components/ui/FathomSyncSection';
import { useLoading } from '@/contexts/LoadingContext';

export default function IntegrationsPanel() {
  const { setLoading: setGlobalLoading } = useLoading();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fathomApiKey, setFathomApiKey] = useState('');
  const [canEditFathom, setCanEditFathom] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [settings, user] = await Promise.all([
        apiClient.getUserSettings(),
        apiClient.getCurrentUser(),
      ]);
      setFathomApiKey(typeof settings?.fathom_api_key === 'string' ? settings.fathom_api_key : '');
      const role = String(user?.role || 'member').toLowerCase().trim();
      setCanEditFathom(role === 'admin' || role === 'owner');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Failed to load integrations';
      setError(String(msg));
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  }, [setGlobalLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    try {
      setSaving(true);
      await apiClient.updateUserSettings({
        fathom_api_key: fathomApiKey || undefined,
      });
      setSuccess('Integration settings saved.');
      await load();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Failed to save';
      setError(String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-3 text-gray-600 dark:text-gray-400">Loading integrations…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full px-1 pb-12 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Integrations</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Connect third-party tools for the <strong>current organization</strong> (switch org under Settings → Accounts).
          Fathom keys are stored per organization.
        </p>
      </div>

      {error && (
        <div className="glass-card border border-red-500/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="glass-card border border-green-500/30 text-green-800 dark:text-green-200 px-4 py-3 rounded-xl text-sm">
          {success}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Fathom</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Sales call recordings, transcripts, and Call Library reports. Only admins and owners can add or change
            the API key.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fathom API key</label>
          <input
            type="password"
            value={fathomApiKey}
            onChange={(e) => setFathomApiKey(e.target.value)}
            placeholder={canEditFathom ? 'Enter your Fathom API key' : '—'}
            disabled={!canEditFathom}
            className="w-full max-w-md px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono placeholder-gray-400 dark:placeholder-gray-500 disabled:opacity-60"
            autoComplete="off"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            <a
              href="https://app.usefathom.com/settings/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Get your API key
            </a>{' '}
            from Fathom → Settings → API.
          </p>
          {!canEditFathom && (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-200">
              Ask an organization admin or owner to configure Fathom for this workspace.
            </p>
          )}
        </div>

        <FathomSyncSection variant="panel" />

        {canEditFathom && (
          <button
            type="submit"
            disabled={saving}
            className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save integration settings'}
          </button>
        )}
      </form>
    </div>
  );
}
