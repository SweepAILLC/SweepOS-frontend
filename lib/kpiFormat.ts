/**
 * KPI value formatting + benchmark trend helpers, shared by the Funnels
 * scorecard grid (and any future KPI table) so every metric formats and
 * colors its arrow the same way.
 */

export type KpiFormat = 'int' | 'usd' | 'pct' | 'ratio';
/** Which direction is good: costs are 'down', spend is 'neutral'. */
export type KpiBetter = 'up' | 'down' | 'neutral';

export function formatKpiValue(v: number | null | undefined, format: KpiFormat): string {
  if (v == null || Number.isNaN(v)) return '—';
  switch (format) {
    case 'usd':
      return `$${v.toLocaleString(undefined, { maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 })}`;
    case 'pct':
      return `${(v * 100).toFixed(1)}%`;
    case 'ratio':
      return `${v.toFixed(2)}×`;
    case 'int':
    default:
      return v.toLocaleString(undefined, { maximumFractionDigits: Number.isInteger(v) ? 0 : 1 });
  }
}

export type KpiTrend = 'up' | 'down' | 'flat';
type Trend = KpiTrend;

/** Direction of a value against its benchmark; null when either is missing. */
export function trendOf(value: number | null | undefined, benchmark: number | null | undefined): Trend | null {
  if (value == null || benchmark == null) return null;
  // Relative tolerance so float noise on ratios doesn't flip an arrow.
  const tol = Math.max(Math.abs(benchmark) * 0.005, 1e-9);
  if (value > benchmark + tol) return 'up';
  if (value < benchmark - tol) return 'down';
  return 'flat';
}

/** Green when the move is good for this metric, red when bad, grey when flat/neutral. */
export function trendClass(trend: Trend, better: KpiBetter): string {
  if (trend === 'flat' || better === 'neutral') return 'text-gray-400 dark:text-gray-500';
  const good = (trend === 'up') === (better === 'up');
  return good ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
}
