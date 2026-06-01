'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Client } from '@/types/client';
import { apiClient } from '@/lib/api';

type Ladder = {
  core_offer?: { name?: string; promise?: string; price_terms?: string };
  upsells?: Array<{ name?: string; promise?: string; price_terms?: string }>;
  downsells?: Array<{ name?: string; promise?: string; price_terms?: string }>;
  referral_offer?: { incentive?: string; ask_script_hints?: string };
};

export type OfferSlotValue = string;

function parseMoneyToCents(raw: string): number {
  const t = raw.trim().replace(/[^0-9.]/g, '');
  if (!t) return 0;
  const v = parseFloat(t);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100);
}

function buildOfferOptions(ladder: Ladder | null): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [{ value: '', label: '—' }];
  if (!ladder) return opts;

  const coreName =
    (ladder.core_offer?.name || '').trim() ||
    (ladder.core_offer?.promise || '').trim().slice(0, 80) ||
    'Core offer';
  opts.push({ value: 'core', label: `Core · ${coreName}` });

  (ladder.upsells || []).forEach((u, i) => {
    const name = (u?.name || u?.promise || `Upsell ${i + 1}`).toString().slice(0, 80);
    opts.push({ value: `upsell:${i}`, label: `↑ ${name}` });
  });
  (ladder.downsells || []).forEach((d, i) => {
    const name = (d?.name || d?.promise || `Downsell ${i + 1}`).toString().slice(0, 80);
    opts.push({ value: `downsell:${i}`, label: `↓ ${name}` });
  });

  const refLabel =
    (ladder.referral_offer?.incentive || '').trim().slice(0, 60) || 'Referral';
  opts.push({ value: 'referral', label: `Ref · ${refLabel}` });

  return opts;
}

interface OfferEnrollmentSectionProps {
  client: Client;
  /** Cents from Financial Summary (payments API + lifetime); saved as paid_cents on offer. */
  recordedPaidCents: number;
  /** Compact row for Financial Summary drawer */
  minimal?: boolean;
  onSaved?: (updated?: Client) => void;
}

export default function OfferEnrollmentSection({
  client,
  recordedPaidCents,
  minimal,
  onSaved,
}: OfferEnrollmentSectionProps) {
  const [ladder, setLadder] = useState<Ladder | null>(null);
  const [slot, setSlot] = useState('');
  const [totalStr, setTotalStr] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const oe = client.offer_enrollment;

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getUserSettings()
      .then((s: { ai_profile?: Record<string, unknown> }) => {
        if (cancelled) return;
        const raw = s?.ai_profile?.offer_ladder;
        setLadder(raw != null && typeof raw === 'object' ? (raw as Ladder) : null);
      })
      .catch(() => {
        if (!cancelled) setLadder(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const syncFromClient = useCallback(() => {
    if (oe?.slot) {
      setSlot(oe.slot);
      setTotalStr(oe.total_cents != null ? (oe.total_cents / 100).toFixed(2) : '');
      setNotes(oe.notes || '');
    } else {
      setSlot('');
      setTotalStr('');
      setNotes('');
    }
  }, [oe]);

  useEffect(() => {
    syncFromClient();
  }, [client.id, client.updated_at, syncFromClient]);

  const options = useMemo(() => buildOfferOptions(ladder), [ladder]);

  const contractCentsPreview = useMemo(() => parseMoneyToCents(totalStr), [totalStr]);
  const owedPreview = useMemo(
    () =>
      contractCentsPreview > 0 ? Math.max(0, contractCentsPreview - recordedPaidCents) : 0,
    [contractCentsPreview, recordedPaidCents]
  );

  const persist = async (body: { offer_enrollment: Client['offer_enrollment'] }) => {
    setErr(null);
    setSaving(true);
    try {
      const updated = (await apiClient.updateClient(client.id, body)) as Client;
      onSaved?.(updated);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setErr(typeof msg === 'string' ? msg : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!slot) {
      await persist({ offer_enrollment: null });
      return;
    }
    const label = options.find((o) => o.value === slot)?.label || slot;
    const nameSnap = label.replace(/^—\s*$/, '').slice(0, 220);
    await persist({
      offer_enrollment: {
        slot,
        name_snapshot: nameSnap || undefined,
        total_cents: contractCentsPreview,
        paid_cents: recordedPaidCents,
        currency: 'usd',
        notes: notes.trim() || undefined,
      },
    });
  };

  const handleClear = async () => {
    await persist({ offer_enrollment: null });
    setSlot('');
    setTotalStr('');
    setNotes('');
  };

  const wrapClass = minimal
    ? 'mt-4 pt-4 border-t border-gray-100 dark:border-white/10'
    : 'rounded-xl border border-gray-200 dark:border-white/10 p-4 space-y-3';

  return (
    <div className={wrapClass}>
      {!minimal && (
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Offer & payment plan</h4>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 min-w-[140px] flex-1">
            <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Offer</span>
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              className="text-sm rounded-md border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 px-2 py-1 w-full"
            >
              {options.map((o) => (
                <option key={o.value || 'none'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 w-28">
            <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Contract</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={totalStr}
              onChange={(e) => setTotalStr(e.target.value)}
              className="text-sm rounded-md border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 px-2 py-1"
            />
          </label>
          <div className="flex gap-1.5 pb-0.5">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="text-xs px-2.5 py-1 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 disabled:opacity-50"
            >
              {saving ? '…' : 'Save'}
            </button>
            {oe?.slot ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleClear()}
                className="text-xs px-2 py-1 rounded-md border border-gray-200 dark:border-white/20 text-gray-600 dark:text-gray-300"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Note (optional)"
          className="text-xs rounded-md border border-gray-100 dark:border-white/10 bg-transparent px-2 py-1 w-full placeholder:text-gray-400"
        />

        {contractCentsPreview > 0 && (
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Owed on plan:{' '}
            <span className="text-gray-900 dark:text-gray-100 font-medium tabular-nums">
              {(owedPreview / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' })}
            </span>
            <span className="text-gray-400 dark:text-gray-500"> · paid follows Total Amount Paid</span>
          </p>
        )}

        {err && <p className="text-[11px] text-red-600 dark:text-red-400">{err}</p>}
        {ladder == null && (
          <p className="text-[10px] text-gray-400">Add offers under Intelligence → Offers & Ladder.</p>
        )}
      </div>
    </div>
  );
}
