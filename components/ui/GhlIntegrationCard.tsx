'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';
import type { GhlCalendar, GhlStatus } from '@/types/integration';

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
  const [disconnecting, setDisconnecting] = useState(false);
  const [calendars, setCalendars] = useState<GhlCalendar[]>([]);
  const [calendarsError, setCalendarsError] = useState<string | null>(null);
  const [savingCalendarId, setSavingCalendarId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

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
      await apiClient.connectGhl(apiKey.trim(), locationId.trim());
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
