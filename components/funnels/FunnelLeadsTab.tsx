import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { FunnelLeadListItem } from '@/types/funnel';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getPipelineStageTitle } from '@/lib/pipelineColumns';

interface FunnelLeadsTabProps {
  funnelId: string;
}

function displayName(lead: FunnelLeadListItem): string {
  if (lead.name && lead.name.trim()) return lead.name.trim();
  const parts = [lead.first_name, lead.last_name].filter(
    (p): p is string => Boolean(p && String(p).trim())
  );
  if (parts.length) return parts.join(' ');
  if (lead.email) return lead.email;
  if (lead.phone) return lead.phone;
  if (lead.instagram) return lead.instagram;
  return 'Unknown lead';
}

function formatCapturedAt(value?: string | null): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function formatAnswerValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function answerEntries(
  answers?: Record<string, unknown> | null
): Array<[string, string]> {
  if (!answers || typeof answers !== 'object') return [];
  return Object.entries(answers)
    .filter(([k, v]) => k && v != null && String(v).trim() !== '')
    .map(([k, v]) => [String(k), formatAnswerValue(v)]);
}

function AnswersCell({ answers }: { answers?: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);
  const entries = answerEntries(answers);
  if (entries.length === 0) {
    return <span>—</span>;
  }
  const compact = entries.map(([k, v]) => ).join(' · ');
  const canExpand = entries.length > 1 || compact.length > 80;

  return (
    <div className={expanded ? 'max-w-xl' : 'max-w-md'}>
      {expanded ? (
        <dl className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {entries.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {k}
              </dt>
              <dd className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="line-clamp-3 break-words" title={compact}>
          {compact}
        </span>
      )}
      {canExpand && (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          aria-expanded={expanded}
          className="mt-1 block text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export default function FunnelLeadsTab({ funnelId }: FunnelLeadsTabProps) {
  const [leads, setLeads] = useState<FunnelLeadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmLead, setConfirmLead] = useState<FunnelLeadListItem | null>(null);

  const loadLeads = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiClient.getFunnelLeads(funnelId);
      setLeads(data?.leads ?? []);
      setTotal(data?.total ?? 0);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(
        message || (err instanceof Error ? err.message : 'Failed to load leads')
      );
      setLeads([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLeads();
  }, [funnelId]);

  const handleDelete = async () => {
    if (!confirmLead?.id) return;
    const leadId = confirmLead.id;
    try {
      setDeletingId(leadId);
      setError(null);
      await apiClient.deleteFunnelLead(funnelId, leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
      setTotal((t) => Math.max(0, t - 1));
      setConfirmLead(null);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(message || (err instanceof Error ? err.message : 'Failed to delete lead'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading && leads.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" />
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading leads...</p>
      </div>
    );
  }

  if (error && leads.length === 0) {
    return (
      <div className="glass-card p-4 border-red-400/40">
        <p className="text-red-800 dark:text-red-200">Error: {error}</p>
        <button
          type="button"
          onClick={() => void loadLeads()}
          className="mt-2 text-red-600 dark:text-red-300 hover:text-red-200 underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {total === 0
            ? 'No leads have come in through this funnel yet.'
            : `${total} lead${total === 1 ? '' : 's'}`}
        </p>
        <button
          type="button"
          onClick={() => void loadLeads()}
          disabled={loading}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {leads.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Leads submitted via this funnel’s forms will show up here.
          </p>
        </div>
      ) : (
        <div className="glass-card overflow-x-auto">
          <table className="min-w-full text-sm text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 font-medium whitespace-nowrap">Name</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Email</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Phone</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Instagram</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Pipeline</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Source</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Captured</th>
                <th className="px-4 py-3 font-medium min-w-[14rem]">Answers / metadata</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap w-20"> </th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-white/5 last:border-0 hover:bg-white/5"
                >
                  <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium whitespace-nowrap">
                    {displayName(lead)}
                    {lead.is_new_client === false && (
                      <span className="ml-2 text-[10px] uppercase text-amber-600 dark:text-amber-300">
                        Returning
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {lead.email ? (
                      <a href={`mailto:${lead.email}`} className="hover:underline">
                        {lead.email}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {lead.phone ? (
                      <a href={`tel:${lead.phone}`} className="hover:underline">
                        {lead.phone}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {lead.instagram || '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex items-center rounded-md bg-gray-500/10 px-2 py-0.5 text-xs font-medium text-gray-800 dark:text-gray-200">
                      {getPipelineStageTitle(lead.lifecycle_state)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                    {lead.source || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {formatCapturedAt(lead.captured_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300 align-top">
                    <AnswersCell answers={lead.answers} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setConfirmLead(lead)}
                      disabled={deletingId === lead.id}
                      className="text-sm text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
                    >
                      {deletingId === lead.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmLead != null}
        onClose={() => {
          if (!deletingId) setConfirmLead(null);
        }}
        title="Remove from funnel leads?"
        description={
          confirmLead
            ? `“${displayName(confirmLead)}” will be hidden from this funnel’s leads list. They stay on the pipeline board in ${getPipelineStageTitle(confirmLead.lifecycle_state)}.`
            : undefined
        }
        confirmLabel="Delete"
        variant="danger"
        busy={Boolean(deletingId)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
