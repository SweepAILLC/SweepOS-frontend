'use client';

import { useState } from 'react';
import { buildVideoTrackingSnippet } from '@/lib/funnelTracking';
import type { Funnel } from '@/types/funnel';

/**
 * Video play/watch-time snippet for a VSL or other `<video>` on the funnel page.
 * Shown for every funnel — GHL-paired or fully custom-built — since the snippet only
 * needs `funnel_id` and posts to the same public `/funnels/events` endpoint either way.
 */
export default function FunnelVideoTrackingCard({ funnel }: { funnel: Funnel }) {
  const [eventPrefix, setEventPrefix] = useState('video');
  const [copied, setCopied] = useState(false);
  const prefix = eventPrefix.trim() || 'video';
  const snippet = buildVideoTrackingSnippet(funnel.id, { eventPrefix: prefix });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="glass-card p-6 space-y-3">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Track video (optional)</h3>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Paste this on whichever funnel page has the VSL/video — GHL Settings → Head tracking code for a
        GHL-paired funnel, or inline in your page&apos;s HTML for a custom-built one. It tracks every{' '}
        <code>&lt;video&gt;</code> element&apos;s play, pause, 25/50/75/90/100% milestones, watch-time, and
        completion. Reload-safe: a refresh mid-video does not double-count milestones or reset watch time.
      </p>
      <div className="space-y-1">
        <label htmlFor={`video-event-prefix-${funnel.id}`} className="block text-xs text-gray-500 dark:text-gray-400">
          Event name prefix — must match the Steps tab (e.g. <code>{prefix}_play</code>, <code>{prefix}_50</code>,{' '}
          <code>{prefix}_complete</code>)
        </label>
        <input
          id={`video-event-prefix-${funnel.id}`}
          type="text"
          value={eventPrefix}
          onChange={(e) => setEventPrefix(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-white/15 bg-white dark:bg-white/5 rounded-md text-sm text-gray-900 dark:text-gray-100"
        />
      </div>
      <div className="relative">
        <pre className="max-h-48 overflow-auto rounded-md bg-gray-900 text-gray-100 p-3 pr-28 text-[11px] leading-relaxed">
          <code>{snippet}</code>
        </pre>
        <button
          type="button"
          onClick={() => void copy()}
          className="absolute right-2 top-2 shrink-0 px-2.5 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {copied ? 'Copied' : 'Copy snippet'}
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Add rows <code>{prefix}_play</code>, <code>{prefix}_25</code>, <code>{prefix}_50</code>,{' '}
        <code>{prefix}_75</code>, <code>{prefix}_90</code>, <code>{prefix}_100</code>,{' '}
        <code>{prefix}_watch_heartbeat</code>, <code>{prefix}_complete</code> to this funnel&apos;s Steps tab or
        they won&apos;t show up in analytics.
      </p>
    </div>
  );
}
