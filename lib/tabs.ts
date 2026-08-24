/** Shared tab identifiers — keep in sync with Navbar and pages/index routing. */
export type TabId =
  | 'terminal'
  | 'pipeline'
  | 'finances'
  | 'funnels'
  | 'content_studio'
  | 'call_library'
  | 'resources'
  | 'integrations'
  | 'owner'
  | 'calcom'
  | 'intelligence'
  | 'automations'
  | 'settings';

export const VALID_TAB_IDS: TabId[] = [
  'terminal',
  'pipeline',
  'finances',
  'funnels',
  'content_studio',
  'call_library',
  'resources',
  'integrations',
  'owner',
  'calcom',
  'intelligence',
  'automations',
  'settings',
];

export const TAB_DISPLAY_NAMES: Record<string, string> = {
  terminal: 'Terminal',
  pipeline: 'Pipeline',
  finances: 'Finances',
  funnels: 'Funnels',
  content_studio: 'Marketing Intel',
  call_library: 'Call Library',
  resources: 'Resources',
  integrations: 'Integrations',
  owner: 'Owner',
  calcom: 'Calendar',
  intelligence: 'Intelligence',
  automations: 'Automations',
  settings: 'Settings',
  performance: 'Priorities',
  clients: 'Pipeline',
  stripe: 'Finances',
};

/** Map legacy localStorage / deep-link tab names to current tabs. */
export function resolveLegacyTab(saved: string | null): TabId | null {
  if (!saved) return null;
  if (saved === 'stripe' || saved === 'finances' || saved === 'calcom') return 'terminal';
  if (saved === 'brevo') return 'integrations';
  if (saved === 'performance' || saved === 'clients') return null;
  if (VALID_TAB_IDS.includes(saved as TabId)) return saved as TabId;
  return null;
}

/** Whether legacy tab should open terminal (priorities live there now). */
export function legacyTabOpensTerminal(saved: string): boolean {
  return saved === 'performance';
}

/** Whether legacy tab should open pipeline (kanban moved from terminal). */
export function legacyTabOpensPipeline(saved: string): boolean {
  return saved === 'clients';
}
