'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient, type AutomationFlow, type AutomationRule } from '@/lib/api';
import type { Client } from '@/types/client';
import TimelineCanvas from './TimelineCanvas';
import SendLog from './SendLog';
import DispatcherHealth from './DispatcherHealth';

type FlowTab = AutomationFlow | 'log' | 'health';

const FLOW_TABS: Array<{ id: FlowTab; label: string; description: string }> = [
  {
    id: 'post_booking',
    label: 'Post-booking',
    description:
      'Emails after a booking lands and before the call. Customize waits, pre-call timing, and how many emails go out.',
  },
  {
    id: 'onboarding',
    label: 'Onboarding',
    description:
      'Emails after first payment. Customize waits and how many nurture / ask emails fire in the sequence.',
  },
  {
    id: 'wins_ascension',
    label: 'Wins / ascension',
    description:
      'Emails after a win is detected and when a client enters offboarding. Customize waits and email count per trigger.',
  },
  { id: 'log', label: 'Send log', description: 'Every job — sent, failed, skipped, or awaiting approval.' },
  { id: 'health', label: 'Health', description: 'Worker heartbeat and queue depth.' },
];

export default function AutomationsTab() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<FlowTab>('post_booking');
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
        const top = (clients as Client[]).filter((c) => !!c.email).slice(0, 50);
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
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.playbook === next.playbook);
      if (idx < 0) return [...prev, next];
      const copy = prev.slice();
      copy[idx] = next;
      return copy;
    });
  }, []);

  const onRulesReload = useCallback(async () => {
    try {
      const out = await apiClient.listAutomationRules();
      setRules(out);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to reload rules';
      setError(msg);
    }
  }, []);

  const isFlow = subTab === 'post_booking' || subTab === 'onboarding' || subTab === 'wins_ascension';

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Automations</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 max-w-2xl leading-relaxed">
          Each tab is its own flow. Click the <span className="font-semibold text-violet-600 dark:text-violet-300">+</span> on
          a connector to insert another email step, click a wait node to change timing, or an email node to edit content.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-xl border border-gray-200/80 dark:border-white/10 bg-gray-100/80 dark:bg-white/[0.04] p-1">
          {FLOW_TABS.filter((t) => t.id !== 'log' && t.id !== 'health').map((t) => {
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
        <div className="inline-flex gap-1 rounded-xl border border-gray-200/80 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] p-1">
          {FLOW_TABS.filter((t) => t.id === 'log' || t.id === 'health').map((t) => {
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
        {FLOW_TABS.find((s) => s.id === subTab)?.description}
      </p>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {isFlow && (
        <div className="space-y-4">
          {loading ? (
            <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02] p-8 text-center text-sm text-gray-500 animate-pulse">
              Loading flow…
            </div>
          ) : (
            <TimelineCanvas
              flow={subTab}
              rules={rules}
              previewClient={previewClient}
              previewClientOptions={previewClientOptions}
              previewClientId={previewClientId}
              onPreviewClientChange={setPreviewClientId}
              onRuleSaved={onRuleSaved}
              onRulesReload={onRulesReload}
            />
          )}
        </div>
      )}

      {subTab === 'log' && <SendLog />}
      {subTab === 'health' && <DispatcherHealth />}
    </div>
  );
}
