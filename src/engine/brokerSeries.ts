import type { BrokerGroup, NormalizedBrokerRow } from '../data/schemas';
import {
  makeBrokerGroupIndex,
  resolveBrokerGroup,
  rowsInWindow,
  safeAdd,
  signedMagnitudes,
  type FlowScenario,
} from './flows';
import {
  factId,
  trilingual,
  type Fact,
  type FactsContext,
  type FactsData,
  type FactPeriod,
  type FactVersions,
} from './facts';
import { isSessionEligibleAtCutoff, rowsEligibleAtCutoff, sessionAvailableAt } from './predicates';
import { effectiveWindow } from './stockView';

export interface BrokerSeriesPoint {
  date: string;
  // null means the broker was not observed in the visible sample that session,
  // or the session itself is missing or excluded. A gap is never read as zero.
  nets: Record<string, number | null>;
}

export interface BrokerSeriesSummary {
  brokerCode: string;
  group: BrokerGroup;
  netLots: number;
  observedSessions: number;
  capturedSessions: number;
  firstObserved: string | null;
  lastObserved: string | null;
  factId: string;
}

export interface BrokerSeriesView {
  window: FactPeriod;
  capturedSessions: number;
  points: BrokerSeriesPoint[];
  summaries: BrokerSeriesSummary[];
  facts: Fact[];
  // The selection rule behind the default lines, stated so the chart is not
  // mistaken for a ranking of brokers to trade with.
  defaultCodes: string[];
}

export const MAX_VISIBLE_BROKER_LINES = 3;

function scenarioOf(context: FactsContext): FlowScenario | undefined {
  return context.unknownBrokerCodes && context.unknownBrokerCodes.length > 0
    ? { unknownBrokerCodes: context.unknownBrokerCodes }
    : undefined;
}

