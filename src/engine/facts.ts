import type {
  BrokerGroup,
  BrokerProfile,
  EvidenceStrength,
  NormalizedBrokerRow,
  SessionSummary,
  SiniEvent,
} from '../data/schemas';
import type { ContentLocale as Locale, Locale as UiLocale } from './context';
import {
  brokerNet,
  cumulativeGroupNet,
  dailyGroupNet,
  impliedPriceReference,
  makeBrokerGroupIndex,
  resolveBrokerGroup,
  rowsInWindow,
  topBuyers,
  topSellers,
  type DailyGroupNet,
  type FlowScenario,
  type GroupNet,
} from './flows';
import { isEventAvailableAtCutoff } from '../data/events';
import {
  isSessionEligibleAtCutoff,
  lastActualMarketSessions,
  latestObservedReversal,
  mainBuyerStreak,
  positiveStreak,
  rowsEligibleAtCutoff,
  sessionAvailableAt,
  withOneBrokerUnknownOverride,
  type BrokerReversal,
  type PredicateStatus,
} from './predicates';

export type FactKey =
  | 'C01'
  | 'C02'
  | 'C03'
  | 'C04'
  | 'C05'
  | 'C06'
  | 'C07'
  | 'C08'
  | 'C09'
  | 'C10'
  | 'C11'
  | 'C12'
  | 'C13'
  | 'C14'
  | 'C15'
  | 'C16'
  | 'C17'
  | 'C18'
  | 'C19'
  | 'C20'
  | 'C21'
  | 'C22'
  | 'C23'
  | 'C24'
  | 'C25'
  | 'REF-INST-2SEP'
  | 'REF-INST-CUTOFF'
  // Per-broker observed net-flow series built by engine/brokerSeries.ts. It is
  // deliberately not part of buildFacts, whose 28 reviewed facts stay fixed.
  | 'BRK-NET'
  | 'REF-XL-SELL'
  // Portfolio model facts built by engine/portfolioFacts.ts. They describe the
  // priced current-holdings model, never broker rows, and live in their own
  // document so buildFacts' 28 reviewed facts stay untouched.
  | 'P01'
  | 'P02'
  | 'P03'
  | 'P04'
  // P05 and P06 carry the complete per-symbol numbers, so a printed allocation
  // or contribution row opens a fact that contains its own symbol rather than
  // the single largest holding's.
  | 'P05'
  | 'P06';

export type FactType =
  | 'session-list'
  | 'session-count'
  | 'coverage'
  | 'group-net'
  | 'broker-ranking'
  | 'price-reference'
  | 'price-change'
  | 'streak'
  | 'daily-activity'
  | 'session-change'
  | 'broker-observation'
  | 'reversal'
  | 'sensitivity'
  | 'event'
  | 'label-evidence'
  | 'portfolio-performance'
  | 'portfolio-contribution'
  | 'portfolio-allocation'
  | 'portfolio-coverage'
  | 'portfolio-breakdown'
  | 'portfolio-weight-history';

export type FactUnit = 'sessions' | 'lots' | 'rows' | 'IDR-per-share-implied' | 'IDR' | 'fraction' | 'none';

export interface FactPeriod {
  start: string;
  end: string;
}

export interface FactVersions {
  data: string;
  taxonomy: string;
  claims: string;
}

export interface BilingualText {
  en: string;
  id: string;
  zh: string;
}

export function pickText(text: BilingualText, locale: Locale): string {
  return locale === 'zh-CN' ? text.zh : text[locale];
}

export interface RatioValue {
  numerator: number;
  denominator: number;
  display: number;
}

export interface StreakComparison {
  date: string;
  candidateGroup: BrokerGroup;
  candidateValue: number;
  otherGroup: BrokerGroup;
  otherValue: number;
}

export interface GroupLabelEvidence {
  group: BrokerGroup;
  brokers: {
    code: string;
    identityStrength: EvidenceStrength;
    profileStrength: EvidenceStrength;
    sourceReference: string;
  }[];
}

export type FactValue =
  | { kind: 'integer'; value: number }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'dates'; dates: string[] }
  | { kind: 'ratio'; numerator: number; denominator: number; display: number }
  | { kind: 'ratio-delta'; from: RatioValue; to: RatioValue; delta: number }
  | { kind: 'group-nets'; nets: GroupNet }
  | { kind: 'ranking'; entries: { brokerCode: string; netLots: number }[] }
  | { kind: 'daily-group-nets'; days: DailyGroupNet[] }
  | { kind: 'daily-broker-nets'; days: { date: string; netLots: number }[] }
  | { kind: 'reversal'; reversal: BrokerReversal }
  | { kind: 'sensitivity'; brokerCode: string; baseline: GroupNet; overridden: GroupNet }
  | {
      kind: 'coverage';
      captured: number;
      expected: number;
      missingDates: string[];
      excludedDates: string[];
      holidayDates: string[];
    }
  | { kind: 'streak'; group: BrokerGroup; status: PredicateStatus; dates: string[]; comparison?: StreakComparison }
  | { kind: 'label-evidence'; labels: GroupLabelEvidence[] }
  | { kind: 'event'; eventIds: string[] }
  | {
      // P01: modelled portfolio value and return over the shared baseline.
      kind: 'portfolio-performance';
      currency: string;
      sessions: number;
      startDate: string;
      endDate: string;
      startValue: number;
      endValue: number;
      returnFraction: number;
      benchmark: { symbol: string; startClose: number; endClose: number; returnFraction: number } | null;
    }
  | {
      // P02: the holding with the largest signed contribution to the change.
      kind: 'portfolio-contribution';
      symbol: string;
      quantityShares: number;
      startClose: number;
      endClose: number;
      priceChangeIdr: number;
      contributionFraction: number;
      holdingsCount: number;
    }
  | {
      // P03: the holding with the largest end-of-window weight.
      kind: 'portfolio-allocation';
      symbol: string;
      quantityShares: number;
      endClose: number;
      weightFraction: number;
      endValue: number;
      holdingsCount: number;
    }
  | {
      // P04: what the model covers and deliberately excludes.
      kind: 'portfolio-coverage';
      currency: string;
      symbols: string[];
      sessions: number;
      commonCloses: number;
      basis: 'real' | 'sample';
      benchmarkSymbol: string | null;
      dataVersion: string;
      // The cutoff the completion rule was evaluated at, and the newest session
      // that passed it. Both describe price-session availability, which is a
      // different thing from any series' provider fetch time.
      cutoffAt: string | null;
      completedThrough: string;
    }
  | {
      // P05: every owned holding's own numbers at both window endpoints, with
      // the totals each weight and contribution divides by. One entry per
      // printed row, so no row ever cites a fact about a different symbol.
      kind: 'portfolio-breakdown';
      currency: string;
      startDate: string;
      endDate: string;
      totalStartValue: number;
      totalEndValue: number;
      holdings: {
        symbol: string;
        quantityShares: number;
        startClose: number;
        endClose: number;
        startValue: number;
        endValue: number;
        priceChangeIdr: number;
        startWeightFraction: number;
        weightFraction: number;
        contributionFraction: number;
      }[];
    }
  | {
      // P06: each holding's weight on every consumed date, which is exactly the
      // series the allocation lines plot. Weights on one date sum to 1.
      kind: 'portfolio-weight-history';
      currency: string;
      points: {
        date: string;
        total: number;
        entries: {
          symbol: string;
          quantityShares: number;
          close: number;
          value: number;
          weightFraction: number;
        }[];
      }[];
    };

export interface Fact {
  fact_id: string;
  key: FactKey;
  type: FactType;
  period: FactPeriod;
  source_row_ids: string[];
  source_event_ids: string[];
  source_sessions: string[];
  value: FactValue | null;
  unit: FactUnit;
  approximate: BilingualText;
  coverage_note: BilingualText;
  available_at: string;
  evidence: { strength: EvidenceStrength; reason: BilingualText };
  versions: FactVersions;
  available: boolean;
  unavailable_reason?: BilingualText;
  // Typed reason a fact is withheld, so the UI can separate "the inputs are not
  // all captured yet" from other unavailable states without reading prose.
  unavailable_code?: FactUnavailableCode;
}

