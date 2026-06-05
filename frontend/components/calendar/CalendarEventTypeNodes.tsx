'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import {
  calComEventTypesToNodes,
  calendlyEventTypesToNodes,
  formatEventTypeDuration,
  type CalendarEventTypeNode,
  type CalendarEventTypeProvider,
} from '@/lib/calendarEventTypes';

interface CalendarEventTypeNodesProps {
  provider: CalendarEventTypeProvider;
  /** Bump to reload event types + sales-call flags (e.g. parent Refresh). */
  refreshKey?: number;
  compact?: boolean;
  className?: string;
  onLoadingChange?: (loading: boolean) => void;
  /** After sales-call designation changes — parent may re-sync bookings. */
  onSalesCallChanged?: () => void;
}

export default function CalendarEventTypeNodes({
  provider,
  refreshKey = 0,
  compact = false,
  className = '',
  onLoadingChange,
  onSalesCallChanged,
}: CalendarEventTypeNodesProps) {
  const [nodes, setNodes] = useState<CalendarEventTypeNode[]>([]);
  const [salesCallIds, setSalesCallIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const setLoadingState = useCallback(
    (next: boolean) => {
      setLoading(next);
      onLoadingChange?.(next);
    },
    [onLoadingChange],
  );

  const load = useCallback(async () => {
    setLoadingState(true);
    setError(null);
    try {
      const [typesRes, salesRes] = await Promise.all([
        provider === 'calcom'
          ? apiClient.getCalComEventTypes()
          : apiClient.getCalendlyEventTypes({ count: 50, sort: 'name:asc' }),
        apiClient.listSalesCallEventTypes(provider),
      ]);

      const nextNodes =
        provider === 'calcom'
          ? calComEventTypesToNodes(typesRes.event_types || [])
          : calendlyEventTypesToNodes(typesRes.collection || []);

      setNodes(nextNodes);
      setSalesCallIds(new Set((salesRes.event_type_ids || []).map(String)));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as Error)?.message ||
        'Failed to load event types';
      setError(typeof msg === 'string' ? msg : 'Failed to load event types');
      setNodes([]);
      setSalesCallIds(new Set());
    } finally {
      setLoadingState(false);
    }
  }, [provider, setLoadingState]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const copyLink = async (node: CalendarEventTypeNode) => {
    if (!node.shareUrl) return;
    try {
      await navigator.clipboard.writeText(node.shareUrl);
      setCopiedId(node.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      alert('Could not copy link to clipboard');
    }
  };

  const toggleSalesCall = async (node: CalendarEventTypeNode, next: boolean) => {
    setTogglingId(node.id);
    try {
      if (next) {
        await apiClient.addSalesCallEventType(provider, node.id);
        setSalesCallIds((prev) => {
          const n = new Set(prev);
          n.add(node.id);
          return n;
        });
      } else {
        await apiClient.removeSalesCallEventType(provider, node.id);
        setSalesCallIds((prev) => {
          const n = new Set(prev);
          n.delete(node.id);
          return n;
        });
      }
      onSalesCallChanged?.();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (e as Error)?.message ||
        'Could not update sales call setting';
      alert(typeof msg === 'string' ? msg : 'Could not update sales call setting');
    } finally {
      setTogglingId(null);
    }
  };

  if (loading && nodes.length === 0) {
    return (
      <div className={`text-xs text-gray-500 dark:text-gray-400 py-2 ${className}`}>
        Loading event types…
      </div>
    );
  }

  if (error && nodes.length === 0) {
    return (
      <div className={`rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200 ${className}`}>
        {error}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className={`text-xs text-gray-500 dark:text-gray-400 py-1 ${className}`}>
        No event types in {provider === 'calcom' ? 'Cal.com' : 'Calendly'} yet — create one in your calendar app to share booking links here.
      </div>
    );
  }

  const providerLabel = provider === 'calcom' ? 'Cal.com' : 'Calendly';

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <p className={`font-medium text-gray-900 dark:text-gray-100 ${compact ? 'text-xs' : 'text-sm'}`}>
            Event types
          </p>
          <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Copy share links · toggle <span className="text-indigo-600 dark:text-indigo-300">Sales call</span> for close &amp; show-up metrics
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-600 dark:text-gray-300">
          {providerLabel}
        </span>
      </div>

      <div className="divide-y divide-gray-200/80 dark:divide-white/10 rounded-lg border border-gray-200/80 dark:border-white/10 bg-white/40 dark:bg-white/[0.03]">
        {nodes.map((node) => {
          const isSalesCall = salesCallIds.has(node.id);
          const busy = togglingId === node.id;
          const copied = copiedId === node.id;
          const duration = formatEventTypeDuration(node.durationMinutes);

          return (
            <div
              key={node.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}
            >
              <div className="flex-1 min-w-[140px]">
                <p className={`font-medium text-gray-900 dark:text-gray-100 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
                  {node.label}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                  {duration ? `${duration}` : '—'}
                  {node.slug ? ` · ${node.slug}` : ''}
                </p>
              </div>

              <ToggleSwitch
                checked={isSalesCall}
                disabled={busy}
                onChange={(on) => void toggleSalesCall(node, on)}
                label="Sales call"
                onLabel="Yes"
                offLabel="No"
                tone="cyan"
              />

              <div className="flex items-center gap-1.5 shrink-0">
                {node.shareUrl ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void copyLink(node)}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                        copied
                          ? 'border-green-400/40 bg-green-500/15 text-green-800 dark:text-green-200'
                          : 'border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-200 hover:bg-white/10'
                      }`}
                    >
                      {copied ? 'Copied' : 'Copy link'}
                    </button>
                    <a
                      href={node.shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] px-2 py-1 rounded-md border border-gray-200 dark:border-white/15 text-gray-700 dark:text-gray-200 hover:bg-white/10"
                      title="Open booking page"
                    >
                      Open
                    </a>
                  </>
                ) : (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">No public link</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error ? (
        <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1.5">{error}</p>
      ) : null}
    </div>
  );
}
