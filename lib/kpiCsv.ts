import type { KpiDailyEntry } from '@/types/kpi';
import { formatKpiValue } from '@/lib/kpiBenchmarks';

/** Export headers match import template / KPI API field names for round-trip. */
const HEADERS = [
  'entry_date',
  'total_followers',
  'new_followers',
  'content_posted',
  'best_content_type',
  'inboxes_checked',
  'outreach_sent',
  'respondents',
  'inbound_icp_leads',
  'followups_sent',
  'new_conversations',
  'conversations_nurtured',
  'calls_pitched',
  'inbound_bookings',
  'outbound_bookings',
  'calls_booked',
  'calls_taken',
  'offers_made',
  'no_shows',
  'closes',
  'cash_collected',
  'revenue',
  'setter_context',
  'outreach_reply_pct',
  'convo_to_booking_pct',
  'show_up_pct',
  'closing_rate_pct',
  'avg_order_value',
] as const;

function cell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function exportKpiEntriesCsv(entries: KpiDailyEntry[], filename?: string): void {
  const lines = [HEADERS.join(',')];
  const sorted = [...entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  for (const e of sorted) {
    lines.push(
      [
        e.entry_date,
        e.total_followers,
        e.new_followers,
        e.content_posted,
        e.best_content_type,
        e.inboxes_checked,
        e.outreach_sent,
        e.respondents,
        e.inbound_icp_leads,
        e.followups_sent,
        e.new_conversations,
        e.conversations_nurtured,
        e.calls_pitched,
        e.inbound_bookings,
        e.outbound_bookings,
        e.calls_booked,
        e.calls_taken,
        e.offers_made,
        e.no_shows,
        e.closes,
        e.cash_collected,
        e.revenue,
        e.setter_context,
        e.outreach_reply_pct,
        e.convo_to_booking_pct,
        e.show_up_pct,
        e.closing_rate_pct,
        e.avg_order_value,
      ]
        .map(cell)
        .join(',')
    );
  }
  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `kpi_export_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Re-export format helper for consumers that want display strings in CSV. */
export { formatKpiValue };
