import type { BrokerGroup, BrokerProfile, BrokerSide, NormalizedBrokerRow } from '../data/schemas';

export type FlowGroup = BrokerGroup;
export type PriceTarget =
  | { type: 'all' }
  | { type: 'group'; group: FlowGroup }
  | { type: 'broker'; brokerCode: string };

export interface DateWindow {
  start: string;
  end: string;
}

export interface FlowScenario {
  unknownBrokerCodes?: readonly string[];
}

export interface SignedMagnitudes {
  signedLots: number;
  signedValueIdr: number;
}

export interface GroupNet {
  app_facing: number;
  institution_facing: number;
  other_mixed: number;
  unknown: number;
  residual: number;
}

export interface DailyGroupNet {
  date: string;
  groups: GroupNet;
}

export interface BrokerNet {
  brokerCode: string;
  netLots: number;
  buyLots: number;
  sellLots: number;
}

export type ImpliedPriceReference =
  | {
      available: true;
      numerator: number;
      denominator: number;
      display: number;
    }
  | {
      available: false;
      reason: 'missing-input' | 'no-matching-rows' | 'non-positive-denominator' | 'unsafe-integer';
    };

const GROUPS: readonly FlowGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

export function assertSafeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value;
}

export function safeAdd(left: number, right: number, label: string): number {
  assertSafeInteger(left, `${label}.left`);
  assertSafeInteger(right, `${label}.right`);
  const sum = left + right;
  return assertSafeInteger(sum, label);
}

export function safeMultiply(left: number, right: number, label: string): number {
  assertSafeInteger(left, `${label}.left`);
  assertSafeInteger(right, `${label}.right`);
  const product = left * right;
  return assertSafeInteger(product, label);
}

export function signedMagnitudes(row: Pick<NormalizedBrokerRow, 'side' | 'netLots' | 'netValueIdr'>): SignedMagnitudes {
  const netLots = assertPositiveSafeInteger(row.netLots, 'netLots');
  const netValueIdr = assertPositiveSafeInteger(row.netValueIdr, 'netValueIdr');
  const sign = row.side === 'buy' ? 1 : -1;
  return {
    signedLots: safeMultiply(netLots, sign, 'signedLots'),
    signedValueIdr: safeMultiply(netValueIdr, sign, 'signedValueIdr'),
  };
}

export function rowsInWindow<T extends Pick<NormalizedBrokerRow, 'date'>>(rows: readonly T[], window: DateWindow): T[] {
  if (window.start > window.end) throw new Error('window start must be on or before end');
  return rows
    .filter((row) => row.date >= window.start && row.date <= window.end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function makeBrokerGroupIndex(brokers: readonly Pick<BrokerProfile, 'code' | 'group'>[]) {
  return new Map(brokers.map((broker) => [broker.code, broker.group]));
}

export function resolveBrokerGroup(
  brokerCode: string,
  brokerGroups: ReadonlyMap<string, BrokerGroup>,
  scenario?: FlowScenario,
): FlowGroup {
  if (scenario?.unknownBrokerCodes?.includes(brokerCode)) return 'unknown';
  return brokerGroups.get(brokerCode) ?? 'unknown';
}

export function dailyGroupNet(
  rows: readonly NormalizedBrokerRow[],
  brokers: readonly Pick<BrokerProfile, 'code' | 'group'>[],
  window: DateWindow,
  scenario?: FlowScenario,
): DailyGroupNet[] {
  const brokerGroups = makeBrokerGroupIndex(brokers);
  const byDate = new Map<string, GroupNet>();

  for (const row of rowsInWindow(rows, window)) {
    const groups = byDate.get(row.date) ?? emptyGroupNet();
    const group = resolveBrokerGroup(row.brokerCode, brokerGroups, scenario);
    const { signedLots } = signedMagnitudes(row);
    groups[group] = safeAdd(groups[group], signedLots, `${row.date}.${group}`);
    groups.residual = safeAdd(groups.residual, signedLots, `${row.date}.residual`);
    byDate.set(row.date, groups);
  }

  return [...byDate]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, groups]) => ({ date, groups }));
}

export function cumulativeGroupNet(
  rows: readonly NormalizedBrokerRow[],
  brokers: readonly Pick<BrokerProfile, 'code' | 'group'>[],
  window: DateWindow,
  scenario?: FlowScenario,
): GroupNet {
  return dailyGroupNet(rows, brokers, window, scenario).reduce((total, daily) => {
    for (const group of GROUPS) total[group] = safeAdd(total[group], daily.groups[group], `cumulative.${group}`);
    total.residual = safeAdd(total.residual, daily.groups.residual, 'cumulative.residual');
    return total;
  }, emptyGroupNet());
}

