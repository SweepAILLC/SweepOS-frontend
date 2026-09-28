/** Team KPIs (docs/features/TEAM_KPIS_PRD.md) — /team API shapes. */

/** Rep type for member-access users (Settings → Team role dropdown). */
export type TeamRole = 'sales' | 'marketing';

export interface TeamMember {
  user_id: string;
  name: string;
  email: string | null;
  access_role: string;
  team_role: TeamRole | null;
  owes_eod: boolean;
}

export interface TeamEodDay {
  date: string;
  status: 'submitted' | 'missed' | 'today' | 'upcoming';
}

export interface TeamEodSummary {
  /** One entry per required day in the month (the dot strip). */
  days: TeamEodDay[];
  submitted_today: boolean;
  last_submitted: string | null;
  streak: number;
  /** Required days in the period before today. */
  required_days: number;
  submitted_days: number;
  missed: number;
}

export interface TeamMetricCell {
  key: string;
  label: string;
  /** 'pct' values are percent numbers (40 = 40%). */
  format: 'int' | 'usd' | 'pct';
  value: number | null;
  /** Same elapsed span of the previous period. */
  previous: number | null;
  /** Best month (month view only). */
  best: number | null;
}

export interface TeamOverviewMember {
  user_id: string;
  name: string;
  team_role: TeamRole;
  /** null = this role doesn't owe an EOD (closers). */
  eod: TeamEodSummary | null;
  setter_metrics: TeamMetricCell[];
  closer_metrics: TeamMetricCell[];
  /** This month's EOD notes (setter context + content attracting ICP), newest first. */
  notes: TeamEodNote[];
  /** "Content attracting ICP" answers this month, most common first. */
  content_counts: Array<{ content_type: string; count: number }>;
}

export interface TeamEodNote {
  date: string;
  setter_context: string | null;
  content_type: string | null;
}

export interface TeamOverviewResponse {
  /** 'range' = explicit start/end from the page date filter. */
  period: 'week' | 'month' | 'range';
  period_start: string;
  period_end: string;
  today: string;
  /** Share of the period's required days elapsed (drives on-track pacing). */
  pace: number;
  required_weekdays: number[];
  members: TeamOverviewMember[];
}

export interface TeamSettings {
  eod_required_weekdays: number[];
  reminder_enabled: boolean;
  reminder_local_time: string;
  reminder_channels: Array<'discord' | 'email'>;
  digest_enabled: boolean;
  digest_local_time: string;
  timezone: string;
}
