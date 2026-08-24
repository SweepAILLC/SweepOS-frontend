import { useEffect, useMemo, useState } from 'react';
import type { KpiDailyEntry, KpiEntryUpdatePayload, MetricThreshold } from '@/types/kpi';
import {
  formatKpiValue,
  kpiTierCellClass,
  kpiTierDotClass,
  overallDayTier,
  tierForMetric,
} from '@/lib/kpiBenchmarks';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COLOR_METRICS: Array<{ id: string; label: string }> = [
  { id: 'overall', label: 'Overall day' },
  { id: 'new_followers', label: 'New followers' },
  { id: 'outreach_sent', label: 'Outreach sent' },
  { id: 'outreach_reply_pct', label: 'Reply %' },
  { id: 'convo_to_booking_pct', label: 'Convo→Book %' },
  { id: 'show_up_pct', label: 'Show-up %' },
  { id: 'closing_rate_pct', label: 'Close %' },
  { id: 'content_posted', label: 'Content posted' },
  { id: 'closes', label: 'Closes' },
  { id: 'revenue', label: 'Revenue' },
];

/** True once the coach has saved meaningful input for the day (not empty/auto-only zeros). */
function entryHasInput(entry: KpiDailyEntry): boolean {
  if (entry.total_followers != null) return true;
  if (entry.content_posted != null) return true;
  if (entry.best_content_type != null && entry.best_content_type.trim() !== '') return true;
  if (entry.inboxes_checked != null) return true;
  if (entry.outreach_sent != null) return true;
  if (entry.respondents != null) return true;
  if (entry.inbound_icp_leads != null) return true;
  if (entry.followups_sent != null) return true;
  if (entry.new_conversations != null) return true;
  if (entry.conversations_nurtured != null) return true;
  if (entry.calls_pitched != null) return true;
  if (entry.inbound_bookings != null) return true;
  if (entry.outbound_bookings != null) return true;
  if (entry.offers_made != null) return true;
  if (entry.setter_context != null && entry.setter_context.trim() !== '') return true;
  if ((entry.calls_booked ?? 0) > 0) return true;
  if ((entry.calls_taken ?? 0) > 0) return true;
  if ((entry.closes ?? 0) > 0) return true;
  if ((entry.no_shows ?? 0) > 0) return true;
  if ((entry.cash_collected ?? 0) > 0) return true;
  if ((entry.revenue ?? 0) > 0) return true;
  return false;
}

function metricKind(metric: string): 'int' | 'pct' | 'currency' | 'bool' {
  if (metric.endsWith('_pct')) return 'pct';
  if (metric === 'revenue' || metric === 'cash_collected') return 'currency';
  if (metric === 'content_posted') return 'bool';
  return 'int';
}

/** Compact primary + secondary lines shown inside a day cell. */
function dayCellPreview(
  entry: KpiDailyEntry,
  colorMetric: string
): { primary: string; secondary: string | null; title: string } {
  const titleParts: string[] = [];
  if (entry.outreach_sent != null) titleParts.push(`Outreach ${entry.outreach_sent}`);
  if (entry.respondents != null) titleParts.push(`Replies ${entry.respondents}`);
  if (entry.calls_booked != null) titleParts.push(`Booked ${entry.calls_booked}`);
  if (entry.closes != null) titleParts.push(`Closes ${entry.closes}`);
  if (entry.revenue != null) titleParts.push(`Rev ${formatKpiValue(entry.revenue, 'currency')}`);
  const title = titleParts.length > 0 ? titleParts.join(' · ') : 'KPI data entered';

  if (colorMetric === 'overall') {
    const primary =
      entry.outreach_sent != null
        ? `${entry.outreach_sent} out`
        : entry.total_followers != null
          ? formatKpiValue(entry.total_followers, 'int')
          : entry.content_posted
            ? 'Posted'
            : 'Logged';
    const sec: string[] = [];
    if (entry.outreach_reply_pct != null) sec.push(formatKpiValue(entry.outreach_reply_pct, 'pct'));
    if ((entry.closes ?? 0) > 0) sec.push(`${entry.closes} cl`);
    else if ((entry.calls_booked ?? 0) > 0) sec.push(`${entry.calls_booked} bk`);
    else if (entry.followups_sent != null) sec.push(`${entry.followups_sent} fu`);
    return { primary, secondary: sec.length ? sec.join(' · ') : null, title };
  }

  if (colorMetric === 'content_posted') {
    const primary =
      entry.content_posted == null ? '—' : entry.content_posted ? 'Posted' : 'No post';
    return {
      primary,
      secondary: entry.best_content_type ? entry.best_content_type.slice(0, 12) : null,
      title,
    };
  }

  const raw = entry[colorMetric as keyof KpiDailyEntry];
  const kind = metricKind(colorMetric);
  const primary =
    typeof raw === 'number' || typeof raw === 'boolean'
      ? formatKpiValue(raw, kind)
      : raw == null
        ? '—'
        : String(raw);

  const sec: string[] = [];
  if (colorMetric !== 'outreach_sent' && entry.outreach_sent != null) {
    sec.push(`${entry.outreach_sent} out`);
  }
  if (colorMetric !== 'closes' && (entry.closes ?? 0) > 0) {
    sec.push(`${entry.closes} cl`);
  }
  return { primary, secondary: sec.length ? sec.join(' · ') : null, title };
}

