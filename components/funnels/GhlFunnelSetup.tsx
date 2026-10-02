'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import { buildVisitorSnippet, ghlWebhookUrl, GHL_WEBHOOK_SECRET_HEADER } from '@/lib/funnelTracking';
import type { Funnel } from '@/types/funnel';
import type { GhlStatus } from '@/types/integration';

const INSTALL_POLL_MS = 5_000;
const INSTALL_POLL_MAX_MS = 10 * 60_000;
const SYNC_POLL_MS = 5_000;
const SYNC_POLL_MAX_MS = 3 * 60_000;

interface GhlFunnelSetupProps {
  funnel: Funnel;
  canManage: boolean;
  /** 'setup' right after create: polls until the first page view lands. */
  mode: 'setup' | 'settings';
  onFunnelChange?: (funnel: Funnel) => void;
}

function formatWhen(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function errorDetail(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { detail?: unknown } } };
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message);
  return fallback;
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="shrink-0 px-2.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 min-w-0">
      <span className="block text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <code className="flex-1 min-w-0 truncate rounded bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs font-mono text-gray-800 dark:text-gray-100">
          {value}
        </code>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

function StatusDot({ tone }: { tone: 'good' | 'wait' | 'bad' }) {
  const color = tone === 'good' ? 'bg-emerald-500' : tone === 'bad' ? 'bg-red-500' : 'bg-amber-500';
  return <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />;
}

function Card({ step, title, optional, children }: { step: number; title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <section className="glass-card p-4 sm:p-5 space-y-3">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
        {step}. {title}
        {optional ? <span className="ml-2 text-[11px] font-normal text-gray-500 dark:text-gray-400">Optional</span> : null}
      </h3>
      {children}
    </section>
  );
}

