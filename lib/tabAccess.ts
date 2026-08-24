import type { TabId } from '@/lib/tabs';
export type { TabId } from '@/lib/tabs';
export {
  VALID_TAB_IDS,
  TAB_DISPLAY_NAMES,
  resolveLegacyTab,
  legacyTabOpensTerminal,
  legacyTabOpensPipeline,
} from '@/lib/tabs';

/** Sidebar footer tabs (settings section) — settings for everyone; others admin/owner only. */
export const MEMBER_RESTRICTED_BOTTOM_NAV_TAB_IDS: TabId[] = ['intelligence'];

export const BOTTOM_NAV_TAB_IDS: TabId[] = [
  ...MEMBER_RESTRICTED_BOTTOM_NAV_TAB_IDS,
  'settings',
];

/** Product tabs shown in the main nav (always visible; access may be locked). */
export const MAIN_NAV_TAB_IDS: TabId[] = [
  'terminal',
  'pipeline',
  'funnels',
  'content_studio',
  'call_library',
  'kpi_command_center',
  'automations',
  'resources',
];

/** Tabs the owner can toggle for an org (aligned with AVAILABLE_TABS on the backend). */
export const ORG_TOGGLEABLE_TAB_IDS: TabId[] = [
  'terminal',
  'pipeline',
  'funnels',
  'content_studio',
  'call_library',
  'kpi_command_center',
  'automations',
  'resources',
  'intelligence',
];

export const CONSULTING_TIERS = ['pro_consulting', 'core_consulting'] as const;

export function hasConsultingTier(tier: string | null | undefined): boolean {
  return tier === 'pro_consulting' || tier === 'core_consulting';
}

export function isOrgAdminRole(userRole: string): boolean {
  const roleLower = String(userRole || 'member').toLowerCase().trim();
  return roleLower === 'admin' || roleLower === 'owner';
}

/**
 * Whether a tab should appear in the nav.
 * Org tab-permission toggles do NOT hide tabs — they only lock content.
 */
export function shouldShowNavTab(
  tab: string,
  ctx: {
    isOwner: boolean;
    userRole: string;
    consultingTier?: string | null;
    isSystemOwner?: boolean;
  }
): boolean {
  if (tab === 'owner') return ctx.isOwner;
  if (tab === 'settings') return true;
  if (tab === 'org_portal') {
    return Boolean(ctx.isSystemOwner) || hasConsultingTier(ctx.consultingTier);
  }
  // Intelligence stays in the footer for admin/owner only (role), not members.
  if (tab === 'intelligence') return isOrgAdminRole(ctx.userRole);
  if ((MAIN_NAV_TAB_IDS as string[]).includes(tab)) return true;
  return false;
}

/** Footer nav: settings for everyone; other footer tabs require admin/owner role to appear. */
export function canAccessBottomNavTab(
  tab: TabId,
  ctx: {
    userRole: string;
    tabPermissions: Record<string, boolean>;
    consultingTier?: string | null;
    isSystemOwner?: boolean;
  }
): boolean {
  return shouldShowNavTab(tab, {
    isOwner: false,
    userRole: ctx.userRole,
    consultingTier: ctx.consultingTier,
    isSystemOwner: ctx.isSystemOwner,
  });
}

/** Default tab permission map when the backend endpoint is unavailable. */
export function defaultTabPermissions(): Record<string, boolean> {
  return {
    terminal: true,
    pipeline: true,
    funnels: true,
    content_studio: true,
    call_library: true,
    kpi_command_center: true,
    automations: true,
    resources: true,
    intelligence: true,
    settings: true,
    org_portal: false,
  };
}

function permissionFlag(
  tabPermissions: Record<string, boolean>,
  ...keys: string[]
): boolean {
  for (const key of keys) {
    if (tabPermissions[key] !== undefined) return tabPermissions[key] !== false;
  }
  return true;
}

/** Resolve whether the user can open a product tab (unlocked content). */
export function canAccessTab(
  tab: string,
  ctx: {
    isOwner: boolean;
    userRole: string;
    tabPermissions: Record<string, boolean>;
    /** Org consulting program tier — required for client portal (org_portal). */
    consultingTier?: string | null;
    /** System owners use org_portal for Owner Panel regardless of consulting tier. */
    isSystemOwner?: boolean;
  }
): boolean {
  const roleLower = String(ctx.userRole || 'member').toLowerCase().trim();
  if (tab === 'owner') return ctx.isOwner;
  if (tab === 'settings') return true;
  if (tab === 'org_portal') {
    return Boolean(ctx.isSystemOwner) || hasConsultingTier(ctx.consultingTier);
  }
  // Members cannot use admin-only footer tabs even when the org toggle is on.
  if (roleLower === 'member' && tab === 'intelligence') {
    return false;
  }
  if (tab === 'pipeline') {
    return permissionFlag(ctx.tabPermissions, 'pipeline', 'clients');
  }
  if (tab === 'finances') {
    return permissionFlag(ctx.tabPermissions, 'finances', 'stripe');
  }
  return permissionFlag(ctx.tabPermissions, tab);
}

/** @deprecated Priorities panel removed. Kept for API compatibility. */
export function canAccessTerminalPriorities(_tabPermissions: Record<string, boolean>): boolean {
  return false;
}
