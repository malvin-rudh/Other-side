// Replaceable market-data provider adapter.
//
// One interface, one Yahoo implementation behind it, so a broker or a licensed
// vendor can be swapped in without touching the app. Three rules matter here:
//
//   1. Every upstream value is validated before it leaves the server. A shape
//      we do not recognise becomes an honest error code, never a guess.
//   2. The adapter reports "connected" only after a real lookup succeeded. A
//      configured base URL is not a verified connection.
//   3. Current quotes are a separate surface from the historical broker replay.
//      Nothing in this file can reach public/data or the facts pipeline.
//
// No credential is read from a request. The base URL and the enable flag come
// from process.env like every other server setting.

import {
  isCalendarDate,
  isIanaTimeZone,
  isOrderedUniqueDates,
  isTimestamp,
  suppliedCount,
  suppliedPrice,
  type SuppliedField,
} from '../src/data/historyValidation';
import { sessionEndUtcMs } from '../src/engine/portfolio';

export type QuoteErrorCode =
  | 'DISABLED'
  | 'BAD_SYMBOL'
  | 'UNAVAILABLE'
  | 'UNREACHABLE'
  | 'UPSTREAM_TIMEOUT';

export interface Quote {
  symbol: string;
  price: number | null;
  currency: string | null;
  // Provider timestamp, when the provider supplied one. Null means unknown.
  asOf: string | null;
  // Quote delay. Yahoo publishes no reliable delay field, and its
  // dataGranularity is a chart interval, not a delay, so the Yahoo adapter
  // always returns null and the UI says "not supplied".
  delay: string | null;
  exchangeName: string | null;
  source: string;
  fetchedAt: string;
}

export interface ProviderMatch {
  symbol: string;
  name: string | null;
  exchange: string | null;
  quoteType: string | null;
}

// One trading day of provider history. Null fields are unknown, never zero:
// the provider omits a value exactly when it does not have one.
export interface HistoryBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

export interface PriceHistory {
  symbol: string;
  currency: string | null;
  // Always a resolvable IANA zone. Bars are dated in the exchange's own
  // timezone, so an answer without one is refused rather than dated by guess.
  exchangeTimezone: string;
  exchangeName: string | null;
  source: string;
  fetchedAt: string;
  // Stable token, not prose: daily OHLCV bars exactly as the provider reports
  // them, with no split or dividend adjustment applied. The client validates
  // this token so an unknown basis never renders as a price.
  priceBasis: 'provider-daily-unadjusted';
  bars: HistoryBar[];
}

export type HistoryRange = '1mo' | '3mo' | '6mo' | '1y';

export const HISTORY_RANGES: readonly HistoryRange[] = ['1mo', '3mo', '6mo', '1y'];

export function isHistoryRange(value: unknown): value is HistoryRange {
  return typeof value === 'string' && (HISTORY_RANGES as readonly string[]).includes(value);
}

export interface QuoteAdapter {
  readonly id: string;
  quote(symbol: string, timeoutMs: number): Promise<Quote>;
  search(query: string, timeoutMs: number): Promise<ProviderMatch[]>;
  history(symbol: string, range: HistoryRange, timeoutMs: number): Promise<PriceHistory>;
}

export class QuoteError extends Error {
  readonly code: QuoteErrorCode;

  constructor(code: QuoteErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'QuoteError';
  }
}

const SYMBOL_RE = /^[A-Z0-9.\-^]{1,24}$/;
const MAX_MATCHES = 10;

