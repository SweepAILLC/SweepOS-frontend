'use client';

import { useEffect, useRef } from 'react';
import type { AutomationPlaybook, AutomationRule } from '@/lib/api';
import PlaybookCard from './PlaybookCard';

const PLAYBOOK_SHORT: Record<AutomationPlaybook, string> = {
  pre_sale_post_booking: 'Post-booking',
  first_payment_onboarding: 'Onboarding',
  first_payment_referral: 'Referral ask',
  win_combined_ask: 'Combined ask',
  offboarding_recap_ask: 'Offboarding recap',
};

interface PlaybookModalProps {
  rule: AutomationRule | null;
  onClose: () => void;
  onSaved: (next: AutomationRule) => void;
  previewClientId?: string | null;
}

export default function PlaybookModal({
  rule,
  onClose,
  onSaved,
  previewClientId,
}: PlaybookModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit automation playbook"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 bg-gray-950/75 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="flex max-h-[min(94dvh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl outline-none border border-white/10 bg-gradient-to-b from-gray-900 via-gray-950 to-gray-950 shadow-[0_0_60px_rgba(139,92,246,0.12)]"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-400/90">Playbook</p>
            <h2 className="truncate text-base sm:text-lg font-semibold text-white">
              {PLAYBOOK_SHORT[rule.playbook]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close playbook editor"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          <PlaybookCard
            rule={rule}
            onSaved={onSaved}
            previewClientId={previewClientId}
            embedded
          />
        </div>
      </div>
    </div>
  );
}