export type FactUnavailableCode = 'insufficient-captured-sessions';

export interface FactsContext {
  ticker: string;
  sessionDate: string;
  cutoffAt: string;
  periodStart: string;
  periodEnd: string;
  scenario: string;
  unknownBrokerCodes?: readonly string[];
  locale: UiLocale;
  dataVersion: string;
  taxonomyVersion: string;
  claimVersion: string;
  // Present only on portfolio facts documents; flows into the context key so
  // a portfolio explanation is bound to its exact priced inputs.
  portfolioKey?: string;
}

export interface FactsData {
  rows: readonly NormalizedBrokerRow[];
  sessions: readonly SessionSummary[];
  brokers: readonly BrokerProfile[];
  events: readonly SiniEvent[];
}

export interface FactsDocument {
  ticker: string;
  context: FactsContext;
  facts: Fact[];
}

const MARKET_STATUSES = new Set(['captured', 'missing', 'excluded']);
const GROUPS: readonly BrokerGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

export const EVENT_REFS: Record<'C19' | 'C20' | 'C21' | 'C22' | 'C23', readonly string[]> = {
  C19: ['E-SINI-0722-RIGHTS-DONE'],
  C20: ['E-SINI-0525-RIGHTS-PLAN', 'E-SINI-0820-H1'],
  C21: ['E-SINI-0821-EQUITY'],
  C22: ['E-SINI-0831-BOARD-EXIT'],
  C23: ['E-SINI-0820-H1'],
};

export function buildFacts(context: FactsContext, data: FactsData): FactsDocument {
  const versions: FactVersions = {
    data: context.dataVersion,
    taxonomy: context.taxonomyVersion,
    claims: context.claimVersion,
  };
  const scenario: FlowScenario | undefined =
    context.unknownBrokerCodes && context.unknownBrokerCodes.length > 0
      ? { unknownBrokerCodes: context.unknownBrokerCodes }
      : undefined;

  const eligibleSessions = data.sessions
    .filter((session) => isSessionEligibleAtCutoff(session.date, context.cutoffAt))
    .sort((a, b) => a.date.localeCompare(b.date));
  const marketSessions = eligibleSessions.filter((session) => MARKET_STATUSES.has(session.status));
  const visibleEnd = marketSessions.length > 0 ? (marketSessions[marketSessions.length - 1]?.date ?? null) : null;
  const clampedEnd = visibleEnd && visibleEnd < context.periodEnd ? visibleEnd : context.periodEnd;
  const window: FactPeriod | null =
    visibleEnd && context.periodStart <= clampedEnd ? { start: context.periodStart, end: clampedEnd } : null;

  const eligibleRows = rowsEligibleAtCutoff(data.rows, context.cutoffAt);
  const windowRows = window ? rowsInWindow(eligibleRows, window) : [];
  const capturedSessionsInWindow = window
    ? eligibleSessions.filter((session) => session.status === 'captured' && session.date >= window.start && session.date <= window.end)
    : [];

  const facts: Fact[] = [];
  const push = (fact: Fact) => facts.push(fact);

  push(buildC01(context, versions, eligibleSessions));
  push(buildC02(context, versions, window, capturedSessionsInWindow));
  push(buildC03(context, versions, window, eligibleSessions));
  push(buildGroupNet('C04', 'app_facing', context, versions, window, windowRows, data.brokers, scenario));
  push(buildGroupNet('C05', 'institution_facing', context, versions, window, windowRows, data.brokers, scenario));
  push(buildGroupNet('C06', 'combined_other', context, versions, window, windowRows, data.brokers, scenario));
  push(buildC07(context, versions, window, windowRows, data.brokers, scenario));
  push(buildRanking('C08', 'buyers', context, versions, window, windowRows));
  push(buildRanking('C09', 'sellers', context, versions, window, windowRows));
  push(buildC10(context, versions, window, windowRows, data.brokers, scenario));
  push(buildC11(context, versions, window, eligibleSessions, windowRows, data.brokers, scenario));
  push(buildStreak('C12', context, versions, eligibleSessions, eligibleRows, data.brokers, scenario, 'positive'));
  push(buildStreak('C13', context, versions, eligibleSessions, eligibleRows, data.brokers, scenario, 'main-buyer'));
  push(buildC14(context, versions, window, windowRows, data.brokers, scenario, capturedSessionsInWindow));
  push(buildC15(context, versions, window, windowRows));
  push(buildReversal('C16', 'CC', context, versions, window, eligibleRows, marketSessions));
  push(buildReversal('C17', 'AZ', context, versions, window, eligibleRows, marketSessions));
  push(buildC18(context, versions, window, windowRows, data.brokers, scenario));
  for (const key of ['C19', 'C20', 'C21', 'C22', 'C23'] as const) {
    push(buildEventFact(key, context, versions, data.events));
  }
  push(buildC24(context, versions, window, data.brokers));
  push(buildC25(context, versions, eligibleSessions, eligibleRows, data.brokers, scenario, visibleEnd));
  push(buildReference('REF-INST-2SEP', '2026-09-02', context, versions, window, windowRows, data.brokers, scenario));
  push(buildReference('REF-INST-CUTOFF', null, context, versions, window, windowRows, data.brokers, scenario));
  push(buildReference('REF-XL-SELL', null, context, versions, window, windowRows, data.brokers, scenario, 'XL', 'sell'));

  return { ticker: context.ticker, context, facts };
}

export function factByKey(document: FactsDocument, key: FactKey): Fact | undefined {
  return document.facts.find((fact) => fact.key === key);
}

export function factId(ticker: string, key: string, period: FactPeriod, variant: string): string {
  const compact = (date: string) => date.replaceAll('-', '');
  return `F-${ticker}-${key}-${compact(period.start)}-${compact(period.end)}-${variant}`;
}

export function trilingual(format: (locale: Locale) => string): BilingualText {
  return { en: format('en'), id: format('id'), zh: format('zh-CN') };
}

function compactLots(value: number, locale: Locale): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const body =
    locale === 'zh-CN'
      ? abs >= 10000
        ? `${Math.round(abs / 100) / 100}万`
        : new Intl.NumberFormat('zh-CN').format(abs)
      : abs >= 1000
        ? `${Math.round(abs / 1000)}${locale === 'id' ? ' rb' : 'k'}`
        : new Intl.NumberFormat(locale).format(abs);
  return `${sign}${body}`;
}

function aboutLots(value: number, locale: Locale): string {
  if (locale === 'id') return `sekitar ${compactLots(value, locale)} lot`;
  if (locale === 'zh-CN') return `约${compactLots(value, locale)}手`;
  return `about ${compactLots(value, locale)} lots`;
}

function lotsRangeCompact(from: number, to: number, locale: Locale): string {
  const joiner = locale === 'id' ? ' menjadi ' : locale === 'zh-CN' ? '至' : ' to ';
  return `${compactLots(from, locale)}${joiner}${compactLots(to, locale)}`;
}

