'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { canManageOrgIntegrations } from '@/lib/tabAccess';
import GhlBadge from '@/components/funnels/GhlBadge';
import GhlFunnelSetup from '@/components/funnels/GhlFunnelSetup';
import type { Funnel } from '@/types/funnel';
import type { GhlFormOption, GhlFunnelOption } from '@/types/integration';

function errorDetail(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { detail?: unknown } } };
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message);
  return fallback;
}

const buttonQuiet =
  'px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50';
const buttonPrimary = 'px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50';

/** Forms outside the funnel's pages (popups, standalone links) counted as its opt-ins. */
function ExtraFormsPicker({ funnel, onSaved }: { funnel: Funnel; onSaved: (f: Funnel) => void }) {
  const saved = funnel.ghl_config?.extra_form_ids ?? [];
  const [open, setOpen] = useState(false);
  const [forms, setForms] = useState<GhlFormOption[] | null>(null);
  const [picked, setPicked] = useState<string[]>(saved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || forms !== null) return;
    apiClient
      .listGhlForms()
      .then((d) => setForms(d.forms || []))
      .catch((e) => {
        setForms([]);
        setError(errorDetail(e, 'Could not load GoHighLevel forms.'));
      });
  }, [open, forms]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await apiClient.setFunnelGhlExtraForms(funnel.id, picked));
      setOpen(false);
    } catch (e) {
      setError(errorDetail(e, 'Could not save forms.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-card p-4 sm:p-5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Other forms that count as opt-ins</h3>
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className={buttonQuiet}>
            Edit
          </button>
        ) : null}
      </div>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        Submissions on this funnel&apos;s pages always count. Add forms that live elsewhere, like a website popup.{' '}
        {saved.length ? `${saved.length} added.` : 'None added.'}
      </p>
      {open ? (
        <div className="space-y-2">
          {forms === null ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Loading forms…</p>
          ) : forms.length === 0 && !error ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No forms or surveys found in GoHighLevel.</p>
          ) : (
            <ul className="max-h-56 overflow-auto space-y-1">
              {forms.map((f) => (
                <li key={f.id}>
                  <label className="flex items-center gap-2 text-xs text-gray-800 dark:text-gray-100">
                    <input type="checkbox" checked={picked.includes(f.id)} onChange={() => toggle(f.id)} />
                    {f.name}
                    <span className="text-gray-500 dark:text-gray-400">{f.kind}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={saving || forms === null} className={buttonPrimary}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPicked(saved);
                setOpen(false);
              }}
              className={buttonQuiet}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** Pair an existing Sweep funnel with a GoHighLevel funnel. */
function PairCard({ funnel, onPaired }: { funnel: Funnel; onPaired: () => void }) {
  const [options, setOptions] = useState<GhlFunnelOption[] | null>(null);
  const [ghlId, setGhlId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    apiClient
      .listGhlFunnels()
      .then((d) => setOptions(d.funnels || []))
      .catch((e) => {
        setOptions([]);
        setError(errorDetail(e, 'Could not load your GoHighLevel funnels.'));
      });
  };

  const pair = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.pairFunnelWithGhl(funnel.id, ghlId);
      onPaired();
    } catch (e) {
      setError(errorDetail(e, 'Could not pair the funnel.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-card p-4 sm:p-5 space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
        <GhlBadge /> Pair with GoHighLevel
      </h3>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        If this funnel runs in GoHighLevel, pair it to pull opt-ins and match them to bookings.
      </p>
      {options === null ? (
        <button type="button" onClick={load} className={buttonQuiet}>
          Choose a GHL funnel
        </button>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={ghlId}
            onChange={(e) => setGhlId(e.target.value)}
            aria-label="GoHighLevel funnel"
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1.5 text-sm"
          >
            <option value="">Pick a funnel</option>
            {options.map((o) => (
              <option key={o.id} value={o.id} disabled={Boolean(o.paired_funnel_id)}>
                {o.name}
                {o.paired_funnel_id ? ` (paired to ${o.paired_funnel_name})` : ''}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void pair()} disabled={!ghlId || saving} className={buttonPrimary}>
            {saving ? 'Pairing…' : 'Pair'}
          </button>
        </div>
      )}
      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </section>
  );
}

/**
 * Funnel settings section for GoHighLevel: setup cards and extra forms for a paired
 * funnel; a pair-later card for a Sweep funnel when GHL is connected (admins only).
 */
export default function GhlFunnelSettings({ funnel, onReload }: { funnel: Funnel; onReload: () => void }) {
  const [canManage, setCanManage] = useState(false);
  const [ghlConnected, setGhlConnected] = useState(false);
  const [current, setCurrent] = useState<Funnel>(funnel);
  const [unpairing, setUnpairing] = useState(false);

  useEffect(() => setCurrent(funnel), [funnel]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.getCurrentUser().catch(() => null), apiClient.getGhlStatus().catch(() => null)]).then(
      ([user, status]) => {
        if (cancelled) return;
        const u = user as { role?: string; is_admin?: boolean; is_system_owner?: boolean } | null;
        setCanManage(
          canManageOrgIntegrations(u?.role ?? '', { isAdmin: u?.is_admin === true, isSystemOwner: u?.is_system_owner === true }),
        );
        setGhlConnected(Boolean(status?.connected));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const unpair = async () => {
    if (!window.confirm('Unpair from GoHighLevel? Leads already imported keep this funnel; new GHL opt-ins stop arriving.')) return;
    setUnpairing(true);
    try {
      await apiClient.unpairFunnelFromGhl(current.id);
      onReload();
    } finally {
      setUnpairing(false);
    }
  };

  if (current.source !== 'ghl') {
    return ghlConnected && canManage ? <PairCard funnel={current} onPaired={onReload} /> : null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-gray-800 dark:text-gray-100">
          <GhlBadge />
          Paired with GoHighLevel funnel <span className="font-semibold">{current.ghl_config?.name}</span>
        </p>
        {canManage ? (
          <button type="button" onClick={() => void unpair()} disabled={unpairing} className={buttonQuiet}>
            {unpairing ? 'Unpairing…' : 'Unpair'}
          </button>
        ) : null}
      </div>
      <GhlFunnelSetup funnel={current} canManage={canManage} mode="settings" onFunnelChange={setCurrent} />
      {canManage ? <ExtraFormsPicker funnel={current} onSaved={setCurrent} /> : null}
    </div>
  );
}
