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

export default function CashCollectedAndMRR({ onLoadComplete }: CashCollectedAndMRRProps = {}) {
  const [cashCollected, setCashCollected] = useState<CashCollectedData | null>(null);
  const [mrrData, setMrrData] = useState<MRRData | null>(null);
  const [loading, setLoading] = useState(true);
  const hasCalledOnLoadComplete = useRef(false);

  useEffect(() => {
    loadData();
    
    // Listen for manual payment creation events to refresh data
    const handlePaymentCreated = () => {
      loadData();
    };
    
    window.addEventListener('manualPaymentCreated', handlePaymentCreated);
    
    return () => {
      window.removeEventListener('manualPaymentCreated', handlePaymentCreated);
    };
  }, []);

  // Normalize email function - same as other components
  const normalizeEmail = (email: string | undefined | null): string | null => {
    if (!email) return null;
    return email.replace(/\s+/g, '').toLowerCase().trim() || null;
  };

  // Get local date components for comparison (normalizes to user's timezone)
  const getLocalDate = (date: Date): Date => {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Calculate date ranges
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
      
      // Fetch Stripe payments
      try {
        let allStripePayments: any[] = [];
        let page = 1;
        const pageSize = 100;
        let hasMore = true;
        
        while (hasMore) {
          const payments = await apiClient.getStripePayments('succeeded', undefined, page, pageSize);
          if (payments && payments.length > 0) {
            allStripePayments = allStripePayments.concat(payments);
            hasMore = payments.length === pageSize;
            page++;
          } else {
            hasMore = false;
          }
        }
        
        // Process Stripe payments
        allStripePayments.forEach((payment: any) => {
          if (!payment.created_at || payment.status !== 'succeeded') return;
          
          // Deduplicate by stripe_id
          if (payment.stripe_id && seenPaymentIds.has(payment.stripe_id)) return;
          if (payment.stripe_id) seenPaymentIds.add(payment.stripe_id);
          
          // created_at is Unix timestamp in seconds
          const paymentTimestamp = typeof payment.created_at === 'number' 
            ? payment.created_at 
            : parseInt(String(payment.created_at));
          
          if (isNaN(paymentTimestamp)) return;
          
          const paymentDate = new Date(paymentTimestamp * 1000);
          const amount = (payment.amount_cents || 0) / 100;
          
          // Normalize payment date to local timezone for comparison
          const paymentLocalDate = getLocalDate(paymentDate);
          
          // Check timestamp and increment totals (compare local dates)
          if (paymentLocalDate >= todayStart) {
            todayCash += amount;
          }
          if (paymentLocalDate >= sevenDaysAgo) {
            last7DaysCash += amount;
          }
          if (paymentLocalDate >= thirtyDaysAgo) {
            last30DaysCash += amount;
          }
        });
      } catch (error) {
        console.warn('Failed to load Stripe payments:', error);
      }
      
      // Fetch manual payments from client payments
      try {
        const clients = await apiClient.getClients();
        
        for (const client of clients) {
          try {
            const paymentsResponse = await apiClient.getClientPayments(client.id);
            
            paymentsResponse.payments.forEach((payment: ClientPayment) => {
              // Only process manual payments (type is 'manual_payment' or no stripe_id with no type set)
              const isManualPayment = payment.type === 'manual_payment' || (!payment.stripe_id && !payment.type);
              if (!isManualPayment || payment.status !== 'succeeded' || !payment.created_at) return;
              
              // Deduplicate by id
              if (seenPaymentIds.has(payment.id)) return;
              seenPaymentIds.add(payment.id);
              
              // created_at is ISO string, convert to Date
              const paymentDate = new Date(payment.created_at);
              if (isNaN(paymentDate.getTime())) return;
              
              // Normalize payment date to local timezone for comparison
              const paymentLocalDate = getLocalDate(paymentDate);
              
              // amount is already in dollars from API
              const amount = payment.amount || 0;
              
              // Check timestamp and increment totals (compare local dates)
              if (paymentLocalDate >= todayStart) {
                todayCash += amount;
              }
              if (paymentLocalDate >= sevenDaysAgo) {
                last7DaysCash += amount;
              }
              if (paymentLocalDate >= thirtyDaysAgo) {
                last30DaysCash += amount;
              }
            });
          } catch (error) {
            console.warn(`Failed to load payments for client ${client.id}:`, error);
          }
        }
      } catch (error) {
        console.warn('Failed to load manual payments:', error);
      }
      
      // Set final totals
      setCashCollected({
        today: todayCash,
        last7Days: last7DaysCash,
        last30Days: last30DaysCash,
      });
      
      // Fallback handling for edge cases - already handled above
      
      // Get current MRR from Stripe summary (this uses proper deduplication)
      try {
        const stripeSummary = await apiClient.getStripeSummary(30);
        setMrrData({
          currentMRR: stripeSummary.total_mrr || 0,
          arr: stripeSummary.total_arr || 0,
        });
      } catch (error) {
        // If Stripe not connected, calculate from consolidated client estimated_mrr
        console.warn('Failed to load Stripe summary, calculating from client MRR:', error);
        
        // Get all clients for MRR fallback
        const clients = await apiClient.getClients();
        
        // Consolidate clients by email or Stripe ID
        const groupedClients = new Map<string, Client[]>();
        const processedClientIds = new Set<string>();
        
        clients.forEach((client: Client) => {
          if (processedClientIds.has(client.id)) {
            return;
          }
          
          const normalizedEmail = normalizeEmail(client.email);
          if (normalizedEmail) {
            const key = `email:${normalizedEmail}`;
            const clientsWithSameEmail = clients.filter((c: Client) => {
              const cEmail = normalizeEmail(c.email);
              return cEmail === normalizedEmail && !processedClientIds.has(c.id);
            });
            
            if (clientsWithSameEmail.length > 0) {
              if (!groupedClients.has(key)) {
                groupedClients.set(key, []);
              }
              clientsWithSameEmail.forEach((c: Client) => {
                groupedClients.get(key)!.push(c);
                processedClientIds.add(c.id);
              });
            }
          } else {
            const stripeId = client.stripe_customer_id;
            if (stripeId) {
              const key = `stripe:${stripeId}`;
              const clientsWithSameStripeId = clients.filter((c: Client) => {
                return c.stripe_customer_id === stripeId && !processedClientIds.has(c.id);
              });
              
              if (clientsWithSameStripeId.length > 0) {
                if (!groupedClients.has(key)) {
                  groupedClients.set(key, []);
                }
                clientsWithSameStripeId.forEach((c: Client) => {
                  groupedClients.get(key)!.push(c);
                  processedClientIds.add(c.id);
                });
              }
            } else {
              groupedClients.set(`individual:${client.id}`, [client]);
              processedClientIds.add(client.id);
            }
          }
        });
        
        let totalMRR = 0;
        
        // Use max estimated_mrr from each client group (to avoid double counting)
        for (const [groupKey, clientGroup] of Array.from(groupedClients.entries())) {
          const maxMRR = Math.max(...clientGroup.map(c => c.estimated_mrr || 0));
          totalMRR += maxMRR;
        }
        
        setMrrData({
          currentMRR: totalMRR,
          arr: totalMRR * 12,
        });
      }
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">
        Cash & MRR
      </h3>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Cash Collected Section */}
          <div>
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4 digitized-text uppercase tracking-wider">
              Cash Collected
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 glass-panel rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 digitized-text">Today</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(cashCollected?.today || 0)}
                </p>
              </div>
              <div className="text-center p-4 glass-panel rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 digitized-text">7 Days</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(cashCollected?.last7Days || 0)}
                </p>
              </div>
              <div className="text-center p-4 glass-panel rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 digitized-text">30 Days</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(cashCollected?.last30Days || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Current MRR Section */}
          <div className="pt-4 border-t border-white/10">
            <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4 digitized-text uppercase tracking-wider">
              Current MRR
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 glass-panel rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 digitized-text">Monthly Recurring Revenue</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(mrrData?.currentMRR || 0)}
                </p>
              </div>
              <div className="p-4 glass-panel rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 digitized-text">Annual Recurring Revenue</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(mrrData?.arr || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

