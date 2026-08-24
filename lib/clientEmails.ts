import type { Client } from '@/types/client';

/** Distinct email strings for a client (primary + additional). */
export function getEmailsForClient(c: Client): string[] {
  const set = new Set<string>();
  if (c.email?.trim()) set.add(c.email.trim());
  if (Array.isArray(c.emails)) {
    for (const e of c.emails) {
      if (e?.trim()) set.add(e.trim());
    }
  }
  return Array.from(set);
}

/** One row per distinct email (lowercased key), for Brevo transactional sends. */
export function recipientsFromClients(clientList: Client[]): Array<{ email: string; name?: string }> {
  const byLower = new Map<string, { email: string; name?: string }>();
  for (const c of clientList) {
    const emails = getEmailsForClient(c);
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || undefined;
    for (const email of emails) {
      const key = email.toLowerCase();
      if (!byLower.has(key)) byLower.set(key, { email, name });
    }
  }
  return Array.from(byLower.values());
}