function grouped(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

function unavailable(
  base: Omit<Fact, 'value' | 'approximate' | 'available' | 'unavailable_reason' | 'unavailable_code' | 'coverage_note' | 'evidence'>,
  reason: BilingualText,
  code?: FactUnavailableCode,
): Fact {
  return {
    ...base,
    value: null,
    approximate: trilingual(() => 'unavailable'),
    available: false,
    unavailable_reason: reason,
    ...(code ? { unavailable_code: code } : {}),
    coverage_note: {
      en: 'This statement is not supported at the current cutoff.',
      id: 'Pernyataan ini tidak didukung pada titik potong saat ini.',
      zh: '当前截点不支持该陈述。',
    },
    evidence: { strength: 'Not enough data', reason },
  };
}

function windowBase(
  key: FactKey,
  type: FactType,
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
): { fact_id: string; key: FactKey; type: FactType; period: FactPeriod; versions: FactVersions } | null {
  if (!window) return null;
  return {
    fact_id: factId(context.ticker, key, window, 'baseline'),
    key,
    type,
    period: window,
    versions,
  };
}

function buildC01(context: FactsContext, versions: FactVersions, eligibleSessions: readonly SessionSummary[]): Fact {
  const excluded = eligibleSessions.filter((session) => session.status === 'excluded');
  const period: FactPeriod = {
    start: excluded[0]?.date ?? eligibleSessions[0]?.date ?? context.periodStart,
    end: excluded[excluded.length - 1]?.date ?? eligibleSessions[0]?.date ?? context.periodStart,
  };
  const base = {
    fact_id: factId(context.ticker, 'C01', period, 'baseline'),
    key: 'C01' as const,
    type: 'session-list' as const,
    period,
    source_row_ids: [] as string[],
    source_event_ids: [] as string[],
    source_sessions: excluded.map((session) => session.date),
    unit: 'sessions' as const,
    available_at: period.end ? sessionAvailableAt(period.end) : context.cutoffAt,
    versions,
  };
  if (excluded.length === 0) {
    return unavailable(base, {
      en: 'No excluded sessions are visible at this cutoff.',
      id: 'Tidak ada sesi yang dikeluarkan yang terlihat pada titik potong ini.',
      zh: '当前截点下没有任何可见的被排除时段。',
    });
  }
  return {
    ...base,
    value: { kind: 'dates', dates: excluded.map((session) => session.date) },
    approximate: trilingual((locale) =>
      excluded.length === 1
        ? locale === 'zh-CN'
          ? '1 个时段'
          : '1 session'
        : locale === 'zh-CN'
          ? `${excluded.length} 个时段`
          : `${excluded.length} sessions`,
    ),
    coverage_note: {
      en: 'Sessions quarantined before ranking; their raw rows are diagnostic-only in validation.json.',
      id: 'Sesi yang dikarantina sebelum peringkat; baris mentahnya hanya diagnostik di validation.json.',
      zh: '时段在排名前已被隔离；其原始数据行仅作为 validation.json 中的诊断信息。',
    },
    evidence: {
      strength: 'Strong',
      reason: {
        en: 'Session statuses come from the reviewed session manifest.',
        id: 'Status sesi berasal dari manifes sesi yang telah ditinjau.',
        zh: '时段状态来自已审阅的时段清单。',
      },
    },
    available: true,
  };
}

function buildC02(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  capturedSessions: readonly SessionSummary[],
): Fact {
  const base = windowBase('C02', 'session-count', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, 'C02', { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key: 'C02',
        type: 'session-count',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'sessions',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No market sessions are visible at this cutoff.', id: 'Tidak ada sesi pasar yang terlihat pada titik potong ini.', zh: '当前截点下没有任何可见的市场时段。' },
    );
  }
  const dates = capturedSessions.map((session) => session.date);
  const lastDate = dates[dates.length - 1] ?? base.period.end;
  return {
    ...base,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: dates,
    unit: 'sessions',
    value: { kind: 'integer', value: dates.length },
    approximate: trilingual((locale) =>
      dates.length === 1
        ? locale === 'zh-CN'
          ? '1 个时段'
          : '1 session'
        : locale === 'zh-CN'
          ? `${dates.length} 个时段`
          : `${dates.length} sessions`,
    ),
    coverage_note: {
      en: 'Captured sessions only; holidays, weekends and the missing 8 Sep are not counted.',
      id: 'Hanya sesi yang terekam; hari libur, akhir pekan, dan 8 Sep yang hilang tidak dihitung.',
      zh: '仅统计已采集时段；节假日、周末以及缺失的 9 月 8 日不计入。',
    },
    available_at: sessionAvailableAt(lastDate),
    evidence: {
      strength: 'Strong',
      reason: {
        en: 'Counted from reviewed session manifest statuses inside the window.',
        id: 'Dihitung dari status manifes sesi yang ditinjau di dalam jendela.',
        zh: '按窗口内已审阅的时段清单状态计数。',
      },
    },
    available: true,
  };
}

function buildC03(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  eligibleSessions: readonly SessionSummary[],
): Fact {
  const base = windowBase('C03', 'coverage', context, versions, window);
  const fallbackPeriod: FactPeriod = { start: context.periodStart, end: context.periodEnd };
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, 'C03', fallbackPeriod, 'baseline'),
        key: 'C03',
        type: 'coverage',
        period: fallbackPeriod,
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'sessions',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No market sessions are visible at this cutoff.', id: 'Tidak ada sesi pasar yang terlihat pada titik potong ini.', zh: '当前截点下没有任何可见的市场时段。' },
    );
  }
  const inWindow = eligibleSessions.filter((session) => session.date >= base.period.start && session.date <= base.period.end);
  const captured = inWindow.filter((session) => session.status === 'captured');
  const missing = inWindow.filter((session) => session.status === 'missing');
  const excluded = inWindow.filter((session) => session.status === 'excluded');
  const holidays = inWindow.filter((session) => session.status === 'holiday');
  const expected = captured.length + missing.length + excluded.length;
  const lastDate = inWindow[inWindow.length - 1]?.date ?? base.period.end;
  return {
    ...base,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: inWindow.map((session) => session.date),
    unit: 'sessions',
    value: {
      kind: 'coverage',
      captured: captured.length,
      expected,
      missingDates: missing.map((session) => session.date),
      excludedDates: excluded.map((session) => session.date),
      holidayDates: holidays.map((session) => session.date),
    },
    approximate: trilingual((locale) =>
      locale === 'zh-CN' ? `${captured.length}/${expected} 个时段` : `${captured.length} of ${expected} sessions`,
    ),
    coverage_note: {
      en: 'Missing sessions are unknown, not zero; the visible top-nine sample is incomplete by design.',
      id: 'Sesi yang hilang tidak diketahui, bukan nol; sampel sembilan teratas yang terlihat memang tidak lengkap.',
      zh: '缺失时段是未知而非零；可见的前九大样本在设计上就是不完整的。',
    },
    available_at: sessionAvailableAt(lastDate),
    evidence: {
      strength: 'Strong',
      reason: {
        en: 'Coverage is computed from reviewed session statuses inside the window.',
        id: 'Cakupan dihitung dari status sesi yang ditinjau di dalam jendela.',
        zh: '覆盖情况按窗口内已审阅的时段状态计算。',
      },
    },
    available: true,
  };
}

export type GroupFocus = BrokerGroup | 'combined_other' | 'residual';

export function focusValue(nets: GroupNet, focus: GroupFocus): number {
  if (focus === 'combined_other') return nets.other_mixed + nets.unknown;
  if (focus === 'residual') return nets.residual;
  return nets[focus];
}

const FOCUS_LABEL: Record<GroupFocus, BilingualText> = {
  app_facing: { en: 'retail app brokers', id: 'broker aplikasi ritel', zh: '零售App券商' },
  institution_facing: { en: 'institutional brokers', id: 'broker institusional', zh: '机构券商' },
  other_mixed: { en: 'other / mixed brokers', id: 'broker lain / campuran', zh: '其他/混合券商' },
  unknown: { en: 'unclassified brokers', id: 'broker tidak terklasifikasi', zh: '未分类券商' },
  combined_other: { en: 'other / mixed and unclassified brokers', id: 'broker lain / campuran dan tidak terklasifikasi', zh: '其他/混合及未分类券商' },
  residual: { en: 'the visible sample', id: 'sampel yang terlihat', zh: '可见样本' },
};

