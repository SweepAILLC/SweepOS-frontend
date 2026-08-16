/** Funnel Simulator types — paid VSL forward model + organic DM reverse model. */

export type SimulatorMode = 'paid_vsl' | 'organic_dm';
export type SimulatorLookback = 30 | 90 | 'mtd';
export type OrganicGoalMode = 'cash' | 'commission';
export type BaselineSource = 'kpi_rollup' | 'funnel_leads' | 'funnel_events' | 'manual';

export interface PaidVslInputs {
  daysInMonth: number;
  dailyAdSpend: number | null;
  cpc: number | null;
  lpConvPct: number | null;
  bookCallPct: number | null;
  showPct: number | null;
  closePct: number | null;
  aov: number | null;
  salesTeamPct: number | null;
  operatorPct: number | null;
  tech: number | null;
  extras: number | null;
  processorPct: number | null;
}

export interface OrganicDmInputs {
  daysInMonth: number;
  aov: number | null;
  goalMode: OrganicGoalMode;
  cashCollectedGoal: number | null;
  commissionGoal: number | null;
  commissionPct: number | null;
  pitchToBookPct: number | null;
  convoToBookPct: number | null;
  qualifiedBookingsPct: number | null;
  showPct: number | null;
  closePct: number | null;
  /** Optional: project revenue from daily conversations (forward check). */
  dailyConvosOverride: number | null;
}

export interface SimulatorInputs {
  paid: PaidVslInputs;
  organic: OrganicDmInputs;
}

export interface PaidVslOutputs {
  monthlyAdSpend: number | null;
  dailyVisitors: number | null;
  monthlyLeads: number | null;
  cpl: number | null;
  booked: number | null;
  showed: number | null;
  sales: number | null;
  revenue: number | null;
  costPerCall: number | null;
  cpa: number | null;
  roas: number | null;
  salesCost: number | null;
  operatorCost: number | null;
  processorCost: number | null;
  totalCosts: number | null;
  net: number | null;
}

export interface OrganicDmOutputs {
  ccGoal: number | null;
  closesNeeded: number | null;
  callsTaken: number | null;
  callsBooked: number | null;
  callsPitched: number | null;
  convos: number | null;
  dailyConvos: number | null;
  dailyPitched: number | null;
  dailyBookings: number | null;
  /** Forward projection when dailyConvosOverride is set. */
  forwardBooked: number | null;
  forwardShowed: number | null;
  forwardSales: number | null;
  forwardRevenue: number | null;
}

export interface BaselineField {
  value: number | null;
  source: BaselineSource | null;
  sample_n: number | null;
  sample_d: number | null;
  missing_reason: string | null;
}

export interface FunnelSimulatorFunnelOption {
  id: string;
  name: string;
}

export interface FunnelSimulatorBaselines {
  lookback_start: string;
  lookback_end: string;
  days: number;
  funnel_id: string | null;
  calendar_available: boolean;
  aov_basis: 'cash_collected' | 'revenue' | null;
  fields: {
    show_pct: BaselineField;
    close_pct: BaselineField;
    aov: BaselineField;
    book_call_pct: BaselineField;
    convo_to_book_pct: BaselineField;
    pitch_to_book_pct: BaselineField;
    lp_conv_pct: BaselineField;
  };
  funnels: FunnelSimulatorFunnelOption[];
}

export interface FunnelSimulatorScenario {
  id: string;
  org_id: string;
  name: string;
  mode: SimulatorMode;
  funnel_id: string | null;
  lookback_days: number | 'mtd' | string;
  inputs: SimulatorInputs;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FunnelSimulatorScenarioWrite {
  name: string;
  mode: SimulatorMode;
  funnel_id?: string | null;
  lookback_days: number | 'mtd';
  inputs: SimulatorInputs;
}
