/** SVG funnel path for N pipeline segments (shared by Pipeline tab + Terminal mini chart). */
export function buildPipelineFunnelPath(heightsPct: number[]): string {
  const segmentCount = heightsPct.length;
  if (segmentCount === 0) return '';

  const CENTER = 50;
  const MAX_AMP = segmentCount > 5 ? 45 : 40;
  const segmentWidth = 100 / segmentCount;
  const xs = Array.from({ length: segmentCount + 1 }, (_, i) => i * segmentWidth);
  const dx = segmentWidth / 3;
  const amps = heightsPct.map((h) => (h / 100) * MAX_AMP);
  const lastAmp = amps[amps.length - 1] ?? 0;

  let d = `M 0 ${CENTER - (amps[0] ?? 0)}`;
  for (let i = 0; i < segmentCount; i++) {
    const x0 = xs[i];
    const x1 = xs[i + 1];
    const a0 = amps[i] ?? 0;
    const a1 = i + 1 < amps.length ? amps[i + 1] : lastAmp;
    d += ` C ${x0 + dx} ${CENTER - a0} ${x1 - dx} ${CENTER - a1} ${x1} ${CENTER - a1}`;
  }
  d += ` L 100 ${CENTER + lastAmp}`;
  for (let i = segmentCount - 1; i >= 0; i--) {
    const x1 = xs[i + 1];
    const x0 = xs[i];
    const a1 = i + 1 < amps.length ? amps[i + 1] : lastAmp;
    const a0 = amps[i] ?? 0;
    d += ` C ${x1 - dx} ${CENTER + a1} ${x0 + dx} ${CENTER + a0} ${x0} ${CENTER + a0}`;
  }
  d += ' Z';
  return d;
}
