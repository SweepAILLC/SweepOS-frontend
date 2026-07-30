import { useRef, useState } from 'react';
import { apiClient } from '@/lib/api';
import {
  downloadKpiCsvTemplate,
  parseKpiCsvFile,
  type KpiCsvParseResult,
} from '@/lib/kpiCsvImport';
import type { KpiDailyEntry } from '@/types/kpi';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: (entries: KpiDailyEntry[]) => void;
}

export default function KpiCsvImportModal({ open, onClose, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [phase, setPhase] = useState<'upload' | 'preview' | 'done'>('upload');
  const [result, setResult] = useState<KpiCsvParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  if (!open) return null;

  const reset = () => {
    setPhase('upload');
    setResult(null);
    setError(null);
    setImporting(false);
    setImportedCount(0);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setError(null);
    try {
      const parsed = await parseKpiCsvFile(file);
      setResult(parsed);
      setPhase('preview');
    } catch (err: unknown) {
      setError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Failed to parse CSV file.'
      );
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  const handleImport = async () => {
    if (!result?.rows.length) return;
    setImporting(true);
    setError(null);
    try {
      const payload = result.rows.map((r) => ({
        entry_date: r.entry_date,
        total_followers: r.total_followers ?? null,
        new_followers: r.new_followers ?? null,
        content_posted: r.content_posted ?? null,
        best_content_type: r.best_content_type ?? null,
        inboxes_checked: r.inboxes_checked ?? null,
        outreach_sent: r.outreach_sent ?? null,
        respondents: r.respondents ?? null,
        inbound_icp_leads: r.inbound_icp_leads ?? null,
        followups_sent: r.followups_sent ?? null,
        new_conversations: r.new_conversations ?? null,
        conversations_nurtured: r.conversations_nurtured ?? null,
        calls_pitched: r.calls_pitched ?? null,
        inbound_bookings: r.inbound_bookings ?? null,
        outbound_bookings: r.outbound_bookings ?? null,
        offers_made: r.offers_made ?? null,
        revenue: r.revenue ?? null,
        setter_context: r.setter_context ?? null,
      }));
      const res = await apiClient.bulkImportKpiEntries(payload);
      setImportedCount(res.imported);
      onImported(res.entries || []);
      setPhase('done');
    } catch (err: unknown) {
      setError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Import failed'
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={handleClose} />
      <div className="relative w-full max-w-2xl rounded-xl border border-white/10 glass-card p-5 max-h-[85vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Import KPI history (CSV)
          </h3>
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            onClick={handleClose}
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-200">
            {error}
          </div>
        )}

        {phase === 'upload' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Upload past daily KPIs from a spreadsheet. Headers must match the KPI field names
              (same as the grid): <span className="font-mono text-[11px]">entry_date</span>,{' '}
              <span className="font-mono text-[11px]">total_followers</span>,{' '}
              <span className="font-mono text-[11px]">outreach_sent</span>, etc.
            </p>
            <button
              type="button"
              onClick={downloadKpiCsvTemplate}
              className="text-sm text-indigo-600 dark:text-indigo-300 hover:underline"
            >
              Download CSV template
            </button>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                dragActive
                  ? 'border-indigo-500 bg-indigo-500/5'
                  : 'border-white/20 hover:border-indigo-400'
              }`}
            >
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Drop a CSV here, or <span className="font-medium text-indigo-500">click to browse</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">Max 500 rows · date required</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </div>
          </div>
        )}

        {phase === 'preview' && result && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="px-2 py-1 rounded bg-green-500/10 text-green-700 dark:text-green-300">
                {result.rows.length} ready
              </span>
              {result.invalidCount > 0 && (
                <span className="px-2 py-1 rounded bg-red-500/10 text-red-700 dark:text-red-300">
                  {result.invalidCount} skipped (bad date)
                </span>
              )}
              {result.duplicateCount > 0 && (
                <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-800 dark:text-amber-200">
                  {result.duplicateCount} duplicate dates (kept last)
                </span>
              )}
            </div>
            {result.warnings.map((w) => (
              <p key={w} className="text-xs text-amber-600 dark:text-amber-300">
                {w}
              </p>
            ))}
            <div className="overflow-x-auto rounded border border-white/10 max-h-64">
              <table className="w-full text-xs min-w-[900px]">
                <thead className="bg-white/5 sticky top-0">
                  <tr>
                    {[
                      'entry_date',
                      'outreach_sent',
                      'new_conversations',
                      'conversations_nurtured',
                      'calls_pitched',
                      'inbound_bookings',
                      'outbound_bookings',
                      'offers_made',
                      'revenue',
                    ].map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left font-medium text-gray-500 font-mono">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {result.rows.slice(0, 50).map((r) => (
                    <tr key={r.entry_date}>
                      <td className="px-2 py-1">{r.entry_date}</td>
                      <td className="px-2 py-1">{r.outreach_sent ?? ''}</td>
                      <td className="px-2 py-1">{r.new_conversations ?? ''}</td>
                      <td className="px-2 py-1">{r.conversations_nurtured ?? ''}</td>
                      <td className="px-2 py-1">{r.calls_pitched ?? ''}</td>
                      <td className="px-2 py-1">{r.inbound_bookings ?? ''}</td>
                      <td className="px-2 py-1">{r.outbound_bookings ?? ''}</td>
                      <td className="px-2 py-1">{r.offers_made ?? ''}</td>
                      <td className="px-2 py-1">{r.revenue ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 50 && (
                <p className="text-[11px] text-gray-400 px-2 py-1">
                  Showing first 50 of {result.rows.length} rows
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setPhase('upload');
                  setResult(null);
                }}
                className="rounded border border-white/10 px-3 py-1.5 text-sm hover:bg-white/5"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!result.rows.length || importing}
                onClick={() => void handleImport()}
                className="rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-1.5 text-sm font-medium text-white"
              >
                {importing ? 'Importing…' : `Import ${result.rows.length} days`}
              </button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="space-y-4 text-center py-6">
            <p className="text-sm text-green-600 dark:text-green-300">
              Imported {importedCount} day{importedCount === 1 ? '' : 's'}.
            </p>
            <button
              type="button"
              onClick={handleClose}
              className="rounded bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-medium text-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
