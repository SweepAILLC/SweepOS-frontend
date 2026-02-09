import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { Client, ClientPayment } from '@/types/client';

interface RevenueContributor {
  client: Client;
  revenue: number;
  lastPaymentDate: string | null;
}

interface TopRevenueContributorsProps {
  onLoadComplete?: () => void;
}

export default function TopRevenueContributors({ onLoadComplete }: TopRevenueContributorsProps = {}) {
  const [contributors, setContributors] = useState<RevenueContributor[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<30 | 90>(30);
  const hasCalledOnLoadComplete = useRef(false);

  useEffect(() => {
    loadContributors();
  }, [timeRange]);

  const loadContributors = async () => {
    try {
      setLoading(true);
      const clients = await apiClient.getClients();
      
      // Normalize email function - same as Kanban board
      const normalizeEmail = (email: string | undefined | null): string | null => {
        if (!email) return null;
        return email.replace(/\s+/g, '').toLowerCase().trim() || null;
      };
      
      // Group clients by email first (most reliable), then by Stripe customer ID if no email
      const groupedClients = new Map<string, Client[]>();
      const processedClientIds = new Set<string>();
      
      clients.forEach((client: Client) => {
        // Skip if already processed
        if (processedClientIds.has(client.id)) {
          return;
        }
        
        // First priority: group by normalized email (same as Kanban board)
        const normalizedEmail = normalizeEmail(client.email);
        if (normalizedEmail) {
          const key = `email:${normalizedEmail}`;
          
          // Find all clients with the same email
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
          // No email - try to group by Stripe customer ID
          const stripeId = client.stripe_customer_id;
          if (stripeId) {
            const key = `stripe:${stripeId}`;
            
            // Find all clients with the same Stripe ID
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
            // No email or Stripe ID - treat as individual
            groupedClients.set(`individual:${client.id}`, [client]);
            processedClientIds.add(client.id);
          }
        }
      });
      
      // Get payments for all client groups
      const contributorsWithRevenue: RevenueContributor[] = [];
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeRange);
      
      for (const [groupKey, clientGroup] of Array.from(groupedClients.entries())) {
        try {
          // Aggregate revenue from all clients in the group
          let totalRevenue = 0;
          let latestPaymentDate: string | null = null;
          const allPayments: Array<{ created_at: string | null; amount: number }> = [];
          
          // Track seen payments to deduplicate across all clients in the group
          // Key: (subscription_id, invoice_id) or (invoice_id) or stripe_id
          const seenPaymentKeys = new Set<string>();
          
          // Get payments from all clients in the group
          for (const client of clientGroup) {
            try {
              const payments = await apiClient.getClientPayments(client.id);
              
              // Filter payments: within time range AND succeeded status only
              const recentPayments = payments.payments.filter((payment: ClientPayment) => {
                if (!payment.created_at) return false;
                if (payment.status !== 'succeeded') return false; // Only count succeeded payments
                const paymentDate = new Date(payment.created_at);
                return paymentDate >= cutoffDate;
              });
              
              // Deduplicate payments across all clients in the group
              // Use stripe_id as the primary deduplication key (unique per payment)
              recentPayments.forEach((payment: ClientPayment) => {
                // Create deduplication key using stripe_id (unique per Stripe payment)
                // This prevents the same payment from being counted multiple times when
                // consolidating across multiple client records in the same group
                const dedupeKey = payment.stripe_id || payment.id;
                
                // Skip if we've already seen this payment
                if (seenPaymentKeys.has(dedupeKey)) {
                  return;
                }
                seenPaymentKeys.add(dedupeKey);
                
                // Add to total revenue
                totalRevenue += payment.amount;
                allPayments.push({
                  created_at: payment.created_at,
                  amount: payment.amount,
                });
              });
            } catch (error) {
              // Skip clients without payment access
              console.warn(`Failed to load payments for client ${client.id}:`, error);
            }
          }
          
          if (totalRevenue > 0) {
            // Find the most recent payment date across all clients in the group
            if (allPayments.length > 0) {
              const sortedPayments = allPayments.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
              });
              latestPaymentDate = sortedPayments[0].created_at;
            }
            
            // Use the primary client (oldest by created_at) for display
            const primaryClient = [...clientGroup].sort((a, b) => 
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            )[0];
            
            // If multiple clients, combine names
            if (clientGroup.length > 1) {
              const names = new Set<string>();
              clientGroup.forEach((c: Client) => {
                const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ');
                if (fullName.trim()) {
                  names.add(fullName.trim());
                }
              });
              const combinedName = Array.from(names).join(' / ') || primaryClient.email || 'Unknown';
              
              // Create a merged client representation
              const mergedClient: Client = {
                ...primaryClient,
                meta: {
                  ...primaryClient.meta,
                  merged_names: combinedName,
                  merged_client_ids: clientGroup.map(c => c.id),
                },
              };
              
              contributorsWithRevenue.push({
                client: mergedClient,
                revenue: totalRevenue,
                lastPaymentDate: latestPaymentDate,
              });
            } else {
              contributorsWithRevenue.push({
                client: primaryClient,
                revenue: totalRevenue,
                lastPaymentDate: latestPaymentDate,
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to process client group ${groupKey}:`, error);
        }
      }
      
      // Sort by revenue descending and take top 5
      const top5 = contributorsWithRevenue
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      
      setContributors(top5);
    } catch (error) {
      console.error('Failed to load revenue contributors:', error);
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const getClientName = (client: Client) => {
    // Use merged names if available (from consolidated clients)
    if (client.meta?.merged_names) {
      return client.meta.merged_names;
    }
    const firstName = client.first_name || '';
    const lastName = client.last_name || '';
    return [firstName, lastName].filter(Boolean).join(' ') || client.email || 'Unknown';
  };

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Top 5 Revenue Contributors
        </h3>
        <div className="flex space-x-2">
          <button
            onClick={() => setTimeRange(30)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              timeRange === 30
                ? 'glass-button neon-glow text-white'
                : 'glass-button-secondary text-gray-700 dark:text-gray-300'
            }`}
          >
            30d
          </button>
          <button
            onClick={() => setTimeRange(90)}
            className={`px-3 py-1 text-sm rounded transition-colors ${
              timeRange === 90
                ? 'glass-button neon-glow text-white'
                : 'glass-button-secondary text-gray-700 dark:text-gray-300'
            }`}
          >
            90d
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-gray-100"></div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      ) : contributors.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          No revenue contributors found for the selected period.
        </p>
      ) : (
        <div className="space-y-3">
          {contributors.map((contributor, index) => (
            <div
              key={contributor.client.id}
              className="flex items-center justify-between p-3 glass-panel rounded-lg"
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {getClientName(contributor.client)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Last payment: {formatDate(contributor.lastPaymentDate)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(contributor.revenue)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

