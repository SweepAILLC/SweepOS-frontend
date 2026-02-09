import { useEffect, useState } from 'react';
import { useLoading } from '@/contexts/LoadingContext';
import SweepLoadingSpinner from './SweepLoadingSpinner';

export default function GlobalLoadingOverlay() {
  const { isLoading, loadingMessage } = useLoading();
  const [mounted, setMounted] = useState(false);

  // Only render on client-side to avoid SSR issues
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isLoading) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 dark:bg-opacity-90 z-[9999] flex items-center justify-center">
      <div className="bg-white dark:glass-card rounded-lg shadow-xl p-12 border border-gray-200 dark:border-white/10">
        <SweepLoadingSpinner size="lg" message={loadingMessage || 'Loading...'} />
      </div>
    </div>
  );
}

