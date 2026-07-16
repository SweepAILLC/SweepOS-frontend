import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');

interface OrgChoice {
  id: string;
  name: string;
  role?: string;
}

/**
 * Mid-OAuth org picker for Claude MCP connectors.
 * Shown when a Google account belongs to multiple Sweep organizations.
 */
export default function McpSelectOrganization() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<OrgChoice[]>([]);
  const [email, setEmail] = useState('');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const selectToken =
    typeof router.query.select_token === 'string' ? router.query.select_token : '';

  useEffect(() => {
    if (!router.isReady) return;
    if (!selectToken) {
      setError('Missing Claude connector selection token. Restart Connect in Claude.');
      setLoading(false);
      return;
    }

    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `${API_BASE}/mcp/oauth/org-choices?select_token=${encodeURIComponent(selectToken)}`
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.detail || 'Failed to load organizations');
        }
        const orgs: OrgChoice[] = Array.isArray(data.organizations) ? data.organizations : [];
        setOrganizations(orgs);
        setEmail(typeof data.email === 'string' ? data.email : '');
        if (orgs.length > 0) setSelectedOrgId(orgs[0].id);
      } catch (e: any) {
        setError(e?.message || 'Failed to load organizations');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [router.isReady, selectToken]);

  const onContinue = async () => {
    if (!selectToken || !selectedOrgId) return;
    try {
      setSubmitting(true);
      setError('');
      const res = await fetch(`${API_BASE}/mcp/oauth/select-org`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ select_token: selectToken, org_id: selectedOrgId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || 'Could not bind organization');
      }
      if (!data.redirect_url) {
        throw new Error('Missing Claude redirect URL');
      }
      window.location.href = data.redirect_url;
    } catch (e: any) {
      setError(e?.message || 'Could not continue');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 px-4">
      <div className="w-full max-w-md rounded-2xl border-2 border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Choose organization for Claude
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Your Google account has access to more than one Sweep organization. Pick which org Claude
          should use for this connector.
        </p>
        {email && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Signed in as <span className="font-medium text-zinc-800 dark:text-zinc-200">{email}</span>
          </p>
        )}

        {loading && (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">Loading organizations…</p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
            {error}
          </div>
        )}

        {!loading && !error && organizations.length === 0 && (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-300">No organizations found.</p>
        )}

        {!loading && organizations.length > 0 && (
          <div className="mt-6 space-y-2">
            {organizations.map((org) => (
              <label
                key={org.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 px-4 py-3 ${
                  selectedOrgId === org.id
                    ? 'border-sky-600 bg-sky-50 dark:border-sky-400 dark:bg-sky-950/40'
                    : 'border-zinc-200 dark:border-zinc-700'
                }`}
              >
                <input
                  type="radio"
                  name="organization"
                  value={org.id}
                  checked={selectedOrgId === org.id}
                  onChange={() => setSelectedOrgId(org.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {org.name}
                  </span>
                  {org.role && (
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">{org.role}</span>
                  )}
                </span>
              </label>
            ))}
            <button
              type="button"
              onClick={onContinue}
              disabled={submitting || !selectedOrgId}
              className="mt-4 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {submitting ? 'Connecting…' : 'Continue to Claude'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
