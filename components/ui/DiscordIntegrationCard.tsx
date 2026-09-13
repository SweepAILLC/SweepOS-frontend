'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient } from '@/lib/api';
import type { DiscordStatus, DiscordChannel, DiscordChannelMapping, DiscordEventType } from '@/types/integration';

interface DiscordIntegrationCardProps {
  canManage: boolean;
  /** When true, omit outer glass card (e.g. inside Integrations square modal). */
  embedded?: boolean;
  onConnectionChange?: () => void;
  onConnected?: () => void;
}

/**
 * Org-level Discord connection: OAuth-install the shared Sweep bot into the
 * org's own server, then map event types (EOD form, post-call form, new lead,
 * new booking, new transaction) to specific channels. Sending happens
 * server-side from those wired points.
 */
export default function DiscordIntegrationCard({
  canManage,
  embedded = false,
  onConnectionChange,
  onConnected,
}: DiscordIntegrationCardProps) {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [channels, setChannels] = useState<DiscordChannel[]>([]);
  const [channelsError, setChannelsError] = useState<string | null>(null);
  const [eventTypes, setEventTypes] = useState<DiscordEventType[]>([]);
  const [mappings, setMappings] = useState<DiscordChannelMapping[]>([]);
  const [savingEventType, setSavingEventType] = useState<string | null>(null);
  const [testingEventType, setTestingEventType] = useState<string | null>(null);
  const onConnectionChangeRef = useRef(onConnectionChange);
  onConnectionChangeRef.current = onConnectionChange;

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiClient.getDiscordStatus();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
      onConnectionChangeRef.current?.();
    }
  }, []);

  const loadChannelsAndMappings = useCallback(async () => {
    try {
      const [chData, mapData] = await Promise.all([
        apiClient.listDiscordChannels(),
        apiClient.getDiscordChannelMappings(),
      ]);
      setChannels(chData.channels || []);
      setChannelsError(null);
      setEventTypes(mapData.event_types || []);
      setMappings(mapData.mappings || []);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      setChannelsError(err?.response?.data?.detail || 'Failed to load channels.');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (status?.connected) {
      void loadChannelsAndMappings();
    }
  }, [status?.connected, loadChannelsAndMappings]);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    if (params.get('discord_connected') === 'true') {
      onConnected?.();
      setTimeout(() => {
        void loadStatus();
        window.history.replaceState({}, '', window.location.pathname);
      }, 500);
    } else if (params.get('discord_error')) {
      alert(`Discord connection error: ${params.get('discord_error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadStatus]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const { redirect_url } = await apiClient.startDiscordOAuth();
      window.location.href = redirect_url;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }; message?: string };
      alert(`Discord: ${err?.response?.data?.detail || err?.message || 'Failed to start OAuth.'}`);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Discord for this organization? Channel mappings will be cleared.')) return;
    setDisconnecting(true);
    try {
      await apiClient.disconnectDiscord();
      setChannels([]);
      setMappings([]);
      await loadStatus();
    } catch {
      alert('Failed to disconnect Discord.');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleMappingChange = async (eventType: string, channelId: string) => {
    if (!channelId) return;
    setSavingEventType(eventType);
    try {
      const channel = channels.find((c) => c.id === channelId);
      await apiClient.setDiscordChannelMapping(eventType, channelId, channel?.name);
      await loadChannelsAndMappings();
    } catch {
      alert('Failed to save channel mapping.');
    } finally {
      setSavingEventType(null);
    }
  };

  const handleTest = async (eventType: string) => {
    setTestingEventType(eventType);
    try {
      await apiClient.sendDiscordTest(eventType);
      alert('Test message sent — check the mapped channel.');
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      alert(`Test failed: ${err?.response?.data?.detail || 'unknown error'}`);
    } finally {
      setTestingEventType(null);
    }
  };

  const shell = embedded
    ? 'flex flex-col min-h-0 h-full space-y-4 text-left'
    : 'glass-card p-6 space-y-4';

  if (loading) {
    return (
      <div className={embedded ? 'py-2' : 'glass-card p-6'}>
        <p className="text-sm text-gray-600 dark:text-gray-400">Loading Discord status…</p>
      </div>
    );
  }

  return (
    <div className={shell}>
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Discord</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Install the Sweep bot into your own Discord server, then route EOD form submissions, post-call
          form submissions, new leads, new bookings, and new transactions to specific channels.
        </p>
      </div>

      {!status?.bot_configured ? (
        <p className="text-xs text-amber-700 dark:text-amber-200">
          Discord isn&apos;t configured on the server yet (missing DISCORD_BOT_TOKEN). Ask an admin to finish
          setup in the Discord Developer Portal.
        </p>
      ) : null}

      {status?.connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="h-2.5 w-2.5 rounded-full bg-green-400 flex-shrink-0" aria-hidden />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Connected</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{status.guild_name || status.guild_id}</p>
            </div>
          </div>

          {channelsError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{channelsError}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Channel routing</p>
              {eventTypes.map((et) => {
                const current = mappings.find((m) => m.event_type === et.key);
                return (
                  <div key={et.key} className="flex flex-wrap items-center gap-2">
                    <label className="w-full sm:w-64 text-xs text-gray-600 dark:text-gray-300">{et.label}</label>
                    <select
                      value={current?.channel_id || ''}
                      onChange={(e) => void handleMappingChange(et.key, e.target.value)}
                      disabled={!canManage || savingEventType === et.key}
                      className="glass-input rounded-md px-2 py-1.5 text-sm min-w-[10rem] disabled:opacity-50"
                    >
                      <option value="">Not routed</option>
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>
                          #{c.name}
                        </option>
                      ))}
                    </select>
                    {current ? (
                      <button
                        type="button"
                        onClick={() => void handleTest(et.key)}
                        disabled={testingEventType === et.key}
                        className="text-xs px-2 py-1 rounded glass-button-secondary disabled:opacity-50"
                      >
                        {testingEventType === et.key ? 'Sending…' : 'Send test'}
                      </button>
                    ) : null}
                  </div>
                );
              })}
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
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={connecting || !status?.oauth_configured}
              className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connecting ? 'Redirecting…' : 'Connect Discord'}
            </button>
          ) : (
            <p className="text-xs text-amber-700 dark:text-amber-200">
              Only admins and owners can connect Discord. Ask an admin to install the bot for this workspace.
            </p>
          )}
          {!status?.oauth_configured ? (
            <p className="text-xs text-amber-700 dark:text-amber-200">
              Discord OAuth isn&apos;t configured on the server yet (missing DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET).
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
