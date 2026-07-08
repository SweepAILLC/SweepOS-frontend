import { useEffect, useState, useRef } from 'react';
import { useLoading } from '@/contexts/LoadingContext';
import SweepLoadingSpinner from './SweepLoadingSpinner';

const LOADING_SAFETY_MS = 12000;

export default function GlobalLoadingOverlay() {
  const { isLoading, loadingMessage, setLoading } = useLoading();
  const [mounted, setMounted] = useState(false);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only render on client-side to avoid SSR issues
  useEffect(() => {
    setMounted(true);
  }, []);

  // Never leave the full-screen overlay stuck if a panel forgets to clear loading.
  useEffect(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
    if (!isLoading) return;
    safetyTimerRef.current = setTimeout(() => {
      setLoading(false);
    }, LOADING_SAFETY_MS);
    return () => {
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, [isLoading, setLoading]);

  if (!mounted || !isLoading) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center premium-overlay-backdrop bg-black/75 dark:bg-black/85 backdrop-blur-sm">
      <div className="premium-reveal glass-card rounded-xl border border-gray-200 dark:border-white/10 p-12 shadow-2xl">
        <SweepLoadingSpinner size="lg" message={loadingMessage || 'Loading...'} />
      </div>
    </div>
  );
}

