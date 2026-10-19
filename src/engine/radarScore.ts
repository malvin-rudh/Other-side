// The Live Radar score. A preset, transparent rule: three pillar sub-scores
// (0 to 100) built from graded checks (partial credit by strength), then a weighted sum. No
// machine learning, no hidden inputs. Replay-safe: only rows, events and
// reports that were public on the session date are read.
//
// Inspiration (see the Research method page for links): Piotroski F-score
// (binary pass/fail health checks), Altman Z (short-term cover and equity),
// Chaikin accumulation/distribution and "bandarmology" broker reading
// (persistence of net buying, broker concentration), and recency tiers for
// news. The checks are our own simple versions, not those models.

import type { PublicData } from '../data/publicData';
import type { CompanyHealthReport } from '../data/companyHealth';
import { summarizeFlows, type InsightGroup } from './insights';

export type RadarLabel = 'accumulating' | 'leaving' | 'mixed' | 'noSignal';
export type PillarId = 'transactions' | 'health' | 'events';

export const RADAR_WEIGHTS: Record<PillarId, number> = { transactions: 50, health: 30, events: 20 };

export const ACCUMULATING_MIN_SCORE = 55;
export const ACCUMULATING_MIN_TRANSACTIONS = 60;
export const NO_SIGNAL_BELOW = 30;

export interface RadarCheck {
  id: string;
  points: number;
  max: number;
  passed: boolean;
}

export interface RadarPillar {
  // Null when the data for this pillar is not available on the date.
  score: number | null;
  checks: RadarCheck[];
}

export type RadarReason =
  | { code: 'noData' }
  | { code: 'accumulating' | 'leaving' | 'mixed' | 'noSignal'; instRecentLots: number; passed: number; total: number; health: number | null; events: number | null };

export interface RadarResult {
  ticker: string;
  date: string;
  score: number;
  label: RadarLabel;
  pillars: Record<PillarId, RadarPillar>;
  reason: RadarReason;
  missing: PillarId[];
}

export interface RadarInput {
  ticker: string;
  data: PublicData | null;
  report: CompanyHealthReport | null;
  // The selected session date; null falls back to the dataset's last session.
  sessionDate: string | null;
}

const ROUND_TRIP_WINDOW = 3;
const ROUND_TRIP_RATIO = 0.8;

// Grading constants. Each check earns 0 to its max, linearly between a floor
// (no credit) and a ceiling (full credit). Full credit is set at an extreme
// level, so a perfect 100 needs every check at its extreme at once.
export const GRADES = {
  windowNetShare: { floor: 0, full: 0.6 }, // institution net lots / all lots bought, whole window
  recentNetShare: { floor: 0, full: 0.5 }, // same, last 5 sessions
  persistenceCredit: [0, 0, 5, 11, 17, 20], // points by buying sessions out of the last 5
  concentration: { floor: 0.6, full: 0.2 }, // largest net buyer / all net buying
  roundTrip: { floor: 0.5, full: 0 }, // round-trip lots / net buying lots
  handover: { floor: 1, full: 0 }, // app-facing recent net / institution recent net
  equityRatio: { floor: 0, full: 0.6 }, // equity / assets
  equityGrowth: { floor: 0, full: 0.15 },
  debtChange: { floor: -0.2, full: 0.3 }, // fall in loans and related-party debt; unchanged earns 40%
  coreMargin: { floor: 0, full: 0.15 }, // profit without one-offs / revenue
  cashMargin: { floor: 0, full: 0.2 }, // operating cash flow / revenue
  currentRatio: { floor: 0.8, full: 2.5 },
  eventFadeDays: 60, // a same-day event earns full points, fading to 0 at 60 days
} as const;

// Linear credit from 0 at `floor` to 1 at `full`; works for either direction.
export function ramp(x: number, floor: number, full: number): number {
  if (!Number.isFinite(x)) return 0;
  const t = (x - floor) / (full - floor);
  return Math.min(1, Math.max(0, t));
}

export const TRANSACTION_CHECK_POINTS = [
  { id: 'windowNet', max: 20 },
  { id: 'recentNet', max: 20 },
  { id: 'persistence', max: 20 },
  { id: 'concentration', max: 15 },
  { id: 'roundTrip', max: 15 },
  { id: 'handover', max: 10 },
] as const;

export const HEALTH_CHECK_POINTS = [
  { id: 'equityPositive', max: 20 },
  { id: 'equityUp', max: 10 },
  { id: 'debtDown', max: 15 },
  { id: 'coreProfit', max: 20 },
  { id: 'operatingCash', max: 20 },
  { id: 'shortTermCover', max: 15 },
] as const;


