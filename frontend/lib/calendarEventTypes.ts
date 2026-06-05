import type { CalComEventType, CalendlyEventType } from '@/types/integration';

export type CalendarEventTypeProvider = 'calcom' | 'calendly';

export interface CalendarEventTypeNode {
  id: string;
  label: string;
  durationMinutes?: number;
  shareUrl?: string;
  slug?: string;
  provider: CalendarEventTypeProvider;
}

export function formatEventTypeDuration(minutes: number | undefined): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function calComEventTypesToNodes(types: CalComEventType[]): CalendarEventTypeNode[] {
  return types.map((et) => ({
    id: String(et.id),
    label: et.title || et.slug || `Event ${et.id}`,
    durationMinutes: et.length ?? et.lengthInMinutes,
    shareUrl: et.bookingUrl,
    slug: et.slug,
    provider: 'calcom',
  }));
}

export function calendlyEventTypesToNodes(types: CalendlyEventType[]): CalendarEventTypeNode[] {
  return types.map((et) => ({
    id: et.uri,
    label: et.name || et.slug || et.uri,
    durationMinutes: et.duration,
    shareUrl: et.scheduling_url,
    slug: et.slug,
    provider: 'calendly',
  }));
}
