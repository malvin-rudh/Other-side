import { buildApprovedClaims, type ApprovedClaim } from '../ai/claims';
import type { BrokerSide, EvidenceStrength, NormalizedBrokerRow } from '../data/schemas';
import { buildFacts, type Fact, type FactsContext, type FactsData, type FactKey, type FactPeriod, type FactType } from './facts';
import { pickText } from './facts';
import type { Locale } from './context';
import { buildBrokerSeries } from './brokerSeries';
import { buildPortfolioFacts } from './portfolioFacts';
import type { PortfolioAnalytics, PriceSeries } from './portfolio';

export interface EvidenceRowView {
  id: string;
  date: string;
  side: BrokerSide;
  rank: number;
  brokerCode: string;
  netLots: number;
  netValueIdr: number;
  sourceAveragePrice: number | null;
  rawLabel: string;
}

export interface EvidenceClaimView {
  claimId: string;
  wording: string;
  caveats: string[];
  strength: EvidenceStrength;
  reason: string;
}

export interface EvidenceExclusionView {
  date: string;
  status: string;
  reason: string;
}

export interface ParsedTotals {
  kind: 'sums';
  lots: number;
  valueIdr: number;
}

// Price provenance for portfolio facts: the drawer shows the daily closes the
// model consumed, per symbol, with the source and data version.
export interface EvidencePriceSeries {
  symbol: string;
  currency: string | null;
  priceBasis: 'provider-daily-unadjusted' | 'sample-fixture-daily';
  source: string;
  dataVersion: string;
  // The consumed window only, in date order. A three-session calculation lists
  // four closes, not the whole fixture: unconsumed dates are not evidence for a
  // number that was never computed from them.
  bars: { date: string; close: number | null }[];
  // The full source history those bars came from, kept separate so the drawer can
  // still state what was available without presenting it as calculation evidence.
  sourceHistory: { firstDate: string; lastDate: string; barCount: number } | null;
}

export interface EvidenceView {
  factId: string;
  factKey: FactKey;
  factType: FactType;
  period: FactPeriod | null;
  approximate: string;
  strength: EvidenceStrength;
  strengthReason: string;
  coverageNote: string;
  rows: EvidenceRowView[];
  parsedTotals: ParsedTotals | null;
  claims: EvidenceClaimView[];
  exclusions: EvidenceExclusionView[];
  // Present only on portfolio facts, which are built from price bars instead
  // of broker rows.
  prices?: EvidencePriceSeries[];
  // The complete per-symbol arithmetic behind a portfolio number: each holding's
  // own quantity, closes and values, the totals they divide by, and the dated
  // weights. A row on screen always opens a view that contains its own symbol.
  portfolio?: EvidencePortfolioView;
}

export interface EvidencePortfolioHolding {
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
}

export interface EvidencePortfolioView {
  currency: string;
  startDate: string;
  endDate: string;
  totalStartValue: number;
  totalEndValue: number;
  holdings: EvidencePortfolioHolding[];
  weights: {
    date: string;
    total: number;
    entries: { symbol: string; close: number; value: number; weightFraction: number }[];
  }[];
}

const STRENGTH_RANK: Record<EvidenceStrength, number> = {
  Strong: 3,
  Moderate: 2,
  Weak: 1,
  'Not enough data': 0,
};

export function buildEvidenceView(
  factId: string,
  context: FactsContext,
  data: FactsData,
  locale: Locale,
): EvidenceView | null {
  const document = buildFacts(context, data);
  // Per-broker series facts live outside the fixed 28 reviewed facts, so the
  // drawer resolves them from the same window and cutoff on demand.
  const fact =
    document.facts.find((entry) => entry.fact_id === factId) ??
    buildBrokerSeries(context, data, [])?.facts.find((entry) => entry.fact_id === factId) ??
    null;
  if (!fact) return null;

  const rowsById = new Map<string, NormalizedBrokerRow>(data.rows.map((row) => [row.id, row]));
  const sourceRows: NormalizedBrokerRow[] = [];
  for (const rowId of fact.source_row_ids) {
    const row = rowsById.get(rowId);
    if (row) sourceRows.push(row);
  }
  const rows = sourceRows.map(toRowView);

  const parsedTotals = computeParsedTotals(fact, sourceRows);

  const approved = buildApprovedClaims(context, document);
  const factsByKey = new Map(document.facts.map((entry) => [entry.key, entry]));
  const claims: EvidenceClaimView[] = approved.claims
    .filter((claim) => claim.available && claim.facts.includes(fact.key))
    .map((claim) => toClaimView(claim, factsByKey, locale));

  const period = fact.period;
  const exclusions: EvidenceExclusionView[] = period
    ? data.sessions
        .filter(
          (session) =>
            (session.status === 'excluded' || session.status === 'missing') &&
            session.date >= period.start &&
            session.date <= period.end,
        )
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((session) => ({ date: session.date, status: session.status, reason: session.reason }))
    : [];

  return {
    factId: fact.fact_id,
    factKey: fact.key,
    factType: fact.type,
    period: fact.period,
    approximate: pickText(fact.approximate, locale),
    strength: fact.evidence.strength,
    strengthReason: pickText(fact.evidence.reason, locale),
    coverageNote: pickText(fact.coverage_note, locale),
    rows,
    parsedTotals,
    claims,
    exclusions,
  };
}

