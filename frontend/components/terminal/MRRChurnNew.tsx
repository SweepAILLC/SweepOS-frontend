import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';
import { Client } from '@/types/client';

interface MRRData {
  churnMRR: number;
  newMRR: number;
  netMRR: number;
}

interface ClientMRRInfo {
  client: Client;
  mrrBefore: number; // MRR before cutoff date
  mrrAfter: number;  // MRR after cutoff date
  lastPaymentBefore: string | null;
  lastPaymentAfter: string | null;
}

export default function MRRChurnNew() {
  const [mrrData, setMrrData] = useState<MRRData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMRRData();
  }, []);

  // Normalize email function - same as other components
  const normalizeEmail = (email: string | undefined | null): string | null => {
    if (!email) return null;
    return email.replace(/\s+/g, '').toLowerCase().trim() || null;
  };

  // Calculate MRR from payments (better estimation)
  const calculateMRRFromPayments = (payments: Array<{ created_at: string | null; amount: number; subscription_id?: string | null }>): number => {
    if (payments.length === 0) return 0;
    
    // If we have subscription IDs, group by subscription
    const subscriptionMap = new Map<string, number[]>();
    const oneTimePayments: number[] = [];
    
    payments.forEach((payment) => {
      if (payment.subscription_id) {
        if (!subscriptionMap.has(payment.subscription_id)) {
          subscriptionMap.set(payment.subscription_id, []);
        }
        subscriptionMap.get(payment.subscription_id)!.push(payment.amount);
      } else {
        oneTimePayments.push(payment.amount);
      }
    });
    
    let totalMRR = 0;
    
    // For subscription payments, calculate average per subscription
    subscriptionMap.forEach((amounts) => {
      // Average amount per subscription (assuming monthly)
      const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
      totalMRR += avgAmount;
    });
    
    // For one-time payments, estimate monthly (divide by number of months they span)
    if (oneTimePayments.length > 0) {
      const sortedPayments = payments
        .filter(p => !p.subscription_id)
        .sort((a, b) => {
          const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dateA - dateB;
        });
      
      if (sortedPayments.length > 0) {
        const firstCreated = sortedPayments[0].created_at;
        const lastCreated = sortedPayments[sortedPayments.length - 1].created_at;
        const firstDate = firstCreated != null ? new Date(firstCreated) : new Date();
        const lastDate = lastCreated != null ? new Date(lastCreated) : new Date();
        const monthsDiff = Math.max(1, (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 30));
        const totalOneTime = oneTimePayments.reduce((sum, a) => sum + a, 0);
        totalMRR += totalOneTime / monthsDiff;
      }
    }
    
    return totalMRR;
  };

  const loadMRRData = async () => {
    try {
      setLoading(true);
      
      // Get all clients
      const clients = await apiClient.getClients();
      
      // Calculate date range (last 30 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      
      // Consolidate clients by email or Stripe ID (same as Top Revenue Contributors)
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
      
      let churnMRR = 0;
      let newMRR = 0;
      let upgradeMRR = 0;
      let downgradeMRR = 0;
      
      // Process each client group
      for (const [groupKey, clientGroup] of Array.from(groupedClients.entries())) {
        try {
          // Aggregate payment data from all clients in the group
          const allPayments: Array<{ created_at: string | null; amount: number; subscription_id?: string | null }> = [];
          
          for (const client of clientGroup) {
            try {
              const payments = await apiClient.getClientPayments(client.id);
              allPayments.push(...payments.payments);
            } catch (error) {
              console.warn(`Failed to load payments for client ${client.id}:`, error);
            }
          }
          
          // Split payments by cutoff date
          const paymentsBefore = allPayments.filter((p) => {
            if (!p.created_at) return false;
            return new Date(p.created_at) < cutoffDate;
          });
          
          const paymentsAfter = allPayments.filter((p) => {
            if (!p.created_at) return false;
            const paymentDate = new Date(p.created_at);
            return paymentDate >= cutoffDate;
          });
          
          // Calculate MRR for before and after periods from payments
          const mrrBefore = calculateMRRFromPayments(paymentsBefore);
          const mrrAfter = calculateMRRFromPayments(paymentsAfter);
          
          // Get the highest estimated_mrr from the client group (in case of merged clients)
          const primaryClient = clientGroup[0];
          const maxEstimatedMRR = Math.max(...clientGroup.map(c => c.estimated_mrr || 0));
          
          // For "before" period: use calculated MRR from historical payments, or estimated if no payments
          const finalMRRBefore = mrrBefore > 0 
            ? mrrBefore 
            : (paymentsBefore.length > 0 ? maxEstimatedMRR : 0);
          
          // For "after" period: prefer estimated_mrr (current MRR) if available, otherwise use calculated
          const finalMRRAfter = maxEstimatedMRR > 0 && paymentsAfter.length > 0
            ? maxEstimatedMRR  // Use current estimated MRR if we have recent payments
            : (mrrAfter > 0 ? mrrAfter : 0);
          
          // Determine churn, new, upgrade, or downgrade
          if (finalMRRBefore > 0 && finalMRRAfter === 0) {
            // Churn: had MRR before, none after
            churnMRR += finalMRRBefore;
          } else if (finalMRRBefore === 0 && finalMRRAfter > 0) {
            // New: no MRR before, has MRR after
            newMRR += finalMRRAfter;
          } else if (finalMRRBefore > 0 && finalMRRAfter > 0) {
            // Existing client with changes
            if (finalMRRAfter > finalMRRBefore) {
              // Upgrade
              upgradeMRR += (finalMRRAfter - finalMRRBefore);
            } else if (finalMRRAfter < finalMRRBefore) {
              // Downgrade (count as churn)
              downgradeMRR += (finalMRRBefore - finalMRRAfter);
            }
            // If equal, no change (don't count)
          }
        } catch (error) {
          console.warn(`Failed to process client group ${groupKey}:`, error);
        }
      }
      
      // Net MRR = New MRR + Upgrades - Churn - Downgrades
      const netMRR = newMRR + upgradeMRR - churnMRR - downgradeMRR;
      
      setMrrData({
        churnMRR: churnMRR + downgradeMRR, // Include downgrades in churn
        newMRR: newMRR + upgradeMRR, // Include upgrades in new
        netMRR,
      });
    } catch (error) {
      console.error('Failed to load MRR data:', error);
    } finally {
      setLoading(false);
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
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
        MRR Churn & New MRR
        <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">(Last 30d)</span>
      </h3>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : mrrData ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 glass-panel rounded-lg">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Churn MRR</p>
              <p className="text-2xl font-bold text-red-500 dark:text-red-400 mt-1">
                {formatCurrency(mrrData.churnMRR)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-4 glass-panel rounded-lg">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">New MRR</p>
              <p className="text-2xl font-bold text-green-500 dark:text-green-400 mt-1">
                {formatCurrency(mrrData.newMRR)}
              </p>
            </div>
          </div>
          
          <div className={`flex items-center justify-between p-4 rounded-lg ${
            mrrData.netMRR >= 0 
              ? 'bg-green-500/10 border border-green-500/20' 
              : 'bg-red-500/10 border border-red-500/20'
          }`}>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 digitized-text">Net MRR</p>
              <p className={`text-2xl font-bold mt-1 ${
                mrrData.netMRR >= 0 
                  ? 'text-green-500 dark:text-green-400' 
                  : 'text-red-500 dark:text-red-400'
              }`}>
                {mrrData.netMRR >= 0 ? '+' : ''}{formatCurrency(mrrData.netMRR)}
              </p>
            </div>
          </div>
          
          {mrrData.churnMRR > mrrData.newMRR && (
            <div className="mt-4 p-3 glass-panel rounded-lg border border-yellow-500/20">
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                ⚠️ Churn exceeds new MRR. Prioritize retention experiments.
              </p>
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          No MRR data available.
        </p>
      )}
    </div>
  );
}

