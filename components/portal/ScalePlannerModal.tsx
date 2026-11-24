'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '@/lib/api';
import ScalePlannerPanel from '@/components/funnels/ScalePlannerPanel';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

type FunnelOption = { id: string; name: string };

type Props = {
  onClose: () => void;
  organizationName?: string | null;
  /** System owner previewing an org: that org's funnels and numbers. */
  asOrgId?: string;
};

/**
 * Portal Tools → Scale Planner. Same planner as Funnels → Scale Planner, with a
 * funnel picker so it works outside the funnel dashboard: break-even ROAS, the
 * spend-vs-profit curve, goal path, and the bulk / hold / cut verdict.
 */
export default function ScalePlannerModal({ onClose, organizationName, asOrgId }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [funnels, setFunnels] = useState<FunnelOption[]>([]);
  const [funnelId, setFunnelId] = useState<string>('');

  useEffect(() => {
    setMounted(true);
    // Capture phase so Escape closes only this modal, not the owner org view underneath.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useBodyScrollLock();

  useEffect(() => {
    let cancelled = false;
    const load = asOrgId ? apiClient.getOrganizationFunnels(asOrgId) : apiClient.getFunnels();
    Promise.resolve(load)
      .then((rows: unknown) => {
        if (cancelled || !Array.isArray(rows)) return;
        setFunnels(
          rows
            .filter((f: any) => f && f.id)
            .map((f: any) => ({ id: String(f.id), name: String(f.name || 'Untitled funnel') }))
        );
      })
      .catch(() => {
        if (!cancelled) setFunnels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [asOrgId]);

  if (!mounted) return null;
  const selected = funnels.find((f) => f.id === funnelId) ?? null;

  return createPortal(
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-6xl my-6 sm:my-0 max-h-[92vh] bg-white dark:bg-gray-900 border border-gray-200/30 dark:border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex flex-wrap items-center gap-3 px-5 py-3.5 border-b border-gray-200/40 dark:border-white/8">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Scale Planner</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              Break-even ROAS, safe spend and your goal path{organizationName ? ` · ${organizationName}` : ''}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="sr-only" htmlFor="scale-planner-funnel">
              Funnel
            </label>
            <select
              id="scale-planner-funnel"
              value={funnelId}
              onChange={(e) => setFunnelId(e.target.value)}
              className="max-w-[14rem] rounded-md border border-gray-200 dark:border-white/10 bg-white/70 dark:bg-black/30 px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            >
              <option value="">All paid funnels</option>
              {funnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700/40"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <ScalePlannerPanel
            key={funnelId || 'all'}
            asOrgId={asOrgId}
            funnelId={funnelId || null}
            funnelName={selected?.name ?? null}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
