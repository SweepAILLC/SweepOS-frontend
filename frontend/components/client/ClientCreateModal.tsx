'use client';

import { useState, useCallback, useRef, type DragEvent } from 'react';
import { PIPELINE_COLUMNS, type PipelineColumnId } from '@/lib/pipelineColumns';
import { apiClient } from '@/lib/api';
import { parseCsvFile, downloadCsvTemplate, type CsvImportRow, type CsvParseResult } from '@/lib/clientCsvImport';
import type { Client } from '@/types/client';
import { normalizeLifecycleColumn } from '@/lib/pipelineColumns';

interface ClientCreateModalProps {
  onClose: () => void;
  onClientCreated: (client: Client) => void;
  onImportComplete: () => void;
}

type Tab = 'single' | 'csv';

type ImportPhase = 'upload' | 'preview' | 'importing' | 'results';

interface ImportResult {
  created_count: number;
  updated_count: number;
  skipped_count: number;
  failed_count: number;
  failed_rows: Array<{ row_index: number; email?: string; error: string }>;
  lifecycle_adjusted_count: number;
}

const COLUMNS = PIPELINE_COLUMNS;

export default function ClientCreateModal({
  onClose,
  onClientCreated,
  onImportComplete,
}: ClientCreateModalProps) {
  const [tab, setTab] = useState<Tab>('single');

  // ── Single create state ──
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    instagram: '',
    lifecycle_state: 'qualified' as PipelineColumnId,
    notes: '',
  });
  const [creating, setCreating] = useState(false);

  // ── CSV import state ──
  const [importPhase, setImportPhase] = useState<ImportPhase>('upload');
  const [csvResult, setCsvResult] = useState<CsvParseResult | null>(null);
  const [defaultColumn, setDefaultColumn] = useState<PipelineColumnId>('qualified');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Single create handlers ──

  const handleCreateClient = async () => {
    if (!formData.first_name && !formData.last_name && !formData.email) {
      alert('Please provide at least a name or email');
      return;
    }
    setCreating(true);
    try {
      const clientData = {
        first_name: formData.first_name || undefined,
        last_name: formData.last_name || undefined,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        instagram: formData.instagram || undefined,
        lifecycle_state: formData.lifecycle_state,
        notes: formData.notes || undefined,
      };
      const newClient = await apiClient.createClient(clientData);
      const created: Client = {
        ...newClient,
        lifecycle_state:
          normalizeLifecycleColumn(newClient.lifecycle_state) ?? formData.lifecycle_state,
      };
      onClientCreated(created);
    } catch (error: any) {
      console.error('Failed to create client:', error);
      alert(error?.response?.data?.detail || 'Failed to create client. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  // ── CSV handlers ──

  const handleFile = useCallback(async (file: File) => {
    setCsvError(null);
    setFileName(file.name);
    try {
      const result = await parseCsvFile(file);
      setCsvResult(result);
      setImportPhase('preview');
    } catch (err: any) {
      setCsvError(err?.message || 'Failed to parse CSV file.');
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
        handleFile(file);
      } else {
        setCsvError('Please drop a .csv file.');
      }
    },
    [handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleImport = async () => {
    if (!csvResult || csvResult.rows.length === 0) return;
    setImporting(true);
    setImportPhase('importing');
    try {
      const result = await apiClient.importClients({
        rows: csvResult.rows,
        default_pipeline_column: defaultColumn,
        run_lifecycle_reconcile: true,
        source_filename: fileName ?? undefined,
      });
      setImportResult(result);
      setImportPhase('results');
    } catch (err: any) {
      setCsvError(err?.response?.data?.detail || err?.message || 'Import failed.');
      setImportPhase('preview');
    } finally {
      setImporting(false);
    }
  };

  const handleDismissResults = () => {
    onImportComplete();
    onClose();
  };

  const resetCsv = () => {
    setCsvResult(null);
    setCsvError(null);
    setImportResult(null);
    setImportPhase('upload');
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Render ──

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:glass-card rounded-lg shadow-lg border border-gray-200 dark:border-white/10 neon-glow p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-white/10 mb-4">
          <button
            type="button"
            onClick={() => setTab('single')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'single'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Single Client
          </button>
          <button
            type="button"
            onClick={() => setTab('csv')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === 'csv'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Import CSV
          </button>
        </div>

        {/* ── TAB: Single Client ── */}
        {tab === 'single' && (
          <>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Create New Client</h3>
            <div className="space-y-4">
              <Field label="First Name">
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="John"
                />
              </Field>
              <Field label="Last Name">
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Doe"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="john@example.com"
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="+1 (555) 123-4567"
                />
              </Field>
              <Field label="Instagram">
                <input
                  type="text"
                  value={formData.instagram}
                  onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="@username"
                />
              </Field>
              <Field label="Pipeline column">
                <select
                  value={formData.lifecycle_state}
                  onChange={(e) =>
                    setFormData({ ...formData, lifecycle_state: e.target.value as PipelineColumnId })
                  }
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>{col.title}</option>
                  ))}
                </select>
              </Field>
              <Field label="Notes">
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  rows={3}
                  placeholder="Additional notes about this client..."
                />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="glass-button-secondary px-4 py-2 text-sm font-medium rounded-md hover:bg-white/20"
                disabled={creating}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateClient}
                disabled={creating}
                className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </>
        )}

        {/* ── TAB: Import CSV ── */}
        {tab === 'csv' && (
          <>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Import Clients from CSV</h3>

            {csvError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200 flex items-center justify-between">
                <span>{csvError}</span>
                <button type="button" className="text-xs underline ml-2" onClick={() => setCsvError(null)}>
                  Dismiss
                </button>
              </div>
            )}

            {/* Upload phase */}
            {importPhase === 'upload' && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={downloadCsvTemplate}
                  className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
                >
                  Download CSV template
                </button>

                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
                    dragActive
                      ? 'border-primary-500 bg-primary-500/5'
                      : 'border-gray-300 dark:border-white/20 hover:border-primary-400'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Drop a CSV file here, or <span className="text-primary-600 dark:text-primary-400 font-medium">click to browse</span>
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Maximum 500 rows per import</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={onClose}
                    className="glass-button-secondary px-4 py-2 text-sm font-medium rounded-md hover:bg-white/20"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Preview phase */}
            {importPhase === 'preview' && csvResult && (
              <div className="space-y-4">
                {/* Stats bar */}
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="px-2 py-1 rounded bg-green-500/10 text-green-700 dark:text-green-300">
                    {csvResult.rows.length} valid
                  </span>
                  {csvResult.invalidCount > 0 && (
                    <span className="px-2 py-1 rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-300">
                      {csvResult.invalidCount} skipped (no email)
                    </span>
                  )}
                  {csvResult.duplicateCount > 0 && (
                    <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-700 dark:text-blue-300">
                      {csvResult.duplicateCount} duplicate(s) merged
                    </span>
                  )}
                </div>

                {csvResult.warnings.length > 0 && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-800 dark:text-yellow-200">
                    {csvResult.warnings.map((w, i) => <div key={i}>{w}</div>)}
                  </div>
                )}

                {/* Column mapping */}
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-medium">Mapped columns: </span>
                  {Object.entries(csvResult.headerMapping).map(([csv, field]) => (
                    <span key={csv} className="inline-block mr-2">
                      {csv} → {field}
                    </span>
                  ))}
                </div>

                {/* Default pipeline column */}
                <Field label="Default pipeline column">
                  <select
                    value={defaultColumn}
                    onChange={(e) => setDefaultColumn(e.target.value as PipelineColumnId)}
                    className="w-full px-3 py-2 glass-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {COLUMNS.map((col) => (
                      <option key={col.id} value={col.id}>{col.title}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    Rows without a pipeline_column value will land here. Existing clients keep their current column.
                  </p>
                </Field>

                {/* Preview table */}
                <div className="overflow-x-auto rounded border border-gray-200 dark:border-white/10">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-white/5">
                        <th className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Email</th>
                        <th className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Name</th>
                        <th className="px-2 py-1 text-left font-medium text-gray-600 dark:text-gray-400">Column</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                      {csvResult.rows.slice(0, 8).map((row, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 text-gray-800 dark:text-gray-200 truncate max-w-[180px]">{row.email}</td>
                          <td className="px-2 py-1 text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                            {[row.first_name, row.last_name].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="px-2 py-1 text-gray-600 dark:text-gray-400">
                            {row.pipeline_column
                              ? COLUMNS.find((c) => c.id === row.pipeline_column)?.title ?? row.pipeline_column
                              : <span className="italic">default</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvResult.rows.length > 8 && (
                    <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 text-center bg-gray-50 dark:bg-white/5">
                      …and {csvResult.rows.length - 8} more rows
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex justify-between">
                  <button
                    onClick={resetCsv}
                    className="glass-button-secondary px-4 py-2 text-sm font-medium rounded-md hover:bg-white/20"
                  >
                    Back
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={onClose}
                      className="glass-button-secondary px-4 py-2 text-sm font-medium rounded-md hover:bg-white/20"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={csvResult.rows.length === 0}
                      className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50"
                    >
                      Import {csvResult.rows.length} Client{csvResult.rows.length !== 1 ? 's' : ''}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Importing phase */}
            {importPhase === 'importing' && (
              <div className="py-12 text-center">
                <svg className="mx-auto h-8 w-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                  Importing {csvResult?.rows.length ?? 0} clients…
                </p>
              </div>
            )}

            {/* Results phase */}
            {importPhase === 'results' && importResult && (
              <div className="space-y-4">
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">Import complete</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <StatCard label="Created" value={importResult.created_count} color="green" />
                  <StatCard label="Updated" value={importResult.updated_count} color="blue" />
                  <StatCard label="Skipped" value={importResult.skipped_count} color="yellow" />
                  <StatCard label="Failed" value={importResult.failed_count} color="red" />
                </div>

                {importResult.lifecycle_adjusted_count > 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {importResult.lifecycle_adjusted_count} client(s) adjusted by lifecycle rules (e.g. paid → Active).
                  </p>
                )}

                {importResult.failed_rows.length > 0 && (
                  <div className="rounded border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300 max-h-32 overflow-y-auto">
                    {importResult.failed_rows.map((f, i) => (
                      <div key={i}>Row {f.row_index + 1}{f.email ? ` (${f.email})` : ''}: {f.error}</div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleDismissResults}
                    className="glass-button neon-glow px-4 py-2 text-sm font-medium rounded-md"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-500/10 text-green-700 dark:text-green-300',
    blue: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    yellow: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300',
    red: 'bg-red-500/10 text-red-700 dark:text-red-300',
  };
  return (
    <div className={`rounded-lg px-3 py-2 ${colorMap[color] ?? ''}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}
