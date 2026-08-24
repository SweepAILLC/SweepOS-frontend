'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import ToggleSwitch from '@/components/ui/ToggleSwitch';

const WINDOW_OPTIONS = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
  { value: 240, label: '4 hours' },
];

type FunnelLeadSettings = {
  enabled: boolean;
  window_minutes: number;
  recipient_mode: 'admins' | 'custom';
  recipients: string[];
  include_returning_leads: boolean;
};

interface NotificationSettingsCardProps {
  orgId: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NotificationSettingsCard({ orgId }: NotificationSettingsCardProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [settings, setSettings] = useState<FunnelLeadSettings>({
    enabled: true,
    window_minutes: 15,
    recipient_mode: 'admins',
    recipients: [],
    include_returning_leads: true,
  });
  const [recipientDraft, setRecipientDraft] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.getOrgNotificationSettings(orgId);
        if (cancelled) return;
        setSettings({
          enabled: data.funnel_leads?.enabled ?? true,
          window_minutes: data.funnel_leads?.window_minutes ?? 15,
          recipient_mode: data.funnel_leads?.recipient_mode ?? 'admins',
          recipients: data.funnel_leads?.recipients ?? [],
          include_returning_leads: data.funnel_leads?.include_returning_leads ?? true,
        });
      } catch (err: any) {
        if (!cancelled) {
          setError(err.response?.data?.detail || err.message || 'Failed to load notification settings');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const addRecipient = () => {
    const addr = recipientDraft.trim().toLowerCase();
    if (!addr) return;
    if (!EMAIL_RE.test(addr)) {
      setError('Enter a valid email address');
      return;
    }
    if (settings.recipients.includes(addr)) {
      setRecipientDraft('');
      return;
    }
    setSettings((prev) => ({ ...prev, recipients: [...prev.recipients, addr] }));
    setRecipientDraft('');
    setError(null);
  };

  const removeRecipient = (email: string) => {
    setSettings((prev) => ({
      ...prev,
      recipients: prev.recipients.filter((e) => e !== email),
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      const data = await apiClient.updateOrgNotificationSettings(orgId, {
        funnel_leads: settings,
      });
      setSettings({
        enabled: data.funnel_leads?.enabled ?? settings.enabled,
        window_minutes: data.funnel_leads?.window_minutes ?? settings.window_minutes,
        recipient_mode: data.funnel_leads?.recipient_mode ?? settings.recipient_mode,
        recipients: data.funnel_leads?.recipients ?? settings.recipients,
        include_returning_leads:
          data.funnel_leads?.include_returning_leads ?? settings.include_returning_leads,
      });
      setSuccess('Notification settings saved');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      setError(null);
      setSuccess(null);
      const result = await apiClient.sendTestLeadDigest(orgId);
      if (result.success) {
        setSuccess(result.message || 'Test digest sent');
      } else {
        setError(result.message || 'Failed to send test digest');
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Failed to send test digest');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        Loading notification settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Notifications</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          When funnel leads arrive close together, Sweep batches them into one digest email for your
          team instead of sending one email per lead.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
        </div>
      )}

      <div className="space-y-5">
        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Funnel lead digests</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Email a summary when new leads come in via funnel integrations
            </p>
          </div>
          <ToggleSwitch
            checked={settings.enabled}
            onChange={(checked) => setSettings((prev) => ({ ...prev, enabled: checked }))}
            label="Funnel lead digests"
            tone="emerald"
          />
        </div>

        <div className="flex items-center justify-between py-2">
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Include returning leads</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Also notify when an existing client re-submits a funnel form
            </p>
          </div>
          <ToggleSwitch
            checked={settings.include_returning_leads}
            onChange={(checked) =>
              setSettings((prev) => ({ ...prev, include_returning_leads: checked }))
            }
            label="Include returning leads"
            disabled={!settings.enabled}
            tone="emerald"
          />
        </div>

        <div>
          <label
            htmlFor="digest-window"
            className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-1.5"
          >
            Batching window
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            First lead opens the window; all leads in that period go out in one email
          </p>
          <select
            id="digest-window"
            disabled={!settings.enabled}
            value={settings.window_minutes}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, window_minutes: Number(e.target.value) }))
            }
            className="w-full max-w-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50"
          >
            {WINDOW_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {!WINDOW_OPTIONS.some((o) => o.value === settings.window_minutes) && (
              <option value={settings.window_minutes}>
                {settings.window_minutes} minutes
              </option>
            )}
          </select>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1.5">Recipients</p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="recipient_mode"
                checked={settings.recipient_mode === 'admins'}
                disabled={!settings.enabled}
                onChange={() => setSettings((prev) => ({ ...prev, recipient_mode: 'admins' }))}
              />
              All owners and admins
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="recipient_mode"
                checked={settings.recipient_mode === 'custom'}
                disabled={!settings.enabled}
                onChange={() => setSettings((prev) => ({ ...prev, recipient_mode: 'custom' }))}
              />
              Custom email list
            </label>
          </div>

          {settings.recipient_mode === 'custom' && (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-2">
                {settings.recipients.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 dark:bg-gray-700/60 px-2.5 py-1 text-xs text-gray-800 dark:text-gray-200"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => removeRecipient(email)}
                      className="text-gray-500 hover:text-gray-800 dark:hover:text-gray-100"
                      aria-label={`Remove ${email}`}
                      disabled={!settings.enabled}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {settings.recipients.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    No custom recipients yet — digests will fall back to owners/admins until you add
                    emails.
                  </p>
                )}
              </div>
              <div className="flex gap-2 max-w-md">
                <input
                  type="email"
                  value={recipientDraft}
                  disabled={!settings.enabled}
                  onChange={(e) => setRecipientDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addRecipient();
                    }
                  }}
                  placeholder="name@company.com"
                  className="flex-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={addRecipient}
                  disabled={!settings.enabled}
                  className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || !settings.enabled}
          className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? 'Sending…' : 'Send test email'}
        </button>
      </div>
    </div>
  );
}
