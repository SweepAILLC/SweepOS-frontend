/**
 * Left app rail width — Navbar and main content offset must stay aligned.
 * When the sidebar is collapsible, prefer `useSidebar()` from `@/contexts/SidebarContext`.
 *
 * Below Tailwind `lg` (1024px) the rail becomes an overlay drawer: main content uses
 * `pl-0` and a fixed top bar (`--app-mobile-topbar-height`) instead of a left gutter.
 */
export const APP_SIDEBAR_WIDTH = 'w-56';
export const APP_MAIN_PL_OFFSET = 'pl-0 lg:pl-56';

/** Call Library secondary sidebar width. Must match `pl` calcs below. */
export const APP_CALL_LIBRARY_SIDEBAR_WIDTH = 'w-80'; // 20rem
/** Main area left padding for Call Library (sidebar 14rem + call list 20rem) — desktop only. */
export const APP_MAIN_PL_WITH_CALL_LIBRARY = 'pl-0 lg:pl-[calc(14rem+20rem)]';
