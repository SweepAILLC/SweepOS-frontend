/** Opportunity tags from call insights (board cards + filters). Order matches product priority. */
export const CALL_INSIGHT_BOARD_TAGS = [
  'upsell',
  'testimonial',
  'referral',
  'conversion',
  'win_back',
  'revive',
  'deal_follow_up',
] as const;

export type CallInsightBoardTag = (typeof CALL_INSIGHT_BOARD_TAGS)[number];

const INSIGHT_TAG_STYLES: Record<string, string> = {
  upsell: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-400/30',
  testimonial: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30',
  referral: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-400/30',
  conversion: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/30',
  win_back: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30',
  revive: 'bg-rose-600/15 text-rose-800 dark:text-rose-200 border-rose-500/35',
  deal_follow_up: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-400/30',
};

export function insightChipClass(tag: string): string {
  return INSIGHT_TAG_STYLES[tag] || 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-400/30';
}

export function formatInsightTagLabel(tag: string): string {
  return tag.replace(/_/g, ' ');
}