/** Visitor snippet with a live "Check installation" status. */
function VisitorCard({ funnel, mode }: { funnel: Funnel; mode: GhlFunnelSetupProps['mode'] }) {
  const snippet = buildVisitorSnippet(funnel.id);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(mode === 'setup');
  const startedAt = useRef(Date.now());

  const check = useCallback(async () => {
    try {
      const health = (await apiClient.getFunnelHealth(funnel.id)) as { last_event_at?: string | null };
      setLastEventAt(health?.last_event_at ?? null);
      return Boolean(health?.last_event_at);
    } catch {
      return false;
    }
  }, [funnel.id]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const found = await check();
      if (cancelled) return;
      if (mode === 'setup' && !found && Date.now() - startedAt.current < INSTALL_POLL_MAX_MS) {
        timer = setTimeout(() => void tick(), INSTALL_POLL_MS);
      } else {
        setChecking(false);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [check, mode]);

  return (
    <Card step={1} title="Track visitors">
      <p className="text-xs text-gray-600 dark:text-gray-300">
        In GoHighLevel open <span className="font-medium">Sites → Funnels → {funnel.ghl_config?.name ?? 'your funnel'} → Settings</span>,
        paste this into <span className="font-medium">Head tracking code</span>, and save. It covers every step of the funnel.
      </p>
      <div className="relative">
        <pre className="max-h-48 overflow-auto rounded-md bg-gray-900 text-gray-100 p-3 pr-28 text-[11px] leading-relaxed">
          <code>{snippet}</code>
        </pre>
        <div className="absolute right-2 top-2">
          <CopyButton value={snippet} label="Copy snippet" />
        </div>
      </div>
      <div className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200" role="status" aria-live="polite">
        {lastEventAt ? (
          <>
            <StatusDot tone="good" /> <span>Receiving page views · last {formatWhen(lastEventAt)}</span>
          </>
        ) : checking ? (
          <>
            <StatusDot tone="wait" /> <span>Waiting for the first page view. Open any funnel page after pasting.</span>
          </>
        ) : (
          <>
            <StatusDot tone="wait" />
            <span>
              No page views yet.{' '}
              <button type="button" onClick={() => void check()} className="underline text-indigo-600 dark:text-indigo-400">
                Check installation
              </button>
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

/** Real-time opt-ins: webhook URL, custom data keys, and the org's secret. */
function WebhookCard({ funnel, canManage }: { funnel: Funnel; canManage: boolean }) {
  const [status, setStatus] = useState<GhlStatus | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = ghlWebhookUrl(funnel.org_id);
  const lastHook = funnel.ghl_config?.webhook?.last_received_at;
  const missed = funnel.ghl_config?.sync?.missed_by_webhook ?? 0;

  useEffect(() => {
    apiClient.getGhlStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const rotate = async () => {
    if (
      status?.webhook_secret_set &&
      !window.confirm('Rotating stops every GHL workflow that uses the old secret until you paste the new one. Continue?')
    ) {
      return;
    }
    setRotating(true);
    setError(null);
    try {
      const out = await apiClient.rotateGhlWebhookSecret();
      setSecret(out.secret);
      setStatus((s) => (s ? { ...s, webhook_secret_set: true } : s));
    } catch (e) {
      setError(errorDetail(e, 'Could not generate a secret.'));
    } finally {
      setRotating(false);
    }
  };

  return (
    <Card step={2} title="Real-time leads" optional>
      <p className="text-xs text-gray-600 dark:text-gray-300">
        Without this, leads still arrive from Sweep&apos;s background import within 15 minutes. With it, the lead and its
        notification land in seconds.
      </p>
      <ol className="list-decimal pl-5 space-y-1 text-xs text-gray-700 dark:text-gray-200">
        <li>In GoHighLevel open <span className="font-medium">Automation → Workflows</span> and create a workflow.</li>
        <li>
          Trigger: <span className="font-medium">Form Submitted</span>, filtered to this funnel&apos;s forms (add Survey
          Submitted if it uses a survey).
        </li>
        <li>Action: <span className="font-medium">Webhook</span>, method POST, with the URL, custom data and header below.</li>
        <li>Save and publish the workflow.</li>
      </ol>
      <div className="space-y-2">
        <CopyRow label="Webhook URL" value={url} />
        <CopyRow label="Custom data: sweep_event" value="opt_in" />
        <CopyRow label="Custom data: sweep_funnel_id" value={funnel.id} />
        <div className="space-y-1 min-w-0">
          <span className="block text-[11px] text-gray-500 dark:text-gray-400">Header: {GHL_WEBHOOK_SECRET_HEADER}</span>
          <div className="flex items-center gap-2 min-w-0">
            {secret ? (
              <>
                <code className="flex-1 min-w-0 truncate rounded bg-amber-50 dark:bg-amber-900/30 px-2 py-1 text-xs font-mono text-gray-900 dark:text-gray-100">
                  {secret}
                </code>
                <CopyButton value={secret} />
              </>
            ) : (
              <span className="flex-1 text-xs text-gray-700 dark:text-gray-200">
                {status?.webhook_secret_set ? 'Secret set (hidden)' : 'No secret yet. Opt-ins are refused until one exists.'}
              </span>
            )}
            {canManage ? (
              <button
                type="button"
                onClick={() => void rotate()}
                disabled={rotating}
                className="shrink-0 px-2.5 py-1 text-xs rounded-md bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {rotating ? 'Generating…' : status?.webhook_secret_set ? 'Rotate' : 'Generate secret'}
              </button>
            ) : null}
          </div>
        </div>
        {secret ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">Copy it now. Sweep won&apos;t show this secret again.</p>
        ) : null}
        {error ? <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
      </div>
      <p className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
        <StatusDot tone={lastHook ? 'good' : 'wait'} />
        <span>{lastHook ? `Last webhook lead ${formatWhen(lastHook)}` : 'No webhook leads yet'}</span>
      </p>
      {missed > 0 ? (
        <p className="rounded-md bg-amber-50 dark:bg-amber-900/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="alert">
          The webhook missed {missed} lead{missed === 1 ? '' : 's'} from the last 7 days; the background import caught
          {missed === 1 ? ' it' : ' them'}. Check that the workflow is published and its trigger covers every form on this funnel.
        </p>
      ) : null}
    </Card>
  );
}

/** Lead import (reconcile pull) status with Sync now. */
function ImportCard({
  funnel,
  canManage,
  onFunnelChange,
}: {
  funnel: Funnel;
  canManage: boolean;
  onFunnelChange?: (funnel: Funnel) => void;
}) {
  const sync = funnel.ghl_config?.sync;
  // `running`: a Sync now is in flight. `watching`: poll until a run records an attempt
  // (also before the first run, which the worker starts within a minute of pairing).
  const [running, setRunning] = useState(false);
  const [watching, setWatching] = useState(!sync?.last_attempt_at);
  const [error, setError] = useState<string | null>(null);
  const attemptBefore = useRef(sync?.last_attempt_at ?? null);
  const onChangeRef = useRef(onFunnelChange);
  onChangeRef.current = onFunnelChange;

  // Poll the funnel until the in-flight run records a new attempt.
  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const fresh = (await apiClient.getFunnel(funnel.id)) as Funnel;
        if (cancelled) return;
        const attempt = fresh.ghl_config?.sync?.last_attempt_at ?? null;
        if (attempt && attempt !== attemptBefore.current) {
          attemptBefore.current = attempt;
          setRunning(false);
          setWatching(false);
          onChangeRef.current?.(fresh);
          return;
        }
      } catch {
        /* keep polling */
      }
      if (cancelled) return;
      if (Date.now() - started < SYNC_POLL_MAX_MS) {
        timer = setTimeout(() => void tick(), SYNC_POLL_MS);
      } else {
        setRunning(false);
        setWatching(false);
      }
    };
    timer = setTimeout(() => void tick(), SYNC_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [watching, funnel.id]);

  const syncNow = async () => {
    setError(null);
    try {
      await apiClient.syncFunnelGhlLeads(funnel.id);
      setRunning(true);
      setWatching(true);
    } catch (e) {
      setError(errorDetail(e, 'Could not start the import.'));
    }
  };

  const counts = sync?.last_counts;
  return (
    <Card step={3} title={sync?.last_run_at ? 'Lead import' : 'Importing history'}>
      <div className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200" role="status" aria-live="polite">
        <StatusDot tone={sync?.last_error ? 'bad' : running || watching || !sync?.last_run_at ? 'wait' : 'good'} />
        <div className="space-y-1">
          {running ? (
            <p>Syncing now…</p>
          ) : !sync?.last_run_at && watching ? (
            <p>
              Importing the last 90 days of opt-ins and matching them to bookings. This runs in the background; no
              notifications are sent for past leads.
            </p>
          ) : sync?.last_run_at ? (
            <p>
              Last synced {formatWhen(sync.last_run_at)}
              {counts
                ? ` · ${counts.processed} lead${counts.processed === 1 ? '' : 's'} added or updated, ${counts.skipped} submission${counts.skipped === 1 ? '' : 's'} from other pages skipped`
                : ''}
            </p>
          ) : (
            <p>No import has finished yet. Use Sync now to start one.</p>
          )}
          {sync?.last_error ? <p className="text-red-600 dark:text-red-400">{sync.last_error}</p> : null}
          {error ? <p className="text-red-600 dark:text-red-400">{error}</p> : null}
        </div>
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={() => void syncNow()}
          disabled={running}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          Sync now
        </button>
      ) : null}
    </Card>
  );
}

/**
 * Setup for a GoHighLevel-paired funnel: visitor snippet, optional real-time
 * webhook, and lead import status. Shown after create and in funnel settings.
 */
export default function GhlFunnelSetup({ funnel, canManage, mode, onFunnelChange }: GhlFunnelSetupProps) {
  return (
    <div className="space-y-4">
      <VisitorCard funnel={funnel} mode={mode} />
      <WebhookCard funnel={funnel} canManage={canManage} />
      <ImportCard funnel={funnel} canManage={canManage} onFunnelChange={onFunnelChange} />
    </div>
  );
}
