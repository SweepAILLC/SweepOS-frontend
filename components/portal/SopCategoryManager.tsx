'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  SOP_COLOR_KEYS,
  SOP_COLOR_STYLES,
  sopColorStyle,
  type SopCategoryDef,
  type SopColorKey,
} from '@/lib/resources';

type Props = {
  categories: SopCategoryDef[];
  /** SOP count per category slug, used to warn before deleting. */
  counts: Record<string, number>;
  onClose: () => void;
  /** Called after any successful change so the parent can reload categories and docs. */
  onChanged: () => Promise<void> | void;
};

type Run = (fn: () => Promise<unknown>, fallback: string) => Promise<void>;

function errorMessage(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

function ColorPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (color: SopColorKey) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category color">
      {SOP_COLOR_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          aria-label={key}
          disabled={disabled}
          onClick={() => onChange(key)}
          className={`h-5 w-5 rounded-full ${SOP_COLOR_STYLES[key].dot} transition-transform disabled:opacity-50 ${
            value === key
              ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white ring-offset-gray-50 dark:ring-offset-gray-900 scale-110'
              : 'opacity-70 hover:opacity-100'
          }`}
        />
      ))}
    </div>
  );
}

function ArrowButton({
  direction,
  label,
  disabled,
  onClick,
}: {
  direction: 'up' | 'down';
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30"
      aria-label={label}
      title={label}
    >
      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={direction === 'up' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
        />
      </svg>
    </button>
  );
}

function CategoryRow({
  cat,
  index,
  total,
  count,
  busy,
  onRun,
  onMove,
}: {
  cat: SopCategoryDef;
  index: number;
  total: number;
  count: number;
  busy: boolean;
  onRun: Run;
  onMove: (slug: string, delta: number) => void;
}) {
  const [label, setLabel] = useState(cat.label);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setLabel(cat.label), [cat.label]);

  const trimmed = label.trim();
  const dirty = trimmed.length > 0 && trimmed !== cat.label;
  const rename = () => onRun(() => apiClient.updateSopCategory(cat.slug, { label: trimmed }), 'Failed to rename.');
  const plural = count === 1 ? '' : 's';

  return (
    <li className="space-y-2.5 rounded-lg border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${sopColorStyle(cat.color).dot}`} />
        <input
          value={label}
          maxLength={40}
          disabled={busy}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) void rename();
          }}
          aria-label={`Name for ${cat.label}`}
          className="min-w-0 flex-1 rounded-md border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-black/30 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
        />
        {dirty ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void rename()}
            className="rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-2.5 py-1 text-xs font-semibold text-white"
          >
            Save
          </button>
        ) : null}
        <div className="flex flex-shrink-0 items-center">
          <ArrowButton
            direction="up"
            label={`Move ${cat.label} up`}
            disabled={busy || index === 0}
            onClick={() => onMove(cat.slug, -1)}
          />
          <ArrowButton
            direction="down"
            label={`Move ${cat.label} down`}
            disabled={busy || index === total - 1}
            onClick={() => onMove(cat.slug, 1)}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <ColorPicker
          value={cat.color}
          disabled={busy}
          onChange={(color) => void onRun(() => apiClient.updateSopCategory(cat.slug, { color }), 'Failed to recolor.')}
        />
        {confirming ? (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="text-gray-500 dark:text-gray-400">
              {count > 0 ? `${count} SOP${plural} become uncategorized.` : 'Delete category?'}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRun(() => apiClient.deleteSopCategory(cat.slug), 'Failed to delete.')}
              className="rounded-md bg-red-600 hover:bg-red-500 disabled:opacity-50 px-2 py-1 font-semibold text-white"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md px-2 py-1 font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span>
              {count} SOP{plural}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="rounded-md px-2 py-1 font-semibold text-red-600 dark:text-red-400 hover:bg-red-500/10"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function SopCategoryManager({ categories, counts, onClose, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState<SopColorKey>('sky');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run: Run = async (fn, fallback) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await onChanged();
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const move = (slug: string, delta: number) => {
    const slugs = categories.map((c) => c.slug);
    const i = slugs.indexOf(slug);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= slugs.length) return;
    [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
    void run(() => apiClient.reorderSopCategories(slugs), 'Failed to reorder.');
  };

  const addCategory = () => {
    const label = newLabel.trim();
    if (!label) return;
    void run(async () => {
      await apiClient.createSopCategory({ label, color: newColor });
      setNewLabel('');
    }, 'Failed to add category.');
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage SOP categories"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-gray-900 shadow-2xl"
      >
        <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-200 dark:border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">SOP categories</h2>
            <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
              Rename, recolor, reorder, add, or delete. Applies to every org. Deleting keeps the SOPs and moves them
              to Uncategorized.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {error ? (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600 dark:text-red-300">
              {error}
            </p>
          ) : null}

          {categories.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-500">No categories yet. Add one below.</p>
          ) : (
            <ul className="space-y-2">
              {categories.map((cat, index) => (
                <CategoryRow
                  key={cat.slug}
                  cat={cat}
                  index={index}
                  total={categories.length}
                  count={counts[cat.slug] || 0}
                  busy={busy}
                  onRun={run}
                  onMove={move}
                />
              ))}
            </ul>
          )}

          <div className="space-y-2.5 rounded-lg border border-dashed border-gray-300 dark:border-white/15 p-3">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">Add category</p>
            <div className="flex items-center gap-2">
              <input
                value={newLabel}
                maxLength={40}
                disabled={busy}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCategory();
                }}
                placeholder="e.g. Hiring"
                className="min-w-0 flex-1 rounded-md border border-gray-200 dark:border-white/10 bg-white dark:bg-black/30 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
              <button
                type="button"
                disabled={busy || !newLabel.trim()}
                onClick={addCategory}
                className="rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Add
              </button>
            </div>
            <ColorPicker value={newColor} onChange={setNewColor} disabled={busy} />
          </div>
        </div>
      </div>
    </div>
  );
}
