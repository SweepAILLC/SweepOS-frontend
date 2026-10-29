'use client';

import { useState } from 'react';
import FunnelCreativeGrid from '@/components/funnels/FunnelCreativeGrid';

// Fixed tab on the far right of the main column. Collapsed rail is 3.75rem;
// open panel spans from the app nav (`--app-sidebar-width`) to the right edge
// so it never slides under the left sidebar.

const DRAWER_WIDTH_COLLAPSED = '3.75rem';
const DRAWER_LEFT_OPEN = 'var(--app-sidebar-width, 14rem)';

export default function FunnelAdPerformanceDrawer({
  funnelId,
  linkedCampaigns,
  selectedCampaignId,
  onSelectedCampaignIdChange,
  start,
  end,
}: {
  funnelId: string;
  linkedCampaigns: { id: string; name: string | null }[];
  // Controlled, not local state — the same toggle also scopes the aggregate
  // scorecard's Ad Spend row (FunnelDashboard owns it so both stay in sync).
  selectedCampaignId: string | null;
  onSelectedCampaignIdChange: (id: string | null) => void;
  // The page's shared date-range picker — drives the creative grid's trend arrows.
  start: string;
  end: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-[45] bg-black/35 lg:left-[var(--app-sidebar-width,14rem)]"
          aria-label="Close ad performance overlay"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <aside
        className="fixed top-0 right-0 bottom-0 z-[46] flex flex-col border-l border-gray-200 dark:border-white/10 bg-white/95 dark:bg-gray-950/95 backdrop-blur shadow-[-8px_0_24px_rgba(0,0,0,0.06)] transition-[left,width] duration-300 ease-out"
        style={
          open
            ? { left: DRAWER_LEFT_OPEN, width: 'auto' }
            : { width: DRAWER_WIDTH_COLLAPSED, left: 'auto' }
        }
        aria-expanded={open}
      >
        {!open ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-full w-full flex flex-col items-center justify-center gap-4 bg-violet-50/80 dark:bg-violet-950/40 hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors border-l-2 border-violet-400/50"
            title="Open ad performance"
          >
            <svg className="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span
              className="text-xs font-bold uppercase tracking-[0.22em] text-violet-800 dark:text-violet-200"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Ad performance
            </span>
          </button>
        ) : (
          <div className="h-full w-full flex flex-col overflow-hidden">
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-3 border-b border-gray-200/80 dark:border-white/10">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Ad performance</h3>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                  Per-creative Spend/Results/CPR/CTR across this funnel&apos;s linked campaign(s)
                </p>
              </div>
              {linkedCampaigns.length > 1 ? (
                <select
                  value={selectedCampaignId ?? ''}
                  onChange={(e) => onSelectedCampaignIdChange(e.target.value || null)}
                  className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-transparent px-2 py-1"
                >
                  <option value="">All linked campaigns</option>
                  {linkedCampaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.id}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/10"
                aria-label="Collapse ad performance drawer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <FunnelCreativeGrid funnelId={funnelId} campaignId={selectedCampaignId} start={start} end={end} />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
