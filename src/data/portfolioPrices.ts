// Price loading for the portfolio analytics layer. Each owned holding resolves
// to exactly one price source, decided by the registry, never by availability:
//   sample instruments    their own /data fixture, and never a provider call
//   verified instruments  the server provider adapter through their explicit
//                         provider symbol (SINI looks up SINI.JK)
//   provider-only symbols the server provider adapter through their symbol
// The benchmark follows the same basis rule: a purely fictional portfolio gets
// the fictional SMPLIDX fixture, a purely real portfolio gets ^JKSE. A mixed
// portfolio gets no benchmark at all because the analytics engine refuses to
// sum the two price sources anyway.

import { useEffect, useMemo, useRef, useState } from 'react';
import { findInstrument } from './instruments';
import { staticCloses } from './staticCloses';
import { fetchProviderHistory, type HistoryRange } from './providerClient';
import { validatePricesDocument, type PricesDocument } from './schemas';
import {
  buildPortfolioAnalytics,
  providerSeries,
  restrictSeriesToWindow,
  sampleSeries,
  type PortfolioAnalyticsResult,
  type PriceSeries,
} from '../engine/portfolio';
import { useContextStore } from '../store/contextStore';

export const SAMPLE_BENCHMARK_SYMBOL = 'SMPLIDX';
export const REAL_BENCHMARK_SYMBOL = '^JKSE';

// 5/10/20-session changes need at most 21 aligned closes; three months of daily
// bars covers that plus the value chart without pulling a year of provider data.
const HISTORY_RANGE: HistoryRange = '3mo';

export interface PortfolioPriceFailure {
  symbol: string;
  code: string;
  message: string;
}

export interface PortfolioPricesState {
  status: 'loading' | 'ready';
  seriesBySymbol: ReadonlyMap<string, PriceSeries>;
  benchmark: { symbol: string; series: PriceSeries } | null;
  failures: readonly PortfolioPriceFailure[];
  // The instant the stored bars were gated at. Part of the state so the
  // calculation and the evidence always describe the same consumed sessions and
  // never a later one.
  cutoffMs: number;
}

const EMPTY_PRICES: PortfolioPricesState = {
  status: 'loading',
  seriesBySymbol: new Map(),
  benchmark: null,
  failures: [],
  cutoffMs: 0,
};

type PriceSource =
  | { kind: 'sample-fixture'; symbol: string }
  | { kind: 'provider'; symbol: string; providerSymbol: string }
  | { kind: 'none'; symbol: string };

// The SMP sample stocks are fictional: they resolve to their fixture and have no
// provider symbol in the registry, so this function can never route them to the
// provider adapter.
function priceSource(symbol: string, providerSymbols: ReadonlySet<string>): PriceSource {
  const instrument = findInstrument(symbol);
  if (instrument !== null) {
    if (instrument.dataMode === 'sample') return { kind: 'sample-fixture', symbol: instrument.ticker };
    if (instrument.providerSymbol !== null) {
      return { kind: 'provider', symbol: instrument.ticker, providerSymbol: instrument.providerSymbol };
    }
    return { kind: 'none', symbol: instrument.ticker };
  }
  if (providerSymbols.has(symbol)) return { kind: 'provider', symbol, providerSymbol: symbol };
  return { kind: 'none', symbol };
}

const fixtureCache = new Map<string, Promise<PriceSeries>>();

async function loadFixtureSeries(symbol: string): Promise<PriceSeries> {
  const cached = fixtureCache.get(symbol);
  if (cached !== undefined) return cached;
  const promise = (async () => {
    const response = await fetch(`/data/${encodeURIComponent(symbol.toLowerCase())}/prices.json`);
    if (!response.ok) throw new Error(`fetch failed: ${symbol} prices.json (${response.status})`);
    const raw: unknown = await response.json();
    if (!validatePricesDocument(raw)) throw new Error(`prices.json failed schema validation for ${symbol}`);
    const document = raw as PricesDocument;
    if (document.symbol !== symbol) throw new Error(`prices symbol mismatch for ${symbol}`);
    return sampleSeries(document);
  })();
  promise.catch(() => fixtureCache.delete(symbol));
  fixtureCache.set(symbol, promise);
  return promise;
}

