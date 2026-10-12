// Client for the server-side provider adapter. The browser never talks to a
// market-data vendor directly and never holds a vendor credential: it calls our
// own /api routes with the evaluator's demo token, exactly like /api/explain.
//
// Every field is validated here because it crosses a trust boundary. Anything
// unrecognised becomes an honest unavailable state rather than a partial guess.

import {
  isCalendarDate,
  isIanaTimeZone,
  isOrderedUniqueDates,
  isTimestamp,
  suppliedCount,
  suppliedPrice,
} from './historyValidation';

export interface ProviderStatus {
  adapter: string | null;
  enabled: boolean;
  connected: boolean;
  checkedAt: string | null;
  lastError: { code: string; message: string } | null;
}

export interface ProviderQuote {
  symbol: string;
  price: number | null;
  currency: string | null;
  asOf: string | null;
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

// One trading day of provider history. Null fields are unknown, never zero.
export interface ProviderHistoryBar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

// Mirror of the server token: daily bars exactly as the provider reports them,
// no split or dividend adjustment. An answer with any other basis is refused
// rather than rendered as if it were a usable price.
export type ProviderPriceBasis = 'provider-daily-unadjusted';

export interface ProviderPriceHistory {
  symbol: string;
  currency: string | null;
  // Always a resolvable IANA zone. Bars are dated in the exchange's own
  // timezone, so history without one is refused instead of being dated by guess.
  exchangeTimezone: string;
  exchangeName: string | null;
  source: string;
  fetchedAt: string;
  priceBasis: ProviderPriceBasis;
  bars: ProviderHistoryBar[];
}

export type ProviderFailure =
  | { kind: 'no-endpoint' }
  | { kind: 'error'; code: string; message: string; status: ProviderStatus | null };

export type ProviderQuoteResult = { ok: true; quote: ProviderQuote; status: ProviderStatus } | { ok: false; failure: ProviderFailure };

export type ProviderSearchResult = { ok: true; matches: ProviderMatch[] } | { ok: false; failure: ProviderFailure };

export type ProviderHistoryResult =
  | { ok: true; history: ProviderPriceHistory; status: ProviderStatus }
  | { ok: false; failure: ProviderFailure };

export const HISTORY_RANGES = ['1mo', '3mo', '6mo', '1y'] as const;

export type HistoryRange = (typeof HISTORY_RANGES)[number];

// The provider routes live on the same origin as the explain endpoint the
// evaluator already typed, so no second URL is ever configured in the browser.
// The evaluator may type an absolute URL or a same-origin path such as
// /api/explain; anything else is not an endpoint we can call.
export function apiOrigin(liveEndpoint: string): string | null {
  try {
    return new URL(liveEndpoint).origin;
  } catch {
    const trimmed = liveEndpoint.trim();
    if (trimmed.startsWith('/') && typeof window !== 'undefined') {
      return window.location.origin;
    }
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseStatus(value: unknown): ProviderStatus | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const rawError = record.lastError;
  let lastError: ProviderStatus['lastError'] = null;
  if (typeof rawError === 'object' && rawError !== null) {
    const errorRecord = rawError as Record<string, unknown>;
    lastError = { code: text(errorRecord.code) ?? 'UNKNOWN', message: text(errorRecord.message) ?? '' };
  }
  return {
    adapter: text(record.adapter),
    enabled: record.enabled === true,
    connected: record.connected === true,
    checkedAt: text(record.checkedAt),
    lastError,
  };
}

function parseQuote(value: unknown): ProviderQuote | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const symbol = text(record.symbol);
  const fetchedAt = text(record.fetchedAt);
  if (symbol === null || fetchedAt === null) return null;
  return {
    symbol,
    price: number(record.price),
    currency: text(record.currency),
    asOf: text(record.asOf),
    delay: text(record.delay),
    exchangeName: text(record.exchangeName),
    source: text(record.source) ?? 'unknown',
    fetchedAt,
  };
}

export async function fetchProviderStatus(
  liveEndpoint: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderStatus | ProviderFailure> {
  const origin = apiOrigin(liveEndpoint);
  if (origin === null) return { kind: 'no-endpoint' };
  let response: Response;
  try {
    response = await fetchImpl(`${origin}/api/provider/status`, { method: 'GET' });
  } catch {
    return { kind: 'error', code: 'UNREACHABLE', message: 'quote endpoint did not answer', status: null };
  }
  const payload = (await response.json().catch(() => null)) as unknown;
  const status = parseStatus(payload);
  if (!response.ok || status === null) {
    return {
      kind: 'error',
      code: response.ok ? 'BAD_RESPONSE' : `HTTP_${response.status}`,
      message: 'status answer could not be read',
      status,
    };
  }
  return status;
}

export async function fetchProviderQuote(
  liveEndpoint: string,
  demoToken: string,
  symbol: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderQuoteResult> {
  const origin = apiOrigin(liveEndpoint);
  if (origin === null) return { ok: false, failure: { kind: 'no-endpoint' } };
  let response: Response;
  try {
    response = await fetchImpl(`${origin}/api/quote?symbol=${encodeURIComponent(symbol.trim())}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${demoToken}` },
    });
  } catch {
    return {
      ok: false,
      failure: { kind: 'error', code: 'UNREACHABLE', message: 'quote endpoint did not answer', status: null },
    };
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const status = parseStatus(payload?.status);
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        kind: 'error',
        code: text(payload?.error) ?? `HTTP_${response.status}`,
        message: text(payload?.message) ?? 'lookup failed',
        status,
      },
    };
  }
  const quote = parseQuote(payload?.quote);
  if (quote === null || status === null) {
    return {
      ok: false,
      failure: { kind: 'error', code: 'BAD_RESPONSE', message: 'quote answer could not be read', status },
    };
  }
  return { ok: true, quote, status };
}