export function brokerNet(rows: readonly NormalizedBrokerRow[], window: DateWindow): BrokerNet[] {
  const nets = new Map<string, BrokerNet>();
  for (const row of rowsInWindow(rows, window)) {
    const current = nets.get(row.brokerCode) ?? {
      brokerCode: row.brokerCode,
      netLots: 0,
      buyLots: 0,
      sellLots: 0,
    };
    const lots = assertPositiveSafeInteger(row.netLots, `${row.id}.netLots`);
    if (row.side === 'buy') {
      current.buyLots = safeAdd(current.buyLots, lots, `${row.brokerCode}.buyLots`);
      current.netLots = safeAdd(current.netLots, lots, `${row.brokerCode}.netLots`);
    } else {
      current.sellLots = safeAdd(current.sellLots, lots, `${row.brokerCode}.sellLots`);
      current.netLots = safeAdd(current.netLots, -lots, `${row.brokerCode}.netLots`);
    }
    nets.set(row.brokerCode, current);
  }
  return [...nets.values()].sort((a, b) => a.brokerCode.localeCompare(b.brokerCode));
}

export function brokerNetForDate(
  rows: readonly NormalizedBrokerRow[],
  date: string,
  brokerCode: string,
): BrokerNet | null {
  return brokerNet(rows, { start: date, end: date }).find((net) => net.brokerCode === brokerCode) ?? null;
}

export function topBuyers(rows: readonly NormalizedBrokerRow[], window: DateWindow, limit = 10): BrokerNet[] {
  return brokerNet(rows, window)
    .filter((net) => net.netLots > 0)
    .sort((a, b) => b.netLots - a.netLots || a.brokerCode.localeCompare(b.brokerCode))
    .slice(0, limit);
}

export function topSellers(rows: readonly NormalizedBrokerRow[], window: DateWindow, limit = 10): BrokerNet[] {
  return brokerNet(rows, window)
    .filter((net) => net.netLots < 0)
    .sort((a, b) => a.netLots - b.netLots || a.brokerCode.localeCompare(b.brokerCode))
    .slice(0, limit);
}

export function impliedPriceReference(
  rows: readonly Partial<NormalizedBrokerRow>[],
  brokers: readonly Pick<BrokerProfile, 'code' | 'group'>[],
  side: BrokerSide,
  target: PriceTarget,
  window: DateWindow,
  scenario?: FlowScenario,
): ImpliedPriceReference {
  const brokerGroups = makeBrokerGroupIndex(brokers);
  let numerator = 0;
  let lots = 0;
  let matchedRows = 0;

  for (const row of rowsInWindow(rows.filter(hasDate), window)) {
    if (row.side !== side) continue;
    if (!matchesPriceTarget(row, target, brokerGroups, scenario)) continue;
    matchedRows += 1;
    if (row.netValueIdr === undefined || row.netLots === undefined) return { available: false, reason: 'missing-input' };
    try {
      const rowValue = assertSafeInteger(row.netValueIdr, 'netValueIdr');
      const rowLots = assertSafeInteger(row.netLots, 'netLots');
      if (rowValue < 0 || rowLots < 0) return { available: false, reason: 'unsafe-integer' };
      numerator = safeAdd(numerator, rowValue, 'price.numerator');
      lots = safeAdd(lots, rowLots, 'price.lots');
    } catch {
      return { available: false, reason: 'unsafe-integer' };
    }
  }

  if (matchedRows === 0) return { available: false, reason: 'no-matching-rows' };
  const denominator = safeMultiply(100, lots, 'price.denominator');
  if (denominator <= 0) return { available: false, reason: 'non-positive-denominator' };
  return { available: true, numerator, denominator, display: Math.round(numerator / denominator) };
}

function emptyGroupNet(): GroupNet {
  return { app_facing: 0, institution_facing: 0, other_mixed: 0, unknown: 0, residual: 0 };
}

function assertPositiveSafeInteger(value: unknown, label: string): number {
  const integer = assertSafeInteger(value, label);
  if (integer <= 0) throw new Error(`${label} must be positive`);
  return integer;
}

function hasDate(row: Partial<NormalizedBrokerRow>): row is Partial<NormalizedBrokerRow> & Pick<NormalizedBrokerRow, 'date'> {
  return typeof row.date === 'string';
}

function matchesPriceTarget(
  row: Partial<NormalizedBrokerRow> & Pick<NormalizedBrokerRow, 'date'>,
  target: PriceTarget,
  brokerGroups: ReadonlyMap<string, BrokerGroup>,
  scenario?: FlowScenario,
): boolean {
  if (target.type === 'all') return true;
  if (typeof row.brokerCode !== 'string') return false;
  if (target.type === 'broker') return row.brokerCode === target.brokerCode;
  return resolveBrokerGroup(row.brokerCode, brokerGroups, scenario) === target.group;
}