function buildGroupNet(
  key: 'C04' | 'C05' | 'C06',
  focus: GroupFocus,
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  windowRows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
): Fact {
  const base = windowBase(key, 'group-net', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, key, { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key,
        type: 'group-net',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'lots',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  if (windowRows.length === 0) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'lots', available_at: context.cutoffAt },
      { en: 'No visible rows exist in the window at this cutoff.', id: 'Tidak ada baris yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内不存在可见的数据行。' },
    );
  }
  const nets = cumulativeGroupNet(windowRows, brokers, base.period, scenario);
  const value = focusValue(nets, focus);
  let focusRows: readonly NormalizedBrokerRow[];
  if (focus === 'residual') {
    focusRows = windowRows;
  } else {
    const brokerGroups = makeBrokerGroupIndex(brokers);
    focusRows = windowRows.filter((row) => {
      const group = resolveBrokerGroup(row.brokerCode, brokerGroups, scenario);
      return focus === 'combined_other' ? group === 'other_mixed' || group === 'unknown' : group === focus;
    });
  }
  return {
    ...base,
    source_row_ids: focusRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: [...new Set(focusRows.map((row) => row.date))],
    unit: 'lots',
    value: { kind: 'group-nets', nets },
    approximate: trilingual((locale) => aboutLots(value, locale)),
    coverage_note: {
      en:
        focus === 'residual'
          ? 'Residual is the signed total of the visible sample; the sample is not the whole market.'
          : `Net lots of ${FOCUS_LABEL[focus].en} in the visible top-nine-per-side sample; group labels are team mapping.`,
      id:
        focus === 'residual'
          ? 'Residu adalah total bertanda dari sampel terlihat; sampel bukan seluruh pasar.'
          : `Lot bersih ${FOCUS_LABEL[focus].id} dalam sampel sembilan teratas per sisi yang terlihat; label grup adalah pemetaan tim.`,
      zh:
        focus === 'residual'
          ? '残差是可见样本的带符号总数；样本并非整个市场。'
          : `${FOCUS_LABEL[focus].zh}在可见的前九大每边样本中的净手数；分组标签仅为团队映射。`,
    },
    available_at: sessionAvailableAt(base.period.end),
    evidence: {
      strength: focus === 'residual' ? 'Strong' : 'Moderate',
      reason: {
        en:
          focus === 'residual'
            ? 'Computed from every visible row in the window.'
            : 'Computed from visible rows; group labels rest on team mapping, not customer identity.',
        id:
          focus === 'residual'
            ? 'Dihitung dari setiap baris yang terlihat di jendela.'
            : 'Dihitung dari baris yang terlihat; label grup bergantung pada pemetaan tim, bukan identitas nasabah.',
        zh:
          focus === 'residual'
            ? '由窗口内每一条可见数据行计算得出。'
            : '由可见数据行计算得出；分组标签基于团队映射，不代表客户身份。',
      },
    },
    available: true,
  };
}

function buildC07(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  windowRows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
): Fact {
  const base = windowBase('C07', 'group-net', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, 'C07', { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key: 'C07',
        type: 'group-net',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'lots',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  if (windowRows.length === 0) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'lots', available_at: context.cutoffAt },
      { en: 'No visible rows exist in the window at this cutoff.', id: 'Tidak ada baris yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内不存在可见的数据行。' },
    );
  }
  const nets = cumulativeGroupNet(windowRows, brokers, base.period, scenario);
  return {
    ...base,
    source_row_ids: windowRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: [...new Set(windowRows.map((row) => row.date))],
    unit: 'lots',
    value: { kind: 'group-nets', nets },
    approximate: trilingual((locale) => aboutLots(nets.residual, locale)),
    coverage_note: {
      en: 'Residual is the signed total of the visible sample; the sample is not the whole market.',
      id: 'Residu adalah total bertanda dari sampel terlihat; sampel bukan seluruh pasar.',
      zh: '残差是可见样本的带符号总数；样本并非整个市场。',
    },
    available_at: sessionAvailableAt(base.period.end),
    evidence: {
      strength: 'Strong',
      reason: {
        en: 'Computed from every visible row in the window.',
        id: 'Dihitung dari setiap baris yang terlihat di jendela.',
        zh: '由窗口内每一条可见数据行计算得出。',
      },
    },
    available: true,
  };
}

function buildRanking(
  key: 'C08' | 'C09',
  side: 'buyers' | 'sellers',
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  windowRows: readonly NormalizedBrokerRow[],
): Fact {
  const base = windowBase(key, 'broker-ranking', context, versions, window);
  const label = side === 'buyers' ? 'buyers' : 'sellers';
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, key, { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key,
        type: 'broker-ranking',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'lots',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  if (windowRows.length === 0) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'lots', available_at: context.cutoffAt },
      { en: 'No visible rows exist in the window at this cutoff.', id: 'Tidak ada baris yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内不存在可见的数据行。' },
    );
  }
  const ranking = side === 'buyers' ? topBuyers(windowRows, base.period, 10) : topSellers(windowRows, base.period, 10);
  const entries = ranking.map((entry) => ({ brokerCode: entry.brokerCode, netLots: entry.netLots }));
  const rankedCodes = new Set(entries.map((entry) => entry.brokerCode));
  const rankingRows = windowRows.filter((row) => rankedCodes.has(row.brokerCode));
  const topThree = entries
    .slice(0, 3)
    .map((entry) => entry.brokerCode)
    .join(', ');
  return {
    ...base,
    source_row_ids: rankingRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: [...new Set(rankingRows.map((row) => row.date))],
    unit: 'lots',
    value: { kind: 'ranking', entries },
    approximate: trilingual(() => topThree),
    coverage_note: {
      en: `Ranking of visible net ${label} by lots inside the top-nine-per-side sample; brokers outside the sample are unknown.`,
      id: `Peringkat ${label} bersih yang terlihat berdasarkan lot di dalam sampel sembilan teratas per sisi; broker di luar sampel tidak diketahui.`,
      zh: `对可见的前九大每边样本中的净${side === 'buyers' ? '买入' : '卖出'}方按净手数排名；样本外的券商未知。`,
    },
    available_at: sessionAvailableAt(base.period.end),
    evidence: {
      strength: 'Moderate',
      reason: {
        en: 'Computed from visible rows only; the sample is incomplete and labels do not establish customer identity.',
        id: 'Dihitung hanya dari baris yang terlihat; sampel tidak lengkap dan label tidak menetapkan identitas nasabah.',
        zh: '仅由可见数据行计算得出；样本不完整，标签不代表客户身份。',
      },
    },
    available: true,
  };
}

function buildC10(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  windowRows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
): Fact {
  const base = windowBase('C10', 'price-reference', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, 'C10', { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key: 'C10',
        type: 'price-reference',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'IDR-per-share-implied',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  const buyRows = windowRows.filter((row) => row.side === 'buy');
  const reference = impliedPriceReference(windowRows, brokers, 'buy', { type: 'all' }, base.period, scenario);
  if (!reference.available) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'IDR-per-share-implied', available_at: context.cutoffAt },
      { en: `No usable net-buy rows in the window (${reference.reason}).`, id: `Tidak ada baris beli bersih yang dapat dipakai di jendela (${reference.reason}).`, zh: `窗口内没有可用的净买入数据行（${reference.reason}）。` },
    );
  }
  return {
    ...base,
    source_row_ids: buyRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: [...new Set(buyRows.map((row) => row.date))],
    unit: 'IDR-per-share-implied',
    value: { kind: 'ratio', numerator: reference.numerator, denominator: reference.denominator, display: reference.display },
    approximate: trilingual((locale) =>
      locale === 'zh-CN'
        ? `约${grouped(reference.display, locale)}（窗口平均）`
        : locale === 'id'
          ? `sekitar ${grouped(reference.display, locale)} (rata-rata jendela)`
          : `about ${grouped(reference.display, locale)} (window average)`,
    ),
    coverage_note: {
      en: 'Window average net-flow implied price reference from visible net-buy rows only; not an official close, VWAP, cost basis or executable quote.',
      id: 'Rata-rata jendela referensi harga tersirat arus bersih dari baris beli bersih yang terlihat saja; bukan penutup resmi, VWAP, biaya perolehan, atau kutipan yang dapat dieksekusi.',
      zh: '仅由可见净买入数据行得出的窗口平均净流入隐含价格参考；并非官方收盘价、VWAP、成本基准或可执行报价。',
    },
    available_at: sessionAvailableAt(base.period.end),
    evidence: {
      strength: 'Moderate',
      reason: {
        en: 'Computed from visible net-buy rows; the visible sample is incomplete by design.',
        id: 'Dihitung dari baris beli bersih yang terlihat; sampel yang terlihat memang tidak lengkap.',
        zh: '由可见净买入数据行计算得出；可见样本在设计上就是不完整的。',
      },
    },
    available: true,
  };
}

