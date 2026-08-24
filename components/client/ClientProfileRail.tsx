'use client';

import type { Client, ClientPaymentsResponse } from '@/types/client';
import { isProgramProgressVisible, resolveProgramTimelineFromInputs } from '@/lib/clientProgram';
import type { LeadFollowUpBar } from '@/lib/leadFollowUp';
import OfferEnrollmentSection from './OfferEnrollmentSection';

export type ClientProfileFormData = {
  first_name: string;
  last_name: string;
  email: string;
  emails: string[];
  phone: string;
  instagram: string;
  program_start_date: string;
  program_end_date: string;
  follow_up_due_date: string;
};

interface ClientProfileRailProps {
  client: Client;
  formData: ClientProfileFormData;
  setFormData: React.Dispatch<React.SetStateAction<ClientProfileFormData>>;
  fieldBlurSave: () => void;
  saveClientFields: (data?: ClientProfileFormData) => Promise<void>;
  isLead: boolean;
  followUpBar: LeadFollowUpBar | null;
  payments: ClientPaymentsResponse | null;
  paymentsLoading: boolean;
  totalPaid: number;
  recordedPaidCents: number;
  planContractCents: number;
  planOwedCents: number | null;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string | null | undefined) => string;
  nextCheckIn: {
    title: string;
    start_time: string;
    meeting_url?: string;
  } | null;
  onOpenCalendar: () => void;
  onAddManualPayment: () => void;
  onDeleteManualPayment: (paymentId: string) => Promise<void>;
  deletingPaymentId: string | null;
  onClientSaved?: (client: Client) => void;
  onReloadPayments?: () => void;
}

