import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';

/** funnel id -> name. One in-flight request shared by every caller (cards render in bulk). */
let inflight: Promise<Record<string, string>> | null = null;

function loadFunnelNames(): Promise<Record<string, string>> {
  if (!inflight) {
    inflight = apiClient
      .getFunnels()
      .then((rows: unknown) => {
        const out: Record<string, string> = {};
        if (Array.isArray(rows)) {
          for (const f of rows as Array<{ id?: unknown; name?: unknown }>) {
            if (typeof f?.id === 'string') out[f.id] = (typeof f.name === 'string' && f.name) || 'Untitled funnel';
          }
        }
        return out;
      })
      .catch(() => ({}))
      .finally(() => {
        // getFunnels has its own TTL cache; drop ours so renames/org switches refresh.
        setTimeout(() => {
          inflight = null;
        }, 0);
      });
  }
  return inflight;
}

export function useFunnelNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    loadFunnelNames().then((n) => {
      if (!cancelled) setNames(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return names;
}

/** Channel label for a client: funnel name when it came from a known funnel, else Paid/Organic. */
export function channelLabel(
  client: { source_channel?: string | null; source_funnel_id?: string | null },
  funnelNames: Record<string, string>,
): string {
  if (client.source_channel !== 'paid') return 'Organic';
  const name = client.source_funnel_id ? funnelNames[client.source_funnel_id] : undefined;
  return name || 'Paid';
}
