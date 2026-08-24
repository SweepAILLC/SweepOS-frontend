'use client';

import { useState, useEffect } from 'react';
import { Client } from '@/types/client';
import { ClientHealthScoreResponse } from '@/types/client';
import { apiClient } from '@/lib/api';

interface ClientHealthScoreContentProps {
  client: Client | null;
  compact?: boolean;
  /** Drawer layout: smaller ring, no per-factor rows. */
  engagementStrip?: boolean;
  /** When false, hide formula/AI factor breakdown cards (drawer engagement strip). */
  showFactors?: boolean;
  refreshToken?: number;
  useAi?: boolean;
  /** Called after a successful score load so the parent can sync board tags. */
  onScoreLoaded?: (clientId: string, score: number, grade: string) => void;
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

/** Map backend source_reason to short user-facing text when AI/Fathom isn’t used */
function sourceReasonLabel(reason: string | null | undefined): string {
  if (!reason) return '';
  const map: Record<string, string> = {
    fathom_not_configured: 'Fathom API not set — using formula score',
    ai_unavailable: 'LLM not configured — using formula score',
    ai_disabled: 'AI health score disabled — using formula score',
    ai_failed: 'AI unavailable — using formula score',
    ai_error: 'AI error — using formula score',
  };
  return map[reason] || reason;
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 65) return 'text-blue-600 dark:text-blue-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  if (score >= 35) return 'text-orange-600 dark:text-orange-400';
  return 'text-red-600 dark:text-red-400';
}

function ringStrokeClass(score: number): string {
  if (score >= 80) return 'stroke-emerald-500 dark:stroke-emerald-400';
  if (score >= 65) return 'stroke-blue-500 dark:stroke-blue-400';
  if (score >= 50) return 'stroke-amber-500 dark:stroke-amber-400';
  if (score >= 35) return 'stroke-orange-500 dark:stroke-orange-400';
  return 'stroke-red-500 dark:stroke-red-400';
}

function HealthScoreCircle({
  score,
  grade,
  compact = false,
  engagementStrip = false,
}: {
  score: number;
  grade: string;
  compact?: boolean;
  engagementStrip?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, score)) / 100;
  const size = engagementStrip ? 80 : compact ? 96 : 128;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Health score ${Math.round(score)} out of 100, grade ${grade}`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          className="stroke-gray-200 dark:stroke-gray-600"
          strokeWidth={stroke}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          className={ringStrokeClass(score)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span
          className={`${
            engagementStrip ? 'text-2xl' : compact ? 'text-3xl' : 'text-4xl'
          } font-bold leading-none ${gradeColor(grade)}`}
        >
          {grade}
        </span>
        <span
          className={`${
            engagementStrip ? 'text-[9px]' : compact ? 'text-[10px]' : 'text-[11px]'
          } font-medium tabular-nums mt-0.5 ${scoreColor(score)}`}
        >
          {Math.round(score)}
        </span>
      </div>
    </div>
  );
}

export default function ClientHealthScoreContent({
  client,
  compact = false,
  engagementStrip = false,
  showFactors = true,
  refreshToken = 0,
  useAi = true,
  onScoreLoaded,
}: ClientHealthScoreContentProps) {
  const [data, setData] = useState<ClientHealthScoreResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (client?.id) {
      setError(null);
      setLoading(true);
      setData(null);
      const cid = client.id;
      apiClient
        .getClientHealthScore(cid, { useAi })
        .then((res) => {
          setData(res);
          if (res?.score != null && res?.grade && onScoreLoaded) {
            onScoreLoaded(cid, res.score, res.grade);
          }
        })
        .catch((err) => {
          setError(err?.response?.data?.detail || err?.message || 'Failed to load health score');
        })
        .finally(() => setLoading(false));
    }
  }, [client?.id, client?.updated_at, refreshToken, useAi]);

  if (!client) return null;

  return (
    <div
      className={
        compact || engagementStrip
          ? 'space-y-3'
          : 'border-t border-gray-200 dark:border-white/10 pt-6 space-y-4'
      }
    >
      {!compact && !engagementStrip && (
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Health Score</h3>
      )}
      {engagementStrip && (
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Engagement</h3>
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
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 sm:items-start">
            <HealthScoreCircle
              score={data.score}
              grade={data.grade}
              compact={compact}
              engagementStrip={engagementStrip}
            />
            <div className="min-w-0 flex-1 space-y-3">
              {data.explanation && (
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed border-l-2 border-violet-400/60 pl-2">
                  {data.explanation}
                </p>
              )}
              {data.source && (
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  Score source: {data.source}
                  {data.source_reason ? ` — ${sourceReasonLabel(data.source_reason)}` : ''}
                </p>
              )}
              {showFactors && (
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
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
