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
import { MOBILE_NAV_QUERY } from '@/hooks/useMediaQuery';

const STORAGE_KEY = 'sweep:sidebar-collapsed';

/** Expanded rail matches `w-56` (14rem). Collapsed is icon-only. */
export const SIDEBAR_WIDTH_EXPANDED = '14rem';
export const SIDEBAR_WIDTH_COLLAPSED = '5rem';

type SidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggleCollapsed: () => void;
  /** Overlay nav open (mobile / narrow viewports only). */
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
  /** True when viewport is below `lg` and nav is an overlay drawer. */
  isMobileNav: boolean;
  /** Tailwind `pl-*` for main shell (standard tabs). Zero on mobile. */
  mainPaddingClass: string;
  /** Tailwind `pl-*` when Call Library list rail is visible. Zero on mobile. */
  callLibraryPaddingClass: string;
  /** Top offset for the fixed mobile brand/menu bar. */
  mobileTopPaddingClass: string;
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

function applySidebarCssVar(collapsed: boolean, isMobileNav: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(
    '--app-sidebar-width',
    isMobileNav ? '0px' : collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
  );
  document.documentElement.dataset.mobileNav = isMobileNav ? '1' : '0';
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileNavOpen, setMobileNavOpenState] = useState(false);
  const [isMobileNav, setIsMobileNav] = useState(false);

  useEffect(() => {
    const stored = readStoredCollapsed();
    setCollapsedState(stored);

    const mql = window.matchMedia(MOBILE_NAV_QUERY);
    const syncViewport = () => {
      const mobile = mql.matches;
      setIsMobileNav(mobile);
      if (!mobile) {
        setMobileNavOpenState(false);
      }
    };
    syncViewport();
    setHydrated(true);

    mql.addEventListener('change', syncViewport);
    return () => mql.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    applySidebarCssVar(collapsed, isMobileNav);
  }, [collapsed, isMobileNav, hydrated]);

  // Lock body scroll while the mobile drawer is open so it never scrolls the main shell underneath.
  useEffect(() => {
    if (!mobileNavOpen || !isMobileNav) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen, isMobileNav]);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    writeStoredCollapsed(value);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeStoredCollapsed(next);
      return next;
    });
  }, []);

  const setMobileNavOpen = useCallback((open: boolean) => {
    setMobileNavOpenState(open);
  }, []);

  const openMobileNav = useCallback(() => setMobileNavOpenState(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpenState(false), []);
  const toggleMobileNav = useCallback(() => {
    setMobileNavOpenState((prev) => !prev);
  }, []);

  const value = useMemo<SidebarContextValue>(() => {
    const desktopMain = collapsed ? 'lg:pl-[5rem]' : 'lg:pl-56';
    const desktopCallLibrary = collapsed
      ? 'lg:pl-[calc(5rem+20rem)]'
      : 'lg:pl-[calc(14rem+20rem)]';

    return {
      collapsed: hydrated ? collapsed : false,
      setCollapsed,
      toggleCollapsed,
      mobileNavOpen,
      setMobileNavOpen,
      openMobileNav,
      closeMobileNav,
      toggleMobileNav,
      isMobileNav: hydrated ? isMobileNav : false,
      // No left gutter below `lg` — overlay drawer must not shrink the main canvas.
      mainPaddingClass: hydrated ? `pl-0 ${desktopMain}` : 'pl-0 lg:pl-56',
      callLibraryPaddingClass: hydrated
        ? `pl-0 ${desktopCallLibrary}`
        : 'pl-0 lg:pl-[calc(14rem+20rem)]',
      mobileTopPaddingClass:
        'pt-[calc(var(--app-mobile-topbar-height,0px)+env(safe-area-inset-top,0px))] lg:pt-0',
    };
  }, [
    collapsed,
    hydrated,
    isMobileNav,
    mobileNavOpen,
    setCollapsed,
    toggleCollapsed,
    setMobileNavOpen,
    openMobileNav,
    closeMobileNav,
    toggleMobileNav,
  ]);

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
    mobileNavOpen: false,
    setMobileNavOpen: () => {},
    openMobileNav: () => {},
    closeMobileNav: () => {},
    toggleMobileNav: () => {},
    isMobileNav: false,
    mainPaddingClass: 'pl-0 lg:pl-56',
    callLibraryPaddingClass: 'pl-0 lg:pl-[calc(14rem+20rem)]',
    mobileTopPaddingClass:
      'pt-[calc(var(--app-mobile-topbar-height,0px)+env(safe-area-inset-top,0px))] lg:pt-0',
  };
}
