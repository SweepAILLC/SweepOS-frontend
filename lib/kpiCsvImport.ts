/**
 * KPI bulk CSV import — template headers use the same canonical field names
 * as the KPI grid / API (entry_date, total_followers, outreach_sent, …).
 * Friendly aliases are still accepted for older CSVs.
 */

export interface KpiCsvImportRow {
  entry_date: string; // YYYY-MM-DD
  total_followers?: number | null;
  new_followers?: number | null;
  content_posted?: boolean | null;
  best_content_type?: string | null;
  inboxes_checked?: number | null;
  outreach_sent?: number | null;
  respondents?: number | null;
  inbound_icp_leads?: number | null;
  followups_sent?: number | null;
  new_conversations?: number | null;
  conversations_nurtured?: number | null;
  calls_pitched?: number | null;
  inbound_bookings?: number | null;
  outbound_bookings?: number | null;
  offers_made?: number | null;
  revenue?: number | null;
  setter_context?: string | null;
}

export interface KpiCsvParseResult {
  rows: KpiCsvImportRow[];
  warnings: string[];
  headerMapping: Record<string, string>;
  unrecognizedHeaders: string[];
  invalidCount: number;
  duplicateCount: number;
}

/** Canonical importable columns — match grid/API field keys exactly. */
export const KPI_CSV_TEMPLATE_HEADERS = [
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
  'offers_made',
  'revenue',
  'setter_context',
] as const;

export type KpiCsvTemplateHeader = (typeof KPI_CSV_TEMPLATE_HEADERS)[number];

/** Map CSV header (lowercased/trimmed) → canonical KPI field. */
const HEADER_ALIASES: Record<string, string> = {
  // entry_date
  entry_date: 'entry_date',
  date: 'entry_date',
  day: 'entry_date',

  // total_followers
  total_followers: 'total_followers',
  followers: 'total_followers',
  'total followers': 'total_followers',

  // new_followers
  new_followers: 'new_followers',
  'new followers': 'new_followers',

  // content_posted
  content_posted: 'content_posted',
  'content posted': 'content_posted',
  content: 'content_posted',

  // best_content_type (UI: Content Attracting ICP)
  best_content_type: 'best_content_type',
  best_content: 'best_content_type',
  'best content': 'best_content_type',
  'best performing content': 'best_content_type',
  'content attracting icp': 'best_content_type',
  content_attracting_icp: 'best_content_type',

  // inboxes_checked
  inboxes_checked: 'inboxes_checked',
  'inboxes checked': 'inboxes_checked',
  inboxes: 'inboxes_checked',

  // outreach_sent
  outreach_sent: 'outreach_sent',
  'outreach sent': 'outreach_sent',
  outbounds: 'outreach_sent',
  outbounds_sent: 'outreach_sent',
  'outbounds sent': 'outreach_sent',
  outbound: 'outreach_sent',
  dms_sent: 'outreach_sent',
  'dms sent': 'outreach_sent',

  // respondents
  respondents: 'respondents',
  replies: 'respondents',
  reply: 'respondents',
  responses: 'respondents',

  // inbound_icp_leads
  inbound_icp_leads: 'inbound_icp_leads',
  inbound_icp: 'inbound_icp_leads',
  'inbound icp': 'inbound_icp_leads',
  icp: 'inbound_icp_leads',

  // followups_sent
  followups_sent: 'followups_sent',
  followups: 'followups_sent',
  'follow-ups': 'followups_sent',
  'follow ups': 'followups_sent',
  'follow-ups sent': 'followups_sent',

  // new_conversations
  new_conversations: 'new_conversations',
  'new conversations': 'new_conversations',
  'new convos': 'new_conversations',
  new_convos: 'new_conversations',

  // conversations_nurtured
  conversations_nurtured: 'conversations_nurtured',
  'conversations nurtured': 'conversations_nurtured',
  'convos nurtured': 'conversations_nurtured',
  nurtured: 'conversations_nurtured',

  // calls_pitched (UI: Pitches)
  calls_pitched: 'calls_pitched',
  'calls pitched': 'calls_pitched',
  pitched: 'calls_pitched',
  pitches: 'calls_pitched',

  // inbound_bookings
  inbound_bookings: 'inbound_bookings',
  'inbound bookings': 'inbound_bookings',
  inbound_booking: 'inbound_bookings',

  // outbound_bookings
  outbound_bookings: 'outbound_bookings',
  'outbound bookings': 'outbound_bookings',
  outbound_booking: 'outbound_bookings',

  // offers_made
  offers_made: 'offers_made',
  'offers made': 'offers_made',
  offers: 'offers_made',

  // revenue (manual)
  revenue: 'revenue',
  rev: 'revenue',

  // setter_context
  setter_context: 'setter_context',
  'setter context': 'setter_context',
  'extra context': 'setter_context',
  context: 'setter_context',
  notes: 'setter_context',
};

const MAX_ROWS = 500;

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(nonEmpty[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < nonEmpty.length; i++) {
    const values = parseCsvLine(nonEmpty[i]);
    if (values.every((v) => !v)) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? '';
    }
    rows.push(row);
  }
  return { headers, rows };
}

function parseBool(raw: string | undefined): boolean | null {
  if (raw == null || raw.trim() === '') return null;
  const v = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(v)) return true;
  if (['0', 'false', 'no', 'n'].includes(v)) return false;
  return null;
}