// A graded check: credit is a fraction (0 to 1) of the max, kept to one decimal.
// "passed" means at least half the credit, used only for the short count.
function check(id: string, max: number, credit: number): RadarCheck {
  const points = Math.round(max * Math.min(1, Math.max(0, credit)) * 10) / 10;
  return { id, max, passed: points >= max / 2, points };
}

function sum(checks: RadarCheck[]): number {
  return Math.round(checks.reduce((total, c) => total + c.points, 0));
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function effectiveDate(data: PublicData, sessionDate: string | null): string {
  return sessionDate ?? data.defaultWindow.end;
}

function transactionsPillar(data: PublicData, date: string) {
  const flows = summarizeFlows(data, date);
  if (flows === null) return null;
  const start = data.defaultWindow.start;
  const groupOf = new Map(data.brokers.map((b) => [b.code, b.group]));
  const rows = data.rows.filter((row) => row.date >= start && row.date <= date);
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const inst: InsightGroup = 'institution_facing';

  // Persistence: sessions out of the last five where institution-facing brokers net bought.
  const lastFive = new Set(dates.slice(-5));
  const dayNet = new Map<string, number>();
  let boughtAll = 0;
  let boughtRecent = 0;
  for (const row of rows) {
    if (row.side === 'buy') {
      boughtAll += row.netLots;
      if (lastFive.has(row.date)) boughtRecent += row.netLots;
    }
    if (groupOf.get(row.brokerCode) !== inst || !lastFive.has(row.date)) continue;
    dayNet.set(row.date, (dayNet.get(row.date) ?? 0) + (row.side === 'buy' ? row.netLots : -row.netLots));
  }
  const positiveDays = [...dayNet.values()].filter((v) => v > 0).length;

  // Per broker: net lots and round-trip ratio.
  const brokers = new Map<string, { buy: number; sell: number; buyIdx: number[]; sells: { idx: number; lots: number }[] }>();
  for (const row of rows) {
    const entry = brokers.get(row.brokerCode) ?? { buy: 0, sell: 0, buyIdx: [], sells: [] };
    const idx = dateIndex.get(row.date)!;
    if (row.side === 'buy') {
      entry.buy += row.netLots;
      entry.buyIdx.push(idx);
    } else {
      entry.sell += row.netLots;
      entry.sells.push({ idx, lots: row.netLots });
    }
    brokers.set(row.brokerCode, entry);
  }
  let positiveTotal = 0;
  let positiveMax = 0;
  let roundTripLots = 0;
  for (const entry of brokers.values()) {
    const net = entry.buy - entry.sell;
    if (net <= 0) continue;
    positiveTotal += net;
    positiveMax = Math.max(positiveMax, net);
    const matched = entry.sells
      .filter((s) => entry.buyIdx.some((b) => s.idx >= b && s.idx - b <= ROUND_TRIP_WINDOW))
      .reduce((total, s) => total + s.lots, 0);
    if (entry.buy > 0 && Math.min(matched, entry.buy) / entry.buy > ROUND_TRIP_RATIO) roundTripLots += net;
  }

  const handoverFlag = flows.recentNets[inst] < 0 && flows.recentNets.app_facing > 0;
  const g = GRADES;
  const instRecent = flows.recentNets[inst];
  const appRecent = flows.recentNets.app_facing;
  const share = (lots: number, total: number) => (total > 0 && lots > 0 ? lots / total : 0);
  const handoverCredit =
    instRecent <= 0 || handoverFlag ? 0 : appRecent <= 0 ? 1 : ramp(appRecent / instRecent, g.handover.floor, g.handover.full);
  const checks = [
    check('windowNet', 20, ramp(share(flows.nets[inst], boughtAll), g.windowNetShare.floor, g.windowNetShare.full)),
    check('recentNet', 20, ramp(share(instRecent, boughtRecent), g.recentNetShare.floor, g.recentNetShare.full)),
    check('persistence', 20, (g.persistenceCredit[Math.min(positiveDays, 5)] ?? 0) / 20),
    check('concentration', 15, positiveTotal > 0 ? ramp(positiveMax / positiveTotal, g.concentration.floor, g.concentration.full) : 0),
    check('roundTrip', 15, positiveTotal > 0 ? ramp(roundTripLots / positiveTotal, g.roundTrip.floor, g.roundTrip.full) : 0),
    check('handover', 10, handoverCredit),
  ];
  const leaving = flows.recentNets[inst] < 0 && (flows.nets[inst] < 0 || handoverFlag);
  return { pillar: { score: sum(checks), checks } as RadarPillar, leaving, instRecentLots: flows.recentNets[inst] };
}

export function healthPillar(report: CompanyHealthReport | null, date: string): RadarPillar {
  if (report === null || report.availableFrom > date) return { score: null, checks: [] };
  const { balance: b, priorBalance: p, results: r } = report;
  const debt = b.bankLoans + b.relatedPartyBorrowings;
  const priorDebt = p.bankLoans + p.relatedPartyBorrowings;
  const g = GRADES;
  const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0);
  const equityCredit = b.totalEquity > 0 ? ramp(safeDiv(b.totalEquity, b.totalAssets), g.equityRatio.floor, g.equityRatio.full) : 0;
  const growthCredit = p.totalEquity > 0 && b.totalEquity > 0 ? ramp(b.totalEquity / p.totalEquity - 1, g.equityGrowth.floor, g.equityGrowth.full) : 0;
  const debtCredit =
    debt <= 0 ? 1 : priorDebt <= 0 ? 0 : ramp((priorDebt - debt) / priorDebt, g.debtChange.floor, g.debtChange.full);
  const coreCredit = ramp(safeDiv(r.netProfit - r.oneOffGain, r.revenue), g.coreMargin.floor, g.coreMargin.full);
  const cashCredit = ramp(safeDiv(r.operatingCashFlow, r.revenue), g.cashMargin.floor, g.cashMargin.full);
  const coverCredit = b.currentLiabilities > 0 ? ramp(b.currentAssets / b.currentLiabilities, g.currentRatio.floor, g.currentRatio.full) : 1;
  const checks = [
    check('equityPositive', 20, equityCredit),
    check('equityUp', 10, growthCredit),
    check('debtDown', 15, debtCredit),
    check('coreProfit', 20, coreCredit),
    check('operatingCash', 20, cashCredit),
    check('shortTermCover', 15, coverCredit),
  ];
  return { score: sum(checks), checks };
}

