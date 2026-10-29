'use client';

export interface PlaybookSection {
  id: string;
  title: string;
  steps: string[];
}

export function playbookSection(playbook?: string | null): PlaybookSection {
  if (playbook === 'scaling') return SECTIONS[1];
  if (playbook === 'surplus') return SECTIONS[2];
  if (playbook === 'quality') return SECTIONS[3];
  return SECTIONS[0];
}

const SECTIONS: PlaybookSection[] = [
  {
    id: 'playbook-fatigue',
    title: 'Ad fatigue protocol',
    steps: [
      'Confirm the signals. Creative fatigue needs two leading moves together (frequency, CTR, CPM) against this ad’s own baseline. The signature is cost per result rising while result volume falls.',
      'Pull spend back and check the next day. Do not refresh creative on the same afternoon you notice the spike.',
      'If cost per result recovers, it was a messaging ceiling, not fatigue. Tag the campaign foundational and hold spend near the last efficient level.',
      'If cost per result does not recover, it is fatigue. Duplicate the ad set. Swap fresh executions of the same buying reason for the 1–3 ads taking the spend. Keep the ads that got no reach — they are the bench.',
      'Retire the original only after the replacement is approved. Do not force distribution by splitting one ad per ad set; that inflates cost.',
    ],
  },
  {
    id: 'playbook-scaling',
    title: 'Scaling playbook',
    steps: [
      'Structure: one cold ABO campaign, three ad sets (broad, one interest stack, one lookalike stack), 25–30 distinct ads, about 5 body copies and 5 headlines written broad enough to fit all of them.',
      'Gates before a budget step: out of learning, about 50 or more results in 7 days, cost per result stable and under your target, frequency under 2.0, and no budget change in the last 72 hours.',
      'Step about +20% every 48–72 hours. Use about +30% only when the ad set is already doing ~80+ results a week. Meta does not publish a 20% rule — a huge jump can re-enter learning.',
      'When the next dollar pushes cost per result up, pull back to the efficient spend, tag the campaign foundational, duplicate the ad set, remove the 1–3 winners, keep the no-reach ads, and add 1–3 new ones.',
      'More scale comes from a new messaging pocket (a different reason to buy), not from broadening the niche or forcing this message past its ceiling.',
    ],
  },
  {
    id: 'playbook-surplus',
    title: 'Creative surplus',
    steps: [
      'Keep a weekly or bi-weekly shoot. Each batch should yield 10–20 variants: different hooks, lengths, and formats, not tiny edits of the same ad.',
      'Hold finished ads on the bench so a fatigue flag does not cost 24–48 hours of filming.',
      'Plan a refresh slot every 14–21 days on cold creative. Andromeda burns creative faster than the old 4–6 week cycle.',
      'Winners stay in the foundational ad set. New concepts enter beside them. Do not pause a working ad just because a new one launched.',
    ],
  },
  {
    id: 'playbook-quality',
    title: 'Quality override',
    steps: [
      'A cheap lead can still be the wrong lead. If sales says the people from the “winning” ads are a poor fit, treat those ads as losers even when cost per result looks fine.',
      'Duplicate the ad set, remove that messaging, and do not scale it. Cost per result does not measure lead quality — call feedback does.',
      'This check is manual. Sweep cannot hear the sales floor. Run it whenever a scale or fatigue alert lands on ads that book calls.',
    ],
  },
];