export function isProviderStatus(value: ProviderStatus | ProviderFailure): value is ProviderStatus {
  return !('kind' in value);
}

function parseMatches(value: unknown): ProviderMatch[] | null {
  if (!Array.isArray(value)) return null;
  const matches: ProviderMatch[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const symbol = text(record.symbol);
    if (symbol === null) continue;
    matches.push({
      symbol,
      name: text(record.name),
      exchange: text(record.exchange),
      quoteType: text(record.quoteType),
    });
  }
  return matches;
}

// A supplied field that is malformed is a refusal with its own reason, never a
// silent null. Absent and explicit null stay unknown.
type HistoryParse = { ok: true; history: ProviderPriceHistory } | { ok: false; reason: string };

function parseHistory(value: unknown): HistoryParse {
  const unreadable = (reason: string): HistoryParse => ({ ok: false, reason });
  if (typeof value !== 'object' || value === null) return unreadable('history answer was not an object');
  const record = value as Record<string, unknown>;
  const symbol = text(record.symbol);
  if (symbol === null) return unreadable('history answer had no symbol');
  // A malformed provenance value is a refusal, not a usable price: the fetch
  // time must be a real instant and the timezone must resolve, or the bars
  // cannot be dated honestly.
  if (!isTimestamp(record.fetchedAt)) return unreadable('history answer had no usable fetch time');
  const fetchedAt = record.fetchedAt;
  if (record.priceBasis !== 'provider-daily-unadjusted') {
    return unreadable('history answer had an unrecognized price basis');
  }
  if (!isIanaTimeZone(record.exchangeTimezone)) {
    return unreadable('history answer had an unresolvable exchange timezone');
  }
  const exchangeTimezone = record.exchangeTimezone;
  if (!Array.isArray(record.bars) || record.bars.length === 0) return unreadable('history answer had no daily bars');
  const bars: ProviderHistoryBar[] = [];
  for (const entry of record.bars) {
    if (typeof entry !== 'object' || entry === null) return unreadable('a daily bar was not an object');
    const barRecord = entry as Record<string, unknown>;
    // A real calendar date: "2026-02-31" is rejected rather than normalized
    // into March by the platform's date parser.
    if (!isCalendarDate(barRecord.date)) return unreadable('a daily bar was not a real calendar date');
    const where = `bar ${barRecord.date}`;
    const open = suppliedPrice(barRecord.open, `${where} open`);
    const high = suppliedPrice(barRecord.high, `${where} high`);
    const low = suppliedPrice(barRecord.low, `${where} low`);
    const close = suppliedPrice(barRecord.close, `${where} close`);
    const volume = suppliedCount(barRecord.volume, `${where} volume`);
    for (const field of [open, high, low, close, volume]) {
      if (!field.ok) return unreadable(field.reason);
    }
    bars.push({
      date: barRecord.date,
      open: open.ok ? open.value : null,
      high: high.ok ? high.value : null,
      low: low.ok ? low.value : null,
      close: close.ok ? close.value : null,
      volume: volume.ok ? volume.value : null,
    });
  }
  if (!isOrderedUniqueDates(bars.map((bar) => bar.date))) {
    return unreadable('daily bars were not strictly ordered and unique');
  }
  return {
    ok: true,
    history: {
      symbol,
      currency: text(record.currency),
      exchangeTimezone,
      exchangeName: text(record.exchangeName),
      source: text(record.source) ?? 'unknown',
      fetchedAt,
      priceBasis: 'provider-daily-unadjusted',
      bars,
    },
  };
}

