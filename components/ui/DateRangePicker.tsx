import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  COMPARE_MODES,
  PRESETS,
  addDays,
  diffDays,
  formatRange,
  formatYmd,
  presetLabel,
  resolveCompare,
  resolvePreset,
  ymdOf,
  type CompareMode,
  type DateRangeValue,
  type PresetId,
} from '@/lib/dateRange';

/**
 * The one date-range control (docs/features/DATE_RANGE_FILTER_PRD.md): presets on the left,
 * two months on the right, optional compare, Cancel / Update. Edits are a draft until Update,
 * so one change = one refetch. Portaled + fixed so no card's overflow can clip it.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function CalendarIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} className={className} aria-hidden>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3M7 11h2M11 11h2M7 14h2" strokeLinecap="round" />
    </svg>
  );
}

type Target = 'range' | 'compare';

interface Draft {
  preset: PresetId;
  start: string | null;
  end: string;
  compareOn: boolean;
  compareMode: CompareMode;
  compareStart: string | null;
  compareEnd: string | null;
}

function draftFrom(v: DateRangeValue): Draft {
  return {
    preset: v.preset,
    start: v.start,
    end: v.end,
    compareOn: Boolean(v.compare),
    compareMode: v.compare?.mode ?? 'previous_period',
    compareStart: v.compare?.start ?? null,
    compareEnd: v.compare?.end ?? null,
  };
}

/** Recompute a non-custom compare window whenever the main range changes. */
function withCompare(d: Draft): Draft {
  if (!d.compareOn || d.compareMode === 'custom') return d;
  const c = resolveCompare(d.compareMode, d.start, d.end);
  return { ...d, compareStart: c?.start ?? null, compareEnd: c?.end ?? null };
}

