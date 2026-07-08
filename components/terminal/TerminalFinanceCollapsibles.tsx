'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiClient } from '@/lib/api';
import { deduplicateClientsForAssign } from '@/lib/clientBoardSearch';
import ClientSearchCombobox from '@/components/client/ClientSearchCombobox';
import {
  dashboardPeriodLabel,
  isManualStripePaymentRow,
  terminalFailedPaymentsParams,
  terminalStripePaymentsParams,
} from '@/lib/dashboardTimeRange';
import { useTerminalTimeRange } from '@/contexts/TerminalTimeRangeContext';
import {
  dispatchManualPaymentCreated,
  invalidateStripeAndTerminalAfterWebhook,
  MANUAL_PAYMENT_CREATED_EVENT,
  STRIPE_DATA_UPDATED_EVENT,
  TERMINAL_DATA_REFRESHED_EVENT,
} from '@/lib/cache';
import EmailComposer from '@/components/brevo/EmailComposer';
import ManualPaymentDetailModal from '@/components/terminal/ManualPaymentDetailModal';
import type { Payment } from '@/types/integration';
import type { Client } from '@/types/client';

interface FailedPayment {
  id: string;
  client_name: string;
  client_email: string;
  amount: number;
  failed_at: string;
  failure_reason?: string;
}

