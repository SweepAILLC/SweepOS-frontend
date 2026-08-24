'use client';

import { Fragment, useState, useEffect } from 'react';
import { Transition } from '@headlessui/react';
import { Client } from '@/types/client';
import { ClientHealthScoreResponse } from '@/types/client';
import { apiClient } from '@/lib/api';

interface ClientHealthScoreDrawerProps {
  client: Client | null;
  isOpen: boolean;
  onClose: () => void;
}

/** Grade color for quick scan */
function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-emerald-600 dark:text-emerald-400';
    case 'B': return 'text-blue-600 dark:text-blue-400';
    case 'C': return 'text-amber-600 dark:text-amber-400';
    case 'D': return 'text-orange-600 dark:text-orange-400';
    case 'F': return 'text-red-600 dark:text-red-400';
    default: return 'text-gray-600 dark:text-gray-400';
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 65) return 'text-blue-600 dark:text-blue-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  if (score >= 35) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

export default function ClientHealthScoreDrawer({
  client,
  isOpen,
  onClose,
}: ClientHealthScoreDrawerProps) {
  const [data, setData] = useState<ClientHealthScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && client?.id) {
      setError(null);
      setLoading(true);
      setData(null);
      apiClient
        .getClientHealthScore(client.id, { useAi: true })
        .then((res) => {
          setData(res);
        })
        .catch((err) => {
          setError(err?.response?.data?.detail || err?.message || 'Failed to load health score');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, client?.id, client?.updated_at]);

  if (!isOpen) return null;

  return (
    <Transition
      show={isOpen}
      as={Fragment}
      enter="ease-out duration-300"
      enterFrom="translate-y-full opacity-0"
      enterTo="translate-y-0 opacity-100"
      leave="ease-in duration-200"
      leaveFrom="translate-y-0 opacity-100"
      leaveTo="translate-y-full opacity-0"
    >
      <div
        className="fixed inset-x-0 bottom-0 z-[70] max-h-[min(70dvh,32rem)] landscape:max-h-[min(85dvh,28rem)] flex flex-col rounded-t-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-b-0 shadow-2xl pb-[env(safe-area-inset-bottom,0px)]"
        role="dialog"
        aria-label="Client health score"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-12 h-1 rounded-full bg-gray-300 dark:bg-gray-600"
            aria-label="Close"
          />
        </div>

        <div className="px-4 pb-6 pt-2 overflow-y-auto overscroll-contain flex-1 min-h-0">
          <div className="flex items-center justify-between mb-4 gap-2 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 min-w-0 truncate">
              Health Score
              {client && (
                <span className="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400">
                  {client.first_name} {client.last_name}
                </span>
              )}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors flex-shrink-0"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-blue-600 rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="py-4 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {!loading && !error && data && (
            <>
              <div className="flex flex-wrap items-center gap-4 sm:gap-6 mb-6">
                <div className="flex items-baseline gap-2">
                  <span className={`text-3xl sm:text-4xl font-bold tabular-nums ${scoreColor(data.score)}`}>
                    {Math.round(data.score)}
                  </span>
                  <span className="text-base sm:text-lg text-gray-500 dark:text-gray-400">/ 100</span>
                </div>
                <span className={`text-xl sm:text-2xl font-semibold ${gradeColor(data.grade)}`}>
                  Grade {data.grade}
                </span>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Factors (AI-ready for referrals, testimonials, retention, upsells)
                </p>
                {data.factors.map((factor) => (
                  <div
                    key={factor.key}
                    className="flex items-start justify-between gap-3 sm:gap-4 py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {factor.label}
                      </p>
                      {factor.description && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                          {factor.description}
                        </p>
                      )}
                    </div>
                    {factor.value !== undefined && factor.value !== null && (
                      <span className="flex-shrink-0 text-sm font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                        {factor.unit === 'percent'
                          ? `${factor.value}%`
                          : factor.unit === 'days'
                            ? `${factor.value}d`
                            : factor.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Transition>
  );
}
