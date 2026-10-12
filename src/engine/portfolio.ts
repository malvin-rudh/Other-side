// Current-holdings portfolio valuation over daily price closes.
//
// The model is deliberately narrow and says so on screen: today's owned
// quantities are held fixed across the window, so V(t) = sum(q_i x close_i(t))
// with no trades, cash, dividends, fees or rights subscriptions. Real provider
// bars and fictional sample fixtures are never summed together: a portfolio
// whose holdings draw on both sources is refused with an explanation instead.
//
// Watchlist entries never enter valuation. Missing closes stay unknown, never
// zero: a date without every close is not a common close.
//
// One rule decides which bars may be consumed: a daily bar counts only once its
// regular session has ended in the series' own exchange timezone, at or before
// the cutoff instant. Evaluated at the current time that excludes an unfinished
// day and any future date. Evaluated at a Brief's own morning it also excludes
// every later session, so a historical view can never reach a price that had not
// happened yet.

import type { PricesDocument } from '../data/schemas';
import type { ProviderPriceHistory } from '../data/providerClient';

export type PriceBasis = 'provider-daily-unadjusted' | 'sample-fixture-daily';

export interface PriceBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

// One symbol's daily closes plus provenance. `dataVersion` is the identity the
// context key uses, so a stale valuation can never attach to new prices.
export interface PriceSeries {
  symbol: string;
  currency: string | null;
  exchangeTimezone: string | null;
  exchangeName: string | null;
  source: string;
  // When this answer was fetched. Provenance only: it never decides whether a
  // price session is available, which the completion rule below does.
  fetchedAt: string;
  // The instant these bars were observed, or null when the series carries no
  // live observation at all. A fixture is historical by construction, so its
  // bars are complete on their own dates; a provider answer is an observation,
  // and one taken before a session closed captured values that were still
  // moving. Nothing but a fresh observation can make such a bar final.
  observedAtMs: number | null;
  priceBasis: PriceBasis;
  // The stable part of the version, before the consumed-bars identity. Kept so
  // restricting a series to a window can rebuild the version without guessing.
  versionRoot: string;
  dataVersion: string;
  bars: PriceBar[];
}

// FNV-1a, rendered as fixed-width hex. A small deterministic digest is enough
// here: the input is already validated and the only requirement is that any
// change to any consumed value changes the result.
function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const none = (value: string | null): string => value ?? 'none';

function barText(bar: PriceBar): string {
  return [bar.date, bar.open, bar.high, bar.low, bar.close, bar.volume]
    .map((part) => (part === null ? 'null' : String(part)))
    .join(':');
}

// Identity of the validated prices themselves, covering source, basis and every
// bar. Ending date plus bar count cannot distinguish a corrected close from the
// original; this digest can, so a correction changes the portfolio context even
// when the dates and the bar count are unchanged.
export function priceIdentity(input: {
  symbol: string;
  source: string;
  priceBasis: PriceBasis;
  currency: string | null;
  exchangeTimezone: string | null;
  bars: readonly PriceBar[];
}): string {
  const head = [input.symbol, input.source, input.priceBasis, none(input.currency), none(input.exchangeTimezone)].join(
    '|',
  );
  return fnv1aHex(`${head}|${input.bars.map(barText).join(',')}`);
}

// Builds a series whose dataVersion names exactly the bars it carries: the
// version root, the ending date, the bar count and the digest of the values.
function composeSeries(input: Omit<PriceSeries, 'dataVersion'>): PriceSeries {
  const end = input.bars[input.bars.length - 1]?.date ?? 'none';
  const identity = priceIdentity({
    symbol: input.symbol,
    source: input.source,
    priceBasis: input.priceBasis,
    currency: input.currency,
    exchangeTimezone: input.exchangeTimezone,
    bars: input.bars,
  });
  return { ...input, dataVersion: `${input.versionRoot}:${end}:${input.bars.length}:${identity}` };
}

// An observation instant that cannot be read stays null rather than becoming
// "now", because a guessed observation time would let a stale answer look final.
function observationMs(fetchedAt: string): number | null {
  const parsed = Date.parse(fetchedAt);
  return Number.isFinite(parsed) ? parsed : null;
}

export function providerSeries(history: ProviderPriceHistory): PriceSeries {
  return composeSeries({
    symbol: history.symbol,
    currency: history.currency,
    exchangeTimezone: history.exchangeTimezone,
    exchangeName: history.exchangeName,
    source: history.source,
    fetchedAt: history.fetchedAt,
    observedAtMs: observationMs(history.fetchedAt),
    priceBasis: 'provider-daily-unadjusted',
    versionRoot: 'provider-history-v2',
    bars: history.bars,
  });
}

