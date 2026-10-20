// The languages the app is offered in.
export type Locale = 'en' | 'zh-CN';
// The languages the stored facts, claims and events are written in. The data
// files keep an Indonesian copy, so the engine still builds it.
export type ContentLocale = Locale | 'id';

export interface AnalyticalContext {
  ticker: string;
  selectedSessionDate: string | null;
  cutoffAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  scenario: string;
  locale: Locale;
  dataVersion: string;
  taxonomyVersion: string;
  claimVersion: string;
  // Identity of the priced portfolio inputs (symbols, quantities, currency,
  // dates and the price-data version) that a portfolio explanation belongs to.
  // Absent everywhere except portfolio surfaces, so every existing context key
  // stays byte-identical.
  portfolioKey?: string;
}

export const UNAVAILABLE = 'unavailable';

const NONE = 'none';
const SEP = '|';

export function computeContextKey(context: AnalyticalContext): string {
  const segments = [
    context.ticker,
    context.selectedSessionDate ?? NONE,
    context.cutoffAt ?? NONE,
    `${context.periodStart ?? NONE}..${context.periodEnd ?? NONE}`,
    context.scenario,
    context.locale,
    context.dataVersion,
    context.taxonomyVersion,
    context.claimVersion,
  ];
  if (context.portfolioKey !== undefined) segments.push(context.portfolioKey);
  return segments.join(SEP);
}

// Stable identity for the priced portfolio model: which symbols at which
// quantities, over which dates, under which cutoff, in which currency, from
// which validated prices. It enters the context key so a stale explanation can
// never attach itself to a changed portfolio, a different morning or a corrected
// price.
export function computePortfolioKey(input: {
  symbols: readonly string[];
  quantityBySymbol: ReadonlyMap<string, number>;
  currency: string;
  startDate: string;
  endDate: string;
  dataVersion: string;
  benchmarkSymbol: string | null;
  cutoffAt: string | null;
}): string {
  const holdings = input.symbols
    .slice()
    .sort()
    .map((symbol) => `${symbol}=${input.quantityBySymbol.get(symbol) ?? NONE}`)
    .join(',');
  return [
    'portfolio',
    holdings,
    input.currency,
    `${input.startDate}..${input.endDate}`,
    input.benchmarkSymbol ?? NONE,
    input.cutoffAt ?? NONE,
    input.dataVersion,
  ].join(SEP);
}

export interface ContextualResponse {
  contextKey: string;
  requestId: string;
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function isCurrentResponse(
  expectedContextKey: string,
  latestRequestId: string,
  response: ContextualResponse,
): boolean {
  return response.contextKey === expectedContextKey && response.requestId === latestRequestId;
}