function parseIntOrNull(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const n = parseInt(raw.trim(), 10);
  return Number.isNaN(n) ? null : n;
}

function parseNumberOrNull(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const cleaned = raw.trim().replace(/[$,]/g, '');
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

function normalizeDate(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, '0');
    const dd = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  return null;
}

export function downloadKpiCsvTemplate(): void {
  const example = [
    '2026-07-01', // entry_date
    '12500', // total_followers
    '40', // new_followers
    'yes', // content_posted
    'Reel about offer', // best_content_type / content attracting ICP
    '3', // inboxes_checked
    '25', // outreach_sent
    '4', // respondents
    '2', // inbound_icp_leads
    '12', // followups_sent
    '6', // new_conversations
    '8', // conversations_nurtured
    '5', // calls_pitched / pitches
    '1', // inbound_bookings
    '2', // outbound_bookings
    '3', // offers_made
    '499.00', // revenue
    'Setter note', // setter_context
  ];
  const csv = KPI_CSV_TEMPLATE_HEADERS.join(',') + '\n' + example.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sweep_kpi_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function parseKpiCsvFile(file: File): Promise<KpiCsvParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        resolve(processRawRows(text));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read CSV file.'));
    reader.readAsText(file);
  });
}

function processRawRows(text: string): KpiCsvParseResult {
  const { headers, rows: rawRows } = parseCsvText(text);
  const warnings: string[] = [];
  const headerMapping: Record<string, string> = {};
  const unrecognizedHeaders: string[] = [];

  for (const h of headers) {
    if (!h.trim()) continue;
    const key = h.trim().toLowerCase();
    const canonical = HEADER_ALIASES[key];
    if (canonical) {
      headerMapping[h] = canonical;
    } else {
      unrecognizedHeaders.push(h);
    }
  }

  if (!Object.values(headerMapping).includes('entry_date')) {
    warnings.push(
      `No date column found. Use "${KPI_CSV_TEMPLATE_HEADERS[0]}" (YYYY-MM-DD).`
    );
  }

  const mappedCanonical = new Set(Object.values(headerMapping));
  const missingRecommended = KPI_CSV_TEMPLATE_HEADERS.filter(
    (h) => h !== 'entry_date' && h !== 'new_followers' && !mappedCanonical.has(h)
  );
  if (missingRecommended.length > 0 && mappedCanonical.size > 1) {
    warnings.push(
      `Optional columns not found (will be left blank): ${missingRecommended.join(', ')}.`
    );
  }

  if (unrecognizedHeaders.length > 0) {
    warnings.push(
      `Unrecognized columns ignored: ${unrecognizedHeaders.join(', ')}. ` +
        `Expected headers: ${KPI_CSV_TEMPLATE_HEADERS.join(', ')}.`
    );
  }

  if (rawRows.length > MAX_ROWS) {
    warnings.push(`CSV has ${rawRows.length} rows — only the first ${MAX_ROWS} will be imported.`);
  }

  const capped = rawRows.slice(0, MAX_ROWS);
  const seenDates = new Map<string, number>();
  let duplicateCount = 0;
  let invalidCount = 0;
  const rows: KpiCsvImportRow[] = [];

  for (const raw of capped) {
    const mapped: Record<string, string> = {};
    for (const [csvHeader, canonical] of Object.entries(headerMapping)) {
      const val = raw[csvHeader];
      // Allow "0" / "false" — only skip truly empty cells
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        mapped[canonical] = String(val).trim();
      }
    }

    const entry_date = normalizeDate(mapped.entry_date || '');
    if (!entry_date) {
      invalidCount++;
      continue;
    }

    const row: KpiCsvImportRow = {
      entry_date,
      total_followers: parseIntOrNull(mapped.total_followers),
      new_followers: parseIntOrNull(mapped.new_followers),
      content_posted: parseBool(mapped.content_posted),
      best_content_type: mapped.best_content_type || null,
      inboxes_checked: parseIntOrNull(mapped.inboxes_checked),
      outreach_sent: parseIntOrNull(mapped.outreach_sent),
      respondents: parseIntOrNull(mapped.respondents),
      inbound_icp_leads: parseIntOrNull(mapped.inbound_icp_leads),
      followups_sent: parseIntOrNull(mapped.followups_sent),
      new_conversations: parseIntOrNull(mapped.new_conversations),
      conversations_nurtured: parseIntOrNull(mapped.conversations_nurtured),
      calls_pitched: parseIntOrNull(mapped.calls_pitched),
      inbound_bookings: parseIntOrNull(mapped.inbound_bookings),
      outbound_bookings: parseIntOrNull(mapped.outbound_bookings),
      offers_made: parseIntOrNull(mapped.offers_made),
      revenue: parseNumberOrNull(mapped.revenue),
      setter_context: mapped.setter_context || null,
    };

    if (seenDates.has(entry_date)) {
      duplicateCount++;
      rows[seenDates.get(entry_date)!] = row;
    } else {
      seenDates.set(entry_date, rows.length);
      rows.push(row);
    }
  }

  return {
    rows,
    warnings,
    headerMapping,
    unrecognizedHeaders,
    invalidCount,
    duplicateCount,
  };
}
