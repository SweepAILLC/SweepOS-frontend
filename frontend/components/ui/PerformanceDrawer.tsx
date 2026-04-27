'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import Cookies from 'js-cookie';
import { apiClient } from '@/lib/api';
import PerformancePanel from '@/components/ui/PerformancePanel';
import RestrictedTabView from '@/components/ui/RestrictedTabView';
import { APP_PERF_DRAWER_WIDTH_CLASS } from '@/components/ui/layoutConstants';

type PerformanceDrawerContextValue = {
  isOpen: boolean;
  /** True after first open — panel shell stays mounted for slide animation. */
  everOpened: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

const PerformanceDrawerContext = createContext<PerformanceDrawerContextValue | null>(null);

export function usePerformanceDrawer(): PerformanceDrawerContextValue | null {
  return useContext(PerformanceDrawerContext);
}

function PerformanceDrawerPanel({ canAccess }: { canAccess: boolean }) {
  const ctx = useContext(PerformanceDrawerContext);
  const isOpen = ctx?.isOpen ?? false;
  const everOpened = ctx?.everOpened ?? false;
  const close = ctx?.close ?? (() => {});
  const asideRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // Use the `inert` attribute (not aria-hidden) when closed so screen readers and focus both skip
  // the drawer. Avoids "Blocked aria-hidden on an element because its descendant retained focus"
  // when closing via the close button. Also moves focus out so the just-clicked button is not
  // left focused inside an inert subtree.
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    if (isOpen) {
      el.removeAttribute('inert');
    } else {
      if (el.contains(document.activeElement)) {
        (document.activeElement as HTMLElement | null)?.blur();
      }
      el.setAttribute('inert', '');
    }
  }, [isOpen]);

  if (!ctx || !everOpened) return null;

  return (
    <aside
      ref={asideRef}
      id="performance-drawer"
      className={`fixed left-56 top-0 bottom-0 z-[45] flex ${APP_PERF_DRAWER_WIDTH_CLASS} flex-col border-r border-gray-200/80 bg-gray-50/95 shadow-xl backdrop-blur-md transition-transform duration-300 ease-out dark:border-gray-700/80 dark:bg-gray-900/95 ${
        isOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none'
      }`}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200/80 px-4 py-3 dark:border-gray-700/80">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Performance</h2>
        <button
          type="button"
          onClick={() => close()}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-200/80 hover:text-gray-800 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          aria-label="Close performance panel"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4 sm:px-4">
        {canAccess ? <PerformancePanel variant="drawer" /> : <RestrictedTabView tabName="performance" />}
      </div>
    </aside>
  );
}

export function PerformanceDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [canAccess, setCanAccess] = useState(true);

  useEffect(() => {
    if (!Cookies.get('access_token')) return;
    apiClient
      .getMyTabPermissions()
      .then((p: Record<string, boolean>) => setCanAccess(p.performance !== false))
      .catch(() => setCanAccess(true));
  }, []);

  const open = useCallback(() => {
    setEverOpened(true);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => setIsOpen(false), []);

  const toggle = useCallback(() => {
    setEverOpened(true);
    setIsOpen((o) => !o);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      everOpened,
      open,
      close,
      toggle,
    }),
    [isOpen, everOpened, open, close, toggle]
  );

  return (
    <PerformanceDrawerContext.Provider value={value}>
      {children}
      <PerformanceDrawerPanel canAccess={canAccess} />
    </PerformanceDrawerContext.Provider>
  );
}
