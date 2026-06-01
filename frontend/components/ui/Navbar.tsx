import { useState, useEffect, type ReactNode } from 'react';
import type { TabId } from '@/lib/tabs';
import { canAccessBottomNavTab, canAccessTab } from '@/lib/tabAccess';
import { APP_SIDEBAR_WIDTH } from '@/components/ui/layoutConstants';

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

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldShowTab = (tab: string): boolean =>
    canAccessTab(tab, { isOwner, userRole, tabPermissions });

  const shouldShowBottomNavTab = (tab: TabId): boolean =>
    canAccessBottomNavTab(tab, { userRole, tabPermissions });

  const tabBtn = (tab: TabId, label: string) => {
    const active = activeTab === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => onTabChange(tab)}
        className={`${navBtnBase} ${active ? navBtnActive : navBtnInactive}`}
        style={
          active
            ? { textShadow: '0 0 8px rgba(139, 92, 246, 0.35), 0 0 10px rgba(59, 130, 246, 0.2)' }
            : undefined
        }
      >
        {label}
      </button>
    );
  };

  const iconBtn = (
    onClick: () => void,
    label: string,
    icon: ReactNode,
    opts?: { ariaLabel?: string; title?: string; extraClass?: string }
  ) => (
    <button
      type="button"
      onClick={onClick}
      className={`${navBtnBase} ${navBtnInactive} ${opts?.extraClass ?? ''}`}
      aria-label={opts?.ariaLabel ?? label}
      title={opts?.title ?? label}
    >
      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center [&>svg]:w-5 [&>svg]:h-5">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <nav
      className={`glass-panel fixed left-0 top-0 bottom-0 z-[50] ${APP_SIDEBAR_WIDTH} flex flex-col border-r border-gray-200/60 dark:border-white/10 shadow-lg`}
      aria-label="Main navigation"
    >
      <div className="flex-shrink-0 p-3 border-b border-gray-200/50 dark:border-white/10">
        <div className="flex items-center gap-2 min-w-0">
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
          <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate leading-tight min-w-0">Sweep OS</h1>
        </div>
        {organizationName ? (
          <p
            className={`text-xs font-medium text-gray-500 dark:text-gray-400 truncate mt-1.5 leading-snug ${mounted ? 'pl-10' : ''}`}
            title={organizationName}
          >
            {organizationName}
          </p>
        ) : null}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-2 px-2 space-y-1">
        {shouldShowTab('terminal') && tabBtn('terminal', 'Terminal')}
        {shouldShowTab('pipeline') && tabBtn('pipeline', 'Pipeline')}
        {shouldShowTab('funnels') && tabBtn('funnels', 'Funnels')}
        {shouldShowTab('content_studio') && tabBtn('content_studio', 'Marketing Intel')}
        {shouldShowTab('call_library') && tabBtn('call_library', 'Call Library')}
        {shouldShowTab('owner') && tabBtn('owner', 'Owner')}
      </div>

      <div className="flex-shrink-0 p-2 border-t border-gray-200/50 dark:border-white/10 space-y-1">
        {shouldShowBottomNavTab('automations') && (
          <button
            type="button"
            onClick={() => onTabChange('automations')}
            className={`${navBtnBase} ${navBtnInactive} ${activeTab === 'automations' ? 'ring-2 ring-violet-500/50' : ''}`}
            aria-label="Automations"
            title="Automated email playbooks & worker health"
          >
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden className="w-5 h-5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </span>
            <span className="truncate flex-1">Automations</span>
            {automationsAwaitingApproval > 0 ? (
              <span className="ml-auto inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold px-1">
                {automationsAwaitingApproval > 99 ? '99+' : automationsAwaitingApproval}
              </span>
            ) : null}
          </button>
        )}
        {shouldShowBottomNavTab('intelligence') &&
          iconBtn(
            () => onTabChange('intelligence'),
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
              extraClass: activeTab === 'intelligence' ? 'ring-2 ring-violet-500/50' : '',
              ariaLabel: 'AI Intelligence',
              title: 'AI Intelligence profile',
            }
          )}
        {shouldShowBottomNavTab('integrations') &&
          iconBtn(
            () => onTabChange('integrations'),
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
              extraClass: activeTab === 'integrations' ? 'ring-2 ring-violet-500/50' : '',
              title: 'Connect Stripe, Brevo, Whop, and more',
            }
          )}
        {shouldShowBottomNavTab('users') &&
          iconBtn(
            () => onTabChange('users'),
            'Users',
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>,
            {
              extraClass: activeTab === 'users' ? 'ring-2 ring-violet-500/50' : '',
              title: 'Team members and invitations',
            }
          )}
        {shouldShowBottomNavTab('settings') &&
          iconBtn(
          () => onTabChange('settings'),
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
      </div>
    </nav>
  );
}
