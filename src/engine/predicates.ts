import type { BrokerGroup, BrokerProfile, NormalizedBrokerRow, SessionSummary, SiniEvent } from '../data/schemas';
import { isEventAvailableAtCutoff } from '../data/events';
import {
  brokerNetForDate,
  cumulativeGroupNet,
  rowsInWindow,
  type FlowGroup,
  type FlowScenario,
  type GroupNet,
} from './flows';

export type PredicateStatus = 'passes' | 'fails' | 'not_enough_data';

export interface StreakResult {
  status: PredicateStatus;
  dates: string[];
  reason: string;
  evidence: Array<{ date: string; groups?: GroupNet; value?: number }>;
}

export interface SnapshotChange {
  brokerCode: string;
  fromDate: string;
  toDate: string;
  fromNetLots: number;
  toNetLots: number;
  changeLots: number;
}

export interface BrokerReversal extends SnapshotChange {
  reversed: boolean;
  caveat: string;
}

const GROUPS: readonly FlowGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

export function sessionAvailableAt(sessionDate: string): string {
  const date = new Date(`${sessionDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return `${date.toISOString().slice(0, 10)}T00:00:00+07:00`;
}

export function isSessionEligibleAtCutoff(sessionDate: string, cutoffAt: string): boolean {
  return Date.parse(sessionAvailableAt(sessionDate)) <= Date.parse(cutoffAt);
}

export function rowsEligibleAtCutoff(
  rows: readonly NormalizedBrokerRow[],
  cutoffAt: string,
): NormalizedBrokerRow[] {
  return rows.filter((row) => isSessionEligibleAtCutoff(row.date, cutoffAt));
}

export function eventsPublishedAtCutoff(events: readonly SiniEvent[], cutoffAt: string): SiniEvent[] {
  return events.filter((event) => isEventAvailableAtCutoff(event, cutoffAt));
}

export function lastActualMarketSessions(
  sessions: readonly SessionSummary[],
  endingDate: string,
  count: number,
): SessionSummary[] {
  return sessions
    .filter((session) => session.date <= endingDate)
    .filter((session) => session.status !== 'holiday' && session.status !== 'weekend')
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, count)
    .reverse();
}

export function positiveStreak(
  rows: readonly NormalizedBrokerRow[],
  brokers: readonly Pick<BrokerProfile, 'code' | 'group'>[],
  sessions: readonly SessionSummary[],
  group: BrokerGroup,
  endingDate: string,
  length: number,
  scenario?: FlowScenario,
): StreakResult {
  const windowSessions = lastActualMarketSessions(sessions, endingDate, length);
  const availability = requireCapturedWindow(windowSessions, length);
  if (availability) return availability;

  const evidence = windowSessions.map((session) => {
    const groups = groupNetForDate(rows, brokers, session.date, scenario);
    return { date: session.date, value: groups[group] };
  });
  const failing = evidence.find((entry) => (entry.value ?? 0) <= 0);
  if (failing) return { status: 'fails', dates: windowSessions.map((session) => session.date), reason: `${group} is not positive on ${failing.date}`, evidence };
  return { status: 'passes', dates: windowSessions.map((session) => session.date), reason: `${group} is positive for all required sessions`, evidence };
}

export function mainBuyerStreak(
  rows: readonly NormalizedBrokerRow[],
  brokers: readonly Pick<BrokerProfile, 'code' | 'group'>[],
  sessions: readonly SessionSummary[],
  group: BrokerGroup,
  endingDate: string,
  length: number,
  scenario?: FlowScenario,
): StreakResult {
  const windowSessions = lastActualMarketSessions(sessions, endingDate, length);
  const availability = requireCapturedWindow(windowSessions, length);
  if (availability) return availability;

  const evidence = windowSessions.map((session) => ({
    date: session.date,
    groups: groupNetForDate(rows, brokers, session.date, scenario),
  }));

  for (const entry of evidence) {
    const candidate = entry.groups[group];
    const largerOrEqual = GROUPS.filter((other) => other !== group).find((other) => entry.groups[other] >= candidate);
    if (candidate <= 0) {
      return { status: 'fails', dates: windowSessions.map((session) => session.date), reason: `${group} is not positive on ${entry.date}`, evidence };
    }
    if (largerOrEqual) {
      return {
        status: 'fails',
        dates: windowSessions.map((session) => session.date),
        reason: `${group} is not strictly largest on ${entry.date}; ${largerOrEqual} is ${entry.groups[largerOrEqual]}`,
        evidence,
      };
    }
  }

  return { status: 'passes', dates: windowSessions.map((session) => session.date), reason: `${group} is positive and strictly largest for all required sessions`, evidence };
}

export interface StreakDayCell {
  date: string;
  ok: boolean;
}

// One cell per session inside the streak window: that day's own predicate
// outcome, so a panel can show which session carried or broke the run.
export function streakDayCells(
  flavour: 'positive' | 'main-buyer',
  rows: readonly NormalizedBrokerRow[],
  brokers: readonly Pick<BrokerProfile, 'code' | 'group'>[],
  sessions: readonly SessionSummary[],
  group: BrokerGroup,
  endingDate: string,
  length: number,
  scenario?: FlowScenario,
): StreakDayCell[] {
  const result =
    flavour === 'positive'
      ? positiveStreak(rows, brokers, sessions, group, endingDate, length, scenario)
      : mainBuyerStreak(rows, brokers, sessions, group, endingDate, length, scenario);
  if (result.status === 'not_enough_data') return [];
  return result.evidence.map((entry) => {
    if (flavour === 'positive') return { date: entry.date, ok: (entry.value ?? 0) > 0 };
    const groups = entry.groups;
    if (!groups) return { date: entry.date, ok: false };
    const candidate = groups[group];
    if (candidate <= 0) return { date: entry.date, ok: false };
    const largerOrEqual = GROUPS.filter((other) => other !== group).find((other) => groups[other] >= candidate);
    return { date: entry.date, ok: largerOrEqual === undefined };
  });
}

export function brokerObservedNet(
  rows: readonly NormalizedBrokerRow[],
  brokerCode: string,
  date: string,
): number | null {
  return brokerNetForDate(rows, date, brokerCode)?.netLots ?? null;
}

export function snapshotChange(
  rows: readonly NormalizedBrokerRow[],
  brokerCode: string,
  fromDate: string,
  toDate: string,
): SnapshotChange | null {
  const fromNetLots = brokerObservedNet(rows, brokerCode, fromDate);
  const toNetLots = brokerObservedNet(rows, brokerCode, toDate);
  if (fromNetLots === null || toNetLots === null) return null;
  return {
    brokerCode,
    fromDate,
    toDate,
    fromNetLots,
    toNetLots,
    changeLots: toNetLots - fromNetLots,
  };
}

export function observedBrokerReversal(
  rows: readonly NormalizedBrokerRow[],
  brokerCode: string,
  fromDate: string,
  toDate: string,
): BrokerReversal | null {
  const change = snapshotChange(rows, brokerCode, fromDate, toDate);
  if (!change) return null;
  return {
    ...change,
    reversed: change.fromNetLots * change.toNetLots < 0,
    caveat: 'Opposite observed net directions through one broker, not a proven same-client round trip.',
  };
}

export function latestObservedReversal(
  rows: readonly NormalizedBrokerRow[],
  sessions: readonly SessionSummary[],
  brokerCode: string,
): BrokerReversal | null {
  const netByDate = new Map<string, number>();
  for (const row of rows) {
    if (row.brokerCode !== brokerCode) continue;
    netByDate.set(row.date, (netByDate.get(row.date) ?? 0) + (row.side === 'buy' ? row.netLots : -row.netLots));
  }
  const ordered = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    const to = ordered[index]!;
    const from = ordered[index - 1]!;
    if (from.status !== 'captured' || to.status !== 'captured') continue;
    const fromNetLots = netByDate.get(from.date);
    const toNetLots = netByDate.get(to.date);
    if (fromNetLots === undefined || toNetLots === undefined) continue;
    if (fromNetLots === 0 || toNetLots === 0) continue;
    if (Math.sign(fromNetLots) === Math.sign(toNetLots)) continue;
    return {
      brokerCode,
      fromDate: from.date,
      toDate: to.date,
      fromNetLots,
      toNetLots,
      changeLots: toNetLots - fromNetLots,
      reversed: true,
      caveat: 'Opposite observed net directions through one broker, not a proven same-client round trip.',
    };
  }
  return null;
}

export function withOneBrokerUnknownOverride(scenario: FlowScenario | undefined, brokerCode: string): FlowScenario {
  return {
    ...scenario,
    unknownBrokerCodes: [...new Set([...(scenario?.unknownBrokerCodes ?? []), brokerCode])],
  };
}

export function groupNetForDate(
  rows: readonly NormalizedBrokerRow[],
  brokers: readonly Pick<BrokerProfile, 'code' | 'group'>[],
  date: string,
  scenario?: FlowScenario,
): GroupNet {
  return cumulativeGroupNet(rows, brokers, { start: date, end: date }, scenario);
}

export function rowsVisibleByCutoffInWindow(
  rows: readonly NormalizedBrokerRow[],
  cutoffAt: string,
  start: string,
  end: string,
): NormalizedBrokerRow[] {
  return rowsInWindow(rowsEligibleAtCutoff(rows, cutoffAt), { start, end });
}

function requireCapturedWindow(sessions: readonly SessionSummary[], length: number): StreakResult | null {
  if (sessions.length < length) {
    return { status: 'not_enough_data', dates: sessions.map((session) => session.date), reason: `Need ${length} actual market sessions`, evidence: [] };
  }
  const unavailable = sessions.find((session) => session.status !== 'captured');
  if (unavailable) {
    return {
      status: 'not_enough_data',
      dates: sessions.map((session) => session.date),
      reason: `${unavailable.date} is ${unavailable.status}`,
      evidence: [],
    };
  }
  return null;
}