function buildC11(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  eligibleSessions: readonly SessionSummary[],
  windowRows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
): Fact {
  const base = windowBase('C11', 'price-change', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, 'C11', { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key: 'C11',
        type: 'price-change',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'IDR-per-share-implied',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  const lastTwo = lastActualMarketSessions(eligibleSessions, base.period.end, 2).filter((session) => session.status === 'captured' && session.date >= base.period.start);
  const fromSession = lastTwo[0];
  const toSession = lastTwo[1];
  if (!fromSession || !toSession) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'IDR-per-share-implied', available_at: context.cutoffAt },
      { en: 'Fewer than two captured sessions are visible in the window.', id: 'Kurang dari dua sesi terekam yang terlihat di jendela.', zh: '窗口内可见的已采集时段不足两个。' },
    );
  }
  const fromRef = impliedPriceReference(windowRows, brokers, 'buy', { type: 'all' }, { start: fromSession.date, end: fromSession.date }, scenario);
  const toRef = impliedPriceReference(windowRows, brokers, 'buy', { type: 'all' }, { start: toSession.date, end: toSession.date }, scenario);
  if (!fromRef.available || !toRef.available) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'IDR-per-share-implied', available_at: context.cutoffAt },
      { en: 'A daily net-flow implied price reference is unavailable for one of the two sessions.', id: 'Referensi harga tersirat arus bersih harian tidak tersedia untuk salah satu dari dua sesi.', zh: '两个时段中有一个的日度净流入隐含价格参考不可用。' },
    );
  }
  const from = { numerator: fromRef.numerator, denominator: fromRef.denominator, display: fromRef.display };
  const to = { numerator: toRef.numerator, denominator: toRef.denominator, display: toRef.display };
  const usedRows = windowRows.filter((row) => row.date === fromSession.date || row.date === toSession.date);
  const period = { start: fromSession.date, end: toSession.date };
  return {
    ...base,
    fact_id: factId(context.ticker, 'C11', period, 'baseline'),
    period,
    source_row_ids: usedRows.filter((row) => row.side === 'buy').map((row) => row.id),
    source_event_ids: [],
    source_sessions: [fromSession.date, toSession.date],
    unit: 'IDR-per-share-implied',
    value: { kind: 'ratio-delta', from, to, delta: to.display - from.display },
    approximate: trilingual((locale) => {
      const delta = to.display - from.display;
      const sign = delta >= 0 ? '+' : '';
      return locale === 'zh-CN' ? `约${sign}${grouped(delta, locale)}` : `about ${sign}${grouped(delta, locale)}`;
    }),
    coverage_note: {
      en: 'Change between daily net-flow implied price references of the last two visible sessions.',
      id: 'Perubahan antara referensi harga tersirat arus bersih harian dari dua sesi terlihat terakhir.',
      zh: '最近两个可见时段的日度净流入隐含价格参考之间的变化。',
    },
    available_at: sessionAvailableAt(toSession.date),
    evidence: {
      strength: 'Moderate',
      reason: {
        en: 'Computed from visible net-buy rows of the two sessions; the sample is incomplete by design.',
        id: 'Dihitung dari baris beli bersih yang terlihat dari dua sesi; sampel memang tidak lengkap.',
        zh: '由这两个时段的可见净买入数据行计算得出；样本在设计上就是不完整的。',
      },
    },
    available: true,
  };
}

function buildStreak(
  key: 'C12' | 'C13',
  context: FactsContext,
  versions: FactVersions,
  eligibleSessions: readonly SessionSummary[],
  rows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
  flavour: 'positive' | 'main-buyer',
): Fact {
  const periodSessions = eligibleSessions.filter((session) => session.date >= context.periodStart);
  const visibleEnd = (() => {
    const market = periodSessions.filter((session) => MARKET_STATUSES.has(session.status));
    return market[market.length - 1]?.date ?? context.sessionDate;
  })();
  const endingDate = context.sessionDate <= visibleEnd ? context.sessionDate : visibleEnd;
  const streakSessions = lastActualMarketSessions(periodSessions, endingDate, 5);
  const period: FactPeriod = {
    start: streakSessions[0]?.date ?? endingDate,
    end: streakSessions[streakSessions.length - 1]?.date ?? endingDate,
  };
  const base = {
    fact_id: factId(context.ticker, key, period, 'baseline'),
    key,
    type: 'streak' as const,
    period,
    source_row_ids: [] as string[],
    source_event_ids: [] as string[],
    source_sessions: streakSessions.map((session) => session.date),
    unit: 'sessions' as const,
    available_at: sessionAvailableAt(period.end),
    versions,
  };
  if (streakSessions.length < 5 || streakSessions.some((session) => session.status !== 'captured')) {
    return unavailable(
      base,
      {
        en: 'Five consecutive actual market sessions are not all captured at this cutoff.',
        id: 'Lima sesi pasar aktif berurutan tidak semuanya terekam pada titik potong ini.',
        zh: '在此截点下，五个连续的实际市场时段并未全部被捕获。',
      },
      'insufficient-captured-sessions',
    );
  }
  const result =
    flavour === 'positive'
      ? positiveStreak(rows, brokers, periodSessions, 'institution_facing', endingDate, 5, scenario)
      : mainBuyerStreak(rows, brokers, periodSessions, 'institution_facing', endingDate, 5, scenario);
  const streakRows = rows.filter((row) => streakSessions.some((session) => session.date === row.date));
  const comparison = buildComparison(result);
  return {
    ...base,
    source_row_ids: streakRows.map((row) => row.id),
    value: {
      kind: 'streak',
      group: 'institution_facing',
      status: result.status,
      dates: result.dates,
      ...(comparison ? { comparison } : {}),
    },
    approximate: trilingual((locale) =>
      locale === 'zh-CN'
        ? result.status === 'passes'
          ? '是'
          : result.status === 'fails'
            ? '否'
            : '数据不足'
        : result.status === 'passes'
          ? 'yes'
          : result.status === 'fails'
            ? 'no'
            : 'not enough data',
    ),
    // Describes the check, never its outcome: the same note renders whether the
    // streak passes, fails or runs out of sessions.
    coverage_note: {
      en:
        flavour === 'positive'
          ? 'Checks whether institutional net lots are positive in each of the last five actual market sessions.'
          : 'Checks whether institutional brokers are the strictly largest visible net-buying group in each of the last five actual market sessions.',
      id:
        flavour === 'positive'
          ? 'Memeriksa apakah lot bersih institusional positif di masing-masing dari lima sesi pasar aktif terakhir.'
          : 'Memeriksa apakah broker institusional adalah grup pembeli bersih terlihat yang terbesar secara ketat di masing-masing dari lima sesi pasar aktif terakhir.',
      zh:
        flavour === 'positive'
          ? '检查机构券商净手数在最近五个实际市场时段中的每一个是否为正。'
          : '检查机构券商在最近五个实际市场时段中的每一个是否都是严格最大的可见净买入组。',
    },
    evidence: {
      strength: 'Moderate',
      reason: {
        en: 'Computed from visible rows across five sessions; group labels rest on team mapping.',
        id: 'Dihitung dari baris yang terlihat lintas lima sesi; label grup bergantung pada pemetaan tim.',
        zh: '由五个时段的可见数据行计算得出；分组标签基于团队映射。',
      },
    },
    available: true,
  };
}

