import Cookies from 'js-cookie';
import type { OutreachInboxItem, PerformanceSnapshot } from '@/lib/api';

function orgIdFromAccessToken(): string {
  if (typeof window === 'undefined') return 'anon';
  const token = Cookies.get('access_token');
  if (!token) return 'anon';
  try {
    const parts = token.split('.');
    if (parts.length < 2) return 'anon';
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = JSON.parse(atob(padded)) as { org_id?: string };
    return json.org_id != null ? String(json.org_id) : 'anon';
  } catch {
    return 'anon';
  }
}

function snapshotKey(): string {
  return `performance_snapshot_${orgIdFromAccessToken()}`;
}

function approvalsKey(): string {
  return `performance_approvals_${orgIdFromAccessToken()}`;
}

export function hydratePerformanceSnapshot(): PerformanceSnapshot | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(snapshotKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PerformanceSnapshot;
    return parsed?.tasks ? parsed : null;
  } catch {
    return null;
  }
}

export function persistPerformanceSnapshot(data: PerformanceSnapshot): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(snapshotKey(), JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

export function hydratePerformanceApprovals(): OutreachInboxItem[] | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(approvalsKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OutreachInboxItem[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function persistPerformanceApprovals(items: OutreachInboxItem[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(approvalsKey(), JSON.stringify(items));
  } catch {
    /* ignore quota */
  }
}

export function clearPerformancePrioritiesCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(snapshotKey());
    sessionStorage.removeItem(approvalsKey());
  } catch {
    /* ignore */
  }
}
