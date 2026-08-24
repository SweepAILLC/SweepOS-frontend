'use client';

import { useState } from 'react';
import { apiClient, type FathomSyncResponse } from '@/lib/api';

type Variant = 'panel' | 'modal';

interface FathomSyncSectionProps {
  /** panel = full settings page; modal = compact modal layout */
  variant?: Variant;
}

function formatSyncResult(r: FathomSyncResponse): string {
  const ing = r.ingested ?? r.processed ?? 0;
  const seen = r.meetings_seen ?? 0;
  const unlinked = r.ingested_unlinked ?? 0;
  const relinked = r.relinked_to_clients ?? 0;
  const errors = r.ingest_errors ?? 0;
  const queued = r.call_insights_queued ?? 0;
  const parts = [
    `Imported ${ing} meeting(s) (${seen} seen from Fathom).`,
    unlinked > 0
      ? `${unlinked} imported for marketing insights (not yet linked to a client).`
      : null,
    relinked > 0 ? `${relinked} call(s) linked to clients on your board.` : null,
    errors > 0 ? `${errors} meeting(s) could not be saved — check backend logs.` : null,
    queued > 0 ? `${queued} call insight job(s) queued (run in background).` : null,
    ing > 0 ? 'Sentiment and library reports continue in the background.' : null,
  ].filter(Boolean);
  return parts.join(' ');
}

export default function FathomSyncSection({ variant = 'panel' }: FathomSyncSectionProps) {
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncInBackground, setSyncInBackground] = useState(false);

  const handleSync = async () => {
    // Immediate UI feedback: mark as "running in background" and avoid blocking other tabs.
    setSyncing(true);
    setSyncInBackground(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const r: FathomSyncResponse = await apiClient.syncFathomMeetings();
      if (r.skipped && r.reason === 'no_fathom_key') {
        setSyncError(
          'No Fathom API key for this organization. Add it under Integrations (admins/owners) and save, or set FATHOM_API_KEY on the server.'
        );
        setSyncInBackground(false);
        return;
      }
      if (r.skipped) {
        setSyncError(r.reason ? `Sync skipped: ${r.reason}` : 'Sync skipped.');
        setSyncInBackground(false);
        return;
      }
      if (r.started || r.background) {
        setSyncMessage(
          r.message ||
            'Fathom sync started. Meeting metadata imports now; summaries and transcripts continue in the background.'
        );
        return;
      }
      setSyncMessage(formatSyncResult(r) || 'Sync finished.');
      setSyncInBackground(false);
    } catch (e: unknown) {
      const err = e as {
        response?: { data?: { detail?: string | { msg?: string }[] }; status?: number };
        message?: string;
      };
      const detail = err?.response?.data?.detail;
      const detailText =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail.map((d) => d?.msg).filter(Boolean).join('; ')
            : null;
      setSyncError(detailText || err?.message || 'Fathom sync failed.');
      setSyncInBackground(false);
    } finally {
      setSyncing(false);
    }
  };

  const titleClass =
    variant === 'panel'
      ? 'text-sm font-medium text-gray-900 dark:text-gray-100'
      : 'text-sm font-medium text-gray-900 dark:text-gray-100';
  const descClass = 'text-xs text-gray-500 dark:text-gray-400 leading-relaxed';

  return (
    <div
      className={
        variant === 'panel'
          ? 'rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 p-4 space-y-3'
          : 'mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3'
      }
    >
      <div>
        <h3 className={titleClass}>Import past Fathom calls</h3>
        <p className={`${descClass} mt-1`}>
          Fetches recent recordings from your Fathom account (metadata first, then summaries in the background).
          All calls import for marketing insights even when the invitee email is not on your pipeline yet.
          When a matching client is added later, calls link automatically.
        </p>
      </div>
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className="inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium border border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-200 hover:bg-violet-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {syncing ? (
          <>
            <span className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-violet-500 border-t-transparent mr-2" />
            {syncInBackground ? 'Fathom sync running in background…' : 'Syncing with Fathom…'}
          </>
        ) : (
          'Sync Fathom now'
        )}
      </button>
      {syncMessage && (
        <p className="text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2">
          {syncMessage}
        </p>
      )}
      {syncInBackground && !syncError && (
        <p className="text-xs text-gray-600 dark:text-gray-300">
          You can continue using other tabs while we finish importing and analyzing your Fathom calls.
        </p>
      )}
      {syncError && (
        <p className="text-xs text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {syncError}
        </p>
      )}
    </div>
  );
}