function isValidSymbol(symbol: string): boolean {
  return SYMBOL_RE.test(symbol);
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'o-side-prototype/1.0' },
    });
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    throw new QuoteError(
      aborted ? 'UPSTREAM_TIMEOUT' : 'UNREACHABLE',
      aborted ? `provider timed out after ${timeoutMs}ms` : 'provider endpoint did not answer',
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new QuoteError(
      response.status === 404 ? 'UNAVAILABLE' : 'UNREACHABLE',
      `provider answered ${response.status}`,
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new QuoteError('UNREACHABLE', 'provider answer was not valid JSON');
  }
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

// Yahoo answers a quote with its chart envelope. Only meta is used: the app
// never mixes a current price into a historical broker series.
function parseChartQuote(symbol: string, payload: unknown, source: string): Quote {
  const chart = (payload as { chart?: { result?: unknown[]; error?: unknown } })?.chart;
  if (chart?.error) {
    throw new QuoteError('UNAVAILABLE', 'provider returned an error payload');
  }
  const result = Array.isArray(chart?.result) ? chart?.result : null;
  const first = result?.[0] as { meta?: Record<string, unknown> } | undefined;
  const meta = first?.meta;
  if (typeof meta !== 'object' || meta === null) {
    throw new QuoteError('UNAVAILABLE', 'provider answer had no meta block');
  }
  const price = asNumber(meta.regularMarketPrice);
  const seconds = asNumber(meta.regularMarketTime);
  if (price === null && seconds === null) {
    throw new QuoteError('UNAVAILABLE', 'provider supplied neither a price nor a timestamp');
  }
  const providerSymbol = asText(meta.symbol);
  if (providerSymbol !== null && providerSymbol.toUpperCase() !== symbol.toUpperCase()) {
    throw new QuoteError('UNAVAILABLE', 'provider answered for a different symbol');
  }
  let asOf: string | null = null;
  if (seconds !== null) {
    const parsed = new Date(seconds * 1000);
    asOf = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return {
    symbol,
    price,
    currency: asText(meta.currency),
    asOf,
    // dataGranularity is the chart interval (for example "1d"), never a quote
    // delay, so it is not reported as one.
    delay: null,
    exchangeName: asText(meta.exchangeName) ?? asText(meta.fullExchangeName),
    source,
    fetchedAt: new Date().toISOString(),
  };
}

function parseSearchMatches(payload: unknown): ProviderMatch[] {
  const quotes = (payload as { quotes?: unknown })?.quotes;
  if (!Array.isArray(quotes)) return [];
  const matches: ProviderMatch[] = [];
  for (const entry of quotes) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const symbol = asText(record.symbol);
    if (symbol === null || !isValidSymbol(symbol)) continue;
    matches.push({
      symbol,
      name: asText(record.longname) ?? asText(record.shortname),
      exchange: asText(record.exchDisp) ?? asText(record.exchange),
      quoteType: asText(record.quoteType),
    });
    if (matches.length >= MAX_MATCHES) break;
  }
  return matches;
}

// A supplied field is either absent (unknown), an explicit null (unknown) or a
// number that satisfies its own rule. Anything else is refused with an honest
// error rather than being rewritten into null, which would report a broken
// provider answer as a day with a missing close.
function barField(read: SuppliedField): number | null {
  if (read.ok) return read.value;
  throw new QuoteError('UNAVAILABLE', read.reason);
}

// The chart envelope also answers a daily-history request. Bars are dated in
// the exchange's own timezone: without exchangeTimezoneName a UTC epoch cannot
// be turned into a local trading date honestly, so the answer is refused.
function parseChartHistory(symbol: string, payload: unknown, source: string): PriceHistory {
  const chart = (payload as { chart?: { result?: unknown[]; error?: unknown } })?.chart;
  if (chart?.error) {
    throw new QuoteError('UNAVAILABLE', 'provider returned an error payload');
  }
  const result = Array.isArray(chart?.result) ? chart?.result : null;
  const first = result?.[0] as
    | {
        meta?: Record<string, unknown>;
        timestamp?: unknown;
        indicators?: { quote?: unknown[] };
      }
    | undefined;
  const meta = typeof first?.meta === 'object' && first?.meta !== null ? first?.meta : null;
  if (meta === null) {
    throw new QuoteError('UNAVAILABLE', 'provider answer had no meta block');
  }
  const providerSymbol = asText(meta.symbol);
  if (providerSymbol !== null && providerSymbol.toUpperCase() !== symbol.toUpperCase()) {
    throw new QuoteError('UNAVAILABLE', 'provider answered for a different symbol');
  }
  const timezone = asText(meta.exchangeTimezoneName);
  if (timezone === null) {
    throw new QuoteError('UNAVAILABLE', 'provider answer had no exchange timezone, so bars cannot be dated');
  }
  // The zone must actually resolve. An unresolvable zone would make the
  // formatter below throw, and a thrown formatter is not an honest error code.
  if (!isIanaTimeZone(timezone)) {
    throw new QuoteError('UNAVAILABLE', 'provider answer had an unresolvable exchange timezone');
  }
  const timestamps = first?.timestamp;
  if (!Array.isArray(timestamps) || timestamps.length === 0) {
    throw new QuoteError('UNAVAILABLE', 'provider returned no daily bars');
  }
  const quoteSeries = (first?.indicators?.quote as Array<Record<string, unknown>> | undefined)?.[0];
  if (typeof quoteSeries !== 'object' || quoteSeries === null) {
    throw new QuoteError('UNAVAILABLE', 'provider answer had no daily quote series');
  }
  const seriesValue = (key: string, index: number): unknown => {
    const series = quoteSeries[key];
    return Array.isArray(series) ? series[index] : undefined;
  };
  // en-CA yields ISO-like YYYY-MM-DD without relying on locale data.
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const bars: HistoryBar[] = [];
  let previousDate: string | null = null;
  let previousSeconds: number | null = null;
  for (let index = 0; index < timestamps.length; index += 1) {
    const seconds = asNumber(timestamps[index]);
    if (seconds === null) {
      throw new QuoteError('UNAVAILABLE', `bar ${index} had no timestamp`);
    }
    if (previousSeconds !== null && seconds <= previousSeconds) {
      throw new QuoteError('UNAVAILABLE', 'daily bars were not in chronological order');
    }
    previousSeconds = seconds;
    const instant = new Date(seconds * 1000);
    if (Number.isNaN(instant.getTime())) {
      throw new QuoteError('UNAVAILABLE', `bar ${index} had an invalid timestamp`);
    }
    const date = dateFmt.format(instant);
    if (!isCalendarDate(date)) {
      throw new QuoteError('UNAVAILABLE', `bar ${index} did not resolve to a real calendar date`);
    }
    if (previousDate !== null && date <= previousDate) {
      throw new QuoteError('UNAVAILABLE', 'daily bars repeated or reversed a date');
    }
    previousDate = date;
    const where = `bar ${index} (${date})`;
    bars.push({
      date,
      open: barField(suppliedPrice(seriesValue('open', index), `${where} open`)),
      high: barField(suppliedPrice(seriesValue('high', index), `${where} high`)),
      low: barField(suppliedPrice(seriesValue('low', index), `${where} low`)),
      close: barField(suppliedPrice(seriesValue('close', index), `${where} close`)),
      volume: barField(suppliedCount(seriesValue('volume', index), `${where} volume`)),
    });
  }
  return assertHistorySendable({
    symbol,
    currency: asText(meta.currency),
    exchangeTimezone: timezone,
    exchangeName: asText(meta.exchangeName) ?? asText(meta.fullExchangeName),
    source,
    fetchedAt: new Date().toISOString(),
    priceBasis: 'provider-daily-unadjusted',
    bars,
  });
}

// The server applies the same checks the client applies, so the two boundaries
// cannot disagree: anything the client would reject is refused here first, with
// an honest error code rather than a payload that quietly fails downstream.
function assertHistorySendable(history: PriceHistory): PriceHistory {
  if (!isTimestamp(history.fetchedAt)) {
    throw new QuoteError('UNAVAILABLE', 'history answer had no usable fetch time');
  }
  if (!isIanaTimeZone(history.exchangeTimezone)) {
    throw new QuoteError('UNAVAILABLE', 'history answer had an unresolvable exchange timezone');
  }
  if (history.bars.length === 0) {
    throw new QuoteError('UNAVAILABLE', 'provider returned no daily bars');
  }
  if (!history.bars.every((bar) => isCalendarDate(bar.date))) {
    throw new QuoteError('UNAVAILABLE', 'a daily bar was not a real calendar date');
  }
  if (!isOrderedUniqueDates(history.bars.map((bar) => bar.date))) {
    throw new QuoteError('UNAVAILABLE', 'daily bars were not strictly ordered and unique');
  }
  return history;
}

// A daily bar is a closing price only once its regular session has ended. An
// answer fetched mid-session carries a bar for the current day whose values are
// still moving, and once that answer is cached the clock keeps advancing while
// the observation does not: ten minutes later the session end is in the past and
// a reader would take the pre-close bar for a completed close. Excluding it here,
// before caching, means no cached answer can ever be promoted into a closing
// price. The first fresh fetch after the close supplies the real one.
//
// Current-session prices stay a separate surface: the quote endpoint still
// reports them, and this only governs the completed daily closes used to value a
// portfolio.
function completedSessionsOnly(history: PriceHistory): PriceHistory {
  const observedAtMs = Date.parse(history.fetchedAt);
  if (!Number.isFinite(observedAtMs)) return history;
  const bars = history.bars.filter((bar) => {
    const end = sessionEndUtcMs(bar.date, history.exchangeTimezone);
    // A session end that cannot be established is left in place so the client
    // refuses it as unknown completion instead of the server guessing a date.
    return end === null || end <= observedAtMs;
  });
  if (bars.length === 0) {
    throw new QuoteError('UNAVAILABLE', 'provider returned no completed daily sessions');
  }
  return bars.length === history.bars.length ? history : { ...history, bars };
}

export interface YahooAdapterOptions {
  chartBaseUrl: string;
  searchBaseUrl: string;
}

export function createYahooAdapter(options: YahooAdapterOptions): QuoteAdapter {
  const id = 'yahoo-finance';
  return {
    id,
    async quote(symbol, timeoutMs) {
      const normalized = symbol.trim().toUpperCase();
      if (!isValidSymbol(normalized)) {
        throw new QuoteError('BAD_SYMBOL', 'symbol must be at most 24 characters of A-Z, 0-9, ., - or ^');
      }
      const url = `${options.chartBaseUrl}/v8/finance/chart/${encodeURIComponent(normalized)}?interval=1d&range=1d`;
      const payload = await fetchJson(url, timeoutMs);
      return parseChartQuote(normalized, payload, id);
    },
    async search(query, timeoutMs) {
      const normalized = query.trim();
      if (normalized === '' || normalized.length > 64) {
        throw new QuoteError('BAD_SYMBOL', 'search query must be 1 to 64 characters');
      }
      const url = `${options.searchBaseUrl}/v1/finance/search?q=${encodeURIComponent(normalized)}&quotesCount=${MAX_MATCHES}&newsCount=0`;
      const payload = await fetchJson(url, timeoutMs);
      return parseSearchMatches(payload);
    },
    async history(symbol, range, timeoutMs) {
      const normalized = symbol.trim().toUpperCase();
      if (!isValidSymbol(normalized)) {
        throw new QuoteError('BAD_SYMBOL', 'symbol must be at most 24 characters of A-Z, 0-9, ., - or ^');
      }
      const url = `${options.chartBaseUrl}/v8/finance/chart/${encodeURIComponent(normalized)}?interval=1d&range=${range}`;
      const payload = await fetchJson(url, timeoutMs);
      return parseChartHistory(normalized, payload, id);
    },
  };
}

// Tracks whether this deployment has actually reached the provider. The status
// the UI shows comes from here, never from configuration alone.
export interface ProviderStatus {
  adapter: string | null;
  enabled: boolean;
  connected: boolean;
  checkedAt: string | null;
  lastError: { code: QuoteErrorCode; message: string } | null;
}

export function createProviderTracker(adapter: QuoteAdapter | null) {
  let checkedAt: string | null = null;
  let lastError: ProviderStatus['lastError'] = null;

  // Bounded in-memory cache for daily history. A cached answer keeps its
  // original fetchedAt, so the UI never presents stale bars as fresh.
  const HISTORY_CACHE_TTL_MS = 10 * 60_000;
  const HISTORY_CACHE_MAX_ENTRIES = 32;
  const historyCache = new Map<string, { history: PriceHistory; expiresAt: number }>();

  return {
    status(): ProviderStatus {
      return {
        adapter: adapter?.id ?? null,
        enabled: adapter !== null,
        connected: adapter !== null && checkedAt !== null && lastError === null,
        checkedAt,
        lastError,
      };
    },
    async quote(symbol: string, timeoutMs: number): Promise<Quote> {
      if (adapter === null) throw new QuoteError('DISABLED', 'no provider adapter is configured on this deployment');
      try {
        const quote = await adapter.quote(symbol, timeoutMs);
        checkedAt = quote.fetchedAt;
        lastError = null;
        return quote;
      } catch (error: unknown) {
        if (error instanceof QuoteError) {
          checkedAt = new Date().toISOString();
          lastError = { code: error.code, message: error.message };
        }
        throw error;
      }
    },
    async search(query: string, timeoutMs: number): Promise<ProviderMatch[]> {
      if (adapter === null) throw new QuoteError('DISABLED', 'no provider adapter is configured on this deployment');
      return adapter.search(query, timeoutMs);
    },
    async history(symbol: string, range: HistoryRange, timeoutMs: number): Promise<PriceHistory> {
      if (adapter === null) throw new QuoteError('DISABLED', 'no provider adapter is configured on this deployment');
      const key = `${symbol.trim().toUpperCase()}|${range}`;
      const cached = historyCache.get(key);
      if (cached !== undefined && cached.expiresAt > Date.now()) {
        return cached.history;
      }
      try {
        const history = completedSessionsOnly(await adapter.history(symbol, range, timeoutMs));
        checkedAt = history.fetchedAt;
        lastError = null;
        if (historyCache.size >= HISTORY_CACHE_MAX_ENTRIES) {
          // Map iterates in insertion order, so the first key is the oldest.
          const oldest = historyCache.keys().next().value;
          if (oldest !== undefined) historyCache.delete(oldest);
        }
        historyCache.set(key, { history, expiresAt: Date.now() + HISTORY_CACHE_TTL_MS });
        return history;
      } catch (error: unknown) {
        if (error instanceof QuoteError) {
          checkedAt = new Date().toISOString();
          lastError = { code: error.code, message: error.message };
        }
        throw error;
      }
    },
  };
}

export type ProviderTracker = ReturnType<typeof createProviderTracker>;

export function createQuoteAdapterFromEnv(env: Record<string, string | undefined>): QuoteAdapter | null {
  if (env.QUOTE_ENABLED !== 'true') return null;
  return createYahooAdapter({
    chartBaseUrl: (env.QUOTE_CHART_BASE_URL ?? 'https://query1.finance.yahoo.com').replace(/\/+$/, ''),
    searchBaseUrl: (env.QUOTE_SEARCH_BASE_URL ?? 'https://query2.finance.yahoo.com').replace(/\/+$/, ''),
  });
}
