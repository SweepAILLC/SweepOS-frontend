import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import type { KpiBenchmarks } from '@/types/kpi';
import type { TeamSettings } from '@/types/team';
import KpiBenchmarkSettings from '@/components/kpi/KpiBenchmarkSettings';

/**
 * Targets = the org KPI % bands that color the Organic calendar and drive flags (the
 * Funnels Targets drawer). Schedule = EOD required days, reminder, digest (Settings →
 * Team). Owner/admin edit.
 */

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TeamSettingsView({
  canEdit,
  part,
}: {
  canEdit: boolean;
  /** 'targets' = the Funnels Targets panel; 'schedule' = Settings → Team (EOD & reminders). */
  part: 'targets' | 'schedule';
}) {
  const sub = part;
  const [benchmarks, setBenchmarks] = useState<KpiBenchmarks | null>(null);
  const [settings, setSettings] = useState<TeamSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([apiClient.getTeamSettings(), apiClient.getKpiBenchmarks()]);
      setSettings(s);
      setBenchmarks(b);
    } catch (e) {
      setError(formatApiError(e, 'Failed to load team settings'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (patch: Partial<TeamSettings>, okMsg: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setSettings(await apiClient.putTeamSettings(patch));
      setMessage(okMsg);
    } catch (e) {
      setError(formatApiError(e, 'Failed to save settings'));
    } finally {
      setBusy(false);
    }
  };

  if (!settings) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">{error ?? 'Loading…'}</p>;
  }

  const disabled = !canEdit || busy;
  const toggleWeekday = (d: number) => {
    const set = new Set(settings.eod_required_weekdays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    if (set.size === 0) return;
    void save({ eod_required_weekdays: Array.from(set).sort() }, 'EOD days saved.');
  };
  const toggleChannel = (c: 'discord' | 'email') => {
    const set = new Set(settings.reminder_channels);
    if (set.has(c)) set.delete(c);
    else set.add(c);
    if (set.size === 0) return;
    void save({ reminder_channels: Array.from(set) as TeamSettings['reminder_channels'] }, 'Reminder channels saved.');
  };

  const section = 'glass-card rounded-xl border border-white/10 p-3 sm:p-4 space-y-3';
  const heading = 'text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';

  return (
    <div className="space-y-3">
      {!canEdit ? (
        <p className="text-xs text-gray-600 dark:text-gray-300">Only owners and admins can change team settings.</p>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">{error}</div>
      ) : null}
      {message ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{message}</p> : null}

      {sub === 'targets' ? (
        <>
          <div className={section}>
            <div className={heading}>Org targets</div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Good / okay ranges for daily KPIs (reply %, convo→book %, show %, close %, daily outreach). They color the
              Funnels → Organic calendar and drive bottleneck flags.
            </p>
          </div>
          <KpiBenchmarkSettings initial={benchmarks} onSaved={(saved) => setBenchmarks(saved)} />
        </>
      ) : (
        <>
        <div className={section}>
          <div className={heading}>EOD required days</div>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Setters owe an EOD on these days ({settings.timezone}). Missed days and streaks count only these.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((label, d) => {
              const on = settings.eod_required_weekdays.includes(d);
              return (
                <button
                  key={label}
                  type="button"
                  disabled={disabled}
                  onClick={() => toggleWeekday(d)}
                  aria-pressed={on}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-60 ${
                    on ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-white/10 bg-white/5 text-gray-700 dark:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className={section}>
          <div className={heading}>EOD reminder</div>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            At this time ({settings.timezone}) on a required day, remind every setter who hasn&apos;t submitted — once per
            person per day. Messages go to your real team; it stays off until you turn it on.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                disabled={disabled}
                checked={settings.reminder_enabled}
                onChange={(e) => void save({ reminder_enabled: e.target.checked }, e.target.checked ? 'Reminders on.' : 'Reminders off.')}
              />
              Enabled
            </label>
            <label className="flex items-center gap-1.5">
              Time
              <input
                type="time"
                disabled={disabled}
                value={settings.reminder_local_time}
                onChange={(e) => e.target.value && void save({ reminder_local_time: e.target.value }, 'Reminder time saved.')}
                className="rounded solid-input px-2 py-1 text-sm disabled:opacity-60"
              />
            </label>
            {(['discord', 'email'] as const).map((c) => (
              <label key={c} className="flex items-center gap-1.5 cursor-pointer capitalize">
                <input
                  type="checkbox"
                  className="rounded"
                  disabled={disabled}
                  checked={settings.reminder_channels.includes(c)}
                  onChange={() => toggleChannel(c)}
                />
                {c}
              </label>
            ))}
          </div>
        </div>

        <div className={section}>
          <div className={heading}>Weekly team digest</div>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Every Monday at this time ({settings.timezone}), post last week per person to Discord — activity and EOD
            compliance. Off until you turn it on.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700 dark:text-gray-300">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                className="rounded"
                disabled={disabled}
                checked={settings.digest_enabled}
                onChange={(e) => void save({ digest_enabled: e.target.checked }, e.target.checked ? 'Digest on.' : 'Digest off.')}
              />
              Enabled
            </label>
            <label className="flex items-center gap-1.5">
              Time
              <input
                type="time"
                disabled={disabled}
                value={settings.digest_local_time}
                onChange={(e) => e.target.value && void save({ digest_local_time: e.target.value }, 'Digest time saved.')}
                className="rounded solid-input px-2 py-1 text-sm disabled:opacity-60"
              />
            </label>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
