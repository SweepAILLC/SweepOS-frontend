'use client';

import { useState, useEffect, useCallback, useId, type ReactNode } from 'react';
import { apiClient, type FathomStatusResponse } from '@/lib/api';
import FathomSyncSection from '@/components/ui/FathomSyncSection';
import BrevoIntegrationCard from '@/components/ui/BrevoIntegrationCard';
import { useLoading } from '@/contexts/LoadingContext';
import { isOrgAdminRole } from '@/lib/tabAccess';
import type { BrevoStatus, CalComStatus, CalendlyStatus } from '@/types/integration';

type IntegrationModal = 'brevo' | 'fathom' | 'stripe' | 'calcom' | 'calendly' | 'whop' | 'claude' | null;

const MCP_RESOURCE_URL = `${(process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')}/mcp`;

/** High-contrast fields inside integration modals (solid surfaces). */
const fieldInputClass =
  'w-full rounded-lg border-2 border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-500 focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-500/35 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400';

const mutedClass = 'text-xs text-zinc-700 dark:text-zinc-300';
const linkClass = 'font-medium text-blue-700 underline decoration-blue-700/40 underline-offset-2 hover:text-blue-900 dark:text-blue-400 dark:decoration-blue-400/40 dark:hover:text-blue-300';

/** Plain-language steps for people who have never handled API keys or developer settings. */
function BeginnerSetupGuide({ intro, steps }: { intro: string; steps: ReactNode[] }) {
  return (
    <div className="rounded-xl border-2 border-sky-200 bg-sky-50/95 p-4 text-zinc-900 shadow-sm dark:border-sky-800/80 dark:bg-sky-950/40 dark:text-zinc-50 sm:p-5">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-sky-900 dark:text-sky-200">Where to find this</p>
      <p className="mt-2 text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">{intro}</p>
      <ol className="mt-3 list-decimal space-y-2.5 pl-[1.35rem] text-sm leading-relaxed text-zinc-800 marker:font-semibold dark:text-zinc-100">
        {steps.map((step, i) => (
          <li key={i} className="pl-1">
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

function BrandTileImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-2 shadow-inner ring-1 ring-zinc-200/80 dark:bg-zinc-900 dark:ring-zinc-600/80">
      {/* Static logos from /public */}
      <img src={src} alt={alt} className="h-full w-full object-contain" />
    </div>
  );
}

function ClaudeTileMark() {
  return (
    <div
      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#D97757] p-2 shadow-inner ring-1 ring-zinc-200/80 dark:ring-zinc-600/80"
      aria-hidden
    >
      <span className="text-xl font-bold tracking-tight text-white">C</span>
    </div>
  );
}

function SquareModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/70 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(92dvh,56rem)] w-full max-w-[min(96vw,44rem)] min-h-0 flex-col overflow-hidden rounded-2xl border-2 border-zinc-300 bg-white text-zinc-900 shadow-2xl dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b-2 border-zinc-200 bg-zinc-100 px-4 py-3.5 dark:border-zinc-700 dark:bg-zinc-900 sm:px-5">
          <h3 id={titleId} className="truncate pr-2 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-zinc-300 bg-white p-2 text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-4 py-5 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50 sm:px-6 sm:py-6">
          {children}
        </div>
      </div>
    </div>
  );
}

function FathomWebhookStatusRow({
  status,
  registering,
}: {
  status: FathomStatusResponse | null;
  registering: boolean;
}) {
  if (!status?.configured && !registering) return null;

  let dotClass = 'bg-zinc-400';
  let label = 'Not configured';
  if (registering) {
    dotClass = 'bg-sky-500 animate-pulse';
    label = 'Registering webhook…';
  } else if (status?.webhook_active || status?.webhook_status === 'active') {
    dotClass = 'bg-emerald-500';
    label = 'Auto-sync active — new calls sync automatically';
  } else if (status?.configured) {
    dotClass = 'bg-amber-500';
    label = 'Webhook not registered — click Save to register auto-sync';
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-gray-50/80 dark:bg-white/5 px-3 py-2.5 space-y-1">
      <div className="flex items-center gap-2">
        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
        <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{label}</span>
      </div>
      {(status?.total_calls ?? 0) > 0 && !registering && (
        <p className="text-[11px] text-gray-500 dark:text-gray-400 pl-[1.125rem]">
          {status?.total_calls} call{status?.total_calls === 1 ? '' : 's'} synced
          {status?.latest_call_at
            ? ` · latest ${new Date(status.latest_call_at).toLocaleDateString()}`
            : ''}
        </p>
      )}
    </div>
  );
}

