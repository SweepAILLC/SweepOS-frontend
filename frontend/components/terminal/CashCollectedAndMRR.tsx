import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { Client, ClientPayment } from '@/types/client';

interface CashCollectedData {
  today: number;
  last7Days: number;
  last30Days: number;
}

interface MRRData {
  currentMRR: number;
  arr: number;
}

interface CashCollectedAndMRRProps {
  onLoadComplete?: () => void;
}

function getLocalDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export default function CashCollectedAndMRR({ onLoadComplete }: CashCollectedAndMRRProps = {}) {
  const [cashCollected, setCashCollected] = useState<CashCollectedData | null>(null);
  const [mrrData, setMrrData] = useState<MRRData | null>(null);
  const [loading, setLoading] = useState(true);
  const hasCalledOnLoadComplete = useRef(false);

  const normalizeEmail = (email: string | undefined | null): string | null => {
    if (!email) return null;
    return email.replace(/\s+/g, '').toLowerCase().trim() || null;
  };

  const loadFromSummary = async (): Promise<{ cash: CashCollectedData; mrr: MRRData } | null> => {
    const summary = await apiClient.getTerminalSummary();
    const cash = {
      today: summary.cash_collected?.today ?? 0,
      last7Days: summary.cash_collected?.last_7_days ?? 0,
      last30Days: summary.cash_collected?.last_30_days ?? 0,
    };
    const mrr = {
      currentMRR: summary.mrr?.current_mrr ?? 0,
      arr: summary.mrr?.arr ?? 0,
    };
    const hasData = cash.today > 0 || cash.last7Days > 0 || cash.last30Days > 0 || mrr.currentMRR > 0;
    return hasData ? { cash, mrr } : null;
  };

  const loadFallback = async (): Promise<{ cash: CashCollectedData; mrr: MRRData }> => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const thirtyDaysAgo = new Date(todayStart);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let todayCash = 0;
    let last7DaysCash = 0;
    let last30DaysCash = 0;
    const seenPaymentIds = new Set<string>();

    try {
      let allStripePayments: any[] = [];
      let page = 1;
      const pageSize = 100;
      let hasMore = true;
      while (hasMore) {
        const payments = await apiClient.getStripePayments('succeeded', undefined, page, pageSize);
        if (payments && Array.isArray(payments) && payments.length > 0) {
          allStripePayments = allStripePayments.concat(payments);
          hasMore = payments.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }
      allStripePayments.forEach((payment: any) => {
        if (!payment.created_at || payment.status !== 'succeeded') return;
        if (payment.stripe_id && seenPaymentIds.has(payment.stripe_id)) return;
        if (payment.stripe_id) seenPaymentIds.add(payment.stripe_id);
        const paymentTimestamp = typeof payment.created_at === 'number'
          ? payment.created_at
          : parseInt(String(payment.created_at), 10);
        if (Number.isNaN(paymentTimestamp)) return;
        const paymentDate = new Date(paymentTimestamp * 1000);
        const amount = (payment.amount_cents || 0) / 100;
        const paymentLocalDate = getLocalDate(paymentDate);
        if (paymentLocalDate >= todayStart) todayCash += amount;
        if (paymentLocalDate >= sevenDaysAgo) last7DaysCash += amount;
        if (paymentLocalDate >= thirtyDaysAgo) last30DaysCash += amount;
      });
    } catch (e) {
      console.warn('Fallback: failed to load Stripe payments', e);
    }

    try {
      const clients = await apiClient.getClients();
      for (const client of clients) {
        try {
          const paymentsResponse = await apiClient.getClientPayments(client.id);
          (paymentsResponse.payments || []).forEach((payment: ClientPayment) => {
            const isManual = payment.type === 'manual_payment' || (!payment.stripe_id && !payment.type);
            if (!isManual || payment.status !== 'succeeded' || !payment.created_at) return;
            if (seenPaymentIds.has(payment.id)) return;
            seenPaymentIds.add(payment.id);
            const paymentDate = new Date(payment.created_at);
            if (Number.isNaN(paymentDate.getTime())) return;
            const paymentLocalDate = getLocalDate(paymentDate);
            const amount = payment.amount || 0;
            if (paymentLocalDate >= todayStart) todayCash += amount;
            if (paymentLocalDate >= sevenDaysAgo) last7DaysCash += amount;
            if (paymentLocalDate >= thirtyDaysAgo) last30DaysCash += amount;
          });
        } catch {
          // skip client
        }
      }
    } catch (e) {
      console.warn('Fallback: failed to load manual payments', e);
    }

    let currentMRR = 0;
    let arr = 0;
    try {
      const stripeSummary = await apiClient.getStripeSummary(30);
      currentMRR = stripeSummary?.total_mrr ?? 0;
      arr = stripeSummary?.total_arr ?? 0;
    } catch {
      try {
        const clients = await apiClient.getClients();
        const grouped = new Map<string, Client[]>();
        const processed = new Set<string>();
        clients.forEach((c: Client) => {
          if (processed.has(c.id)) return;
          const norm = normalizeEmail(c.email);
          const key = norm ? `email:${norm}` : (c.stripe_customer_id ? `stripe:${c.stripe_customer_id}` : `id:${c.id}`);
          const same = clients.filter((x: Client) => {
            if (processed.has(x.id)) return false;
            if (norm && normalizeEmail(x.email) === norm) return true;
            if (!norm && x.stripe_customer_id === c.stripe_customer_id) return true;
            return x.id === c.id;
          });
          same.forEach((x: Client) => processed.add(x.id));
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(...same);
        });
        grouped.forEach((group) => {
          const maxMRR = Math.max(...group.map((c) => c.estimated_mrr || 0), 0);
          currentMRR += maxMRR;
        });
        arr = currentMRR * 12;
      } catch {
        // leave 0
      }
    }

    return {
      cash: { today: todayCash, last7Days: last7DaysCash, last30Days: last30DaysCash },
      mrr: { currentMRR, arr },
    };
  };

  const loadData = async () => {
    try {
      setLoading(true);
      let result: { cash: CashCollectedData; mrr: MRRData } | null = null;
      try {
        result = await loadFromSummary();
      } catch (err) {
        console.warn('Terminal summary failed, using fallback calculation:', err);
      }
      if (!result) {
        result = await loadFallback();
      }
      setCashCollected(result.cash);
      setMrrData(result.mrr);
    } catch (error) {
      console.error('Failed to load cash collected and MRR data:', error);
    } finally {
      setLoading(false);
      if (!hasCalledOnLoadComplete.current && onLoadComplete) {
        hasCalledOnLoadComplete.current = true;
        onLoadComplete();
      }
    }
  };

  useEffect(() => {
    loadData();
    const handlePaymentCreated = () => {
      loadData();
    };
    window.addEventListener('manualPaymentCreated', handlePaymentCreated);
    return () => window.removeEventListener('manualPaymentCreated', handlePaymentCreated);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="glass-card p-4 sm:p-6 min-w-0">
      <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 sm:mb-6">
        Cash & MRR
      </h3>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          <div>
            <h4 className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 sm:mb-4 digitized-text uppercase tracking-wider">
              Cash Collected
            </h4>
            <div className="grid grid-cols-3 gap-2 sm:gap-4">
              <div className="text-center p-3 sm:p-4 glass-panel rounded-lg min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 sm:mb-2 digitized-text">Today</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate" title={formatCurrency(cashCollected?.today ?? 0)}>
                  {formatCurrency(cashCollected?.today ?? 0)}
                </p>
              </div>
              <div className="text-center p-3 sm:p-4 glass-panel rounded-lg min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 sm:mb-2 digitized-text">7 Days</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate" title={formatCurrency(cashCollected?.last7Days ?? 0)}>
                  {formatCurrency(cashCollected?.last7Days ?? 0)}
                </p>
              </div>
              <div className="text-center p-3 sm:p-4 glass-panel rounded-lg min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 sm:mb-2 digitized-text">30 Days</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-100 truncate" title={formatCurrency(cashCollected?.last30Days ?? 0)}>
                  {formatCurrency(cashCollected?.last30Days ?? 0)}
                </p>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-white/10">
            <h4 className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400 mb-3 sm:mb-4 digitized-text uppercase tracking-wider">
              Current MRR
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="p-3 sm:p-4 glass-panel rounded-lg min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 digitized-text">Monthly Recurring Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(mrrData?.currentMRR ?? 0)}
                </p>
              </div>
              <div className="p-3 sm:p-4 glass-panel rounded-lg min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 digitized-text">Annual Recurring Revenue</p>
                <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(mrrData?.arr ?? 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
