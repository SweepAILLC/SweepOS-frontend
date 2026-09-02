import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import type {
  CloseSurveyClientOption,
  CloseSurveyCloserOption,
  CloseSurveyDealOutcome,
  CloseSurveyLeadSourceOption,
  CloseSurveyMetaResponse,
  CloseSurveyOfferOption,
  CloseSurveyPaymentSource,
  CloseSurveySubmitPayload,
} from '@/types/closeSurvey';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Shared chrome so SSR + first client paint match (avoids hydration errors). */
function SurveyShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Post-sales close</h1>
          <p className="text-sm text-gray-400 mt-1">
            Log a sales outcome against a client — pipeline, payments, offer, and KPI refresh from
            this form.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}

export default function CloseSurveyPage() {
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

  return <CloseSurveyClient />;
}

function CloseSurveyClient() {
  const router = useRouter();
  const token = useMemo(
    () => (typeof router.query.token === 'string' ? router.query.token : ''),
    [router.query.token]
  );

  const [meta, setMeta] = useState<CloseSurveyMetaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [phase, setPhase] = useState<'form' | 'submitting' | 'done'>('form');

  const [clientQuery, setClientQuery] = useState('');
  const [clientId, setClientId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [dealOutcome, setDealOutcome] = useState<CloseSurveyDealOutcome | null>(null);
  const [closerUserId, setCloserUserId] = useState('');
  const [leadSourceKey, setLeadSourceKey] = useState('organic');
  const [paymentSource, setPaymentSource] = useState<CloseSurveyPaymentSource>('none');
  const [cashCollected, setCashCollected] = useState('');
  const [offerSlot, setOfferSlot] = useState('');
  const [offerName, setOfferName] = useState('');
  const [contractAmount, setContractAmount] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');
  const [callNotes, setCallNotes] = useState('');
  const [entryDate, setEntryDate] = useState(() => ymd(new Date()));
  const loadGen = useRef(0);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const loadMeta = useCallback(async (tok: string) => {
    const gen = ++loadGen.current;
    setLoading(true);
    setLoadError(null);
    setSuccessMsg(null);
    setSaveError(null);
    try {
      const row = await apiClient.getCloseSurveyMeta(tok);
      if (gen !== loadGen.current) return;
      setMeta(row);
      const sources = row.lead_sources || [];
      const organic = sources.find((s) => s.key === 'organic');
      setLeadSourceKey(organic?.key || sources[0]?.key || 'organic');
      setCloserUserId('');
    } catch (err) {
      if (gen !== loadGen.current) return;
      setMeta(null);
      setLoadError(formatApiError(err, 'Could not load survey'));
    } finally {
      if (gen === loadGen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadMeta(token);
  }, [token, loadMeta]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!pickerRef.current?.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const selectedClient: CloseSurveyClientOption | null = useMemo(() => {
    if (!meta || !clientId) return null;
    return meta.clients.find((c) => c.id === clientId) || null;
  }, [meta, clientId]);

  const filteredClients = useMemo(() => {
    if (!meta) return [];
    const q = clientQuery.trim().toLowerCase();
    if (!q) return meta.clients.slice(0, 40);
    return meta.clients
      .filter((c) => {
        const hay = `${c.name} ${c.email || ''} ${c.lifecycle_state}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [meta, clientQuery]);

  const offers: CloseSurveyOfferOption[] = useMemo(() => meta?.offers || [], [meta?.offers]);
  const closers: CloseSurveyCloserOption[] = useMemo(() => meta?.closers || [], [meta?.closers]);
  const leadSources: CloseSurveyLeadSourceOption[] = useMemo(
    () => meta?.lead_sources || [],
    [meta?.lead_sources]
  );

  useEffect(() => {
    if (offerSlot !== 'custom') return;
    const match = offers.find((o) => o.slot === offerSlot);
    if (match?.suggested_total_cents != null && !contractAmount) {
      setContractAmount((match.suggested_total_cents / 100).toFixed(2));
    }
  }, [offerSlot, offers, contractAmount]);

  const parseMoney = (raw: string): number | null => {
    const t = raw.trim();
    if (!t) return null;
    const n = Number(t);
    if (Number.isNaN(n) || n < 0) return null;
    return n;
  };

  const resetForAnother = () => {
    setPhase('form');
    setSuccessMsg(null);
    setSaveError(null);
    setClientId('');
    setDealOutcome(null);
    setCashCollected('');
    setCallNotes('');
    setRecordingUrl('');
    setOfferSlot('');
    setOfferName('');
    setContractAmount('');
    setCloserUserId('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !clientId || dealOutcome === null) {
      setSaveError('Select a client and deal outcome.');
      return;
    }
    setSaving(true);
    setPhase('submitting');
    setSaveError(null);
    setSuccessMsg(null);
    try {
      const cash = parseMoney(cashCollected);
      const contract = parseMoney(contractAmount);
      const payload: CloseSurveySubmitPayload = {
        client_id: clientId,
        closed: dealOutcome === 'yes',
        deal_outcome: dealOutcome,
        payment_source: paymentSource,
        cash_collected: paymentSource === 'manual' ? cash : null,
        offer_slot: offerSlot || null,
        offer_name: offerSlot === 'custom' ? offerName.trim() || undefined : undefined,
        contract_amount: contract,
        recording_url: recordingUrl.trim() || undefined,
        call_notes: callNotes.trim() || undefined,
        entry_date: entryDate,
        closer_user_id: closerUserId || null,
        lead_source_key: leadSourceKey || 'organic',
      };
      const res = await apiClient.submitCloseSurvey(token, payload);
      setSuccessMsg(res.message || 'Logged — pipeline / payments / KPI will refresh in the background.');
      setPhase('done');
    } catch (err) {
      setSaveError(formatApiError(err, 'Submit failed'));
      setPhase('form');
    } finally {
      setSaving(false);
    }
  };

  if (!token) {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
          Waiting for link…
        </div>
      </SurveyShell>
    );
  }

  if (loading) {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-400">
          Loading form…
        </div>
      </SurveyShell>
    );
  }

  if (loadError || !meta) {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          {loadError || 'Survey not found'}
        </div>
      </SurveyShell>
    );
  }

  if (phase === 'submitting') {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center space-y-3">
          <div className="mx-auto h-8 w-8 rounded-full border-2 border-cyan-400/40 border-t-cyan-300 animate-spin" />
          <p className="text-sm text-gray-200 font-medium">Submitting…</p>
          <p className="text-xs text-gray-500">
            Saving outcome and refreshing pipeline / KPI in the background.
          </p>
        </div>
      </SurveyShell>
    );
  }

  if (phase === 'done') {
    return (
      <SurveyShell>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 space-y-4 text-center">
          <p className="text-lg font-semibold text-emerald-100">Submitted</p>
          <p className="text-sm text-emerald-100/80">
            {successMsg || 'Logged — pipeline / payments / KPI will refresh in the background.'}
          </p>
          <button
            type="button"
            onClick={resetForAnother}
            className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white"
          >
            Back to survey
          </button>
        </div>
      </SurveyShell>
    );
  }

  return (
    <SurveyShell>
      <p className="text-sm text-gray-300 -mt-2">
        Organization: <span className="text-gray-100 font-medium">{meta.org_name}</span>
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <label className="block text-sm">
          <span className="text-gray-300">Date</span>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          />
        </label>

        <div ref={pickerRef} className="relative">
          <span className="text-sm text-gray-300">Client</span>
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm"
          >
            {selectedClient ? (
              <span>
                {selectedClient.name}
                {selectedClient.email ? (
                  <span className="text-gray-400"> · {selectedClient.email}</span>
                ) : null}
              </span>
            ) : (
              <span className="text-gray-500">Search clients…</span>
            )}
          </button>
          {pickerOpen && (
            <div className="absolute z-20 mt-1 w-full rounded-lg border border-white/10 bg-gray-900 shadow-xl">
              <input
                autoFocus
                type="search"
                value={clientQuery}
                onChange={(e) => setClientQuery(e.target.value)}
                placeholder="Type a name or email"
                className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
              />
              <ul className="max-h-56 overflow-y-auto py-1">
                {filteredClients.length === 0 ? (
                  <li className="px-3 py-2 text-xs text-gray-500">No matches</li>
                ) : (
                  filteredClients.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-white/10"
                        onClick={() => {
                          setClientId(c.id);
                          setClientQuery('');
                          setPickerOpen(false);
                        }}
                      >
                        <div>{c.name}</div>
                        <div className="text-xs text-gray-500">
                          {c.email || 'No email'} · {c.lifecycle_state}
                        </div>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm text-gray-300">Deal outcome</legend>
          <div className="flex gap-3">
            {(
              [
                ['yes', 'Close'],
                ['no', 'No Close'],
                ['no_show', 'No show'],
              ] as const
            ).map(([val, label]) => (
              <label
                key={label}
                className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${
                  dealOutcome === val
                    ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-100'
                    : 'border-white/10 bg-white/5 text-gray-300'
                }`}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="dealOutcome"
                  checked={dealOutcome === val}
                  onChange={() => setDealOutcome(val)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block text-sm">
          <span className="text-gray-300">Closer</span>
          <select
            value={closerUserId}
            onChange={(e) => setCloserUserId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="">— Select closer —</option>
            {closers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` · ${c.email}` : ''}
                {c.role ? ` (${c.role})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-gray-300">Lead source</span>
          <select
            value={leadSourceKey}
            onChange={(e) => setLeadSourceKey(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            {leadSources.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-gray-300">Payment source</span>
          <select
            value={paymentSource}
            onChange={(e) => setPaymentSource(e.target.value as CloseSurveyPaymentSource)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="none">None</option>
            <option value="manual">Manual</option>
            <option value="stripe">Stripe</option>
            <option value="whop">Whop</option>
          </select>
        </label>

        {paymentSource === 'manual' && (
          <label className="block text-sm">
            <span className="text-gray-300">Cash collected ($)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cashCollected}
              onChange={(e) => setCashCollected(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </label>
        )}

        {(paymentSource === 'stripe' || paymentSource === 'whop') && (
          <p className="text-xs text-gray-500">
            Stripe/Whop cash is already recorded by the integration — this form only marks close,
            offer, and notes.
          </p>
        )}

        <label className="block text-sm">
          <span className="text-gray-300">Offer</span>
          <select
            value={offerSlot}
            onChange={(e) => {
              setOfferSlot(e.target.value);
              const opt = offers.find((o) => o.slot === e.target.value);
              if (opt?.suggested_total_cents != null) {
                setContractAmount((opt.suggested_total_cents / 100).toFixed(2));
              }
            }}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
          >
            <option value="">— Optional —</option>
            {offers.map((o) => (
              <option key={o.slot} value={o.slot}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {offerSlot === 'custom' && (
          <label className="block text-sm">
            <span className="text-gray-300">Custom offer name</span>
            <input
              type="text"
              value={offerName}
              onChange={(e) => setOfferName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              placeholder="Offer name"
            />
          </label>
        )}

        <label className="block text-sm">
          <span className="text-gray-300">Contract amount ($)</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={contractAmount}
            onChange={(e) => setContractAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-300">Recording URL</span>
          <input
            type="url"
            value={recordingUrl}
            onChange={(e) => setRecordingUrl(e.target.value)}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="https://…"
          />
        </label>

        <label className="block text-sm">
          <span className="text-gray-300">Call notes</span>
          <textarea
            value={callNotes}
            onChange={(e) => setCallNotes(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
            placeholder="What happened on the call…"
          />
        </label>

        {saveError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {saveError}
          </div>
        )}
        {successMsg && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
            {successMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !clientId || dealOutcome === null}
          className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white"
        >
          {saving ? 'Saving…' : 'Log close'}
        </button>
      </form>
    </SurveyShell>
  );
}
