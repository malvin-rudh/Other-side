import type { PublicData } from '../data/publicData';

// The broker-group totals the headlines and the interpretation read: net lots
// per group from the window start up to a session, the same for the last five
// captured sessions and the last one, and each group's average buying price.
// Pure arithmetic over the visible rows, so every sentence built from it traces
// back to them.

export type InsightGroup = 'app_facing' | 'institution_facing' | 'other_mixed';

export const INSIGHT_GROUPS: readonly InsightGroup[] = ['app_facing', 'institution_facing', 'other_mixed'];

type GroupNumbers = Record<InsightGroup, number>;

export interface FlowSummary {
  start: string;
  end: string;
  nets: GroupNumbers;
  recentNets: GroupNumbers;
  lastNets: GroupNumbers;
  // Value-weighted average price of the group's buying rows, or null.
  buyAverage: Record<InsightGroup, number | null>;
}

const RECENT_SESSIONS = 5;

function zero(): GroupNumbers {
  return { app_facing: 0, institution_facing: 0, other_mixed: 0 };
}

export function summarizeFlows(data: PublicData, sessionDate: string): FlowSummary | null {
  const start = data.defaultWindow.start;
  const groupOf = new Map(data.brokers.map((broker) => [broker.code, broker.group]));
  const rows = data.rows.filter((row) => row.date >= start && row.date <= sessionDate);
  if (rows.length === 0) return null;
  const dates = [...new Set(rows.map((row) => row.date))].sort();
  const recent = new Set(dates.slice(-RECENT_SESSIONS));
  const last = dates[dates.length - 1]!;

  const nets = zero();
  const recentNets = zero();
  const lastNets = zero();
  const buyValue = zero();
  const buyLots = zero();
  for (const row of rows) {
    const group = groupOf.get(row.brokerCode);
    if (group !== 'app_facing' && group !== 'institution_facing' && group !== 'other_mixed') continue;
    const signed = row.side === 'buy' ? row.netLots : -row.netLots;
    nets[group] += signed;
    if (recent.has(row.date)) recentNets[group] += signed;
    if (row.date === last) lastNets[group] += signed;
    if (row.side === 'buy') {
      buyValue[group] += row.netValueIdr;
      buyLots[group] += row.netLots;
    }
  }
  const buyAverage = Object.fromEntries(
    INSIGHT_GROUPS.map((group) => [group, buyLots[group] > 0 ? buyValue[group] / (buyLots[group] * 100) : null]),
  ) as Record<InsightGroup, number | null>;

  return { start: dates[0]!, end: last, nets, recentNets, lastNets, buyAverage };
}

// The group that bought the most and the one that sold the most, by net lots.
export function leadingGroups(nets: GroupNumbers): { buyer: InsightGroup | null; seller: InsightGroup | null } {
  const ordered = [...INSIGHT_GROUPS].sort((a, b) => nets[b] - nets[a]);
  const top = ordered[0]!;
  const bottom = ordered[ordered.length - 1]!;
  return { buyer: nets[top] > 0 ? top : null, seller: nets[bottom] < 0 ? bottom : null };
}