interface ResolvedPrices {
  seriesBySymbol: Map<string, PriceSeries>;
  benchmark: { symbol: string; series: PriceSeries } | null;
  failures: PortfolioPriceFailure[];
}

async function resolvePrices(
  ownedSymbols: readonly string[],
  providerSymbols: ReadonlySet<string>,
  liveEndpoint: string,
  demoToken: string,
): Promise<ResolvedPrices> {
  const seriesBySymbol = new Map<string, PriceSeries>();
  const failures: PortfolioPriceFailure[] = [];

  const sources = ownedSymbols.map((symbol) => priceSource(symbol, providerSymbols));
  const bases = new Set(sources.map((source) => (source.kind === 'sample-fixture' ? 'sample' : source.kind === 'provider' ? 'provider' : 'none')));
  const singleBasis = bases.size === 1 ? [...bases][0]! : null;

  const loads: Promise<void>[] = sources.map(async (source) => {
    if (source.kind === 'none') return;
    if (source.kind === 'sample-fixture') {
      try {
        seriesBySymbol.set(source.symbol, await loadFixtureSeries(source.symbol));
      } catch (error: unknown) {
        failures.push({
          symbol: source.symbol,
          code: 'SAMPLE_UNAVAILABLE',
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    const result = await fetchProviderHistory(liveEndpoint, demoToken, source.providerSymbol, HISTORY_RANGE);
    if (result.ok) {
      seriesBySymbol.set(source.symbol, providerSeries(result.history));
      return;
    }
    failures.push({
      symbol: source.symbol,
      code: result.failure.kind === 'no-endpoint' ? 'NO_ENDPOINT' : result.failure.code,
      message: result.failure.kind === 'no-endpoint' ? 'no usable endpoint' : result.failure.message,
    });
  });

  // The benchmark is fetched only when every owned holding shares one basis,
  // so a fictional valuation can never sit beside ^JKSE and vice versa.
  if (singleBasis === 'sample') {
    loads.push(
      loadFixtureSeries(SAMPLE_BENCHMARK_SYMBOL)
        .then((series) => {
          seriesBySymbol.set(SAMPLE_BENCHMARK_SYMBOL, series);
        })
        .catch((error: unknown) => {
          failures.push({
            symbol: SAMPLE_BENCHMARK_SYMBOL,
            code: 'SAMPLE_UNAVAILABLE',
            message: error instanceof Error ? error.message : String(error),
          });
        }),
    );
  } else if (singleBasis === 'provider') {
    loads.push(
      fetchProviderHistory(liveEndpoint, demoToken, REAL_BENCHMARK_SYMBOL, HISTORY_RANGE).then((result) => {
        if (!result.ok) {
          failures.push({
            symbol: REAL_BENCHMARK_SYMBOL,
            code: result.failure.kind === 'no-endpoint' ? 'NO_ENDPOINT' : result.failure.code,
            message: result.failure.kind === 'no-endpoint' ? 'no usable endpoint' : result.failure.message,
          });
          return;
        }
        seriesBySymbol.set(REAL_BENCHMARK_SYMBOL, providerSeries(result.history));
      }),
    );
  }

  await Promise.all(loads);

  const benchmarkSymbol = singleBasis === 'sample' ? SAMPLE_BENCHMARK_SYMBOL : singleBasis === 'provider' ? REAL_BENCHMARK_SYMBOL : null;
  const benchmarkSeries = benchmarkSymbol !== null ? seriesBySymbol.get(benchmarkSymbol) : undefined;
  seriesBySymbol.delete(SAMPLE_BENCHMARK_SYMBOL);
  seriesBySymbol.delete(REAL_BENCHMARK_SYMBOL);
  const benchmark = benchmarkSymbol !== null && benchmarkSeries !== undefined ? { symbol: benchmarkSymbol, series: benchmarkSeries } : null;

  return { seriesBySymbol, benchmark, failures };
}

interface ResolvedPricesState {
  status: 'loading' | 'ready';
  // The instant the answer landed, which is the completion cutoff when the caller
  // has no replay cutoff of its own. That is not the same thing as a series'
  // fetchedAt, which records when the provider was asked.
  resolved: (ResolvedPrices & { landedAtMs: number }) | null;
}

// Owns the whole price-loading lifecycle: request IDs order every run, and an
// unmount or a changed portfolio, endpoint or token drops all in-flight answers
// at once. The cutoff is deliberately not a dependency here, so moving to another
// morning never refetches prices it already has.
function useResolvedPrices(): ResolvedPricesState {
  const portfolio = useContextStore((state) => state.portfolio);
  const providerInstruments = useContextStore((state) => state.providerInstruments);
  const liveEndpoint = useContextStore((state) => state.liveEndpoint);
  const demoToken = useContextStore((state) => state.demoToken);

  const ownedSymbols = useMemo(
    () => portfolio.filter((entry) => entry.list === 'owned').map((entry) => entry.ticker),
    [portfolio],
  );
  const ownedKey = ownedSymbols.join('|');
  const providerKey = useMemo(() => providerInstruments.map((instrument) => instrument.symbol).join('|'), [providerInstruments]);

  const requestId = useRef(0);
  const [state, setState] = useState<ResolvedPricesState>({ status: 'loading', resolved: null });

  useEffect(() => {
    const id = requestId.current + 1;
    requestId.current = id;
    let cancelled = false;
    setState({ status: 'loading', resolved: null });
    const symbols = ownedKey === '' ? [] : ownedKey.split('|');
    const providerSymbols = new Set(providerKey === '' ? [] : providerKey.split('|'));
    void resolvePrices(symbols, providerSymbols, liveEndpoint, demoToken).then((resolved) => {
      if (cancelled || id !== requestId.current) return;
      setState({ status: 'ready', resolved: { ...resolved, landedAtMs: Date.now() } });
    });
    return () => {
      cancelled = true;
    };
    // ownedKey and providerKey are the joined identity of the arrays above.
  }, [ownedKey, providerKey, liveEndpoint, demoToken]);

  return state;
}

const UNKNOWN_COMPLETION = 'UNKNOWN_SESSION_COMPLETION';

// Restricts the loaded series to the sessions a view may consume. Everything
// downstream reads the result, so a historical Brief cannot reach a later value
// through a chart, a tooltip, a fact or the evidence drawer. A series whose
// exchange timezone cannot place the session close is dropped with an honest
// failure instead of being dated by assumption.
export function usePortfolioPrices(cutoffMs: number | null = null): PortfolioPricesState {
  const { status, resolved } = useResolvedPrices();

  return useMemo<PortfolioPricesState>(() => {
    if (resolved === null) return EMPTY_PRICES;
    const cutoff = cutoffMs ?? resolved.landedAtMs;
    const seriesBySymbol = new Map<string, PriceSeries>();
    const failures: PortfolioPriceFailure[] = [...resolved.failures];

    const completionFailure = (symbol: string, series: PriceSeries): PortfolioPriceFailure => ({
      symbol,
      code: UNKNOWN_COMPLETION,
      message: `exchange timezone ${series.exchangeTimezone ?? 'unknown'} cannot establish when the session closed`,
    });

    for (const [symbol, series] of resolved.seriesBySymbol) {
      const restricted = restrictSeriesToWindow(series, cutoff);
      if (restricted.ok) seriesBySymbol.set(symbol, restricted.series);
      else failures.push(completionFailure(symbol, series));
    }

    let benchmark: { symbol: string; series: PriceSeries } | null = null;
    if (resolved.benchmark !== null) {
      const restricted = restrictSeriesToWindow(resolved.benchmark.series, cutoff);
      if (restricted.ok) benchmark = { symbol: resolved.benchmark.symbol, series: restricted.series };
      else failures.push(completionFailure(resolved.benchmark.symbol, resolved.benchmark.series));
    }

    return { status, seriesBySymbol, benchmark, failures, cutoffMs: cutoff };
  }, [status, resolved, cutoffMs]);
}

export interface PortfolioAnalyticsState {
  prices: PortfolioPricesState;
  // Null only while prices are still loading; every completed load yields an
  // honest result, including the refusals with their explanation.
  result: PortfolioAnalyticsResult | null;
}

// A whole number of sessions, or 'all' for every common close the holdings
// share up to the cutoff.
export function usePortfolioAnalytics(sessions: number | 'all', cutoffMs: number | null = null): PortfolioAnalyticsState {
  const prices = usePortfolioPrices(cutoffMs);
  const portfolio = useContextStore((state) => state.portfolio);

  const result = useMemo(() => {
    if (prices.status !== 'ready') return null;
    const holdings = portfolio
      .filter((entry) => entry.list === 'owned')
      .map((entry) => ({ symbol: entry.ticker, quantityShares: entry.quantityShares }));
    const build = (count: number) =>
      buildPortfolioAnalytics({
        holdings,
        seriesBySymbol: prices.seriesBySymbol,
        benchmark: prices.benchmark,
        sessions: count,
        cutoffMs: prices.cutoffMs,
      });
    if (sessions !== 'all') return build(sessions);
    // Ask for more closes than exist, then rebuild on exactly the ones found.
    const probe = build(Number.MAX_SAFE_INTEGER - 1);
    if (probe.kind === 'unavailable' && probe.reason.code === 'insufficient-common-closes') {
      const found = probe.reason.found ?? 0;
      if (found >= 2) return build(found - 1);
    }
    return probe;
  }, [prices, portfolio, sessions]);

  return { prices, result };
}

export interface SessionClose {
  date: string;
  close: number;
  basis: PriceSeries['priceBasis'] | 'yahoo-adjusted-close';
  // The close the session before, and the first close on or after the window
  // start; null when the history does not reach that far.
  previousClose: number | null;
  windowStartClose: number | null;
}

export type SessionCloseState =
  | { status: 'loading' }
  | { status: 'ready'; close: SessionClose }
  | { status: 'unavailable' };

// The latest close on or before `date` for one instrument: the fixture for a
// sample stock, the provider adapter for a listed one. Unavailable when neither
// answers; no broker implied price is ever used in its place.
export function useSessionClose(ticker: string, date: string | null, windowStart: string | null = null): SessionCloseState {
  const liveEndpoint = useContextStore((state) => state.liveEndpoint);
  const demoToken = useContextStore((state) => state.demoToken);
  const [series, setSeries] = useState<PriceSeries | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setSeries(undefined);
    if (staticCloses(ticker) !== null) return;
    const source = priceSource(ticker, new Set());
    const load = async (): Promise<PriceSeries | null> => {
      if (source.kind === 'sample-fixture') return loadFixtureSeries(source.symbol);
      if (source.kind === 'provider') {
        const result = await fetchProviderHistory(liveEndpoint, demoToken, source.providerSymbol, '3mo');
        return result.ok ? providerSeries(result.history) : null;
      }
      return null;
    };
    load()
      .catch(() => null)
      .then((loaded) => {
        if (!cancelled) setSeries(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, liveEndpoint, demoToken]);

  return useMemo<SessionCloseState>(() => {
    // Closes copied into the repo win over any live source.
    const copied = staticCloses(ticker);
    const basis: SessionClose['basis'] = copied !== null ? 'yahoo-adjusted-close' : (series?.priceBasis ?? 'sample-fixture-daily');
    const bars =
      copied !== null
        ? copied.map((entry) => ({ date: entry.date, close: entry.close }))
        : series === undefined || series === null
          ? null
          : series.bars.flatMap((bar) => (bar.close === null ? [] : [{ date: bar.date, close: bar.close }]));
    if (copied === null && series === undefined) return { status: 'loading' };
    if (bars === null || date === null) return { status: 'unavailable' };
    const index = bars.reduce((found, bar, position) => (bar.date <= date ? position : found), -1);
    if (index < 0) return { status: 'unavailable' };
    const start = windowStart === null ? undefined : bars.find((bar) => bar.date >= windowStart);
    return {
      status: 'ready',
      close: {
        date: bars[index]!.date,
        close: bars[index]!.close,
        basis,
        previousClose: index > 0 ? bars[index - 1]!.close : null,
        windowStartClose: start !== undefined && start.date <= bars[index]!.date ? start.close : null,
      },
    };
  }, [series, date, ticker, windowStart]);
}