function buildComparison(result: { status: PredicateStatus; evidence: Array<{ date: string; groups?: GroupNet }> }): StreakComparison | undefined {
  if (result.status !== 'fails') return undefined;
  for (const entry of result.evidence) {
    const groups = entry.groups;
    if (!groups) continue;
    const candidate = groups.institution_facing;
    if (candidate <= 0) {
      return {
        date: entry.date,
        candidateGroup: 'institution_facing',
        candidateValue: candidate,
        otherGroup: 'other_mixed',
        otherValue: groups.other_mixed,
      };
    }
    const larger = GROUPS.filter((group) => group !== 'institution_facing').find((group) => groups[group] >= candidate);
    if (larger) {
      return {
        date: entry.date,
        candidateGroup: 'institution_facing',
        candidateValue: candidate,
        otherGroup: larger,
        otherValue: groups[larger],
      };
    }
  }
  return undefined;
}

function buildC14(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  windowRows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
  capturedSessions: readonly SessionSummary[],
): Fact {
  const base = windowBase('C14', 'daily-activity', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, 'C14', { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key: 'C14',
        type: 'daily-activity',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'lots',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  const days = dailyGroupNet(windowRows, brokers, base.period, scenario);
  return {
    ...base,
    source_row_ids: windowRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: capturedSessions.map((session) => session.date),
    unit: 'lots',
    value: { kind: 'daily-group-nets', days },
    approximate: trilingual((locale) =>
      locale === 'zh-CN' ? `${days.length} 个时段` : `${days.length} sessions`,
    ),
    coverage_note: {
      en: 'Per-session group nets for captured sessions only; missing or excluded dates are absent.',
      id: 'Lot bersih grup per sesi hanya untuk sesi terekam; tanggal yang hilang atau dikeluarkan tidak ada.',
      zh: '仅针对已采集时段的每组每时段净手数；缺失或被排除的日期不出现。',
    },
    available_at: sessionAvailableAt(base.period.end),
    evidence: {
      strength: 'Moderate',
      reason: {
        en: 'Computed from visible rows; group labels rest on team mapping.',
        id: 'Dihitung dari baris yang terlihat; label grup bergantung pada pemetaan tim.',
        zh: '由可见数据行计算得出；分组标签基于团队映射。',
      },
    },
    available: true,
  };
}

function buildC15(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  windowRows: readonly NormalizedBrokerRow[],
): Fact {
  const base = windowBase('C15', 'broker-observation', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, 'C15', { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key: 'C15',
        type: 'broker-observation',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'lots',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  const esRows = windowRows.filter((row) => row.brokerCode === 'ES');
  if (esRows.length === 0) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'lots', available_at: context.cutoffAt },
      { en: 'ES does not appear in the visible sample for this window.', id: 'ES tidak muncul dalam sampel yang terlihat untuk jendela ini.', zh: 'ES 未出现在该窗口的可见样本中。' },
    );
  }
  const dated = esRowsByDate(esRows);
  return {
    ...base,
    source_row_ids: esRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: [...new Set(esRows.map((row) => row.date))],
    unit: 'lots',
    value: { kind: 'daily-broker-nets', days: dated },
    approximate: trilingual((locale) =>
      locale === 'zh-CN' ? `${dated.length} 个时段` : `${dated.length} sessions`,
    ),
    coverage_note: {
      en: 'ES net lots per visible session; days outside the top-nine sample are unknown.',
      id: 'Lot bersih ES per sesi yang terlihat; hari di luar sampel sembilan teratas tidak diketahui.',
      zh: 'ES 每个可见时段的净手数；前九大样本之外的日期未知。',
    },
    available_at: sessionAvailableAt(base.period.end),
    evidence: {
      strength: 'Strong',
      reason: {
        en: 'Computed from ES rows visible in the window.',
        id: 'Dihitung dari baris ES yang terlihat di jendela.',
        zh: '由窗口内可见的 ES 数据行计算得出。',
      },
    },
    available: true,
  };
}

function esRowsByDate(esRows: readonly NormalizedBrokerRow[]): { date: string; netLots: number }[] {
  const byDate = new Map<string, number>();
  for (const row of esRows) {
    const signed = row.side === 'buy' ? row.netLots : -row.netLots;
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + signed);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, netLots]) => ({ date, netLots }));
}

function buildReversal(
  key: 'C16' | 'C17',
  brokerCode: string,
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  eligibleRows: readonly NormalizedBrokerRow[],
  marketSessions: readonly SessionSummary[],
): Fact {
  const base = windowBase(key, 'reversal', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, key, { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key,
        type: 'reversal',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'lots',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  const rows = rowsInWindow(eligibleRows, base.period).filter((row) => row.brokerCode === brokerCode);
  const windowSessions = marketSessions.filter(
    (session) => session.date >= base.period.start && session.date <= base.period.end,
  );
  const reversal = latestObservedReversal(rows, windowSessions, brokerCode);
  if (!reversal) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'lots', available_at: context.cutoffAt },
      {
        en: `No opposite-sign pair of consecutive market sessions is visible for ${brokerCode} in this window.`,
        id: `Tidak ada pasangan sesi pasar berurutan bertanda berlawanan yang terlihat untuk ${brokerCode} di jendela ini.`,
        zh: `在此窗口内，未看到 ${brokerCode} 存在方向相反的连续市场时段组合。`,
      },
    );
  }
  const usedRows = rows.filter((row) => row.date === reversal.fromDate || row.date === reversal.toDate);
  return {
    ...base,
    fact_id: factId(context.ticker, key, { start: reversal.fromDate, end: reversal.toDate }, 'baseline'),
    period: { start: reversal.fromDate, end: reversal.toDate },
    source_row_ids: usedRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: [reversal.fromDate, reversal.toDate],
    unit: 'lots',
    value: { kind: 'reversal', reversal },
    approximate: trilingual(
      (locale) => `${brokerCode} ${lotsRangeCompact(reversal.fromNetLots, reversal.toNetLots, locale)}`,
    ),
    coverage_note: {
      en: `${brokerCode} observed net lots on the most recent pair of consecutive market sessions with opposite visible signs; a missing or excluded session breaks adjacency.`,
      id: `Lot bersih teramati ${brokerCode} pada pasangan sesi pasar berurutan terbaru dengan tanda berlawanan yang terlihat; sesi yang hilang atau dikeluarkan memutus keberurutan.`,
      zh: `${brokerCode} 在最近一对可见符号相反的连续市场时段上的净手数；缺失或被排除的时段会打断相邻关系。`,
    },
    available_at: sessionAvailableAt(reversal.toDate),
    evidence: {
      strength: 'Strong',
      reason: {
        en: `Computed from ${brokerCode} rows visible on both sessions.`,
        id: `Dihitung dari baris ${brokerCode} yang terlihat pada kedua sesi.`,
        zh: `由两个时段上可见的 ${brokerCode} 数据行计算得出。`,
      },
    },
    available: true,
  };
}