function MonthGrid({
  year,
  month,
  today,
  draft,
  anchor,
  hover,
  target,
  onPick,
  onHover,
}: {
  year: number;
  month: number;
  today: string;
  draft: Draft;
  anchor: string | null;
  hover: string | null;
  target: Target;
  onPick: (ymd: string) => void;
  onHover: (ymd: string | null) => void;
}) {
  const first = ymdOf(year, month, 1);
  const lead = (new Date(Date.UTC(year, month, 1, 12)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate();
  // While picking, preview anchor..hover for whichever range is being edited.
  const preview = anchor && hover ? (anchor <= hover ? [anchor, hover] : [hover, anchor]) : null;
  const main: [string | null, string] =
    preview && target === 'range' ? [preview[0], preview[1]] : [anchor && target === 'range' ? anchor : draft.start, anchor && target === 'range' ? anchor : draft.end];
  const cmp: [string, string] | null = draft.compareOn
    ? preview && target === 'compare'
      ? [preview[0], preview[1]]
      : draft.compareStart && draft.compareEnd
        ? [draft.compareStart, draft.compareEnd]
        : null
    : null;

  const cells: Array<string | null> = [...Array(lead).fill(null)];
  for (let d = 1; d <= days; d += 1) cells.push(addDays(first, d - 1));

  return (
    <div className="w-full sm:w-[16.5rem]">
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => onHover(null)}>
        {cells.map((ymd, i) => {
          if (!ymd) return <div key={`b${i}`} />;
          const future = ymd > today;
          const inMain = main[1] != null && (main[0] == null ? ymd <= main[1] : ymd >= main[0] && ymd <= main[1]);
          const isEdge = ymd === main[0] || ymd === main[1];
          const inCmp = cmp != null && ymd >= cmp[0] && ymd <= cmp[1];
          const cmpEdge = cmp != null && (ymd === cmp[0] || ymd === cmp[1]);
          const dow = (i % 7);
          const roundL = isEdge && ymd === main[0] ? 'rounded-l-md' : dow === 0 ? 'rounded-l-md' : '';
          const roundR = isEdge && ymd === main[1] ? 'rounded-r-md' : dow === 6 ? 'rounded-r-md' : '';
          let cls = 'text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10 rounded-md';
          if (inMain) cls = `bg-indigo-100 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100 ${roundL} ${roundR}`;
          if (isEdge && main[0] != null) cls = 'bg-indigo-600 text-white rounded-md font-semibold';
          if (future) cls = 'text-gray-300 dark:text-gray-600 cursor-not-allowed';
          return (
            <button
              key={ymd}
              type="button"
              disabled={future}
              onClick={() => onPick(ymd)}
              onMouseEnter={() => onHover(ymd)}
              aria-label={formatYmd(ymd)}
              aria-pressed={isEdge}
              className={`relative h-9 text-sm tabular-nums transition-colors ${cls} ${
                inCmp && !isEdge ? 'ring-1 ring-inset ring-amber-500/70' : ''
              } ${cmpEdge && !isEdge ? 'bg-amber-100 dark:bg-amber-500/20' : ''}`}
            >
              {Number(ymd.slice(8))}
              {ymd === today ? (
                <span className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${isEdge ? 'bg-white' : 'bg-indigo-500'}`} />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MonthHeader({
  year,
  month,
  onSet,
  minYear,
  maxYear,
}: {
  year: number;
  month: number;
  onSet: (year: number, month: number) => void;
  minYear: number;
  maxYear: number;
}) {
  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y -= 1) years.push(y);
  const sel = 'rounded-md bg-transparent px-1.5 py-1 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10 cursor-pointer';
  return (
    <div className="flex items-center justify-center gap-1">
      <select aria-label="Month" value={month} onChange={(e) => onSet(year, Number(e.target.value))} className={sel}>
        {MONTHS.map((m, i) => (
          <option key={m} value={i} className="bg-white dark:bg-gray-900">
            {m.slice(0, 3)}
          </option>
        ))}
      </select>
      <select aria-label="Year" value={year} onChange={(e) => onSet(Number(e.target.value), month)} className={sel}>
        {years.map((y) => (
          <option key={y} value={y} className="bg-white dark:bg-gray-900">
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function DateRangePicker({
  value,
  onChange,
  today,
  timezone,
  allowAllTime = true,
}: {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  /** Today in the org timezone (YYYY-MM-DD) — nothing after it is selectable. */
  today: string;
  timezone?: string | null;
  allowAllTime?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(value));
  const [target, setTarget] = useState<Target>('range');
  const [anchor, setAnchor] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ year: 2026, month: 0 }); // left month
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const presets = useMemo(() => PRESETS.filter((p) => allowAllTime || p.id !== 'all_time'), [allowAllTime]);
  const [ty, tm] = today.split('-').map(Number);
  const rightMonth = useMemo(() => {
    const d = new Date(Date.UTC(view.year, view.month + 1, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  }, [view]);

  const showMonthOf = (ymd: string) => {
    // Put `ymd`'s month on the right, unless that would show a future month.
    const [y, m] = ymd.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };

  const place = () => {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(vw - 16, 760);
    const left = vw < 640 ? 8 : Math.max(8, Math.min(r.right - width, vw - width - 8));
    const below = vh - r.bottom - 16;
    const top = below >= 360 || below >= r.top ? r.bottom + 6 : Math.max(8, r.top - 6 - Math.min(620, r.top - 14));
    setPos({ top, left, width, maxHeight: Math.max(280, below >= 360 || below >= r.top ? below : r.top - 14) });
  };

  const openPanel = () => {
    setDraft(draftFrom(value));
    setTarget('range');
    setAnchor(null);
    setHover(null);
    showMonthOf(value.end);
    place();
    setOpen(true);
  };
  const cancel = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onResize = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const pickPreset = (id: Exclude<PresetId, 'custom'>) => {
    const { start, end } = resolvePreset(id, today);
    setAnchor(null);
    setTarget('range');
    setDraft((d) => withCompare({ ...d, preset: id, start, end }));
    showMonthOf(end);
  };

  const pickDay = (ymd: string) => {
    if (!anchor) {
      setAnchor(ymd);
      return;
    }
    const [a, b] = anchor <= ymd ? [anchor, ymd] : [ymd, anchor];
    setAnchor(null);
    if (target === 'compare') {
      setDraft((d) => ({ ...d, compareMode: 'custom', compareStart: a, compareEnd: b }));
      setTarget('range');
    } else {
      setDraft((d) => withCompare({ ...d, preset: 'custom', start: a, end: b }));
    }
  };

  const setCompareOn = (on: boolean) =>
    setDraft((d) => withCompare({ ...d, compareOn: on && d.start != null }));
  const setCompareMode = (mode: CompareMode) => {
    setDraft((d) => {
      if (mode === 'custom') {
        return { ...d, compareMode: mode, compareStart: d.compareStart ?? d.start, compareEnd: d.compareEnd ?? d.end };
      }
      return withCompare({ ...d, compareMode: mode });
    });
    if (mode === 'custom') {
      setTarget('compare');
      setAnchor(null);
    }
  };

  const apply = () => {
    const compare =
      draft.compareOn && draft.start != null && draft.compareStart && draft.compareEnd
        ? { mode: draft.compareMode, start: draft.compareStart, end: draft.compareEnd }
        : null;
    onChange({ preset: draft.preset, start: draft.start, end: draft.end, compare });
    setOpen(false);
  };

  const draftDays = draft.start ? diffDays(draft.start, draft.end) + 1 : null;
  const radio = (id: Exclude<PresetId, 'custom'>) => {
    const active = draft.preset === id;
    return (
      <button
        key={id}
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => pickPreset(id)}
        className="w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10"
      >
        <span
          className={`h-4 w-4 shrink-0 rounded-full border flex items-center justify-center ${
            active ? 'border-indigo-600' : 'border-gray-400 dark:border-gray-500'
          }`}
          aria-hidden
        >
          {active ? <span className="h-2 w-2 rounded-full bg-indigo-600" /> : null}
        </span>
        {presets.find((p) => p.id === id)?.label}
      </button>
    );
  };

  const canPrev = view.year > ty - 10;
  const canNext = rightMonth.year < ty || (rightMonth.year === ty && rightMonth.month < tm - 1);
  const shift = (n: number) =>
    setView((v) => {
      const d = new Date(Date.UTC(v.year, v.month + n, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  const title = value.preset === 'custom' ? 'Custom' : presetLabel(value.preset);
  const dates = value.preset === 'all_time' ? `through ${formatYmd(value.end)}` : formatRange(value.start, value.end);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? cancel() : openPanel())}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="group inline-flex items-center gap-2.5 rounded-lg border border-gray-300 dark:border-white/15 bg-white dark:bg-gray-900/70 px-3 py-1.5 text-left shadow-sm hover:border-indigo-400 dark:hover:border-indigo-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 min-w-0 max-w-full"
      >
        <CalendarIcon className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <span className="min-w-0">
          <span className="block truncate text-sm text-gray-900 dark:text-gray-100">
            <span className="font-semibold">{title}</span>
            <span className="text-gray-600 dark:text-gray-300">: {dates}</span>
          </span>
          {value.compare ? (
            <span className="block truncate text-[11px] text-amber-700 dark:text-amber-300">
              vs {formatRange(value.compare.start, value.compare.end)}
            </span>
          ) : null}
        </span>
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden>
          <path d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z" />
        </svg>
      </button>

      {open && pos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Choose date range"
              tabIndex={-1}
              style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
              className="z-[120] flex flex-col sm:flex-row overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-gray-950 shadow-2xl outline-none"
            >
              {/* Presets */}
              <div role="radiogroup" aria-label="Presets" className="sm:w-52 shrink-0 overflow-y-auto border-b sm:border-b-0 sm:border-r border-gray-200 dark:border-white/10 p-3 max-h-40 sm:max-h-none">
                {presets.map((p) => radio(p.id))}
              </div>

              {/* Calendar + compare + actions */}
              <div className="flex-1 min-w-0 overflow-y-auto p-4 flex flex-col gap-4">
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => shift(-1)}
                    disabled={!canPrev}
                    aria-label="Previous month"
                    className="mt-0.5 rounded-md p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30"
                  >
                    ‹
                  </button>
                  <div className="flex-1 flex flex-col sm:flex-row gap-5 justify-center">
                    <div className="space-y-2 hidden sm:block">
                      <MonthHeader year={view.year} month={view.month} minYear={ty - 10} maxYear={ty} onSet={(y, m) => setView({ year: y, month: m })} />
                      <MonthGrid year={view.year} month={view.month} today={today} draft={draft} anchor={anchor} hover={hover} target={target} onPick={pickDay} onHover={setHover} />
                    </div>
                    <div className="space-y-2">
                      <MonthHeader
                        year={rightMonth.year}
                        month={rightMonth.month}
                        minYear={ty - 10}
                        maxYear={ty}
                        onSet={(y, m) => {
                          const d = new Date(Date.UTC(y, m - 1, 1));
                          setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
                        }}
                      />
                      <MonthGrid year={rightMonth.year} month={rightMonth.month} today={today} draft={draft} anchor={anchor} hover={hover} target={target} onPick={pickDay} onHover={setHover} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => shift(1)}
                    disabled={!canNext}
                    aria-label="Next month"
                    className="mt-0.5 rounded-md p-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30"
                  >
                    ›
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-3 w-3 rounded-sm bg-indigo-600" aria-hidden />
                    <span className="font-medium text-gray-900 dark:text-gray-100 w-20">{presetLabel(draft.preset)}</span>
                    <span className="rounded-md border border-gray-300 dark:border-white/15 px-2.5 py-1 tabular-nums text-gray-800 dark:text-gray-100">
                      {anchor && target === 'range'
                        ? `${formatYmd(anchor)} – pick end date`
                        : draft.start
                          ? formatRange(draft.start, draft.end)
                          : `All time through ${formatYmd(draft.end)}`}
                    </span>
                    {draftDays ? <span className="text-xs text-gray-500 dark:text-gray-400">{draftDays} day{draftDays === 1 ? '' : 's'}</span> : null}
                  </div>
                  <label className={`flex items-center gap-2 ${draft.start == null ? 'opacity-50' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={draft.compareOn}
                      disabled={draft.start == null}
                      onChange={(e) => setCompareOn(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-400"
                    />
                    <span className="text-gray-900 dark:text-gray-100">Compare</span>
                    {draft.start == null ? <span className="text-xs text-gray-500">(not available for all time)</span> : null}
                  </label>
                  {draft.compareOn ? (
                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      <span className="h-3 w-3 rounded-sm bg-amber-400" aria-hidden />
                      <select
                        value={draft.compareMode}
                        onChange={(e) => setCompareMode(e.target.value as CompareMode)}
                        className="rounded-md solid-input px-2 py-1 text-sm"
                        aria-label="Compare to"
                      >
                        {COMPARE_MODES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setCompareMode('custom');
                        }}
                        className={`rounded-md border px-2.5 py-1 tabular-nums ${
                          target === 'compare'
                            ? 'border-amber-500 text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10'
                            : 'border-gray-300 dark:border-white/15 text-gray-800 dark:text-gray-100'
                        }`}
                        title="Pick custom compare dates on the calendar"
                      >
                        {anchor && target === 'compare'
                          ? `${formatYmd(anchor)} – pick end date`
                          : draft.compareStart && draft.compareEnd
                            ? formatRange(draft.compareStart, draft.compareEnd)
                            : '—'}
                      </button>
                      {target === 'compare' ? (
                        <span className="text-xs text-amber-700 dark:text-amber-300">Click the calendar to set the compare dates</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-200 dark:border-white/10">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Dates are shown in {timezone || 'your local time'}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={cancel}
                      className="rounded-lg border border-gray-300 dark:border-white/15 px-4 py-1.5 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={apply}
                      disabled={Boolean(anchor)}
                      className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                    >
                      Update
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
