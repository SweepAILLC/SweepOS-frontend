'use client';

import type { AIRecommendationAction } from './types';

const categoryStyles: Record<string, string> = {
  conversion: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/30',
  upsell: 'bg-violet-500/15 text-violet-800 dark:text-violet-200 border-violet-500/30',
  testimonial: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/30',
  referral: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/30',
  win_back: 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border-rose-500/30',
  engagement: 'bg-blue-500/15 text-blue-800 dark:text-blue-200 border-blue-500/30',
  general: 'bg-gray-500/15 text-gray-800 dark:text-gray-200 border-gray-500/30',
};

function categoryClass(cat: string | null | undefined): string {
  if (!cat) return categoryStyles.general;
  return categoryStyles[cat] || categoryStyles.general;
}

interface AIRecommendationActionListProps {
  actions: AIRecommendationAction[];
  /** Action ids currently syncing to the server. */
  pendingIds?: Set<string>;
  onToggle: (actionId: string, completed: boolean) => void;
  /** Fetch draft and open email composer (parent handles). */
  onViewDraft?: (actionId: string) => void;
  /** Action id while draft is loading */
  draftLoadingId?: string | null;
  /** Tighter copy for intelligence drawer (line-clamp detail). */
  compact?: boolean;
}

export default function AIRecommendationActionList({
  actions,
  pendingIds = new Set(),
  onToggle,
  onViewDraft,
  draftLoadingId = null,
  compact = false,
}: AIRecommendationActionListProps) {
  if (actions.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
        No actions yet. They appear when you open this client for the first time.
      </p>
    );
  }

  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {actions.map((action) => (
        <li
          key={action.id}
          className={`rounded-lg border transition-colors ${
            compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
          } ${
            action.completed
              ? 'border-gray-200 dark:border-gray-600 bg-gray-50/80 dark:bg-gray-800/40 opacity-80'
              : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800/30'
          }`}
        >
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={action.completed}
              disabled={pendingIds.has(action.id)}
              onChange={(e) => onToggle(action.id, e.target.checked)}
              className={`rounded border-gray-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50 ${
                compact ? 'mt-0.5 h-3.5 w-3.5' : 'mt-0.5 h-4 w-4'
              }`}
            />
            <span className="flex-1 min-w-0">
              <span
                className={`font-medium text-gray-900 dark:text-gray-100 ${
                  compact ? 'text-xs' : 'text-sm'
                } ${action.completed ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}
              >
                {action.title}
              </span>
              {action.detail ? (
                <p
                  className={`text-gray-600 dark:text-gray-300 mt-0.5 leading-snug border-l-2 border-violet-400/40 pl-2 ${
                    compact ? 'text-[11px] line-clamp-2' : 'text-xs mt-1 leading-relaxed'
                  }`}
                  title={compact ? action.detail : 'Personalized to this client’s profile'}
                >
                  {action.detail}
                </p>
              ) : null}
              <div className={`flex flex-wrap items-center gap-1.5 ${compact ? 'mt-1' : 'mt-1.5'}`}>
                {action.category ? (
                  <span
                    className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded border ${categoryClass(
                      action.category
                    )}`}
                  >
                    {action.category.replace(/_/g, ' ')}
                  </span>
                ) : null}
                {action.supports_email_draft && onViewDraft ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onViewDraft(action.id);
                    }}
                    disabled={draftLoadingId === action.id || pendingIds.has(action.id)}
                    className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50"
                  >
                    {draftLoadingId === action.id ? 'Draft…' : 'View draft'}
                  </button>
                ) : null}
                {action.completed_at ? (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Done {new Date(action.completed_at).toLocaleString()}
                  </span>
                ) : null}
              </div>
            </span>
          </label>
        </li>
      ))}
    </ul>
  );
}