export async function fetchProviderSearch(
  liveEndpoint: string,
  demoToken: string,
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderSearchResult> {
  const origin = apiOrigin(liveEndpoint);
  if (origin === null) return { ok: false, failure: { kind: 'no-endpoint' } };
  let response: Response;
  try {
    response = await fetchImpl(`${origin}/api/provider/search?q=${encodeURIComponent(query.trim())}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${demoToken}` },
    });
  } catch {
    return {
      ok: false,
      failure: { kind: 'error', code: 'UNREACHABLE', message: 'quote endpoint did not answer', status: null },
    };
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        kind: 'error',
        code: text(payload?.error) ?? `HTTP_${response.status}`,
        message: text(payload?.message) ?? 'search failed',
        status: parseStatus(payload?.status),
      },
    };
  }
  const matches = parseMatches(payload?.matches);
  if (matches === null) {
    return {
      ok: false,
      failure: { kind: 'error', code: 'BAD_RESPONSE', message: 'search answer could not be read', status: null },
    };
  }
  return { ok: true, matches };
}

export async function fetchProviderHistory(
  liveEndpoint: string,
  demoToken: string,
  symbol: string,
  range: HistoryRange,
  fetchImpl: typeof fetch = fetch,
): Promise<ProviderHistoryResult> {
  const origin = apiOrigin(liveEndpoint);
  if (origin === null) return { ok: false, failure: { kind: 'no-endpoint' } };
  let response: Response;
  try {
    response = await fetchImpl(
      `${origin}/api/provider/history?symbol=${encodeURIComponent(symbol.trim())}&range=${range}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${demoToken}` },
      },
    );
  } catch {
    return {
      ok: false,
      failure: { kind: 'error', code: 'UNREACHABLE', message: 'history endpoint did not answer', status: null },
    };
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const status = parseStatus(payload?.status);
  if (!response.ok) {
    return {
      ok: false,
      failure: {
        kind: 'error',
        code: text(payload?.error) ?? `HTTP_${response.status}`,
        message: text(payload?.message) ?? 'history request failed',
        status,
      },
    };
  }
  const parsed = parseHistory(payload?.history);
  if (!parsed.ok || status === null) {
    return {
      ok: false,
      failure: {
        kind: 'error',
        code: parsed.ok ? 'BAD_RESPONSE' : 'MALFORMED_HISTORY',
        message: parsed.ok ? 'history answer could not be read' : parsed.reason,
        status,
      },
    };
  }
  const history = parsed.history;
  if (history.symbol.trim().toUpperCase() !== symbol.trim().toUpperCase()) {
    return {
      ok: false,
      failure: {
        kind: 'error',
        code: 'BAD_RESPONSE',
        message: 'history answer was for a different symbol',
        status,
      },
    };
  }
  return { ok: true, history, status };
}
