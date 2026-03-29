import { useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Client } from '@/types/client';
import React, { memo, useMemo, useCallback } from 'react';
import { gradeFromHealthScore } from '@/lib/api';

const SLOT_HEIGHT_PX = 20;
const MERGE_DROP_ID = (id: string) => `merge-${id}`;
const SLOT_DROP_ID = (id: string) => `slot-${id}`;

export { MERGE_DROP_ID, SLOT_DROP_ID };

interface ClientCardProps {
  client: Client;
  onClick: () => void;
  onDelete?: (client: Client) => void;
  /** When another card is dragged over this card as merge target */
  isMergeTarget?: boolean;
  /** When another card is dragged over the slot above this card (insert between) */
  showSlotLineAbove?: boolean;
  /** Health score grade for board tag (e.g. "A", "B") */
  healthGrade?: string | null;
  /** Health score 0–100 for display in tag (e.g. "85% A") */
  healthScore?: number | null;
  /** Opportunity tags from call insights (subset shown) */
  insightTags?: string[];
}

function gradeTagColor(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-400/30';
    case 'B': return 'bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-400/30';
    case 'C': return 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-400/30';
    case 'D': return 'bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-400/30';
    case 'F': return 'bg-red-500/20 text-red-700 dark:text-red-300 border-red-400/30';
    default: return 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-400/30';
  }
}

const INSIGHT_TAG_STYLES: Record<string, string> = {
  upsell: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-400/30',
  testimonial: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-400/30',
  referral: 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-400/30',
  conversion: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-400/30',
  win_back: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-400/30',
};

function insightChipClass(tag: string): string {
  return INSIGHT_TAG_STYLES[tag] || 'bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-400/30';
}

function ClientCard({ client, onClick, onDelete, isMergeTarget = false, showSlotLineAbove = false, healthGrade = null, healthScore = null, insightTags = undefined }: ClientCardProps) {
  const sortableId = client.id;

  const numericHealthScore =
    healthScore != null && !Number.isNaN(Number(healthScore)) ? Number(healthScore) : null;
  const gradeForTag =
    healthGrade != null && String(healthGrade).trim() !== ''
      ? String(healthGrade).trim()
      : numericHealthScore != null
        ? gradeFromHealthScore(numericHealthScore)
        : null;
  const showHealthTag = numericHealthScore != null || gradeForTag != null;

  const slotDroppable = useDroppable({ id: SLOT_DROP_ID(sortableId) });
  const mergeDroppable = useDroppable({ id: MERGE_DROP_ID(sortableId) });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sortableId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  /** Primary line: name if set, else primary email, else first additional email — never hide email-only leads. */
  const displayTitle = useMemo(() => {
    const name = [client.first_name, client.last_name].filter(Boolean).join(' ').trim();
    if (name) return name;
    const primary = client.email?.trim();
    if (primary) return primary;
    const firstExtra = client.emails?.find((e) => e && String(e).trim());
    if (firstExtra) return String(firstExtra).trim();
    return 'Unnamed client';
  }, [client.first_name, client.last_name, client.email, client.emails]);

  const showEmailSubline = useMemo(() => {
    if (!client.email?.trim()) return false;
    return displayTitle !== client.email.trim();
  }, [client.email, displayTitle]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    // Prevent click if dragging
    if (isDragging) return;
    e.stopPropagation();
    onClick();
  }, [isDragging, onClick]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(client);
    }
  }, [onDelete, client]);

  return (
    <div className="relative">
      {/* Slot: drop zone for "insert above" – space between cards; larger for easier drag target */}
      <div
        ref={slotDroppable.setNodeRef}
        className={`transition-all duration-150 rounded ${showSlotLineAbove ? 'bg-primary-500/30 ring-2 ring-primary-500 ring-inset' : 'hover:bg-gray-500/10 dark:hover:bg-gray-400/10'}`}
        style={{ minHeight: SLOT_HEIGHT_PX }}
      />
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        className={`glass-card neon-glow p-3 cursor-pointer hover:shadow-lg transition-all relative group ${
          isMergeTarget ? 'ring-2 ring-primary-500 ring-offset-2 ring-offset-gray-900 dark:ring-offset-gray-950 bg-primary-500/10' : ''
        }`}
      >
        {/* Merge drop zone – covers card so pointer hits merge-* when over card */}
        <div ref={mergeDroppable.setNodeRef} className="absolute inset-0 rounded pointer-events-none" aria-hidden />
        {/* Action buttons - top right */}
        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 z-10">
        {/* Delete button */}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="w-4 h-4 text-red-400 hover:text-red-600 transition-colors"
            title="Delete client"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
        {/* Drag handle - only this area is draggable */}
        <div
          {...listeners}
          className="w-4 h-4 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
          onClick={(e) => e.stopPropagation()}
          title="Drag to move"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM7 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM13 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
          </svg>
        </div>
        </div>

        {/* Clickable content */}
        <div onClick={handleClick} className="min-w-0">
          <div className="font-medium text-gray-900 dark:text-gray-100 min-w-0 truncate" title={displayTitle}>
            {displayTitle}
          </div>
          {showEmailSubline && (
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 min-w-0 truncate" title={client.email}>
              {client.email}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-1">
            {showHealthTag && gradeForTag && (
              <span
                className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ${gradeTagColor(gradeForTag)}`}
                title="Health score"
              >
                {numericHealthScore != null ? `${Math.round(numericHealthScore)}% ` : ''}
                {gradeForTag}
              </span>
            )}
            {insightTags &&
              insightTags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className={`inline-block text-[9px] font-semibold uppercase px-1 py-0.5 rounded border ${insightChipClass(t)}`}
                  title="Call insight"
                >
                  {t.replace(/_/g, ' ')}
                </span>
              ))}
          </div>
          {client.estimated_mrr > 0 && (
            <div className="text-sm font-semibold text-green-600 dark:text-green-400 mt-2">
              ${client.estimated_mrr.toFixed(2)}/mo
            </div>
          )}
          {client.program_progress_percent !== undefined && client.program_progress_percent !== null && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                <span className="digitized-text">Program Progress</span>
                <span>{client.program_progress_percent.toFixed(0)}%</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    client.program_progress_percent >= 100
                      ? 'bg-red-500'
                      : client.program_progress_percent >= 75
                      ? 'bg-yellow-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, client.program_progress_percent))}%` }}
                />
              </div>
              {client.program_end_date && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Ends: {new Date(client.program_end_date).toLocaleDateString()}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ClientCard);


