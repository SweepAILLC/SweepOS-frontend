'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient, type AutomationRule } from '@/lib/api';
import type { Client } from '@/types/client';
import TimelineCanvas from './TimelineCanvas';
import SendLog from './SendLog';
import DispatcherHealth from './DispatcherHealth';

type SubTab = 'timeline' | 'log' | 'health';

const SUBTABS: Array<{ id: SubTab; label: string; description: string }> = [
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Visual journey from booking → payment → wins → offboarding. Click any node to edit.',
  },
  { id: 'log', label: 'Send log', description: 'Every job — sent, failed, skipped, or awaiting approval.' },
  { id: 'health', label: 'Health', description: 'Worker heartbeat and queue depth.' },
];

export default function AutomationsTab() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('timeline');
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);
  const [previewClientOptions, setPreviewClientOptions] = useState<Client[]>([]);

  const previewClient = useMemo(
    () => previewClientOptions.find((c) => c.id === previewClientId) ?? null,
    [previewClientOptions, previewClientId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiClient.listAutomationRules();
      setRules(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load rules';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const clients = await apiClient.getClients();
        if (cancelled) return;
        const top = (clients as Client[])
          .filter((c) => !!c.email)
          .slice(0, 50);
        setPreviewClientOptions(top);
      } catch {
        /* preview is best-effort */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const onRuleSaved = useCallback((next: AutomationRule) => {
    setRules((prev) => prev.map((r) => (r.playbook === next.playbook ? next : r)));
  }, []);

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Automations</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
          Email playbooks that run in the background. Voice and templates come from Intelligence — this tab is for
          timing, triggers, and what to send.
        </p>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200/80 dark:border-white/10 bg-gray-100/80 dark:bg-white/[0.04] p-1">
        {SUBTABS.map((t) => {
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? 'bg-white dark:bg-gray-900 text-violet-700 dark:text-violet-200 shadow-sm ring-1 ring-violet-500/20'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">
        {SUBTABS.find((s) => s.id === subTab)?.description}
      </p>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {subTab === 'timeline' && (
        <div className="space-y-4">
          {loading ? (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02] p-8 text-center text-sm text-gray-500 animate-pulse">
              Loading timeline…
            </div>
          ) : (
            <TimelineCanvas
              rules={rules}
              previewClient={previewClient}
              previewClientOptions={previewClientOptions}
              previewClientId={previewClientId}
              onPreviewClientChange={setPreviewClientId}
              onRuleSaved={onRuleSaved}
            />
          )}
        </div>
      )}

      {subTab === 'log' && <SendLog />}
      {subTab === 'health' && <DispatcherHealth />}
    </div>
  );
}
