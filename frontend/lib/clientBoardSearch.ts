import type { Client } from '@/types/client';

/**
 * Board search: matches clients by the same contact/profile fields users rely on in the UI
 * (name, emails, phone, Instagram, notes, Stripe id, offer name, client id). Phone matching
 * uses digit normalization when the query contains digits (so continuous digits match formatted numbers).
 */
export function clientMatchesBoardSearch(client: Client, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const parts: string[] = [client.id];

  const push = (s: string | undefined | null) => {
    const t = typeof s === 'string' ? s.trim() : '';
    if (t) parts.push(t);
  };

  push(client.first_name);
  push(client.last_name);
  const fullName = [client.first_name, client.last_name].filter(Boolean).join(' ').trim();
  if (fullName) parts.push(fullName);

  push(client.email);
  if (client.emails?.length) {
    for (const e of client.emails) {
      if (e && String(e).trim()) parts.push(String(e).trim());
    }
  }

  push(client.notes);

  if (client.instagram?.trim()) {
    const ig = client.instagram.trim().replace(/^@+/, '');
    push(ig);
    push(`@${ig}`);
  }

  push(client.stripe_customer_id);

  const oe = client.offer_enrollment;
  if (oe?.name_snapshot != null && String(oe.name_snapshot).trim()) {
    parts.push(String(oe.name_snapshot).trim());
  }
  if (oe?.notes != null && String(oe.notes).trim()) {
    parts.push(String(oe.notes).trim());
  }

  const haystack = parts.join(' ').toLowerCase();

  if (haystack.includes(q)) return true;

  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length >= 2 && tokens.every((t) => haystack.includes(t))) return true;

  const digitQuery = q.replace(/\D/g, '');
  if (digitQuery.length > 0 && client.phone) {
    const digitPhone = client.phone.replace(/\D/g, '');
    if (digitPhone.includes(digitQuery)) return true;
  }

  return false;
}
