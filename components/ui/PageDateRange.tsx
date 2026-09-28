import DateRangePicker from '@/components/ui/DateRangePicker';
import { useDateRange } from '@/contexts/DateRangeContext';

/**
 * The tab's single date control, for the tab header's right side. The caption makes the
 * scope explicit: this range drives every metric, chart and table on the page.
 */
export default function PageDateRange({
  caption = 'Applies to every metric on this page',
  allowAllTime = true,
}: {
  caption?: string | null;
  allowAllTime?: boolean;
}) {
  const { range, setRange, today, timezone } = useDateRange();
  return (
    <div className="flex flex-col items-end gap-0.5 min-w-0 max-w-full">
      <DateRangePicker value={range} onChange={setRange} today={today} timezone={timezone} allowAllTime={allowAllTime} />
      {caption ? (
        <span className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 pr-1">{caption}</span>
      ) : null}
    </div>
  );
}
