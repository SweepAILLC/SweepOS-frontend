'use client';

import type { Client } from '@/types/client';
import type { DealBrief, LeadPipelineSnapshot } from '@/types/callInsights';

const OUTCOME: Record<string, { label: string; cls: string }> = {
  closed: { label: 'Closed', cls: 'text-emerald-700 dark:text-emerald-300' },
  not_closed: { label: 'Not closed', cls: 'text-rose-700 dark:text-rose-300' },
  pending_decision: { label: 'Pending decision', cls: 'text-amber-700 dark:text-amber-300' },
};

function shortDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

function ago(iso?: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(days)) return '';
  if (days < 0) return 'upcoming';
  return days === 0 ? 'today' : `${days}d ago`;
}

function usd(cents?: number | null): string {
  return `$${Math.round((cents || 0) / 100).toLocaleString()}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="text-[11px] leading-snug text-gray-800 dark:text-gray-200">
      <span className="font-medium text-gray-500 dark:text-gray-400">{label} </span>
      {children}
    </p>
  );
}

function joined(list?: string[] | null): string {
  return (list || []).filter((s) => s && s.trim()).join(' · ');
}

interface DealBriefCardProps {
  client: Client;
  brief: DealBrief | null | undefined;
  pipeline: LeadPipelineSnapshot | null | undefined;
  /** Paid client (active/offboarding, or churned with revenue) vs. lead that has not converted. */
  converted: boolean;
}

/** One glance at who this person is and where they stand today — facts first, no padding. */
export default function DealBriefCard({ client, brief, pipeline, converted }: DealBriefCardProps) {
  const salesAt = brief?.sales_call_at || pipeline?.last_sales_call?.start_time || '';
  const nextSalesAt = pipeline?.next_is_sales_call ? pipeline?.next_start_time_iso : null;
  if (!brief && !salesAt && !nextSalesAt) return null;

  const outcomeKey = converted ? 'closed' : brief?.outcome || (pipeline?.open_sales_deal ? 'not_closed' : '');
  const outcome = OUTCOME[outcomeKey];
  const paid = client.lifetime_revenue_cents || 0;

  const facts: React.ReactNode[] = [];
  if (salesAt) {
    facts.push(
      <span key="sc">
        Sales call {shortDate(salesAt)} ({ago(salesAt)})
        {(brief?.sales_call_count || 0) > 1 ? ` · ${brief?.sales_call_count} calls` : ''}
      </span>
    );
  } else {
    facts.push(<span key="sc">No sales call on record</span>);
  }
  if (nextSalesAt) facts.push(<span key="next">Next call {shortDate(nextSalesAt)}</span>);
  if (paid > 0) facts.push(<span key="paid">Paid {usd(paid)}</span>);
  if (converted && client.program_start_date) facts.push(<span key="start">Started {shortDate(client.program_start_date)}</span>);
  if (outcome) {
    facts.push(
      <span key="out" className={`font-semibold ${outcome.cls}`}>
        {outcome.label}
      </span>
    );
  }

  const objections = (brief?.objections || []).filter((o) => o?.objection);
  const handoff = brief?.csm_handoff || {};
  const hasBody = Boolean(
    brief && (brief.situation || objections.length || brief.struggles?.length || brief.decision_drivers?.length)
  );

  return (
    <div className="rounded-lg border border-gray-200 dark:border-white/10 bg-white/60 dark:bg-white/5 px-3 py-2.5 space-y-1.5">
      <p className="text-[11px] text-gray-600 dark:text-gray-400 flex flex-wrap gap-x-1.5">
        {facts.map((f, i) => (
          <span key={i}>
            {i > 0 ? '· ' : ''}
            {f}
          </span>
        ))}
      </p>

      {!hasBody || !brief ? (
        <p className="text-[11px] text-gray-500 dark:text-gray-400">Re-analyze to pull situation and objections from the call.</p>
      ) : converted ? (
        <>
          {brief.decision_drivers?.length ? <Row label="Bought because">{joined(brief.decision_drivers)}</Row> : null}
          {brief.situation ? <Row label="Before">{brief.situation}</Row> : null}
          {brief.struggles?.length ? <Row label="Struggles">{joined(brief.struggles)}</Row> : null}
          {handoff.success_definition ? <Row label="Win =">{handoff.success_definition}</Row> : null}
          {handoff.watch_outs?.length ? (
            <Row label="Watch">
              <span className="text-amber-800 dark:text-amber-200">{joined(handoff.watch_outs)}</span>
            </Row>
          ) : null}
        </>
      ) : (
        <>
          {brief.situation ? <Row label="Now">{brief.situation}</Row> : null}
          {brief.why_not_closed ? (
            <Row label="Blocker">
              <span className="text-rose-800 dark:text-rose-200">{brief.why_not_closed}</span>
            </Row>
          ) : null}
          {objections.length ? (
            <Row label="Objections">
              {objections.map((o, i) => (
                <span key={i} title={o.quote ? `“${o.quote}”` : undefined}>
                  {i > 0 ? ' · ' : ''}
                  {o.objection}
                  <span className={o.resolved ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                    {o.resolved ? ' ✓' : ' (open)'}
                  </span>
                </span>
              ))}
            </Row>
          ) : null}
          {brief.struggles?.length ? <Row label="Struggles">{joined(brief.struggles)}</Row> : null}
          {brief.decision_drivers?.length ? <Row label="Wants change because">{joined(brief.decision_drivers)}</Row> : null}
        </>
      )}

      {brief?.next_move ? (
        <p className="text-[11px] leading-snug rounded-md bg-violet-500/10 text-violet-900 dark:text-violet-100 px-2 py-1">
          <span className="font-semibold">Next: </span>
          {brief.next_move}
        </p>
      ) : null}
    </div>
  );
}
