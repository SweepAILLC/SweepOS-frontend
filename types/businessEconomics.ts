/** GET/PUT /business-economics — dollars, not cents. Owners/admins only. */
export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive';

export interface BusinessEconomics {
  configured: boolean;
  fixed_monthly_costs: number | null;
  /** 0–95: commissions + payment processor + delivery, as a share of revenue. */
  variable_cost_pct: number | null;
  include_living_in_breakeven: boolean;
  cash_reserves: number | null;
  tax_reserve: number | null;
  living_expenses: number | null;
  risk_tolerance: RiskTolerance;
  target_cost_per_call: number | null;
  roas_decay: number | null;
  monthly_recurring_cash: number | null;
  updated_at: string | null;
}

export type BusinessEconomicsInput = Partial<Omit<BusinessEconomics, 'configured' | 'updated_at'>>;

export type ScaleVerdict = 'bulk' | 'hold' | 'cut' | 'unknown';
export type GapZoneName = 'losing' | 'danger' | 'hold' | 'push';

export interface ScaleReadiness {
  risk_tolerance: RiskTolerance;
  monthly_spend: number;
  current_roas: number | null;
  worst_week_roas: number | null;
  breakeven_roas: number | null;
  marginal_breakeven_roas: number;
  gap: { gap_pct: number; zone: GapZoneName } | null;
  monthly_burn: number;
  cushion: number | null;
  runway_months: number | null;
  reserve_floor_months: number;
  max_safe_loss: number | null;
  current_profit: number | null;
  recommended_monthly_spend: number | null;
  recommended_daily_spend: number | null;
  recommended_expected_profit: number | null;
  recommended_worst_profit: number | null;
  verdict: ScaleVerdict;
  reasons: string[];
}

export interface ScaleReadinessResponse {
  configured: boolean;
  trailing: {
    monthly_spend: number;
    monthly_cash: number;
    roas: number | null;
    worst_week_roas: number | null;
    cost_per_booking_volatility_pct: number | null;
    weeks_with_spend: number;
    weeks: string[];
  };
  readiness: ScaleReadiness;
  /** Present when the planner asked for one funnel: its own numbers, fixed costs split by spend share. */
  funnel: ScaleFunnelSlice | null;
  target_cost_per_call: number | null;
}

export interface ScaleFunnelSlice {
  funnel_id: string;
  monthly_spend: number;
  monthly_cash: number;
  roas: number | null;
  worst_week_roas: number | null;
  cost_per_booking_volatility_pct: number | null;
  weeks_with_spend: number;
  spend_share_pct: number;
  allocated_fixed_monthly: number;
  breakeven_roas: number | null;
  gap: { gap_pct: number; zone: GapZoneName } | null;
}
