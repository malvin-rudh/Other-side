import { create } from 'zustand';
import {
  computeContextKey,
  UNAVAILABLE,
  type AnalyticalContext,
  type Locale,
} from '../engine/context';
import type { Manifest } from '../engine/manifest';
import { findInstrument, SAMPLE_PORTFOLIO, SAMPLE_ANALYTICS_PORTFOLIO } from '../data/instruments';

export interface ViewSnapshot {
  route: string;
  date: string | null;
}

export interface ControlFocusRequest {
  selector: string;
  // 'flow' belongs to the stock screen's Flow panel; 'claim-check' belongs to
  // the pinned Claim Check example on the Method page. Each screen services
  // only its own panel kind and ignores the rest.
  panel: 'flow' | 'claim-check' | null;
  token: number;
}

export type PortfolioList = 'owned' | 'watchlist';

export interface PortfolioEntry {
  ticker: string;
  list: PortfolioList;
  // Both are the evaluator's own optional inputs. Absent means unknown, never
  // zero, and no value is inferred from them anywhere in the analysis.
  quantityShares: number | null;
  averagePrice: number | null;
}

// A symbol the evaluator tracked from the provider search. It has no broker
// dataset, so it renders an honest provider-only card and never enters the
// replay. Symbols are trimmed and uppercased only: AAPL and AAPL.JK stay
// distinct because suffix stripping would merge different listings.
export interface ProviderInstrument {
  symbol: string;
  name: string | null;
  exchange: string | null;
}

const PORTFOLIO_STORAGE_KEY = 'other-side.portfolio.v1';
const PROVIDER_INSTRUMENTS_STORAGE_KEY = 'other-side.provider-instruments.v1';
const LOCALE_STORAGE_KEY = 'other-side.locale.v1';
const LOCALES: readonly Locale[] = ['en', 'id', 'zh-CN'];

// A fresh visit opens in Simplified Chinese; an explicit earlier choice wins.
function readStoredLocale(): Locale {
  if (typeof localStorage === 'undefined') return 'zh-CN';
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    return LOCALES.includes(raw as Locale) ? (raw as Locale) : 'zh-CN';
  } catch {
    return 'zh-CN';
  }
}

function writeStoredLocale(locale: Locale): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The language choice is cosmetic; blocked storage must not break the session.
  }
}

// A fresh visit tracks the one verified case and owns nothing, so the Your
// portfolio empty state is real while the Brief still has something to explain.
const DEFAULT_PORTFOLIO: readonly PortfolioEntry[] = [
  { ticker: 'SINI', list: 'watchlist', quantityShares: null, averagePrice: null },
];

function isPortfolioList(value: unknown): value is PortfolioList {
  return value === 'owned' || value === 'watchlist';
}

function optionalAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

// Shares are whole shares. Zero, fractional and beyond-safe-integer quantities
// become unknown here rather than entering valuation, and the analytics engine
// refuses by naming the holding instead of repairing or dropping it.
function optionalShareQuantity(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

// Persisted input crosses a trust boundary, so every stored entry is validated
// against the registry or the persisted provider symbols and dropped when it
// does not fit. Older storage that predates provider symbols keeps working:
// registry entries survive, unknown tickers are dropped.
function normalizePortfolio(value: unknown, knownTickers: ReadonlySet<string>): PortfolioEntry[] {
  if (!Array.isArray(value)) return [];
  const entries: PortfolioEntry[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const candidate = raw as Record<string, unknown>;
    const ticker = typeof candidate.ticker === 'string' ? candidate.ticker.trim().toUpperCase() : '';
    if (findInstrument(ticker) === null && !knownTickers.has(ticker)) continue;
    if (entries.some((entry) => entry.ticker === ticker)) continue;
    entries.push({
      ticker,
      list: isPortfolioList(candidate.list) ? candidate.list : 'watchlist',
      quantityShares: optionalShareQuantity(candidate.quantityShares),
      averagePrice: optionalAmount(candidate.averagePrice),
    });
  }
  return entries;
}

function isProviderSymbol(value: string): boolean {
  return value !== '' && value.length <= 20 && /^[A-Z0-9.\-^]+$/.test(value);
}

function normalizeProviderInstruments(value: unknown): ProviderInstrument[] {
  if (!Array.isArray(value)) return [];
  const instruments: ProviderInstrument[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const candidate = raw as Record<string, unknown>;
    const symbol = typeof candidate.symbol === 'string' ? candidate.symbol.trim().toUpperCase() : '';
    if (!isProviderSymbol(symbol)) continue;
    // A registry ticker never doubles as a provider-only symbol.
    if (findInstrument(symbol) !== null) continue;
    if (instruments.some((instrument) => instrument.symbol === symbol)) continue;
    instruments.push({
      symbol,
      name: typeof candidate.name === 'string' && candidate.name.trim() !== '' ? candidate.name : null,
      exchange: typeof candidate.exchange === 'string' && candidate.exchange.trim() !== '' ? candidate.exchange : null,
    });
  }
  return instruments;
}

function readStoredProviderInstruments(): ProviderInstrument[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PROVIDER_INSTRUMENTS_STORAGE_KEY);
    if (raw === null) return [];
    return normalizeProviderInstruments(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

function writeStoredProviderInstruments(instruments: readonly ProviderInstrument[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PROVIDER_INSTRUMENTS_STORAGE_KEY, JSON.stringify(instruments));
  } catch {
    // Same policy as the portfolio: blocked storage must not break the session.
  }
}

function readStoredPortfolio(knownTickers: ReadonlySet<string>): PortfolioEntry[] {
  if (typeof localStorage === 'undefined') return [...DEFAULT_PORTFOLIO];
  try {
    const raw = localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (raw === null) return [...DEFAULT_PORTFOLIO];
    return normalizePortfolio(JSON.parse(raw) as unknown, knownTickers);
  } catch {
    return [...DEFAULT_PORTFOLIO];
  }
}

function writeStoredPortfolio(entries: readonly PortfolioEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // A blocked or full storage must not break the session; portfolio inputs are
    // the only thing ever written here, and tokens never reach this path.
  }
}

