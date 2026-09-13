import { driver, type Config, type DriveStep } from 'driver.js';
import { shouldShowNavTab, type TabId } from '@/lib/tabAccess';

export interface OnboardingTourContext {
  isOwner: boolean;
  userRole: string;
  consultingTier?: string | null;
  isSystemOwner?: boolean;
}

interface TourStepDef {
  /** Nav tab this step points at — must match the `data-tour="nav-<tab>"` attribute
   * added to that tab's button in Navbar.tsx. Omit for intro/closing steps. */
  tab?: TabId;
  title: string;
  description: string;
}

/** Ordered content, in the order the tour should walk through the app. */
const STEP_DEFS: TourStepDef[] = [
  {
    tab: 'terminal',
    title: 'Terminal',
    description:
      'Your daily snapshot — cash collected, MRR, upcoming calls, and failed payments, all in one view.',
  },
  {
    tab: 'pipeline',
    title: 'Pipeline',
    description:
      'Every client, from cold lead to active. Drag a card to move them through lifecycle stages.',
  },
  {
    tab: 'funnels',
    title: 'Funnels',
    description:
      'Track funnel performance end to end — lead capture, event tracking, and conversion, from landing page to booked call.',
  },
  {
    tab: 'content_studio',
    title: 'Marketing Intel',
    description:
      'AI-drafted content ideas grounded in your real sales calls and Instagram performance — not generic advice.',
  },
  {
    tab: 'call_library',
    title: 'Call Library',
    description:
      'Every sales call, transcribed and analyzed for objections, wins, and next steps.',
  },
  {
    tab: 'kpi_command_center',
    title: 'Sales KPIs',
    description:
      "Log your team's daily funnel numbers and see performance broken down by setter and closer.",
  },
  {
    tab: 'automations',
    title: 'Automations',
    description:
      'Timeline playbooks that draft follow-up emails automatically — you approve before anything sends.',
  },
  {
    tab: 'resources',
    title: 'Resources',
    description: 'The SOP library and playbooks for running your coaching business.',
  },
  {
    tab: 'intelligence',
    title: 'Intelligence',
    description:
      "Your business profile — ICP, offers, and sales signals — that grounds everything the AI drafts for you.",
  },
  {
    tab: 'org_portal',
    title: 'Consulting Portal',
    description:
      'Shared notes, to-dos, and tools for your consulting engagements with clients.',
  },
  {
    tab: 'owner',
    title: 'Owner',
    description: 'Organization-wide health and performance, for org owners.',
  },
  {
    tab: 'settings',
    title: 'Settings',
    description:
      'Theme, accounts, team, and tool connections live here. Next we walk each settings tab.',
  },
];

/** Must match SettingsPanel sidebar `id` values and `data-tour="settings-nav-<id>"`. */
export type SettingsTourSection =
  | 'appearance'
  | 'accounts'
  | 'team'
  | 'integrations'
  | 'notifications'
  | 'profile'
  | 'privacy';

const SETTINGS_SECTION_EVENT = 'sweep:settings-tour-section';

export function requestSettingsTourSection(section: SettingsTourSection): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SETTINGS_SECTION_EVENT, { detail: section }));
}

export function subscribeSettingsTourSection(
  handler: (section: SettingsTourSection) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<SettingsTourSection>).detail;
    if (detail) handler(detail);
  };
  window.addEventListener(SETTINGS_SECTION_EVENT, listener);
  return () => window.removeEventListener(SETTINGS_SECTION_EVENT, listener);
}

interface SettingsSectionDef {
  id: SettingsTourSection;
  adminOnly?: boolean;
  title: string;
  description: string;
}

const SETTINGS_SECTION_DEFS: SettingsSectionDef[] = [
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Light or dark theme, and a button to replay this tour later.',
  },
  {
    id: 'accounts',
    title: 'Accounts',
    description: 'Switch organizations if you belong to more than one.',
  },
  {
    id: 'team',
    adminOnly: true,
    title: 'Team',
    description: 'Invite setters, closers, and admins. Roles control what each person can see.',
  },
  {
    id: 'integrations',
    adminOnly: true,
    title: 'Integrations',
    description:
      'Connect the tools Sweep runs on — payments, calendar, email, call recording, Instagram. Click a tile to set one up.',
  },
  {
    id: 'notifications',
    adminOnly: true,
    title: 'Notifications',
    description: 'Choose which alerts your org gets for bookings, payments, and automations.',
  },
  {
    id: 'profile',
    title: 'Profile',
    description: 'Email, password, and Google sign-in for this user.',
  },
  {
    id: 'privacy',
    title: 'Privacy & Data',
    description: 'Data-sharing and analytics toggles for this account.',
  },
];

const INTEGRATION_TILE_STEPS: { tour: string; title: string; description: string }[] = [
  {
    tour: 'integration-grid',
    title: 'Connect your tools',
    description:
      'Each square is a connection for the current organization. Open a tile, paste keys or OAuth, then you are live in Terminal, Automations, and Call Library.',
  },
  {
    tour: 'integration-stripe',
    title: 'Stripe',
    description: 'Payments, MRR, and failed-charge queues on Terminal. Connect first if you take card payments.',
  },
  {
    tour: 'integration-calcom',
    title: 'Cal.com',
    description: 'Syncs bookings into Sweep. Use Cal.com or Calendly — not both.',
  },
  {
    tour: 'integration-brevo',
    title: 'Brevo',
    description: 'Sends approved automation emails. Connect before turning playbooks on.',
  },
  {
    tour: 'integration-fathom',
    title: 'Fathom',
    description: 'Call recordings land in Call Library with AI notes. Save your API key, then wait for the webhook to show Connected.',
  },
];

