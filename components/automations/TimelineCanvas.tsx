'use client';

import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  apiClient,
  type AutomationEmailJob,
  type AutomationFlow,
  type AutomationFlowTestResponse,
  type AutomationNodeKind,
  type AutomationPlaybook,
  type AutomationRule,
  type AutomationScheduleMode,
} from '@/lib/api';
import { formatApiError } from '@/lib/apiError';
import type { Client } from '@/types/client';
import PlaybookModal from './PlaybookModal';
import WaitDelayModal, { type WaitDelayMode } from './WaitDelayModal';
import BookingTriggerModal from './BookingTriggerModal';

/**
 * Single-column, n8n-inspired automation timeline for one flow tab.
 *
 * Flows: post_booking | onboarding | wins_ascension
 * Node UI (WaitNode / PlaybookNode / TriggerNode) is shared across flows.
 */

type StageKey = 'pre_sale_booking' | 'first_payment' | 'win' | 'offboarding';

type NodeStatus = 'idle' | 'eligible' | 'pending' | 'sent' | 'failed' | 'skipped';

interface NodeRuntime {
  status: NodeStatus;
  job?: AutomationEmailJob;
  triggerFired: boolean;
}

interface TimelineCanvasProps {
  flow: AutomationFlow;
  rules: AutomationRule[];
  previewClient: Client | null;
  previewClientId: string | null;
  previewClientOptions: Client[];
  onPreviewClientChange: (id: string | null) => void;
  onRuleSaved: (next: AutomationRule) => void;
  onRulesReload: () => void | Promise<void>;
}

const FLOW_META: Record<
  AutomationFlow,
  { title: string; accent: 'violet' | 'emerald' | 'amber'; endTitle: string; endSubtitle: string }
> = {
  post_booking: {
    title: 'Post-booking flow',
    accent: 'violet',
    endTitle: 'Ready for the call',
    endSubtitle: 'Lead arrives prepared',
  },
  onboarding: {
    title: 'Onboarding flow',
    accent: 'emerald',
    endTitle: 'Client onboarded',
    endSubtitle: 'Welcome sequence complete',
  },
  wins_ascension: {
    title: 'Wins / ascension flow',
    accent: 'amber',
    endTitle: 'Ascension complete',
    endSubtitle: 'Win asks + offboarding covered',
  },
};

function waitModeForSchedule(mode: AutomationScheduleMode | null | undefined): WaitDelayMode {
  if (mode === 'before_meeting') return 'before_meeting';
  if (mode === 'after_booking') return 'after_booking';
  return 'after_previous';
}

function shortLabelForRule(rule: AutomationRule): string {
  if ((rule.node_kind || 'action') === 'wait') return 'Wait';
  if (rule.playbook === 'pre_sale_post_booking') return 'Post-booking';
  if (rule.playbook === 'pre_sale_pre_meeting') return 'Pre-meeting';
  if (rule.playbook === 'first_payment_onboarding') return 'Onboarding';
  if (rule.playbook === 'first_payment_referral') return 'Referral ask';
  if (rule.playbook === 'win_combined_ask') return 'Combined ask';
  if (rule.playbook === 'offboarding_recap_ask') return 'Recap & ask';
  if (rule.schedule_mode === 'before_meeting') return 'Pre-meeting';
  return `Email ${Number(rule.step_index ?? 0) + 1}`;
}

