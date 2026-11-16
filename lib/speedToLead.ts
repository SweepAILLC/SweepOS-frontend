import { channelLabel } from '@/lib/funnelNames';

type LeadClock = {
  dialed_at?: string | null;
  created_at?: string | null;
  source_channel?: string | null;
  source_funnel_id?: string | null;
  lifetime_revenue_cents?: number | null;
  offer_enrollment?: { paid_cents?: number | null } | null;
};

/** API timestamps are naive UTC (no "Z"); bare Date.parse would read them as local time. */
function parseServerTime(value: string): number {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  return Date.parse(hasZone ? value : `${value}Z`);
}

/** Seconds from lead created to the dial click. Null when the lead has not been dialled. */
export function speedToLeadSeconds(client: LeadClock): number | null {
  if (!client.dialed_at || !client.created_at) return null;
  const dialed = parseServerTime(client.dialed_at);
  const created = parseServerTime(client.created_at);
  if (!Number.isFinite(dialed) || !Number.isFinite(created)) return null;
  return Math.max(0, (dialed - created) / 1000);
}

function clientPaid(client: LeadClock): boolean {
  return (client.lifetime_revenue_cents ?? 0) > 0 || (client.offer_enrollment?.paid_cents ?? 0) > 0;
}

export function formatSpeed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    const rest = total % 60;
    return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest ? `${days}d ${rest}h` : `${days}d`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export type ChannelDialStat = {
  channel: string;
  leads: number;
  dialed: number;
  percent: number;
  averageSeconds: number | null;
  paid: number;
  dialToClosePercent: number | null;
};

export type SpeedToLeadReport = {
  leads: number;
  dials: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
  fastestSeconds: number | null;
  paidDials: number;
  dialToClosePercent: number | null;
  channels: ChannelDialStat[];
};

export function buildSpeedToLeadReport(
  clients: LeadClock[],
  funnelNames: Record<string, string>,
): SpeedToLeadReport {
  const speeds: number[] = [];
  let paidDials = 0;
  const byChannel = new Map<string, { leads: number; dialed: number; paid: number; speeds: number[] }>();

  for (const client of clients) {
    const channel = channelLabel(client, funnelNames);
    const row = byChannel.get(channel) ?? { leads: 0, dialed: 0, paid: 0, speeds: [] };
    row.leads += 1;
    const speed = speedToLeadSeconds(client);
    if (client.dialed_at) {
      row.dialed += 1;
      if (speed != null) {
        row.speeds.push(speed);
        speeds.push(speed);
      }
      if (clientPaid(client)) {
        row.paid += 1;
        paidDials += 1;
      }
    }
    byChannel.set(channel, row);
  }

  const channels = Array.from(byChannel.entries())
    .map(([channel, row]) => ({
      channel,
      leads: row.leads,
      dialed: row.dialed,
      percent: row.leads ? (row.dialed / row.leads) * 100 : 0,
      averageSeconds: average(row.speeds),
      paid: row.paid,
      dialToClosePercent: row.dialed ? (row.paid / row.dialed) * 100 : null,
    }))
    .sort((a, b) => b.leads - a.leads || a.channel.localeCompare(b.channel));

  const dials = channels.reduce((sum, row) => sum + row.dialed, 0);
  return {
    leads: clients.length,
    dials,
    averageSeconds: average(speeds),
    medianSeconds: median(speeds),
    fastestSeconds: speeds.length ? Math.min(...speeds) : null,
    paidDials,
    dialToClosePercent: dials ? (paidDials / dials) * 100 : null,
    channels,
  };
}