export function eventsPillar(data: PublicData | null, date: string): RadarPillar {
  if (data === null || data.events.length === 0) return { score: null, checks: [] };
  const visible = data.events.filter((e) => e.publicationDate <= date);
  const fresh = (layer: 'story' | 'health', max: number) => {
    const ages = visible.filter((e) => e.layer === layer).map((e) => daysBetween(e.publicationDate, date));
    if (ages.length === 0) return 0;
    return Math.round(max * ramp(Math.min(...ages), GRADES.eventFadeDays, 0) * 10) / 10;
  };
  const story = fresh('story', 60);
  const health = fresh('health', 40);
  const checks: RadarCheck[] = [
    { id: 'story', max: 60, points: story, passed: story >= 30 },
    { id: 'healthEvent', max: 40, points: health, passed: health >= 20 },
  ];
  return { score: Math.round(story + health), checks };
}

export function computeRadar(input: RadarInput): RadarResult {
  const { ticker, data, report } = input;
  const empty: RadarPillar = { score: null, checks: [] };
  if (data === null) {
    return {
      ticker,
      date: input.sessionDate ?? '',
      score: 0,
      label: 'noSignal',
      pillars: { transactions: empty, health: healthPillar(report, input.sessionDate ?? ''), events: empty },
      reason: { code: 'noData' },
      missing: ['transactions', 'health', 'events'],
    };
  }
  const date = effectiveDate(data, input.sessionDate);
  const tx = transactionsPillar(data, date);
  const pillars: Record<PillarId, RadarPillar> = {
    transactions: tx?.pillar ?? empty,
    health: healthPillar(report, date),
    events: eventsPillar(data, date),
  };
  const missing = (Object.keys(pillars) as PillarId[]).filter((id) => pillars[id].score === null);

  // Missing pillars drop out and the remaining weights are rescaled to 100.
  const present = (Object.keys(pillars) as PillarId[]).filter((id) => pillars[id].score !== null);
  const weightSum = present.reduce((total, id) => total + RADAR_WEIGHTS[id], 0);
  const raw = weightSum === 0 ? 0 : present.reduce((total, id) => total + pillars[id].score! * RADAR_WEIGHTS[id], 0) / weightSum;
  // Without a transactions pillar there is nothing to line up with.
  const score = tx === null ? 0 : Math.round(raw);

  let label: RadarLabel;
  if (tx === null) label = 'noSignal';
  else if (tx.leaving) label = 'leaving';
  else if (score >= ACCUMULATING_MIN_SCORE && pillars.transactions.score! >= ACCUMULATING_MIN_TRANSACTIONS) label = 'accumulating';
  else if (score < NO_SIGNAL_BELOW) label = 'noSignal';
  else label = 'mixed';

  const txChecks = pillars.transactions.checks;
  const reason: RadarReason =
    tx === null
      ? { code: 'noData' }
      : {
          code: label,
          instRecentLots: tx.instRecentLots,
          passed: txChecks.filter((c) => c.passed).length,
          total: txChecks.length,
          health: pillars.health.score,
          events: pillars.events.score,
        };
  return { ticker, date, score, label, pillars, reason, missing };
}
