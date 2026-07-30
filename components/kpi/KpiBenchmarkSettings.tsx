import { useEffect, useState } from 'react';
import type { KpiBenchmarks, MetricThreshold } from '@/types/kpi';
import { apiClient } from '@/lib/api';
import { DEFAULT_THRESHOLDS } from '@/lib/kpiBenchmarks';

/**
 * User-facing benchmarks. Each row is a simple "good range":
 * - Below low = weak (red)
 * - Between low and high = okay (amber)
 * - At/above high = strong (green)
 */
const BENCHMARK_ROWS: Array<{
  key: string;
  label: string;
  hint: string;
  unitSuffix: string;
}> = [
  {
    key: 'daily_dm_reachouts',
    label: 'Outreach (outbounds / day)',
    hint: 'Good range: 20–30',
    unitSuffix: '',
  },
  {
    key: 'daily_followups',
    label: 'Follow-ups / day',
    hint: 'Good range: 10–20',
    unitSuffix: '',
  },
  {
    key: 'dm_response_rate',
    label: 'Response rate',
    hint: 'Good range: 3–20%',
    unitSuffix: '%',
  },
  {
    key: 'convo_to_booking_rate',
    label: 'Convo → booking',
    hint: 'Good range: 10–20%',
    unitSuffix: '%',
  },
  {
    key: 'show_up_rate',
    label: 'Show-up rate',
    hint: 'Good range: 70–100%',
    unitSuffix: '%',
  },
  {
    key: 'closing_rate',
    label: 'Close rate',
    hint: 'Good range: 30–60%',
    unitSuffix: '%',
  },
];

interface Props {
  initial?: KpiBenchmarks | null;
  onSaved?: (b: KpiBenchmarks) => void;
}

export default function KpiBenchmarkSettings({ initial, onSaved }: Props) {
  const [thresholds, setThresholds] = useState<Record<string, MetricThreshold>>(
    () => initial?.thresholds || { ...DEFAULT_THRESHOLDS }
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entryLink, setEntryLink] = useState<string>('');

  useEffect(() => {
    if (initial?.thresholds) {
      setThresholds({ ...DEFAULT_THRESHOLDS, ...initial.thresholds });
    }
  }, [initial]);

  useEffect(() => {
    const loadLink = async () => {
      try {
        const res = await apiClient.getKpiEntryLink(false);
        setEntryLink(res.url);
      } catch {
        // ignore
      }
    };
    void loadLink();
  }, []);

  const updateBound = (key: string, bound: 'okay_min' | 'strong_min', raw: string) => {
    setThresholds((prev) => {
      const cur = prev[key] || DEFAULT_THRESHOLDS[key];
      if (!cur) return prev;
      const num = raw === '' ? 0 : Number(raw);
      return {
        ...prev,
        [key]: {
          ...cur,
          [bound]: Number.isNaN(num) ? cur[bound] : num,
        },
      };
    });
  };

  const resetDefaults = () => {
    setThresholds({ ...DEFAULT_THRESHOLDS });
    setMessage('Defaults restored — click Save to keep them.');
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      // Persist only the active benchmark keys (ignore legacy keys).
      const cleaned: Record<string, MetricThreshold> = {};
      for (const row of BENCHMARK_ROWS) {
        cleaned[row.key] = thresholds[row.key] || DEFAULT_THRESHOLDS[row.key];
      }
      const updated = await apiClient.updateKpiBenchmarks({ thresholds: cleaned });
      setThresholds({ ...DEFAULT_THRESHOLDS, ...updated.thresholds });
      setMessage('Saved.');
      onSaved?.(updated);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Save failed';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const regenerateLink = async () => {
    try {
      const res = await apiClient.getKpiEntryLink(true);
      setEntryLink(res.url);
      setMessage('New private link created.');
    } catch {
      setError('Could not create a new link');
    }
  };

  const copyLink = async () => {
    if (!entryLink) return;
    try {
      await navigator.clipboard.writeText(entryLink);
      setMessage('Link copied.');
    } catch {
      setError('Could not copy link');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Your daily targets
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Set a simple good range for each KPI. Below the low number turns red, inside the range
          is amber, and hitting the high number (or above) turns green.
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Below low = needs work
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> In range = okay
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" /> High+ = strong
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {BENCHMARK_ROWS.map((row) => {
          const t = thresholds[row.key] || DEFAULT_THRESHOLDS[row.key];
          if (!t) return null;
          return (
            <div
              key={row.key}
              className="rounded-xl border border-white/10 bg-white/5 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end"
            >
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {row.label}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">{row.hint}</div>
              </div>
              <label className="text-xs text-gray-500">
                Low (okay from)
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="number"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                    value={t.okay_min}
                    onChange={(e) => updateBound(row.key, 'okay_min', e.target.value)}
                  />
                  {row.unitSuffix && (
                    <span className="text-xs text-gray-400">{row.unitSuffix}</span>
                  )}
                </div>
              </label>
              <label className="text-xs text-gray-500">
                High (strong from)
                <div className="mt-1 flex items-center gap-1">
                  <input
                    type="number"
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                    value={t.strong_min}
                    onChange={(e) => updateBound(row.key, 'strong_min', e.target.value)}
                  />
                  {row.unitSuffix && (
                    <span className="text-xs text-gray-400">{row.unitSuffix}</span>
                  )}
                </div>
              </label>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-4">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Private survey link
        </h4>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
          Share this private link so you (or a teammate) can log daily KPIs in a simple form —
          no login needed.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            readOnly
            value={entryLink}
            className="flex-1 min-w-[260px] rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-gray-900 dark:text-gray-100"
          />
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={() => void regenerateLink()}
            className="rounded border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5"
          >
            New link
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
        >
          {saving ? 'Saving…' : 'Save targets'}
        </button>
        <button
          type="button"
          onClick={resetDefaults}
          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-white/5"
        >
          Reset to defaults
        </button>
        {message && (
          <span className="text-sm text-green-600 dark:text-green-300">{message}</span>
        )}
        {error && <span className="text-sm text-red-500">{error}</span>}
      </div>
    </div>
  );
}
