import { buildApprovedClaims } from '../ai/claims';
import type { BrokerGroup } from '../data/schemas';
import { buildFacts, pickText, type FactsContext, type FactsData } from './facts';

export interface TradePositiveRun {
  factId: string;
  start: string;
  end: string;
  dates: string[];
}

export interface TradeWeakLink {
  factId: string;
  date: string;
  candidateGroup: BrokerGroup;
  candidateValue: number;
  otherGroup: BrokerGroup;
  otherValue: number;
}

export interface TradeReference {
  factId: string;
  display: number;
}

export interface TradeAsOf {
  sessionDate: string;
  nextDayDate: string;
  nextDayHoliday: boolean;
}

export interface TradeContextView {
  kind: 'sell' | 'buy';
  sellWording: string | null;
  sellFactId: string | null;
  positive: TradePositiveRun | null;
  weakLink: TradeWeakLink | null;
  today: TradeReference | null;
  window: TradeReference | null;
  direction: 'above' | 'below' | null;
  asOf: TradeAsOf;
}

export function buildTradeContext(
  kind: 'sell' | 'buy',
  context: FactsContext,
  data: FactsData,
): TradeContextView {
  const document = buildFacts(context, data);
  const factsByKey = new Map(document.facts.map((fact) => [fact.key, fact]));
  const locale = context.locale;

  const nextDayDate = isoNextDay(context.sessionDate);
  const asOf: TradeAsOf = {
    sessionDate: context.sessionDate,
    nextDayDate,
    nextDayHoliday: data.sessions.some((session) => session.date === nextDayDate && session.status === 'holiday'),
  };

  const c12 = factsByKey.get('C12');
  const c13 = factsByKey.get('C13');
  const c11 = factsByKey.get('C11');
  const ref = factsByKey.get('REF-INST-CUTOFF');

  if (kind === 'sell') {
    const approved = buildApprovedClaims(context, document);
    const c12Claim = approved.claims.find((claim) => claim.claim_id === 'CL-OBS-C12');
    const c13Claim = approved.claims.find((claim) => claim.claim_id === 'CL-OBS-C13');

    let sellWording: string | null = null;
    let sellFactId: string | null = null;
    if (c13Claim?.available) {
      sellWording = pickText(c13Claim.wording.explained, locale);
      sellFactId = c13?.fact_id ?? null;
    } else if (c12Claim?.available) {
      sellWording = pickText(c12Claim.wording.explained, locale);
      sellFactId = c12?.fact_id ?? null;
    }

    const positive =
      c12Claim?.available && c12?.available && c12.value?.kind === 'streak' && c12.value.status === 'passes'
        ? { factId: c12.fact_id, start: c12.period.start, end: c12.period.end, dates: c12.value.dates }
        : null;

    const weakLink =
      c13?.available && c13.value?.kind === 'streak' && c13.value.comparison
        ? { factId: c13.fact_id, ...c13.value.comparison }
        : null;

    return { kind, sellWording, sellFactId, positive, weakLink, today: null, window: null, direction: null, asOf };
  }

  const today =
    c11?.available && c11.value?.kind === 'ratio-delta' ? { factId: c11.fact_id, display: c11.value.to.display } : null;
  const window =
    ref?.available && ref.value?.kind === 'ratio' ? { factId: ref.fact_id, display: ref.value.display } : null;

  let direction: 'above' | 'below' | null = null;
  if (c11?.value?.kind === 'ratio-delta' && ref?.value?.kind === 'ratio') {
    const todayRatio = c11.value.to.numerator / c11.value.to.denominator;
    const windowRatio = ref.value.numerator / ref.value.denominator;
    direction = todayRatio > windowRatio ? 'above' : todayRatio < windowRatio ? 'below' : null;
  }

  return { kind, sellWording: null, sellFactId: null, positive: null, weakLink: null, today, window, direction, asOf };
}

function isoNextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
