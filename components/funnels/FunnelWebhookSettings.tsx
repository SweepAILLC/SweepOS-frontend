'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { canManageOrgIntegrations } from '@/lib/tabAccess';
import type { FunnelWebhookDelivery, FunnelWebhookState } from '@/types/funnel';

function errorDetail(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { detail?: unknown } } };
  const detail = err?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

const buttonQuiet =
  'px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50';
const buttonPrimary = 'px-3 py-1.5 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50';

const STATUS_STYLE: Record<FunnelWebhookDelivery['status'], string> = {
  done: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  processing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  name: 'Full name',
  first_name: 'First name',
  last_name: 'Last name',
  instagram: 'Instagram',
  notes: 'Notes',
  visitor_id: 'Sweep visitor id',
  session_id: 'Sweep session id',
  utm_source: 'UTM source',
  utm_medium: 'UTM medium',
  utm_campaign: 'UTM campaign',
  utm_term: 'UTM term',
  utm_content: 'UTM content',
};

const LEAD_TARGETS = ['email', 'phone', 'name', 'first_name', 'last_name', 'instagram', 'notes', 'visitor_id', 'session_id'];
const UTM_TARGETS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const CUSTOM_KEY = '__custom__';

/** One field-map row. Shows a dropdown of keys seen in recent deliveries when there are
 *  any (pick, don't type); falls back to a plain text input otherwise or for a one-off key. */
function FieldKeyInput({
  value,
  candidates,
  onChange,
}: {
  value: string;
  candidates: string[];
  onChange: (v: string) => void;
}) {
  const inCandidates = value !== '' && candidates.includes(value);
  const [customMode, setCustomMode] = useState(value !== '' && !inCandidates);

  if (!candidates.length) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="auto"
        className="min-w-0 flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 font-mono"
      />
    );
  }

  if (customMode) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="auto"
          className="min-w-0 flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 font-mono"
        />
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            onChange('');
          }}
          className="shrink-0 text-[11px] text-gray-500 dark:text-gray-400 underline"
        >
          Pick
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === CUSTOM_KEY) {
          setCustomMode(true);
          onChange('');
        } else {
          onChange(e.target.value);
        }
      }}
      className="min-w-0 flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-transparent px-2 py-1 font-mono"
    >
      <option value="">auto</option>
      {candidates.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
      <option value={CUSTOM_KEY}>Type a key…</option>
    </select>
  );
}

