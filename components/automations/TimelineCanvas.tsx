'use client';

import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  apiClient,
  type AutomationEmailJob,
  type AutomationPlaybook,
  type AutomationRule,
} from '@/lib/api';
import type { Client } from '@/types/client';
import PlaybookModal from './PlaybookModal';
import WaitDelayModal, { type WaitDelayMode } from './WaitDelayModal';
import BookingTriggerModal from './BookingTriggerModal';

/**
 * Single-column, n8n-inspired automation timeline.
 *
 * Visual model: one consecutive vertical journey from "client paid" to
 * "client offboards". Trigger -> Action -> Wait -> Action -> [Win section]
 * -> [Offboarding section] -> End.
 *
 * Conventions borrowed from n8n:
 *   - Dotted grid canvas background
 *   - Rounded rectangle nodes with a colored left accent strip
 *   - Vertical connection lines with port dots top/bottom
 *   - Wait nodes are compact centered squares (clickable -> edits delay)
 *   - "Sections" wrap conditional sub-flows (Win Detected, Offboarding Window)
 *     with a labeled translucent frame, mirroring n8n's grouped node UI
 *
 * Energization (when Preview as client is set):
 *   - Active connector lines: vertical animated gradient pulses flowing
 *     downward
 *   - Active nodes: colored ring + outer glow ring (animated pulse)
 *   - Inactive sections: muted opacity, dimmed accent
 */

type StageKey = 'pre_sale_booking' | 'first_payment' | 'win' | 'offboarding';

type NodeStatus = 'idle' | 'eligible' | 'pending' | 'sent' | 'failed' | 'skipped';

interface NodeRuntime {
  status: NodeStatus;
  job?: AutomationEmailJob;
  triggerFired: boolean;
}

