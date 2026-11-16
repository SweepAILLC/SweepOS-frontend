import { useEffect } from 'react';
import { Client } from '@/types/client';
import { useFunnelNames } from '@/lib/funnelNames';
import { buildSpeedToLeadReport, formatSpeed } from '@/lib/speedToLead';

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

export default function SpeedToLeadModal({
  clients,
  onClose,
}: {
  clients: Client[];
  onClose: () => void;
}) {
  const funnelNames = useFunnelNames();
  const report = buildSpeedToLeadReport(clients, funnelNames);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="speed-to-lead-title"
        className="glass-card w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="speed-to-lead-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Speed to lead
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Speed to lead is created to dial. Dial to close is paid dials divided by total dials.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Total dials</dt>
            <dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{report.dials}</dd>
          </div>
          <div className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Average</dt>
            <dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {report.averageSeconds == null ? '—' : formatSpeed(report.averageSeconds)}
            </dd>
          </div>
          <div className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Median</dt>
            <dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {report.medianSeconds == null ? '—' : formatSpeed(report.medianSeconds)}
            </dd>
          </div>
          <div className="rounded-md border border-gray-200 px-3 py-2 dark:border-gray-700">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">Fastest</dt>
            <dd className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {report.fastestSeconds == null ? '—' : formatSpeed(report.fastestSeconds)}
            </dd>
          </div>
        </dl>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Dial to close
        </h3>
        <p className="mt-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
          {report.dialToClosePercent == null ? '—' : formatPercent(report.dialToClosePercent)}
          <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
            {report.paidDials} of {report.dials} dials paid
          </span>
        </p>

        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Dialled by channel
        </h3>
        {report.channels.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">No leads on the board yet.</p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <th className="py-1 pr-2 font-semibold">Channel</th>
                <th className="py-1 pr-2 font-semibold">Dialled</th>
                <th className="py-1 pr-2 font-semibold">Of leads</th>
                <th className="py-1 pr-2 font-semibold">Avg speed</th>
                <th className="py-1 font-semibold">Dial to close</th>
              </tr>
            </thead>
            <tbody>
              {report.channels.map((row) => (
                <tr key={row.channel} className="border-t border-gray-200 dark:border-gray-700">
                  <td className="py-2 pr-2 text-gray-900 dark:text-gray-100">{row.channel}</td>
                  <td className="py-2 pr-2 tabular-nums text-gray-700 dark:text-gray-300">
                    {row.dialed}/{row.leads}
                  </td>
                  <td className="py-2 pr-2 tabular-nums text-gray-700 dark:text-gray-300">{formatPercent(row.percent)}</td>
                  <td className="py-2 pr-2 tabular-nums text-gray-700 dark:text-gray-300">
                    {row.averageSeconds == null ? '—' : formatSpeed(row.averageSeconds)}
                  </td>
                  <td className="py-2 tabular-nums text-gray-700 dark:text-gray-300">
                    {row.dialToClosePercent == null ? '—' : formatPercent(row.dialToClosePercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
