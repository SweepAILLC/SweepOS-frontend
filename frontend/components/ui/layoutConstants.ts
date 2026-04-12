/** Left app rail width — Navbar, main offset, and Performance drawer inset must stay aligned. */
export const APP_SIDEBAR_WIDTH = 'w-56';
export const APP_MAIN_PL_OFFSET = 'pl-56';
/** Performance push-panel width — must match `pl` calc in `APP_MAIN_PL_WITH_PERF_OPEN`. */
export const APP_PERF_DRAWER_WIDTH_CLASS = 'w-96';
/** Main area left padding when Performance panel is open (sidebar 14rem + panel 24rem). */
export const APP_MAIN_PL_WITH_PERF_OPEN = 'pl-[calc(14rem+24rem)]';

/** Call Library secondary sidebar width. Must match `pl` calcs below. */
export const APP_CALL_LIBRARY_SIDEBAR_WIDTH = 'w-80'; // 20rem
/** Main area left padding for Call Library (sidebar 14rem + call list 20rem). */
export const APP_MAIN_PL_WITH_CALL_LIBRARY = 'pl-[calc(14rem+20rem)]';
/** Main area left padding for Call Library + Performance (14rem + 20rem + 24rem). */
export const APP_MAIN_PL_WITH_CALL_LIBRARY_AND_PERF_OPEN = 'pl-[calc(14rem+20rem+24rem)]';
