'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import type { Payment } from '@/types/integration';

function paymentDateInputFromUnix(ts: number): string {
  const d = new Date(ts * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formStateFromPayment(payment: Payment) {
  return {
    amount: ((payment.amount_cents || 0) / 100).toFixed(2),
    payment_date: payment.created_at
      ? paymentDateInputFromUnix(payment.created_at)
      : new Date().toISOString().split('T')[0],
    description: payment.description ?? '',
    payment_method: payment.payment_method ?? '',
    receipt_url: payment.receipt_url ?? '',
  };
}

export type ManualPaymentDetailModalProps = {
  payment: Payment;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onDeleted: () => void | Promise<void>;
  /** Inline panel inside transactions card; default full-screen overlay. */
  variant?: 'inline' | 'overlay';
};

const inlinePanelClass =
  'mb-4 rounded-lg border border-blue-200/70 dark:border-blue-500/30 bg-blue-50/80 dark:bg-blue-950/30 p-4 shadow-sm';

export default function ManualPaymentDetailModal({
  payment,
  isOpen,
  onClose,
  onSaved,
  onDeleted,
  variant = 'overlay',
}: ManualPaymentDetailModalProps) {
  const [form, setForm] = useState(() => formStateFromPayment(payment));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(formStateFromPayment(payment));
      setError(null);
    }
  }, [isOpen, payment]);

  if (!isOpen) return null;

  const clientLabel =
    payment.client_name || payment.client_email || 'Unknown client';
  const clientId = payment.client_id;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId) {
      setError('This payment is not linked to a client.');
      return;
    }
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      let paymentDateISO: string | undefined;
      if (form.payment_date) {
        const [year, month, day] = form.payment_date.split('-').map(Number);
        paymentDateISO = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
      }
      await apiClient.updateManualPayment(
        clientId,
        payment.id,
        amount,
        paymentDateISO,
        form.description,
        form.payment_method,
        form.receipt_url
      );
      await onSaved();
      onClose();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax?.response?.data?.detail || 'Failed to update manual payment.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!clientId) {
      setError('This payment is not linked to a client.');
      return;
    }
    setDeleting(true);
    try {
      await apiClient.deleteManualPayment(clientId, payment.id);
      setConfirmDelete(false);
      await onDeleted();
      onClose();
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { detail?: string } } };
      setError(ax?.response?.data?.detail || 'Failed to delete manual payment.');
    } finally {
      setDeleting(false);
    }
  };

  const isInline = variant === 'inline';
  const labelClass = isInline
    ? 'block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1'
    : 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';
  const titleClass = isInline
    ? 'text-sm font-semibold text-gray-900 dark:text-gray-100'
    : 'text-lg font-semibold text-gray-900 dark:text-gray-100';
  const btnSm = isInline ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm';

  const formContent = (
    <>
      <div className="flex items-center justify-between mb-4">
        <h3 className={titleClass}>Edit manual payment</h3>
        <button
          type="button"
          onClick={onClose}
          disabled={saving || deleting}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="mb-4 rounded-md border border-gray-200/80 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] px-3 py-2 text-sm">
        <p className="font-medium text-gray-900 dark:text-gray-100">{clientLabel}</p>
        {payment.client_email && payment.client_name && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{payment.client_email}</p>
        )}
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className={isInline ? 'space-y-3' : 'space-y-4'}>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className={isInline ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : undefined}>
          <div>
            <label className={labelClass}>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full rounded-md glass-input sm:text-sm"
            />
          </div>
          <div>
            <label className={labelClass}>Payment date</label>
            <input
              type="date"
              required
              value={form.payment_date}
              onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))}
              className="w-full rounded-md glass-input sm:text-sm"
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Payment method (optional)</label>
          <select
            value={form.payment_method}
            onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
            className="w-full rounded-md glass-input sm:text-sm"
          >
            <option value="">Select method…</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="bank_transfer">Bank Transfer</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Description (optional)</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-md glass-input sm:text-sm"
            rows={isInline ? 2 : 3}
          />
        </div>
        <div>
          <label className={labelClass}>Receipt URL (optional)</label>
          <input
            type="url"
            value={form.receipt_url}
            onChange={(e) => setForm((f) => ({ ...f, receipt_url: e.target.value }))}
            className="w-full rounded-md glass-input sm:text-sm"
            placeholder="https://…"
          />
        </div>
        <div className={`flex flex-wrap items-center justify-between gap-3 ${isInline ? 'pt-1' : 'pt-2'}`}>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={saving || deleting}
            className="text-sm font-medium text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
          >
            Delete payment
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || deleting}
              className={`${btnSm} font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || deleting}
              className={`${btnSm} font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50`}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </form>
    </>
  );

  return (
    <>
      {isInline ? (
        <div className={inlinePanelClass}>{formContent}</div>
      ) : (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">{formContent}</div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete manual payment?"
        description="This removes the payment from cash totals and recent transactions. This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        busy={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
