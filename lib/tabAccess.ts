import type { TabId } from '@/lib/tabs';
export type { TabId } from '@/lib/tabs';
export {
  VALID_TAB_IDS,
  TAB_DISPLAY_NAMES,
  resolveLegacyTab,
  legacyTabOpensTerminal,
  legacyTabOpensPipeline,
} from '@/lib/tabs';

/** Sidebar footer tabs — settings is available to every user; others are org admin/owner only. */
export const MEMBER_RESTRICTED_BOTTOM_NAV_TAB_IDS: TabId[] = [
  'automations',
  'intelligence',
  'integrations',
];

export const BOTTOM_NAV_TAB_IDS: TabId[] = [
  ...MEMBER_RESTRICTED_BOTTOM_NAV_TAB_IDS,
  'settings',
];

export function isOrgAdminRole(userRole: string): boolean {
  const roleLower = String(userRole || 'member').toLowerCase().trim();
  return roleLower === 'admin' || roleLower === 'owner';
}

/** Footer nav: settings for everyone; other footer tabs require admin/owner role. */
export function canAccessBottomNavTab(
  tab: TabId,
  ctx: { userRole: string; tabPermissions: Record<string, boolean> }
): boolean {
  if (tab === 'settings') return true;
  if (!isOrgAdminRole(ctx.userRole)) return false;
  return canAccessTab(tab, { isOwner: false, userRole: ctx.userRole, tabPermissions: ctx.tabPermissions });
}

/** Default tab permission map when the backend endpoint is unavailable. */
export function defaultTabPermissions(): Record<string, boolean> {
  return {
    terminal: true,
    pipeline: true,
    stripe: true,
    finances: true,
    performance: true,
    funnels: true,
    calcom: true,
    integrations: true,
    content_studio: true,
    call_library: true,
    resources: true,
    intelligence: true,
    automations: true,
    clients: true,
    settings: true,
  };
}

/** Resolve whether the user can access a product tab. */
export function canAccessTab(
  tab: string,
  ctx: {
    isOwner: boolean;
    userRole: string;
    tabPermissions: Record<string, boolean>;
  }
): boolean {
  const roleLower = String(ctx.userRole || 'member').toLowerCase().trim();
  if (tab === 'owner') return ctx.isOwner;
  if (tab === 'resources') return true;
  if (
    roleLower === 'member' &&
    (tab === 'integrations' || tab === 'intelligence' || tab === 'automations')
  ) {
    return false;
  }
  if (tab === 'settings') {
    return true;
  }
  if (tab === 'finances') {
    const v =
      ctx.tabPermissions.finances !== undefined ? ctx.tabPermissions.finances : ctx.tabPermissions.stripe;
    return v !== false;
  }
  if (tab === 'pipeline') {
    if (ctx.tabPermissions.pipeline !== undefined) return ctx.tabPermissions.pipeline !== false;
    if (ctx.tabPermissions.clients !== undefined) return ctx.tabPermissions.clients !== false;
    return ctx.tabPermissions.terminal !== false;
  }
  if (tab === 'terminal') {
    const terminalOk = ctx.tabPermissions.terminal !== false;
    const financesOk =
      ctx.tabPermissions.finances !== undefined
        ? ctx.tabPermissions.finances !== false
        : ctx.tabPermissions.stripe !== false;
    const calcomOk = ctx.tabPermissions.calcom !== false;
    return terminalOk || financesOk || calcomOk;
  }
  return ctx.tabPermissions[tab] !== false;
}

/** @deprecated Priorities panel removed. Kept for API compatibility. */
export function canAccessTerminalPriorities(_tabPermissions: Record<string, boolean>): boolean {
  return false;
}
