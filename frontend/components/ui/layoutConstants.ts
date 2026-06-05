/**
 * Left app rail width — Navbar and main content offset must stay aligned.
 * When the sidebar is collapsible, prefer `useSidebar()` from `@/contexts/SidebarContext`.
 */
export const APP_SIDEBAR_WIDTH = 'w-56';
export const APP_MAIN_PL_OFFSET = 'pl-56';

/** Call Library secondary sidebar width. Must match `pl` calcs below. */
export const APP_CALL_LIBRARY_SIDEBAR_WIDTH = 'w-80'; // 20rem
/** Main area left padding for Call Library (sidebar 14rem + call list 20rem). */
export const APP_MAIN_PL_WITH_CALL_LIBRARY = 'pl-[calc(14rem+20rem)]';
