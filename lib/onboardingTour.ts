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
    title: 'KPI Command Center',
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
    description: 'Connect integrations, manage your team, and configure your organization.',
  },
];

function navSelector(tab: TabId): string {
  return `[data-tour="nav-${tab}"]`;
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

  const steps: DriveStep[] = [
    {
      popover: {
        title: 'Welcome to Sweep OS',
        description:
          "Quick tour of what's here — takes about a minute. Skip anytime with Escape.",
      },
    },
  ];

  for (const step of visibleSteps) {
    if (!step.tab) continue;
    const tab = step.tab;
    steps.push({
      element: navSelector(tab),
      popover: {
        title: step.title,
        description: step.description,
        side: 'right',
        align: 'start',
      },
      // Actually open the tab being showcased so its real content is visible
      // behind the popover, not just the sidebar button.
      onHighlightStarted: () => onNavigateToTab?.(tab),
    });
  }

  steps.push({
    popover: {
      title: "You're set",
      description:
        'Replay this tour anytime from Settings if you want a refresher.',
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

const SEEN_KEY_PREFIX = 'sweep:onboarding-tour-seen:';

export function hasSeenOnboardingTour(userId: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(SEEN_KEY_PREFIX + userId) === '1';
  } catch {
    return true; // storage unavailable — don't force a tour we can't dismiss reliably
  }
}

export function markOnboardingTourSeen(userId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SEEN_KEY_PREFIX + userId, '1');
  } catch {
    // ignore — private browsing / storage disabled
  }
}
