/** Shared Recharts animation — slower, ease-out draw on first mount. */
export const PREMIUM_CHART_ANIMATION = {
  isAnimationActive: true,
  animationDuration: 1600,
  animationEasing: 'ease-out' as const,
  animationBegin: 220,
};

export const PREMIUM_LINE_ANIMATION = {
  ...PREMIUM_CHART_ANIMATION,
  animationDuration: 1800,
  animationBegin: 320,
};

export const PREMIUM_PIE_ANIMATION = {
  isAnimationActive: true,
  animationDuration: 1400,
  animationEasing: 'ease-out' as const,
  animationBegin: 180,
};

export const PROGRESSIVE_LINE_ANIM = {
  isAnimationActive: true,
  animationDuration: 900,
  animationEasing: 'ease-out' as const,
  animationBegin: 120,
};

/** Linear left→right chart reveal — scaled by visible bar count in the chart component. */
export const CHART_REVEAL_MIN_MS = 650;
export const CHART_REVEAL_MAX_MS = 1200;
export const CHART_REVEAL_PER_BAR_MS = 38;

export function chartRevealBudgetMs(barCount: number): number {
  if (barCount <= 0) return CHART_REVEAL_MIN_MS;
  return Math.min(
    CHART_REVEAL_MAX_MS,
    Math.max(CHART_REVEAL_MIN_MS, CHART_REVEAL_MIN_MS + barCount * CHART_REVEAL_PER_BAR_MS)
  );
}

/** Stagger delays for Terminal section reveals (ms). */
export const TERMINAL_STAGGER = {
  heroChart: 0,
  sidebar: 140,
  kpiRow: 280,
  financeRow: 420,
  priorities: 560,
} as const;

/** Per-column stagger for KPI tiles and kanban columns (ms). */
export const COLUMN_STAGGER_MS = 115;