export default function ClientProfileRail({
  client,
  formData,
  setFormData,
  fieldBlurSave,
  saveClientFields,
  isLead,
  followUpBar,
  payments,
  paymentsLoading,
  totalPaid,
  recordedPaidCents,
  planContractCents,
  planOwedCents,
  formatCurrency,
  formatDate,
  nextCheckIn,
  onOpenCalendar,
  onAddManualPayment,
  onDeleteManualPayment,
  deletingPaymentId,
  onClientSaved,
  onReloadPayments,
}: ClientProfileRailProps) {
  const timelineFromForm = resolveProgramTimelineFromInputs(
    formData.program_start_date,
    formData.program_end_date,
  );
  const displayClient: Client = { ...client, ...timelineFromForm };

  return (
    <div className="space-y-5 py-4 px-4 sm:px-5">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          Contact
        </h3>
        <dl className="space-y-3">
          <div>
            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">First name</dt>
            <input
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
              onBlur={fieldBlurSave}
              className="mt-0.5 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Last name</dt>
            <input
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
              onBlur={fieldBlurSave}
              className="mt-0.5 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Primary email</dt>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              onBlur={fieldBlurSave}
              className="mt-0.5 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Additional emails</dt>
            <div className="space-y-1.5">
              {formData.emails.map((e, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <input
                    type="email"
                    value={e}
                    onChange={(ev) => {
                      const next = [...formData.emails];
                      next[i] = ev.target.value;
                      setFormData({ ...formData, emails: next });
                    }}
                    onBlur={fieldBlurSave}
                    className="flex-1 rounded-md glass-input text-sm focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const next = {
                        ...formData,
                        emails: formData.emails.filter((_, j) => j !== i),
                      };
                      setFormData(next);
                      void saveClientFields(next);
                    }}
                    className="text-red-400 hover:text-red-600 text-xs shrink-0"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setFormData({ ...formData, emails: [...formData.emails, ''] })}
                className="text-xs text-primary-500 hover:text-primary-600"
              >
                + Add email
              </button>
            </div>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Phone</dt>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              onBlur={fieldBlurSave}
              placeholder="+1234567890"
              className="mt-0.5 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Instagram</dt>
            <input
              type="text"
              value={formData.instagram}
              onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
              onBlur={fieldBlurSave}
              placeholder="@username"
              className="mt-0.5 block w-full rounded-md glass-input focus:border-blue-500 focus:ring-blue-500 text-sm"
            />
          </div>
        </dl>
      </div>

      <div className="border-t border-gray-200 dark:border-white/10 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          Program timeline
        </h3>
        <dl className="space-y-3">
          <div>
            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Start</dt>
            <input
              type="date"
              value={formData.program_start_date}
              onChange={(e) => setFormData({ ...formData, program_start_date: e.target.value })}
              onBlur={fieldBlurSave}
              className="mt-0.5 block w-full rounded-md glass-input text-sm"
            />
          </div>
          <div>
            <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">End</dt>
            <input
              type="date"
              value={formData.program_end_date}
              onChange={(e) => setFormData({ ...formData, program_end_date: e.target.value })}
              onBlur={fieldBlurSave}
              min={formData.program_start_date || undefined}
              className="mt-0.5 block w-full rounded-md glass-input text-sm"
            />
            <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
              Auto offboarding at 75%, dead when expired
            </p>
          </div>
          {client.program_duration_days || timelineFromForm.program_duration_days ? (
            <div>
              <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Duration</dt>
              <dd className="text-sm text-gray-900 dark:text-gray-100">
                {(timelineFromForm.program_duration_days ?? client.program_duration_days) ?? 0} days
              </dd>
            </div>
          ) : null}
          {!isLead && isProgramProgressVisible(displayClient) ? (
            <div>
              <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Progress</dt>
              {(() => {
                const pct = displayClient.program_progress_percent ?? 0;
                return (
                  <>
                    <div className="flex justify-between text-xs mb-1">
                      <span>{pct.toFixed(1)}%</span>
                      <span className="text-gray-500">
                        {pct >= 100 ? 'Expired' : pct >= 75 ? 'Offboarding' : 'Active'}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          pct >= 100 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                      />
                    </div>
                  </>
                );
              })()}
            </div>
          ) : null}
          {isLead ? (
            <div>
              <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Follow-up due</dt>
              <input
                type="date"
                value={formData.follow_up_due_date}
                onChange={(e) => setFormData({ ...formData, follow_up_due_date: e.target.value })}
                onBlur={fieldBlurSave}
                className="mt-0.5 block w-full rounded-md glass-input text-sm"
              />
            </div>
          ) : null}
          {isLead && followUpBar ? (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>{followUpBar.percent.toFixed(1)}% to due</span>
                <span>{followUpBar.percent >= 100 ? 'Due' : 'Open'}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    followUpBar.percent >= 100
                      ? 'bg-red-500'
                      : followUpBar.percent >= 75
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, followUpBar.percent))}%` }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">{followUpBar.subtitle}</p>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="border-t border-gray-200 dark:border-white/10 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
          Financial
        </h3>
        <dl className="space-y-2">
          <div>
            <dt className="text-[10px] uppercase text-gray-500 dark:text-gray-400">Total paid</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatCurrency(totalPaid)}</dd>
          </div>
          {client.offer_enrollment?.slot && planContractCents > 0 ? (
            <div className="rounded-lg bg-gray-50/80 dark:bg-white/[0.04] px-2.5 py-2 text-xs space-y-0.5">
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {client.offer_enrollment.name_snapshot ||
                  client.offer_enrollment.slot.replace(/:/g, ' · ')}
              </p>
              <p className="tabular-nums text-gray-600 dark:text-gray-400">
                Contract {formatCurrency(planContractCents / 100)} · Paid{' '}
                {formatCurrency(recordedPaidCents / 100)}
                {planOwedCents != null ? ` · Owed ${formatCurrency(planOwedCents / 100)}` : ''}
              </p>
            </div>
          ) : null}
          <div>
            <dt className="text-[10px] uppercase text-gray-500 dark:text-gray-400">Est. MRR</dt>
            <dd className="text-sm tabular-nums">{formatCurrency(client.estimated_mrr || 0)}</dd>
          </div>
        </dl>
        <div className="mt-3">
          <OfferEnrollmentSection
            client={client}
            recordedPaidCents={recordedPaidCents}
            minimal
            onSaved={(updated) => {
              if (updated) onClientSaved?.(updated);
              else onReloadPayments?.();
            }}
          />
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-white/10 pt-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Payments
          </h3>
          <button
            type="button"
            onClick={onAddManualPayment}
            className="text-[10px] px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
          >
            + Manual
          </button>
        </div>
        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
          {paymentsLoading ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : payments && payments.payments.length > 0 ? (
            payments.payments.map((payment) => (
              <div
                key={payment.id}
                className="p-2 rounded-lg border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/[0.02] text-xs"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium tabular-nums">
                    {formatCurrency(payment.amount)}
                    {payment.type === 'manual_payment' ? (
                      <span className="ml-1 text-blue-600 dark:text-blue-400">(M)</span>
                    ) : null}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      payment.status === 'succeeded'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {payment.status}
                  </span>
                </div>
                <p className="text-gray-500 mt-0.5">
                  {payment.created_at ? formatDate(payment.created_at) : '—'}
                </p>
                {payment.type === 'manual_payment' ? (
                  <button
                    type="button"
                    onClick={() => void onDeleteManualPayment(payment.id)}
                    disabled={deletingPaymentId === payment.id}
                    className="mt-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    {deletingPaymentId === payment.id ? 'Deleting…' : 'Delete'}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-xs text-gray-500">No payments</p>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-white/10 pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
          Check-ins
        </h3>
        {nextCheckIn ? (
          <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/80 dark:bg-green-900/20 p-2.5 text-xs">
            <p className="font-semibold text-gray-900 dark:text-gray-100">{nextCheckIn.title}</p>
            <p className="text-gray-600 dark:text-gray-400 mt-0.5">
              {new Date(nextCheckIn.start_time).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
            {nextCheckIn.meeting_url ? (
              <a
                href={nextCheckIn.meeting_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline mt-1 inline-block"
              >
                Join →
              </a>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">No upcoming check-ins.</p>
        )}
        <button
          type="button"
          onClick={onOpenCalendar}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-green-300 dark:border-green-500/50 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 hover:bg-green-100 dark:hover:bg-green-900/30"
        >
          Open calendar
        </button>
      </div>

      <div className="border-t border-gray-200 dark:border-white/10 pt-4 pb-2">
        <dl className="space-y-2 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500 dark:text-gray-400">Lifecycle</dt>
            <dd>
              <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                {client.lifecycle_state.replace(/_/g, ' ')}
              </span>
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500 dark:text-gray-400">Last activity</dt>
            <dd className="text-gray-900 dark:text-gray-100">{formatDate(client.last_activity_at)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-gray-500 dark:text-gray-400">Created</dt>
            <dd className="text-gray-900 dark:text-gray-100">{formatDate(client.created_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
