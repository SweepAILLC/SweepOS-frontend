'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';
import type { GhlCalendar, GhlStatus } from '@/types/integration';
import { ghlWebhookUrl, GHL_WEBHOOK_SECRET_HEADER } from '@/lib/funnelTracking';

interface GhlIntegrationCardProps {
  canManage: boolean;
  /** When true, omit outer glass card (e.g. inside Integrations square modal). */
  embedded?: boolean;
  onConnectionChange?: () => void;
}

/**
 * GHL (GoHighLevel) private-integration connection: paste a Private Integration
 * token + location ID (no OAuth redirect), pick which calendars sync bookings
 * into Sweep, and trigger a one-time contact import.
 */
export default function GhlIntegrationCard({
  canManage,
  embedded = false,
  onConnectionChange,
}: GhlIntegrationCardProps) {
  const [status, setStatus] = useState<GhlStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [locationId, setLocationId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  // Scopes the token lacks, reported once by connect (not persisted).
  const [missingScopes, setMissingScopes] = useState<string[]>([]);
  const [disconnecting, setDisconnecting] = useState(false);
  const [calendars, setCalendars] = useState<GhlCalendar[]>([]);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [savingCalendarId, setSavingCalendarId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [rotatingSecret, setRotatingSecret] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  const copyToClipboard = (field: string, value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField((f) => (f === field ? null : f)), 1500);
  };

  const handleRotateWebhookSecret = async () => {
    if (
      status?.webhook_secret_set &&
      !window.confirm(
        'Rotating stops every GHL workflow using the old secret (calendar bookings AND funnel opt-ins) until you paste the new one. Continue?'
      )
    ) {
      return;
    }
    setRotatingSecret(true);
    setSecretError(null);
    try {
      const out = await apiClient.rotateGhlWebhookSecret();
      setWebhookSecret(out.secret);
      setStatus((s) => (s ? { ...s, webhook_secret_set: true } : s));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setSecretError(err?.response?.data?.detail || 'Could not generate a secret.');
    } finally {
      setRotatingSecret(false);
    }
  };

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getGhlStatus();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
      onConnectionChangeRef.current?.();
    }
  }, []);

  const loadCalendars = useCallback(async () => {
    try {
      const data = await apiClient.listGhlCalendars();
      setCalendars(data.calendars || []);
      setCalendarsError(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setCalendarsError(err?.response?.data?.detail || 'Failed to load calendars.');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected) {
      void loadCalendars();
    }
  }, [status?.connected, loadCalendars]);

  const handleConnect = async () => {
    if (!apiKey.trim() || !locationId.trim()) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const connected = await apiClient.connectGhl(apiKey.trim(), locationId.trim());
      setMissingScopes(connected.missing_scopes ?? []);
      setApiKey('');
      await loadStatus();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      setConnectError(err?.response?.data?.detail || err?.message || 'Failed to connect GHL.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect GHL for this organization? Calendar sync settings will be cleared.')) return;
    setDisconnecting(true);
    try {
      await apiClient.disconnectGhl();
      setCalendars([]);
      await loadStatus();
    } catch {
      alert('Failed to disconnect GHL.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggleCalendar = async (calendar: GhlCalendar, enabled: boolean) => {
    setSavingCalendarId(calendar.id);
    try {
      if (enabled) {
        await apiClient.setGhlCalendarSyncSetting(calendar.id, calendar.name, true, calendar.is_sales_call);
      } else {
        await apiClient.deleteGhlCalendarSyncSetting(calendar.id);
      }
      await loadCalendars();
    } catch {
      alert('Failed to update calendar sync setting.');
    } finally {
      setSavingCalendarId(null);
    }
  };

  const handleToggleSalesCall = async (calendar: GhlCalendar, isSalesCall: boolean) => {
    setSavingCalendarId(calendar.id);
    try {
      await apiClient.setGhlCalendarSyncSetting(calendar.id, calendar.name, calendar.enabled, isSalesCall);
      await loadCalendars();
    } catch {
      alert('Failed to update sales-call flag.');
    } finally {
      setSavingCalendarId(null);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await apiClient.syncGhlContacts();
      setSyncMessage(result.message || (result.started ? 'Sync started.' : 'Sync not started.'));
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setSyncMessage(err?.response?.data?.detail || 'Failed to start sync.');
    } finally {
      setSyncing(false);
    }
  };

  const shell = embedded ? 'flex flex-col min-h-0 h-full space-y-4 text-left' : 'glass-card p-6 space-y-4';

  if (loading) {
    return (
      <div className={embedded ? 'py-2' : 'glass-card p-6'}>
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading GHL status…</p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">GoHighLevel (GHL)</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Connect a GHL Private Integration token to sync contacts and calendar bookings into Sweep.
        </p>
      </div>

      {status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400 flex-shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Connected</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Location {status.location_id}
                {status.last_sync_at ? ` · last synced ${new Date(status.last_sync_at).toLocaleString()}` : ''}
              </p>
            </div>
          </div>

          {missingScopes.length ? (
            <p className="rounded-md bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="alert">
              Connected, but the private integration is missing these scopes: {missingScopes.join(', ')}. Add them in
              GoHighLevel (Settings → Private Integrations), then reconnect so every feature works.
            </p>
          ) : null}

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleSyncNow()}
              disabled={syncing}
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md glass-button-secondary hover:bg-white/20 disabled:opacity-50"
            >
              {syncing ? 'Starting sync…' : 'Sync contacts now'}
            </button>
            {syncMessage ? <p className="text-xs text-gray-500 dark:text-gray-400">{syncMessage}</p> : null}
          </div>

          {calendarsError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{calendarsError}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Calendars to sync</p>
              {calendars.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">No calendars found in this GHL location.</p>
              ) : (
                calendars.map((cal) => (
                  <div key={cal.id} className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={cal.enabled}
                        disabled={!canManage || savingCalendarId === cal.id}
                        onChange={(e) => void handleToggleCalendar(cal, e.target.checked)}
                      />
                      {cal.name || cal.id}
                    </label>
                    {cal.enabled ? (
                      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <input
                          type="checkbox"
                          checked={cal.is_sales_call}
                          disabled={!canManage || savingCalendarId === cal.id}
                          onChange={(e) => void handleToggleSalesCall(cal, e.target.checked)}
                        />
                        Sales call
                      </label>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          )}

          {status.org_id ? (
            <div className="space-y-2 rounded-md border border-white/10 p-3">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Calendar bookings webhook</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                GHL private integrations can&apos;t push webhooks natively, so appointment sync needs a Workflow
                built in GHL. This is separate from the funnel opt-in webhook on each funnel&apos;s setup page — build
                it once here for calendar bookings.
              </p>
              <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-700 dark:text-gray-200">
                <li>In GoHighLevel open <span className="font-medium">Automation → Workflows</span> and create a workflow.</li>
                <li>
                  Trigger: <span className="font-medium">Appointment Created / Updated / Cancelled</span>, filtered
                  to the calendars enabled above.
                </li>
                <li>Action: <span className="font-medium">Webhook</span>, method POST, with the URL and header below.</li>
                <li>Save and publish the workflow.</li>
              </ol>
              <div className="flex items-center gap-2 min-w-0">
                <code className="flex-1 min-w-0 truncate rounded bg-black/5 dark:bg-white/5 px-2 py-1 text-xs font-mono text-gray-900 dark:text-gray-100">
                  {ghlWebhookUrl(status.org_id)}
                </code>
                <button
                  type="button"
                  onClick={() => copyToClipboard('url', ghlWebhookUrl(status.org_id as string))}
                  className="shrink-0 px-2.5 py-1 text-xs rounded-md glass-button-secondary hover:bg-white/20"
                >
                  {copiedField === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="space-y-1 min-w-0">
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                  Header (only if a secret is set): {GHL_WEBHOOK_SECRET_HEADER}
                </span>
                <div className="flex items-center gap-2 min-w-0">
                  {webhookSecret ? (
                    <>
                      <code className="flex-1 min-w-0 truncate rounded bg-amber-50 dark:bg-amber-900/30 px-2 py-1 text-xs font-mono text-gray-900 dark:text-gray-100">
                        {webhookSecret}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyToClipboard('secret', webhookSecret)}
                        className="shrink-0 px-2.5 py-1 text-xs rounded-md glass-button-secondary hover:bg-white/20"
                      >
                        {copiedField === 'secret' ? 'Copied' : 'Copy'}
                      </button>
                    </>
                  ) : (
                    <span className="flex-1 text-xs text-gray-700 dark:text-gray-200">
                      {status.webhook_secret_set
                        ? 'Secret set (hidden) — shared with funnel opt-in webhooks for this org.'
                        : 'No secret yet. Unset secret warns but still accepts the webhook.'}
                    </span>
                  )}
                  {canManage ? (
                    <button
                      type="button"
                      onClick={() => void handleRotateWebhookSecret()}
                      disabled={rotatingSecret}
                      className="shrink-0 px-2.5 py-1 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      {rotatingSecret ? 'Generating…' : status.webhook_secret_set ? 'Rotate' : 'Generate secret'}
                    </button>
                  ) : null}
                </div>
              </div>
              {webhookSecret ? (
                <p className="text-[11px] text-amber-700 dark:text-amber-300">Copy it now. Sweep won&apos;t show this secret again.</p>
              ) : null}
              {secretError ? <p className="text-[11px] text-red-600 dark:text-red-400">{secretError}</p> : null}
            </div>
          ) : null}

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
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-400 flex-shrink-0" aria-hidden />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Not connected</p>
          </div>
          {canManage ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Private integration token
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="pit-..."
                  className="glass-input w-full rounded-md px-3 py-2 text-sm"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Location ID</label>
                <input
                  type="text"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  placeholder="Sub-account location ID"
                  className="glass-input w-full rounded-md px-3 py-2 text-sm"
                  autoComplete="off"
                />
              </div>
              {connectError ? <p className="text-sm text-red-600 dark:text-red-400">{connectError}</p> : null}
              <button
                type="button"
                onClick={() => void handleConnect()}
                disabled={connecting || !apiKey.trim() || !locationId.trim()}
                className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {connecting ? 'Connecting…' : 'Connect GHL'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-200">
              Only admins and owners can connect GHL. Ask an admin to set this up for this workspace.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
