'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, type AutomationRule, type AutomationTriggerConfig } from '@/lib/api';
import ToggleSwitch from '@/components/ui/ToggleSwitch';

interface BookingTriggerModalProps {
  rule: AutomationRule | null;
  onClose: () => void;
  onSaved: (next: AutomationRule) => void;
}

type CalendarProvider = 'calcom' | 'calendly' | 'any';

interface BookingEventOption {
  id: string;
  label: string;
  provider: 'calcom' | 'calendly';
  slug?: string;
}

const fieldClass =
  'block w-full rounded-lg border border-gray-300/80 dark:border-white/10 bg-white dark:bg-gray-900/80 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/25';

export default function BookingTriggerModal({ rule, onClose, onSaved }: BookingTriggerModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [triggerConfig, setTriggerConfig] = useState<AutomationTriggerConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rule) setTriggerConfig(rule.trigger_config ?? null);
    setError(null);
  }, [rule]);

  useEffect(() => {
    if (!rule) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [rule, onClose]);

  if (!rule) return null;

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await apiClient.updateAutomationRule(rule.playbook, {
        enabled: rule.enabled,
        delay_seconds: rule.delay_seconds,
        content_mode: rule.content_mode,
        subject_template: rule.subject_template ?? null,
        html_template_ref: rule.html_template_ref ?? null,
        ai_content_system_prompt: rule.ai_content_system_prompt ?? null,
        audience_filter: rule.audience_filter ?? null,
        trigger_config: triggerConfig,
        opportunity_priority: rule.opportunity_priority ?? null,
        combine_top_n: rule.combine_top_n,
        require_approval: rule.require_approval,
        approval_ttl_hours: rule.approval_ttl_hours ?? null,
      });
      onSaved(next);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save booking trigger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit booking trigger"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-gray-950/75 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[min(94dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl outline-none border border-white/10 bg-gradient-to-b from-gray-900 via-gray-950 to-gray-950 shadow-[0_0_40px_rgba(139,92,246,0.12)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-400/90">Trigger</p>
            <h3 className="text-base font-semibold text-white">Booking lands</h3>
            <p className="mt-1 text-xs text-gray-400">
              Which Calendly / Cal.com events fire the post-booking email (client must not have paid yet).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 bg-white/5 p-2 text-gray-300 hover:text-white"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
          <BookingTriggerFields value={triggerConfig} onChange={setTriggerConfig} dark />
          {error ? (
            <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3 sm:px-5 bg-black/20">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-300 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            aria-busy={saving}
            className="rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 shadow-[0_0_20px_rgba(139,92,246,0.25)]"
          >
            {saving ? 'Saving…' : 'Save trigger'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Shared fields for calendar event selection (used by the booking trigger modal). */
export function BookingTriggerFields({
  value,
  onChange,
  dark = false,
}: {
  value: AutomationTriggerConfig | null;
  onChange: (next: AutomationTriggerConfig | null) => void;
  dark?: boolean;
}) {
  const provider: CalendarProvider = (value?.provider as CalendarProvider) || 'any';
  const matchAll = !!value?.match_all_events;
  const selectedIds = useMemo(() => new Set((value?.event_type_ids ?? []).map(String)), [value]);

  const [calcomOpts, setCalcomOpts] = useState<BookingEventOption[]>([]);
  const [calendlyOpts, setCalendlyOpts] = useState<BookingEventOption[]>([]);
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setLoadError(null);
    (async () => {
      const [calcomStatusRes, calendlyStatusRes] = await Promise.allSettled([
        apiClient.getCalComStatus(),
        apiClient.getCalendlyStatus(),
      ]);
      if (cancelled) return;
      const calcomConnected =
        calcomStatusRes.status === 'fulfilled' &&
        Boolean((calcomStatusRes.value as { connected?: boolean } | null)?.connected);
      const calendlyConnected =
        calendlyStatusRes.status === 'fulfilled' &&
        Boolean((calendlyStatusRes.value as { connected?: boolean } | null)?.connected);

      const calcomEventsP = calcomConnected
        ? apiClient.getCalComEventTypes()
        : Promise.resolve(null);
      const calendlyEventsP = calendlyConnected
        ? apiClient.getCalendlyEventTypes({ count: 50, sort: 'name:asc' })
        : Promise.resolve(null);

      const [calcomRes, calendlyRes] = await Promise.allSettled([calcomEventsP, calendlyEventsP]);
      if (cancelled) return;

      const errors: string[] = [];
      if (calcomConnected) {
        if (calcomRes.status === 'fulfilled' && calcomRes.value) {
          const data = calcomRes.value as { event_types?: Array<{ id: number | string; title: string; slug?: string }> };
          const list = Array.isArray(data.event_types) ? data.event_types : [];
          setCalcomOpts(
            list.map((e) => ({
              id: String(e.id),
              label: e.title || e.slug || `Event ${e.id}`,
              provider: 'calcom' as const,
              slug: e.slug,
            }))
          );
        } else {
          setCalcomOpts([]);
          errors.push('Cal.com');
        }
      } else {
        setCalcomOpts([]);
      }

      if (calendlyConnected) {
        if (calendlyRes.status === 'fulfilled' && calendlyRes.value) {
          const data = calendlyRes.value as { collection?: Array<{ uri: string; name: string; slug?: string }> };
          const list = Array.isArray(data.collection) ? data.collection : [];
          setCalendlyOpts(
            list.map((e) => ({
              id: e.uri,
              label: e.name || e.slug || e.uri,
              provider: 'calendly' as const,
              slug: e.slug,
            }))
          );
        } else {
          setCalendlyOpts([]);
          errors.push('Calendly');
        }
      } else {
        setCalendlyOpts([]);
      }

      setLoadState('ready');
      if (!calcomConnected && !calendlyConnected) {
        setLoadError(
          'No calendar provider is connected yet. Connect Calendly or Cal.com in the Calendar tab to populate this list.'
        );
      } else if (errors.length) {
        setLoadError(`${errors.join(' and ')} event-types fetch failed. Try again or check the integration.`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleOpts = useMemo(() => {
    if (provider === 'calcom') return calcomOpts;
    if (provider === 'calendly') return calendlyOpts;
    return [...calcomOpts, ...calendlyOpts];
  }, [provider, calcomOpts, calendlyOpts]);

  const setProvider = (next: CalendarProvider) => {
    const allowedIds = new Set(
      next === 'calcom'
        ? calcomOpts.map((o) => o.id)
        : next === 'calendly'
          ? calendlyOpts.map((o) => o.id)
          : [...calcomOpts.map((o) => o.id), ...calendlyOpts.map((o) => o.id)]
    );
    const kept = (value?.event_type_ids ?? []).filter((id) => allowedIds.has(String(id)));
    onChange({
      provider: next,
      event_type_ids: kept,
      match_all_events: matchAll,
    });
  };

  const toggleEvent = (id: string, on: boolean) => {
    const ids = new Set(selectedIds);
    if (on) ids.add(id);
    else ids.delete(id);
    onChange({
      provider,
      event_type_ids: Array.from(ids),
      match_all_events: matchAll,
    });
  };

  const setMatchAll = (on: boolean) => {
    onChange({
      provider,
      event_type_ids: value?.event_type_ids ?? [],
      match_all_events: on,
    });
  };

  const apiBase = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
    if (env) return env;
    if (typeof window !== 'undefined') return window.location.origin.replace(/\/$/, '');
    return '';
  }, []);

  const orgIdHint = useMemo(() => {
    if (typeof document === 'undefined') return '<your-org-id>';
    const m = document.cookie.match(/(?:^|; )access_token=([^;]+)/);
    if (!m) return '<your-org-id>';
    try {
      const parts = m[1].split('.');
      if (parts.length < 2) return '<your-org-id>';
      const json = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      return String(json?.org_id || '<your-org-id>');
    } catch {
      return '<your-org-id>';
    }
  }, []);

  const selectionSummary = (() => {
    if (matchAll) {
      return `Will fire for every booking from ${provider === 'any' ? 'either provider' : provider === 'calcom' ? 'Cal.com' : 'Calendly'}.`;
    }
    const n = selectedIds.size;
    if (n === 0) return 'No events selected — nothing will send.';
    return `Will fire for ${n} selected event${n === 1 ? '' : 's'}.`;
  })();

  const labelClass = dark ? 'text-gray-200' : 'text-gray-800 dark:text-gray-200';
  const mutedClass = dark ? 'text-gray-400' : 'text-gray-600 dark:text-gray-300';
  const selectClass = dark
    ? 'block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-violet-500/60 focus:outline-none focus:ring-2 focus:ring-violet-500/25'
    : fieldClass;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={`text-xs space-y-1.5 ${mutedClass}`}>
          <span className={`font-medium ${labelClass}`}>Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as CalendarProvider)}
            className={selectClass}
          >
            <option value="any">Any (Calendly + Cal.com)</option>
            <option value="calcom">Cal.com only</option>
            <option value="calendly">Calendly only</option>
          </select>
        </label>

        <div className="flex items-end">
          <ToggleSwitch
            checked={matchAll}
            onChange={setMatchAll}
            label="All bookings"
            onLabel="All"
            offLabel="Pick"
            tone="cyan"
          />
        </div>
      </div>

      {!matchAll && (
        <div className="space-y-1">
          <div className={`text-[11px] font-medium ${labelClass}`}>Events that fire this automation</div>
          {loadState === 'loading' ? (
            <div className={`text-xs ${mutedClass}`}>Loading event types…</div>
          ) : visibleOpts.length === 0 ? (
            <div className={`text-xs ${mutedClass}`}>
              No event types found.{' '}
              <Link className="underline" href="/?tab=calendar">
                Connect a calendar →
              </Link>
            </div>
          ) : (
            <div
              className={`max-h-56 overflow-y-auto rounded border divide-y ${
                dark
                  ? 'border-gray-700 bg-gray-900 divide-gray-800'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-gray-100 dark:divide-gray-800'
              }`}
            >
              {visibleOpts.map((opt) => {
                const checked = selectedIds.has(opt.id);
                return (
                  <label
                    key={`${opt.provider}:${opt.id}`}
                    className={`flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer ${
                      dark
                        ? 'text-gray-100 hover:bg-gray-800/50'
                        : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleEvent(opt.id, e.target.checked)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 truncate">{opt.label}</span>
                    <span
                      className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full ${
                        opt.provider === 'calcom'
                          ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {opt.provider}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {loadError ? (
            <div className="text-[11px] text-amber-700 dark:text-amber-300">{loadError}</div>
          ) : null}
        </div>
      )}

      <div className={`text-[11px] ${labelClass}`}>{selectionSummary}</div>

      <details className={`text-[11px] ${mutedClass}`}>
        <summary className="cursor-pointer underline-offset-2 hover:underline">
          Real-time webhook setup (optional — pull sync also fires this automation)
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            For instant delivery, point your provider&apos;s webhook at the URL below. Without it, the automation still
            fires after the next calendar sync (every ~45s while the Calendar tab is open, or whenever the Refresh
            button is clicked).
          </p>
          <div className="space-y-1">
            <div
              className={`font-mono text-[11px] break-all rounded p-1.5 ${
                dark ? 'bg-gray-800' : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              {apiBase}/webhooks/calendly/{orgIdHint}
            </div>
            <div className={mutedClass}>
              Calendly → Webhook subscription → subscribe to <code>invitee.created</code>.
            </div>
          </div>
          <div className="space-y-1">
            <div
              className={`font-mono text-[11px] break-all rounded p-1.5 ${
                dark ? 'bg-gray-800' : 'bg-gray-100 dark:bg-gray-800'
              }`}
            >
              {apiBase}/webhooks/calcom/{orgIdHint}
            </div>
            <div className={mutedClass}>
              Cal.com → Webhooks → trigger <code>BOOKING_CREATED</code>.
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