const sectionChevron = (
  <svg className="w-4 h-4 transition-transform group-open:rotate-180" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.08 1.04l-4.25 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

const sectionToggleClass =
  'inline-flex items-center justify-center w-8 h-8 rounded-md border border-blue-200 bg-blue-100 text-blue-700 shadow-sm hover:bg-blue-200 dark:border-blue-400/35 dark:bg-blue-500/20 dark:text-blue-200 dark:shadow-none dark:hover:bg-blue-500/30 transition-colors';

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/** Tbody rows visible before the table body scrolls. */
const FINANCE_TABLE_MAX_VISIBLE_ROWS = 6;
const FINANCE_TABLE_HEADER_PX = 33;
const FINANCE_TRANSACTION_ROW_PX = 41;
const FINANCE_FAILED_ROW_PX = 52;

function financeTableScrollMaxPx(rowPx: number) {
  return FINANCE_TABLE_HEADER_PX + FINANCE_TABLE_MAX_VISIBLE_ROWS * rowPx;
}

const FAILED_PAYMENTS_TABLE_MAX_PX = financeTableScrollMaxPx(FINANCE_FAILED_ROW_PX);
const TRANSACTIONS_TABLE_MAX_PX = financeTableScrollMaxPx(FINANCE_TRANSACTION_ROW_PX);

const FINANCE_SECTION_BODY_PAD_PX = 28;
const FINANCE_FAILED_SUMMARY_PX = 56;
const FINANCE_TRANSACTIONS_SUMMARY_PX = 64;
const FINANCE_STACK_GAP_PX = 12;
const FINANCE_EMPTY_MESSAGE_PX = 20;
const FINANCE_LOAD_MORE_PX = 28;

function financeTableBodyHeightPx(rowCount: number, rowPx: number) {
  if (rowCount <= 0) return 0;
  return FINANCE_TABLE_HEADER_PX + rowCount * rowPx;
}

function estimateFinanceStackHeight(
  failedCount: number,
  txCount: number,
  failedLoading: boolean,
  paymentsLoading: boolean,
  hasLoadMore: boolean,
) {
  let total = 0;

  total += FINANCE_FAILED_SUMMARY_PX + FINANCE_SECTION_BODY_PAD_PX;
  if (failedLoading || failedCount === 0) total += FINANCE_EMPTY_MESSAGE_PX;
  else total += financeTableBodyHeightPx(failedCount, FINANCE_FAILED_ROW_PX);

  total += FINANCE_STACK_GAP_PX;

  total += FINANCE_TRANSACTIONS_SUMMARY_PX + FINANCE_SECTION_BODY_PAD_PX;
  if ((paymentsLoading && txCount === 0) || txCount === 0) total += FINANCE_EMPTY_MESSAGE_PX;
  else {
    total += financeTableBodyHeightPx(txCount, FINANCE_TRANSACTION_ROW_PX);
    if (hasLoadMore) total += FINANCE_LOAD_MORE_PX;
  }

  return total;
}

/** Allow unroll when estimates are slightly below actual DOM height. */
const FINANCE_STACK_HEIGHT_TOLERANCE_PX = 24;

function cappedFinanceTableMaxPx(
  canUnrollAll: boolean,
  rowCount: number,
  rowPx: number,
  rowCapPx: number,
): number | undefined {
  if (rowCount <= 0) return undefined;
  const natural = financeTableBodyHeightPx(rowCount, rowPx);
  if (canUnrollAll) return undefined;
  return Math.min(natural, rowCapPx);
}

function financeTableWrapProps(maxPx: number | undefined, rowCount: number, rowPx: number) {
  const natural = financeTableBodyHeightPx(rowCount, rowPx);
  const scrollable = maxPx != null && natural > maxPx;
  return {
    className: scrollable ? financeTableScrollClass : 'overflow-x-auto min-h-0',
    style: maxPx != null ? ({ maxHeight: maxPx } as const) : undefined,
  };
}

const financeTableScrollClass =
  'overflow-x-auto overflow-y-auto min-h-0 overscroll-y-contain';

const financeTableStickyHeadClass =
  'sticky top-0 z-10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm';

const transactionsInlinePanelClass =
  'mb-4 rounded-lg border border-blue-200/70 dark:border-blue-500/30 bg-blue-50/80 dark:bg-blue-950/30 p-4 shadow-sm';

interface TerminalFinanceCollapsiblesProps {
  /** Bookings column height (lg layout) — when tall enough, tables show all rows without scroll. */
  bookingsColumnHeight?: number;
}

export default function TerminalFinanceCollapsibles({
  bookingsColumnHeight,
}: TerminalFinanceCollapsiblesProps) {
  const { timeRange } = useTerminalTimeRange();
  const rangeLabel = dashboardPeriodLabel(timeRange);
  const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [failedLoading, setFailedLoading] = useState(true);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsHasMore, setPaymentsHasMore] = useState(false);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [recoveryPayment, setRecoveryPayment] = useState<FailedPayment | null>(null);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [brevoConnected, setBrevoConnected] = useState(false);
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningPayment, setAssigningPayment] = useState<string | null>(null);
  const [assignConfirmClient, setAssignConfirmClient] = useState<{ id: string; name: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);

  const [showManualPaymentModal, setShowManualPaymentModal] = useState(false);
  const [manualPaymentClients, setManualPaymentClients] = useState<Client[]>([]);
  const [manualPaymentClientsLoading, setManualPaymentClientsLoading] = useState(false);
  const [submittingManualPayment, setSubmittingManualPayment] = useState(false);
  const [manualPaymentError, setManualPaymentError] = useState<string | null>(null);
  const [manualPaymentForm, setManualPaymentForm] = useState({
    clientId: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    description: '',
    payment_method: '',
    receipt_url: '',
  });
  const [selectedManualPayment, setSelectedManualPayment] = useState<Payment | null>(null);

  const pageSize = 50;

  const loadFailed = useCallback(async () => {
    setFailedLoading(true);
    try {
      const failedParams = terminalFailedPaymentsParams(timeRange);
      const response = await apiClient.getStripeFailedPayments(
        1,
        50,
        true,
        true,
        failedParams.range,
        failedParams.scope
      );
      const arr = Array.isArray(response) ? response : [];
      setFailedPayments(
        arr.map((payment: Record<string, unknown>) => ({
          id: String(payment.id || payment.stripe_id),
          client_name: String(payment.client_name || payment.client_email || 'Unknown'),
          client_email: String(payment.client_email || ''),
          amount: (Number(payment.amount_cents) || 0) / 100,
          failed_at: payment.latest_attempt_at
            ? new Date(Number(payment.latest_attempt_at) * 1000).toISOString()
            : payment.created_at
              ? new Date(Number(payment.created_at) * 1000).toISOString()
              : new Date().toISOString(),
          failure_reason: String(payment.failure_reason || payment.status || 'Unknown'),
        }))
      );
    } catch {
      setFailedPayments([]);
    } finally {
      setFailedLoading(false);
    }
  }, [timeRange]);

  const loadPayments = useCallback(async (page = 1, append = false) => {
    setPaymentsLoading(true);
    try {
      const payParams = terminalStripePaymentsParams(timeRange);
      const data = await apiClient.getStripePayments(
        'succeeded',
        payParams.range,
        page,
        pageSize,
        payParams.useTreasury,
        true
      );
      const rows = Array.isArray(data) ? data : [];
      const sorted = [...rows].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      setPayments((prev) => (append ? [...prev, ...sorted] : sorted));
      setPaymentsHasMore(rows.length === pageSize);
      setPaymentsPage(page);
    } catch {
      if (!append) setPayments([]);
    } finally {
      setPaymentsLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    void loadFailed();
    void loadPayments(1);
    apiClient.getBrevoStatus().then((s) => setBrevoConnected(!!s?.connected)).catch(() => setBrevoConnected(false));
  }, [loadFailed, loadPayments]);

  useEffect(() => {
    if (!showManualPaymentModal) return;
    setManualPaymentError(null);
    setManualPaymentClientsLoading(true);
    apiClient
      .getClients()
      .then((list) => setManualPaymentClients(deduplicateClientsForAssign(list)))
      .catch(() => setManualPaymentClients([]))
      .finally(() => setManualPaymentClientsLoading(false));
  }, [showManualPaymentModal]);

  useEffect(() => {
    const handler = () => {
      void loadFailed();
      void loadPayments(1);
    };
    window.addEventListener(STRIPE_DATA_UPDATED_EVENT, handler);
    window.addEventListener(MANUAL_PAYMENT_CREATED_EVENT, handler);
    window.addEventListener(TERMINAL_DATA_REFRESHED_EVENT, handler);
    return () => {
      window.removeEventListener(STRIPE_DATA_UPDATED_EVENT, handler);
      window.removeEventListener(MANUAL_PAYMENT_CREATED_EVENT, handler);
      window.removeEventListener(TERMINAL_DATA_REFRESHED_EVENT, handler);
    };
  }, [loadFailed, loadPayments]);

  const getRecoveryEmailTemplate = (payment: FailedPayment) => {
    const subject = `Payment Issue - Action Required for ${formatCurrency(payment.amount)}`;
    const htmlContent = `<p>Dear ${payment.client_name},</p><p>Your payment of ${formatCurrency(payment.amount)} was unsuccessful. Please update your payment method.</p>`;
    return { subject, htmlContent, textContent: htmlContent };
  };

  const handleResolveFailedPayment = async (paymentId: string) => {
    if (
      !confirm(
        'Resolve this failed payment alert? It will be removed from the terminal queue but remain in Stripe.'
      )
    ) {
      return;
    }
    setResolving((prev) => new Set(prev).add(paymentId));
    try {
      const result = await apiClient.resolveFailedPaymentAlert(paymentId);
      setFailedPayments((prev) => prev.filter((p) => p.id !== paymentId));
      alert(result?.message || 'Failed payment alert resolved.');
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { detail?: string } } };
      alert(ax?.response?.data?.detail || 'Failed to resolve payment alert. Please try again.');
    } finally {
      setResolving((prev) => {
        const next = new Set(prev);
        next.delete(paymentId);
        return next;
      });
    }
  };

  const handleOpenAssignModal = async (paymentId: string) => {
    setSelectedManualPayment(null);
    setShowManualPaymentModal(false);
    setManualPaymentError(null);
    setAssigningPayment(paymentId);
    setSearchQuery('');
    setAssignError(null);
    setAssignConfirmClient(null);
    setLoadingClients(true);
    try {
      const allClients = await apiClient.getClients();
      setClients(deduplicateClientsForAssign(allClients));
      setShowAssignModal(true);
    } catch {
      setAssignError('Failed to load clients. Please try again.');
    } finally {
      setLoadingClients(false);
    }
  };

  const openManualPaymentCreate = () => {
    setSelectedManualPayment(null);
    setShowAssignModal(false);
    setAssigningPayment(null);
    setAssignConfirmClient(null);
    setSearchQuery('');
    setAssignError(null);
    setShowManualPaymentModal(true);
  };

  const openManualPaymentEdit = (payment: Payment) => {
    setShowManualPaymentModal(false);
    setManualPaymentError(null);
    setShowAssignModal(false);
    setAssigningPayment(null);
    setAssignConfirmClient(null);
    setSearchQuery('');
    setAssignError(null);
    setSelectedManualPayment(payment);
  };

  const closeAssignPanel = () => {
    setShowAssignModal(false);
    setAssigningPayment(null);
    setAssignConfirmClient(null);
    setSearchQuery('');
    setAssignError(null);
  };

  const handleAssignPayment = async (clientId: string) => {
    if (!assigningPayment) return;
    setAssigning(true);
    setAssignError(null);
    try {
      const result = await apiClient.assignPaymentToClient(assigningPayment, clientId, true);
      if (result?.stripe_data_updated_ms != null) {
        invalidateStripeAndTerminalAfterWebhook(result.stripe_data_updated_ms);
        window.dispatchEvent(new CustomEvent(STRIPE_DATA_UPDATED_EVENT));
      }
      await loadPayments(1);
      setShowAssignModal(false);
      setAssigningPayment(null);
      setAssignConfirmClient(null);
      setSearchQuery('');
      alert(`Payment assigned to ${result.client_name} successfully.`);
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { detail?: string } } };
      setAssignError(ax?.response?.data?.detail || 'Failed to assign payment to client.');
    } finally {
      setAssigning(false);
    }
  };

  const handleCreateManualPayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!manualPaymentForm.clientId) {
      setManualPaymentError('Search and select a client.');
      return;
    }
    const amount = parseFloat(manualPaymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualPaymentError('Enter a valid amount.');
      return;
    }
    setManualPaymentError(null);
    setSubmittingManualPayment(true);
    try {
      let paymentDateISO: string | undefined;
      if (manualPaymentForm.payment_date) {
        const [year, month, day] = manualPaymentForm.payment_date.split('-').map(Number);
        paymentDateISO = new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
      }
      await apiClient.createManualPayment(
        manualPaymentForm.clientId,
        amount,
        paymentDateISO,
        manualPaymentForm.description || undefined,
        manualPaymentForm.payment_method || undefined,
        manualPaymentForm.receipt_url || undefined
      );
      setManualPaymentForm({
        clientId: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        description: '',
        payment_method: '',
        receipt_url: '',
      });
      setShowManualPaymentModal(false);
      dispatchManualPaymentCreated();
      await loadPayments(1);
    } catch (error: unknown) {
      const ax = error as { response?: { data?: { detail?: string } } };
      setManualPaymentError(ax?.response?.data?.detail || 'Failed to create manual payment.');
    } finally {
      setSubmittingManualPayment(false);
    }
  };

  const filteredClients = clients.filter((client) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const name = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase();
    const email = (client.email || '').toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  const canUnrollAllFinanceTables = useMemo(() => {
    if (bookingsColumnHeight == null || bookingsColumnHeight <= 0) return false;
    const stackHeight = estimateFinanceStackHeight(
      failedPayments.length,
      payments.length,
      failedLoading,
      paymentsLoading,
      paymentsHasMore,
    );
    return bookingsColumnHeight + FINANCE_STACK_HEIGHT_TOLERANCE_PX >= stackHeight;
  }, [
    bookingsColumnHeight,
    failedPayments.length,
    payments.length,
    failedLoading,
    paymentsLoading,
    paymentsHasMore,
  ]);

  const failedTableMaxPx = cappedFinanceTableMaxPx(
    canUnrollAllFinanceTables,
    failedPayments.length,
    FINANCE_FAILED_ROW_PX,
    FAILED_PAYMENTS_TABLE_MAX_PX,
  );
  const transactionsTableMaxPx = cappedFinanceTableMaxPx(
    canUnrollAllFinanceTables,
    payments.length,
    FINANCE_TRANSACTION_ROW_PX,
    TRANSACTIONS_TABLE_MAX_PX,
  );
  const failedTableWrap = financeTableWrapProps(
    failedTableMaxPx,
    failedPayments.length,
    FINANCE_FAILED_ROW_PX,
  );
  const transactionsTableWrap = financeTableWrapProps(
    transactionsTableMaxPx,
    payments.length,
    FINANCE_TRANSACTION_ROW_PX,
  );

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <details className="group glass-card overflow-hidden" open>
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 p-4 min-w-0 shrink-0">
          <span className={sectionToggleClass}>{sectionChevron}</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">
            Failed payments
            <span className="ml-1.5 font-normal text-xs text-gray-500 dark:text-gray-400">
              ({rangeLabel.toLowerCase()})
            </span>
          </span>
          {!failedLoading && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200">
              {failedPayments.length}
            </span>
          )}
        </summary>
        <div className="px-4 pb-4 border-t border-white/10 pt-3">
          {failedLoading && <p className="text-sm text-gray-500">Loading…</p>}
          {!failedLoading && failedPayments.length === 0 && (
            <p className="text-sm text-gray-500">No failed payments in queue</p>
          )}
          {!failedLoading && failedPayments.length > 0 && (
            <div className={failedTableWrap.className} style={failedTableWrap.style}>
              <table className="min-w-full text-sm">
                <thead className={financeTableStickyHeadClass}>
                  <tr className="text-left text-xs text-gray-500 border-b border-white/10">
                    <th className="py-2 pr-2">Customer</th>
                    <th className="py-2 pr-2">Amount</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {failedPayments.map((p) => (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className="py-2 pr-2">
                        <div className="font-medium">{p.client_name}</div>
                        <div className="text-xs text-gray-500">{p.client_email}</div>
                      </td>
                      <td className="py-2 pr-2 tabular-nums">{formatCurrency(p.amount)}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {brevoConnected && p.client_email ? (
                            <button
                              type="button"
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                              onClick={() => {
                                setRecoveryPayment(p);
                                setShowEmailComposer(true);
                              }}
                            >
                              Recover
                            </button>
                          ) : (
                            <span
                              className="text-xs text-gray-400"
                              title={
                                !brevoConnected
                                  ? 'Connect Brevo in Integrations to send recovery emails'
                                  : 'No email on file'
                              }
                            >
                              Recover
                            </span>
                          )}
                          <button
                            type="button"
                            className="text-xs text-gray-700 dark:text-gray-300 hover:underline disabled:opacity-50"
                            disabled={resolving.has(p.id)}
                            onClick={() => void handleResolveFailedPayment(p.id)}
                            title="Dismiss from terminal queue (still visible in Stripe)"
                          >
                            {resolving.has(p.id) ? 'Resolving…' : 'Resolve'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <details className="group glass-card overflow-hidden" open>
        <summary className="cursor-pointer select-none list-none flex items-center gap-2 p-4 min-w-0 shrink-0">
          <span className={sectionToggleClass}>{sectionChevron}</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-1">
            Recent transactions
            <span className="ml-1.5 font-normal text-xs text-gray-500 dark:text-gray-400">
              ({rangeLabel.toLowerCase()})
            </span>
          </span>
          {!paymentsLoading && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
              {payments.length}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openManualPaymentCreate();
            }}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md shrink-0"
          >
            + Manual payment
          </button>
        </summary>
        <div className="px-4 pb-4 border-t border-white/10 pt-3">
          {showManualPaymentModal && (
            <div className={transactionsInlinePanelClass}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add manual payment</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowManualPaymentModal(false);
                    setManualPaymentError(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={(e) => void handleCreateManualPayment(e)} className="space-y-3">
                {manualPaymentError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{manualPaymentError}</p>
                )}
                <ClientSearchCombobox
                  clients={manualPaymentClients}
                  loading={manualPaymentClientsLoading}
                  clientId={manualPaymentForm.clientId}
                  onClientIdChange={(id) => setManualPaymentForm((f) => ({ ...f, clientId: id }))}
                  resetKey={showManualPaymentModal}
                  inputId="manual-payment-client-search"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Amount ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={manualPaymentForm.amount}
                      onChange={(e) => setManualPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                      className="w-full rounded-md glass-input sm:text-sm"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Payment date
                    </label>
                    <input
                      type="date"
                      required
                      value={manualPaymentForm.payment_date}
                      onChange={(e) => setManualPaymentForm((f) => ({ ...f, payment_date: e.target.value }))}
                      className="w-full rounded-md glass-input sm:text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Payment method (optional)
                  </label>
                  <select
                    value={manualPaymentForm.payment_method}
                    onChange={(e) => setManualPaymentForm((f) => ({ ...f, payment_method: e.target.value }))}
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
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={manualPaymentForm.description}
                    onChange={(e) => setManualPaymentForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full rounded-md glass-input sm:text-sm"
                    rows={2}
                    placeholder="Payment notes…"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Receipt URL (optional)
                  </label>
                  <input
                    type="url"
                    value={manualPaymentForm.receipt_url}
                    onChange={(e) => setManualPaymentForm((f) => ({ ...f, receipt_url: e.target.value }))}
                    className="w-full rounded-md glass-input sm:text-sm"
                    placeholder="https://…"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowManualPaymentModal(false);
                      setManualPaymentError(null);
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingManualPayment || manualPaymentClientsLoading}
                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {submittingManualPayment ? 'Adding…' : 'Add payment'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {selectedManualPayment && (
            <ManualPaymentDetailModal
              payment={selectedManualPayment}
              isOpen
              variant="inline"
              onClose={() => setSelectedManualPayment(null)}
              onSaved={async () => {
                dispatchManualPaymentCreated();
                setPaymentsPage(1);
                await loadPayments(1);
              }}
              onDeleted={async () => {
                dispatchManualPaymentCreated();
                setPaymentsPage(1);
                await loadPayments(1);
              }}
            />
          )}

          {showAssignModal && assigningPayment && (
            <div className={transactionsInlinePanelClass}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Assign payment to client
                </h3>
                <button
                  type="button"
                  onClick={closeAssignPanel}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>

              {assignError && (
                <p className="text-sm text-red-600 dark:text-red-400 mb-3">{assignError}</p>
              )}

              {assignConfirmClient ? (
                <div className="rounded-md border border-gray-200/80 dark:border-white/10 bg-white/60 dark:bg-white/[0.04] p-3">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    Assign this payment to <strong>{assignConfirmClient.name}</strong>?
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setAssignConfirmClient(null)}
                      disabled={assigning}
                      className="px-3 py-1.5 text-sm rounded border dark:border-gray-600"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAssignPayment(assignConfirmClient.id)}
                      disabled={assigning}
                      className="px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                    >
                      {assigning ? 'Assigning…' : 'Confirm assign'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Search clients by name or email…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-2 mb-3 rounded-md glass-input sm:text-sm"
                  />
                  {loadingClients ? (
                    <p className="text-sm text-gray-500 py-4 text-center">Loading clients…</p>
                  ) : filteredClients.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No clients found.</p>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto overscroll-y-contain">
                      {filteredClients.map((client) => {
                        const displayName =
                          [client.first_name, client.last_name].filter(Boolean).join(' ') ||
                          client.email ||
                          'Unnamed client';
                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => setAssignConfirmClient({ id: client.id, name: displayName })}
                            className="w-full text-left p-2.5 rounded-md border border-gray-200/80 dark:border-white/10 hover:bg-white/60 dark:hover:bg-white/[0.04]"
                          >
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{displayName}</div>
                            {client.email && (
                              <div className="text-xs text-gray-500 dark:text-gray-400">{client.email}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {paymentsLoading && payments.length === 0 && <p className="text-sm text-gray-500">Loading…</p>}
          {!paymentsLoading && payments.length === 0 && (
            <p className="text-sm text-gray-500">No recent transactions</p>
          )}
          {payments.length > 0 && (
            <>
              <div className={transactionsTableWrap.className} style={transactionsTableWrap.style}>
                <table className="min-w-full text-sm">
                  <thead className={financeTableStickyHeadClass}>
                    <tr className="text-left text-xs text-gray-500 border-b border-white/10">
                      <th className="py-2 pr-2">Date</th>
                      <th className="py-2 pr-2">Customer</th>
                      <th className="py-2 pr-2">Amount</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const isManual = isManualStripePaymentRow(p);
                      return (
                      <tr
                        key={p.id}
                        className={`border-b border-white/5 ${isManual ? 'cursor-pointer hover:bg-white/[0.04]' : ''}`}
                        onClick={() => {
                          if (isManual) openManualPaymentEdit(p);
                        }}
                      >
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {p.created_at
                            ? new Date(p.created_at * 1000).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="py-2 pr-2 min-w-0">
                          <div className="font-medium truncate max-w-[120px]">
                            {p.client_name || p.client_email || 'Unknown'}
                          </div>
                          {p.client_email && p.client_name && (
                            <div className="text-xs text-gray-500 truncate max-w-[120px]">{p.client_email}</div>
                          )}
                        </td>
                        <td className="py-2 pr-2 tabular-nums whitespace-nowrap">
                          {formatCurrency((p.amount_cents || 0) / 100)}
                        </td>
                        <td className="py-2">
                          {isManual ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openManualPaymentEdit(p);
                              }}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Edit
                            </button>
                          ) : !p.client_id ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleOpenAssignModal(p.id);
                              }}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Assign
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">Linked</span>
                          )}
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
              {paymentsHasMore && (
                <button
                  type="button"
                  disabled={paymentsLoading}
                  onClick={() => loadPayments(paymentsPage + 1, true)}
                  className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </details>

      {showEmailComposer && recoveryPayment && (
        <EmailComposer
          recipients={
            recoveryPayment.client_email
              ? [{ email: recoveryPayment.client_email, name: recoveryPayment.client_name }]
              : []
          }
          onClose={() => {
            setShowEmailComposer(false);
            setRecoveryPayment(null);
          }}
          onSuccess={() => {
            setShowEmailComposer(false);
            setRecoveryPayment(null);
            loadFailed();
          }}
          initialSubject={getRecoveryEmailTemplate(recoveryPayment).subject}
          initialHtmlContent={getRecoveryEmailTemplate(recoveryPayment).htmlContent}
          initialTextContent={getRecoveryEmailTemplate(recoveryPayment).textContent}
        />
      )}
    </div>
  );
}