function FieldMapEditor({
  state,
  funnelId,
  onSaved,
}: {
  state: FunnelWebhookState;
  funnelId: string;
  onSaved: (s: FunnelWebhookState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(state.field_map);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapped = Object.keys(state.field_map).length;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      onSaved(await apiClient.setFunnelWebhookFieldMap(funnelId, draft));
      setOpen(false);
    } catch (e) {
      setError(errorDetail(e, 'Could not save the field map.'));
    } finally {
      setSaving(false);
    }
  };

  const availableTargets = new Set(state.map_targets);
  const leadRows = LEAD_TARGETS.filter((t) => availableTargets.has(t));
  const utmRows = UTM_TARGETS.filter((t) => availableTargets.has(t));
  const candidateKeys = Array.from(new Set(state.recent.flatMap((d) => d.extra_fields))).sort();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Email, phone, name, Instagram and UTMs are usually detected automatically from common field names. Every
          other field is saved as the lead&apos;s answers.{mapped ? ` ${mapped} field(s) mapped by hand.` : ''}
        </p>
        {!open ? (
          <button
            type="button"
            className={buttonQuiet}
            onClick={() => {
              setDraft(state.field_map);
              setOpen(true);
            }}
          >
            Map fields
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-3">
          <div className="space-y-1.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-white/5 p-3 text-xs text-gray-600 dark:text-gray-300">
            <p>
              Only fill in a field below if Sweep isn&apos;t picking it up automatically. For each one, type the exact
              JSON key your tool sends it under — not a label you see on your form, but the key in the raw
              submission data.
            </p>
            {candidateKeys.length ? (
              <p>
                <strong>Pick, don&apos;t type:</strong> each dropdown below is filled with the exact keys seen in
                recent deliveries (the same ones listed under &quot;Other fields&quot;), so you can just choose the
                right one. Use &quot;Type a key…&quot; only for a key that hasn&apos;t shown up in a delivery yet.
              </p>
            ) : (
              <p>
                <strong>Not sure what the key is?</strong> Send a test submission first — once a delivery shows up
                below, its unmatched keys appear in a dropdown here so you can just pick the right one instead of
                typing it.
              </p>
            )}
            <p>
              <strong>Nested data:</strong> a key like <code className="rounded bg-black/5 dark:bg-white/10 px-1">contact.email</code>{' '}
              means the payload had <code className="rounded bg-black/5 dark:bg-white/10 px-1">{'{ "contact": { "email": "..." } }'}</code>;{' '}
              <code className="rounded bg-black/5 dark:bg-white/10 px-1">answers.0.text</code> means the first item
              in an <code className="rounded bg-black/5 dark:bg-white/10 px-1">answers</code> list.
            </p>
            <p>Leave a field as &quot;auto&quot; to keep automatic detection for it.</p>
          </div>

          {leadRows.length ? (
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Lead info</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {leadRows.map((target) => (
                  <label key={target} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                    <span className="w-28 shrink-0">{FIELD_LABELS[target] ?? target}</span>
                    <FieldKeyInput
                      value={draft[target] ?? ''}
                      candidates={candidateKeys}
                      onChange={(v) => setDraft((d) => ({ ...d, [target]: v }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {utmRows.length ? (
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">Campaign (UTM)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {utmRows.map((target) => (
                  <label key={target} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                    <span className="w-28 shrink-0">{FIELD_LABELS[target] ?? target}</span>
                    <FieldKeyInput
                      value={draft[target] ?? ''}
                      candidates={candidateKeys}
                      onChange={(v) => setDraft((d) => ({ ...d, [target]: v }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} disabled={saving} className={buttonPrimary}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={buttonQuiet}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DeliveryLog({
  state,
  funnelId,
  onChanged,
}: {
  state: FunnelWebhookState;
  funnelId: string;
  onChanged: () => void;
}) {
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (id: string) => {
    setRetrying(id);
    try {
      await apiClient.retryFunnelWebhookDelivery(funnelId, id);
      onChanged();
    } finally {
      setRetrying(null);
    }
  };

  if (!state.recent.length) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">No deliveries yet. Send a test submission from your form.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 dark:text-gray-400">
            <th className="py-1 pr-3 font-medium">Received</th>
            <th className="py-1 pr-3 font-medium">Status</th>
            <th className="py-1 pr-3 font-medium">Lead</th>
            <th className="py-1 pr-3 font-medium">Other fields</th>
            <th className="py-1" />
          </tr>
        </thead>
        <tbody>
          {state.recent.map((d) => (
            <tr key={d.id} className="border-t border-gray-200 dark:border-gray-800 align-top">
              <td className="py-1.5 pr-3 whitespace-nowrap text-gray-700 dark:text-gray-200">
                {d.received_at ? new Date(d.received_at).toLocaleString() : '—'}
              </td>
              <td className="py-1.5 pr-3">
                <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[d.status]}`}>{d.status}</span>
                {d.error ? <p className="mt-1 max-w-xs text-red-600 dark:text-red-400 break-words">{d.error}</p> : null}
              </td>
              <td className="py-1.5 pr-3 text-gray-800 dark:text-gray-100">
                {d.name || d.email || d.phone || '—'}
                {d.name && d.email ? <span className="block text-gray-500 dark:text-gray-400">{d.email}</span> : null}
              </td>
              <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400 max-w-xs truncate" title={d.extra_fields.join(', ')}>
                {d.extra_fields.length ? d.extra_fields.join(', ') : '—'}
              </td>
              <td className="py-1.5 text-right">
                {d.status === 'failed' ? (
                  <button type="button" className={buttonQuiet} disabled={retrying === d.id} onClick={() => void retry(d.id)}>
                    {retrying === d.id ? 'Retrying…' : 'Retry'}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Custom webhook: any opt-in tool posts leads to a secret per-funnel URL. Admins/owners only.
 *  Pass `canManage` when the parent already knows the role; otherwise it is looked up. */
export default function FunnelWebhookSettings({
  funnelId,
  canManage: canManageProp,
  onEnabledChange,
}: {
  funnelId: string;
  canManage?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const [canManageFetched, setCanManageFetched] = useState(false);
  const canManage = canManageProp ?? canManageFetched;
  const [state, setState] = useState<FunnelWebhookState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canManageProp !== undefined) return;
    let cancelled = false;
    apiClient
      .getCurrentUser()
      .catch(() => null)
      .then((user) => {
        if (cancelled) return;
        const u = user as { role?: string; is_admin?: boolean; is_system_owner?: boolean } | null;
        setCanManageFetched(
          canManageOrgIntegrations(u?.role ?? '', { isAdmin: u?.is_admin === true, isSystemOwner: u?.is_system_owner === true }),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [canManageProp]);

  const load = useCallback(() => {
    setError(null);
    apiClient
      .getFunnelWebhook(funnelId)
      .then(setState)
      .catch((e) => setError(errorDetail(e, 'Could not load webhook settings.')));
  }, [funnelId]);

  useEffect(() => {
    if (canManage) load();
  }, [canManage, load]);

  const act = async (fn: () => Promise<FunnelWebhookState>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    try {
      const next = await fn();
      setState(next);
      onEnabledChange?.(next.enabled);
    } catch (e) {
      setError(errorDetail(e, 'Something went wrong.'));
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    if (!state?.url) return;
    navigator.clipboard.writeText(state.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!canManage) return null;

  return (
    <section className="glass-card p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom webhook</h3>
        {state?.enabled ? (
          <div className="flex gap-2">
            <button type="button" className={buttonQuiet} onClick={load} disabled={busy}>
              Refresh
            </button>
            <button
              type="button"
              className={buttonQuiet}
              disabled={busy}
              onClick={() =>
                void act(
                  () => apiClient.rotateFunnelWebhook(funnelId),
                  'Generate a new URL? The current URL stops working right away; update your form tool with the new one.',
                )
              }
            >
              New URL
            </button>
            <button
              type="button"
              className={buttonQuiet}
              disabled={busy}
              onClick={() =>
                void act(() => apiClient.disableFunnelWebhook(funnelId), 'Turn off this webhook? Submissions sent to it will be rejected.')
              }
            >
              Turn off
            </button>
          </div>
        ) : null}
      </div>

      {state === null && !error ? <p className="text-xs text-gray-500 dark:text-gray-400">Loading…</p> : null}

      {state && !state.enabled ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Send opt-ins from any form tool (ClickFunnels, Kajabi, Typeform, Zapier, Make, your own site) straight to this
            funnel. Each submission becomes a lead on the Client Board.
          </p>
          <button type="button" className={buttonPrimary} disabled={busy} onClick={() => void act(() => apiClient.rotateFunnelWebhook(funnelId))}>
            {busy ? 'Creating…' : 'Create webhook URL'}
          </button>
        </div>
      ) : null}

      {state?.enabled ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-white/10 px-3 py-2 text-xs font-mono">
                {state.url ?? `${state.token_prefix}…`}
              </code>
              <button type="button" className={buttonPrimary} onClick={copy} disabled={!state.url}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Keep this URL private: anyone with it can add leads. In your tool, send a POST with JSON or form fields. Up
              to {state.rate_limit_per_minute} submissions per minute; tools retry automatically above that.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                ['Received (24h)', state.last_24h.received],
                ['Added', state.last_24h.done],
                ['In progress', state.last_24h.pending],
                ['Failed', state.last_24h.failed],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="glass-panel rounded-lg p-2">
                <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{n}</p>
              </div>
            ))}
          </div>

          <FieldMapEditor state={state} funnelId={funnelId} onSaved={setState} />

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-gray-800 dark:text-gray-100">Recent deliveries</h4>
            <DeliveryLog state={state} funnelId={funnelId} onChanged={load} />
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </section>
  );
}
