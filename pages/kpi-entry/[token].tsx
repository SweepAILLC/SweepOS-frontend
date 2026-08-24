import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import type { KpiDailyEntry, KpiEntryUpdatePayload } from '@/types/kpi';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const emptyForm = (): KpiEntryUpdatePayload => ({});

type AdditiveField = {
  key: keyof KpiEntryUpdatePayload;
  label: string;
  kind?: 'int' | 'currency';
};

const ADDITIVE_FIELDS: AdditiveField[] = [
  { key: 'inboxes_checked', label: 'Inboxes checked' },
  { key: 'outreach_sent', label: 'Outbounds sent' },
  { key: 'respondents', label: 'Respondents' },
  { key: 'inbound_icp_leads', label: 'Inbound ICP' },
  { key: 'followups_sent', label: 'Follow-ups' },
  { key: 'new_conversations', label: 'New convos' },
  { key: 'conversations_nurtured', label: 'Convos nurtured' },
  { key: 'calls_pitched', label: 'Pitches' },
  { key: 'inbound_bookings', label: 'Inbound bookings' },
  { key: 'outbound_bookings', label: 'Outbound bookings' },
  { key: 'offers_made', label: 'Offers made' },
  { key: 'revenue', label: 'Revenue', kind: 'currency' },
];

function loggedValue(entry: KpiDailyEntry | null, key: keyof KpiEntryUpdatePayload): string {
  if (!entry) return '0';
  const v = entry[key as keyof KpiDailyEntry];
  if (v == null || v === '') return '0';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function hasSubmitPayload(form: KpiEntryUpdatePayload): boolean {
  return Object.values(form).some((v) => {
    if (v === null || v === undefined || v === '') return false;
    if (typeof v === 'number' && Number.isNaN(v)) return false;
    return true;
  });
}

/** Shared chrome so SSR + first client paint match (avoids hydration errors). */
function SurveyShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">KPI Daily Entry</h1>
          <p className="text-sm text-gray-400 mt-1">
            Enter what you did since the last submit — numbers are{' '}
            <span className="text-gray-200">added</span> to the day&apos;s totals in Sweep. Leave blank
            to skip a field.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

export default function KpiEntryFormPage() {
  // Pages-router dynamic routes have empty query during SSR/prerender; wait for client ready.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
          Loading form…
        </div>
      </SurveyShell>
    );
  }

  return <KpiEntryFormClient />;
}

