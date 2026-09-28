'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiClient } from '@/lib/api';
import {
  compareParams,
  isValidRange,
  makeRange,
  rangeParams,
  refreshRange,
  todayIn,
  type CompareMode,
  type DateRangeValue,
  type PresetId,
} from '@/lib/dateRange';

/**
 * One date range per tab (docs/features/DATE_RANGE_FILTER_PRD.md). The tab header renders
 * <PageDateRange />; every widget on the tab reads the range from here — widgets never own
 * a time control. Remembered per tab (localStorage) and re-resolved on load so rolling
 * presets stay rolling.
 */

interface DateRangeContextValue {
  range: DateRangeValue;
  setRange: (next: DateRangeValue) => void;
  /** Today (YYYY-MM-DD) in the org timezone. */
  today: string;
  timezone: string | null;
  /** `{ start?, end }` for API calls. */
  params: { start?: string; end: string };
  /** `{ compare_start?, compare_end? }` for API calls (empty when compare is off). */
  compare: { compare_start?: string; compare_end?: string };
}

const Ctx = createContext<DateRangeContextValue | null>(null);

let tzPromise: Promise<string | null> | null = null;
/** Org timezone, fetched once per page load. */
function loadOrgTimezone(): Promise<string | null> {
  if (!tzPromise) {
    tzPromise = (async () => {
      try {
        const me = (await apiClient.getCurrentUser()) as { selected_org_id?: string | null; org_id?: string | null };
        const orgId = me?.selected_org_id ?? me?.org_id;
        if (!orgId) return null;
        const { timezone } = await apiClient.getOrgTimezone(orgId);
        return timezone || null;
      } catch {
        tzPromise = null; // retry on next mount
        return null;
      }
    })();
  }
  return tzPromise;
}

function storageKey(key: string) {
  return `sweep.dateRange.${key}`;
}

export function DateRangeProvider({
  storageKey: key,
  defaultPreset = 'this_month',
  defaultCompare = 'previous_period',
  children,
}: {
  storageKey: string;
  defaultPreset?: Exclude<PresetId, 'custom'>;
  defaultCompare?: CompareMode | null;
  children: ReactNode;
}) {
  const [timezone, setTimezone] = useState<string | null>(null);
  const [today, setToday] = useState(() => todayIn(null));
  const [range, setRangeState] = useState<DateRangeValue>(() => {
    const fallback = makeRange(defaultPreset, todayIn(null), defaultCompare);
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = JSON.parse(window.localStorage.getItem(storageKey(key)) || 'null');
      return isValidRange(raw) ? refreshRange(raw, todayIn(null)) : fallback;
    } catch {
      return fallback;
    }
  });

  // Once the org timezone is known, re-resolve "today"-relative presets in it.
  useEffect(() => {
    let cancelled = false;
    void loadOrgTimezone().then((tz) => {
      if (cancelled || !tz) return;
      setTimezone(tz);
      const t = todayIn(tz);
      setToday(t);
      setRangeState((r) => {
        const next = refreshRange(r, t);
        return JSON.stringify(next) === JSON.stringify(r) ? r : next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setRange = useCallback(
    (next: DateRangeValue) => {
      setRangeState(next);
      try {
        window.localStorage.setItem(storageKey(key), JSON.stringify(next));
      } catch {
        /* per-browser convenience only */
      }
    },
    [key],
  );

  const value = useMemo<DateRangeContextValue>(
    () => ({ range, setRange, today, timezone, params: rangeParams(range), compare: compareParams(range) }),
    [range, setRange, today, timezone],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDateRange(): DateRangeContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDateRange must be used within DateRangeProvider');
  return v;
}

/** Same as useDateRange, or null outside a provider (for widgets reused elsewhere). */
export function useOptionalDateRange(): DateRangeContextValue | null {
  return useContext(Ctx);
}
