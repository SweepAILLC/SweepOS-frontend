'use client';

import { useState } from 'react';
import type { ConsultingTier } from '@/types/admin';
import SharedTypingPad from '@/components/portal/SharedTypingPad';
import PortalBookingEmbed from '@/components/portal/PortalBookingEmbed';
import PortalSopDrawer, {
  SOP_DRAWER_WIDTH_COLLAPSED,
  SOP_DRAWER_WIDTH_OPEN,
} from '@/components/portal/PortalSopDrawer';
import PortalToolsSection from '@/components/portal/PortalToolsSection';

export interface OrgPortalPanelProps {
  organizationName: string | null;
  consultingTier: ConsultingTier | null;
  bookingUrl: string | null;
  /** When false, skip fetching (e.g. tab not active). Defaults to true. */
  isActive?: boolean;
}

function tierLabel(tier: ConsultingTier | null): string | null {
  if (tier === 'pro_consulting') return 'Pro Consulting';
  if (tier === 'core_consulting') return 'Core Consulting';
  return null;
}

export default function OrgPortalPanel({
  organizationName,
  consultingTier,
  bookingUrl,
  isActive = true,
}: OrgPortalPanelProps) {
  const label = tierLabel(consultingTier);
  const canBook = Boolean(bookingUrl?.trim());
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="w-full min-h-[calc(100vh-1.5rem)]">
      <div
        className="min-w-0 space-y-6 pl-1 sm:pl-2 transition-[padding-right] duration-300 ease-out"
        style={{
          paddingRight: drawerOpen ? SOP_DRAWER_WIDTH_OPEN : SOP_DRAWER_WIDTH_COLLAPSED,
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 pr-2">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 truncate">
              {organizationName || 'Organization Portal'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Shared notes, booking, and tools — open the SOP library on the right to study while you type.
            </p>
            {label ? (
              <span
                className={`inline-flex mt-2 items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  consultingTier === 'pro_consulting'
                    ? 'bg-violet-500/20 text-violet-900 dark:text-violet-100 border-violet-400/40'
                    : 'bg-blue-500/20 text-blue-900 dark:text-blue-100 border-blue-400/40'
                }`}
              >
                {label}
              </span>
            ) : null}
          </div>
        </div>

        <div className="pr-2">
          <SharedTypingPad
            isActive={isActive}
            title="Shared space"
            subtitle="Live shared notes with your consultant — updates appear within about a second."
          />
        </div>

        <div className="pr-2">
          <section className="glass-card p-5 rounded-lg border border-gray-200 dark:border-white/10">
            <div className="mb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 digitized-text">
                Book a Call
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                {canBook
                  ? `Pick a time with your consultant${label ? ` (${label})` : ''} — booking happens here.`
                  : `Contact your consultant to schedule a call${
                      !consultingTier ? ', or ask to be enrolled in a consulting program.' : '.'
                    }`}
              </p>
            </div>
            {canBook && bookingUrl ? <PortalBookingEmbed bookingUrl={bookingUrl} /> : null}
          </section>
        </div>

        <div className="pr-2">
          <PortalToolsSection isActive={isActive} />
        </div>
      </div>

      <PortalSopDrawer isActive={isActive} open={drawerOpen} onOpenChange={setDrawerOpen} />
    </div>
  );
}
