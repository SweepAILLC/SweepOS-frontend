'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const STORAGE_KEY = 'sweep:sidebar-collapsed';

/** Expanded rail matches `w-56` (14rem). Collapsed is icon-only. */
export const SIDEBAR_WIDTH_EXPANDED = '14rem';
export const SIDEBAR_WIDTH_COLLAPSED = '5rem';

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  /** Tailwind `pl-*` for main shell (standard tabs). */
  mainPaddingClass: string;
  /** Tailwind `pl-*` when Call Library list rail is visible. */
  callLibraryPaddingClass: string;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function readStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function applySidebarCssVar(collapsed: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(
    '--app-sidebar-width',
    collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
  );
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readStoredCollapsed();
    setCollapsedState(stored);
    applySidebarCssVar(stored);
    setHydrated(true);
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    writeStoredCollapsed(value);
    applySidebarCssVar(value);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeStoredCollapsed(next);
      applySidebarCssVar(next);
      return next;
    });
  }, []);

  const value = useMemo<SidebarContextValue>(() => {
    const nav = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
    return {
      collapsed: hydrated ? collapsed : false,
      setCollapsed,
      toggleCollapsed,
      mainPaddingClass: hydrated
        ? collapsed
          ? 'pl-[5rem]'
          : 'pl-56'
        : 'pl-56',
      callLibraryPaddingClass: hydrated
        ? collapsed
          ? 'pl-[calc(5rem+20rem)]'
          : 'pl-[calc(14rem+20rem)]'
        : 'pl-[calc(14rem+20rem)]',
    };
  }, [collapsed, hydrated, setCollapsed, toggleCollapsed]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return ctx;
}

/** Safe on pages without provider (e.g. login) — returns expanded defaults. */
export function useSidebarOptional(): SidebarContextValue {
  const ctx = useContext(SidebarContext);
  if (ctx) return ctx;
  return {
    collapsed: false,
    setCollapsed: () => {},
    toggleCollapsed: () => {},
    mainPaddingClass: 'pl-56',
    callLibraryPaddingClass: 'pl-[calc(14rem+20rem)]',
  };
}