function buildC18(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  windowRows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
): Fact {
  const base = windowBase('C18', 'sensitivity', context, versions, window);
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, 'C18', { start: context.periodStart, end: context.periodStart }, 'baseline'),
        key: 'C18',
        type: 'sensitivity',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'lots',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible in the window at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内没有可见的已采集时段。' },
    );
  }
  if (windowRows.length === 0) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'lots', available_at: context.cutoffAt },
      { en: 'No visible rows exist in the window at this cutoff.', id: 'Tidak ada baris yang terlihat di jendela pada titik potong ini.', zh: '当前截点下，窗口内不存在可见的数据行。' },
    );
  }
  const brokerGroups = makeBrokerGroupIndex(brokers);
  const nets = brokerNet(windowRows, base.period);
  const institutionNets = nets
    .filter((entry) => resolveBrokerGroup(entry.brokerCode, brokerGroups, scenario) === 'institution_facing')
    .sort((a, b) => b.netLots - a.netLots || a.brokerCode.localeCompare(b.brokerCode));
  const target = institutionNets[0];
  if (!target) {
    return unavailable(
      { ...base, source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'lots', available_at: context.cutoffAt },
      { en: 'No institutional broker appears in the visible window.', id: 'Tidak ada broker institusional yang muncul di jendela yang terlihat.', zh: '可见窗口中没有出现机构券商。' },
    );
  }
  const override = withOneBrokerUnknownOverride(scenario, target.brokerCode);
  const baseline = cumulativeGroupNet(windowRows, brokers, base.period, scenario);
  const overridden = cumulativeGroupNet(windowRows, brokers, base.period, override);
  return {
    ...base,
    source_row_ids: windowRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: [...new Set(windowRows.map((row) => row.date))],
    unit: 'lots',
    value: { kind: 'sensitivity', brokerCode: target.brokerCode, baseline, overridden },
    approximate: trilingual((locale) => {
      const label = locale === 'zh-CN' ? '机构' : locale === 'id' ? 'institution' : 'institution';
      return `${target.brokerCode}: ${label} ${lotsRangeCompact(baseline.institution_facing, overridden.institution_facing, locale)}`;
    }),
    coverage_note: {
      en: `What-if: reclassifying ${target.brokerCode} (largest visible institutional net) as unknown shifts group nets; labels are team mapping.`,
      id: `Skenario: mengklasifikasi ulang ${target.brokerCode} (bersih institusional terbesar yang terlihat) sebagai tak diketahui menggeser lot grup; label adalah pemetaan tim.`,
      zh: `假设情形：将 ${target.brokerCode}（可见的最大机构净额）重新归类为未知会改变各组净额；标签仅为团队映射。`,
    },
    available_at: sessionAvailableAt(base.period.end),
    evidence: {
      strength: 'Moderate',
      reason: {
        en: 'Computed from visible rows under a one-broker reclassification scenario.',
        id: 'Dihitung dari baris yang terlihat dalam skenario reklasifikasi satu broker.',
        zh: '在单一券商重新归类情形下由可见数据行计算得出。',
      },
    },
    available: true,
  };
}

function buildEventFact(
  key: 'C19' | 'C20' | 'C21' | 'C22' | 'C23',
  context: FactsContext,
  versions: FactVersions,
  events: readonly SiniEvent[],
): Fact {
  const eventIds = EVENT_REFS[key];
  const published = events.filter((event) => eventIds.includes(event.id) && isEventAvailableAtCutoff(event, context.cutoffAt));
  const period: FactPeriod = published.length
    ? {
        start: published.map((event) => event.publicationDate).sort()[0] ?? context.periodStart,
        end: published.map((event) => event.publicationDate).sort()[published.length - 1] ?? context.periodStart,
      }
    : { start: context.periodStart, end: context.periodStart };
  const base = {
    fact_id: factId(context.ticker, key, period, 'baseline'),
    key,
    type: 'event' as const,
    period,
    source_row_ids: [] as string[],
    source_event_ids: published.map((event) => event.id),
    source_sessions: [] as string[],
    unit: 'none' as const,
    available_at: published.length
      ? published.map((event) => event.availableAt).sort()[published.length - 1] ?? context.cutoffAt
      : context.cutoffAt,
    versions,
  };
  if (published.length === 0) {
    return unavailable(base, {
      en: 'The reviewed event is not published at this cutoff.',
      id: 'Peristiwa yang ditinjau belum terbit pada titik potong ini.',
      zh: '已审阅的事件在此截点尚未发布。',
    });
  }
  const titles: Record<typeof key, BilingualText> = {
    C19: { en: 'rights issue completed', id: 'rights issue selesai', zh: '配股完成' },
    C20: { en: 'acquisition of PT Kemilau Mulia Sakti', id: 'akuisisi PT Kemilau Mulia Sakti', zh: '收购 PT Kemilau Mulia Sakti' },
    C21: { en: 'equity turned positive', id: 'ekuitas menjadi positif', zh: '净资产转正' },
    C22: { en: 'exit from the special monitoring board', id: 'keluar dari papan pemantauan khusus', zh: '退出特别监控委员会' },
    C23: { en: 'one-off bargain-purchase gain', id: 'keuntungan bargain purchase sekali waktu', zh: '一次性议价收购收益' },
  };
  return {
    ...base,
    value: { kind: 'event', eventIds: published.map((event) => event.id) },
    approximate: trilingual((locale) =>
      locale === 'zh-CN'
        ? published.length === 1
          ? '1 个事件'
          : `${published.length} 个事件`
        : published.length === 1
          ? '1 event'
          : `${published.length} events`,
    ),
    coverage_note: {
      en: `Reviewed event: ${titles[key].en}. Availability follows the verified publication date.`,
      id: `Peristiwa yang ditinjau: ${titles[key].id}. Ketersediaan mengikuti tanggal publikasi yang terverifikasi.`,
      zh: `已审阅事件：${titles[key].zh}。可用性遵循已核实的发布日期。`,
    },
    evidence: {
      strength: 'Strong',
      reason: {
        en: 'Reviewed bilingual event text with a verified publication date.',
        id: 'Teks peristiwa dwibahasa yang ditinjau dengan tanggal publikasi terverifikasi.',
        zh: '已审阅的带核实发布日期的双语事件文本。',
      },
    },
    available: true,
  };
}

function buildC24(
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  brokers: readonly BrokerProfile[],
): Fact {
  const base = windowBase('C24', 'label-evidence', context, versions, window);
  const fallbackPeriod: FactPeriod = window ?? { start: context.periodStart, end: context.periodEnd };
  const envelope = base ?? {
    fact_id: factId(context.ticker, 'C24', fallbackPeriod, 'baseline'),
    key: 'C24' as const,
    type: 'label-evidence' as const,
    period: fallbackPeriod,
    versions,
  };
  const labels: GroupLabelEvidence[] = GROUPS.map((group) => ({
    group,
    brokers: brokers
      .filter((broker) => broker.group === group)
      .map((broker) => ({
        code: broker.code,
        identityStrength: broker.identityEvidence.strength,
        profileStrength: broker.profileEvidence.strength,
        sourceReference: broker.profileEvidence.sourceReference,
      })),
  }));
  const weakest = labels
    .flatMap((label) => label.brokers.map((broker) => broker.profileStrength))
    .reduce<EvidenceStrength | null>((weakestSoFar, strength) => {
      const order: EvidenceStrength[] = ['Strong', 'Moderate', 'Weak', 'Not enough data'];
      if (weakestSoFar === null) return strength;
      return order.indexOf(strength) > order.indexOf(weakestSoFar) ? strength : weakestSoFar;
    }, null);
  return {
    ...envelope,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: [],
    unit: 'none',
    value: { kind: 'label-evidence', labels },
    approximate: trilingual((locale) => (locale === 'zh-CN' ? '团队映射' : 'team mapping')),
    coverage_note: {
      en: 'Group labels come from the team broker mapping; profiles do not establish customer identity.',
      id: 'Label grup berasal dari pemetaan broker tim; profil tidak menetapkan identitas nasabah.',
      zh: '分组标签来自团队的券商映射；画像不代表客户身份。',
    },
    available_at: window ? sessionAvailableAt(window.end) : context.cutoffAt,
    evidence: {
      strength: weakest ?? 'Not enough data',
      reason: {
        en: 'Label evidence is the weakest reviewed profile strength in the mapping; none of it establishes customer identity.',
        id: 'Bukti label adalah kekuatan profil tersamar yang ditinjau dalam pemetaan; tidak satupun menetapkan identitas nasabah.',
        zh: '标签证据是映射中已审阅的最弱画像强度；任何内容都不代表客户身份。',
      },
    },
    available: true,
  };
}