export interface ContextStore extends AnalyticalContext {
  briefDate: string | null;
  demoMode: boolean;
  dataThrough: string | null;
  demoToken: string;
  liveEndpoint: string;
  coachStep: number;
  viewSnapshot: ViewSnapshot | null;
  focusRequest: ControlFocusRequest | null;
  portfolio: PortfolioEntry[];
  providerInstruments: ProviderInstrument[];
  contextKey: string;
  setLocale: (locale: Locale) => void;
  setTicker: (ticker: string) => void;
  selectSession: (date: string | null) => void;
  setCutoff: (cutoffAt: string | null) => void;
  setPeriod: (periodStart: string | null, periodEnd: string | null) => void;
  setScenario: (scenario: string) => void;
  setBriefDate: (date: string | null) => void;
  setDemoMode: (demoMode: boolean) => void;
  setDemoToken: (demoToken: string) => void;
  setLiveEndpoint: (liveEndpoint: string) => void;
  setCoachStep: (coachStep: number) => void;
  setViewSnapshot: (route: string, date: string | null) => void;
  requestControlFocus: (selector: string, panel?: 'flow' | 'claim-check' | null) => void;
  clearFocusRequest: () => void;
  applyManifest: (manifest: Manifest | null) => void;
  addHolding: (ticker: string, list?: PortfolioList) => void;
  addProviderHolding: (match: ProviderInstrument, list?: PortfolioList) => void;
  removeHolding: (ticker: string) => void;
  setHoldingList: (ticker: string, list: PortfolioList) => void;
  setHoldingQuantity: (ticker: string, quantityShares: number | null) => void;
  setHoldingAveragePrice: (ticker: string, averagePrice: number | null) => void;
  loadSamplePortfolio: () => void;
  loadSampleAnalyticsPortfolio: () => void;
  clearPortfolio: () => void;
}

export const initialAnalyticalContext: AnalyticalContext = {
  ticker: 'SINI',
  selectedSessionDate: null,
  cutoffAt: null,
  periodStart: null,
  periodEnd: null,
  scenario: 'default',
  locale: readStoredLocale(),
  dataVersion: UNAVAILABLE,
  taxonomyVersion: UNAVAILABLE,
  claimVersion: UNAVAILABLE,
};

