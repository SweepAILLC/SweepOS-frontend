'use client';

import type { ReactNode } from 'react';
import type { Client } from '@/types/client';
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
      {children}
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
  return (
    <section className="space-y-6">
      <Section title="Call & opportunity">
        <IntelligenceSection
          client={client}
          refreshToken={healthRefreshToken}
          showChecklist={false}
          variant="strategy"
          onClientUpdated={onClientUpdated}
          onClientPatched={onClientPatched}
          onOpenEmailComposerWithDraft={onOpenEmailComposerWithDraft}
        />
      </Section>

      <Section title="Health score">
        <ClientHealthScoreContent
          client={client}
          refreshToken={healthRefreshToken}
          engagementStrip
          showFactors={false}
          onScoreLoaded={onHealthScoreLoaded}
        />
      </Section>

      <Section title="Next steps">
        <AIRecommendationsSection
          client={client}
          refreshToken={healthRefreshToken}
          embedded
          onOpenEmailComposerWithDraft={onOpenEmailComposerWithDraft}
        />
      </Section>
    </section>
  );
}