export function sampleSeries(document: PricesDocument): PriceSeries {
  return composeSeries({
    symbol: document.symbol,
    currency: document.currency,
    exchangeTimezone: document.exchangeTimezone,
    exchangeName: document.exchangeName,
    source: document.source,
    fetchedAt: `${document.version}`,
    // A fixture has no observation instant: its bars are reviewed historical
    // data, so the cutoff rule alone decides which of them a view may consume.
    observedAtMs: null,
    priceBasis: 'sample-fixture-daily',
    versionRoot: document.version,
    bars: document.bars,
  });
}

// The wall-clock end of a regular daily session. IDX closes at 16:00 WIB; the
// instant is resolved in each series' own exchange timezone rather than assumed
// to be WIB, so a provider reporting another zone still yields the right moment.
export const REGULAR_SESSION_END_WALL = '16:00:00';

export function isSupportedTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

// The UTC instant a wall-clock time falls on in a given IANA zone, or null when
// either input is unusable. Converges on the zone offset in two passes, which
// is exact for the fixed-offset zones exchange data reports.
export function wallTimeToUtcMs(date: string, wallTime: string, timeZone: string): number | null {
  if (!isSupportedTimeZone(timeZone)) return null;
  const asUtc = Date.parse(`${date}T${wallTime}Z`);
  if (!Number.isFinite(asUtc)) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  let offsetMs = 0;
  for (let pass = 0; pass < 2; pass += 1) {
    const probe = new Date(asUtc - offsetMs);
    if (Number.isNaN(probe.getTime())) return null;
    const parts: Record<string, string> = {};
    for (const part of formatter.formatToParts(probe)) parts[part.type] = part.value;
    const wall = Date.parse(
      `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
    );
    if (!Number.isFinite(wall)) return null;
    offsetMs = wall - probe.getTime();
  }
  return asUtc - offsetMs;
}

// The instant a session's regular trading ends, or null when it cannot be
// established. A null means the caller must refuse rather than guess.
export function sessionEndUtcMs(date: string, timeZone: string | null): number | null {
  if (timeZone === null) return null;
  return wallTimeToUtcMs(date, REGULAR_SESSION_END_WALL, timeZone);
}

export type EligibleBarsResult = { ok: true; bars: PriceBar[] } | { ok: false; reason: 'unknown-session-completion' };

// The completion gate. A bar counts only once its regular session has ended at
// or before the cutoff instant, so an unfinished current day and any future date
// are excluded. Bars whose session end cannot be established fail closed,
// because an unknown completion state is not an available price.
//
// Session time alone cannot establish that an observation is final. An answer
// fetched at 15:58 carries today's bar with values that were still moving, and
// reading that same answer at 16:02 would find its session end in the past and
// promote a pre-close price into a closing price. The second condition ties
// eligibility to when the bars were observed, not to when they are read, so a
// cached or replayed answer stays ineligible until a fresh observation taken
// after the close replaces it.
export function eligibleBars(series: PriceSeries, cutoffMs: number): EligibleBarsResult {
  const bars: PriceBar[] = [];
  for (const bar of series.bars) {
    const end = sessionEndUtcMs(bar.date, series.exchangeTimezone);
    if (end === null) return { ok: false, reason: 'unknown-session-completion' };
    if (end > cutoffMs) continue;
    if (series.observedAtMs !== null && end > series.observedAtMs) continue;
    bars.push(bar);
  }
  return { ok: true, bars };
}

export type RestrictSeriesResult =
  | { ok: true; series: PriceSeries }
  | { ok: false; reason: 'unknown-session-completion' };

// Restrict a series to the sessions that passed the gate and rebuild its
// identity over exactly what survives. Callers store the result, so a chart, a
// tooltip, a fact and the evidence drawer can only ever see consumed dates, and
// a corrected price always changes the version.
export function restrictSeriesToWindow(series: PriceSeries, cutoffMs: number): RestrictSeriesResult {
  const eligible = eligibleBars(series, cutoffMs);
  if (!eligible.ok) return { ok: false, reason: eligible.reason };
  const { bars, ...rest } = series;
  return { ok: true, series: composeSeries({ ...rest, bars: eligible.bars }) };
}

export interface PortfolioHoldingInput {
  symbol: string;
  quantityShares: number | null;
}

export interface PortfolioAnalyticsInput {
  // Owned entries only; the caller filters watchlist out before calling.
  holdings: readonly PortfolioHoldingInput[];
  seriesBySymbol: ReadonlyMap<string, PriceSeries>;
  benchmark: { symbol: string; series: PriceSeries } | null;
  sessions: number;
  // The instant the completion rule is evaluated at. Null means the current
  // time, so the model uses the latest completed session. A Brief passes its own
  // morning's midnight, which makes every later session ineligible: a historical
  // view can never consume a price that had not happened yet.
  cutoffMs: number | null;
}

export interface PortfolioHoldingResult {
  symbol: string;
  quantityShares: number;
  startClose: number;
  endClose: number;
  startValue: number;
  endValue: number;
  weightFraction: number;
  startWeightFraction: number;
  contributionFraction: number;
  priceChangeIdr: number;
}

// One owned holding's weight on one consumed date. The allocation lines plot
// these; the breakdown fact carries the same numbers as evidence.
export interface PortfolioWeightEntry {
  symbol: string;
  quantityShares: number;
  close: number;
  value: number;
  weightFraction: number;
}

export interface PortfolioWeightPoint {
  date: string;
  total: number;
  entries: PortfolioWeightEntry[];
}

export interface PortfolioAnalytics {
  currency: string;
  basis: 'real' | 'sample';
  sessions: number;
  startDate: string;
  endDate: string;
  commonCloses: number;
  startValue: number;
  endValue: number;
  returnFraction: number;
  benchmark: { symbol: string; startClose: number; endClose: number; returnFraction: number } | null;
  holdings: PortfolioHoldingResult[];
  dataVersion: string;
  // The selected window only: N+1 consumed closes. Full histories stay in the
  // price series as source inputs, but charts and calculation evidence show
  // exactly the dates the arithmetic used.
  valueSeries: { date: string; value: number }[];
  weightSeries: PortfolioWeightPoint[];
  // The cutoff the completion rule was evaluated at, and the newest session that
  // passed it. That is price-session availability, which is a different thing
  // from any series' provider fetch time; fetchedAt stays provenance only.
  cutoffAt: string | null;
  completedThrough: string;
}

export type PortfolioUnavailableCode =
  | 'no-owned'
  | 'missing-quantity'
  | 'invalid-quantity'
  | 'invalid-sessions'
  | 'missing-prices'
  | 'currency-mismatch'
  | 'mixed-sources'
  | 'unknown-session-completion'
  | 'insufficient-common-closes'
  | 'unsafe-arithmetic'
  | 'zero-denominator';

export interface PortfolioUnavailable {
  code: PortfolioUnavailableCode;
  // Symbols or counts the honest explanation names; never silently dropped.
  symbols: string[];
  detail: string;
  // Present on insufficient-common-closes so the localized explanation can
  // state how many closes were actually found.
  found?: number;
}

export type PortfolioAnalyticsResult =
  | { kind: 'ok'; analytics: PortfolioAnalytics }
  | { kind: 'unavailable'; reason: PortfolioUnavailable };

const SUPPORTED_CURRENCY = 'IDR';

// Share counts are whole shares. Zero, fractional and beyond-safe-integer
// quantities are refused by name instead of being repaired or dropped.
function isShareQuantity(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}

// Valuation products and sums stay inside the exact-integer range, so a huge
// quantity cannot produce a silently rounded model value.
function isSafeAmount(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

export function buildPortfolioAnalytics(input: PortfolioAnalyticsInput): PortfolioAnalyticsResult {
  if (input.holdings.length === 0) {
    return { kind: 'unavailable', reason: { code: 'no-owned', symbols: [], detail: 'no owned holdings' } };
  }

  if (!Number.isSafeInteger(input.sessions) || input.sessions < 1) {
    return {
      kind: 'unavailable',
      reason: { code: 'invalid-sessions', symbols: [], detail: `session count is not a positive integer: ${input.sessions}` },
    };
  }

  const missingQuantity = input.holdings.filter((holding) => holding.quantityShares === null).map((h) => h.symbol);
  if (missingQuantity.length > 0) {
    return {
      kind: 'unavailable',
      reason: { code: 'missing-quantity', symbols: missingQuantity, detail: 'share quantity unknown' },
    };
  }

  const invalidQuantity = input.holdings
    .filter((holding) => !isShareQuantity(holding.quantityShares))
    .map((holding) => `${holding.symbol}:${String(holding.quantityShares)}`);
  if (invalidQuantity.length > 0) {
    return {
      kind: 'unavailable',
      reason: {
        code: 'invalid-quantity',
        symbols: invalidQuantity,
        detail: 'share quantity must be a positive whole number',
      },
    };
  }

  const missingPrices = input.holdings.filter((holding) => !input.seriesBySymbol.has(holding.symbol)).map((h) => h.symbol);
  if (missingPrices.length > 0) {
    return {
      kind: 'unavailable',
      reason: { code: 'missing-prices', symbols: missingPrices, detail: 'price history not loaded' },
    };
  }

  const seriesList = input.holdings.map((holding) => input.seriesBySymbol.get(holding.symbol) as PriceSeries);

  const badCurrency = seriesList
    .filter((series) => series.currency !== SUPPORTED_CURRENCY)
    .map((series) => `${series.symbol}:${series.currency ?? 'unknown'}`);
  if (badCurrency.length > 0) {
    return {
      kind: 'unavailable',
      reason: {
        code: 'currency-mismatch',
        symbols: badCurrency,
        detail: 'only complete IDR portfolios are summed; no FX source exists',
      },
    };
  }

  const bases = new Set(seriesList.map((series) => series.priceBasis));
  const basis: 'real' | 'sample' = bases.has('provider-daily-unadjusted') ? 'real' : 'sample';
  if (bases.size > 1 || (input.benchmark !== null && input.benchmark.series.priceBasis !== seriesList[0]!.priceBasis)) {
    const mixed = seriesList.map((series) => `${series.symbol}:${series.priceBasis}`);
    if (input.benchmark !== null) mixed.push(`${input.benchmark.symbol}:${input.benchmark.series.priceBasis}`);
    return {
      kind: 'unavailable',
      reason: {
        code: 'mixed-sources',
        symbols: mixed,
        detail: 'real provider prices and fictional sample prices are never summed together',
      },
    };
  }

  const cutoffMs = input.cutoffMs ?? Date.now();

  // The completion gate runs per series. A series whose exchange timezone cannot
  // resolve a session end is refused: an unknown completion state is not an
  // available price, and guessing would let an unfinished session into the model.
  const allSeries = input.benchmark !== null ? [...seriesList, input.benchmark.series] : seriesList;
  const eligibleBySeries: PriceBar[][] = [];
  for (const series of allSeries) {
    const result = eligibleBars(series, cutoffMs);
    if (!result.ok) {
      return {
        kind: 'unavailable',
        reason: {
          code: 'unknown-session-completion',
          symbols: [series.symbol],
          detail: 'exchange timezone cannot establish when the session closed',
        },
      };
    }
    eligibleBySeries.push(result.bars);
  }
  const eligibleList = eligibleBySeries.slice(0, seriesList.length);
  const benchmarkBars = input.benchmark !== null ? eligibleBySeries[seriesList.length]! : null;

  // Common closes: dates where every owned holding has a close. The benchmark,
  // when present and of the same basis, shares the baseline by intersection.
  const closesBySymbol = eligibleList.map((bars) => {
    const closes = new Map<string, number>();
    for (const bar of bars) {
      if (bar.close !== null) closes.set(bar.date, bar.close);
    }
    return closes;
  });
  if (closesBySymbol.length === 0 || closesBySymbol[0]!.size === 0) {
    return {
      kind: 'unavailable',
      reason: { code: 'insufficient-common-closes', symbols: [], detail: 'no eligible closing prices', found: 0 },
    };
  }
  let commonDates = [...closesBySymbol[0]!.keys()].filter((date) =>
    closesBySymbol.every((closes) => closes.has(date)),
  );
  const benchmarkCloses = new Map<string, number>();
  if (benchmarkBars !== null) {
    for (const bar of benchmarkBars) {
      if (bar.close !== null) benchmarkCloses.set(bar.date, bar.close);
    }
    commonDates = commonDates.filter((date) => benchmarkCloses.has(date));
  }
  commonDates.sort((a, b) => a.localeCompare(b));

  if (commonDates.length < input.sessions + 1) {
    return {
      kind: 'unavailable',
      reason: {
        code: 'insufficient-common-closes',
        symbols: [],
        detail: `${input.sessions}-session change needs ${input.sessions + 1} completed common closes, found ${commonDates.length}`,
        found: commonDates.length,
      },
    };
  }

  // One window feeds everything: the metrics, the value line, the allocation
  // lines, the facts and their evidence all read these N+1 consumed dates.
  const window = commonDates.slice(commonDates.length - (input.sessions + 1));
  const startDate = window[0]!;
  const endDate = window[window.length - 1]!;

  const holdings: PortfolioHoldingResult[] = input.holdings.map((holding, index) => {
    const quantity = holding.quantityShares as number;
    const closes = closesBySymbol[index]!;
    const startClose = closes.get(startDate)!;
    const endClose = closes.get(endDate)!;
    return {
      symbol: holding.symbol,
      quantityShares: quantity,
      startClose,
      endClose,
      startValue: quantity * startClose,
      endValue: quantity * endClose,
      weightFraction: 0,
      startWeightFraction: 0,
      contributionFraction: 0,
      priceChangeIdr: quantity * (endClose - startClose),
    };
  });

  for (const holding of holdings) {
    if (!isSafeAmount(holding.startValue) || !isSafeAmount(holding.endValue) || !isSafeAmount(holding.priceChangeIdr)) {
      return {
        kind: 'unavailable',
        reason: {
          code: 'unsafe-arithmetic',
          symbols: [holding.symbol],
          detail: 'valuation product is outside the exact-integer range',
        },
      };
    }
  }

  const startValue = holdings.reduce((sum, holding) => sum + holding.startValue, 0);
  const endValue = holdings.reduce((sum, holding) => sum + holding.endValue, 0);
  if (!isSafeAmount(startValue) || !isSafeAmount(endValue)) {
    return {
      kind: 'unavailable',
      reason: { code: 'unsafe-arithmetic', symbols: [], detail: 'modelled total is outside the exact-integer range' },
    };
  }
  if (startValue <= 0 || endValue <= 0) {
    return {
      kind: 'unavailable',
      reason: { code: 'zero-denominator', symbols: [], detail: 'modelled value is zero or not finite' },
    };
  }

  for (const holding of holdings) {
    holding.weightFraction = holding.endValue / endValue;
    holding.startWeightFraction = holding.startValue / startValue;
    holding.contributionFraction = holding.priceChangeIdr / startValue;
  }

  const benchmark =
    input.benchmark !== null && benchmarkCloses.size > 0
      ? {
          symbol: input.benchmark.symbol,
          startClose: benchmarkCloses.get(startDate)!,
          endClose: benchmarkCloses.get(endDate)!,
          returnFraction: benchmarkCloses.get(endDate)! / benchmarkCloses.get(startDate)! - 1,
        }
      : null;

  // Per-date weights over the consumed window. Each point totals to 1 by
  // construction, so the allocation lines and the allocation bars agree.
  const weightSeries: PortfolioWeightPoint[] = window.map((date) => {
    const entries: PortfolioWeightEntry[] = holdings.map((holding, index) => {
      const close = closesBySymbol[index]!.get(date)!;
      const value = holding.quantityShares * close;
      return {
        symbol: holding.symbol,
        quantityShares: holding.quantityShares,
        close,
        value,
        weightFraction: 0,
      };
    });
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    if (!isSafeAmount(total) || total <= 0) return { date, total, entries };
    for (const entry of entries) entry.weightFraction = entry.value / total;
    return { date, total, entries };
  });
  const badTotal = weightSeries.find((point) => !isSafeAmount(point.total) || point.total <= 0);
  if (badTotal !== undefined) {
    return {
      kind: 'unavailable',
      reason: {
        code: 'unsafe-arithmetic',
        symbols: [],
        detail: `modelled total on ${badTotal.date} is outside the exact-integer range`,
      },
    };
  }

  const valueSeries = weightSeries.map((point) => ({ date: point.date, value: point.total }));

  const versionParts = input.holdings
    .map((holding) => `${holding.symbol}=${input.seriesBySymbol.get(holding.symbol)!.dataVersion}`)
    .sort();
  if (input.benchmark !== null) {
    versionParts.push(`${input.benchmark.symbol}=${input.benchmark.series.dataVersion}`);
  }

  return {
    kind: 'ok',
    analytics: {
      currency: SUPPORTED_CURRENCY,
      basis,
      sessions: input.sessions,
      startDate,
      endDate,
      commonCloses: commonDates.length,
      startValue,
      endValue,
      returnFraction: endValue / startValue - 1,
      benchmark,
      holdings,
      dataVersion: versionParts.join('|'),
      valueSeries,
      weightSeries,
      cutoffAt: input.cutoffMs !== null ? new Date(input.cutoffMs).toISOString() : null,
      completedThrough: commonDates[commonDates.length - 1]!,
    },
  };
}

// The largest holding by a comparator that never fabricates an ordering: ties
// resolve to the first owned symbol in input order, which is stable.
export function largestContribution(analytics: PortfolioAnalytics): PortfolioHoldingResult {
  return analytics.holdings.reduce((best, holding) =>
    Math.abs(holding.contributionFraction) > Math.abs(best.contributionFraction) ? holding : best,
  );
}

export function largestAllocation(analytics: PortfolioAnalytics): PortfolioHoldingResult {
  return analytics.holdings.reduce((best, holding) => (holding.weightFraction > best.weightFraction ? holding : best));
}