// Portfolio facts are priced, not broker-row-based, so their evidence drawer
// shows the daily closes each modelled holding consumed. The claims come from
// the same reviewed registry via the same buildApprovedClaims path.
export function buildPortfolioEvidenceView(
  factId: string,
  context: FactsContext,
  input: {
    analytics: PortfolioAnalytics;
    series: readonly PriceSeries[];
    benchmarkSeries: PriceSeries | null;
  },
  locale: Locale,
): EvidenceView | null {
  const document = buildPortfolioFacts(context, input.analytics);
  const fact = document.facts.find((entry) => entry.fact_id === factId) ?? null;
  if (!fact) return null;

  const approved = buildApprovedClaims(context, document);
  const factsByKey = new Map(document.facts.map((entry) => [entry.key, entry]));
  const claims: EvidenceClaimView[] = approved.claims
    .filter((claim) => claim.available && claim.facts.includes(fact.key))
    .map((claim) => toClaimView(claim, factsByKey, locale));

  // The exact date set the arithmetic consumed, taken from the value series so a
  // chart, a fact's source sessions and this table can never disagree.
  const consumed = new Set(input.analytics.valueSeries.map((point) => point.date));

  const toPriceSeries = (series: PriceSeries): EvidencePriceSeries => ({
    symbol: series.symbol,
    currency: series.currency,
    priceBasis: series.priceBasis,
    source: series.source,
    dataVersion: series.dataVersion,
    bars: series.bars
      .filter((bar) => consumed.has(bar.date))
      .map((bar) => ({ date: bar.date, close: bar.close })),
    sourceHistory:
      series.bars.length === 0
        ? null
        : {
            firstDate: series.bars[0]!.date,
            lastDate: series.bars[series.bars.length - 1]!.date,
            barCount: series.bars.length,
          },
  });

  const prices: EvidencePriceSeries[] = input.series.map(toPriceSeries);
  if (input.benchmarkSeries !== null) {
    prices.push(toPriceSeries(input.benchmarkSeries));
  }

  return {
    factId: fact.fact_id,
    factKey: fact.key,
    factType: fact.type,
    period: fact.period,
    approximate: pickText(fact.approximate, locale),
    strength: fact.evidence.strength,
    strengthReason: pickText(fact.evidence.reason, locale),
    coverageNote: pickText(fact.coverage_note, locale),
    rows: [],
    parsedTotals: null,
    claims,
    exclusions: [],
    prices,
    portfolio: toPortfolioEvidence(input.analytics),
  };
}

function toPortfolioEvidence(analytics: PortfolioAnalytics): EvidencePortfolioView {
  return {
    currency: analytics.currency,
    startDate: analytics.startDate,
    endDate: analytics.endDate,
    totalStartValue: analytics.startValue,
    totalEndValue: analytics.endValue,
    holdings: analytics.holdings.map((holding) => ({
      symbol: holding.symbol,
      quantityShares: holding.quantityShares,
      startClose: holding.startClose,
      endClose: holding.endClose,
      startValue: holding.startValue,
      endValue: holding.endValue,
      priceChangeIdr: holding.priceChangeIdr,
      startWeightFraction: holding.startWeightFraction,
      weightFraction: holding.weightFraction,
      contributionFraction: holding.contributionFraction,
    })),
    weights: analytics.weightSeries.map((point) => ({
      date: point.date,
      total: point.total,
      entries: point.entries.map((entry) => ({
        symbol: entry.symbol,
        close: entry.close,
        value: entry.value,
        weightFraction: entry.weightFraction,
      })),
    })),
  };
}

function computeParsedTotals(fact: Fact, sourceRows: readonly NormalizedBrokerRow[]): ParsedTotals | null {
  if (sourceRows.length === 0 || !fact.period) return null;

  let lotsTotal = 0;
  let valueTotal = 0;
  for (const row of sourceRows) {
    const sign = row.side === 'buy' ? 1 : -1;
    lotsTotal += sign * row.netLots;
    valueTotal += sign * row.netValueIdr;
    if (!Number.isSafeInteger(lotsTotal) || !Number.isSafeInteger(valueTotal)) return null;
  }
  return { kind: 'sums', lots: lotsTotal, valueIdr: valueTotal };
}

function toRowView(row: NormalizedBrokerRow): EvidenceRowView {
  const raw = row.source;
  const rawLabel = [raw.rawLots, raw.rawValueIdr, raw.rawAveragePrice].filter((part) => part !== undefined).join(' · ');
  return {
    id: row.id,
    date: row.date,
    side: row.side,
    rank: row.rank,
    brokerCode: row.brokerCode,
    netLots: row.netLots,
    netValueIdr: row.netValueIdr,
    sourceAveragePrice: row.sourceAveragePrice ?? null,
    rawLabel,
  };
}

function toClaimView(
  claim: ApprovedClaim,
  factsByKey: ReadonlyMap<string, Fact>,
  locale: Locale,
): EvidenceClaimView {
  const deps = claim.facts.map((key) => factsByKey.get(key)).filter((fact): fact is Fact => Boolean(fact));
  const weakest = deps.reduce<Fact | undefined>(
    (current, fact) =>
      current && STRENGTH_RANK[current.evidence.strength] <= STRENGTH_RANK[fact.evidence.strength] ? current : fact,
    undefined,
  );
  return {
    claimId: claim.claim_id,
    wording: pickText(claim.wording.explained, locale),
    caveats: claim.caveats.map((caveat) => pickText(caveat, locale)),
    strength: weakest?.evidence.strength ?? 'Not enough data',
    reason: weakest ? pickText(weakest.evidence.reason, locale) : '',
  };
}