function navSelector(tab: TabId): string {
  return `[data-tour="nav-${tab}"]`;
}

function settingsNavSelector(section: SettingsTourSection): string {
  return `[data-tour="settings-nav-${section}"]`;
}

function isAdminOrOwnerRole(ctx: OnboardingTourContext): boolean {
  const role = (ctx.userRole || '').toLowerCase();
  return ctx.isOwner || role === 'admin' || role === 'owner';
}

/** Build the ordered, access-filtered step list for this user/org. Steps for tabs the
 * user can't see (e.g. Consulting Portal without a consulting tier, Intelligence for
 * a member) are left out entirely rather than shown locked. */
export function buildOnboardingSteps(
  ctx: OnboardingTourContext,
  onNavigateToTab?: (tab: TabId) => void
): DriveStep[] {
  const visibleSteps = STEP_DEFS.filter(
    (s) => !s.tab || shouldShowNavTab(s.tab, ctx)
  );
  const canManageSettingsAdmin = isAdminOrOwnerRole(ctx);

  const openSettingsSection = (section: SettingsTourSection) => {
    onNavigateToTab?.('settings');
    requestSettingsTourSection(section);
  };

  const afterPaint = (fn: () => void) => {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  };

  /** Driver looks up the *next* step's element as soon as Next is clicked.
   * Mount that DOM first, then advance — otherwise waitForElement eats the click. */
  const nextAfter = (prep: () => void): NonNullable<DriveStep['popover']> => ({
    onNextClick: (_el, _step, { driver: d }) => {
      prep();
      afterPaint(() => {
        if (d.isActive()) d.moveNext();
      });
    },
  });

  const steps: DriveStep[] = [
    {
      popover: {
        title: 'Welcome to Sweep OS',
        description:
          "Quick tour of what's here — skip anytime with Escape.",
      },
    },
  ];

  for (const step of visibleSteps) {
    if (!step.tab) continue;
    const tab = step.tab;
    const isSettingsNav = tab === 'settings';
    const isFooterNav = tab === 'settings' || tab === 'intelligence';
    steps.push({
      element: navSelector(tab),
      disableActiveInteraction: true,
      popover: {
        title: step.title,
        description: step.description,
        side: isFooterNav ? 'top' : 'right',
        align: 'start',
        ...(isSettingsNav
          ? nextAfter(() => {
              onNavigateToTab?.('settings');
              requestSettingsTourSection('appearance');
            })
          : {}),
      },
      onHighlightStarted: () => {
        onNavigateToTab?.(tab);
        if (isSettingsNav) requestSettingsTourSection('appearance');
      },
    });

    if (tab !== 'settings') continue;

    const visibleSections = SETTINGS_SECTION_DEFS.filter(
      (s) => !s.adminOnly || canManageSettingsAdmin
    );
    for (let i = 0; i < visibleSections.length; i++) {
      const section = visibleSections[i];
      const following = visibleSections[i + 1];
      const afterIntegrationsGoesToTiles =
        section.id === 'integrations' && canManageSettingsAdmin;
      steps.push({
        element: settingsNavSelector(section.id),
        disableActiveInteraction: true,
        skipMissingElement: true,
        popover: {
          title: section.title,
          description: section.description,
          side: 'right',
          align: 'start',
          ...nextAfter(() => {
            if (afterIntegrationsGoesToTiles) openSettingsSection('integrations');
            else if (following) openSettingsSection(following.id);
            else openSettingsSection(section.id);
          }),
        },
        onHighlightStarted: () => openSettingsSection(section.id),
      });
      if (section.id !== 'integrations' || !canManageSettingsAdmin) continue;
      for (let t = 0; t < INTEGRATION_TILE_STEPS.length; t++) {
        const tile = INTEGRATION_TILE_STEPS[t];
        const nextTile = INTEGRATION_TILE_STEPS[t + 1];
        steps.push({
          element: `[data-tour="${tile.tour}"]`,
          disableActiveInteraction: true,
          skipMissingElement: true,
          popover: {
            title: tile.title,
            description: tile.description,
            side: 'bottom',
            align: 'start',
            ...nextAfter(() => {
              openSettingsSection('integrations');
              if (!nextTile) {
                const after = visibleSections[i + 1];
                if (after) openSettingsSection(after.id);
              }
            }),
          },
          onHighlightStarted: () => openSettingsSection('integrations'),
        });
      }
    }
  }

  steps.push({
    popover: {
      title: "You're set",
      description:
        'Connect remaining tools under Settings → Integrations. Replay this tour anytime from Settings → Appearance.',
    },
  });

  return steps;
}

const DEFAULT_DRIVER_CONFIG: Partial<Config> = {
  showProgress: true,
  animate: true,
  overlayOpacity: 0.6,
  stagePadding: 6,
  popoverClass: 'sweep-onboarding-popover',
  nextBtnText: 'Next →',
  prevBtnText: '← Back',
  doneBtnText: 'Done',
  smoothScroll: true,
  disableActiveInteraction: true,
  skipMissingElement: true,
};

export interface StartOnboardingTourOptions {
  onDone?: () => void;
  /** Called with each step's tab right before it's highlighted, so the tour can
   * actually open the tab being showcased instead of just pointing at its button. */
  onNavigateToTab?: (tab: TabId) => void;
}

export function startOnboardingTour(
  ctx: OnboardingTourContext,
  opts?: StartOnboardingTourOptions
): void {
  const steps = buildOnboardingSteps(ctx, opts?.onNavigateToTab);
  const onDone = opts?.onDone;
  const driverObj = driver({
    ...DEFAULT_DRIVER_CONFIG,
    steps,
    onDestroyed: () => {
      onDone?.();
    },
  });
  driverObj.drive();
}