function getDaysInMonth(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startingDay = first.getDay();
  const days: (Date | null)[] = [];
  for (let i = 0; i < startingDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  return days;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

interface MonthGridProps {
  year: number;
  month: number;
  entryByDate: Map<string, KpiDailyEntry>;
  thresholds: Record<string, MetricThreshold>;
  colorMetric: string;
  selectedDate: string | null;
  onSelect: (ymd: string) => void;
}

function MonthGrid({
  year,
  month,
  entryByDate,
  thresholds,
  colorMetric,
  selectedDate,
  onSelect,
}: MonthGridProps) {
  const days = useMemo(() => getDaysInMonth(year, month), [year, month]);
  const today = toYmd(new Date());

  const tierForDay = (ymd: string) => {
    const entry = entryByDate.get(ymd);
    if (!entry) return null;
    if (colorMetric === 'overall') return overallDayTier(entry, thresholds);
    if (colorMetric === 'content_posted') {
      if (entry.content_posted == null) return null;
      return entry.content_posted ? 'strong' : 'weak';
    }
    if (colorMetric === 'closes' || colorMetric === 'revenue') {
      const v = entry[colorMetric as 'closes' | 'revenue'];
      if (v == null) return null;
      if (colorMetric === 'closes') {
        if (Number(v) >= 1) return 'strong';
        return 'okay';
      }
      if (Number(v) >= 1000) return 'strong';
      if (Number(v) > 0) return 'okay';
      return 'weak';
    }
    const val = entry[colorMetric as keyof KpiDailyEntry];
    return tierForMetric(
      colorMetric,
      typeof val === 'number' ? val : null,
      thresholds
    );
  };

  return (
    <div className="rounded-xl border border-white/10 glass-card p-3 flex-1 min-w-[280px]">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {monthLabel(year, month)}
      </h4>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="text-center text-[10px] font-medium text-gray-500 dark:text-gray-400 py-1"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date, idx) => {
          if (!date) {
            return <div key={`e-${idx}`} className="min-h-[4.5rem]" />;
          }
          const ymd = toYmd(date);
          const entry = entryByDate.get(ymd);
          const hasInput = entry ? entryHasInput(entry) : false;
          const tier = tierForDay(ymd);
          const isToday = ymd === today;
          const isSelected = ymd === selectedDate;
          const preview = entry && hasInput ? dayCellPreview(entry, colorMetric) : null;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelect(ymd)}
              title={
                preview?.title ||
                (tier ? `Color by: ${colorMetric} (${tier})` : hasInput ? 'KPI data entered' : 'Click to enter KPI')
              }
              className={`
                min-h-[4.5rem] rounded-lg border px-1 py-1 flex flex-col items-stretch justify-start gap-0.5
                transition-all text-left
                ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-400/50' : 'border-white/10'}
                ${kpiTierCellClass(tier)}
                ${!tier && isToday ? 'bg-blue-500/10' : ''}
                ${!tier && !hasInput ? 'opacity-60 hover:bg-white/5' : ''}
                ${!tier && hasInput ? 'bg-white/[0.03] hover:bg-white/5' : 'hover:brightness-110'}
              `}
            >
              <div className="flex items-center justify-between gap-0.5 w-full">
                <span className="text-[11px] text-gray-800 dark:text-gray-100 font-medium leading-none">
                  {date.getDate()}
                </span>
                <span
                  className={`w-1.5 h-1.5 shrink-0 rounded-full ${kpiTierDotClass(tier)}`}
                  aria-hidden
                />
              </div>
              {preview ? (
                <div className="mt-0.5 flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] font-semibold text-gray-900 dark:text-gray-100 leading-tight truncate">
                    {preview.primary}
                  </span>
                  {preview.secondary && (
                    <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight truncate">
                      {preview.secondary}
                    </span>
                  )}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  entries: KpiDailyEntry[];
  thresholds: Record<string, MetricThreshold>;
  loading?: boolean;
  refreshing?: boolean;
  onUpsertEntry: (entryDate: string, data: KpiEntryUpdatePayload) => Promise<KpiDailyEntry>;
  /** Controlled visible month (shared with grid view via parent dashboard toggle). */
  year: number;
  month: number;
  compareMonths?: boolean;
  onCompareChange?: (compare: boolean) => void;
  /** Ask parent to load entries covering the months currently on screen (incl. compare). */
  onVisibleRangeChange?: (start: string, end: string) => void;
}

export default function KpiCalendar({
  entries,
  thresholds,
  loading,
  refreshing,
  onUpsertEntry,
  year,
  month,
  compareMonths = false,
  onCompareChange,
  onVisibleRangeChange,
}: Props) {
  const compare = compareMonths;
  const [colorMetric, setColorMetric] = useState('overall');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const entryByDate = useMemo(() => {
    const m = new Map<string, KpiDailyEntry>();
    for (const e of entries) m.set(e.entry_date, e);
    return m;
  }, [entries]);

  const prevMonth = useMemo(() => {
    const d = new Date(year, month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [year, month]);

  // Load visible month(s) for color-by tiers — debounce is handled in the parent.
  useEffect(() => {
    if (!onVisibleRangeChange) return;
    const startMonth = compare ? prevMonth : { year, month };
    const start = toYmd(new Date(startMonth.year, startMonth.month, 1));
    const end = toYmd(new Date(year, month + 1, 0));
    onVisibleRangeChange(start, end);
  }, [year, month, compare, prevMonth, onVisibleRangeChange]);

  const selected = selectedDate ? entryByDate.get(selectedDate) : undefined;
  const [form, setForm] = useState<KpiEntryUpdatePayload>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDate) {
      setForm({});
      return;
    }
    const e = selected;
    setForm({
      total_followers: e?.total_followers ?? null,
      content_posted: e?.content_posted ?? null,
      best_content_type: e?.best_content_type ?? null,
      inboxes_checked: e?.inboxes_checked ?? null,
      outreach_sent: e?.outreach_sent ?? null,
      respondents: e?.respondents ?? null,
      inbound_icp_leads: e?.inbound_icp_leads ?? null,
      followups_sent: e?.followups_sent ?? null,
      new_conversations: e?.new_conversations ?? null,
      conversations_nurtured: e?.conversations_nurtured ?? null,
      calls_pitched: e?.calls_pitched ?? null,
      inbound_bookings: e?.inbound_bookings ?? null,
      outbound_bookings: e?.outbound_bookings ?? null,
      offers_made: e?.offers_made ?? null,
      revenue: e?.revenue ?? null,
      setter_context: e?.setter_context ?? null,
    });
  }, [selectedDate, selected]);

  const setNum = (key: keyof KpiEntryUpdatePayload, raw: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: raw === '' ? null : Number(raw),
    }));
  };

  const saveDay = async () => {
    if (!selectedDate) return;
    setSaving(true);
    setError(null);
    try {
      await onUpsertEntry(selectedDate, form);
    } catch (e: unknown) {
      const { formatApiError } = await import('@/lib/apiError');
      setError(formatApiError(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  const openEditForDate = (ymd: string) => {
    setSelectedDate(ymd);
    setEditOpen(true);
  };

  return (
    <div className="space-y-4 relative">
      {(loading || refreshing) && (
        <div className="absolute top-0 right-0 z-10 inline-flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 bg-black/30 rounded px-2 py-0.5 pointer-events-none">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
          {loading && entries.length === 0 ? 'Loading…' : 'Updating…'}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 justify-end">
        <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
          Color by
          <select
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
            value={colorMetric}
            onChange={(e) => setColorMetric(e.target.value)}
          >
            {COLOR_METRICS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => onCompareChange?.(e.target.checked)}
            className="rounded"
          />
          Two-month compare
        </label>
      </div>

      <div className={`flex flex-col ${compare ? 'lg:flex-row' : ''} gap-4`}>
        {compare && (
          <MonthGrid
            year={prevMonth.year}
            month={prevMonth.month}
            entryByDate={entryByDate}
            thresholds={thresholds}
            colorMetric={colorMetric}
            selectedDate={selectedDate}
            onSelect={openEditForDate}
          />
        )}
        <MonthGrid
          year={year}
          month={month}
          entryByDate={entryByDate}
          thresholds={thresholds}
          colorMetric={colorMetric}
          selectedDate={selectedDate}
          onSelect={openEditForDate}
        />
      </div>

      {editOpen && selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => {
              setEditOpen(false);
              setSelectedDate(null);
            }}
          />
          <div className="relative w-full max-w-3xl rounded-xl border border-white/10 glass-card p-4 max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Edit KPI Entry — {selectedDate}
              </h4>
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
                onClick={() => {
                  setEditOpen(false);
                  setSelectedDate(null);
                }}
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <label className="text-gray-600 dark:text-gray-300">
                Followers
                <input
                  type="number"
                  value={(form.total_followers as number | null) ?? ''}
                  onChange={(e) => setNum('total_followers', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Content posted
                <select
                  value={String(form.content_posted ?? '')}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      content_posted: e.target.value === '' ? null : e.target.value === 'true',
                    }))
                  }
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                >
                  <option value="">—</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Content attracting ICP
                <input
                  type="text"
                  value={(form.best_content_type as string | null) ?? ''}
                  onChange={(e) => setForm((prev) => ({ ...prev, best_content_type: e.target.value || null }))}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Inboxes checked
                <input
                  type="number"
                  value={(form.inboxes_checked as number | null) ?? ''}
                  onChange={(e) => setNum('inboxes_checked', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Outbounds sent
                <input
                  type="number"
                  value={(form.outreach_sent as number | null) ?? ''}
                  onChange={(e) => setNum('outreach_sent', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Respondents
                <input
                  type="number"
                  value={(form.respondents as number | null) ?? ''}
                  onChange={(e) => setNum('respondents', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Inbound ICP
                <input
                  type="number"
                  value={(form.inbound_icp_leads as number | null) ?? ''}
                  onChange={(e) => setNum('inbound_icp_leads', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Follow-ups
                <input
                  type="number"
                  value={(form.followups_sent as number | null) ?? ''}
                  onChange={(e) => setNum('followups_sent', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                New convos
                <input
                  type="number"
                  value={(form.new_conversations as number | null) ?? ''}
                  onChange={(e) => setNum('new_conversations', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Convos nurtured
                <input
                  type="number"
                  value={(form.conversations_nurtured as number | null) ?? ''}
                  onChange={(e) => setNum('conversations_nurtured', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Pitches
                <input
                  type="number"
                  value={(form.calls_pitched as number | null) ?? ''}
                  onChange={(e) => setNum('calls_pitched', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Inbound bookings
                <input
                  type="number"
                  value={(form.inbound_bookings as number | null) ?? ''}
                  onChange={(e) => setNum('inbound_bookings', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Outbound bookings
                <input
                  type="number"
                  value={(form.outbound_bookings as number | null) ?? ''}
                  onChange={(e) => setNum('outbound_bookings', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Offers made
                <input
                  type="number"
                  value={(form.offers_made as number | null) ?? ''}
                  onChange={(e) => setNum('offers_made', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300">
                Revenue (manual)
                <input
                  type="number"
                  step="0.01"
                  value={(form.revenue as number | null) ?? ''}
                  onChange={(e) => setNum('revenue', e.target.value)}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
              <label className="text-gray-600 dark:text-gray-300 md:col-span-2">
                Extra context from setter
                <textarea
                  value={(form.setter_context as string | null) ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, setter_context: e.target.value || null }))
                  }
                  rows={2}
                  className="mt-1 w-full rounded border border-white/10 bg-white/5 px-2 py-1"
                />
              </label>
            </div>
            {selected &&
              ((selected.inbound_bookings ?? 0) + (selected.outbound_bookings ?? 0) > 0 ||
                (selected.calls_booked ?? 0) > 0) && (
                <p className="mt-2 text-[11px] text-gray-500">
                  Bookings split {(selected.inbound_bookings ?? 0) + (selected.outbound_bookings ?? 0)}
                  {' · '}
                  Calls booked {selected.calls_booked ?? 0}
                  {(selected.inbound_bookings ?? 0) + (selected.outbound_bookings ?? 0) !==
                    (selected.calls_booked ?? 0) && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {' '}
                      — split should match automated calls booked when calendar is connected
                    </span>
                  )}
                </p>
              )}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => void saveDay()}
                disabled={saving}
                className="rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white"
              >
                {saving ? 'Saving…' : 'Save day'}
              </button>
              {error && <span className="text-xs text-red-500">{error}</span>}
              {!error && selected && (
                <span className="text-xs text-gray-500">
                  Reply {formatKpiValue(selected.outreach_reply_pct, 'pct')} · Close {formatKpiValue(selected.closing_rate_pct, 'pct')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500 dark:text-gray-400">
        <span className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${kpiTierDotClass('strong')}`} /> Strong
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${kpiTierDotClass('okay')}`} /> Okay
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${kpiTierDotClass('weak')}`} /> Weak
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${kpiTierDotClass(null)}`} /> No data
        </span>
        <span className="text-gray-400">
          Overall day averages scored metrics vs your benchmark ranges (not worst-case). Color by controls the primary figure.
        </span>
      </div>
    </div>
  );
}
