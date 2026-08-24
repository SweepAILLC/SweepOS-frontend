'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Client } from '@/types/client';
import { apiClient } from '@/lib/api';
import IntelligenceSection from './IntelligenceSection';
import ClientHealthScoreContent from './ClientHealthScoreContent';
import AIRecommendationsSection from './aiRecommendations/AIRecommendationsSection';

interface ClientStrategyPanelProps {
  client: Client;
  healthRefreshToken?: number;
  onClientUpdated?: () => void;
  onClientPatched?: (client: Client) => void;
  onHealthScoreLoaded?: (clientId: string, score: number, grade: string) => void;
  onOpenEmailComposerWithDraft?: (draft: {
    subject: string;
    bodyHtml: string;
    bodyText: string;
  }) => void;
}

function SubAccordion({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50/80 dark:bg-white/[0.04] hover:bg-gray-100/80 dark:hover:bg-white/[0.06] transition-colors"
        aria-expanded={open}
      >
        <span>{title}</span>
        <svg
          className={`w-4 h-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? <div className="px-3 py-3 border-t border-gray-200 dark:border-white/10">{children}</div> : null}
    </div>
  );
}

export default function ClientStrategyPanel({
  client,
  healthRefreshToken = 0,
  onClientUpdated,
  onClientPatched,
  onHealthScoreLoaded,
  onOpenEmailComposerWithDraft,
}: ClientStrategyPanelProps) {
  const [panelOpen, setPanelOpen] = useState(true);
  const [callOpen, setCallOpen] = useState(true);
  const [healthOpen, setHealthOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [healthGrade, setHealthGrade] = useState<string | null>(null);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [insightHeadline, setInsightHeadline] = useState<string | null>(null);
  const [insightTags, setInsightTags] = useState<string[]>([]);
  const [openActionCount, setOpenActionCount] = useState<number | null>(null);

  const loadSummary = useCallback(() => {
    if (!client.id) return;
    apiClient
      .getClientCallInsights(client.id)
      .then((data) => {
        setInsightHeadline(data?.summary?.headline?.trim() || null);
        setInsightTags(data?.summary?.tags || []);
      })
      .catch(() => {
        setInsightHeadline(null);
        setInsightTags([]);
      });
    apiClient
      .getClientAIRecommendations(client.id)
      .then((data) => {
        const open = (data?.actions || []).filter((a: { completed: boolean }) => !a.completed).length;
        setOpenActionCount(open);
      })
      .catch(() => setOpenActionCount(null));
    apiClient
      .getClientHealthScore(client.id, { useAi: false })
      .then((res) => {
        setHealthGrade(res.grade);
        setHealthScore(res.score);
      })
      .catch(() => {
        setHealthGrade(null);
        setHealthScore(null);
      });
  }, [client.id]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary, client.id, client.updated_at, healthRefreshToken]);

  const handleHealthLoaded = (clientId: string, score: number, grade: string) => {
    setHealthScore(score);
    setHealthGrade(grade);
    onHealthScoreLoaded?.(clientId, score, grade);
  };

  return (
    <section className="border border-gray-200 dark:border-white/10 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left bg-violet-50/60 dark:bg-violet-950/20 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors"
        aria-expanded={panelOpen}
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Strategy & AI</span>
          {!panelOpen ? (
            <>
              {insightHeadline ? (
                <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{insightHeadline}</p>
              ) : (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Call context, health score, and next steps
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5">
                {healthGrade != null && healthScore != null ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/15 bg-white/80 dark:bg-white/5 tabular-nums">
                    Health {healthScore} ({healthGrade})
                  </span>
                ) : null}
                {openActionCount != null && openActionCount > 0 ? (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200">
                    {openActionCount} open step{openActionCount !== 1 ? 's' : ''}
                  </span>
                ) : null}
                {insightTags.slice(0, 4).map((t) => (
                  <span
                    key={t}
                    className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-gray-200 dark:border-white/15 text-gray-600 dark:text-gray-300"
                  >
                    {t.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <svg
          className={`w-5 h-5 shrink-0 text-gray-500 mt-0.5 transition-transform ${panelOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {panelOpen ? (
        <div className="px-3 py-3 space-y-3 border-t border-gray-200 dark:border-white/10">
          <SubAccordion title="Call & opportunity" open={callOpen} onToggle={() => setCallOpen((o) => !o)}>
            <IntelligenceSection
              client={client}
              refreshToken={healthRefreshToken}
              showChecklist={false}
              variant="strategy"
              onClientUpdated={onClientUpdated}
              onClientPatched={onClientPatched}
              onOpenEmailComposerWithDraft={onOpenEmailComposerWithDraft}
            />
          </SubAccordion>

          <SubAccordion title="Health score" open={healthOpen} onToggle={() => setHealthOpen((o) => !o)}>
            <ClientHealthScoreContent
              client={client}
              refreshToken={healthRefreshToken}
              engagementStrip
              showFactors={false}
              onScoreLoaded={handleHealthLoaded}
            />
          </SubAccordion>

          <SubAccordion title="Next steps" open={stepsOpen} onToggle={() => setStepsOpen((o) => !o)}>
            <AIRecommendationsSection
              client={client}
              refreshToken={healthRefreshToken}
              embedded
              onOpenEmailComposerWithDraft={onOpenEmailComposerWithDraft}
            />
          </SubAccordion>
        </div>
      ) : null}
    </section>
  );
}
