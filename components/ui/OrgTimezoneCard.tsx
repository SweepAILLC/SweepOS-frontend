'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

interface OrgTimezoneCardProps {
  orgId: string;
}

// A short, curated list — not the full ~400-zone IANA database — covering the
// regions this app's coaching-business customers are actually based in.
const TIMEZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
  { value: 'America/Chicago', label: 'Central Time (US & Canada)' },
  { value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
  { value: 'America/Anchorage', label: 'Alaska Time' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
  { value: 'America/Sao_Paulo', label: 'São Paulo' },
  { value: 'Europe/London', label: 'London' },
  { value: 'Europe/Paris', label: 'Paris / Berlin / Madrid' },
  { value: 'Europe/Athens', label: 'Athens / Helsinki' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg' },
  { value: 'Asia/Dubai', label: 'Dubai' },
  { value: 'Asia/Kolkata', label: 'Mumbai / New Delhi' },
  { value: 'Asia/Singapore', label: 'Singapore' },
  { value: 'Asia/Shanghai', label: 'Shanghai / Hong Kong' },
  { value: 'Asia/Tokyo', label: 'Tokyo' },
  { value: 'Australia/Sydney', label: 'Sydney' },
  { value: 'Pacific/Auckland', label: 'Auckland' },
];

/**
 * Org-level timezone used to localize notification timestamps — currently just
 * the Discord "New booking" trigger's "When" field, shown as DD/MM/YYYY HH:MM
 * in this timezone instead of raw UTC.
 */
export default function OrgTimezoneCard({ orgId }: OrgTimezoneCardProps) {
  const [timezone, setTimezone] = useState('UTC');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await apiClient.getOrgTimezone(orgId);
        if (!cancelled) setTimezone(data.timezone || 'UTC');
      } catch (err: any) {
        if (!cancelled) setError(err.response?.data?.detail || err.message || 'Failed to load timezone');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const handleChange = async (next: string) => {
    const previous = timezone;
    setTimezone(next);
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.setOrgTimezone(orgId, next);
      setSuccess('Timezone saved');
    } catch (err: any) {
      setTimezone(previous);
      setError(err.response?.data?.detail || err.message || 'Failed to save timezone');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-4 text-sm text-gray-500 dark:text-gray-400">Loading timezone…</div>;
  }

  return (
    <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-700">
      <div>
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Notification timezone</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Booking times in Discord notifications (e.g. &quot;New booking&quot;) are shown as
          DD/MM/YYYY in this timezone.
        </p>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {success && <p className="text-xs text-emerald-600 dark:text-emerald-400">{success}</p>}
      <select
        value={timezone}
        disabled={saving}
        onChange={(e) => void handleChange(e.target.value)}
        className="w-full max-w-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 disabled:opacity-50"
      >
        {!TIMEZONE_OPTIONS.some((o) => o.value === timezone) && (
          <option value={timezone}>{timezone}</option>
        )}
        {TIMEZONE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
