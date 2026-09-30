import { useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/lib/api';
import { Client, ClientBookingStatus, ClientGridDetail } from '@/types/client';
import { PIPELINE_COLUMNS } from '@/lib/pipelineColumns';
import LeadAnswersCell from '@/components/funnels/LeadAnswersCell';
import { channelLabel, useFunnelNames } from '@/lib/funnelNames';

type SortKey = 'name' | 'email' | 'phone' | 'stage' | 'channel' | 'created_at' | 'revenue' | 'booking';
type SortDir = 'asc' | 'desc';

const COLUMN_TITLE_BY_ID: Record<string, string> = Object.fromEntries(
  PIPELINE_COLUMNS.map((c) => [c.id, c.title]),
);

const UTM_KEYS = ['source', 'medium', 'campaign', 'term', 'content'] as const;

const BOOKING_BADGE: Record<Exclude<ClientBookingStatus, 'booked'>, { label: string; className: string }> = {
  not_yet: { label: 'Not yet', className: 'text-gray-500 dark:text-gray-400' },
  closed: {
    label: 'CLOSED',
    className: 'font-semibold text-green-700 dark:text-green-400',
  },
  canceled: {
    label: 'CANCELED',
    className: 'font-semibold text-amber-700 dark:text-amber-400',
  },
  no_show: {
    label: 'NO SHOW',
    className: 'font-semibold text-red-600 dark:text-red-400',
  },
};

function displayName(c: Client): string {
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  return c.email?.trim() || 'Unnamed client';
}

function bookingSortValue(detail?: ClientGridDetail): number {
  return detail?.booking_at ? Date.parse(detail.booking_at) || 0 : 0;
}

interface ClientGridViewProps {
  clients: Client[];
  onClientClick: (client: Client) => void;
  /** Board's delete handler (confirms, then removes optimistically). */
  onClientDelete?: (client: Client) => void;
}

/** Sortable table view over the same filtered pipeline data the Kanban board
 * reads. UTM, funnel metadata, and booking status come from one
 * `/clients/grid-details` call for the whole org, keyed by client id. */
export default function ClientGridView({ clients, onClientClick, onClientDelete }: ClientGridViewProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [details, setDetails] = useState<Record<string, ClientGridDetail>>({});
  const funnelNames = useFunnelNames();

  // Refetch when the client set grows/shrinks (new lead, delete), not on every re-render.
  const clientCount = clients.length;
  useEffect(() => {
    let cancelled = false;
    apiClient
      .getClientGridDetails()
      .then((rows) => {
        if (cancelled) return;
        setDetails(Object.fromEntries(rows.map((r) => [r.client_id, r])));
      })
      .catch(() => {
        /* grid still renders core columns without extras */
      });
    return () => {
      cancelled = true;
    };
  }, [clientCount]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  // A combined contact is one client row (backend merge keeps the oldest record
  // and folds the rest into `emails`); guard against an optimistic-merge race
  // briefly handing us the same id twice.
  const uniqueClients = useMemo(() => {
    const seen = new Set<string>();
    return clients.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
  }, [clients]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...uniqueClients].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return displayName(a).localeCompare(displayName(b)) * dir;
        case 'email':
          return (a.email || '').localeCompare(b.email || '') * dir;
        case 'phone':
          return (a.phone || '').localeCompare(b.phone || '') * dir;
        case 'stage':
          return (COLUMN_TITLE_BY_ID[a.lifecycle_state] || a.lifecycle_state).localeCompare(
            COLUMN_TITLE_BY_ID[b.lifecycle_state] || b.lifecycle_state,
          ) * dir;
        case 'channel':
          return channelLabel(a, funnelNames).localeCompare(channelLabel(b, funnelNames)) * dir;
        case 'revenue':
          return ((a.lifetime_revenue_cents ?? 0) - (b.lifetime_revenue_cents ?? 0)) * dir;
        case 'booking':
          return (bookingSortValue(details[a.id]) - bookingSortValue(details[b.id])) * dir;
        case 'created_at':
        default: {
          const am = a.created_at ? Date.parse(a.created_at) : 0;
          const bm = b.created_at ? Date.parse(b.created_at) : 0;
          return (am - bm) * dir;
        }
      }
    });
  }, [uniqueClients, sortKey, sortDir, details, funnelNames]);

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
    <th
      scope="col"
      className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 cursor-pointer select-none whitespace-nowrap"
      onClick={() => toggleSort(sortKeyName)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === sortKeyName ? (
          <span className="text-primary-500">{sortDir === 'asc' ? '↑' : '↓'}</span>
        ) : null}
      </span>
    </th>
  );

  const PlainHeader = ({ label, className = '' }: { label: string; className?: string }) => (
    <th
      scope="col"
      className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap ${className}`}
    >
      {label}
    </th>
  );

  if (clients.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/40 p-8 text-center text-sm text-gray-500 dark:text-gray-400">
        No clients match the current filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50/80 dark:bg-gray-900/60">
          <tr>
            <SortHeader label="Name" sortKeyName="name" />
            <SortHeader label="Email" sortKeyName="email" />
            <SortHeader label="Phone" sortKeyName="phone" />
            <SortHeader label="Stage" sortKeyName="stage" />
            <SortHeader label="Channel" sortKeyName="channel" />
            <SortHeader label="Created" sortKeyName="created_at" />
            <SortHeader label="Revenue" sortKeyName="revenue" />
            <SortHeader label="Booking" sortKeyName="booking" />
            <PlainHeader label="UTM" />
            <PlainHeader label="Metadata" className="min-w-[14rem]" />
            <PlainHeader label="" className="w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white/40 dark:bg-gray-950/30">
          {sorted.map((c) => {
            const detail = details[c.id];
            const isPaid = c.source_channel === 'paid';
            const utmEntries = isPaid && detail?.utm
              ? UTM_KEYS.filter((k) => detail.utm?.[k]).map((k) => [k, detail.utm![k]!] as const)
              : [];
            const status = detail?.booking_status;
            return (
              <tr
                key={c.id}
                onClick={() => onClientClick(c)}
                className="cursor-pointer hover:bg-primary-500/5 transition-colors"
              >
                <td className="px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 min-w-0 max-w-[220px] truncate">
                  {displayName(c)}
                </td>
                <td
                  className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 max-w-[240px] truncate"
                  title={c.email || undefined}
                >
                  {/* Primary email only — merged-in addresses stay on the profile, not the grid */}
                  {c.email?.trim() || '—'}
                </td>
                <td
                  className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums"
                  title={c.phone || undefined}
                >
                  {c.phone?.trim() || '—'}
                </td>
                <td className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {COLUMN_TITLE_BY_ID[c.lifecycle_state] || c.lifecycle_state}
                </td>
                <td className="px-3 py-2 text-sm whitespace-nowrap">
                  <span
                    title={isPaid ? `Paid · ${channelLabel(c, funnelNames)}` : 'Organic'}
                    className={`inline-block max-w-[12rem] truncate align-middle text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${
                      isPaid
                        ? 'border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-300'
                        : 'border-gray-300/60 bg-gray-500/10 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {channelLabel(c, funnelNames)}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2 text-sm font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">
                  {c.lifetime_revenue_cents ? `$${(c.lifetime_revenue_cents / 100).toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-2 text-sm whitespace-nowrap">
                  {!status ? (
                    <span className="text-gray-400">—</span>
                  ) : status === 'booked' ? (
                    <span className="text-gray-700 dark:text-gray-300">
                      {detail?.booking_at ? new Date(detail.booking_at).toLocaleDateString() : '—'}
                    </span>
                  ) : (
                    <span className={BOOKING_BADGE[status].className}>{BOOKING_BADGE[status].label}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 align-top">
                  {utmEntries.length > 0 ? (
                    <dl className="space-y-0.5 max-w-[14rem]">
                      {utmEntries.map(([k, v]) => (
                        <div key={k} className="flex gap-1 min-w-0">
                          <dt className="shrink-0 text-gray-500 dark:text-gray-400">{k}:</dt>
                          <dd className="truncate" title={v}>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </td>
                <td
                  className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 align-top"
                  onClick={(e) => e.stopPropagation()}
                >
                  <LeadAnswersCell answers={detail?.answers} />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {onClientDelete ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClientDelete(c);
                      }}
                      className="text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                      Delete
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