function playbookKind(rule: AutomationRule): 'email' | 'gift' | 'handshake' | 'recap' {
  if (rule.playbook === 'first_payment_referral') return 'gift';
  if (rule.playbook === 'win_combined_ask') return 'handshake';
  if (rule.playbook === 'offboarding_recap_ask') return 'recap';
  return 'email';
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
  playbooks: AutomationPlaybook[],
): Record<string, NodeRuntime> {
  const lit = deriveLitStages(client);
  const runtimes: Record<string, NodeRuntime> = {};
  for (const pb of playbooks) {
    let triggerFired = false;
    if (pb.startsWith('pre_sale') || pb.includes('_booking_') || pb.includes('post_booking')) {
      triggerFired = lit.has('pre_sale_booking');
    } else if (pb.startsWith('first_payment') || pb.includes('_payment_')) {
      triggerFired = lit.has('first_payment');
    } else if (pb.includes('offboarding')) {
      triggerFired = lit.has('offboarding');
    }
    runtimes[pb] = { status: 'idle', triggerFired };
  }

  const seen = new Set<string>();
  for (const job of jobs) {
    const pb = job.playbook;
    if (!runtimes[pb]) {
      runtimes[pb] = { status: 'idle', triggerFired: false };
    }
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

  for (const pb of Object.keys(runtimes)) {
    if (runtimes[pb].triggerFired && runtimes[pb].status === 'idle') {
      runtimes[pb].status = 'eligible';
    }
  }
  return runtimes;
}

function idleRuntime(): NodeRuntime {
  return { status: 'idle', triggerFired: false };
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
      return 'Follow-up email';
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
  flow,
  rules,
  previewClient,
  previewClientId,
  previewClientOptions,
  onPreviewClientChange,
  onRuleSaved,
  onRulesReload,
}: TimelineCanvasProps) {
  const [activeRule, setActiveRule] = useState<AutomationRule | null>(null);
  const [waitTarget, setWaitTarget] = useState<AutomationRule | null>(null);
  const [waitMode, setWaitMode] = useState<WaitDelayMode>('after_previous');
  const [bookingTriggerRule, setBookingTriggerRule] = useState<AutomationRule | null>(null);
  const [jobs, setJobs] = useState<AutomationEmailJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [addingAt, setAddingAt] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSlot, setAddSlot] = useState<{
    triggerKind: 'booking' | 'payment' | 'win' | 'offboarding';
    insertBeforePlaybook?: string | null;
    scheduleMode?: AutomationScheduleMode;
    slotKey: string;
  } | null>(null);

  const flowRules = useMemo(() => {
    const filtered = rules.filter((r) => (r.flow || inferFlow(r.playbook)) === flow);
    return filtered.sort((a, b) => {
      const ta = a.trigger_kind || '';
      const tb = b.trigger_kind || '';
      if (ta !== tb) return ta.localeCompare(tb);
      return Number(a.step_index ?? 0) - Number(b.step_index ?? 0);
    });
  }, [rules, flow]);

  const playbooks = useMemo(() => flowRules.map((r) => r.playbook), [flowRules]);

  useEffect(() => {
    if (!previewClient) {
      setJobs([]);
      return;
    }
    let cancelled = false;
    setJobsLoading(true);
    apiClient
      .listAutomationJobs({ client_id: previewClient.id, limit: 50 })
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
    () => deriveNodeRuntimes(previewClient, jobs, playbooks),
    [previewClient, jobs, playbooks],
  );

  const openWait = (rule: AutomationRule | undefined, mode: WaitDelayMode) => {
    if (!rule) return;
    setWaitMode(mode);
    setWaitTarget(rule);
  };

  const bookingSteps = flowRules.filter((r) => (r.trigger_kind || inferTrigger(r.playbook)) === 'booking');
  const paymentSteps = flowRules.filter((r) => (r.trigger_kind || inferTrigger(r.playbook)) === 'payment');
  const winSteps = flowRules.filter((r) => (r.trigger_kind || inferTrigger(r.playbook)) === 'win');
  const offboardingSteps = flowRules.filter(
    (r) => (r.trigger_kind || inferTrigger(r.playbook)) === 'offboarding',
  );

  const preSale = bookingSteps.find((r) => r.playbook === 'pre_sale_post_booking') || bookingSteps[0];
  const meta = FLOW_META[flow];

  const inActiveProgram =
    !!previewClient &&
    (previewClient.lifecycle_state === 'active' ||
      previewClient.lifecycle_state === 'offboarding' ||
      (previewClient.lifetime_revenue_cents ?? 0) > 0);

  const openAddSlot = (opts: {
    triggerKind: 'booking' | 'payment' | 'win' | 'offboarding';
    insertBeforePlaybook?: string | null;
    scheduleMode?: AutomationScheduleMode;
    slotKey: string;
  }) => {
    setAddError(null);
    setAddSlot(opts);
  };

  const addStep = async (nodeKind: AutomationNodeKind) => {
    if (!addSlot) return;
    setAddingAt(addSlot.slotKey);
    setAddError(null);
    try {
      await apiClient.addAutomationFlowStep(flow, {
        trigger_kind: addSlot.triggerKind,
        node_kind: nodeKind,
        schedule_mode: addSlot.scheduleMode ?? 'after_previous',
        delay_seconds: nodeKind === 'wait' ? 3600 : 0,
        subject_template: nodeKind === 'action' ? 'Quick follow-up, {{first_name}}' : null,
        insert_before_playbook: addSlot.insertBeforePlaybook ?? null,
      });
      setAddSlot(null);
      await onRulesReload();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add step');
    } finally {
      setAddingAt(null);
    }
  };

  const deleteStep = async (rule: AutomationRule) => {
    setAddError(null);
    try {
      await apiClient.deleteAutomationRule(rule.playbook);
      await onRulesReload();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to delete step');
    }
  };

  /** Independent wait / action nodes with + between each. */
  const renderStepChain = (
    steps: AutomationRule[],
    accent: 'violet' | 'emerald' | 'amber',
    triggerKind: 'booking' | 'payment' | 'win' | 'offboarding',
    firstWaitMode?: WaitDelayMode,
  ) => {
    const nurture = steps.filter((r) => r.schedule_mode !== 'before_meeting');
    const preMeeting = steps.filter((r) => r.schedule_mode === 'before_meeting');
    const chain = nurture.length > 0 ? nurture : steps;

    const renderNode = (rule: AutomationRule, idx: number, list: AutomationRule[]) => {
      const runtime = runtimes[rule.playbook] || idleRuntime();
      const mode = waitModeForSchedule(rule.schedule_mode);
      const waitModeResolved =
        idx === 0 && firstWaitMode && rule.schedule_mode !== 'before_meeting'
          ? firstWaitMode
          : mode;
      const nextPlaybook = list[idx + 1]?.playbook ?? null;
      const slotAfter = `after:${rule.playbook}`;
      const isWait = (rule.node_kind || 'action') === 'wait';

      return (
        <Fragment key={rule.playbook}>
          <div className="relative group/node">
            {isWait ? (
              <WaitNode
                rule={rule}
                active={runtime.triggerFired || runtime.status === 'pending' || runtime.status === 'sent'}
                mode={waitModeResolved}
                onClick={() => openWait(rule, waitModeResolved)}
              />
            ) : (
              <PlaybookNode
                rule={rule}
                runtime={runtime}
                accent={accent}
                kind={playbookKind(rule)}
                shortLabel={shortLabelForRule(rule)}
                onClick={() => setActiveRule(rule)}
                onEditDelay={() => openWait(rule, waitModeResolved)}
              />
            )}
            <button
              type="button"
              onClick={() => void deleteStep(rule)}
              className="absolute -right-2 -top-2 z-10 rounded-full bg-white dark:bg-gray-900 ring-1 ring-red-500/30 px-2 py-0.5 text-[10px] font-medium text-red-600 opacity-0 group-hover/node:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity"
              title="Remove this node"
            >
              Remove
            </button>
          </div>
          <Connector
            state={
              nextPlaybook
                ? edgeFromUpstream(runtime)
                : runtime.status === 'sent'
                  ? 'sent'
                  : 'idle'
            }
            onAdd={() =>
              openAddSlot({
                triggerKind,
                insertBeforePlaybook: nextPlaybook,
                scheduleMode:
                  rule.schedule_mode === 'before_meeting' ? 'before_meeting' : 'after_previous',
                slotKey: slotAfter,
              })
            }
            adding={addingAt === slotAfter}
            addLabel="Add node"
          />
        </Fragment>
      );
    };

    return (
      <>
        {chain.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-white/15 px-4 py-3 text-center text-xs text-gray-500">
            No steps yet — click <span className="font-semibold">+</span> above to add a wait or email.
          </div>
        ) : (
          chain.map((rule, idx) => renderNode(rule, idx, chain))
        )}

        {preMeeting.length > 0 && nurture.length > 0 ? (
          <>
            <div className="my-1 flex items-center gap-2 px-1">
              <div className="h-px flex-1 bg-violet-500/20" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300">
                Before meeting
              </span>
              <div className="h-px flex-1 bg-violet-500/20" />
            </div>
            {preMeeting.map((rule, idx) => renderNode(rule, idx, preMeeting))}
          </>
        ) : null}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-gray-200/80 dark:border-white/10 shadow-lg shadow-violet-500/5">
        <CanvasHeader
          flow={flow}
          title={meta.title}
          previewClient={previewClient}
          previewClientId={previewClientId}
          previewClientOptions={previewClientOptions}
          onPreviewClientChange={onPreviewClientChange}
          jobsLoading={jobsLoading}
        />

        <div className="automation-canvas relative px-4 sm:px-10 py-10 sm:py-14 bg-gradient-to-b from-gray-50 via-gray-50 to-violet-50/30 dark:from-gray-950 dark:via-gray-950 dark:to-violet-950/20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.08),transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.12),transparent_55%)]" />
          <div className="relative mx-auto max-w-lg flex flex-col items-stretch gap-0">
            {flow === 'post_booking' && (
              <>
                <TriggerNode
                  kind="calendar"
                  title="Booking lands"
                  subtitle="Calendly · Cal.com"
                  accent="violet"
                  fired={(runtimes[preSale?.playbook || ''] || idleRuntime()).triggerFired}
                  onClick={() => preSale && setBookingTriggerRule(preSale)}
                  editable={!!preSale}
                />
                <Connector
                  state={edgeFromDownstream(runtimes[preSale?.playbook || ''] || idleRuntime())}
                  onAdd={() =>
                    openAddSlot({
                      triggerKind: 'booking',
                      insertBeforePlaybook:
                        bookingSteps.find((r) => r.schedule_mode !== 'before_meeting')?.playbook ??
                        bookingSteps[0]?.playbook ??
                        null,
                      scheduleMode: 'after_booking',
                      slotKey: 'booking:start',
                    })
                  }
                  adding={addingAt === 'booking:start'}
                  addLabel="Add node"
                />
                {renderStepChain(bookingSteps, 'violet', 'booking', 'after_booking')}
                <EndNode
                  title={meta.endTitle}
                  subtitle={meta.endSubtitle}
                  activated={bookingSteps.some((r) => runtimes[r.playbook]?.status === 'sent')}
                />
              </>
            )}

            {flow === 'onboarding' && (
              <>
                <TriggerNode
                  kind="payment"
                  title="First payment"
                  subtitle="Stripe · Whop"
                  accent="emerald"
                  fired={paymentSteps.some((r) => runtimes[r.playbook]?.triggerFired)}
                />
                <Connector
                  state={edgeFromDownstream(
                    runtimes[paymentSteps[0]?.playbook || ''] || idleRuntime(),
                  )}
                  onAdd={() =>
                    openAddSlot({
                      triggerKind: 'payment',
                      insertBeforePlaybook: paymentSteps[0]?.playbook ?? null,
                      scheduleMode: paymentSteps.length === 0 ? 'after_trigger' : 'after_previous',
                      slotKey: 'payment:start',
                    })
                  }
                  adding={addingAt === 'payment:start'}
                  addLabel="Add node"
                />
                {renderStepChain(paymentSteps, 'emerald', 'payment', 'after_previous')}
                <EndNode
                  title={meta.endTitle}
                  subtitle={meta.endSubtitle}
                  activated={paymentSteps.some((r) => runtimes[r.playbook]?.status === 'sent')}
                />
              </>
            )}

            {flow === 'wins_ascension' && (
              <>
                <SectionFrame
                  kind="win"
                  title="Win detected"
                  subtitle="Fathom call insight tags a win during the active program"
                  accent="amber"
                  activated={
                    winSteps.some((r) => runtimes[r.playbook]?.triggerFired) || inActiveProgram
                  }
                  activatedStrong={winSteps.some((r) => runtimes[r.playbook]?.triggerFired)}
                >
                  <Connector
                    state={edgeFromDownstream(
                      runtimes[winSteps[0]?.playbook || ''] || idleRuntime(),
                    )}
                    onAdd={() =>
                      openAddSlot({
                        triggerKind: 'win',
                        insertBeforePlaybook: winSteps[0]?.playbook ?? null,
                        scheduleMode: 'after_trigger',
                        slotKey: 'win:start',
                      })
                    }
                    adding={addingAt === 'win:start'}
                    addLabel="Add node"
                  />
                  {renderStepChain(winSteps, 'amber', 'win', 'after_previous')}
                </SectionFrame>

                <Connector
                  state={
                    offboardingSteps.some((r) => runtimes[r.playbook]?.status === 'sent')
                      ? 'sent'
                      : offboardingSteps.some((r) => runtimes[r.playbook]?.status === 'pending')
                        ? 'pending'
                        : offboardingSteps.some((r) => runtimes[r.playbook]?.triggerFired) ||
                            previewClient?.lifecycle_state === 'offboarding'
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
                    offboardingSteps.some((r) => runtimes[r.playbook]?.triggerFired) ||
                    previewClient?.lifecycle_state === 'offboarding'
                  }
                  activatedStrong={offboardingSteps.some((r) => runtimes[r.playbook]?.triggerFired)}
                >
                  <Connector
                    state={edgeFromDownstream(
                      runtimes[offboardingSteps[0]?.playbook || ''] || idleRuntime(),
                    )}
                    onAdd={() =>
                      openAddSlot({
                        triggerKind: 'offboarding',
                        insertBeforePlaybook: offboardingSteps[0]?.playbook ?? null,
                        scheduleMode: 'after_trigger',
                        slotKey: 'offboarding:start',
                      })
                    }
                    adding={addingAt === 'offboarding:start'}
                    addLabel="Add node"
                  />
                  {renderStepChain(offboardingSteps, 'violet', 'offboarding', 'after_previous')}
                </SectionFrame>

                <Connector
                  state={
                    offboardingSteps.some((r) => runtimes[r.playbook]?.status === 'sent')
                      ? 'sent'
                      : 'idle'
                  }
                />
                <EndNode
                  title={meta.endTitle}
                  subtitle={meta.endSubtitle}
                  activated={offboardingSteps.some((r) => runtimes[r.playbook]?.status === 'sent')}
                />
              </>
            )}
          </div>

          {addError ? (
            <p className="mt-4 text-center text-xs text-red-600 dark:text-red-300">{addError}</p>
          ) : null}

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

      <AddNodeMiniModal
        open={!!addSlot}
        busy={!!addingAt}
        onClose={() => {
          if (addingAt) return;
          setAddSlot(null);
        }}
        onChoose={(kind) => void addStep(kind)}
      />

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

function inferFlow(playbook: string): AutomationFlow {
  if (playbook.startsWith('pre_sale') || playbook.startsWith('post_booking')) return 'post_booking';
  if (playbook.startsWith('first_payment') || playbook.startsWith('onboarding')) return 'onboarding';
  return 'wins_ascension';
}

function inferTrigger(playbook: string): 'booking' | 'payment' | 'win' | 'offboarding' {
  if (playbook.includes('offboarding')) return 'offboarding';
  if (playbook.includes('win')) return 'win';
  if (playbook.includes('payment') || playbook.includes('onboarding') || playbook.includes('referral')) {
    return 'payment';
  }
  return 'booking';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function CanvasHeader({
  flow,
  title = 'Automation timeline',
  previewClient,
  previewClientId,
  previewClientOptions,
  onPreviewClientChange,
  jobsLoading,
}: {
  flow: AutomationFlow;
  title?: string;
  previewClient: Client | null;
  previewClientId: string | null;
  previewClientOptions: Client[];
  onPreviewClientChange: (id: string | null) => void;
  jobsLoading: boolean;
}) {
  const [testEmail, setTestEmail] = useState(
    () => previewClient?.email || '',
  );
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AutomationFlowTestResponse | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (previewClient?.email) {
      setTestEmail(previewClient.email);
    }
  }, [previewClient?.email]);

  const runTest = async () => {
    const email = testEmail.trim();
    if (!email || !email.includes('@')) {
      setTestError('Enter a valid email to send the test.');
      return;
    }
    setTesting(true);
    setTestError(null);
    setTestResult(null);
    try {
      const out = await apiClient.testAutomationFlow(flow, {
        email,
        client_id: previewClientId,
      });
      setTestResult(out);
      if (!out.ok) {
        setTestError(out.error || out.blockers?.[0] || 'Test did not send cleanly.');
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } } | null)?.response?.status;
      if (status === 404) {
        setTestError(
          'Test endpoint not found on backend. Deploy latest backend (route: /automations/flows/{flow}/test).',
        );
      } else {
        setTestError(formatApiError(e, 'Test failed'));
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 border-b border-gray-200/80 dark:border-white/10 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
            Flow canvas
          </p>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-400 max-w-md leading-relaxed">
            Click <span className="font-semibold text-violet-600 dark:text-violet-300">+</span> on a connector to
            insert a wait or email. Hover any step to remove it.
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

      <div className="rounded-xl border border-dashed border-violet-500/25 bg-violet-500/[0.04] dark:bg-violet-500/[0.07] p-3 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label htmlFor="automation-test-email" className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
              Test this workflow
            </label>
            <input
              id="automation-test-email"
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full rounded-lg border border-gray-300/80 dark:border-white/15 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-violet-500/50 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Sends a quick [TEST] email per enabled action (skips waits). Confirms Brevo without waiting on live triggers.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void runTest()}
            disabled={testing}
            className="shrink-0 inline-flex items-center justify-center rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 disabled:opacity-60"
          >
            {testing ? 'Sending…' : 'Send test'}
          </button>
        </div>

        {testError ? (
          <p className="mt-3 text-xs text-red-600 dark:text-red-300">{testError}</p>
        ) : null}

        {testResult ? (
          <div className="mt-3 space-y-2">
            {testResult.blockers?.length ? (
              <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-200">
                {testResult.blockers.map((b) => (
                  <li key={b} className="leading-snug">
                    ⚠ {b}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                Live-send readiness looks good (worker + Brevo + enabled steps
                {flow === 'post_booking' ? ' + booking trigger' : ''}).
              </p>
            )}
            <div className="flex flex-wrap gap-2 text-[10px] font-medium uppercase tracking-wide">
              <span className={`rounded-full px-2 py-0.5 ${testResult.dispatcher_healthy ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'bg-red-500/15 text-red-800 dark:text-red-200'}`}>
                Worker {testResult.dispatcher_healthy ? 'ok' : 'down'}
              </span>
              <span className={`rounded-full px-2 py-0.5 ${testResult.brevo_connected ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'bg-red-500/15 text-red-800 dark:text-red-200'}`}>
                Brevo {testResult.brevo_connected ? 'connected' : 'missing'}
              </span>
              <span className="rounded-full px-2 py-0.5 bg-gray-500/10 text-gray-700 dark:text-gray-300">
                {testResult.sent_count} sent · {testResult.enabled_action_count} enabled
              </span>
            </div>
            {testResult.results?.length ? (
              <ul className="max-h-36 overflow-auto rounded-lg bg-white/70 dark:bg-black/20 p-2 text-[11px] text-gray-700 dark:text-gray-300 space-y-1">
                {testResult.results.map((r) => (
                  <li key={`${r.playbook}-${r.step_index}`} className="flex gap-2">
                    <span
                      className={`shrink-0 font-semibold ${
                        r.status === 'sent'
                          ? 'text-emerald-600'
                          : r.status === 'failed'
                            ? 'text-red-600'
                            : 'text-gray-400'
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="truncate">
                      {r.playbook}
                      {r.detail ? ` — ${r.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
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
  const fill = {
    emerald: fired
      ? 'bg-emerald-600 text-white shadow-[0_0_28px_rgba(16,185,129,0.35)]'
      : 'bg-emerald-700/90 text-emerald-50',
    amber: fired
      ? 'bg-amber-600 text-white shadow-[0_0_28px_rgba(245,158,11,0.35)]'
      : 'bg-amber-700/90 text-amber-50',
    violet: fired
      ? 'bg-violet-600 text-white shadow-[0_0_28px_rgba(139,92,246,0.4)]'
      : 'bg-violet-700/90 text-violet-50',
  }[accent];
  const tip = {
    emerald: fired ? 'bg-emerald-600' : 'bg-emerald-700/90',
    amber: fired ? 'bg-amber-600' : 'bg-amber-700/90',
    violet: fired ? 'bg-violet-600' : 'bg-violet-700/90',
  }[accent];
  const dash = {
    emerald: 'border-emerald-400/50',
    amber: 'border-amber-400/50',
    violet: 'border-violet-400/50',
  }[accent];

  const body = (
    <>
      <div className="flex items-center gap-3">
        <div
          className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25"
          aria-hidden
        >
          <NodeIcon kind={kind} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
              Trigger
            </span>
            {fired ? (
              <span className="rounded-sm bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                Fired
              </span>
            ) : null}
          </div>
          <div className="text-base font-semibold leading-tight">{title}</div>
          <div className="text-[11px] text-white/70">{subtitle}</div>
        </div>
        {editable ? (
          <span className="text-[10px] font-semibold text-white/80 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            Edit
          </span>
        ) : null}
      </div>
      <div
        className={`pointer-events-none absolute left-1/2 -bottom-2 h-4 w-4 -translate-x-1/2 rotate-45 ${tip}`}
        aria-hidden
      />
    </>
  );

  return (
    <div className="relative mb-2">
      <div className={`absolute -inset-1 rounded-md border border-dashed ${dash} opacity-70`} aria-hidden />
      {editable && onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`group relative z-10 w-full overflow-visible rounded-md px-4 py-3.5 text-left transition-transform hover:-translate-y-0.5 ${fill}`}
          title="Edit booking trigger"
          aria-label={`Edit booking trigger (${title})`}
        >
          {body}
        </button>
      ) : (
        <div className={`relative z-10 w-full overflow-visible rounded-md px-4 py-3.5 ${fill}`}>
          {body}
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
  onEditDelay,
}: {
  rule: AutomationRule | undefined;
  runtime: NodeRuntime;
  accent: 'emerald' | 'amber' | 'violet';
  kind: 'email' | 'gift' | 'handshake' | 'recap';
  shortLabel: string;
  onClick: () => void;
  onEditDelay?: () => void;
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
  const delayChip =
    rule && onEditDelay
      ? compactDelayLabel(rule.delay_seconds ?? 0, waitModeForSchedule(rule.schedule_mode))
      : null;

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
                  Action · {shortLabel}
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
                {delayChip && onEditDelay ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditDelay();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onEditDelay();
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 ring-1 ring-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-200 hover:ring-amber-500/50"
                    title="Edit send timing on this action"
                  >
                    ⏱ {delayChip}
                  </span>
                ) : null}
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
  const innerBg = {
    emerald: 'bg-emerald-500/[0.04] dark:bg-emerald-500/[0.06]',
    amber: 'bg-amber-500/[0.05] dark:bg-amber-500/[0.08]',
    violet: 'bg-violet-500/[0.05] dark:bg-violet-500/[0.08]',
  }[accent];

  return (
    <div
      className={`relative rounded-md ring-1 ${ring} ${innerBg} ${
        activated ? '' : 'opacity-75'
      } transition-all ${activatedStrong ? 'shadow-[0_0_24px_rgba(139,92,246,0.08)]' : ''}`}
    >
      <div
        className={`flex items-center gap-2 rounded-t-md px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] ${
          accent === 'amber'
            ? 'bg-amber-700/90 text-amber-50'
            : accent === 'emerald'
              ? 'bg-emerald-700/90 text-emerald-50'
              : 'bg-violet-700/90 text-violet-50'
        }`}
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
          {kind === 'win' ? '🏆' : '🎓'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-bold tracking-[0.2em] text-white/70">Trigger</div>
          <div className="text-[12px] font-semibold normal-case tracking-normal text-white">{title}</div>
        </div>
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
  onAdd,
  adding = false,
  addLabel = 'Add step',
}: {
  state: ConnectorState;
  extraTall?: boolean;
  onAdd?: () => void;
  adding?: boolean;
  addLabel?: string;
}) {
  const height = extraTall ? 'h-20' : onAdd ? 'h-16' : 'h-14';
  const showStatus = state !== 'idle' && !onAdd;
  const cfg = state === 'idle' ? null : CONNECTOR_CFG[state];

  return (
    <div
      className={`relative ${height} flex items-center justify-center`}
      role={onAdd ? 'group' : 'img'}
      aria-label={onAdd ? 'Insert step on this connector' : cfg ? `Edge state: ${cfg.label}` : undefined}
    >
      {state === 'idle' || !cfg ? (
        <div className="h-full border-l-2 border-dashed border-gray-300 dark:border-gray-700" aria-hidden />
      ) : (
        <div
          className={`relative h-full w-[4px] rounded-full overflow-hidden ${cfg.line} ${cfg.halo}`}
          aria-hidden
        >
          {cfg.flow ? (
            <span
              className="absolute inset-x-0 -top-1/3 h-1/2 bg-gradient-to-b from-transparent via-white/85 to-transparent"
              style={{ animation: 'wire-flow-vert 1.4s linear infinite' }}
            />
          ) : (
            <span className={`absolute inset-0 ${cfg.line} opacity-40 animate-pulse`} />
          )}
        </div>
      )}

      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          disabled={adding}
          title={addLabel}
          aria-label={addLabel}
          className="absolute z-20 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white dark:bg-gray-950 text-violet-600 dark:text-violet-300 ring-2 ring-violet-500/40 shadow-md hover:bg-violet-50 dark:hover:bg-violet-950/50 hover:ring-violet-500/70 hover:scale-110 transition-all disabled:opacity-60 disabled:hover:scale-100"
        >
          {adding ? (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
            </svg>
          )}
        </button>
      ) : showStatus && cfg ? (
        <span
          className={`absolute z-10 inline-flex items-center gap-1 rounded-full ring-2 ring-white dark:ring-gray-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider shadow-md ${cfg.badgeBg}`}
        >
          <span aria-hidden className="leading-none">
            {cfg.icon}
          </span>
          <span>{cfg.label}</span>
        </span>
      ) : null}
    </div>
  );
}

/** Mini chooser: Wait vs Action (email) when inserting on a connector. */
function AddNodeMiniModal({
  open,
  busy,
  onClose,
  onChoose,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onChoose: (kind: AutomationNodeKind) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-label="Close"
        onClick={onClose}
        disabled={busy}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add automation node"
        className="relative z-10 w-full max-w-xs rounded-2xl bg-white dark:bg-gray-950 ring-1 ring-gray-200 dark:ring-white/10 shadow-2xl p-4"
      >
        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Add a node</div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Choose a wait delay or an email action.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose('wait')}
            className="flex flex-col items-center gap-2 rounded-xl px-3 py-4 ring-1 ring-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 hover:ring-amber-500/50 transition-all disabled:opacity-60"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
              <NodeIcon kind="wait" />
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Wait</span>
            <span className="text-[10px] text-gray-500 text-center leading-snug">Delay only</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onChoose('action')}
            className="flex flex-col items-center gap-2 rounded-xl px-3 py-4 ring-1 ring-violet-500/30 bg-violet-500/10 hover:bg-violet-500/15 hover:ring-violet-500/50 transition-all disabled:opacity-60"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/20 text-violet-700 dark:text-violet-300">
              <NodeIcon kind="email" />
            </span>
            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">Email</span>
            <span className="text-[10px] text-gray-500 text-center leading-snug">Send action</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="mt-3 w-full rounded-lg px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
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