export const useContextStore = create<ContextStore>()((set, get) => {
  let focusToken = 0;
  const initialProviderInstruments = readStoredProviderInstruments();
  const initialProviderSymbols = new Set(initialProviderInstruments.map((instrument) => instrument.symbol));
  const patchContext = (partial: Partial<AnalyticalContext>) =>
    set((state) => {
      const next: AnalyticalContext = { ...state, ...partial };
      return { ...partial, contextKey: computeContextKey(next) };
    });
  const patchPortfolio = (update: (entries: PortfolioEntry[]) => PortfolioEntry[]) =>
    set((state) => {
      const portfolio = update(state.portfolio);
      writeStoredPortfolio(portfolio);
      return { portfolio };
    });

  return {
    ...initialAnalyticalContext,
    briefDate: null,
    demoMode: false,
    dataThrough: null,
    demoToken: '',
    liveEndpoint: 'http://localhost:8787/api/explain',
    coachStep: -1,
    viewSnapshot: null,
    focusRequest: null,
    portfolio: readStoredPortfolio(initialProviderSymbols),
    providerInstruments: initialProviderInstruments,
    contextKey: computeContextKey(initialAnalyticalContext),

    setLocale: (locale) => {
      writeStoredLocale(locale);
      patchContext({ locale });
    },
    setTicker: (ticker) => patchContext({ ticker: ticker.trim().toUpperCase() }),
    selectSession: (selectedSessionDate) => patchContext({ selectedSessionDate }),
    setCutoff: (cutoffAt) => patchContext({ cutoffAt }),
    setPeriod: (periodStart, periodEnd) => {
      if (periodStart !== null && periodEnd !== null && periodStart > periodEnd) return;
      patchContext({ periodStart, periodEnd });
    },
    setScenario: (scenario) => patchContext({ scenario }),

    setBriefDate: (briefDate) => set({ briefDate }),
    setDemoMode: (demoMode) => set({ demoMode }),
    setDemoToken: (demoToken) => set({ demoToken: demoToken.trim() }),
    setLiveEndpoint: (liveEndpoint) => set({ liveEndpoint: liveEndpoint.trim() }),
    setCoachStep: (coachStep) => set({ coachStep }),
    setViewSnapshot: (route, date) =>
      set((state) =>
        state.viewSnapshot !== null && state.viewSnapshot.route === route && state.viewSnapshot.date === date
          ? state
          : { viewSnapshot: { route, date } },
      ),
    requestControlFocus: (selector, panel = null) => {
      focusToken += 1;
      set({ focusRequest: { selector, panel, token: focusToken } });
    },
    clearFocusRequest: () => set({ focusRequest: null }),

    applyManifest: (manifest) => {
      if (!manifest) return;
      patchContext({
        dataVersion: manifest.dataVersion,
        taxonomyVersion: manifest.taxonomyVersion,
        claimVersion: manifest.claimVersion,
      });
      set({ dataThrough: manifest.dataThrough });
    },

    addHolding: (ticker, list = 'owned') => {
      const normalized = ticker.trim().toUpperCase();
      set((state) => {
        const known =
          findInstrument(normalized) !== null ||
          state.providerInstruments.some((instrument) => instrument.symbol === normalized);
        if (!known) return {};
        const portfolio = state.portfolio.some((entry) => entry.ticker === normalized)
          ? state.portfolio.map((entry) => (entry.ticker === normalized ? { ...entry, list } : entry))
          : [...state.portfolio, { ticker: normalized, list, quantityShares: null, averagePrice: null }];
        writeStoredPortfolio(portfolio);
        return { portfolio };
      });
    },
    addProviderHolding: (match, list = 'watchlist') => {
      const symbol = match.symbol.trim().toUpperCase();
      if (!isProviderSymbol(symbol)) return;
      // A provider match that collides with a registry ticker is just that
      // instrument; no provider-only metadata is stored for it.
      if (findInstrument(symbol) !== null) {
        get().addHolding(symbol, list);
        return;
      }
      set((state) => {
        const instruments = state.providerInstruments.some((instrument) => instrument.symbol === symbol)
          ? state.providerInstruments.map((instrument) =>
              instrument.symbol === symbol ? { symbol, name: match.name, exchange: match.exchange } : instrument,
            )
          : [...state.providerInstruments, { symbol, name: match.name, exchange: match.exchange }];
        const portfolio = state.portfolio.some((entry) => entry.ticker === symbol)
          ? state.portfolio.map((entry) => (entry.ticker === symbol ? { ...entry, list } : entry))
          : [...state.portfolio, { ticker: symbol, list, quantityShares: null, averagePrice: null }];
        writeStoredProviderInstruments(instruments);
        writeStoredPortfolio(portfolio);
        return { providerInstruments: instruments, portfolio };
      });
    },
    removeHolding: (ticker) =>
      patchPortfolio((entries) => entries.filter((entry) => entry.ticker !== ticker.trim().toUpperCase())),
    setHoldingList: (ticker, list) =>
      patchPortfolio((entries) =>
        entries.map((entry) => (entry.ticker === ticker.trim().toUpperCase() ? { ...entry, list } : entry)),
      ),
    setHoldingQuantity: (ticker, quantityShares) =>
      patchPortfolio((entries) =>
        entries.map((entry) =>
          entry.ticker === ticker.trim().toUpperCase()
            ? { ...entry, quantityShares: optionalShareQuantity(quantityShares) }
            : entry,
        ),
      ),
    setHoldingAveragePrice: (ticker, averagePrice) =>
      patchPortfolio((entries) =>
        entries.map((entry) =>
          entry.ticker === ticker.trim().toUpperCase()
            ? { ...entry, averagePrice: optionalAmount(averagePrice) }
            : entry,
        ),
      ),
    // Only ever reached from an explicitly labelled control that has already
    // asked for confirmation when the evaluator has entries of their own.
    loadSamplePortfolio: () =>
      patchPortfolio(() =>
        SAMPLE_PORTFOLIO.map((entry) => ({
          ticker: entry.ticker,
          list: entry.list,
          quantityShares: null,
          averagePrice: null,
        })),
      ),
    // The analytics preset carries the fictional quantities the fixtures were
    // designed for, so the analytics card works offline. Same confirmation rule
    // as the plain sample portfolio: the caller confirms before replacing.
    loadSampleAnalyticsPortfolio: () =>
      patchPortfolio(() =>
        SAMPLE_ANALYTICS_PORTFOLIO.map((entry) => ({
          ticker: entry.ticker,
          list: entry.list,
          quantityShares: entry.quantityShares,
          averagePrice: null,
        })),
      ),
    clearPortfolio: () => patchPortfolio(() => []),
  };
});
