import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import EmailComposer from '../brevo/EmailComposer';

interface FailedPayment {
  id: string;
  client_name: string;
  client_email: string;
  amount: number;
  failed_at: string;
  failure_reason?: string;
}

interface BrevoStatus {
  connected: boolean;
  account_email?: string;
  account_name?: string;
}

interface FailedPaymentQueueProps {
  onLoadComplete?: () => void;
}

export default function FailedPaymentQueue({ onLoadComplete }: FailedPaymentQueueProps = {}) {
  const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [recoveryPayment, setRecoveryPayment] = useState<FailedPayment | null>(null);
  const [brevoStatus, setBrevoStatus] = useState<BrevoStatus | null>(null);
  const hasCalledOnLoadComplete = useRef(false);

  useEffect(() => {
    loadFailedPayments();
    loadBrevoStatus();
  }, []);

  const loadBrevoStatus = async () => {
    try {
      const status = await apiClient.getBrevoStatus();
      setBrevoStatus(status);
    } catch (error) {
      console.error('Failed to load Brevo status:', error);
      setBrevoStatus({ connected: false });
    }
  };

  const loadFailedPayments = async () => {
    try {
      setLoading(true);
      // Get failed payments from Stripe
      // The API returns a list directly, not wrapped in a 'payments' key
      // Pass exclude_resolved=true to filter out resolved payments from terminal queue
      const response = await apiClient.getStripeFailedPayments(1, 10, true);
      
      console.log('[FailedPaymentQueue] API response:', response);
      console.log('[FailedPaymentQueue] Response type:', typeof response, 'Is array:', Array.isArray(response));
      
      // The API returns a list directly, not wrapped in a 'payments' key
      const paymentsArray = Array.isArray(response) ? response : [];
      
      console.log('[FailedPaymentQueue] Payments array length:', paymentsArray.length);
      
      // Transform the data to match our interface
      const payments: FailedPayment[] = paymentsArray.map((payment: any) => {
        console.log('[FailedPaymentQueue] Processing payment:', payment);
        return {
          id: payment.id || payment.stripe_id,
          client_name: payment.client_name || 'Unknown',
          client_email: payment.client_email || '',
          amount: (payment.amount_cents || 0) / 100,
          // Use latest_attempt_at if available, otherwise fall back to created_at
          failed_at: payment.latest_attempt_at 
            ? new Date(payment.latest_attempt_at * 1000).toISOString()
            : payment.created_at 
            ? new Date(payment.created_at * 1000).toISOString()
            : new Date().toISOString(),
          failure_reason: payment.failure_reason || payment.status || 'Unknown',
        };
      });
      
      console.log('[FailedPaymentQueue] Transformed payments:', payments);
      setFailedPayments(payments);
    } catch (error) {
      console.error('Failed to load failed payments:', error);
      // If API fails, set empty array
      setFailedPayments([]);
    } finally {
      setLoading(false);
      if (!hasCalledOnLoadComplete.current && onLoadComplete) {
        hasCalledOnLoadComplete.current = true;
        onLoadComplete();
      }
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const handleRecover = (payment: FailedPayment) => {
    if (!payment.client_email) {
      alert('This payment has no associated email address. Cannot send recovery email.');
      return;
    }
    setRecoveryPayment(payment);
    setShowEmailComposer(true);
  };

  const getRecoveryEmailTemplate = (payment: FailedPayment) => {
    const subject = `Payment Issue - Action Required for ${formatCurrency(payment.amount)}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Payment Issue - Action Required</h2>
        <p>Dear ${payment.client_name || 'Valued Customer'},</p>
        <p>We noticed that a recent payment attempt for <strong>${formatCurrency(payment.amount)}</strong> was unsuccessful.</p>
        <p><strong>Payment Details:</strong></p>
        <ul>
          <li>Amount: ${formatCurrency(payment.amount)}</li>
          <li>Failed Date: ${formatDate(payment.failed_at)}</li>
          ${payment.failure_reason ? `<li>Reason: ${payment.failure_reason}</li>` : ''}
        </ul>
        <p>To resolve this issue, please:</p>
        <ol>
          <li>Verify your payment method is up to date</li>
          <li>Ensure sufficient funds are available</li>
          <li>Contact us if you need assistance updating your payment information</li>
        </ol>
        <p>If you have any questions or need help, please don't hesitate to reach out to us.</p>
        <p>Best regards,<br>Your Team</p>
      </div>
    `;
    const textContent = `
Payment Issue - Action Required

Dear ${payment.client_name || 'Valued Customer'},

We noticed that a recent payment attempt for ${formatCurrency(payment.amount)} was unsuccessful.

Payment Details:
- Amount: ${formatCurrency(payment.amount)}
- Failed Date: ${formatDate(payment.failed_at)}
${payment.failure_reason ? `- Reason: ${payment.failure_reason}` : ''}

To resolve this issue, please:
1. Verify your payment method is up to date
2. Ensure sufficient funds are available
3. Contact us if you need assistance updating your payment information

If you have any questions or need help, please don't hesitate to reach out to us.

Best regards,
Your Team
    `;
    return { subject, htmlContent, textContent };
  };

  const handleResolve = async (paymentId: string) => {
    if (!confirm('Are you sure you want to resolve this failed payment alert? It will be removed from the terminal queue but will remain in the Stripe dashboard.')) {
      return;
    }

    setResolving(prev => new Set(prev).add(paymentId));
    try {
      const result = await apiClient.resolveFailedPaymentAlert(paymentId);
      
      // Remove the resolved payment from the list (it will be filtered out on next load)
      setFailedPayments(prev => prev.filter(p => p.id !== paymentId));
      
      // Show success message
      alert(result?.message || 'Failed payment alert resolved. It will no longer appear in the terminal queue.');
    } catch (error: any) {
      console.error('Failed to resolve payment alert:', error);
      alert(error?.response?.data?.detail || 'Failed to resolve payment alert. Please try again.');
    } finally {
      setResolving(prev => {
        const next = new Set(prev);
        next.delete(paymentId);
        return next;
      });
    }
  };

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
          Failed Payment Queue
        </h3>
        <span className="text-xs text-gray-500 dark:text-gray-400 digitized-text">
          Quick Actions (Coming Soon)
        </span>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : failedPayments.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No failed payments found. Great job! 🎉
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {failedPayments.map((payment) => (
            <div
              key={payment.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 sm:p-4 glass-panel rounded-lg border border-red-500/20"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {payment.client_name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {payment.client_email || 'No email'}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Failed: {formatDate(payment.failed_at)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 sm:space-x-4 sm:gap-0">
                <div className="text-left sm:text-right w-full sm:w-auto">
                  <p className="text-lg font-bold text-red-500 dark:text-red-400">
                    {formatCurrency(payment.amount)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {brevoStatus?.connected && payment.client_email ? (
                    <button
                      onClick={() => handleRecover(payment)}
                      className="min-h-[44px] px-4 py-2 text-sm glass-button-secondary rounded hover:bg-white/20 transition-colors"
                      title="Send payment recovery email via Brevo"
                    >
                      Recover
                    </button>
                  ) : (
                    <button
                      disabled
                      className="min-h-[44px] px-4 py-2 text-sm glass-button-secondary rounded opacity-50 cursor-not-allowed"
                      title={!brevoStatus?.connected ? "Brevo not connected" : "No email address available"}
                    >
                      Recover
                    </button>
                  )}
                  <button
                    onClick={() => handleResolve(payment.id)}
                    disabled={resolving.has(payment.id)}
                    className="min-h-[44px] px-4 py-2 text-sm glass-button-secondary rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/20 transition-colors"
                    title="Resolve this failed payment alert"
                  >
                    {resolving.has(payment.id) ? 'Resolving...' : 'Resolve'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Email Composer Modal for Payment Recovery */}
      {showEmailComposer && recoveryPayment && (
        <EmailComposer
          recipients={recoveryPayment.client_email ? [{ email: recoveryPayment.client_email, name: recoveryPayment.client_name }] : []}
          onClose={() => {
            setShowEmailComposer(false);
            setRecoveryPayment(null);
          }}
          onSuccess={() => {
            setShowEmailComposer(false);
            setRecoveryPayment(null);
            // Optionally reload failed payments
            loadFailedPayments();
          }}
          initialSubject={recoveryPayment ? getRecoveryEmailTemplate(recoveryPayment).subject : undefined}
          initialHtmlContent={recoveryPayment ? getRecoveryEmailTemplate(recoveryPayment).htmlContent : undefined}
          initialTextContent={recoveryPayment ? getRecoveryEmailTemplate(recoveryPayment).textContent : undefined}
        />
      )}
    </div>
  );
}

