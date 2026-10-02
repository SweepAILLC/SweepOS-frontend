import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { apiClient } from '@/lib/api';
import { canManageOrgIntegrations } from '@/lib/tabAccess';
import Navbar from '@/components/ui/Navbar';
import { useSidebar } from '@/contexts/SidebarContext';
import { useCurrentOrgName } from '@/hooks/useCurrentOrgName';
import ShinyButton from '@/components/ui/ShinyButton';
import GhlFunnelSetup from '@/components/funnels/GhlFunnelSetup';
import type { Funnel } from '@/types/funnel';
import type { GhlFunnelOption } from '@/types/integration';

type FunnelSource = 'sweep' | 'ghl';

function errorDetail(error: unknown, fallback: string): string {
  const err = error as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = err?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && 'message' in detail) return String((detail as { message: unknown }).message);
  return err?.message || fallback;
}

export default function NewFunnelPage() {
  const router = useRouter();
  const { mainPaddingClass, mobileTopPaddingClass } = useSidebar();
  const organizationName = useCurrentOrgName();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    client_id: '',
    slug: '',
    domain: '',
    env: '',
  });

  const [source, setSource] = useState<FunnelSource>('sweep');
  const [canManage, setCanManage] = useState(false);
  const [ghlConnected, setGhlConnected] = useState<boolean | null>(null);
  const [ghlFunnels, setGhlFunnels] = useState<GhlFunnelOption[] | null>(null);
  const [ghlLoadError, setGhlLoadError] = useState<string | null>(null);
  const [ghlFunnelId, setGhlFunnelId] = useState('');
  const [created, setCreated] = useState<Funnel | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([apiClient.getCurrentUser().catch(() => null), apiClient.getGhlStatus().catch(() => null)]).then(
      ([user, status]) => {
        if (cancelled) return;
        const u = user as { role?: string; is_admin?: boolean; is_system_owner?: boolean } | null;
        setCanManage(
          canManageOrgIntegrations(u?.role ?? '', { isAdmin: u?.is_admin === true, isSystemOwner: u?.is_system_owner === true }),
        );
        setGhlConnected(Boolean(status?.connected));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Load GHL funnels the first time the coach picks GoHighLevel.
  useEffect(() => {
    if (source !== 'ghl' || ghlFunnels !== null || !ghlConnected) return;
    let cancelled = false;
    setGhlLoadError(null);
    apiClient
      .listGhlFunnels()
      .then((data) => {
        if (!cancelled) setGhlFunnels(data.funnels || []);
      })
      .catch((e) => {
        if (!cancelled) {
          setGhlFunnels([]);
          setGhlLoadError(errorDetail(e, 'Could not load your GoHighLevel funnels.'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, ghlFunnels, ghlConnected]);

  const selectedGhl = useMemo(
    () => (ghlFunnels || []).find((f) => f.id === ghlFunnelId) || null,
    [ghlFunnels, ghlFunnelId],
  );

  const pickGhlFunnel = (id: string) => {
    setGhlFunnelId(id);
    const picked = (ghlFunnels || []).find((f) => f.id === id);
    // Prefill the name, but never overwrite one the coach already typed.
    if (picked && !formData.name.trim()) setFormData((d) => ({ ...d, name: picked.name }));
  };

  const goToDashboard = (funnelId: string) =>
    router.push({ pathname: '/', query: { tab: 'funnels', funnelId } }, undefined, { shallow: true });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!formData.name.trim()) {
      setError('Funnel name is required');
      return;
    }
    if (source === 'ghl' && !ghlFunnelId) {
      setError('Pick the GoHighLevel funnel to pair with');
      return;
    }

    try {
      setLoading(true);
      const payload: Record<string, string> = {
        name: formData.name.trim(),
      };

      if (source === 'ghl') {
        payload.source = 'ghl';
        payload.ghl_funnel_id = ghlFunnelId;
      } else {
        if (formData.client_id) payload.client_id = formData.client_id;
        if (formData.slug) payload.slug = formData.slug;
        if (formData.domain) payload.domain = formData.domain;
        if (formData.env) payload.env = formData.env;
      }

      const funnel = (await apiClient.createFunnel(payload)) as Funnel;
      if (source === 'ghl') {
        setCreated(funnel);
      } else {
        await goToDashboard(funnel.id);
      }
    } catch (err: unknown) {
      setError(errorDetail(err, 'Failed to create funnel'));
    } finally {
      setLoading(false);
    }
  };

  const ghlDisabledReason =
    ghlConnected === false
      ? 'Connect GoHighLevel in Integrations first.'
      : !canManage
        ? 'Only owners and admins can pair a GoHighLevel funnel.'
        : null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar
        activeTab="funnels"
        onTabChange={(tab) => router.push(`/?tab=${tab}`)}
        organizationName={organizationName}
      />
      <div className={`max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 transition-[padding] duration-300 ease-out ${mobileTopPaddingClass} ${mainPaddingClass}`}>
        <div className="mb-6">
          <button
            onClick={() => router.push('/')}
            className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white mb-4"
          >
            ← Back to Funnels
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{created ? 'Finish setup' : 'Create New Funnel'}</h1>
          {created ? (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              <span className="font-medium">{created.name}</span> is paired with GoHighLevel. Nothing here blocks; you can come
              back to it from the funnel&apos;s settings.
            </p>
          ) : null}
        </div>

        {created ? (
          <div className="space-y-4">
            <GhlFunnelSetup funnel={created} canManage={canManage} mode="setup" onFunnelChange={setCreated} />
            <button
              type="button"
              onClick={() => void goToDashboard(created.id)}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-500"
            >
              Go to funnel dashboard
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6">
            <fieldset>
              <legend className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Where does this funnel live?
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup">
                {(
                  [
                    { value: 'sweep', title: 'Sweep-tracked page', hint: 'Your own page with Sweep tracking code' },
                    { value: 'ghl', title: 'GoHighLevel', hint: 'Pull opt-ins and bookings from a GHL funnel' },
                  ] as const
                ).map((opt) => {
                  const disabled = opt.value === 'ghl' && Boolean(ghlDisabledReason);
                  const active = source === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={disabled}
                      onClick={() => setSource(opt.value)}
                      className={`text-left rounded-lg border px-3 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        active
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                          : 'border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {opt.value === 'ghl' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src="/ghl.svg" alt="" className="h-4 w-4" />
                        ) : null}
                        {opt.title}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
              {ghlDisabledReason ? (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {ghlDisabledReason}{' '}
                  {ghlConnected === false ? (
                    <Link
                      href={{ pathname: '/', query: { tab: 'settings', section: 'integrations' } }}
                      className="underline text-indigo-600 dark:text-indigo-400"
                    >
                      Open Integrations
                    </Link>
                  ) : null}
                </p>
              ) : null}
            </fieldset>

            {source === 'ghl' ? (
              <div>
                <label htmlFor="ghl-funnel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GoHighLevel funnel *
                </label>
                <select
                  id="ghl-funnel"
                  value={ghlFunnelId}
                  onChange={(e) => pickGhlFunnel(e.target.value)}
                  disabled={ghlFunnels === null}
                  className="w-full px-3 py-2 solid-input rounded-md"
                >
                  <option value="">{ghlFunnels === null ? 'Loading your GHL funnels…' : 'Pick a funnel from your GHL account'}</option>
                  {(ghlFunnels || []).map((f) => (
                    <option key={f.id} value={f.id} disabled={Boolean(f.paired_funnel_id)}>
                      {f.name}
                      {f.paired_funnel_id ? ` (paired to ${f.paired_funnel_name})` : ''}
                    </option>
                  ))}
                </select>
                {ghlLoadError ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{ghlLoadError}</p> : null}
                {ghlFunnels !== null && ghlFunnels.length === 0 && !ghlLoadError ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">No funnels found in the connected GHL location.</p>
                ) : null}
              </div>
            ) : null}

            <div>
              <label htmlFor="funnel-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Funnel Name *
              </label>
              <input
                id="funnel-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Onboarding Funnel, Sales Funnel"
                className="w-full px-3 py-2 solid-input rounded-md"
              />
              {source === 'ghl' ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Filled from GHL; rename it if you like.</p>
              ) : null}
            </div>

            {source === 'ghl' && selectedGhl ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Steps that will be created ({selectedGhl.steps.length})
                </p>
                {selectedGhl.steps.length ? (
                  <ol className="list-decimal pl-5 space-y-0.5 text-xs text-gray-700 dark:text-gray-200">
                    {selectedGhl.steps.map((s) => (
                      <li key={s.path}>
                        {s.name || 'Untitled step'} <span className="text-gray-500 dark:text-gray-400">{s.path}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-gray-500 dark:text-gray-400">This GHL funnel has no published steps yet.</p>
                )}
              </div>
            ) : null}

            {source === 'sweep' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Domain (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    placeholder="e.g., example.com"
                    className="w-full px-3 py-2 solid-input rounded-md"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Used to automatically match events to this funnel based on URL
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Slug (optional)
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    placeholder="e.g., onboarding"
                    className="w-full px-3 py-2 solid-input rounded-md"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Unique identifier for URL matching
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Environment (optional)
                  </label>
                  <select
                    value={formData.env}
                    onChange={(e) => setFormData({ ...formData, env: e.target.value })}
                    className="w-full px-3 py-2 solid-input rounded-md"
                  >
                    <option value="">Select environment</option>
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>
              </>
            ) : null}

            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex space-x-4">
              <ShinyButton type="submit" disabled={loading}>
                {loading ? 'Creating...' : 'Create Funnel'}
              </ShinyButton>
              <button
                type="button"
                onClick={() => router.push('/')}
                className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-300 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
