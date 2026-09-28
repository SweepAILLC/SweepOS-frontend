import { useEffect, useMemo, useState } from 'react';
import type { KpiBookableClient } from '@/types/kpi';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';

interface Props {
  entryDate: string;
  repUserId: string | null | undefined;
  initialSelectedIds: string[];
  onClose: () => void;
  onSaved: (clientIds: string[]) => void;
  /** Public EOD form (no session) — routes through the token-scoped endpoints instead. */
  publicToken?: string;
}

/**
 * EOD setter picker: tag which specific booked clients this rep's calls_booked
 * count for the day refers to. The claim later prefills setter_user_id on that
 * client's close event (Close Survey / auto-close) — not required to fill in,
 * degrades gracefully when skipped.
 */
export default function KpiSetterBookedClientsModal({
  entryDate,
  repUserId,
  initialSelectedIds,
  onClose,
  onSaved,
  publicToken,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<KpiBookableClient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelectedIds));
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const request = publicToken
      ? apiClient.getPublicKpiBookableClients(publicToken, entryDate)
      : apiClient.getKpiBookableClients(entryDate);
    request
      .then((res) => {
        if (!cancelled) setClients(res.clients);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(formatApiError(err, 'Could not load booked clients'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryDate, publicToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.client_name.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q),
    );
  }, [clients, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const ids = Array.from(selected);
      if (publicToken) {
        await apiClient.upsertPublicKpiEntry(
          publicToken,
          entryDate,
          { setter_booked_client_ids: ids },
          repUserId || undefined,
        );
      } else {
        await apiClient.upsertKpiEntry(
          entryDate,
          { setter_booked_client_ids: ids },
          repUserId || undefined,
        );
      }
      onSaved(ids);
      onClose();
    } catch (err: unknown) {
      setError(formatApiError(err, 'Could not save claimed clients'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 left-0 lg:left-[var(--app-sidebar-width,14rem)] z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-500/75 dark:bg-gray-900/75" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl p-4 max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Tag booked clients — {entryDate}
          </h4>
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={onClose}
          >
            Close
          </button>
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
          Which specific booked calls belong to you today? Optional — skip and this count stays unattributed.
        </p>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email…"
          className="mb-2 block w-full rounded-md glass-input text-sm px-2 py-1.5"
        />
        <div className="flex-1 overflow-auto">
          {loading && <p className="text-xs text-gray-500 dark:text-gray-400">Loading…</p>}
          {!loading && error && <p className="text-xs text-red-500">{error}</p>}
          {!loading && !error && filtered.length === 0 && (
            <p className="text-xs text-gray-500">No booked clients found for this day.</p>
          )}
          {!loading && !error && filtered.length > 0 && (
            <ul className="space-y-1">
              {filtered.map((c) => (
                <li key={c.client_id}>
                  <label className="flex items-center gap-2 text-xs px-1 py-1 rounded hover:bg-gray-100 dark:hover:bg-white/5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(c.client_id)}
                      onChange={() => toggle(c.client_id)}
                    />
                    <span className="truncate text-gray-800 dark:text-gray-100">{c.client_name}</span>
                    {c.email && (
                      <span className="truncate text-gray-400 dark:text-gray-500">{c.email}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-white/10 text-gray-600 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Save (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
