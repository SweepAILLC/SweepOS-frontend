import { useEffect } from 'react';

/**
 * Locks page scroll while `active`. Ref-counted so nested overlays (owner org view →
 * Tools modal) unlock correctly whatever order they unmount in: React runs a parent's
 * effect cleanup before its children's, so "restore the previous value" locks leave
 * the body stuck on `overflow: hidden` when both close together.
 */
let locks = 0;

export function useBodyScrollLock(active = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    locks += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      locks = Math.max(0, locks - 1);
      if (locks === 0) document.body.style.overflow = '';
    };
  }, [active]);
}
