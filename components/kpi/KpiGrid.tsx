import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  KpiDailyEntry,
  KpiManualField,
  KpiMonthlyRollup,
  MetricThreshold,
} from '@/types/kpi';
import { apiClient } from '@/lib/api';
import { debounce } from '@/lib/debounce';
import {
  formatKpiValue,
  kpiTierCellClass,
  tierForMetric,
} from '@/lib/kpiBenchmarks';
import { exportKpiEntriesCsv } from '@/lib/kpiCsv';

type ColKind = 'int' | 'pct' | 'currency' | 'bool' | 'text';
type ColDataSource = 'manual' | 'calculated' | 'system';

interface ColDef {
  key: string;
  label: string;
  kind: ColKind;
  editable: boolean;
  dataSource: ColDataSource;
  /** Benchmark metric key for RAG shading (when applicable). */
  shadeMetric?: string;
  width?: string;
}

const COLUMNS: ColDef[] = [
  { key: 'entry_date', label: 'Date', kind: 'text', editable: false, dataSource: 'system', width: '110px' },
  { key: 'total_followers', label: 'Total Followers', kind: 'int', editable: true, dataSource: 'manual' },
  {
    key: 'new_followers',
    label: 'New Followers',
    kind: 'int',
    editable: true,
    dataSource: 'manual',
    shadeMetric: 'new_followers',
  },
  { key: 'content_posted', label: 'Content Posted', kind: 'bool', editable: true, dataSource: 'manual' },
  { key: 'best_content_type', label: 'Content Attracting ICP', kind: 'text', editable: true, dataSource: 'manual' },
  { key: 'inboxes_checked', label: 'Inboxes Checked', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'outreach_sent', label: 'Outreach Sent', kind: 'int', editable: true, dataSource: 'manual', shadeMetric: 'outreach_sent' },
  { key: 'respondents', label: 'Respondents', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'inbound_icp_leads', label: 'Inbound ICP', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'followups_sent', label: 'Follow-ups', kind: 'int', editable: true, dataSource: 'manual', shadeMetric: 'followups_sent' },
  { key: 'new_conversations', label: 'New Convos', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'conversations_nurtured', label: 'Convos Nurtured', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'calls_pitched', label: 'Pitches', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'inbound_bookings', label: 'Inbound Bookings', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'outbound_bookings', label: 'Outbound Bookings', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'calls_booked', label: 'Calls Booked', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'calls_taken', label: 'Calls Taken', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'offers_made', label: 'Offers Made', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'no_shows', label: 'No-Shows', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'closes', label: 'Closes', kind: 'int', editable: true, dataSource: 'manual' },
  { key: 'cash_collected', label: 'Cash Collected', kind: 'currency', editable: true, dataSource: 'manual' },
  { key: 'revenue', label: 'Revenue', kind: 'currency', editable: true, dataSource: 'manual' },
  { key: 'setter_context', label: 'Setter Context', kind: 'text', editable: true, dataSource: 'manual' },
  { key: 'outreach_reply_pct', label: 'Reply %', kind: 'pct', editable: false, dataSource: 'calculated', shadeMetric: 'outreach_reply_pct' },
  { key: 'convo_to_booking_pct', label: 'Convo→Book %', kind: 'pct', editable: false, dataSource: 'calculated', shadeMetric: 'convo_to_booking_pct' },
  { key: 'show_up_pct', label: 'Show-up %', kind: 'pct', editable: false, dataSource: 'calculated', shadeMetric: 'show_up_pct' },
  { key: 'closing_rate_pct', label: 'Close %', kind: 'pct', editable: false, dataSource: 'calculated', shadeMetric: 'closing_rate_pct' },
  { key: 'avg_order_value', label: 'AOV', kind: 'currency', editable: false, dataSource: 'calculated' },
];

