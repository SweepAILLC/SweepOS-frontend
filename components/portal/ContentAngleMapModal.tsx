'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ContentAngleMapView from '@/components/portal/ContentAngleMapView';

type Props = {
  onClose: () => void;
  organizationName?: string | null;
  orgId?: string;
};

export default function ContentAngleMapModal({ onClose, organizationName, orgId }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl my-6 sm:my-0 max-h-[92vh] bg-white dark:bg-gray-900 border border-gray-200/30 dark:border-white/10 rounded-lg shadow-2xl flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-200/40 dark:border-white/8">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Content Angle Map</h2>
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
        <div className="flex-1 overflow-y-auto p-5">
          <ContentAngleMapView orgId={orgId} organizationName={organizationName} plain />
        </div>
      </div>
    </div>,
    document.body
  );
}
