'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import FunnelWebhookSettings from '@/components/funnels/FunnelWebhookSettings';
import type { Funnel } from '@/types/funnel';

/** Settings → Integrations → Funnel webhooks: pick a funnel, then manage its webhook URL. */
export default function FunnelWebhookIntegrationCard({
  canManage,
  onChange,
}: {
  canManage: boolean;
  onChange?: () => void;
}) {
  const [funnels, setFunnels] = useState<Funnel[] | null>(null);
  const [funnelId, setFunnelId] = useState('');

  useEffect(() => {
    apiClient
      .getFunnels()
      .then((data) => {
        // GHL-paired funnels get opt-ins through the GHL workflow webhook instead.
        const list = ((data as Funnel[]) || []).filter((f) => f.source !== 'ghl');
        setFunnels(list);
        setFunnelId((current) => current || (list.find((f) => f.webhook_enabled) ?? list[0])?.id || '');
      })
      .catch(() => setFunnels([]));
  }, []);

  const setEnabled = (enabled: boolean) => {
    setFunnels((list) => list?.map((f) => (f.id === funnelId ? { ...f, webhook_enabled: enabled } : f)) ?? list);
    onChange?.();
  };

  if (!canManage) {
    return <p className="text-sm text-gray-600 dark:text-gray-300">Only admins and owners can set up funnel webhooks.</p>;
  }
  if (funnels === null) {
    return <p className="text-xs text-gray-500 dark:text-gray-400">Loading funnels…</p>;
  }
  if (!funnels.length) {
    return (
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Create a funnel on the Funnels tab first, then come back here to get its webhook URL.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Send opt-ins from any form tool (ClickFunnels, Kajabi, Typeform, Zapier, Make, your own site) to a funnel. Each
        funnel has its own URL, and each submission becomes a lead on the Client Board tagged to that funnel.
      </p>
      <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-200">
        Funnel
        <select
          value={funnelId}
          onChange={(e) => setFunnelId(e.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm"
        >
          {funnels.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.webhook_enabled ? ' (webhook on)' : ''}
            </option>
          ))}
        </select>
      </label>
      {funnelId ? (
        <FunnelWebhookSettings key={funnelId} funnelId={funnelId} canManage={canManage} onEnabledChange={setEnabled} />
      ) : null}
    </div>
  );
}