interface TimelineCanvasProps {
  rules: AutomationRule[];
  previewClient: Client | null;
  previewClientId: string | null;
  previewClientOptions: Client[];
  onPreviewClientChange: (id: string | null) => void;
  onRuleSaved: (next: AutomationRule) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delayLabel(seconds: number, mode: WaitDelayMode = 'after_previous'): string {
  if (mode === 'before_meeting') {
    if (!seconds || seconds <= 0) return 'At booking';
    if (seconds < 3_600) return `${Math.round(seconds / 60)} min before meeting`;
    if (seconds < 86_400) return `${Math.round(seconds / 3_600)} h before meeting`;
    return `${Math.round(seconds / 86_400)} d before meeting`;
  }
  if (!seconds || seconds <= 0) return 'Immediate';
  if (seconds < 3_600) return `Wait ${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `Wait ${Math.round(seconds / 3_600)} h`;
  return `Wait ${Math.round(seconds / 86_400)} d`;
}

function compactDelayLabel(seconds: number, mode: WaitDelayMode = 'after_previous'): string {
  if (mode === 'before_meeting') {
    if (!seconds || seconds <= 0) return 'At start';
    if (seconds < 3_600) return `${Math.round(seconds / 60)}m pre`;
    if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h pre`;
    return `${Math.round(seconds / 86_400)}d pre`;
  }
  if (!seconds || seconds <= 0) return 'Now';
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

function deriveLitStages(client: Client | null): Set<StageKey> {
  const lit = new Set<StageKey>();
  if (!client) return lit;
  const { lifecycle_state: lifecycle, lifetime_revenue_cents: ltv } = client;
  // Pre-sale booking: lit only when the client has not paid yet (the gate the engine
  // applies). Once they have any revenue we shift the energy down to first_payment.
  if ((ltv ?? 0) === 0 && lifecycle !== 'offboarding') {
    lit.add('pre_sale_booking');
  }
  if ((ltv ?? 0) > 0 || lifecycle === 'active' || lifecycle === 'offboarding') {
    lit.add('first_payment');
  }
  if (lifecycle === 'offboarding') {
    lit.add('offboarding');
  }
  // Win lane only lights from job evidence (handled below).
  return lit;
}

function deriveNodeRuntimes(
  client: Client | null,
  jobs: AutomationEmailJob[],
): Record<AutomationPlaybook, NodeRuntime> {
  const lit = deriveLitStages(client);
  const runtimes: Record<AutomationPlaybook, NodeRuntime> = {
    pre_sale_post_booking: { status: 'idle', triggerFired: lit.has('pre_sale_booking') },
    pre_sale_pre_meeting: { status: 'idle', triggerFired: lit.has('pre_sale_booking') },
    first_payment_onboarding: { status: 'idle', triggerFired: lit.has('first_payment') },
    first_payment_referral: { status: 'idle', triggerFired: lit.has('first_payment') },
    win_combined_ask: { status: 'idle', triggerFired: false },
    offboarding_recap_ask: { status: 'idle', triggerFired: lit.has('offboarding') },
  };

  const seen = new Set<AutomationPlaybook>();
  for (const job of jobs) {
    const pb = job.playbook;
    if (seen.has(pb)) continue;
    seen.add(pb);
    runtimes[pb].triggerFired = true;
    runtimes[pb].job = job;
    switch (job.state) {
      case 'sent':
        runtimes[pb].status = 'sent';
        break;
      case 'failed':
        runtimes[pb].status = 'failed';
        break;
      case 'skipped':
      case 'canceled':
        runtimes[pb].status = 'skipped';
        break;
      case 'awaiting_approval':
      case 'scheduled':
      case 'ready':
      case 'sending':
        runtimes[pb].status = 'pending';
        break;
      default:
        runtimes[pb].status = 'idle';
    }
  }

  // Eligible-but-not-yet-fired nodes inherit a soft 'on path' glow.
  for (const pb of Object.keys(runtimes) as AutomationPlaybook[]) {
    if (runtimes[pb].triggerFired && runtimes[pb].status === 'idle') {
      runtimes[pb].status = 'eligible';
    }
  }
  return runtimes;
}

function subjectFallback(pb: AutomationPlaybook): string {
  switch (pb) {
    case 'pre_sale_post_booking':
      return 'Quick note before our call';
    case 'pre_sale_pre_meeting':
      return 'Looking forward to talking soon';
    case 'first_payment_onboarding':
      return 'Welcome — your first steps';
    case 'first_payment_referral':
      return 'One quick favor — share with a friend';
    case 'win_combined_ask':
      return 'Combined ask after a win';
    case 'offboarding_recap_ask':
      return 'Your wins so far — and what’s next';
    default:
      return pb;
  }
}

function formatRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return iso;
    const diff = (Date.now() - t) / 1000;
    if (Math.abs(diff) < 60) return diff > 0 ? 'just now' : 'in <1m';
    const abs = Math.abs(diff);
    if (abs < 3_600) {
      const m = Math.round(abs / 60);
      return diff > 0 ? `${m}m ago` : `in ${m}m`;
    }
    if (abs < 86_400) {
      const h = Math.round(abs / 3_600);
      return diff > 0 ? `${h}h ago` : `in ${h}h`;
    }
    const d = Math.round(abs / 86_400);
    return diff > 0 ? `${d}d ago` : `in ${d}d`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Top-level canvas
// ---------------------------------------------------------------------------

export default function TimelineCanvas({
  rules,
  previewClient,
  previewClientId,
  previewClientOptions,
  onPreviewClientChange,
  onRuleSaved,
}: TimelineCanvasProps) {
  const [activeRule, setActiveRule] = useState<AutomationRule | null>(null);
  const [waitTarget, setWaitTarget] = useState<AutomationRule | null>(null);
  const [waitMode, setWaitMode] = useState<WaitDelayMode>('after_previous');
  const [bookingTriggerRule, setBookingTriggerRule] = useState<AutomationRule | null>(null);
  const [jobs, setJobs] = useState<AutomationEmailJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const ruleByPlaybook = useMemo(() => {
    const map: Partial<Record<AutomationPlaybook, AutomationRule>> = {};
    for (const r of rules) map[r.playbook] = r;
    return map;
  }, [rules]);

  useEffect(() => {
    if (!previewClient) {
      setJobs([]);
      return;
    }
    let cancelled = false;
    setJobsLoading(true);
    apiClient
      .listAutomationJobs({ client_id: previewClient.id, limit: 25 })
      .then((res) => {
        if (cancelled) return;
        setJobs(res.items || []);
      })
      .catch(() => {
        if (cancelled) return;
        setJobs([]);
      })
      .finally(() => {
        if (cancelled) return;
        setJobsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewClient]);

  const runtimes = useMemo(
    () => deriveNodeRuntimes(previewClient, jobs),
    [previewClient, jobs],
  );

  const preSale = ruleByPlaybook.pre_sale_post_booking;
  const preMeeting = ruleByPlaybook.pre_sale_pre_meeting;
  const onboarding = ruleByPlaybook.first_payment_onboarding;
  const referral = ruleByPlaybook.first_payment_referral;
  const winAsk = ruleByPlaybook.win_combined_ask;
  const offRecap = ruleByPlaybook.offboarding_recap_ask;

  const openWait = (rule: AutomationRule | undefined, mode: WaitDelayMode) => {
    if (!rule) return;
    setWaitMode(mode);
    setWaitTarget(rule);
  };

  // Connector activation:
  //   - Booking trigger -> Pre-sale email: lit when client has booked but not paid
  //   - First Payment trigger -> Onboarding: lit when client has paid
  //   - Onboarding -> Wait -> Referral ask: lit chain after each step lands
  //   - Active program -> Win section: lit while client is active or has wins
  //   - Win section internal chain: lit when win has fired
  //   - Win/Active -> Offboarding section: lit when client is offboarding
  //   - Offboarding internal: lit when offboarding has fired
  const pre = runtimes.pre_sale_post_booking;
  const preMeet = runtimes.pre_sale_pre_meeting;
  const fp = runtimes.first_payment_onboarding;
  const ref = runtimes.first_payment_referral;
  const win = runtimes.win_combined_ask;
  const off = runtimes.offboarding_recap_ask;

  const inActiveProgram =
    !!previewClient &&
    (previewClient.lifecycle_state === 'active' ||
      previewClient.lifecycle_state === 'offboarding' ||
      (previewClient.lifetime_revenue_cents ?? 0) > 0);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 dark:border-white/10 shadow-lg shadow-violet-500/5">
        <CanvasHeader
          previewClient={previewClient}
          previewClientId={previewClientId}
          previewClientOptions={previewClientOptions}
          onPreviewClientChange={onPreviewClientChange}
          jobsLoading={jobsLoading}
        />

        <div className="automation-canvas relative px-4 sm:px-10 py-10 sm:py-14 bg-gradient-to-b from-gray-50 via-gray-50 to-violet-50/30 dark:from-gray-950 dark:via-gray-950 dark:to-violet-950/20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.08),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.12),transparent_55%)]" />
          <div className="relative mx-auto max-w-lg flex flex-col items-stretch gap-0">
            {/* ──────────────── Stage 0: Pre-sale post-booking ──────────────── */}
            <TriggerNode
              kind="calendar"
              title="Booking lands"
              subtitle="Calendly · Cal.com"
              accent="violet"
              fired={pre.triggerFired}
              onClick={() => preSale && setBookingTriggerRule(preSale)}
              editable={!!preSale}
            />
            <Connector state={edgeFromDownstream(pre)} />

            <WaitNode
              rule={preSale}
              active={pre.triggerFired || pre.status === 'pending' || pre.status === 'sent'}
              mode="after_booking"
              onClick={() => openWait(preSale, 'after_booking')}
            />
            <Connector state={edgeFromDownstream(pre)} />

            <PlaybookNode
              rule={preSale}
              runtime={pre}
              accent="violet"
              kind="email"
              shortLabel="Post-booking"
              onClick={() => preSale && setActiveRule(preSale)}
            />
            <Connector state={edgeFromUpstream(pre)} />

            <WaitNode
              rule={preMeeting}
              active={
                preMeet.triggerFired ||
                preMeet.status === 'pending' ||
                preMeet.status === 'sent' ||
                pre.status === 'sent'
              }
              mode="before_meeting"
              onClick={() => openWait(preMeeting, 'before_meeting')}
            />
            <Connector state={edgeFromDownstream(preMeet)} />

            <PlaybookNode
              rule={preMeeting}
              runtime={preMeet}
              accent="violet"
              kind="email"
              shortLabel="Pre-meeting"
              onClick={() => preMeeting && setActiveRule(preMeeting)}
            />

            <Connector
              state={
                fp.status === 'sent'
                  ? 'sent'
                  : fp.status === 'pending'
                    ? 'pending'
                    : fp.triggerFired
                      ? 'eligible'
                      : 'idle'
              }
              extraTall
            />

            {/* ──────────────── Stage 1: First Payment ──────────────── */}
            <TriggerNode
              kind="payment"
              title="First payment"
              subtitle="Stripe · Whop"
              accent="emerald"
              fired={fp.triggerFired}
            />
            <Connector state={edgeFromDownstream(fp)} />

            <PlaybookNode
              rule={onboarding}
              runtime={fp}
              accent="emerald"
              kind="email"
              shortLabel="Onboarding"
              onClick={() => onboarding && setActiveRule(onboarding)}
            />
            <Connector state={edgeFromUpstream(fp)} />

            <WaitNode
              rule={referral}
              active={fp.status === 'sent' || fp.status === 'pending'}
              onClick={() => openWait(referral, 'after_previous')}
            />
            <Connector state={edgeFromDownstream(ref)} />

            <PlaybookNode
              rule={referral}
              runtime={ref}
              accent="emerald"
              kind="gift"
              shortLabel="Referral ask"
              onClick={() => referral && setActiveRule(referral)}
            />

            {/* ──────────────── Stage 2: Active program — Win section ──────────────── */}
            <Connector
              state={
                win.status === 'sent'
                  ? 'sent'
                  : win.status === 'pending'
                    ? 'pending'
                    : inActiveProgram
                      ? 'eligible'
                      : 'idle'
              }
              extraTall
            />

            <SectionFrame
              kind="win"
              title="Win detected"
              subtitle="Fathom call insight tags a win during the active program"
              accent="amber"
              activated={win.triggerFired || inActiveProgram}
              activatedStrong={win.triggerFired}
            >
              <WaitNode
                rule={winAsk}
                active={win.triggerFired}
                onClick={() => openWait(winAsk, 'after_previous')}
              />
              <Connector state={edgeFromDownstream(win)} />
              <PlaybookNode
                rule={winAsk}
                runtime={win}
                accent="amber"
                kind="handshake"
                shortLabel="Combined ask"
                onClick={() => winAsk && setActiveRule(winAsk)}
              />
            </SectionFrame>

            {/* ──────────────── Stage 3: Offboarding window ──────────────── */}
            <Connector
              state={
                off.status === 'sent'
                  ? 'sent'
                  : off.status === 'pending'
                    ? 'pending'
                    : off.triggerFired || previewClient?.lifecycle_state === 'offboarding'
                      ? 'eligible'
                      : 'idle'
              }
              extraTall
            />

            <SectionFrame
              kind="graduate"
              title="Offboarding"
              subtitle="~75% program progress"
              accent="violet"
              activated={
                off.triggerFired || previewClient?.lifecycle_state === 'offboarding'
              }
              activatedStrong={off.triggerFired}
            >
              {/* Offboarding has no per-section wait — it's an immediate recap. The
                  delay is still editable from the playbook itself. */}
              <PlaybookNode
                rule={offRecap}
                runtime={off}
                accent="violet"
                kind="recap"
                shortLabel="Recap & ask"
                onClick={() => offRecap && setActiveRule(offRecap)}
              />
            </SectionFrame>

            <Connector state={off.status === 'sent' ? 'sent' : 'idle'} />
            <EndNode
              title="Journey complete"
              subtitle="Client offboarded"
              activated={off.status === 'sent'}
            />
          </div>

          <Legend hasPreview={!!previewClient} />
        </div>
      </div>

      <PlaybookModal
        rule={activeRule}
        onClose={() => setActiveRule(null)}
        onSaved={(next) => {
          onRuleSaved(next);
          setActiveRule(next);
        }}
        previewClientId={previewClient?.id ?? null}
      />

      <WaitDelayModal
        rule={waitTarget}
        mode={waitMode}
        onClose={() => setWaitTarget(null)}
        onSaved={(next) => {
          onRuleSaved(next);
          setWaitTarget(null);
        }}
      />

      <BookingTriggerModal
        rule={bookingTriggerRule}
        onClose={() => setBookingTriggerRule(null)}
        onSaved={(next) => {
          onRuleSaved(next);
          setBookingTriggerRule(null);
        }}
      />

      {/* Canvas grid + connector animation */}
      <style jsx global>{`
        .automation-canvas {
          background-image: radial-gradient(circle, rgba(120, 120, 140, 0.12) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        @keyframes wire-flow-vert {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(400%);
          }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CanvasHeader({
  previewClient,
  previewClientId,
  previewClientOptions,
  onPreviewClientChange,
  jobsLoading,
}: {
  previewClient: Client | null;
  previewClientId: string | null;
  previewClientOptions: Client[];
  onPreviewClientChange: (id: string | null) => void;
  jobsLoading: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-gray-200/80 dark:border-white/10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-4 sm:p-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
          Client journey
        </p>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Automation timeline</h3>
        <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 max-w-md leading-relaxed">
          Click an email node to edit its playbook, or a wait node to change the delay.
        </p>
      </div>
      <div className="w-full sm:w-auto sm:min-w-[14rem] space-y-1.5">
        <label htmlFor="automation-preview-client" className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
          Preview path
        </label>
        <select
          id="automation-preview-client"
          value={previewClientId ?? ''}
          onChange={(e) => onPreviewClientChange(e.target.value || null)}
          className="w-full rounded-lg border border-gray-300/80 dark:border-white/15 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
        >
          <option value="">No client — static view</option>
          {previewClientOptions.map((c) => {
            const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || c.email || c.id;
            return (
              <option key={c.id} value={c.id}>
                {name}
              </option>
            );
          })}
        </select>
        {previewClient ? (
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5">
            {jobsLoading ? (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ) : (
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
            )}
            {jobsLoading ? 'Loading journey…' : 'Path energized for this client'}
          </p>
        ) : (
          <p className="text-[11px] text-gray-500">Select a client to highlight their progress</p>
        )}
      </div>
    </div>
  );
}

function NodeIcon({ kind }: { kind: 'calendar' | 'payment' | 'email' | 'gift' | 'handshake' | 'recap' | 'wait' | 'win' | 'graduate' | 'end' }) {
  const cls = 'h-4 w-4';
  switch (kind) {
    case 'calendar':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'payment':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      );
    case 'wait':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'gift':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      );
    default:
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      );
  }
}

function TriggerNode({
  kind,
  title,
  subtitle,
  accent,
  fired,
  onClick,
  editable = false,
}: {
  kind: 'calendar' | 'payment';
  title: string;
  subtitle: string;
  accent: 'emerald' | 'amber' | 'violet';
  fired: boolean;
  onClick?: () => void;
  editable?: boolean;
}) {
  const accentBg = {
    emerald: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30',
    amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30',
    violet: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/30',
  }[accent];
  const accentGlow = {
    emerald: 'shadow-[0_0_20px_rgba(16,185,129,0.2)] ring-emerald-500/40',
    amber: 'shadow-[0_0_20px_rgba(245,158,11,0.2)] ring-amber-500/40',
    violet: 'shadow-[0_0_20px_rgba(139,92,246,0.25)] ring-violet-500/40',
  }[accent];

  const inner = (
    <>
      <div
        className={`shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${accentBg}`}
        aria-hidden
      >
        <NodeIcon kind={kind} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
          Trigger
        </div>
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</div>
      </div>
      {editable ? (
        <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          Edit
        </span>
      ) : null}
    </>
  );

  return (
    <div className="relative">
      {editable && onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`group relative z-10 flex items-center gap-3 rounded-xl px-4 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm ring-1 w-full transition-all ${
            fired ? accentGlow : 'ring-gray-200/80 dark:ring-white/10 shadow-sm'
          } hover:shadow-lg hover:-translate-y-0.5 cursor-pointer text-left`}
          title="Edit booking trigger"
          aria-label={`Edit booking trigger (${title})`}
        >
          {inner}
        </button>
      ) : (
        <div
          className={`relative z-10 flex items-center gap-3 rounded-xl px-4 py-3 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm ring-1 w-full transition-all ${
            fired ? accentGlow : 'ring-gray-200/80 dark:ring-white/10 shadow-sm'
          }`}
        >
          {inner}
        </div>
      )}
      <Port active={fired} side="bottom" tone={accent} />
    </div>
  );
}

function EndNode({
  title,
  subtitle,
  activated,
}: {
  title: string;
  subtitle: string;
  activated: boolean;
}) {
  return (
    <div className="relative">
      <Port active={activated} side="top" tone="emerald" />
      <div
        className={`relative flex items-center gap-3 rounded-xl px-4 py-3 bg-white/90 dark:bg-gray-900/90 ring-1 w-full ${
          activated
            ? 'ring-emerald-500/40 shadow-[0_0_16px_rgba(16,185,129,0.15)]'
            : 'ring-gray-200/80 dark:ring-white/10'
        }`}
      >
        <div className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gray-500/10 text-gray-600 dark:text-gray-300 ring-1 ring-gray-400/30" aria-hidden>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">End</div>
          <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">{subtitle}</div>
        </div>
      </div>
    </div>
  );
}

// -- Playbook (action) node

const NODE_ACCENT = {
  emerald: {
    strip: 'bg-emerald-500',
    ringActive: 'ring-emerald-500/60',
    ringIdle: 'ring-gray-300/60 dark:ring-gray-700/60',
  },
  amber: {
    strip: 'bg-amber-500',
    ringActive: 'ring-amber-500/60',
    ringIdle: 'ring-gray-300/60 dark:ring-gray-700/60',
  },
  violet: {
    strip: 'bg-violet-500',
    ringActive: 'ring-violet-500/60',
    ringIdle: 'ring-gray-300/60 dark:ring-gray-700/60',
  },
} as const;

const STATUS_PILL: Record<NodeStatus, { label: string; cls: string }> = {
  idle: { label: 'Idle', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400' },
  eligible: { label: 'Next', cls: 'bg-violet-500/15 text-violet-700 dark:text-violet-300' },
  pending: { label: 'Pending', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-200' },
  sent: { label: 'Sent', cls: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' },
  failed: { label: 'Failed', cls: 'bg-red-500/15 text-red-800 dark:text-red-200' },
  skipped: { label: 'Skipped', cls: 'bg-gray-200/60 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400' },
};

function PlaybookNode({
  rule,
  runtime,
  accent,
  kind,
  shortLabel,
  onClick,
}: {
  rule: AutomationRule | undefined;
  runtime: NodeRuntime;
  accent: 'emerald' | 'amber' | 'violet';
  kind: 'email' | 'gift' | 'handshake' | 'recap';
  shortLabel: string;
  onClick: () => void;
}) {
  const enabled = rule?.enabled ?? false;
  const accentDef = NODE_ACCENT[accent];
  const pill = STATUS_PILL[runtime.status];
  const isActive = runtime.status !== 'idle' && runtime.status !== 'skipped';
  const iconBg = {
    emerald: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-500/12 text-amber-700 dark:text-amber-300',
    violet: 'bg-violet-500/12 text-violet-700 dark:text-violet-300',
  }[accent];

  return (
    <div className="relative">
      <Port
        active={isActive}
        side="top"
        tone={runtime.status === 'sent' ? 'emerald' : runtime.status === 'pending' ? 'amber' : 'violet'}
      />
      <button
        type="button"
        onClick={onClick}
        disabled={!rule}
        className={`group relative w-full text-left rounded-xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm ring-1 overflow-hidden transition-all ${
          isActive ? `${accentDef.ringActive} shadow-md` : accentDef.ringIdle
        } ${rule ? 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer' : 'opacity-50 cursor-not-allowed'} ${
          !enabled && rule ? 'opacity-80' : ''
        }`}
        aria-label={`Open ${shortLabel} playbook`}
      >
        <div className={`absolute inset-y-0 left-0 w-1 ${accentDef.strip}`} aria-hidden />

        <div className="pl-4 pr-3 py-3">
          <div className="flex items-start gap-3">
            <div className={`shrink-0 mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
              <NodeIcon kind={kind === 'gift' ? 'gift' : 'email'} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-500 dark:text-gray-400">
                  {shortLabel}
                </span>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pill.cls}`}>
                  {pill.label}
                </span>
              </div>
              <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug">
                {rule?.subject_template || subjectFallback(
                  rule?.playbook ?? ('first_payment_onboarding' as AutomationPlaybook),
                )}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ${
                    enabled
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/25'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 ring-gray-300/50 dark:ring-white/10'
                  }`}
                  title={enabled ? 'Automation is on' : 'Automation is off'}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${enabled ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-gray-400'}`}
                    aria-hidden
                  />
                  {enabled ? 'On' : 'Off'}
                </span>
                <span>
                  {rule?.content_mode === 'html_template' ? 'Template' : 'AI'}
                  {rule?.require_approval ? ' · Approval' : ''}
                </span>
                <span className="ml-auto opacity-0 group-hover:opacity-100 text-violet-600 dark:text-violet-400 font-medium transition-opacity">
                  Edit →
                </span>
              </div>
              {runtime.job ? (
                <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-500 truncate">
                  {runtime.status === 'sent' && runtime.job.dispatched_at
                    ? `Sent ${formatRelative(runtime.job.dispatched_at)}`
                    : runtime.status === 'pending' && runtime.job.scheduled_at
                      ? `Scheduled ${formatRelative(runtime.job.scheduled_at)}`
                      : runtime.status === 'failed'
                        ? `Failed: ${(runtime.job.error_text || 'unknown').slice(0, 48)}`
                        : null}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </button>
      <Port
        active={isActive}
        side="bottom"
        tone={runtime.status === 'sent' ? 'emerald' : runtime.status === 'pending' ? 'amber' : 'violet'}
      />
    </div>
  );
}

// -- Wait node (clickable; opens WaitDelayModal)

function WaitNode({
  rule,
  active,
  onClick,
  mode = 'after_previous',
}: {
  rule: AutomationRule | undefined;
  active: boolean;
  onClick: () => void;
  mode?: WaitDelayMode;
}) {
  const seconds = rule?.delay_seconds ?? 0;
  const fullLabel = delayLabel(seconds, mode);
  const label = compactDelayLabel(seconds, mode);
  const eyebrow = mode === 'before_meeting' ? 'Pre-call' : 'Wait';

  return (
    <div className="relative flex justify-center">
      <Port active={active} side="top" tone="amber" />
      <button
        type="button"
        onClick={onClick}
        disabled={!rule}
        className={`group relative flex h-[4.25rem] w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-lg bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm ring-1 transition-all ${
          active ? 'ring-amber-500/50 shadow-md' : 'ring-amber-500/20 dark:ring-amber-500/15'
        } ${rule ? 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
        title={`${eyebrow}: ${fullLabel}`}
        aria-label={`Edit wait delay (${fullLabel})`}
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-amber-500/12 text-amber-700 dark:text-amber-300">
          <NodeIcon kind="wait" />
        </span>
        <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400 leading-none">
          {eyebrow}
        </span>
        <span className="max-w-[3.5rem] truncate text-[11px] font-semibold text-gray-900 dark:text-gray-100 leading-tight text-center">
          {label}
        </span>
      </button>
      <Port active={active} side="bottom" tone="amber" />
    </div>
  );
}

// -- Section frame (n8n-style "grouped sub-flow")

function SectionFrame({
  kind,
  title,
  subtitle,
  accent,
  activated,
  activatedStrong,
  children,
}: {
  kind: 'win' | 'graduate';
  title: string;
  subtitle: string;
  accent: 'emerald' | 'amber' | 'violet';
  activated: boolean;
  activatedStrong: boolean;
  children: ReactNode;
}) {
  const ring = {
    emerald: activated ? 'ring-emerald-500/35' : 'ring-emerald-500/12',
    amber: activated ? 'ring-amber-500/40' : 'ring-amber-500/15',
    violet: activated ? 'ring-violet-500/40' : 'ring-violet-500/15',
  }[accent];
  const headerBg = {
    emerald: 'text-emerald-800 dark:text-emerald-200',
    amber: 'text-amber-900 dark:text-amber-200',
    violet: 'text-violet-800 dark:text-violet-200',
  }[accent];
  const innerBg = {
    emerald: 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]',
    amber: 'bg-amber-500/[0.05] dark:bg-amber-500/[0.08]',
    violet: 'bg-violet-500/[0.05] dark:bg-violet-500/[0.08]',
  }[accent];

  return (
    <div
      className={`relative rounded-xl ring-1 ${ring} ${innerBg} ${
        activated ? '' : 'opacity-75'
      } transition-all ${activatedStrong ? 'shadow-[0_0_24px_rgba(139,92,246,0.08)]' : ''}`}
    >
      <div className={`flex items-center gap-2 rounded-t-xl px-3 py-2 text-[11px] font-bold uppercase tracking-[0.1em] border-b border-black/5 dark:border-white/5 ${headerBg}`}>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white/50 dark:bg-black/20">
          {kind === 'win' ? '🏆' : '🎓'}
        </span>
        <span>{title}</span>
      </div>
      <div className="px-3 pt-2 pb-3">
        <p className="text-[11px] text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">{subtitle}</p>
        <div className="flex flex-col items-stretch gap-0">{children}</div>
      </div>
    </div>
  );
}

// -- Vertical connector with state-aware styling
//
// State semantics from the operator's POV:
//   - sent:     this edge has been traversed (the downstream email was sent).
//               Bold solid emerald, gentle inner pulse, white "✓ Sent" badge.
//   - pending:  the downstream is currently waiting / scheduled. Bold amber
//               line with a fast downward "data flowing" stream + "⏳ Pending"
//               badge.
//   - eligible: the downstream is on the client's path but hasn't fired yet.
//               Solid violet, soft downward stream + "↓ Next" badge.
//   - idle:     nothing's lit; thin dashed gray line, no badge.
//
// The active variants are intentionally chunkier than idle (4px vs 2px) and
// pick up an outer halo so it reads at a glance which path the client has
// already traveled vs what's still upcoming vs what's dormant.

type ConnectorState = 'idle' | 'sent' | 'pending' | 'eligible';

const CONNECTOR_CFG: Record<
  Exclude<ConnectorState, 'idle'>,
  {
    line: string;
    halo: string;
    badgeBg: string;
    icon: string;
    label: string;
    flow: boolean;
  }
> = {
  sent: {
    line: 'bg-emerald-500',
    halo: 'shadow-[0_0_14px_rgba(16,185,129,0.55)]',
    badgeBg: 'bg-emerald-500 text-white ring-emerald-200 dark:ring-emerald-900',
    icon: '✓',
    label: 'Sent',
    flow: false,
  },
  pending: {
    line: 'bg-amber-500',
    halo: 'shadow-[0_0_14px_rgba(245,158,11,0.6)]',
    badgeBg: 'bg-amber-500 text-white ring-amber-200 dark:ring-amber-900',
    icon: '⏳',
    label: 'Pending',
    flow: true,
  },
  eligible: {
    line: 'bg-violet-500',
    halo: 'shadow-[0_0_10px_rgba(139,92,246,0.45)]',
    badgeBg: 'bg-violet-500 text-white ring-violet-200 dark:ring-violet-900',
    icon: '↓',
    label: 'Next',
    flow: true,
  },
};

function Connector({
  state,
  extraTall = false,
}: {
  state: ConnectorState;
  extraTall?: boolean;
}) {
  const height = extraTall ? 'h-20' : 'h-14';

  if (state === 'idle') {
    return (
      <div className={`relative ${height} flex items-center justify-center`} aria-hidden>
        <div className="h-full border-l-2 border-dashed border-gray-300 dark:border-gray-700" />
      </div>
    );
  }

  const cfg = CONNECTOR_CFG[state];

  return (
    <div
      className={`relative ${height} flex items-center justify-center`}
      role="img"
      aria-label={`Edge state: ${cfg.label}`}
    >
      {/* The energized line itself: 4px wide, fully saturated, with a soft halo
          glow so even at a quick glance it pops against the dotted canvas. */}
      <div
        className={`relative h-full w-[4px] rounded-full overflow-hidden ${cfg.line} ${cfg.halo}`}
      >
        {cfg.flow ? (
          // "Data flowing through" — a bright shimmer rides downward continuously
          // to communicate that this edge is currently in flight (pending) or
          // about to be (eligible).
          <span
            aria-hidden
            className="absolute inset-x-0 -top-1/3 h-1/2 bg-gradient-to-b from-transparent via-white/85 to-transparent"
            style={{ animation: 'wire-flow-vert 1.4s linear infinite' }}
          />
        ) : (
          // Sent — gentle interior pulse so the edge feels "settled & traversed"
          // without distracting from the active (pending) edges below it.
          <span
            aria-hidden
            className={`absolute inset-0 ${cfg.line} opacity-40 animate-pulse`}
          />
        )}
      </div>

      {/* Centered status badge — sits on top of the line and is the single
          biggest "this edge has fired" affordance. */}
      <span
        className={`absolute z-10 inline-flex items-center gap-1 rounded-full ring-2 ring-white dark:ring-gray-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md ${cfg.badgeBg}`}
      >
        <span aria-hidden className="leading-none">
          {cfg.icon}
        </span>
        <span>{cfg.label}</span>
      </span>
    </div>
  );
}

/** Map a downstream node's runtime status to the inbound edge's state.
 *  The edge is "sent" iff the downstream email actually went out (proof the
 *  edge was traversed); "pending" while we're waiting on it; "eligible" when
 *  the client is on this path but the send is still upstream of now. */
function edgeFromDownstream(node: NodeRuntime): ConnectorState {
  if (node.status === 'sent') return 'sent';
  if (node.status === 'pending') return 'pending';
  if (node.status === 'eligible' || node.triggerFired) return 'eligible';
  return 'idle';
}

/** Map an upstream node's runtime status to the outbound edge's state, used
 *  for action -> wait connectors where the wait has no status of its own. */
function edgeFromUpstream(node: NodeRuntime): ConnectorState {
  if (node.status === 'sent') return 'sent';
  if (node.status === 'pending') return 'eligible';
  return 'idle';
}

// -- Connection port dot (n8n's grey dot at node edges).
//
// We tint by node status so the port reads as the same color as the line that
// will leave/enter it — visually "the energized state extends out of the node
// into the wire." Active ports get a soft halo for extra prominence.

function Port({ active, side, tone = 'violet' }: {
  active: boolean;
  side: 'top' | 'bottom';
  tone?: 'violet' | 'emerald' | 'amber';
}) {
  const positionCls = side === 'top' ? '-top-[6px]' : '-bottom-[6px]';
  const activeCls = {
    violet: 'bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.7)]',
    emerald: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]',
    amber: 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.7)]',
  }[tone];
  return (
    <span
      aria-hidden
      className={`absolute left-1/2 -translate-x-1/2 ${positionCls} z-20 h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-950 transition-all ${
        active ? activeCls : 'bg-gray-400 dark:bg-gray-600'
      }`}
    />
  );
}

// -- Legend

function Legend({ hasPreview }: { hasPreview: boolean }) {
  if (!hasPreview) {
    return (
      <div className="mt-10 flex justify-center text-[11px] text-gray-500 dark:text-gray-400">
        Pick a client above to energize the timeline.
      </div>
    );
  }
  return (
    <div className="mt-10 flex flex-wrap items-center justify-center gap-2 text-[11px]">
      <LegendChip
        icon="✓"
        label="Sent"
        chip="bg-emerald-500 text-white ring-emerald-200 dark:ring-emerald-900"
      />
      <LegendChip
        icon="⏳"
        label="Pending"
        chip="bg-amber-500 text-white ring-amber-200 dark:ring-amber-900"
      />
      <LegendChip
        icon="↓"
        label="Next"
        chip="bg-violet-500 text-white ring-violet-200 dark:ring-violet-900"
      />
      <LegendChip
        icon="—"
        label="Idle"
        chip="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 ring-gray-300/40 dark:ring-gray-600/40"
      />
    </div>
  );
}

function LegendChip({
  icon,
  label,
  chip,
}: {
  icon: string;
  label: string;
  chip: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ring-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-sm ${chip}`}
    >
      <span aria-hidden className="leading-none">
        {icon}
      </span>
      <span>{label}</span>
    </span>
  );
}
