import Cookies from 'js-cookie';

/** JWT org_id for tenant scoping (cache, pipeline store, filters). */
export function orgIdFromAccessToken(): string {
  if (typeof window === 'undefined') return 'anon';
  const token = Cookies.get('access_token');
  if (!token) return 'anon';
  try {
    const parts = token.split('.');
    if (parts.length < 2) return 'anon';
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = JSON.parse(atob(padded)) as { org_id?: string };
    return json.org_id != null ? String(json.org_id) : 'anon';
  } catch {
    return 'anon';
  }
}

export const ORG_CHANGED_EVENT = 'sweepos:org-changed';

export function dispatchOrgChanged(orgId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ORG_CHANGED_EVENT, { detail: { orgId } }));
}