// Cumulative observed net flow per broker, built from the same reviewed NET rows
// and the same publication cutoff as every other fact on the screen. This is
// observed flow in the visible sample, never ownership, holdings or intent.
export function buildBrokerSeries(
  context: FactsContext,
  data: FactsData,
  selectedCodes: readonly string[],
): BrokerSeriesView | null {
  const window = effectiveWindow(context, data);
  if (!window) return null;

  const versions: FactVersions = {
    data: context.dataVersion,
    taxonomy: context.taxonomyVersion,
    claims: context.claimVersion,
  };
  const scenario = scenarioOf(context);
  const brokerGroups = makeBrokerGroupIndex(data.brokers);

  const capturedSessions = data.sessions
    .filter(
      (session) =>
        session.status === 'captured' &&
        session.date >= window.start &&
        session.date <= window.end &&
        isSessionEligibleAtCutoff(session.date, context.cutoffAt),
    )
    .map((session) => session.date)
    .sort();
  if (capturedSessions.length === 0) return null;

  // Missing and excluded market sessions inside the window stay on the x axis
  // as explicit unknown dates once published; holidays and weekends never plot.
  const plottedSessions = data.sessions
    .filter(
      (session) =>
        session.date >= window.start &&
        session.date <= window.end &&
        session.status !== 'holiday' &&
        session.status !== 'weekend' &&
        isSessionEligibleAtCutoff(session.date, context.cutoffAt),
    )
    .map((session) => session.date)
    .sort();

  const windowRows = rowsInWindow(rowsEligibleAtCutoff(data.rows, context.cutoffAt), window);
  const rowsByBrokerDay = new Map<string, NormalizedBrokerRow[]>();
  const codesInWindow = new Set<string>();
  for (const row of windowRows) {
    codesInWindow.add(row.brokerCode);
    const key = `${row.brokerCode}|${row.date}`;
    rowsByBrokerDay.set(key, [...(rowsByBrokerDay.get(key) ?? []), row]);
  }

  const dailyByBroker = new Map<string, Map<string, number>>();
  const netByBroker = new Map<string, number>();
  const observedByBroker = new Map<string, string[]>();
  for (const code of codesInWindow) {
    const daily = new Map<string, number>();
    let total = 0;
    const observed: string[] = [];
    for (const date of capturedSessions) {
      const rows = rowsByBrokerDay.get(`${code}|${date}`);
      if (!rows || rows.length === 0) continue;
      let dayNet = 0;
      for (const row of rows) {
        dayNet = safeAdd(dayNet, signedMagnitudes(row).signedLots, `${code} daily ${date}`);
      }
      daily.set(date, dayNet);
      total = safeAdd(total, dayNet, `${code} window total`);
      observed.push(date);
    }
    dailyByBroker.set(code, daily);
    netByBroker.set(code, total);
    observedByBroker.set(code, observed);
  }

  const facts: Fact[] = [];
  const summaries: BrokerSeriesSummary[] = [];
  for (const code of [...codesInWindow].sort((a, b) => a.localeCompare(b))) {
    const observed = observedByBroker.get(code) ?? [];
    const daily = dailyByBroker.get(code) ?? new Map<string, number>();
    const rows = windowRows.filter((row) => row.brokerCode === code);
    const period: FactPeriod = { start: window.start, end: window.end };
    const id = factId(context.ticker, 'BRK-NET', period, code);
    facts.push({
      fact_id: id,
      key: 'BRK-NET',
      type: 'broker-observation',
      period,
      source_row_ids: rows.map((row) => row.id),
      source_event_ids: [],
      source_sessions: observed,
      unit: 'lots',
      value: {
        kind: 'daily-broker-nets',
        days: observed.map((date) => ({ date, netLots: daily.get(date) ?? 0 })),
      },
      approximate: trilingual((locale) =>
        locale === 'zh-CN'
          ? `${observed.length}/${capturedSessions.length} 个时段`
          : `${observed.length} of ${capturedSessions.length} sessions`,
      ),
      coverage_note: {
        en: `${code} observed net lots per captured session inside the window. Missing and excluded market sessions inside the window stay on the axis as unknown dates. A session where ${code} is not in the visible top-nine-per-side sample is unknown, not zero, and the line breaks there. Group labels follow the active classification and do not change this broker's own rows.`,
        id: `Lot bersih terobservasi ${code} per sesi tertangkap di dalam jendela. Sesi pasar yang hilang atau dikecualikan di dalam jendela tetap berada di sumbu sebagai tanggal tidak diketahui. Sesi ketika ${code} tidak ada dalam sampel sembilan teratas per sisi yang terlihat tidak diketahui, bukan nol, dan garisnya terputus di sana. Label grup mengikuti klasifikasi aktif dan tidak mengubah baris broker ini sendiri.`,
        zh: `${code} 在窗口内每个已采集时段的净手数。窗口内的缺失或已剔除市场时段在坐标轴上保留为未知日期。${code} 不在前九大每边可见样本中的时段为未知，而非零，且线条在该处断开。分组标签遵循当前分类，不改变该券商自身的行。`,
      },
      available_at: sessionAvailableAt(window.end),
      versions,
      evidence: {
        strength: 'Strong',
        reason: {
          en: `Summed from the ${code} rows visible in the window; the sign comes from the reported side.`,
          id: `Dijumlahkan dari baris ${code} yang terlihat di jendela; tandanya berasal dari sisi yang dilaporkan.`,
          zh: `由窗口内可见的 ${code} 数据行求和得出；正负号来自所报告的方向。`,
        },
      },
      available: true,
    });
    summaries.push({
      brokerCode: code,
      group: resolveBrokerGroup(code, brokerGroups, scenario),
      netLots: netByBroker.get(code) ?? 0,
      observedSessions: observed.length,
      capturedSessions: capturedSessions.length,
      firstObserved: observed[0] ?? null,
      lastObserved: observed[observed.length - 1] ?? null,
      factId: id,
    });
  }

  const runningTotals = buildRunningTotals(capturedSessions, dailyByBroker);
  const points: BrokerSeriesPoint[] = plottedSessions.map((date) => {
    const nets: Record<string, number | null> = {};
    for (const code of selectedCodes) {
      nets[code] = runningTotals.get(code)?.get(date) ?? null;
    }
    return { date, nets };
  });

  const defaultCodes = [...codesInWindow]
    .sort(
      (a, b) =>
        Math.abs(netByBroker.get(b) ?? 0) - Math.abs(netByBroker.get(a) ?? 0) || a.localeCompare(b),
    )
    .slice(0, MAX_VISIBLE_BROKER_LINES);

  return { window, capturedSessions: capturedSessions.length, points, summaries, facts, defaultCodes };
}

// Cumulative totals only advance on sessions where the broker is observed, and
// stay absent elsewhere, so the chart shows a gap rather than a flat line that
// would read as "no activity".
function buildRunningTotals(
  capturedSessions: readonly string[],
  dailyByBroker: ReadonlyMap<string, Map<string, number>>,
): Map<string, Map<string, number>> {
  const perBroker = new Map<string, Map<string, number>>();
  for (const [code, daily] of dailyByBroker) {
    const running = new Map<string, number>();
    let total = 0;
    for (const date of capturedSessions) {
      const dayNet = daily.get(date);
      if (dayNet === undefined) continue;
      total += dayNet;
      running.set(date, total);
    }
    perBroker.set(code, running);
  }
  return perBroker;
}
