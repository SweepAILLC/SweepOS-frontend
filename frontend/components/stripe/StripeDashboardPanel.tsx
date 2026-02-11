import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { cache } from '@/lib/cache';
import { Client } from '@/types/client';
import { StripeSummary, RevenueTimeline, ChurnData, MRRTrend, Payment, FailedPayment } from '@/types/integration';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import EmailComposer from '../brevo/EmailComposer';
import { useLoading } from '@/contexts/LoadingContext';

interface StripeDashboardPanelProps {
  userRole?: string; // 'owner' | 'admin' | 'member'
}

export default function StripeDashboardPanel({ userRole = 'member' }: StripeDashboardPanelProps) {
  const { setLoading: setGlobalLoading } = useLoading();
  const [summary, setSummary] = useState<StripeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Check if user can manage integrations (admin or owner only)
  // Normalize role to lowercase for comparison - be explicit about member check
  const roleLower = String(userRole || 'member').toLowerCase().trim();
  // Explicitly check - only admin and owner can manage, members cannot
  // If role is member or anything other than admin/owner, cannot manage
  const canManageIntegrations = roleLower === 'admin' || roleLower === 'owner';
  const [revenueTimeline, setRevenueTimeline] = useState<RevenueTimeline | null>(null);
  const [churnData, setChurnData] = useState<ChurnData | null>(null);
  const [mrrTrend, setMrrTrend] = useState<MRRTrend | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [failedPayments, setFailedPayments] = useState<FailedPayment[]>([]);
  const [timeRange, setTimeRange] = useState<number | 'all'>(30);
  const [showManualOAuth, setShowManualOAuth] = useState(false);
  const [manualOAuthCode, setManualOAuthCode] = useState('');
  const [completingManual, setCompletingManual] = useState(false);
  const [showDirectApiKey, setShowDirectApiKey] = useState(true); // Default to showing API key
  const [directApiKey, setDirectApiKey] = useState('');
  const [connectingDirect, setConnectingDirect] = useState(false);
  // OAuth temporarily disabled - only API key available
  
  // Duplicate payment management
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicates, setDuplicates] = useState<any>(null);
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [mergingDuplicates, setMergingDuplicates] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<Set<string>>(new Set());
  
  // Payment assignment management
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningPayment, setAssigningPayment] = useState<string | null>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Recovery email management
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [recoveryPayment, setRecoveryPayment] = useState<FailedPayment | null>(null);
  const [brevoStatus, setBrevoStatus] = useState<{ connected: boolean } | null>(null);

  // Payments table pagination (prevents "missing" rows when range includes lots of payments)
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsHasMore, setPaymentsHasMore] = useState(false);
  const paymentsPageSize = 100;

  useEffect(() => {
    checkConnectionAndLoad();
    loadBrevoStatus();
  }, [timeRange]);

  const loadBrevoStatus = async () => {
    try {
      const status = await apiClient.getBrevoStatus();
      setBrevoStatus(status);
    } catch (error) {
      console.error('Failed to load Brevo status:', error);
      setBrevoStatus({ connected: false });
    }
  };

  const checkConnectionAndLoad = async () => {
    setLoading(true);
    setGlobalLoading(true, 'Loading Stripe dashboard...');
    setError(null);
    try {
      const status = await apiClient.getStripeStatus();
      setIsConnected(status.connected);
      if (status.connected) {
        await loadSummaryOnly();
        setTimeout(() => loadChartsAndPayments(), 150);
      } else {
        setLoading(false);
        setGlobalLoading(false);
      }
    } catch (error: any) {
      console.error('Failed to check Stripe status:', error);
      setIsConnected(false);
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const loadSummaryOnly = async () => {
    setError(null);
    setLoading(true);
    try {
      const summaryRange = timeRange === 'all' ? 365 : timeRange;
      const summaryData = await apiClient.getStripeSummary(summaryRange);
      setSummary(summaryData);
      setIsConnected(true);
    } catch (error: any) {
      console.error('❌ Failed to load Stripe summary:', error);
      if (error?.response?.status === 404) {
        setIsConnected(false);
        setSummary(null);
        try {
          const status = await apiClient.getStripeStatus();
          setIsConnected(status.connected);
        } catch {
          setIsConnected(false);
        }
      } else if (error?.response?.status === 401) {
        setError('Please log in to view Stripe data');
        setIsConnected(false);
      } else {
        setError(error?.response?.data?.detail || error?.message || 'Failed to load Stripe data');
        setIsConnected(false);
      }
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const loadChartsAndPayments = async () => {
    try {
      const alignedRangeDays = timeRange === 'all' ? 365 : timeRange;
      const useTreasuryForPayments = timeRange === 'all' ? false : true;
      setPaymentsPage(1);
      const [revenue, churn, mrr, paymentsData, failedData] = await Promise.all([
        apiClient.getStripeRevenueTimeline(alignedRangeDays, 'day'),
        apiClient.getStripeChurn(6),
        apiClient.getStripeMRRTrend(alignedRangeDays, 'day'),
        apiClient.getStripePayments('succeeded', alignedRangeDays, 1, paymentsPageSize, useTreasuryForPayments),
        apiClient.getStripeFailedPayments(1, 20),
      ]);
      setRevenueTimeline(revenue);
      setChurnData(churn);
      setMrrTrend(mrr);
      const sortedPayments = [...(paymentsData || [])].sort((a, b) => {
        const dateA = (a as any).created_at || 0;
        const dateB = (b as any).created_at || 0;
        return dateB - dateA;
      });
      setPayments(sortedPayments);
      setPaymentsHasMore(Array.isArray(paymentsData) && paymentsData.length === paymentsPageSize);
      setFailedPayments(failedData || []);
    } catch (error: any) {
      console.error('Failed to load Stripe charts/payments:', error);
    }
  };

  const loadAllData = async () => {
    setError(null);
    setLoading(true);
    setGlobalLoading(true, 'Loading Stripe dashboard...');
    try {
      const summaryRange = timeRange === 'all' ? 365 : timeRange;
      const summaryData = await apiClient.getStripeSummary(summaryRange);
      setSummary(summaryData);
      setIsConnected(true);
      const alignedRangeDays = timeRange === 'all' ? 365 : timeRange;
      const useTreasuryForPayments = timeRange === 'all' ? false : true;
      setPaymentsPage(1);
      const [revenue, churn, mrr, paymentsData, failedData] = await Promise.all([
        apiClient.getStripeRevenueTimeline(alignedRangeDays, 'day'),
        apiClient.getStripeChurn(6),
        apiClient.getStripeMRRTrend(alignedRangeDays, 'day'),
        apiClient.getStripePayments('succeeded', alignedRangeDays, 1, paymentsPageSize, useTreasuryForPayments),
        apiClient.getStripeFailedPayments(1, 20),
      ]);
      setRevenueTimeline(revenue);
      setChurnData(churn);
      setMrrTrend(mrr);
      const sortedPayments = [...(paymentsData || [])].sort((a, b) => {
        const dateA = (a as any).created_at || 0;
        const dateB = (b as any).created_at || 0;
        return dateB - dateA;
      });
      setPayments(sortedPayments);
      setPaymentsHasMore(Array.isArray(paymentsData) && paymentsData.length === paymentsPageSize);
      setFailedPayments(failedData || []);
    } catch (error: any) {
      console.error('❌ Failed to load Stripe data:', error);
      if (error?.response?.status === 404) {
        setIsConnected(false);
        setSummary(null);
        try {
          const status = await apiClient.getStripeStatus();
          setIsConnected(status.connected);
        } catch {
          setIsConnected(false);
        }
      } else if (error?.response?.status === 401) {
        setError('Please log in to view Stripe data');
        setIsConnected(false);
      } else {
        setError(error?.response?.data?.detail || error?.message || 'Failed to load Stripe data');
        setIsConnected(false);
      }
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const handleLoadMorePayments = async () => {
    try {
      const alignedRangeDays = timeRange === 'all' ? 365 : timeRange;
      const useTreasuryForPayments = timeRange === 'all' ? false : true;

      const nextPage = paymentsPage + 1;
      const nextPayments = await apiClient.getStripePayments(
        'succeeded',
        alignedRangeDays,
        nextPage,
        paymentsPageSize,
        useTreasuryForPayments
      );

      const nextList = Array.isArray(nextPayments) ? nextPayments : [];
      const combined = [...payments, ...nextList];
      combined.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

      setPayments(combined);
      setPaymentsPage(nextPage);
      setPaymentsHasMore(nextList.length === paymentsPageSize);
    } catch (error: any) {
      console.error('Failed to load more payments:', error);
      setError(error?.response?.data?.detail || 'Failed to load more payments.');
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const response = await apiClient.startStripeOAuth();
      // Open OAuth URL in new tab
      // Use a unique window name to prevent browser from reusing the same window
      const windowName = `stripe_oauth_${Date.now()}`;
      window.open(response.redirect_url, windowName);
      // Poll for connection status after opening
      setConnecting(false);
      
      // Poll for connection every 2 seconds for up to 60 seconds
      let attempts = 0;
      const maxAttempts = 30;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const status = await apiClient.getStripeStatus();
          if (status.connected) {
            clearInterval(pollInterval);
            setIsConnected(true);
            await loadAllData();
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
          }
        } catch (error) {
          // Ignore errors during polling
        }
      }, 2000);
    } catch (error: any) {
      console.error('Failed to start Stripe OAuth:', error);
      setError(error?.response?.data?.detail || 'Failed to start Stripe connection.');
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Stripe? You will need to reconnect to view data.')) {
      return;
    }
    
    try {
      await apiClient.disconnectStripe();
      setIsConnected(false);
      setSummary(null);
      setRevenueTimeline(null);
      setChurnData(null);
      setMrrTrend(null);
      setPayments([]);
      setFailedPayments([]);
    } catch (error: any) {
      console.error('Failed to disconnect Stripe:', error);
      setError(error?.response?.data?.detail || 'Failed to disconnect Stripe.');
    }
  };

  const handleVerifyConnection = async () => {
    try {
      const verification = await apiClient.verifyStripeConnection();
      alert(`Connection Status:\n\nConnected: ${verification.connected}\nAccount ID: ${verification.account_id || 'N/A'}\nOrg ID: ${verification.org_id}\nExpires: ${verification.expires_at || 'Never'}`);
    } catch (error: any) {
      console.error('Failed to verify connection:', error);
      setError(error?.response?.data?.detail || 'Failed to verify connection.');
    }
  };

  const handleCompleteManualOAuth = async () => {
    if (!manualOAuthCode.trim()) {
      setError('Please enter the authorization code from the Stripe OAuth URL');
      return;
    }

    setCompletingManual(true);
    setError(null);
    try {
      // Get current user to get org_id
      const userInfo = await apiClient.getCurrentUser();
      const result = await apiClient.completeStripeOAuthManual(manualOAuthCode.trim(), userInfo.org_id);
      
      if (result.success) {
        setShowManualOAuth(false);
        setManualOAuthCode('');
        setIsConnected(true);
        await loadAllData();
        alert('Stripe connected successfully!');
      }
    } catch (error: any) {
      console.error('Failed to complete manual OAuth:', error);
      setError(error?.response?.data?.detail || 'Failed to complete OAuth connection.');
    } finally {
      setCompletingManual(false);
    }
  };

  const handleConnectDirect = async () => {
    if (!directApiKey.trim()) {
      setError('Please enter your Stripe API key');
      return;
    }

    if (!directApiKey.trim().match(/^(sk_test_|sk_live_|rk_test_|rk_live_)/)) {
      setError('Invalid API key format. Must start with "sk_test_", "sk_live_", "rk_test_", or "rk_live_"');
      return;
    }

    setConnectingDirect(true);
    setError(null);
    try {
      const result = await apiClient.connectStripeDirect(directApiKey.trim());
      
      if (result.success) {
        setShowDirectApiKey(false);
        setDirectApiKey('');
        setIsConnected(true);
        await loadAllData();
        alert(`Stripe connected successfully using API key!\nAccount: ${result.account_id}\nMode: ${result.mode}`);
      }
    } catch (error: any) {
      console.error('Failed to connect with API key:', error);
      setError(error?.response?.data?.detail || 'Failed to connect with API key.');
    } finally {
      setConnectingDirect(false);
    }
  };

  const handleFindDuplicates = async () => {
    setLoadingDuplicates(true);
    setError(null);
    try {
      const result = await apiClient.findDuplicatePayments();
      setDuplicates(result);
      setShowDuplicatesModal(true);
      setSelectedDuplicates(new Set()); // Reset selection
    } catch (error: any) {
      console.error('Failed to find duplicates:', error);
      setError(error?.response?.data?.detail || 'Failed to find duplicate payments.');
    } finally {
      setLoadingDuplicates(false);
    }
  };

  const handleMergeDuplicates = async () => {
    if (selectedDuplicates.size === 0) {
      setError('Please select at least one duplicate payment to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedDuplicates.size} duplicate payment(s)? This action cannot be undone.`)) {
      return;
    }

    setMergingDuplicates(true);
    setError(null);
    try {
      const paymentIds = Array.from(selectedDuplicates);
      const result = await apiClient.mergeDuplicatePayments(paymentIds, true);
      
      alert(`Successfully deleted ${result.deleted_count} duplicate payment(s).\n\nReconciliation: ${result.reconciliation?.clients_reconciled || 0} clients reconciled, ${result.reconciliation?.revenue_recalculated || 0} revenue recalculated.`);
      
      // Reload payments and close modal
      await loadAllData();
      setShowDuplicatesModal(false);
      setDuplicates(null);
      setSelectedDuplicates(new Set());
    } catch (error: any) {
      console.error('Failed to merge duplicates:', error);
      setError(error?.response?.data?.detail || 'Failed to merge duplicate payments.');
    } finally {
      setMergingDuplicates(false);
    }
  };

  const toggleDuplicateSelection = (paymentId: string, recommendedKeepId: string) => {
    // Don't allow selecting the recommended keep payment
    if (paymentId === recommendedKeepId) {
      return;
    }
    
    const newSelection = new Set(selectedDuplicates);
    if (newSelection.has(paymentId)) {
      newSelection.delete(paymentId);
    } else {
      newSelection.add(paymentId);
    }
    setSelectedDuplicates(newSelection);
  };

  const handleDeletePayment = async (paymentId: string, clientName?: string) => {
    const paymentInfo = clientName ? `payment for ${clientName}` : 'this payment';
    if (!confirm(`Are you sure you want to delete ${paymentInfo}? This action cannot be undone and will trigger reconciliation.`)) {
      return;
    }

    setError(null);
    try {
      // Delete payment (use StripePayment table, not Treasury)
      await apiClient.deleteStripePayment(paymentId, false);
      
      // Reload payments
      await loadAllData();
      
      alert('Payment deleted successfully. Reconciliation has been run automatically.');
    } catch (error: any) {
      console.error('Failed to delete payment:', error);
      setError(error?.response?.data?.detail || 'Failed to delete payment.');
    }
  };

  // Deduplicate clients for assign modal: one entry per normalized email or stripe_customer_id (same logic as TopRevenueContributors/CashCollectedAndMRR).
  const deduplicateClientsForAssign = (rawClients: Client[]): Client[] => {
    const normalizeEmail = (email: string | undefined | null): string | null => {
      if (!email) return null;
      return email.replace(/\s+/g, '').toLowerCase().trim() || null;
    };
    const seenKeys = new Set<string>();
    const result: Client[] = [];
    for (const client of rawClients) {
      const normalizedEmail = normalizeEmail(client.email);
      const key = normalizedEmail
        ? `email:${normalizedEmail}`
        : client.stripe_customer_id
          ? `stripe:${client.stripe_customer_id}`
          : `id:${client.id}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      result.push(client);
    }
    return result;
  };

  const handleOpenAssignModal = async (paymentId: string) => {
    setAssigningPayment(paymentId);
    setSearchQuery('');
    setLoadingClients(true);
    setError(null);
    
    try {
      const allClients = await apiClient.getClients();
      setClients(deduplicateClientsForAssign(allClients));
      setShowAssignModal(true);
    } catch (error: any) {
      console.error('Failed to load clients:', error);
      setError('Failed to load clients. Please try again.');
    } finally {
      setLoadingClients(false);
    }
  };

  const handleAssignPayment = async (clientId: string) => {
    if (!assigningPayment) return;

    setAssigning(true);
    setError(null);
    
    try {
      const result = await apiClient.assignPaymentToClient(assigningPayment, clientId, true);
      
      alert(`Payment assigned to ${result.client_name} successfully. Reconciliation has been run automatically.`);
      
      // Invalidate payments cache so refetch returns updated customer info
      cache.deleteByPrefix('stripe_payments_');
      await loadAllData();
      
      // Close modal
      setShowAssignModal(false);
      setAssigningPayment(null);
      setSearchQuery('');
    } catch (error: any) {
      console.error('Failed to assign payment:', error);
      setError(error?.response?.data?.detail || 'Failed to assign payment to client.');
    } finally {
      setAssigning(false);
    }
  };

  // Filter clients by search query
  const filteredClients = clients.filter((client) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = `${client.first_name || ''} ${client.last_name || ''}`.toLowerCase();
    const email = (client.email || '').toLowerCase();
    return name.includes(query) || email.includes(query);
  });

  const handleSyncStripe = async () => {
    setLoading(true);
    setError(null);
    setGlobalLoading(true, 'Syncing Stripe data...');
    try {
      const result = await apiClient.syncStripeData(false); // Incremental sync
      const totalCustomers = (result.results?.customers_synced || 0) + (result.results?.customers_updated || 0);
      const totalSubs = (result.results?.subscriptions_synced || 0) + (result.results?.subscriptions_updated || 0);
      const totalPayments = (result.results?.payments_synced || 0) + (result.results?.payments_updated || 0);
      
      let message = `Sync complete!\n\n`;
      if (result.is_full_sync) {
        message += `(Full historical sync)\n\n`;
      } else {
        message += `(Incremental sync - only new/updated data)\n\n`;
      }
      
      if (totalCustomers === 0 && totalSubs === 0 && totalPayments === 0) {
        message += `No changes detected. All data is up-to-date.`;
      } else {
        message += `Customers: ${result.results?.customers_synced || 0} new, ${result.results?.customers_updated || 0} updated\n`;
        message += `Subscriptions: ${result.results?.subscriptions_synced || 0} new, ${result.results?.subscriptions_updated || 0} updated\n`;
        message += `Payments: ${result.results?.payments_synced || 0} new, ${result.results?.payments_updated || 0} updated`;
        
        if (result.diagnostic) {
          message += `\n\nFound ${result.diagnostic.customers_found_from_stripe || 0} customers and ${result.diagnostic.subscriptions_found_from_stripe || 0} subscriptions in Stripe.`;
        }
      }
      
      alert(message);
      // Dispatch event to refresh clients list
      window.dispatchEvent(new Event('stripe-connected'));
      // Also reload Stripe data
      await loadAllData();
    } catch (error: any) {
      console.error('Failed to sync Stripe data:', error);
      let errorMessage = error?.response?.data?.detail || error?.message || 'Failed to sync Stripe data.';
      
      // Check if it's a timeout error
      if (error?.code === 'ECONNABORTED' || error?.message?.includes('timeout')) {
        errorMessage = 'Sync timed out. The operation is taking longer than expected. This may happen during full historical syncs with large amounts of data. Please try again or check backend logs.';
      }
      
      setError(errorMessage);
      alert(`Sync failed: ${errorMessage}`);
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const handleReconcile = async () => {
    if (!confirm('This will recalculate all analytics from existing data. Continue?')) {
      return;
    }

    setLoading(true);
    setError(null);
    setGlobalLoading(true, 'Reconciling Stripe data...');
    try {
      const result = await apiClient.reconcileStripeData();
      alert(`Reconciliation complete!\n\nClients reconciled: ${result.clients_reconciled || 0}\nRevenue recalculated: ${result.revenue_recalculated || 0}`);
      await loadAllData();
    } catch (error: any) {
      console.error('Failed to reconcile Stripe data:', error);
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to reconcile Stripe data.';
      setError(errorMessage);
      alert(`Reconciliation failed: ${errorMessage}`);
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  };

  const handleRecoverPayment = (payment: FailedPayment) => {
    if (!payment.client_email) {
      alert('This payment has no associated email address. Cannot send recovery email.');
      return;
    }
    setRecoveryPayment(payment);
    setShowEmailComposer(true);
  };

  const getRecoveryEmailTemplate = (payment: FailedPayment) => {
    const amount = (payment.amount_cents || 0) / 100;
    const subject = `Payment Issue - Action Required for ${formatCurrency(amount)}`;
    const failedDate = payment.latest_attempt_at && payment.latest_attempt_at > 0
      ? new Date(payment.latest_attempt_at * 1000).toLocaleDateString()
      : payment.created_at && payment.created_at > 0
      ? new Date(payment.created_at * 1000).toLocaleDateString()
      : 'N/A';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Payment Issue - Action Required</h2>
        <p>Dear ${payment.client_name || 'Valued Customer'},</p>
        <p>We noticed that a recent payment attempt for <strong>${formatCurrency(amount)}</strong> was unsuccessful.</p>
        <p><strong>Payment Details:</strong></p>
        <ul>
          <li>Amount: ${formatCurrency(amount)}</li>
          <li>Failed Date: ${failedDate}</li>
          ${payment.status ? `<li>Status: ${payment.status}</li>` : ''}
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

We noticed that a recent payment attempt for ${formatCurrency(amount)} was unsuccessful.

Payment Details:
- Amount: ${formatCurrency(amount)}
- Failed Date: ${failedDate}
${payment.status ? `- Status: ${payment.status}` : ''}

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

  const formatCurrency = (amount: number | undefined | null) => {
    if (amount === undefined || amount === null || isNaN(amount)) {
      return '$0.00';
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="text-gray-500 dark:text-gray-400">Loading Stripe data...</div>
      </div>
    );
  }

  if (!isConnected || !summary) {
    return (
      <div className="glass-card p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Stripe Financial Dashboard</h2>
          <div className="flex gap-2">
            <button
              onClick={handleSyncStripe}
              disabled={loading}
              className="text-sm glass-button neon-glow px-4 py-2 rounded-md disabled:opacity-50"
            >
              {loading ? 'Syncing...' : 'Sync'}
            </button>
            <button
              onClick={handleReconcile}
              disabled={loading}
              className="text-sm glass-button-secondary px-3 py-2 rounded-md hover:bg-white/20 disabled:opacity-50"
              title="Recalculate analytics from existing data"
            >
              Reconcile
            </button>
          </div>
        </div>
        {error && (
          <div className="glass-card border-red-400/40 rounded-md p-3 mb-4">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Connect Stripe to view financial data including MRR, ARR, subscriptions, and analytics.
        </p>

        {/* API Key Connection - OAuth temporarily disabled for deployment */}
        {canManageIntegrations ? (
          <div className="space-y-4">
            <div className="glass-panel border-blue-400/40 rounded p-3">
              <p className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-2">🔒 Secure API Key Storage</p>
              <ul className="text-xs text-blue-700 dark:text-blue-300 list-disc list-inside space-y-1">
                <li>API keys are <strong>encrypted at rest</strong> using industry-standard encryption</li>
                <li>All key access is <strong>audit logged</strong> for security compliance</li>
                <li>Keys are stored securely and never exposed in logs or responses</li>
                <li>Requires admin role and is rate-limited (3 attempts per 15 minutes)</li>
              </ul>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Stripe API Key *
              </label>
              <input
                type="password"
                value={directApiKey}
                onChange={(e) => setDirectApiKey(e.target.value)}
                placeholder="sk_test_..., sk_live_..., rk_test_..., or rk_live_..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Get your API key from{' '}
                <a
                  href="https://dashboard.stripe.com/apikeys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-500 hover:underline"
                >
                  Stripe Dashboard → Developers → API keys
                </a>
                . Restricted keys (rk_test_/rk_live_) are also supported for enhanced security.
              </p>
            </div>
            <button
              onClick={handleConnectDirect}
              disabled={connectingDirect || !directApiKey.trim()}
              className="w-full px-4 py-2 text-sm font-medium rounded-md glass-button neon-glow disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {connectingDirect ? 'Connecting...' : 'Connect with API Key'}
            </button>
          </div>
        ) : (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Only administrators and owners can connect or disconnect integrations. Please contact an admin to manage Stripe settings.
            </p>
          </div>
        )}
        
        <button
          onClick={handleVerifyConnection}
          className="mt-4 text-xs text-gray-600 hover:text-gray-700 underline"
        >
          Verify Connection Status
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-card p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Stripe Financial Dashboard</h2>
          <div className="flex items-center gap-2">
            {canManageIntegrations ? (
              <button
                onClick={handleDisconnect}
                className="text-sm text-red-300 px-3 py-1 border border-red-400/40 rounded-md hover:bg-red-500/10"
                title="Disconnect Stripe to connect a different account"
              >
                Disconnect
              </button>
            ) : null}
            <select
              value={timeRange}
              onChange={(e) => {
                const value = e.target.value;
                setTimeRange(value === 'all' ? 'all' : Number(value));
              }}
              className="text-sm glass-input rounded-md px-3 py-1"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
              <option value="all">All Time</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={handleSyncStripe}
                disabled={loading}
                className="text-sm glass-button neon-glow px-4 py-2 rounded-md disabled:opacity-50"
                title="Incremental sync: Only fetches new/updated data since last sync"
              >
                {loading ? 'Syncing...' : 'Sync'}
              </button>
              <button
                onClick={handleReconcile}
                disabled={loading}
                className="text-sm glass-button-secondary px-3 py-2 rounded-md hover:bg-white/20 disabled:opacity-50"
                title="Recalculate analytics from existing data"
              >
                Reconcile
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="glass-panel rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Total MRR</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(summary.total_mrr)}</p>
            {summary.mrr_change !== undefined && summary.mrr_change !== 0 && (
              <p className={`text-xs mt-1 ${summary.mrr_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary.mrr_change >= 0 ? '+' : ''}{formatCurrency(summary.mrr_change)} 
                ({summary.mrr_change_percent?.toFixed(1)}%)
              </p>
            )}
          </div>
          <div className="glass-panel rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Total ARR</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(summary.total_arr || 0)}</p>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Revenue {timeRange === 'all' ? '(All Time)' : `(${timeRange}d)`}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(summary.last_30_days_revenue)}</p>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Active Subs</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.active_subscriptions}</p>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Avg Client LTV</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {summary.average_client_ltv !== undefined 
                ? formatCurrency(summary.average_client_ltv) 
                : formatCurrency(0)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg total spend</p>
          </div>
        </div>

        {/* Additional KPIs */}
        {(summary.new_subscriptions !== undefined || summary.churned_subscriptions !== undefined || summary.failed_payments !== undefined) && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {summary.new_subscriptions !== undefined && (
              <div className="glass-panel rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">New Subs</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.new_subscriptions}</p>
              </div>
            )}
            {summary.churned_subscriptions !== undefined && (
              <div className="glass-panel rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Churned</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.churned_subscriptions}</p>
              </div>
            )}
            {summary.failed_payments !== undefined && (
              <div className="glass-panel rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Failed Payments</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{summary.failed_payments}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Over Time Chart */}
        {revenueTimeline && revenueTimeline.timeline && revenueTimeline.timeline.length > 0 && (
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">Revenue Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={revenueTimeline.timeline.map(point => {
                const date = new Date(point.date);
                return {
                  ...point,
                  date: isNaN(date.getTime()) ? point.date : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                };
              })}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} name="Revenue" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* MRR Trend Chart */}
        {mrrTrend && mrrTrend.trend_data && mrrTrend.trend_data.length > 0 && (
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">MRR Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={mrrTrend.trend_data.map(point => {
                const date = new Date(point.date);
                return {
                  ...point,
                  date: isNaN(date.getTime()) ? point.date : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                };
              })}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line type="monotone" dataKey="mrr" stroke="#10b981" strokeWidth={2} name="MRR" />
              </LineChart>
            </ResponsiveContainer>
            {mrrTrend.growth_percent !== undefined && (
              <p className={`text-sm mt-2 ${mrrTrend.growth_percent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                Growth: {mrrTrend.growth_percent >= 0 ? '+' : ''}{mrrTrend.growth_percent.toFixed(1)}%
              </p>
            )}
          </div>
        )}
      </div>

      {/* New Customers vs Churn Chart */}
      {churnData && churnData.cohort_snapshot && churnData.cohort_snapshot.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">New Customers vs Churn</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={churnData.cohort_snapshot}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="new_subscriptions" fill="#3b82f6" name="New Subscriptions" />
              <Bar dataKey="churned" fill="#ef4444" name="Churned" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Payments Table with Customer Info */}
      {payments && payments.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Payments</h3>
            <div className="flex gap-2">
              {paymentsHasMore && (
                <button
                  onClick={handleLoadMorePayments}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Load more
                </button>
              )}
              <button
                onClick={handleFindDuplicates}
                disabled={loadingDuplicates}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingDuplicates ? 'Finding...' : 'Find Duplicates'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/10 dark:bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscription</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-white/10">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {payment.created_at && payment.created_at > 0
                        ? new Date(payment.created_at * 1000).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>
                        <p className="text-gray-900 dark:text-gray-100 font-medium">{payment.client_name || 'Unknown'}</p>
                        {payment.client_email && (
                          <p className="text-gray-500 dark:text-gray-100 text-xs">{payment.client_email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{formatCurrency((payment.amount_cents || 0) / 100)}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        payment.status === 'succeeded' 
                          ? 'bg-green-100 text-green-800' 
                          : payment.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-100">
                      {payment.subscription_id ? (
                        <span className="font-mono text-xs break-all" title={payment.subscription_id}>{payment.subscription_id}</span>
                      ) : (
                        'N/A'
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        {(!payment.client_name || payment.client_name === 'Unknown') && (
                          <button
                            onClick={() => handleOpenAssignModal(payment.id)}
                            className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                            title="Assign this payment to a client"
                          >
                            Assign
                          </button>
                        )}
                        <button
                          onClick={() => handleDeletePayment(payment.id, payment.client_name || undefined)}
                          className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded border border-red-200 dark:border-red-800 hover:border-red-300 dark:hover:border-red-700 transition-colors"
                          title="Delete this payment"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Failed Payments Table with Customer Info */}
      {failedPayments && failedPayments.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Failed Payments</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Duplicate failures from the same subscription are grouped together
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/10 dark:bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Latest Attempt</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Attempts</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Recovery</th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-white/10">
                {failedPayments.map((payment) => (
                  <tr key={payment.id} className="bg-red-50 dark:bg-red-900/20">
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                      {payment.latest_attempt_at && payment.latest_attempt_at > 0
                        ? new Date(payment.latest_attempt_at * 1000).toLocaleDateString()
                        : payment.created_at && payment.created_at > 0
                        ? new Date(payment.created_at * 1000).toLocaleDateString()
                        : 'N/A'}
                      {payment.first_attempt_at && payment.latest_attempt_at && payment.first_attempt_at !== payment.latest_attempt_at && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          First: {new Date(payment.first_attempt_at * 1000).toLocaleDateString()}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>
                        <p className="text-gray-900 dark:text-gray-100 font-medium">{payment.client_name || 'Unknown'}</p>
                        {payment.client_email && (
                          <p className="text-gray-500 dark:text-gray-400 text-xs">{payment.client_email}</p>
                        )}
                        {payment.subscription_id && (
                          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1 break-all">Sub: {payment.subscription_id}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{formatCurrency((payment.amount_cents || 0) / 100)}</td>
                    <td className="px-4 py-3 text-sm">
                      {payment.attempt_count && payment.attempt_count > 1 ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200">
                            {payment.attempt_count} attempts
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            (grouped)
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">1 attempt</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-1 rounded text-xs bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200">
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {brevoStatus?.connected && payment.client_email ? (
                        <button
                          onClick={() => handleRecoverPayment(payment)}
                          className="px-3 py-1 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded transition-colors"
                          title="Send payment recovery email via Brevo"
                        >
                          Recover
                        </button>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">
                          {!brevoStatus?.connected ? 'Brevo not connected' : 'No email'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Duplicates Modal */}
      {showDuplicatesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Duplicate Payments
                </h3>
                <button
                  onClick={() => {
                    setShowDuplicatesModal(false);
                    setDuplicates(null);
                    setSelectedDuplicates(new Set());
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {duplicates && (
                <>
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      Found <strong>{duplicates.total_groups}</strong> duplicate group(s) with <strong>{duplicates.total_duplicates}</strong> duplicate payment(s).
                      Select the payments you want to delete (the recommended payment to keep is not selectable).
                    </p>
                  </div>

                  <div className="space-y-4 mb-4">
                    {duplicates.groups.map((group: any, groupIndex: number) => (
                      <div key={groupIndex} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              Group {groupIndex + 1}: shared suffix = <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">{group.key}</code>
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {group.count} payment(s) • Total: {formatCurrency(group.total_amount_cents / 100)}
                            </p>
                          </div>
                          <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded break-all" title={group.recommended_keep_id}>
                            Keep: {group.recommended_keep_id}
                          </span>
                        </div>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">Full stripe_id and suffix per payment (suffix should match above):</p>
                        <div className="space-y-2">
                          {(group.payments_detail || []).map((entry: any) => {
                            const paymentId = entry.payment_id;
                            const isRecommended = paymentId === group.recommended_keep_id;
                            const isSelected = selectedDuplicates.has(paymentId);
                            return (
                              <label
                                key={paymentId}
                                className={`flex items-start gap-3 p-2 rounded border ${
                                  isRecommended
                                    ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 cursor-not-allowed opacity-60'
                                    : isSelected
                                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 cursor-pointer'
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  disabled={isRecommended}
                                  onChange={() => toggleDuplicateSelection(paymentId, group.recommended_keep_id)}
                                  className="mt-1"
                                />
                                <div className="flex-1 min-w-0 text-sm font-mono">
                                  <div className="text-gray-700 dark:text-gray-300 break-all">
                                    stripe_id: <span className="text-gray-900 dark:text-gray-100">{entry.stripe_id || '(none)'}</span>
                                  </div>
                                  <div className="text-gray-600 dark:text-gray-400 mt-0.5 break-all">
                                    suffix: <span className="text-amber-700 dark:text-amber-300">{entry.suffix || '(none)'}</span>
                                    {entry.type && <span className="ml-2 text-gray-500">type: {entry.type}</span>}
                                    <span className="ml-2 text-gray-500">{formatCurrency((entry.amount_cents || 0) / 100)}</span>
                                  </div>
                                  {isRecommended && (
                                    <span className="text-xs text-green-600 dark:text-green-400">(Keep)</span>
                                  )}
                                </div>
                              </label>
                            );
                          })}
                          {(!group.payments_detail || group.payments_detail.length === 0) && group.payment_ids.map((paymentId: string) => {
                            const isRecommended = paymentId === group.recommended_keep_id;
                            const isSelected = selectedDuplicates.has(paymentId);
                            return (
                              <label
                                key={paymentId}
                                className={`flex items-center p-2 rounded border ${
                                  isRecommended ? 'bg-gray-50 dark:bg-gray-700/50 border-gray-300 dark:border-gray-600 cursor-not-allowed opacity-60' : isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 cursor-pointer' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                }`}
                              >
                                <input type="checkbox" checked={isSelected} disabled={isRecommended} onChange={() => toggleDuplicateSelection(paymentId, group.recommended_keep_id)} className="mr-3" />
                                <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{paymentId}{isRecommended && <span className="ml-2 text-xs text-green-600 dark:text-green-400">(Keep)</span>}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedDuplicates.size} payment(s) selected for deletion
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowDuplicatesModal(false);
                          setDuplicates(null);
                          setSelectedDuplicates(new Set());
                        }}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleMergeDuplicates}
                        disabled={selectedDuplicates.size === 0 || mergingDuplicates}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {mergingDuplicates ? 'Deleting...' : `Delete ${selectedDuplicates.size} Selected`}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assign Payment Modal */}
      {showAssignModal && assigningPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Assign Payment to Client
                </h3>
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setAssigningPayment(null);
                    setSearchQuery('');
                    setClients([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Select a client to assign this payment to. This will link the payment to the client and trigger reconciliation.
                </p>
                
                {/* Search input */}
                <input
                  type="text"
                  placeholder="Search clients by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {loadingClients ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading clients...</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {filteredClients.length === 0 ? (
                    <p className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                      {searchQuery ? 'No clients found matching your search.' : 'No clients available.'}
                    </p>
                  ) : (
                    filteredClients.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => handleAssignPayment(client.id)}
                        disabled={assigning}
                        className="w-full text-left p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">
                              {client.first_name || client.last_name
                                ? `${client.first_name || ''} ${client.last_name || ''}`.trim()
                                : 'Unnamed Client'}
                            </p>
                            {client.email && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {client.email}
                              </p>
                            )}
                            {client.stripe_customer_id && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                Stripe: {client.stripe_customer_id.substring(0, 20)}...
                              </p>
                            )}
                          </div>
                          {assigning && (
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="flex items-center justify-end pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                <button
                  onClick={() => {
                    setShowAssignModal(false);
                    setAssigningPayment(null);
                    setSearchQuery('');
                    setClients([]);
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                  disabled={assigning}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Email Composer Modal for Payment Recovery */}
      {showEmailComposer && recoveryPayment && (
        <EmailComposer
          recipients={recoveryPayment.client_email ? [{ email: recoveryPayment.client_email, name: recoveryPayment.client_name || undefined }] : []}
          onClose={() => {
            setShowEmailComposer(false);
            setRecoveryPayment(null);
          }}
          onSuccess={() => {
            setShowEmailComposer(false);
            setRecoveryPayment(null);
            // Optionally reload failed payments
            checkConnectionAndLoad();
          }}
          initialSubject={recoveryPayment ? getRecoveryEmailTemplate(recoveryPayment).subject : undefined}
          initialHtmlContent={recoveryPayment ? getRecoveryEmailTemplate(recoveryPayment).htmlContent : undefined}
          initialTextContent={recoveryPayment ? getRecoveryEmailTemplate(recoveryPayment).textContent : undefined}
        />
      )}
    </div>
  );
}