export default function IntegrationsPanel() {
  const { setLoading: setGlobalLoading } = useLoading();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fathomApiKey, setFathomApiKey] = useState('');
  const [initialFathomKey, setInitialFathomKey] = useState('');
  const [canManageIntegrations, setCanManageIntegrations] = useState(false);
  const [modal, setModal] = useState<IntegrationModal>(null);
  const [brevoSummary, setBrevoSummary] = useState<BrevoStatus | null>(null);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);
  const [calcomSummary, setCalcomSummary] = useState<CalComStatus | null>(null);
  const [calendlySummary, setCalendlySummary] = useState<CalendlyStatus | null>(null);
  const [whopSummary, setWhopSummary] = useState<{ connected: boolean; company_id?: string | null } | null>(null);
  const [fathomStatus, setFathomStatus] = useState<FathomStatusResponse | null>(null);
  const [fathomWebhookRegistering, setFathomWebhookRegistering] = useState(false);

  const [stripeApiKey, setStripeApiKey] = useState('');
  const [stripeBusy, setStripeBusy] = useState(false);
  const [stripeErr, setStripeErr] = useState<string | null>(null);

  const [calcomKey, setCalcomKey] = useState('');
  const [calcomBusy, setCalcomBusy] = useState(false);
  const [calcomErr, setCalcomErr] = useState<string | null>(null);

  const [calendlyKey, setCalendlyKey] = useState('');
  const [calendlyBusy, setCalendlyBusy] = useState(false);
  const [calendlyErr, setCalendlyErr] = useState<string | null>(null);

  const [whopKey, setWhopKey] = useState('');
  const [whopCompanyId, setWhopCompanyId] = useState('');
  const [whopBusy, setWhopBusy] = useState(false);
  const [whopErr, setWhopErr] = useState<string | null>(null);
  const [mcpUrlCopied, setMcpUrlCopied] = useState(false);

  const refreshBrevoSummary = useCallback(async () => {
    try {
      const data = await apiClient.getBrevoStatus();
      setBrevoSummary(data);
    } catch {
      setBrevoSummary(null);
    }
  }, []);

  const refreshIntegrationSummaries = useCallback(async () => {
    try {
      const [stripeSt, calcom, calendly, whop] = await Promise.all([
        apiClient.getStripeStatus(true).catch(() => null),
        apiClient.getCalComStatus().catch(() => null),
        apiClient.getCalendlyStatus().catch(() => null),
        apiClient.getWhopStatus(true).catch(() => null),
      ]);
      const s = stripeSt as { connected?: boolean; account_id?: string } | null;
      setStripeConnected(s?.connected === true);
      setStripeAccountId(typeof s?.account_id === 'string' ? s.account_id : null);
      setCalcomSummary(calcom);
      setCalendlySummary(calendly);
      const w = whop as { connected?: boolean; company_id?: string | null } | null;
      setWhopSummary(w ? { connected: !!w.connected, company_id: w.company_id } : { connected: false });
    } catch {
      setStripeConnected(false);
      setCalcomSummary(null);
      setCalendlySummary(null);
      setWhopSummary({ connected: false });
    }
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [settings, user, brevo, fStatus] = await Promise.all([
        apiClient.getUserSettings(),
        apiClient.getCurrentUser(),
        apiClient.getBrevoStatus().catch(() => null),
        apiClient.getFathomStatus().catch(() => null),
      ]);
      {
        const loadedKey = typeof settings?.fathom_api_key === 'string' ? settings.fathom_api_key : '';
        setFathomApiKey(loadedKey);
        setInitialFathomKey(loadedKey);
      }
      setCanManageIntegrations(isOrgAdminRole(user?.role) || user?.is_admin === true);
      setBrevoSummary(brevo);
      setFathomStatus(fStatus);
      await refreshIntegrationSummaries();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Failed to load integrations';
      setError(String(msg));
    } finally {
      setLoading(false);
      setGlobalLoading(false);
    }
  }, [setGlobalLoading, refreshIntegrationSummaries]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!modal) return;
    if (modal === 'stripe') setStripeErr(null);
    if (modal === 'calcom') setCalcomErr(null);
    if (modal === 'calendly') setCalendlyErr(null);
    if (modal === 'whop') setWhopErr(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const refreshFathomStatus = useCallback(async () => {
    try {
      const status = await apiClient.getFathomStatus();
      setFathomStatus(status);
      return status;
    } catch {
      return null;
    }
  }, []);

  const handleFathomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const keyInForm = fathomApiKey.trim();
    const configured = fathomStatus?.configured === true;
    if (!keyInForm && !configured) {
      setError('Enter your Fathom API key.');
      return;
    }

    const keyChanged = keyInForm !== initialFathomKey.trim();
    const webhookActive =
      fathomStatus?.webhook_active === true || fathomStatus?.webhook_status === 'active';

    // Nothing to do: key unchanged and webhook already registered.
    if (!keyChanged && webhookActive) {
      setSuccess('Fathom is already connected. No changes needed.');
      return;
    }

    try {
      setSaving(true);
      setFathomWebhookRegistering(true);
      if (keyInForm && keyChanged) {
        await apiClient.updateUserSettings({
          fathom_api_key: keyInForm,
        });
        setInitialFathomKey(keyInForm);
      }
      // Force a fresh webhook only when the key changed; otherwise reconcile idempotently.
      const setup = await apiClient.setupFathomWebhook({ force: keyChanged });
      const status = await refreshFathomStatus();
      if (status?.webhook_active) {
        setSuccess(
          (status.total_calls ?? 0) > 0
            ? 'Fathom webhook registered. New calls will sync automatically.'
            : 'Fathom webhook registered. Use Sync Fathom now to import past meetings.'
        );
      } else if (setup?.registration_skipped && setup?.reason === 'non_public_destination') {
        setSuccess(
          setup.message ||
            'Fathom API key saved. Webhook registration is skipped in local dev unless BACKEND_PUBLIC_URL is a public HTTPS URL.'
        );
      } else {
        setError('Webhook registration did not complete. Verify your API key and try Save again.');
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err as Error)?.message ||
        'Failed to save Fathom settings';
      setError(String(msg));
      void refreshFathomStatus();
    } finally {
      setSaving(false);
      setFathomWebhookRegistering(false);
    }
  };

  const handleStripeConnect = async () => {
    const k = stripeApiKey.trim();
    if (!k) {
      setStripeErr('Enter your Stripe secret or restricted key.');
      return;
    }
    if (!k.match(/^(sk_test_|sk_live_|rk_test_|rk_live_)/)) {
      setStripeErr('Key must start with sk_test_, sk_live_, rk_test_, or rk_live_.');
      return;
    }
    setStripeErr(null);
    setStripeBusy(true);
    try {
      const result = (await apiClient.connectStripeDirect(k)) as { success?: boolean; account_id?: string };
      setStripeApiKey('');
      if (result?.success) {
        setSuccess(`Stripe connected${result.account_id ? ` (${result.account_id})` : ''}.`);
      }
      await refreshIntegrationSummaries();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } }; message?: string };
      setStripeErr(ax?.response?.data?.detail || ax?.message || 'Stripe connect failed.');
    } finally {
      setStripeBusy(false);
    }
  };

  const handleStripeDisconnect = async () => {
    if (!confirm('Disconnect Stripe for this organization?')) return;
    setStripeBusy(true);
    setStripeErr(null);
    try {
      await apiClient.disconnectStripe();
      setSuccess('Stripe disconnected.');
      await refreshIntegrationSummaries();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      setStripeErr(ax?.response?.data?.detail || 'Disconnect failed.');
    } finally {
      setStripeBusy(false);
    }
  };

  const handleStripeSync = async () => {
    setStripeBusy(true);
    setStripeErr(null);
    try {
      await apiClient.syncStripeData(false, true);
      setSuccess('Stripe sync started.');
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      setStripeErr(ax?.response?.data?.detail || 'Sync failed.');
    } finally {
      setStripeBusy(false);
    }
  };

  const handleCalComConnect = async () => {
    if (!calcomKey.trim()) {
      setCalcomErr('Enter your Cal.com API key.');
      return;
    }
    if (calendlySummary?.connected) {
      setCalcomErr('Calendly is connected. Disconnect Calendly first, then connect Cal.com.');
      return;
    }
    setCalcomBusy(true);
    setCalcomErr(null);
    try {
      await apiClient.connectCalComWithApiKey(calcomKey.trim());
      setCalcomKey('');
      setSuccess('Cal.com connected. Pulling bookings…');
      await refreshIntegrationSummaries();
      try {
        await apiClient.syncCheckIns({ applyPipelineRules: false });
        setSuccess('Cal.com connected. Bookings will stay in sync automatically.');
      } catch {
        setSuccess('Cal.com connected. Open Terminal to finish the first booking sync.');
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      setCalcomErr(ax?.response?.data?.detail || 'Cal.com connect failed.');
    } finally {
      setCalcomBusy(false);
    }
  };

  const handleCalComDisconnect = async () => {
    if (!confirm('Disconnect Cal.com?')) return;
    setCalcomBusy(true);
    setCalcomErr(null);
    try {
      await apiClient.disconnectCalCom();
      setSuccess('Cal.com disconnected.');
      await refreshIntegrationSummaries();
    } catch {
      setCalcomErr('Disconnect failed.');
    } finally {
      setCalcomBusy(false);
    }
  };

  const handleCalendlyConnect = async () => {
    if (!calendlyKey.trim()) {
      setCalendlyErr('Enter your Calendly personal access token.');
      return;
    }
    if (calcomSummary?.connected) {
      setCalendlyErr('Cal.com is connected. Disconnect Cal.com first, then connect Calendly.');
      return;
    }
    setCalendlyBusy(true);
    setCalendlyErr(null);
    try {
      await apiClient.connectCalendlyWithApiKey(calendlyKey.trim());
      setCalendlyKey('');
      setSuccess('Calendly connected. Pulling bookings…');
      await refreshIntegrationSummaries();
      try {
        await apiClient.syncCheckIns({ applyPipelineRules: false });
        setSuccess('Calendly connected. Bookings will stay in sync automatically.');
      } catch {
        setSuccess('Calendly connected. Open Terminal to finish the first booking sync.');
      }
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      setCalendlyErr(ax?.response?.data?.detail || 'Calendly connect failed.');
    } finally {
      setCalendlyBusy(false);
    }
  };

  const handleCalendlyDisconnect = async () => {
    if (!confirm('Disconnect Calendly?')) return;
    setCalendlyBusy(true);
    setCalendlyErr(null);
    try {
      await apiClient.disconnectCalendly();
      setSuccess('Calendly disconnected.');
      await refreshIntegrationSummaries();
    } catch {
      setCalendlyErr('Disconnect failed.');
    } finally {
      setCalendlyBusy(false);
    }
  };

  const handleWhopConnect = async () => {
    if (!whopKey.trim() || !whopCompanyId.trim()) {
      setWhopErr('API key and company ID are required.');
      return;
    }
    setWhopBusy(true);
    setWhopErr(null);
    try {
      await apiClient.postWhopConnect({ api_key: whopKey.trim(), company_id: whopCompanyId.trim() });
      setWhopKey('');
      setSuccess('Whop connected.');
      await refreshIntegrationSummaries();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: unknown } } };
      const d = ax?.response?.data?.detail;
      const msg =
        typeof d === 'string'
          ? d
          : Array.isArray(d)
            ? d.map((x: unknown) => (typeof x === 'object' && x && 'msg' in x ? String((x as { msg: string }).msg) : String(x))).join(' ')
            : 'Whop connect failed';
      setWhopErr(msg);
    } finally {
      setWhopBusy(false);
    }
  };

  const handleWhopDisconnect = async () => {
    if (!confirm('Disconnect Whop for this organization?')) return;
    setWhopBusy(true);
    setWhopErr(null);
    try {
      await apiClient.postWhopDisconnect();
      setSuccess('Whop disconnected.');
      await refreshIntegrationSummaries();
    } catch {
      setWhopErr('Disconnect failed.');
    } finally {
      setWhopBusy(false);
    }
  };

  const handleWhopSync = async () => {
    setWhopBusy(true);
    setWhopErr(null);
    try {
      await apiClient.postWhopSync(false);
      setSuccess('Whop sync completed.');
      await refreshIntegrationSummaries();
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { detail?: string } } };
      setWhopErr(ax?.response?.data?.detail || 'Sync failed.');
    } finally {
      setWhopBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-b-2 border-gray-900 dark:border-gray-100" />
          <p className="mt-3 text-gray-600 dark:text-gray-400">Loading integrations…</p>
        </div>
      </div>
    );
  }

  const brevoConnected = brevoSummary?.connected === true;
  const fathomConfigured = fathomApiKey.trim().length > 0 || fathomStatus?.configured === true;
  const fathomWebhookActive =
    !fathomWebhookRegistering &&
    (fathomStatus?.webhook_active === true || fathomStatus?.webhook_status === 'active');
  const calcomConnected = calcomSummary?.connected === true;
  const calendlyConnected = calendlySummary?.connected === true;
  const whopConnected = whopSummary?.connected === true;

  const tileBtn =
    'group aspect-square w-full rounded-2xl border-2 border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-400 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-zinc-700 dark:bg-zinc-900/80 dark:hover:border-zinc-500';

  return (
    <div className="w-full min-w-0 pb-12 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Integrations</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
          Connect services for the <strong>current organization</strong> (switch org under Settings → Accounts). Open a
          tile to configure credentials, sync, and connection status.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          {success}
        </div>
      )}

      <div className="grid w-full grid-cols-2 gap-3 sm:gap-3 md:grid-cols-4 md:gap-4">
        <button type="button" onClick={() => setModal('brevo')} className={tileBtn}>
          <div className="flex h-full min-h-0 flex-col">
            <BrandTileImage src="/brevo.png" alt="Brevo" />
            <div className="mt-2 min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">Brevo</p>
              <p className="text-[10px] leading-snug text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">Email &amp; campaigns</p>
            </div>
            <p
              className={`mt-auto text-[10px] font-semibold uppercase tracking-wide ${
                brevoConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {brevoConnected ? 'Connected' : 'Not connected'}
            </p>
          </div>
        </button>

        <button type="button" onClick={() => setModal('fathom')} className={tileBtn}>
          <div className="flex h-full min-h-0 flex-col">
            <BrandTileImage src="/fathom.png" alt="Fathom" />
            <div className="mt-2 min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">Fathom</p>
              <p className="text-[10px] leading-snug text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">Calls &amp; Call Library</p>
            </div>
            <p
              className={`mt-auto text-[10px] font-semibold uppercase tracking-wide ${
                fathomWebhookRegistering
                  ? 'text-sky-700 dark:text-sky-400'
                  : fathomWebhookActive
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : fathomConfigured
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {fathomWebhookRegistering
                ? 'Registering…'
                : fathomWebhookActive
                  ? 'Connected'
                  : fathomConfigured
                    ? 'Key saved'
                    : 'Not configured'}
            </p>
          </div>
        </button>

        <button type="button" onClick={() => setModal('stripe')} className={tileBtn}>
          <div className="flex h-full min-h-0 flex-col">
            <BrandTileImage src="/stripe.png" alt="Stripe" />
            <div className="mt-2 min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">Stripe</p>
              <p className="text-[10px] leading-snug text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">Payments &amp; Terminal</p>
            </div>
            <p
              className={`mt-auto text-[10px] font-semibold uppercase tracking-wide ${
                stripeConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {stripeConnected ? 'Connected' : 'Not connected'}
            </p>
          </div>
        </button>

        <button type="button" onClick={() => setModal('calcom')} className={tileBtn}>
          <div className="flex h-full min-h-0 flex-col">
            <BrandTileImage src="/calcom.jpg" alt="Cal.com" />
            <div className="mt-2 min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">Cal.com</p>
              <p className="text-[10px] leading-snug text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">Scheduling</p>
            </div>
            <p
              className={`mt-auto text-[10px] font-semibold uppercase tracking-wide ${
                calcomConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {calcomConnected ? 'Connected' : 'Not connected'}
            </p>
          </div>
        </button>

        <button type="button" onClick={() => setModal('calendly')} className={tileBtn}>
          <div className="flex h-full min-h-0 flex-col">
            <BrandTileImage src="/Calendly-New-Logo.png" alt="Calendly" />
            <div className="mt-2 min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">Calendly</p>
              <p className="text-[10px] leading-snug text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">Scheduling</p>
            </div>
            <p
              className={`mt-auto text-[10px] font-semibold uppercase tracking-wide ${
                calendlyConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {calendlyConnected ? 'Connected' : 'Not connected'}
            </p>
          </div>
        </button>

        <button type="button" onClick={() => setModal('whop')} className={tileBtn}>
          <div className="flex h-full min-h-0 flex-col">
            <BrandTileImage src="/whop.png" alt="Whop" />
            <div className="mt-2 min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">Whop</p>
              <p className="text-[10px] leading-snug text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">Finances &amp; revenue</p>
            </div>
            <p
              className={`mt-auto text-[10px] font-semibold uppercase tracking-wide ${
                whopConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {whopConnected ? 'Connected' : 'Not connected'}
            </p>
          </div>
        </button>

        <button type="button" onClick={() => setModal('claude')} className={tileBtn}>
          <div className="flex h-full min-h-0 flex-col">
            <ClaudeTileMark />
            <div className="mt-2 min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">Claude</p>
              <p className="text-[10px] leading-snug text-gray-600 dark:text-gray-400 mt-0.5 line-clamp-2">
                Custom connector (MCP)
              </p>
            </div>
            <p className="mt-auto text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Setup guide
            </p>
          </div>
        </button>
      </div>

      {modal === 'brevo' && (
        <SquareModalShell title="Brevo" onClose={() => setModal(null)}>
          <div className="flex min-h-0 flex-col space-y-5">
            <BeginnerSetupGuide
              intro="Sweep uses a Brevo API key so it can send email for your organization. This key is a long secret string from Brevo—it is not the same as your Brevo login password."
              steps={[
                <>
                  Go to{' '}
                  <a href="https://app.brevo.com" target="_blank" rel="noopener noreferrer" className={linkClass}>
                    app.brevo.com
                  </a>{' '}
                  and sign in (create a free account if you need one).
                </>,
                <>
                  Open <strong>Settings</strong> using the menu with your name or company (usually the top-right corner).
                </>,
                <>
                  In the left sidebar, open <strong>SMTP &amp; API</strong>, then <strong>API keys</strong>. You can also use the &quot;Get your API key&quot; link under the password field below—it opens the same area.
                </>,
                <>
                  Click <strong>Create a new API key</strong>, give it a simple name (for example &quot;Sweep&quot;), create it, then <strong>copy the entire key right away</strong>. Many tools only show the full key once.
                </>,
                <>Come back to this window, paste the key into the box below, and click Connect.</>,
              ]}
            />
            <BrevoIntegrationCard
              canManage={canManageIntegrations}
              embedded
              onConnectionChange={refreshBrevoSummary}
            />
          </div>
        </SquareModalShell>
      )}

      {modal === 'fathom' && (
        <SquareModalShell title="Fathom" onClose={() => setModal(null)}>
          <div className="space-y-5">
            <BeginnerSetupGuide
              intro="Fathom connects your call recordings and summaries to Sweep. You only need one API key from your Fathom account."
              steps={[
                <>
                  Open{' '}
                  <a href="https://fathom.video" target="_blank" rel="noopener noreferrer" className={linkClass}>
                    fathom.video
                  </a>{' '}
                  and sign in with the same account you use for Fathom meetings.
                </>,
                <>
                  Open <strong>Settings</strong> (gear or profile icon, depending on your layout).
                </>,
                <>
                  Find the <strong>API</strong> section. If you do not have a key yet, create one; if you already have one, use <strong>Copy</strong> so you do not mistype it.
                </>,
                <>
                  Paste that key into the field below and press <strong>Save</strong>. You can press Save again anytime to re-register the auto-sync webhook (green status light).
                </>,
              ]}
            />
            <p className={mutedClass}>
              Call recordings, transcripts, and Call Library. Only admins and owners can change the API key.
            </p>
            <form onSubmit={handleFathomSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">Fathom API key</label>
                <input
                  type="password"
                  value={fathomApiKey}
                  onChange={(e) => setFathomApiKey(e.target.value)}
                  placeholder={canManageIntegrations ? 'Enter your Fathom API key' : '—'}
                  disabled={!canManageIntegrations}
                  className={fieldInputClass + ' font-mono'}
                  autoComplete="off"
                />
                <p className={`mt-1.5 ${mutedClass}`}>
                  <a href="https://fathom.video/settings/api" target="_blank" rel="noopener noreferrer" className={linkClass}>
                    Get your API key
                  </a>{' '}
                  (Fathom → Settings → API).
                </p>
                {!canManageIntegrations && (
                  <p className="mt-2 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                    Ask an admin or owner to configure Fathom.
                  </p>
                )}
              </div>
              {(fathomStatus?.configured || fathomWebhookRegistering) && (
                <FathomWebhookStatusRow status={fathomStatus} registering={fathomWebhookRegistering} />
              )}
              <FathomSyncSection variant="modal" />
              {canManageIntegrations && (
                <button
                  type="submit"
                  disabled={saving || fathomWebhookRegistering}
                  className="w-full rounded-lg border-2 border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-zinc-800 disabled:opacity-50 dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {saving || fathomWebhookRegistering ? 'Saving…' : 'Save Fathom settings'}
                </button>
              )}
            </form>
          </div>
        </SquareModalShell>
      )}

      {modal === 'stripe' && (
        <SquareModalShell title="Stripe" onClose={() => setModal(null)}>
          <div className="space-y-5">
            <BeginnerSetupGuide
              intro="Stripe uses special &quot;API keys&quot; so Sweep can read your payments and power Terminal and Finances. Log into the Stripe account where you actually charge customers."
              steps={[
                <>
                  Go to{' '}
                  <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className={linkClass}>
                    dashboard.stripe.com
                  </a>{' '}
                  and sign in.
                </>,
                <>
                  In the <strong>left sidebar</strong>, scroll to <strong>Developers</strong>, then click <strong>API keys</strong>.
                </>,
                <>
                  Under <strong>Standard keys</strong>, find <strong>Secret key</strong>. Click <strong>Reveal test key</strong> or <strong>Reveal live key</strong> depending on whether you use test or live charges. The value always starts with{' '}
                  <code className="rounded bg-zinc-200 px-1 text-xs text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">sk_test_</code> or{' '}
                  <code className="rounded bg-zinc-200 px-1 text-xs text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">sk_live_</code>.
                </>,
                <>
                  Click the copy icon next to the secret key, then paste it here. Treat it like a bank password—do not email it, screenshot it in shared chats, or use a key from the wrong Stripe account.
                </>,
                <>Click Connect Stripe below when you are ready.</>,
              ]}
            />
            <p className={mutedClass}>Connect with a secret or restricted key. Used for Terminal, Finances, and webhooks.</p>
            {stripeErr ? <p className="text-xs font-medium text-red-700 dark:text-red-300">{stripeErr}</p> : null}
            {stripeConnected ? (
              <div className="space-y-3 rounded-lg border-2 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-900">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Connected</p>
                {stripeAccountId ? (
                  <p className={`${mutedClass} font-mono`}>Account: {stripeAccountId}</p>
                ) : null}
                {canManageIntegrations ? (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={stripeBusy}
                      onClick={() => void handleStripeSync()}
                      className="rounded-lg border-2 border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
                    >
                      {stripeBusy ? 'Working…' : 'Sync Stripe data'}
                    </button>
                    <button
                      type="button"
                      disabled={stripeBusy}
                      onClick={() => void handleStripeDisconnect()}
                      className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 hover:bg-red-100 disabled:opacity-50 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100 dark:hover:bg-red-900/40"
                    >
                      Disconnect Stripe
                    </button>
                  </div>
                ) : (
                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">Only admins and owners can disconnect.</p>
                )}
              </div>
            ) : (
              canManageIntegrations && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">Stripe API key</label>
                    <input
                      type="password"
                      value={stripeApiKey}
                      onChange={(e) => setStripeApiKey(e.target.value)}
                      placeholder="sk_live_… or sk_test_…"
                      className={fieldInputClass + ' font-mono'}
                      autoComplete="off"
                    />
                  </div>
                  {stripeErr ? <p className="text-xs font-medium text-red-700 dark:text-red-300">{stripeErr}</p> : null}
                  <button
                    type="button"
                    disabled={stripeBusy || !stripeApiKey.trim()}
                    onClick={() => void handleStripeConnect()}
                    className="w-full rounded-lg border-2 border-violet-700 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-violet-700 disabled:opacity-50"
                  >
                    {stripeBusy ? 'Connecting…' : 'Connect Stripe'}
                  </button>
                </div>
              )
            )}
            {!canManageIntegrations && !stripeConnected && (
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">Only admins and owners can connect Stripe.</p>
            )}
          </div>
        </SquareModalShell>
      )}

      {modal === 'calcom' && (
        <SquareModalShell title="Cal.com" onClose={() => setModal(null)}>
          <div className="space-y-5">
            <BeginnerSetupGuide
              intro="Cal.com connects your booking calendar to Sweep. You need an API key from inside your Cal.com account."
              steps={[
                <>
                  Open{' '}
                  <a href="https://app.cal.com" target="_blank" rel="noopener noreferrer" className={linkClass}>
                    app.cal.com
                  </a>{' '}
                  and sign in.
                </>,
                <>
                  Click your profile picture (top right), then <strong>Settings</strong>.
                </>,
                <>
                  In the settings sidebar, open <strong>Developer</strong>, then <strong>API keys</strong>.
                </>,
                <>
                  Create a new key if you need one, then copy the key (it usually starts with <code className="rounded bg-zinc-200 px-1 text-xs dark:bg-zinc-800">cal_</code>). Paste it in the field below.
                </>,
                <>
                  <strong>Important:</strong> Sweep can only use one scheduling provider at a time. If Calendly is connected, disconnect it first before connecting Cal.com.
                </>,
              ]}
            />
            <p className={mutedClass}>One calendar provider at a time. Disconnect Calendly before connecting Cal.com.</p>
            {calcomConnected ? (
              <div className="space-y-2 rounded-lg border-2 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-900">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Connected</p>
                {calcomSummary?.account_email ? (
                  <p className={`${mutedClass}`}>{calcomSummary.account_email}</p>
                ) : null}
                {canManageIntegrations ? (
                  <button
                    type="button"
                    disabled={calcomBusy}
                    onClick={() => void handleCalComDisconnect()}
                    className="mt-2 w-full rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
            ) : (
              canManageIntegrations && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">API key</label>
                    <input
                      type="password"
                      value={calcomKey}
                      onChange={(e) => setCalcomKey(e.target.value)}
                      placeholder="cal_…"
                      className={fieldInputClass + ' font-mono'}
                      autoComplete="off"
                    />
                    <p className={`mt-1 ${mutedClass}`}>
                      <a
                        href="https://app.cal.com/settings/developer/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        Cal.com → Developer → API keys
                      </a>
                    </p>
                  </div>
                  {calendlyConnected ? (
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Disconnect Calendly first.</p>
                  ) : null}
                  {calcomErr ? <p className="text-xs font-medium text-red-700 dark:text-red-300">{calcomErr}</p> : null}
                  <button
                    type="button"
                    disabled={calcomBusy || !calcomKey.trim() || calendlyConnected}
                    onClick={() => void handleCalComConnect()}
                    className="w-full rounded-lg border-2 border-zinc-800 bg-zinc-900 py-2.5 text-sm font-semibold text-white dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900"
                  >
                    {calcomBusy ? 'Connecting…' : 'Connect Cal.com'}
                  </button>
                </div>
              )
            )}
            {!canManageIntegrations && !calcomConnected && (
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">Only admins and owners can connect.</p>
            )}
          </div>
        </SquareModalShell>
      )}

      {modal === 'calendly' && (
        <SquareModalShell title="Calendly" onClose={() => setModal(null)}>
          <div className="space-y-5">
            <BeginnerSetupGuide
              intro="Calendly uses a personal access token—a long password-like string—to let Sweep read your scheduling data. You create it from your Calendly account."
              steps={[
                <>
                  Open{' '}
                  <a href="https://calendly.com" target="_blank" rel="noopener noreferrer" className={linkClass}>
                    calendly.com
                  </a>{' '}
                  and sign in.
                </>,
                <>
                  Click <strong>Integrations</strong> (or your account menu → <strong>Integrations</strong>, depending on your Calendly layout).
                </>,
                <>
                  Open the <strong>API and webhooks</strong> section (sometimes labeled <strong>API</strong>).
                </>,
                <>
                  Generate a <strong>personal access token</strong>, copy the full token Calendly shows you, and paste it below. If you lose it, generate a new one—old tokens can be revoked from the same page.
                </>,
                <>
                  <strong>Important:</strong> Disconnect Cal.com in Sweep first; only one calendar connection can be active at a time.
                </>,
              ]}
            />
            <p className={mutedClass}>Personal access token. Disconnect Cal.com before connecting Calendly.</p>
            {calendlyConnected ? (
              <div className="space-y-2 rounded-lg border-2 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-900">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Connected</p>
                {calendlySummary?.account_email ? (
                  <p className={mutedClass}>{calendlySummary.account_email}</p>
                ) : null}
                {canManageIntegrations ? (
                  <button
                    type="button"
                    disabled={calendlyBusy}
                    onClick={() => void handleCalendlyDisconnect()}
                    className="mt-2 w-full rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
                  >
                    Disconnect
                  </button>
                ) : null}
              </div>
            ) : (
              canManageIntegrations && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">Personal access token</label>
                    <input
                      type="password"
                      value={calendlyKey}
                      onChange={(e) => setCalendlyKey(e.target.value)}
                      placeholder="Calendly PAT"
                      className={fieldInputClass + ' font-mono'}
                      autoComplete="off"
                    />
                    <p className={`mt-1 ${mutedClass}`}>
                      <a
                        href="https://calendly.com/integrations/api_webhooks"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        Calendly → Integrations → API
                      </a>
                    </p>
                  </div>
                  {calcomConnected ? (
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Disconnect Cal.com first.</p>
                  ) : null}
                  {calendlyErr ? <p className="text-xs font-medium text-red-700 dark:text-red-300">{calendlyErr}</p> : null}
                  <button
                    type="button"
                    disabled={calendlyBusy || !calendlyKey.trim() || calcomConnected}
                    onClick={() => void handleCalendlyConnect()}
                    className="w-full rounded-lg border-2 border-sky-800 bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    {calendlyBusy ? 'Connecting…' : 'Connect Calendly'}
                  </button>
                </div>
              )
            )}
            {!canManageIntegrations && !calendlyConnected && (
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">Only admins and owners can connect.</p>
            )}
          </div>
        </SquareModalShell>
      )}

      {modal === 'whop' && (
        <SquareModalShell title="Whop" onClose={() => setModal(null)}>
          <div className="space-y-5">
            <BeginnerSetupGuide
              intro="Whop needs two pieces of information: a Company API key (secret) and your Company ID (a short public code starting with biz_). Both come from Whop’s developer area."
              steps={[
                <>
                  Open{' '}
                  <a href="https://whop.com/dashboard/developer" target="_blank" rel="noopener noreferrer" className={linkClass}>
                    whop.com/dashboard/developer
                  </a>{' '}
                  while logged into the Whop account that owns your products.
                </>,
                <>
                  Create or copy a <strong>Company API key</strong> with permission to read payments (and related data your admin expects). Paste that key into the first field below.
                </>,
                <>
                  Find your <strong>Company ID</strong> in the same dashboard—it looks like <code className="rounded bg-zinc-200 px-1 text-xs text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">biz_xxxxxxxx</code>. Copy it exactly into the second field.
                </>,
                <>If a value does not work, double-check you are in the correct Whop company and that the key is still active.</>,
              ]}
            />
            <p className={mutedClass}>
              Company API key and company ID (<code className="rounded bg-zinc-200 px-1 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">biz_…</code>) for Finances and revenue views.
            </p>
            {whopConnected ? (
              <div className="space-y-2 rounded-lg border-2 border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-600 dark:bg-zinc-900">
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">Connected</p>
                {whopSummary?.company_id ? (
                  <p className={`${mutedClass} font-mono`}>{whopSummary.company_id}</p>
                ) : null}
                {canManageIntegrations ? (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={whopBusy}
                      onClick={() => void handleWhopSync()}
                      className="rounded-lg border-2 border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-950 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-100"
                    >
                      {whopBusy ? 'Working…' : 'Sync Whop'}
                    </button>
                    <button
                      type="button"
                      disabled={whopBusy}
                      onClick={() => void handleWhopDisconnect()}
                      className="rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-100"
                    >
                      Disconnect Whop
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              canManageIntegrations && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">Whop Company API key</label>
                    <input
                      type="password"
                      autoComplete="off"
                      placeholder="Paste your secret API key from Whop Developer"
                      value={whopKey}
                      onChange={(e) => setWhopKey(e.target.value)}
                      className={fieldInputClass + ' font-mono'}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-800 dark:text-zinc-200">Company ID</label>
                    <input
                      placeholder="biz_… (from Whop dashboard)"
                      value={whopCompanyId}
                      onChange={(e) => setWhopCompanyId(e.target.value)}
                      className={fieldInputClass + ' font-mono'}
                    />
                  </div>
                  {whopErr ? <p className="text-xs font-medium text-red-700 dark:text-red-300">{whopErr}</p> : null}
                  <button
                    type="button"
                    disabled={whopBusy || !whopKey.trim() || !whopCompanyId.trim()}
                    onClick={() => void handleWhopConnect()}
                    className="w-full rounded-lg border-2 border-indigo-800 bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {whopBusy ? 'Connecting…' : 'Connect Whop'}
                  </button>
                </div>
              )
            )}
            {!canManageIntegrations && !whopConnected && (
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200">Only admins and owners can connect Whop.</p>
            )}
          </div>
        </SquareModalShell>
      )}

      {modal === 'claude' && (
        <SquareModalShell title="Claude custom connector" onClose={() => setModal(null)}>
          <div className="flex min-h-0 flex-col space-y-5">
            <BeginnerSetupGuide
              intro="Claude connects to SweepOS with a remote MCP URL (no API key in Sweep). When you connect, Claude opens Google sign-in so it can access the same org you use in Sweep. Use a public HTTPS API URL in production — localhost only works for local Claude Desktop testing."
              steps={[
                <>
                  In Sweep, open <strong>Settings → Profile</strong> and <strong>Connect Google</strong> (or sign in with Google on login) so your account can authorize Claude.
                </>,
                <>
                  In Claude (claude.ai or Desktop), go to <strong>Settings → Connectors → Add custom connector</strong>.
                </>,
                <>
                  Paste the <strong>Remote MCP URL</strong> below. Leave OAuth Client ID and Secret empty (Sweep supports dynamic client registration).
                </>,
                <>
                  Click <strong>Add</strong>, then <strong>Connect</strong>, and finish Google sign-in for your Sweep account.
                </>,
                <>
                  In a chat, open <strong>+ → Connectors</strong> and enable SweepOS. Claude can then read clients, Marketing Intel, Terminal, and (with Brevo connected) send client email after you confirm.
                </>,
              ]}
            />

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Remote MCP URL
              </p>
              {/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(MCP_RESOURCE_URL) && (
                <p className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                  This URL is local-only. <strong>Claude.ai</strong> cannot reach localhost — use your public HTTPS API
                  (e.g. <code className="text-[11px]">https://api.sweepai.site/mcp</code>) for Claude.ai. Localhost works
                  only with Claude Desktop / Claude Code on this machine.
                </p>
              )}
              {!MCP_RESOURCE_URL.startsWith('https://') &&
                !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\b/i.test(MCP_RESOURCE_URL) && (
                  <p className="rounded-lg border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                    Claude.ai requires an <strong>https://</strong> MCP URL in production.
                  </p>
                )}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <code className="block min-w-0 flex-1 break-all rounded-lg border-2 border-zinc-300 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50">
                  {MCP_RESOURCE_URL}
                </code>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border-2 border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(MCP_RESOURCE_URL);
                      setMcpUrlCopied(true);
                      window.setTimeout(() => setMcpUrlCopied(false), 2000);
                    } catch {
                      setError('Could not copy MCP URL. Select and copy it manually.');
                    }
                  }}
                >
                  {mcpUrlCopied ? 'Copied' : 'Copy URL'}
                </button>
              </div>
              <p className={mutedClass}>
                Built from <code className="text-[11px]">NEXT_PUBLIC_API_BASE_URL</code>. In production it must be HTTPS
                and match the backend <code className="text-[11px]">MCP_RESOURCE_URL</code> exactly (Claude sends that
                value as the OAuth <code className="text-[11px]">resource</code> parameter).
              </p>
              <p className={mutedClass}>
                Browser console noise: a <code className="text-[11px]">405</code> on{" "}
                <code className="text-[11px]">claude.ai/v1/toolbox/shttp/mcp/…</code> or{" "}
                <code className="text-[11px]">user_settings</code> 404 is Claude’s own UI — check your API logs for{" "}
                <code className="text-[11px]">POST /mcp/oauth/token</code> instead.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
                Claude Code
              </p>
              <pre className="overflow-x-auto rounded-lg border-2 border-zinc-300 bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50">
                {`claude mcp add --transport http sweepos ${MCP_RESOURCE_URL}`}
              </pre>
              <p className={mutedClass}>Then run <code className="text-[11px]">/mcp</code> in Claude Code to authenticate.</p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/50">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">What Claude can access</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
                <li>Client profiles and call insights</li>
                <li>Marketing Intel (objections, wins, themes, ICP)</li>
                <li>Org Intelligence profile (business context, offers + pricing, sales approach)</li>
                <li>Terminal dashboard (cash, MRR, calendar, failed payments)</li>
                <li>Brevo senders + send client email (requires Brevo connected; confirm before send)</li>
              </ul>
            </div>
          </div>
        </SquareModalShell>
      )}
    </div>
  );
}
