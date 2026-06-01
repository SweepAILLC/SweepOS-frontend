import type { Client } from '@/types/client';

/** Matches the “Balance due” chip on client cards. */
export const BALANCE_DUE_CHIP_CLASS =
  'bg-red-500/20 text-red-800 dark:text-red-200 border-red-400/40';

/** True when an offer contract exists and recorded payments are still below total_cents. */
export function hasOutstandingOfferBalance(client: Client): boolean {
  const oe = client.offer_enrollment;
  const total = oe?.total_cents;
  if (!oe?.slot || total == null || total <= 0) return false;
  const paid = oe.paid_cents ?? client.lifetime_revenue_cents ?? 0;
  return paid < total;
}