/** Keep the Date column pinned while scrolling the wide grid horizontally. */
function stickyDateColClass(extra = ''): string {
  return [
    'sticky left-0 z-20',
    // Opaque so scrolled cells don’t show through
    'bg-gray-50 dark:bg-gray-950',
    'border-r border-white/10 shadow-[2px_0_6px_-2px_rgba(0,0,0,0.25)]',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

function rollupCell(r: KpiMonthlyRollup, key: string): string {
  if (key === 'entry_date' || key === 'total_followers') return '';
  if (key === 'new_followers') return String(r.new_followers);
  if (key === 'content_posted') return `${r.content_posted_days}d`;
  if (key === 'best_content_type' || key === 'inboxes_checked' || key === 'setter_context') return '—';
  if (key === 'outreach_sent') return String(r.outreach_sent);
  if (key === 'respondents') return String(r.respondents);
  if (key === 'inbound_icp_leads') return String(r.inbound_icp_leads);
  if (key === 'followups_sent') return String(r.followups_sent);
  if (key === 'new_conversations') return String(r.new_conversations ?? 0);
  if (key === 'conversations_nurtured') return String(r.conversations_nurtured ?? 0);
  if (key === 'calls_pitched') return String(r.calls_pitched);
  if (key === 'inbound_bookings') return String(r.inbound_bookings ?? 0);
  if (key === 'outbound_bookings') return String(r.outbound_bookings ?? 0);
  if (key === 'calls_booked') return String(r.calls_booked);
  if (key === 'calls_taken') return String(r.calls_taken);
  if (key === 'offers_made') return String(r.offers_made);
  if (key === 'no_shows') return String(r.no_shows);
  if (key === 'closes') return String(r.closes);
  if (key === 'cash_collected') return formatKpiValue(r.cash_collected, 'currency');
  if (key === 'revenue') return formatKpiValue(r.revenue, 'currency');
  if (key === 'outreach_reply_pct') return formatKpiValue(r.outreach_reply_pct, 'pct');
  if (key === 'convo_to_booking_pct') return formatKpiValue(r.convo_to_booking_pct, 'pct');
  if (key === 'show_up_pct') return formatKpiValue(r.show_up_pct, 'pct');
  if (key === 'closing_rate_pct') return formatKpiValue(r.closing_rate_pct, 'pct');
  if (key === 'avg_order_value') return formatKpiValue(r.avg_order_value, 'currency');
  return '—';
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayYmd(): string {
  return toYmd(new Date());
}

interface Props {
  entries: KpiDailyEntry[];
  rollups: KpiMonthlyRollup[];
  thresholds: Record<string, MetricThreshold>;
  autoPopulatedColumns: string[];
  loading?: boolean;
  refreshing?: boolean;
  onEntriesChange: (entries: KpiDailyEntry[]) => void;
  rangeStart: string;
  rangeEnd: string;
}

export default function KpiGrid({
  entries,
  rollups,
  thresholds,
  autoPopulatedColumns,
  loading,
  refreshing,
  onEntriesChange,
  rangeStart,
  rangeEnd,
}: Props) {
  const [sortKey, setSortKey] = useState<string>('entry_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [filterMetric, setFilterMetric] = useState<string>('');
  const [editing, setEditing] = useState<{ date: string; key: string } | null>(null);
  const [draft, setDraft] = useState<string>('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const autoCols = useMemo(() => new Set(autoPopulatedColumns), [autoPopulatedColumns]);

  const entryByDate = useMemo(() => {
    const m = new Map<string, KpiDailyEntry>();
    for (const e of entries) m.set(e.entry_date, e);
    return m;
  }, [entries]);

  /** Dense date rows for the selected range so coaches can click empty days. */
  const dateRows = useMemo(() => {
    const start = parseLocalYmd(rangeStart);
    const end = parseLocalYmd(rangeEnd);
    const dates: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      dates.push(toYmd(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }, [rangeStart, rangeEnd]);

  const sortedDates = useMemo(() => {
    let list = [...dateRows];
    if (filterMetric) {
      list = list.filter((d) => {
        const e = entryByDate.get(d);
        if (!e) return false;
        const v = (e as unknown as Record<string, unknown>)[filterMetric];
        return v != null && v !== '' && v !== false && v !== 0;
      });
    }
    list.sort((a, b) => {
      const ea = entryByDate.get(a);
      const eb = entryByDate.get(b);
      let av: unknown = sortKey === 'entry_date' ? a : ea ? (ea as unknown as Record<string, unknown>)[sortKey] : null;
      let bv: unknown = sortKey === 'entry_date' ? b : eb ? (eb as unknown as Record<string, unknown>)[sortKey] : null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av);
      const bs = String(bv);
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
    return list;
  }, [dateRows, entryByDate, filterMetric, sortKey, sortDir]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) {
        try {
          (inputRef.current as HTMLInputElement).select();
        } catch {
          /* ignore */
        }
      }
    }
  }, [editing]);

  const persist = useCallback(
    async (entryDate: string, field: KpiManualField, raw: string | boolean) => {
      let value: number | boolean | string | null = null;
      if (typeof raw === 'boolean') {
        value = raw;
      } else if (field === 'best_content_type' || field === 'setter_context') {
        value = raw.trim() || null;
      } else if (field === 'content_posted') {
        value = raw === 'true' || raw === '1' || raw === 'yes';
      } else if (raw.trim() === '') {
        value = null;
      } else if (field === 'cash_collected' || field === 'revenue') {
        value = Number(raw);
        if (Number.isNaN(value)) {
          setSaveError('Enter a valid number');
          return;
        }
      } else {
        value = parseInt(raw, 10);
        if (Number.isNaN(value)) {
          setSaveError('Enter a whole number');
          return;
        }
      }

      setSavingDate(entryDate);
      setSaveError(null);
      try {
        const updated = await apiClient.upsertKpiEntry(entryDate, { [field]: value });
        const next = [...entries];
        const idx = next.findIndex((e) => e.entry_date === entryDate);
        if (idx >= 0) next[idx] = updated;
        else next.push(updated);
        onEntriesChange(next);
      } catch (err: unknown) {
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: string }).message)
            : 'Save failed';
        setSaveError(msg);
      } finally {
        setSavingDate(null);
      }
    },
    [entries, onEntriesChange]
  );

  const debouncedPersist = useMemo(
    () =>
      debounce((entryDate: string, field: KpiManualField, raw: string) => {
        void persist(entryDate, field, raw);
      }, 400),
    [persist]
  );

  const startEdit = (
    date: string,
    col: ColDef,
    current: unknown,
    isAutoColumn: boolean
  ) => {
    if (!col.editable || isAutoColumn) return;
    setEditing({ date, key: col.key });
    if (col.kind === 'bool') {
      setDraft(current ? 'true' : 'false');
    } else {
      setDraft(current == null ? '' : String(current));
    }
  };

  const commitEdit = () => {
    if (!editing) return;
    const { date: d, key } = editing;
    setEditing(null);
    void persist(d, key as KpiManualField, draft);
  };

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'entry_date' ? 'desc' : 'asc');
    }
  };

  const addToday = async () => {
    const today = toYmd(new Date());
    try {
      const updated = await apiClient.upsertKpiEntry(today, {});
      const next = [...entries];
      const idx = next.findIndex((e) => e.entry_date === today);
      if (idx >= 0) next[idx] = updated;
      else next.push(updated);
      onEntriesChange(next);
    } catch {
      setSaveError('Could not create today\'s row');
    }
  };

  // Group rollups that intersect the visible range for footer rows
  const visibleRollups = useMemo(() => {
    return rollups.filter(
      (r) => r.period_end >= rangeStart && r.period_start <= rangeEnd
    );
  }, [rollups, rangeStart, rangeEnd]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Filter metric with data
            <select
              className="ml-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
              value={filterMetric}
              onChange={(e) => setFilterMetric(e.target.value)}
            >
              <option value="">All days</option>
              {COLUMNS.filter((c) => c.key !== 'entry_date').map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          {savingDate && (
            <span className="text-xs text-indigo-500">Saving {savingDate}…</span>
          )}
          {saveError && (
            <span className="text-xs text-red-500">{saveError}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void addToday()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-gray-800 dark:text-gray-100 hover:bg-white/10"
          >
            Ensure today
          </button>
          <button
            type="button"
            onClick={() => exportKpiEntriesCsv(entries)}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-medium text-white"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 glass-card relative">
        {refreshing && (
          <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 text-[10px] text-gray-500 dark:text-gray-400 bg-black/40 rounded px-2 py-0.5 pointer-events-none">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
            Updating…
          </div>
        )}
        <table className="w-full min-w-[1400px] text-xs">
          <thead>
            <tr className="border-b border-white/10 bg-white/5">
              {COLUMNS.map((col) => {
                const isAutoColumn = autoCols.has(col.key);
                return (
                <th
                  key={col.key}
                  style={col.width ? { minWidth: col.width } : undefined}
                  className={`px-2 py-2 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap cursor-pointer select-none hover:text-gray-900 dark:hover:text-white ${
                    col.key === 'entry_date'
                      ? stickyDateColClass('z-30 bg-gray-100 dark:bg-gray-900')
                      : isAutoColumn
                        ? 'bg-cyan-500/10'
                        : col.dataSource === 'calculated'
                          ? 'bg-violet-500/10'
                          : ''
                  }`}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                  {isAutoColumn && (
                    <span
                      className="ml-1 text-[9px] px-1 py-0.5 rounded border border-cyan-400/40 bg-cyan-500/20 text-cyan-800 dark:text-cyan-200"
                      title="Auto-populated from integration data when available"
                    >
                      AUTO
                    </span>
                  )}
                  {col.dataSource === 'calculated' && (
                    <span className="ml-1 text-[10px] opacity-40" title="Calculated">
                      ƒ
                    </span>
                  )}
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {loading && sortedDates.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            )}
            {sortedDates.map((d) => {
                const entry = entryByDate.get(d);
                const throughToday = d <= todayYmd();
                return (
                  <tr key={d} className="group/row hover:bg-white/5">
                    {COLUMNS.map((col) => {
                      const isAutoColumn = autoCols.has(col.key);
                      let raw: unknown =
                        col.key === 'entry_date'
                          ? d
                          : entry
                            ? (entry as unknown as Record<string, unknown>)[col.key]
                            : null;
                      // Auto fields default to 0 through today when unset
                      if (
                        isAutoColumn &&
                        throughToday &&
                        col.key !== 'entry_date' &&
                        (raw == null || raw === '')
                      ) {
                        raw = 0;
                      }
                      const isEditing =
                        editing?.date === d && editing.key === col.key;
                      const shade = col.shadeMetric
                        ? tierForMetric(
                            col.shadeMetric,
                            typeof raw === 'number' ? raw : null,
                            thresholds
                          )
                        : null;
                      const isEditableCell = col.editable && !isAutoColumn;
                      const cellClass = `px-2 py-1.5 whitespace-nowrap ${kpiTierCellClass(shade)} ${
                        isEditableCell ? 'cursor-pointer' : 'text-gray-500 dark:text-gray-400'
                      } ${col.key === 'entry_date' ? stickyDateColClass('font-medium text-gray-800 dark:text-gray-100 group-hover/row:bg-gray-100 dark:group-hover/row:bg-gray-900') : ''}`;

                      if (isEditing) {
                        if (col.kind === 'bool') {
                          return (
                            <td key={col.key} className={cellClass}>
                              <select
                                ref={(el) => {
                                  inputRef.current = el;
                                }}
                                className="w-full rounded border border-indigo-400/50 bg-white dark:bg-gray-900 px-1 py-0.5"
                                value={draft}
                                onChange={(e) => {
                                  setDraft(e.target.value);
                                  void persist(d, col.key as KpiManualField, e.target.value === 'true');
                                  setEditing(null);
                                }}
                                onBlur={() => setEditing(null)}
                              >
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                              </select>
                            </td>
                          );
                        }
                        return (
                          <td key={col.key} className={cellClass}>
                            <input
                              ref={(el) => {
                                inputRef.current = el;
                              }}
                              className="w-20 rounded border border-indigo-400/50 bg-white dark:bg-gray-900 px-1 py-0.5"
                              value={draft}
                              onChange={(e) => {
                                setDraft(e.target.value);
                                debouncedPersist(d, col.key as KpiManualField, e.target.value);
                              }}
                              onBlur={commitEdit}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') setEditing(null);
                              }}
                            />
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.key}
                          className={cellClass}
                          onClick={() => startEdit(d, col, raw, isAutoColumn)}
                          title={
                            col.dataSource === 'calculated'
                              ? 'Calculated'
                              : isAutoColumn
                                ? 'Auto-populated from integration data'
                                : col.editable
                                  ? 'Click to edit'
                                  : 'System'
                          }
                        >
                          {col.key === 'entry_date'
                            ? d
                            : formatKpiValue(raw as number | boolean | string | null, col.kind)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
          {visibleRollups.length > 0 && (
            <tfoot>
              {visibleRollups.map((r) => (
                <tr
                  key={r.period_label}
                  className="border-t border-white/20 bg-indigo-500/10 font-medium"
                >
                  {COLUMNS.map((col, i) => {
                    if (i === 0) {
                      return (
                        <td
                          key={col.key}
                          className={`px-2 py-2 whitespace-nowrap ${stickyDateColClass('z-20 bg-indigo-100 dark:bg-indigo-950')}`}
                          colSpan={2}
                        >
                          {r.period_label} totals ({r.days_with_data}d)
                        </td>
                      );
                    }
                    if (i === 1) return null;
                    return (
                      <td key={col.key} className="px-2 py-2">
                        {rollupCell(r, col.key)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        Click any editable cell to update — changes autosave. <span className="font-medium">AUTO</span> columns are
        auto-populated only when integration data is available, <span className="font-medium">ƒ</span> columns are calculated,
        and other editable columns are manual.
        Green / amber / red shading follows your org benchmarks.
      </p>
    </div>
  );
}
