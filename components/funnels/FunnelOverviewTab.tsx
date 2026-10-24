import { useState } from 'react';
import { FunnelWithSteps } from '@/types/funnel';
import GhlFunnelSettings from '@/components/funnels/GhlFunnelSettings';
import { apiClient } from '@/lib/api';

interface FunnelOverviewTabProps {
  funnel: FunnelWithSteps;
  onReload: () => void;
}

const ENV_OPTIONS = ['production', 'staging', 'development'];

export default function FunnelOverviewTab({ funnel, onReload }: FunnelOverviewTabProps) {
  const [copied, setCopied] = useState(false);
  const [editingSettings, setEditingSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [domainInput, setDomainInput] = useState(funnel.domain || '');
  const [envInput, setEnvInput] = useState(funnel.env || '');

  const copyFunnelId = () => {
    navigator.clipboard.writeText(funnel.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditingSettings = () => {
    setDomainInput(funnel.domain || '');
    setEnvInput(funnel.env || '');
    setSettingsError(null);
    setEditingSettings(true);
  };

  const cancelEditingSettings = () => {
    setEditingSettings(false);
    setSettingsError(null);
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    setSettingsError(null);
    try {
      await apiClient.updateFunnel(funnel.id, {
        domain: domainInput.trim() || null,
        env: envInput || null,
      });
      setEditingSettings(false);
      onReload();
    } catch (err: any) {
      setSettingsError(err?.message || 'Failed to update funnel settings');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      <GhlFunnelSettings funnel={funnel} onReload={onReload} />

      {/* Funnel ID Copy Widget */}
      <div className="glass-card p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Funnel ID</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
          Copy this ID to use in your funnel tracking code:
        </p>
        <div className="flex items-center space-x-2">
          <code className="flex-1 bg-white/10 px-4 py-2 rounded text-sm font-mono">
            {funnel.id}
          </code>
          <button
            onClick={copyFunnelId}
            className="glass-button neon-glow px-4 py-2 rounded"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Domain + Stage settings — editable any time, including after the funnel is live.
          Changing these only affects future event matching; past leads/events keep their funnel_id. */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Domain & Stage</h3>
          {!editingSettings && (
            <button
              onClick={startEditingSettings}
              className="glass-button px-3 py-1.5 rounded text-sm"
            >
              Edit
            </button>
          )}
        </div>

        {editingSettings ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Domain
              </label>
              <input
                type="text"
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                placeholder="e.g., example.com"
                className="w-full px-3 py-2 border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 rounded-md text-gray-900 dark:text-gray-100"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Used to auto-match new incoming events to this funnel. Switching domains (e.g. to run tests
                on a staging URL) won't affect leads or events already recorded.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Stage
              </label>
              <select
                value={envInput}
                onChange={(e) => setEnvInput(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 rounded-md text-gray-900 dark:text-gray-100"
              >
                <option value="">Not set</option>
                {ENV_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt.charAt(0).toUpperCase() + opt.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            {settingsError && (
              <p className="text-sm text-red-500">{settingsError}</p>
            )}
            <div className="flex space-x-2">
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="glass-button neon-glow px-4 py-2 rounded disabled:opacity-50"
              >
                {savingSettings ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={cancelEditingSettings}
                disabled={savingSettings}
                className="px-4 py-2 rounded border border-gray-300 dark:border-white/15 text-gray-700 dark:text-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-panel rounded-lg p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Domain</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {funnel.domain || 'Not set'}
              </p>
            </div>
            <div className="glass-panel rounded-lg p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Stage</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 capitalize">
                {funnel.env || 'Not set'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Steps</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {funnel.steps?.length || 0}
          </p>
        </div>
        <div className="glass-panel rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Created</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {new Date(funnel.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>

    </div>
  );
}

