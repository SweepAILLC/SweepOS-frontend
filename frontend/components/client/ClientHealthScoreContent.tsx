'use client';

import { useState, useEffect } from 'react';
import { Client } from '@/types/client';
import { ClientHealthScoreResponse } from '@/types/client';
import { apiClient } from '@/lib/api';

interface ClientHealthScoreContentProps {
  client: Client | null;
  /** When true, no heading row and tighter spacing (e.g. in side panel). */
  compact?: boolean;
}

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

export default function ClientHealthScoreContent({ client, compact = false }: ClientHealthScoreContentProps) {
  const [data, setData] = useState<ClientHealthScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client?.id) {
      setError(null);
      setLoading(true);
      setData(null);
      apiClient
        .getClientHealthScore(client.id)
        .then(setData)
        .catch((err) => {
          setError(err?.response?.data?.detail || err?.message || 'Failed to load health score');
        })
        .finally(() => setLoading(false));
    }
  }, [client?.id, client?.updated_at]);

  if (!client) return null;

  return (
    <div className={compact ? 'space-y-3' : 'border-t border-gray-200 dark:border-white/10 pt-6 space-y-4'}>
      {!compact && (
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Health Score</h3>
      )}
      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="w-6 h-6 border-2 border-gray-300 dark:border-gray-600 border-t-violet-500 rounded-full animate-spin" />
        </div>
      )}
      {error && (
        <div className="py-3 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs">
          {error}
        </div>
      )}
      {!loading && !error && data && (
        <>
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold tabular-nums ${scoreColor(data.score)}`}>
                {Math.round(data.score)}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">/ 100</span>
            </div>
            <span className={`text-lg font-semibold ${gradeColor(data.grade)}`}>
              Grade {data.grade}
            </span>
          </div>
          <div className="space-y-2">
            {data.factors.map((factor) => (
              <div
                key={factor.key}
                className="flex items-start justify-between gap-3 py-1.5 px-2.5 rounded-md bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100">
                    {factor.label}
                  </p>
                  {factor.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {factor.description}
                    </p>
                  )}
                </div>
                {factor.value !== undefined && factor.value !== null && (
                  <span className="flex-shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums ml-2">
                    {factor.unit === 'percent'
                      ? `${factor.value}%`
                      : factor.unit === 'days'
                        ? `${factor.value}d`
                        : String(factor.value)}
                  </span>
                )}
                {(factor.value === undefined || factor.value === null) && (
                  <span className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 ml-2">
                    N/A
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
