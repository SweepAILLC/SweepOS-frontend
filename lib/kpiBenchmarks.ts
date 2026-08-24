/**
 * KPI benchmark tier helpers + RAG cell shading.
 * Mirrors backend/app/services/kpi_compute.py classify_tier.
 */
import type { KpiDailyEntry, KpiTier, MetricThreshold } from '@/types/kpi';

export const METRIC_TO_THRESHOLD: Record<string, string> = {
  outreach_sent: 'daily_dm_reachouts',
  followups_sent: 'daily_followups',
  outreach_reply_pct: 'dm_response_rate',
  convo_to_booking_pct: 'convo_to_booking_rate',
  show_up_pct: 'show_up_rate',
  closing_rate_pct: 'closing_rate',
};

/** Target band = okay_min … strong_min. Below = weak; at/above strong_min = strong. */
export const DEFAULT_THRESHOLDS: Record<string, MetricThreshold> = {
  daily_dm_reachouts: { strong_min: 30, okay_min: 20, unit: 'count' },
  daily_followups: { strong_min: 20, okay_min: 10, unit: 'count' },
  dm_response_rate: { strong_min: 20, okay_min: 3, unit: 'percent' },
  convo_to_booking_rate: { strong_min: 20, okay_min: 10, unit: 'percent' },
  show_up_rate: { strong_min: 100, okay_min: 70, unit: 'percent' },
  closing_rate: { strong_min: 60, okay_min: 30, unit: 'percent' },
};

export function classifyTier(
  value: number | null | undefined,
  threshold: MetricThreshold | undefined
): KpiTier | null {
  if (value == null || !threshold || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  if (v >= threshold.strong_min) return 'strong';
  if (v >= threshold.okay_min) return 'okay';
  return 'weak';
}

export function tierForMetric(
  metric: string,
  value: number | null | undefined,
  thresholds: Record<string, MetricThreshold>
): KpiTier | null {
  const key = METRIC_TO_THRESHOLD[metric];
  if (!key) return null;
  return classifyTier(value, thresholds[key] ?? DEFAULT_THRESHOLDS[key]);
}

/** Tailwind classes for cell background (match calendarBookingStatus opacity pattern). */
export function kpiTierCellClass(tier: KpiTier | null | undefined): string {
  switch (tier) {
    case 'strong':
      return 'bg-green-500/15 text-green-900 dark:text-green-200';
    case 'okay':
      return 'bg-amber-500/15 text-amber-900 dark:text-amber-200';
    case 'weak':
      return 'bg-red-500/15 text-red-900 dark:text-red-200';
    default:
      return '';
  }
}

export function kpiTierDotClass(tier: KpiTier | null | undefined): string {
  switch (tier) {
    case 'strong':
      return 'bg-green-500';
    case 'okay':
      return 'bg-amber-400';
    case 'weak':
      return 'bg-red-500';
    default:
      return 'bg-gray-300 dark:bg-gray-600';
  }
}

export function kpiTierBadgeClass(tier: KpiTier | null | undefined): string {
  switch (tier) {
    case 'strong':
      return 'bg-green-500/15 text-green-800 dark:text-green-200 border border-green-400/30';
    case 'okay':
      return 'bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-400/30';
    case 'weak':
      return 'bg-red-500/15 text-red-800 dark:text-red-200 border border-red-400/30';
    default:
      return 'bg-white/5 text-gray-500 border border-white/10';
  }
}

/**
 * Map a metric value onto a 0–2 continuum using its okay/strong range:
 * 0..1 = below okay_min, 1..2 = okay→strong band, 2 = at/above strong_min.
 */
export function metricRangeScore(
  value: number | null | undefined,
  threshold: MetricThreshold | undefined
): number | null {
  if (value == null || !threshold || Number.isNaN(Number(value))) return null;
  const v = Number(value);
  const okay = Number(threshold.okay_min);
  const strong = Number(threshold.strong_min);
  if (Number.isNaN(okay) || Number.isNaN(strong)) return null;
  if (v >= strong) return 2;
  if (v >= okay) {
    const span = strong - okay || 1;
    return 1 + (v - okay) / span;
  }
  if (okay <= 0) return 0;
  return Math.max(0, Math.min(1, v / okay));
}

function tierFromAverageScore(avg: number): KpiTier {
  if (avg >= 1.5) return 'strong';
  if (avg >= 0.75) return 'okay';
  return 'weak';
}

const OVERALL_DAY_METRICS = [
  'outreach_sent',
  'followups_sent',
  'outreach_reply_pct',
  'convo_to_booking_pct',
  'show_up_pct',
  'closing_rate_pct',
] as const;

/** Average of primary metrics' range scores — used for calendar "Overall day" color. */
export function overallDayTier(
  entry: KpiDailyEntry | undefined,
  thresholds: Record<string, MetricThreshold>
): KpiTier | null {
  if (!entry) return null;
  const scores: number[] = [];
  for (const metric of OVERALL_DAY_METRICS) {
    const key = METRIC_TO_THRESHOLD[metric];
    if (!key) continue;
    const score = metricRangeScore(
      entry[metric] as number | null,
      thresholds[key] ?? DEFAULT_THRESHOLDS[key]
    );
    if (score == null) continue;
    scores.push(score);
  }
  if (scores.length === 0) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return tierFromAverageScore(avg);
}

export function formatKpiValue(
  value: number | boolean | string | null | undefined,
  kind: 'int' | 'pct' | 'currency' | 'bool' | 'text' = 'int'
): string {
  if (value == null || value === '') return '—';
  if (kind === 'bool') return value ? 'Yes' : 'No';
  if (kind === 'text') return String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  if (kind === 'pct') return `${n.toFixed(n % 1 === 0 ? 0 : 1)}%`;
  if (kind === 'currency') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(n);
  }
  return String(Math.round(n));
}

/** Deep-link targets for bottleneck related_feature. */
export const KPI_RELATED_FEATURE_HREF: Record<string, string> = {
  content_studio: '/?tab=content_studio',
  automations: '/?tab=automations',
  call_library: '/?tab=call_library',
};

export const KPI_RELATED_FEATURE_LABEL: Record<string, string> = {
  content_studio: 'Marketing Intel',
  automations: 'Automations (Pre-call)',
  call_library: 'Call Library',
};