function buildC25(
  context: FactsContext,
  versions: FactVersions,
  eligibleSessions: readonly SessionSummary[],
  rows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
  visibleEnd: string | null,
): Fact {
  const selected = context.sessionDate;
  const validSelected =
    visibleEnd !== null &&
    selected >= context.periodStart &&
    selected <= context.periodEnd &&
    selected <= visibleEnd &&
    eligibleSessions.some((session) => session.date === selected && session.status === 'captured');
  const previous = validSelected
    ? [...eligibleSessions]
        .filter(
          (session) =>
            session.status === 'captured' &&
            session.date >= context.periodStart &&
            session.date < selected,
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0]
    : undefined;
  const period: FactPeriod = {
    start: previous?.date ?? selected,
    end: selected,
  };
  const base = {
    fact_id: factId(context.ticker, 'C25', period, 'baseline'),
    key: 'C25' as const,
    type: 'session-change' as const,
    period,
    source_row_ids: [] as string[],
    source_event_ids: [] as string[],
    source_sessions: [previous?.date, selected].filter((date): date is string => Boolean(date)),
    unit: 'lots' as const,
    available_at: sessionAvailableAt(selected),
    versions,
  };
  if (!validSelected || !previous) {
    return unavailable(base, {
      en: 'The selected session and its previous captured session are not both visible at this cutoff.',
      id: 'Sesi yang dipilih dan sesi terekam sebelumnya tidak keduanya terlihat pada titik potong ini.',
      zh: '所选时段与其前一个已采集时段在此截点下并非都可见。',
    });
  }
  const days = dailyGroupNet(rows, brokers, { start: previous.date, end: selected }, scenario).filter(
    (day) => day.date === previous.date || day.date === selected,
  );
  const usedRows = rows.filter((row) => row.date === previous.date || row.date === selected);
  return {
    ...base,
    source_row_ids: usedRows.map((row) => row.id),
    value: { kind: 'daily-group-nets', days },
    approximate: trilingual((locale) => (locale === 'zh-CN' ? '2 个时段' : '2 sessions')),
    coverage_note: {
      en: `Group nets for ${previous.date} and the selected session ${selected}.`,
      id: `Lot grup untuk ${previous.date} dan sesi yang dipilih ${selected}.`,
      zh: `${previous.date} 与所选时段 ${selected} 的各组净手数。`,
    },
    evidence: {
      strength: 'Moderate',
      reason: {
        en: 'Computed from visible rows of the two sessions; group labels rest on team mapping.',
        id: 'Dihitung dari baris yang terlihat dari dua sesi; label grup bergantung pada pemetaan tim.',
        zh: '由这两个时段的可见数据行计算得出；分组标签基于团队映射。',
      },
    },
    available: true,
  };
}

function buildReference(
  key: 'REF-INST-2SEP' | 'REF-INST-CUTOFF' | 'REF-XL-SELL',
  fixedEnd: string | null,
  context: FactsContext,
  versions: FactVersions,
  window: FactPeriod | null,
  windowRows: readonly NormalizedBrokerRow[],
  brokers: readonly BrokerProfile[],
  scenario: FlowScenario | undefined,
  brokerCode?: string,
  side?: 'buy' | 'sell',
): Fact {
  const requestedEnd = fixedEnd ?? context.periodEnd;
  const effectiveWindow: FactPeriod | null = window
    ? { start: window.start, end: window.end < requestedEnd ? window.end : requestedEnd }
    : null;
  const base = windowBase(key, 'price-reference', context, versions, effectiveWindow);
  const target = brokerCode ? { type: 'broker' as const, brokerCode } : { type: 'group' as const, group: 'institution_facing' as const };
  if (!base) {
    return unavailable(
      {
        fact_id: factId(context.ticker, key, { start: context.periodStart, end: context.periodStart }, 'reference'),
        key,
        type: 'price-reference',
        period: { start: context.periodStart, end: context.periodStart },
        source_row_ids: [],
        source_event_ids: [],
        source_sessions: [],
        unit: 'IDR-per-share-implied',
        available_at: context.cutoffAt,
        versions,
      },
      { en: 'No captured sessions are visible for this reference at this cutoff.', id: 'Tidak ada sesi terekam yang terlihat untuk referensi ini pada titik potong ini.', zh: '此截点下没有可见的已采集时段来支持该参考。' },
    );
  }
  if (fixedEnd && Date.parse(context.cutoffAt) < Date.parse(sessionAvailableAt(fixedEnd))) {
    return unavailable(
      { ...base, fact_id: factId(context.ticker, key, base.period, 'reference'), source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'IDR-per-share-implied', available_at: context.cutoffAt },
      {
        en: `This reference covers sessions through ${fixedEnd}, whose broker data only becomes available at ${sessionAvailableAt(fixedEnd)}.`,
        id: `Referensi ini mencakup sesi hingga ${fixedEnd}, yang data brokernya baru tersedia pada ${sessionAvailableAt(fixedEnd)}.`,
        zh: `该参考涵盖截至 ${fixedEnd} 的时段，其券商数据要到 ${sessionAvailableAt(fixedEnd)} 才可用。`,
      },
    );
  }
  const requestedSide = side ?? 'buy';
  const reference = impliedPriceReference(windowRows, brokers, requestedSide, target, base.period, scenario);
  const brokerGroups = makeBrokerGroupIndex(brokers);
  const matchedRows = windowRows.filter(
    (row) =>
      row.side === requestedSide &&
      (brokerCode ? row.brokerCode === brokerCode : resolveBrokerGroup(row.brokerCode, brokerGroups, scenario) === 'institution_facing'),
  );
  if (!reference.available) {
    return unavailable(
      { ...base, fact_id: factId(context.ticker, key, base.period, 'reference'), source_row_ids: [], source_event_ids: [], source_sessions: [], unit: 'IDR-per-share-implied', available_at: context.cutoffAt },
      {
        en: `No usable ${side ?? 'buy'} rows for this reference (${reference.reason}).`,
        id: `Tidak ada baris ${side ?? 'buy'} yang dapat dipakai untuk referensi ini (${reference.reason}).`,
        zh: `该参考没有可用的净${side === 'sell' ? '卖出' : '买入'}数据行（${reference.reason}）。`,
      },
    );
  }
  return {
    ...base,
    fact_id: factId(context.ticker, key, base.period, 'reference'),
    source_row_ids: matchedRows.map((row) => row.id),
    source_event_ids: [],
    source_sessions: [...new Set(matchedRows.map((row) => row.date))],
    unit: 'IDR-per-share-implied',
    value: { kind: 'ratio', numerator: reference.numerator, denominator: reference.denominator, display: reference.display },
    approximate: trilingual((locale) =>
      locale === 'zh-CN' ? `约${grouped(reference.display, locale)}` : `about ${grouped(reference.display, locale)}`,
    ),
    coverage_note: {
      en: brokerCode
        ? `Net-flow implied price reference from ${brokerCode} visible net-${side ?? 'buy'} rows; not an official close, VWAP, cost basis or executable quote.`
        : 'Net-flow implied price reference from visible institutional net-buy rows; not an official close, VWAP, cost basis or executable quote.',
      id: brokerCode
        ? `Referensi harga tersirat arus bersih dari baris ${side ?? 'buy'} bersih ${brokerCode} yang terlihat; bukan penutup resmi, VWAP, biaya perolehan, atau kutipan yang dapat dieksekusi.`
        : 'Referensi harga tersirat arus bersih dari baris beli bersih institusional yang terlihat; bukan penutup resmi, VWAP, biaya perolehan, atau kutipan yang dapat dieksekusi.',
      zh: brokerCode
        ? `由 ${brokerCode} 可见净${side === 'sell' ? '卖出' : '买入'}数据行得出的净流入隐含价格参考；并非官方收盘价、VWAP、成本基准或可执行报价。`
        : '由可见的机构净买入数据行得出的净流入隐含价格参考；并非官方收盘价、VWAP、成本基准或可执行报价。',
    },
    available_at: sessionAvailableAt(base.period.end),
    evidence: {
      strength: 'Moderate',
      reason: {
        en: 'Computed from visible rows; group labels rest on team mapping and the sample is incomplete.',
        id: 'Dihitung dari baris yang terlihat; label grup bergantung pada pemetaan tim dan sampel tidak lengkap.',
        zh: '由可见数据行计算得出；分组标签基于团队映射，样本并不完整。',
      },
    },
    available: true,
  };
}