function KpiEntryFormClient() {
  const router = useRouter();
  const token = useMemo(
    () => (typeof router.query.token === 'string' ? router.query.token : ''),
    [router.query.token]
  );
  const [entryDate, setEntryDate] = useState(() => ymd(new Date()));
  const [logged, setLogged] = useState<KpiDailyEntry | null>(null);
  const [form, setForm] = useState<KpiEntryUpdatePayload>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadGen = useRef(0);

  const loadEntry = useCallback(async (tok: string, date: string) => {
    const gen = ++loadGen.current;
    setLoading(true);
    setLoadError(null);
    setMessage(null);
    setSaveError(null);
    try {
      const row = await apiClient.getPublicKpiEntry(tok, date);
      if (gen !== loadGen.current) return;
      setLogged(row);
      setForm(emptyForm());
    } catch (err) {
      if (gen !== loadGen.current) return;
      setLoadError(
        formatApiError(err, 'Could not load this entry link. Check the URL or try again.')
      );
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setLoading(false);
      setLoadError('Missing entry token in the URL.');
      return;
    }
    void loadEntry(token, entryDate);
  }, [router.isReady, token, entryDate, loadEntry]);

  const setNum = (key: keyof KpiEntryUpdatePayload, raw: string) => {
    setForm((prev) => ({ ...prev, [key]: raw === '' ? null : Number(raw) }));
  };

  const bookingSum =
    (Number(form.inbound_bookings) || 0) + (Number(form.outbound_bookings) || 0);
  const loggedBooked = logged?.calls_booked ?? 0;
  const loggedSplit =
    (logged?.inbound_bookings ?? 0) + (logged?.outbound_bookings ?? 0);

  const submit = async () => {
    if (!token || saving) return;
    if (!hasSubmitPayload(form)) {
      setSaveError('Enter at least one field before submitting.');
      setMessage(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    setMessage(null);
    try {
      const payload: KpiEntryUpdatePayload = {};
      for (const [k, v] of Object.entries(form)) {
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'number' && Number.isNaN(v)) continue;
        (payload as Record<string, unknown>)[k] = v;
      }
      const updated = await apiClient.upsertPublicKpiEntry(token, entryDate, payload);
      setLogged(updated);
      setForm(emptyForm());
      setMessage('Added to day totals. You can submit more anytime.');
    } catch (err) {
      setSaveError(formatApiError(err, 'Save failed. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const formDisabled = !token || saving;

  return (
    <SurveyShell>
      {loadError && (
        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex flex-wrap items-center justify-between gap-2">
          <span>{loadError}</span>
          {token && (
            <button
              type="button"
              onClick={() => void loadEntry(token, entryDate)}
              className="rounded border border-red-400/40 px-2 py-1 text-xs hover:bg-red-500/20"
            >
              Retry
            </button>
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4 relative">
        {loading && (
          <div
            className="absolute top-3 right-3 flex items-center gap-1.5 text-[11px] text-gray-400"
            aria-live="polite"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
            {logged ? 'Refreshing…' : 'Loading…'}
          </div>
        )}

        <label className="block text-sm">
          Date
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            disabled={!token || saving}
            className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5 disabled:opacity-50"
          />
        </label>

        <div
          className={`rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-gray-400 space-y-1 min-h-[4.5rem] ${
            loading && !logged ? 'animate-pulse' : ''
          }`}
        >
          <p className="font-medium text-gray-300">Logged so far for {entryDate}</p>
          {logged ? (
            <>
              <p>
                Outreach {loggedValue(logged, 'outreach_sent')} · Replies{' '}
                {loggedValue(logged, 'respondents')} · New convos{' '}
                {loggedValue(logged, 'new_conversations')} · Nurtured{' '}
                {loggedValue(logged, 'conversations_nurtured')} · Pitches{' '}
                {loggedValue(logged, 'calls_pitched')}
              </p>
              <p>
                Bookings in {loggedValue(logged, 'inbound_bookings')} + out{' '}
                {loggedValue(logged, 'outbound_bookings')}
                {' · '}
                Calls booked (auto/total) {loggedBooked}
                {loggedSplit !== loggedBooked && loggedSplit > 0 && (
                  <span className="text-amber-400">
                    {' '}
                    (split {loggedSplit} — should match calendar total when connected)
                  </span>
                )}
              </p>
              {logged.setter_context ? (
                <p className="whitespace-pre-wrap text-gray-500">
                  Setter context: {logged.setter_context}
                </p>
              ) : (
                <p className="text-gray-600">No setter context yet.</p>
              )}
            </>
          ) : loading ? (
            <p>Fetching day totals…</p>
          ) : (
            <p>No totals loaded yet for this date.</p>
          )}
        </div>

        <fieldset disabled={formDisabled} className="grid grid-cols-1 md:grid-cols-2 gap-3 disabled:opacity-60">
          <label className="text-sm md:col-span-2">
            Total followers (sets absolute total)
            <input
              type="number"
              value={(form.total_followers as number | null) ?? ''}
              onChange={(e) => setNum('total_followers', e.target.value)}
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5"
              placeholder={logged?.total_followers != null ? String(logged.total_followers) : ''}
            />
          </label>
          <label className="text-sm">
            Content posted
            <select
              value={String(form.content_posted ?? '')}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  content_posted: e.target.value === '' ? null : e.target.value === 'true',
                }))
              }
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5"
            >
              <option value="">—</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="text-sm">
            Content attracting ICP
            <input
              type="text"
              value={(form.best_content_type as string | null) ?? ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, best_content_type: e.target.value || null }))
              }
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5"
              placeholder={logged?.best_content_type ?? ''}
            />
          </label>

          <label className="text-sm md:col-span-2">
            Setter context
            <span className="ml-1 text-[11px] text-gray-500">(appended to existing notes)</span>
            <textarea
              name="setter_context"
              id="setter_context"
              value={(form.setter_context as string | null) ?? ''}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, setter_context: e.target.value || null }))
              }
              rows={4}
              className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5"
              placeholder="Extra context from the setter for this day…"
            />
          </label>

          {ADDITIVE_FIELDS.map((f) => (
            <label key={f.key} className="text-sm">
              {f.label}
              <span className="ml-1 text-[11px] text-gray-500">
                (add · logged {loggedValue(logged, f.key)})
              </span>
              <input
                type="number"
                step={f.kind === 'currency' ? '0.01' : '1'}
                value={(form[f.key] as number | null) ?? ''}
                onChange={(e) => setNum(f.key, e.target.value)}
                className="mt-1 w-full rounded border border-white/10 bg-black/30 px-2 py-1.5"
                placeholder="0"
              />
            </label>
          ))}

          {(form.inbound_bookings != null || form.outbound_bookings != null) && (
            <p className="md:col-span-2 text-xs text-gray-500">
              This submit adds {bookingSum} booking{bookingSum === 1 ? '' : 's'} (in + out). Combined day
              total should match automated calls booked when calendar sync is on.
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={formDisabled || !hasSubmitPayload(form)}
            className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Add to day totals'}
          </button>
          {token ? (
            <button
              type="button"
              onClick={() => void loadEntry(token, entryDate)}
              disabled={loading || saving}
              className="rounded border border-white/15 px-3 py-2 text-sm text-gray-300 hover:bg-white/5 disabled:opacity-50"
            >
              Refresh totals
            </button>
          ) : null}
          {message && <span className="text-sm text-green-400">{message}</span>}
          {saveError && <span className="text-sm text-red-400">{saveError}</span>}
        </div>
      </div>
    </SurveyShell>
  );
}
