import { useState, useEffect, type ReactNode } from 'react';
import type { TabId } from '@/lib/tabs';
import { canAccessBottomNavTab, canAccessTab } from '@/lib/tabAccess';
import { useSidebar } from '@/contexts/SidebarContext';

export type { TabId };

interface NavbarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isOwner?: boolean;
  tabPermissions?: Record<string, boolean>;
  userRole?: string;
  organizationName?: string | null;
  automationsAwaitingApproval?: number;
}

const navBtnBase =
  'w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2';
const navBtnInactive = 'text-gray-600 dark:text-gray-400 hover:bg-white/10 hover:text-gray-900 dark:hover:text-gray-100';
const navBtnActive =
  'text-gray-900 dark:text-gray-100 bg-white/15 dark:bg-white/10 shadow-sm';

const iconClass = 'w-5 h-5 flex-shrink-0';

function NavIcon({ children }: { children: ReactNode }) {
  return (
    <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5`}>
      {children}
    </span>
  );
}

const TAB_ICONS: Partial<Record<TabId, ReactNode>> = {
  terminal: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  pipeline: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  ),
  funnels: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  ),
  content_studio: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  ),
  call_library: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  resources: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  owner: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  automations: (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
};

export default function Navbar({
  activeTab,
  onTabChange,
  isOwner = false,
  tabPermissions = {},
  userRole = 'member',
  organizationName = null,
  automationsAwaitingApproval = 0,
}: NavbarProps) {
  const [mounted, setMounted] = useState(false);
  const {
    collapsed,
    toggleCollapsed,
    mobileNavOpen,
    openMobileNav,
    closeMobileNav,
    isMobileNav,
  } = useSidebar();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileNav();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileNavOpen, closeMobileNav]);

  const shouldShowTab = (tab: string): boolean =>
    canAccessTab(tab, { isOwner, userRole, tabPermissions });

  const shouldShowBottomNavTab = (tab: TabId): boolean =>
    canAccessBottomNavTab(tab, { userRole, tabPermissions });

  // Overlay drawer always shows labels; desktop rail respects collapsed.
  const iconOnly = !isMobileNav && collapsed;
  const desktopWidth = collapsed ? 'lg:w-[5rem]' : 'lg:w-56';
  const btnLayout = iconOnly ? 'justify-center px-2' : '';

  const handleTabChange = (tab: TabId) => {
    onTabChange(tab);
    closeMobileNav();
  };

  const tabBtn = (tab: TabId, label: string) => {
    const active = activeTab === tab;
    const icon = TAB_ICONS[tab];
    return (
      <button
        key={tab}
        type="button"
        onClick={() => handleTabChange(tab)}
        className={`${navBtnBase} ${btnLayout} ${active ? navBtnActive : navBtnInactive}`}
        title={label}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        style={
          active
            ? { textShadow: '0 0 8px rgba(139, 92, 246, 0.35), 0 0 10px rgba(59, 130, 246, 0.2)' }
            : undefined
        }
      >
        {icon ? <NavIcon>{icon}</NavIcon> : null}
        <span className={iconOnly ? 'sr-only' : 'truncate'}>{label}</span>
      </button>
    );
  };

  const iconBtn = (
    tab: TabId,
    label: string,
    icon: ReactNode,
    opts?: { ariaLabel?: string; title?: string; extraClass?: string; badge?: number }
  ) => {
    const active = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => handleTabChange(tab)}
        className={`${navBtnBase} ${btnLayout} ${active ? navBtnActive : navBtnInactive} ${opts?.extraClass ?? ''} ${active ? 'ring-2 ring-violet-500/50' : ''}`}
        aria-label={opts?.ariaLabel ?? label}
        title={opts?.title ?? label}
        aria-current={active ? 'page' : undefined}
      >
        <span className="relative flex-shrink-0 w-5 h-5 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">
          {icon}
          {iconOnly && (opts?.badge ?? 0) > 0 ? (
            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center min-w-[0.875rem] h-3.5 rounded-full bg-amber-500 text-white text-[8px] font-bold px-0.5">
              {(opts?.badge ?? 0) > 9 ? '9+' : opts?.badge}
            </span>
          ) : null}
        </span>
        <span className={iconOnly ? 'sr-only' : 'truncate flex-1'}>{label}</span>
        {!iconOnly && (opts?.badge ?? 0) > 0 ? (
          <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold px-1">
            {(opts?.badge ?? 0) > 99 ? '99+' : opts?.badge}
          </span>
        ) : null}
      </button>
    );
  };

  const brandBlock = (
    <div className="flex-shrink-0 p-3 border-b border-gray-200/50 dark:border-white/10">
      <div className={`flex items-center gap-2 min-w-0 ${iconOnly ? 'justify-center' : ''}`}>
        {mounted && (
          <div className="relative w-8 h-8 flex-shrink-0">
            <img
              src="/SWEEP_favicon.png"
              alt=""
              width={32}
              height={32}
              className="object-contain w-full h-full"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        {!iconOnly ? (
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate leading-tight min-w-0">
            Sweep OS
          </h1>
        ) : null}
      </div>
      {!iconOnly && organizationName ? (
        <p
          className={`text-xs font-medium text-gray-500 dark:text-gray-400 truncate mt-1.5 leading-snug ${mounted ? 'pl-10' : ''}`}
          title={organizationName}
        >
          {organizationName}
        </p>
      ) : null}
    </div>
  );

  const navLinks = (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-2 px-2 space-y-1">
        {shouldShowTab('terminal') && tabBtn('terminal', 'Terminal')}
        {shouldShowTab('pipeline') && tabBtn('pipeline', 'Pipeline')}
        {shouldShowTab('funnels') && tabBtn('funnels', 'Funnels')}
        {shouldShowTab('content_studio') && tabBtn('content_studio', 'Marketing Intel')}
        {shouldShowTab('call_library') && tabBtn('call_library', 'Call Library')}
        {shouldShowTab('resources') && tabBtn('resources', 'Resources')}
        {shouldShowTab('owner') && tabBtn('owner', 'Owner')}
      </div>

      <div className="flex-shrink-0 p-2 border-t border-gray-200/50 dark:border-white/10 space-y-1">
        {shouldShowBottomNavTab('automations') &&
          iconBtn('automations', 'Automations', TAB_ICONS.automations, {
            title: 'Automated email playbooks & worker health',
            badge: automationsAwaitingApproval,
          })}
        {shouldShowBottomNavTab('intelligence') &&
          iconBtn(
            'intelligence',
            'Intelligence',
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>,
            {
              ariaLabel: 'AI Intelligence',
              title: 'AI Intelligence profile',
            }
          )}
        {shouldShowBottomNavTab('integrations') &&
          iconBtn(
            'integrations',
            'Integrations',
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z"
              />
            </svg>,
            {
              title: 'Connect Stripe, Brevo, Whop, and more',
            }
          )}
        {shouldShowBottomNavTab('settings') &&
          iconBtn(
            'settings',
            'Settings',
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>,
            { ariaLabel: 'Open settings' }
          )}

        {/* Collapse only applies to the desktop rail. */}
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`${navBtnBase} ${btnLayout} ${navBtnInactive} mt-1 border-t border-gray-200/40 dark:border-white/10 pt-2 hidden lg:flex`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <NavIcon>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
              {collapsed ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              )}
            </svg>
          </NavIcon>
          <span className={iconOnly ? 'sr-only' : 'truncate'}>{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>

        <button
          type="button"
          onClick={closeMobileNav}
          className={`${navBtnBase} ${navBtnInactive} mt-1 border-t border-gray-200/40 dark:border-white/10 pt-2 lg:hidden`}
          aria-label="Close menu"
        >
          <NavIcon>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className={iconClass}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </NavIcon>
          <span className="truncate">Close</span>
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Compact top chrome — frees the full width for main content on phones (portrait & landscape). */}
      <header
        className="lg:hidden fixed top-0 left-0 right-0 z-[55] h-[var(--app-mobile-topbar-height,3.5rem)] flex items-center gap-3 px-3 glass-panel border-b border-gray-200/60 dark:border-white/10 shadow-sm pt-[env(safe-area-inset-top,0px)]"
        style={{
          height: 'calc(var(--app-mobile-topbar-height, 3.5rem) + env(safe-area-inset-top, 0px))',
        }}
      >
        <button
          type="button"
          onClick={openMobileNav}
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-white/15 transition-colors"
          aria-label="Open navigation menu"
          aria-expanded={mobileNavOpen}
          aria-controls="app-sidebar-nav"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {mounted && (
            <img
              src="/SWEEP_favicon.png"
              alt=""
              width={28}
              height={28}
              className="object-contain w-7 h-7 flex-shrink-0"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate leading-tight">
              Sweep OS
            </p>
            {organizationName ? (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate leading-tight">
                {organizationName}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {/* Scrim — keeps drawer from competing with main UI while open. */}
      <button
        type="button"
        aria-label="Close navigation menu"
        className={`lg:hidden fixed inset-0 z-[58] bg-black/50 backdrop-blur-[1px] transition-opacity duration-300 ${
          mobileNavOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeMobileNav}
        tabIndex={mobileNavOpen ? 0 : -1}
      />

      <nav
        id="app-sidebar-nav"
        className={`glass-panel fixed left-0 top-0 bottom-0 z-[60] flex flex-col border-r border-gray-200/60 dark:border-white/10 shadow-lg transition-transform duration-300 ease-out lg:transition-[width,transform] w-[min(18rem,85vw)] ${desktopWidth} ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
        aria-label="Main navigation"
        aria-hidden={isMobileNav && !mobileNavOpen ? true : undefined}
      >
        {brandBlock}
        {navLinks}
      </nav>
    </>
  );
}
