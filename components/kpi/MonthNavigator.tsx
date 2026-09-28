/**
 * ← Prev | Viewing <Month> | Next → — the month filter shared by Sales KPIs and
 * the Funnels scorecard, so both tabs page through time the same way.
 */

interface MonthNavigatorProps {
  /** e.g. "September 2026" (or "Aug – Sep 2026" for a compare window). */
  label: string;
  rangeStart: string;
  rangeEnd: string;
  onPrev: () => void;
  onNext: () => void;
  /** Disable Next (e.g. a future month has no data). */
  nextDisabled?: boolean;
}

export default function MonthNavigator({
  label,
  rangeStart,
  rangeEnd,
  onPrev,
  onNext,
  nextDisabled = false,
}: MonthNavigatorProps) {
  return (
    <>
      <button
        type="button"
        onClick={onPrev}
        className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 text-gray-800 dark:text-gray-100 text-xs"
      >
        ← Prev
      </button>
      <div className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-gray-800 dark:text-gray-100">
        <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Viewing</span>
        <div className="text-xs font-semibold leading-tight">{label}</div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400">
          {rangeStart} → {rangeEnd}
        </div>
      </div>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-lg border border-white/10 px-2 py-1 hover:bg-white/5 text-gray-800 dark:text-gray-100 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Next →
      </button>
    </>
  );
}
