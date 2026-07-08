import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

/** Resolves current org display name (prefers /auth/me org_name when present). */
export function useCurrentOrgName(): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = (await apiClient.getCurrentUser()) as {
          org_id?: string;
          org_name?: string | null;
          email?: string;
        };
        if (cancelled) return;
        if (user.org_name) {
          setName(user.org_name);
          return;
        }
        if (user.email && user.org_id) {
          const orgs = await apiClient.getUserOrganizations(user.email);
          if (cancelled) return;
          const match = Array.isArray(orgs)
            ? orgs.find((o: { id: string }) => String(o.id) === String(user.org_id))
            : null;
          setName(match?.name ?? null);
        } else {
          setName(null);
        }
      } catch {
        if (!cancelled) setName(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return name;
}
