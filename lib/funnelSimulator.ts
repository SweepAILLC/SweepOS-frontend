import type {
  OrganicDmInputs,
  OrganicDmOutputs,
  PaidVslInputs,
  PaidVslOutputs,
  SimulatorInputs,
} from '@/types/funnelSimulator';

function num(v: number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Divide; null when either side is missing or denominator is 0. */
export function safeDiv(numerator: number | null, denominator: number | null): number | null {
  const n = num(numerator);
  const d = num(denominator);
  if (n == null || d == null || d === 0) return null;
  return n / d;
}

/** Convert a 0–100 percent input to a 0–1 rate. */
export function pctRate(pct: number | null): number | null {
  const p = num(pct);
  if (p == null) return null;
  return p / 100;
}

export function roundMoney(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

export function round1(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null;
  return Math.round(n * 10) / 10;
}

export function defaultPaidInputs(): PaidVslInputs {
  return {
    daysInMonth: 30,
    dailyAdSpend: null,
    cpc: null,
    lpConvPct: null,
    bookCallPct: null,
    showPct: null,
    closePct: null,
    aov: null,
    salesTeamPct: null,
    operatorPct: null,
    tech: null,
    extras: null,
    processorPct: 2.9,
  };
}

export function defaultOrganicInputs(): OrganicDmInputs {
  return {
    daysInMonth: 30,
    aov: null,
    goalMode: 'cash',
    cashCollectedGoal: null,
    commissionGoal: null,
    commissionPct: null,
    pitchToBookPct: null,
    convoToBookPct: null,
    qualifiedBookingsPct: 100,
    showPct: null,
    closePct: null,
    dailyConvosOverride: null,
  };
}

export function defaultSimulatorInputs(): SimulatorInputs {
  return {
    paid: defaultPaidInputs(),
    organic: defaultOrganicInputs(),
  };
}

export function calculatePaidVsl(input: PaidVslInputs): PaidVslOutputs {
  const days = Math.max(1, num(input.daysInMonth) ?? 30);
  const dailyAd = num(input.dailyAdSpend);
  const cpc = num(input.cpc);
  const lp = pctRate(input.lpConvPct);
  const book = pctRate(input.bookCallPct);
  const show = pctRate(input.showPct);
  const close = pctRate(input.closePct);
  const aov = num(input.aov);
  const salesTeam = pctRate(input.salesTeamPct) ?? 0;
  const operator = pctRate(input.operatorPct) ?? 0;
  const tech = num(input.tech) ?? 0;
  const extras = num(input.extras) ?? 0;
  const processor = pctRate(input.processorPct) ?? 0;

  const monthlyAdSpend = dailyAd == null ? null : dailyAd * days;
  const dailyVisitors = safeDiv(dailyAd, cpc);
  const monthlyLeads =
    dailyVisitors == null || lp == null ? null : dailyVisitors * days * lp;
  const cpl = safeDiv(monthlyAdSpend, monthlyLeads);
  const booked = monthlyLeads == null || book == null ? null : monthlyLeads * book;
  const showed = booked == null || show == null ? null : booked * show;
  const sales = showed == null || close == null ? null : showed * close;
  const revenue = sales == null || aov == null ? null : sales * aov;
  const costPerCall = safeDiv(monthlyAdSpend, showed);
  const cpa = safeDiv(monthlyAdSpend, sales);
  const roas = safeDiv(revenue, monthlyAdSpend);
  const salesCost = revenue == null ? null : revenue * salesTeam;
  const operatorCost = revenue == null ? null : revenue * operator;
  const processorCost = revenue == null ? null : revenue * processor;
  const totalCosts =
    monthlyAdSpend == null
      ? null
      : monthlyAdSpend +
        (salesCost ?? 0) +
        (operatorCost ?? 0) +
        tech +
        extras +
        (processorCost ?? 0);
  const net =
    revenue == null || totalCosts == null ? null : revenue - totalCosts;

  return {
    monthlyAdSpend: roundMoney(monthlyAdSpend),
    dailyVisitors: round1(dailyVisitors),
    monthlyLeads: round1(monthlyLeads),
    cpl: roundMoney(cpl),
    booked: round1(booked),
    showed: round1(showed),
    sales: round1(sales),
    revenue: roundMoney(revenue),
    costPerCall: roundMoney(costPerCall),
    cpa: roundMoney(cpa),
    roas: roas == null ? null : Math.round(roas * 100) / 100,
    salesCost: roundMoney(salesCost),
    operatorCost: roundMoney(operatorCost),
    processorCost: roundMoney(processorCost),
    totalCosts: roundMoney(totalCosts),
    net: roundMoney(net),
  };
}

export function calculateOrganicDm(input: OrganicDmInputs): OrganicDmOutputs {
  const days = Math.max(1, num(input.daysInMonth) ?? 30);
  const aov = num(input.aov);
  const close = pctRate(input.closePct);
  const show = pctRate(input.showPct);
  const qualified = pctRate(input.qualifiedBookingsPct) ?? 1;
  const pitch = pctRate(input.pitchToBookPct);
  const convo = pctRate(input.convoToBookPct);

  let ccGoal: number | null = null;
  if (input.goalMode === 'commission') {
    ccGoal = safeDiv(num(input.commissionGoal), pctRate(input.commissionPct));
  } else {
    ccGoal = num(input.cashCollectedGoal);
  }

  const closesNeeded = safeDiv(ccGoal, aov);
  const callsTaken = safeDiv(closesNeeded, close);
  const afterShow = safeDiv(callsTaken, show);
  const callsBooked = afterShow == null ? null : safeDiv(afterShow, qualified);
  const callsPitched = safeDiv(callsBooked, pitch);
  const convos = safeDiv(callsBooked, convo);
  const dailyConvos = safeDiv(convos, days);
  const dailyPitched = safeDiv(callsPitched, days);
  const dailyBookings = safeDiv(callsBooked, days);

  const dailyOverride = num(input.dailyConvosOverride);
  let forwardBooked: number | null = null;
  let forwardShowed: number | null = null;
  let forwardSales: number | null = null;
  let forwardRevenue: number | null = null;
  if (dailyOverride != null && convo != null) {
    const monthlyConvos = dailyOverride * days;
    forwardBooked = monthlyConvos * convo;
    forwardShowed = show == null ? null : forwardBooked * show * qualified;
    forwardSales = forwardShowed == null || close == null ? null : forwardShowed * close;
    forwardRevenue = forwardSales == null || aov == null ? null : forwardSales * aov;
  }

  return {
    ccGoal: roundMoney(ccGoal),
    closesNeeded: round1(closesNeeded),
    callsTaken: round1(callsTaken),
    callsBooked: round1(callsBooked),
    callsPitched: round1(callsPitched),
    convos: round1(convos),
    dailyConvos: round1(dailyConvos),
    dailyPitched: round1(dailyPitched),
    dailyBookings: round1(dailyBookings),
    forwardBooked: round1(forwardBooked),
    forwardShowed: round1(forwardShowed),
    forwardSales: round1(forwardSales),
    forwardRevenue: roundMoney(forwardRevenue),
  };
}

export function formatUsd(n: number | null | undefined, opts?: { cents?: boolean }): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const cents = opts?.cents ?? abs < 1000;
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

export function formatNum(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;
}

export function formatRoas(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}x`;
}

export function parseNumInput(raw: string): number | null {
  const t = raw.trim().replace(/,/g, '');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
