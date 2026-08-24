import { PIPELINE_COLUMNS, type PipelineColumnId } from '@/lib/pipelineColumns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CsvImportRow {
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  instagram?: string;
  notes?: string;
  pipeline_column?: PipelineColumnId;
  program_start_date?: string;
  program_duration_days?: number;
}

export interface CsvParseResult {
  rows: CsvImportRow[];
  warnings: string[];
  headerMapping: Record<string, string>;
  duplicateCount: number;
  invalidCount: number;
}

// ---------------------------------------------------------------------------
// Header alias → canonical field
// ---------------------------------------------------------------------------

const HEADER_ALIASES: Record<string, string> = {
  email: 'email',
  'e-mail': 'email',
  'email address': 'email',
  email_address: 'email',
  first_name: 'first_name',
  firstname: 'first_name',
  'first name': 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  'last name': 'last_name',
  phone: 'phone',
  mobile: 'phone',
  tel: 'phone',
  telephone: 'phone',
  'phone number': 'phone',
  instagram: 'instagram',
  ig: 'instagram',
  notes: 'notes',
  note: 'notes',
  comments: 'notes',
  comment: 'notes',
  pipeline_column: 'pipeline_column',
  column: 'pipeline_column',
  stage: 'pipeline_column',
  lifecycle_state: 'pipeline_column',
  status: 'pipeline_column',
  program_start_date: 'program_start_date',
  start_date: 'program_start_date',
  'program start': 'program_start_date',
  program_start: 'program_start_date',
  program_duration_days: 'program_duration_days',
  duration: 'program_duration_days',
  'program days': 'program_duration_days',
  program_days: 'program_duration_days',
  duration_days: 'program_duration_days',
};

// ---------------------------------------------------------------------------
// Friendly stage aliases → PipelineColumnId
// ---------------------------------------------------------------------------

const VALID_COLUMN_IDS = new Set<string>(PIPELINE_COLUMNS.map((c) => c.id));

const STAGE_ALIASES: Record<string, PipelineColumnId> = {
  cold_lead: 'cold_lead',
  'cold lead': 'cold_lead',
  cold: 'cold_lead',
  nurturing: 'nurturing',
  nurture: 'nurturing',
  qualified: 'qualified',
  lead: 'qualified',
  prospect: 'qualified',
  booked: 'booked',
  'call booked': 'booked',
  active: 'active',
  client: 'active',
  paid: 'active',
  offboarding: 'offboarding',
  offboard: 'offboarding',
  dead: 'dead',
  alumni: 'dead',
  churned: 'dead',
  complete: 'dead',
  completed: 'dead',
};

function normalizeStage(raw: string | undefined): PipelineColumnId | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (VALID_COLUMN_IDS.has(trimmed)) return trimmed as PipelineColumnId;
  return STAGE_ALIASES[trimmed];
}

// ---------------------------------------------------------------------------
// Lightweight CSV parser (no external deps)
// ---------------------------------------------------------------------------

/** Parse one CSV line respecting double-quoted fields. */
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
  return fields.map((f) => f.trim());
}

function parseCsvText(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty: string[] = [];
  for (const line of lines) {
    if (line.trim()) nonEmpty.push(line);
  }
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = parseCsvLine(nonEmpty[0]);
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

// ---------------------------------------------------------------------------
// Template CSV (downloadable by user)
// ---------------------------------------------------------------------------

const TEMPLATE_HEADERS = [
  'email',
  'first_name',
  'last_name',
  'phone',
  'instagram',
  'notes',
  'pipeline_column',
  'program_start_date',
  'program_duration_days',
];

export function downloadCsvTemplate(): void {
  const csv = TEMPLATE_HEADERS.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'sweep_client_import_template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Parse CSV file → CsvParseResult
// ---------------------------------------------------------------------------

const MAX_ROWS = 500;

export function parseCsvFile(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const { headers, rows } = parseCsvText(text);
        resolve(processRawRows(rows, headers));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read CSV file.'));
    reader.readAsText(file);
  });
}

function processRawRows(
  rawRows: Record<string, string>[],
  headers: string[],
): CsvParseResult {
  const warnings: string[] = [];

  const headerMapping: Record<string, string> = {};
  for (const h of headers) {
    const key = h.trim().toLowerCase();
    const canonical = HEADER_ALIASES[key];
    if (canonical) {
      headerMapping[h] = canonical;
    }
  }

  if (!Object.values(headerMapping).includes('email')) {
    warnings.push('No "email" column detected. Make sure your CSV has an email header.');
  }

  if (rawRows.length > MAX_ROWS) {
    warnings.push(`CSV has ${rawRows.length} rows — only the first ${MAX_ROWS} will be imported.`);
  }

  const capped = rawRows.slice(0, MAX_ROWS);
  const seenEmails = new Map<string, number>();
  let duplicateCount = 0;
  let invalidCount = 0;
  const rows: CsvImportRow[] = [];

  for (let i = 0; i < capped.length; i++) {
    const raw = capped[i];
    const mapped: Record<string, string> = {};
    for (const [csvHeader, canonical] of Object.entries(headerMapping)) {
      const val = raw[csvHeader];
      if (val !== undefined && val !== null && String(val).trim()) {
        mapped[canonical] = String(val).trim();
      }
    }

    const email = mapped.email;
    if (!email || !email.includes('@')) {
      invalidCount++;
      continue;
    }

    const normEmail = email.toLowerCase().replace(/\s+/g, '');
    if (seenEmails.has(normEmail)) {
      duplicateCount++;
      const prevIdx = seenEmails.get(normEmail)!;
      rows[prevIdx] = buildRow(mapped);
    } else {
      seenEmails.set(normEmail, rows.length);
      rows.push(buildRow(mapped));
    }
  }

  return { rows, warnings, headerMapping, duplicateCount, invalidCount };
}

function buildRow(mapped: Record<string, string>): CsvImportRow {
  const row: CsvImportRow = { email: mapped.email };
  if (mapped.first_name) row.first_name = mapped.first_name;
  if (mapped.last_name) row.last_name = mapped.last_name;
  if (mapped.phone) row.phone = mapped.phone;
  if (mapped.instagram) row.instagram = mapped.instagram;
  if (mapped.notes) row.notes = mapped.notes;

  const stage = normalizeStage(mapped.pipeline_column);
  if (stage) row.pipeline_column = stage;

  if (mapped.program_start_date) row.program_start_date = mapped.program_start_date;
  if (mapped.program_duration_days) {
    const d = parseInt(mapped.program_duration_days, 10);
    if (!isNaN(d) && d > 0) row.program_duration_days = d;
  }

  return row;
}
