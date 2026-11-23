'use client';

import { useEffect, useState } from 'react';
import type { ConsultingTier } from '@/types/admin';
import OrgPortalPanel from '@/components/portal/OrgPortalPanel';
import ScalePlannerPanel from '@/components/funnels/ScalePlannerPanel';

/**
 * Owner org view: a system owner sees an org's portal the way that org sees it —
 * its shared pads, SOP library with its locks, tools, notices — plus the org's
 * Scale Planner. Full-screen over the owner dashboard; Escape or "Exit" returns.
 * Shared-pad edits are live (same as editing from the owner dashboard).
 */
export default function OrgPortalPreview({
  orgId,
  organizationName,
  consultingTier,
  bookingUrl,
  onClose,
}: {
  orgId: string;
  organizationName: string | null;
  consultingTier: ConsultingTier | null;
  bookingUrl: string | null;
  onClose: () => void;
}) {
  const [view, setView] = useState<'portal' | 'planner'>('portal');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-gray-50 dark:bg-gray-950"
      role="dialog"
      aria-modal="true"
      aria-label={`${organizationName || 'Organization'} portal preview`}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-amber-300/50 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-950/40 px-4 py-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-100">
          <span aria-hidden>👁</span> Viewing as {organizationName || 'this org'}
        </span>
        <span className="text-xs text-amber-800/80 dark:text-amber-200/80">
          What this org sees in its portal. Shared-space edits are live.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-amber-400/40 bg-white/60 dark:bg-white/5 p-0.5" role="tablist">
            {(
              [
                ['portal', 'Portal'],
                ['planner', 'Scale Planner'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  view === id
                    ? 'bg-amber-500/20 text-amber-900 dark:text-amber-100'
                    : 'text-amber-800 dark:text-amber-200 hover:bg-amber-500/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-amber-400/50 bg-white dark:bg-white/10 px-3 py-1 text-xs font-semibold text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-white/20"
          >
            Exit view
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4">
        {view === 'portal' ? (
          <OrgPortalPanel
            organizationName={organizationName}
            consultingTier={consultingTier}
            bookingUrl={bookingUrl}
            isActive
            previewOrgId={orgId}
          />
        ) : (
          <div className="max-w-7xl mx-auto">
            <ScalePlannerPanel asOrgId={orgId} />
          </div>
        )}
      </div>
    </div>
  );
}
