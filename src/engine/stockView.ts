import type { BrokerGroup, EvidenceStrength, SiniEvent } from '../data/schemas';
import { isEventAvailableAtCutoff } from '../data/events';
import { buildApprovedClaims, type ApprovedClaim, type ApprovedClaimsDocument, type RenderedPart } from '../ai/claims';
import { dailyGroupNet, impliedPriceReference, type FlowScenario, type GroupNet } from './flows';
import { buildFacts, factByKey, pickText, type Fact, type FactsContext, type FactsData, type FactPeriod, type FactsDocument } from './facts';
import { buildTransactionLens, type TransactionLensView } from './transactionLens';
import type { Locale } from './context';

export interface ProxyPoint {
  date: string;
  display: number | null;
}

export interface CumulativePoint {
  date: string;
  appFacing: number | null;
  institutionFacing: number | null;
  otherMixed: number | null;
  unknown: number | null;
}

export type CardSection = 'observed' | 'interpretation' | 'unknown';

export interface CardClaimView {
  claimId: string;
  wording: string;
  parts: RenderedPart[];
  caveats: string[];
  strength: EvidenceStrength;
  reason: string;
}

export interface EventView {
  id: string;
  publicationDate: string;
  text: string;
  sourceName: string;
  sourceUrl: string;
}

export type FlowGroup = BrokerGroup | 'residual';

export interface ChangedMove {
  group: BrokerGroup;
  fromLots: number;
  toLots: number;
}

export interface ChangedStripView {
  fromDate: string;
  toDate: string;
  factId: string;
  moves: ChangedMove[];
}

export interface FlowGroupView {
  group: FlowGroup;
  lots: number;
  factId: string;
}

export interface RankingEntryView {
  brokerCode: string;
  netLots: number;
  factId: string;
}

export interface StockView {
  ticker: string;
  selectedSessionDate: string;
  effectiveWindow: FactPeriod;
  approved: ApprovedClaimsDocument;
  headerProxy: { display: number | null; date: string | null; factId: string | null };
  proxyPoints: ProxyPoint[];
  cumulativePoints: CumulativePoint[];
  card: Record<CardSection, CardClaimView[]>;
  story: EventView[];
  health: EventView[];
  changed: ChangedStripView | null;
  lens: TransactionLensView;
  flow: {
    available: boolean;
    groups: FlowGroupView[];
    topBuyers: RankingEntryView[];
    topSellers: RankingEntryView[];
  };
}

const MARKET_STATUSES = new Set(['captured', 'missing', 'excluded']);

const STRENGTH_RANK: Record<EvidenceStrength, number> = {
  Strong: 3,
  Moderate: 2,
  Weak: 1,
  'Not enough data': 0,
};

export function buildStockView(context: FactsContext, data: FactsData): StockView {
  const locale = context.locale;
  const document = buildFacts(context, data);
  const approved = buildApprovedClaims(context, document);
  const window = effectiveWindow(context, data);
  // The charts read the same assumed-classification scenario the facts do, so a
  // what-if move shifts the cumulative line and the group table together.
  const scenario: FlowScenario | undefined =
    context.unknownBrokerCodes && context.unknownBrokerCodes.length > 0
      ? { unknownBrokerCodes: context.unknownBrokerCodes }
      : undefined;

  const c11 = factByKey(document, 'C11');
  const headerProxy =
    c11?.available && c11.value?.kind === 'ratio-delta' && c11.period
      ? { display: c11.value.to.display, date: c11.period.end, factId: c11.fact_id }
      : { display: null, date: null, factId: null };

  const proxyPoints: ProxyPoint[] = [];
  const cumulativePoints: CumulativePoint[] = [];
  if (window) {
    const days = dailyGroupNet(data.rows, data.brokers, window, scenario);
    const dayByDate = new Map(days.map((day) => [day.date, day]));
    const totals: GroupNet = { app_facing: 0, institution_facing: 0, other_mixed: 0, unknown: 0, residual: 0 };
    for (const session of data.sessions) {
      if (session.date < window.start || session.date > window.end) continue;
      if (session.status === 'missing') {
        proxyPoints.push({ date: session.date, display: null });
        cumulativePoints.push({
          date: session.date,
          appFacing: null,
          institutionFacing: null,
          otherMixed: null,
          unknown: null,
        });
        continue;
      }
      const day = dayByDate.get(session.date);
      if (!day) continue;
      totals.app_facing += day.groups.app_facing;
      totals.institution_facing += day.groups.institution_facing;
      totals.other_mixed += day.groups.other_mixed;
      totals.unknown += day.groups.unknown;
      totals.residual += day.groups.residual;
      const reference = impliedPriceReference(data.rows, data.brokers, 'buy', { type: 'all' }, { start: day.date, end: day.date });
      proxyPoints.push({ date: day.date, display: reference.available ? reference.display : null });
      cumulativePoints.push({
        date: day.date,
        appFacing: totals.app_facing,
        institutionFacing: totals.institution_facing,
        otherMixed: totals.other_mixed,
        unknown: totals.unknown,
      });
    }
  }

  const factsByKey = new Map(document.facts.map((fact) => [fact.key, fact]));
  const card: Record<CardSection, CardClaimView[]> = { observed: [], interpretation: [], unknown: [] };
  for (const claim of approved.claims) {
    if (!claim.available || claim.section === 'supports' || claim.section === 'contradicts') continue;
    if (claim.cardExcerpt === false) continue;
    if (claim.thesis && claim.section === 'unknown') continue;
    card[claim.section].push(toCardClaim(claim, factsByKey, locale));
  }
  for (const section of ['observed', 'interpretation', 'unknown'] as const) {
    card[section].sort((a, b) => claimPriority(a.claimId) - claimPriority(b.claimId));
  }

  const visibleEvents = data.events
    .filter((event) => isEventAvailableAtCutoff(event, context.cutoffAt))
    .sort((a, b) => a.publicationDate.localeCompare(b.publicationDate));
  const toEventView = (event: SiniEvent): EventView => ({
    id: event.id,
    publicationDate: event.publicationDate,
    text: pickText(event.text, locale),
    sourceName: event.source.name,
    sourceUrl: event.source.url,
  });
  const story = visibleEvents.filter((event) => event.layer === 'story').map(toEventView);
  const health = visibleEvents.filter((event) => event.layer === 'health').map(toEventView);

  const changed = buildChangedStrip(document);
  const lens = buildTransactionLens(data, document);

  const c04 = factByKey(document, 'C04');
  const c05 = factByKey(document, 'C05');
  const c06 = factByKey(document, 'C06');
  const c07 = factByKey(document, 'C07');
  const c08 = factByKey(document, 'C08');
  const c09 = factByKey(document, 'C09');
  const nets = c04?.available && c04.value?.kind === 'group-nets' ? c04.value.nets : null;
  const groupFact: Record<FlowGroup, { fact: Fact | undefined; lots: (n: GroupNet) => number }> = {
    app_facing: { fact: c04, lots: (n) => n.app_facing },
    institution_facing: { fact: c05, lots: (n) => n.institution_facing },
    other_mixed: { fact: c06, lots: (n) => n.other_mixed },
    unknown: { fact: c06, lots: (n) => n.unknown },
    residual: { fact: c07, lots: (n) => n.residual },
  };
  const flow: StockView['flow'] = {
    available: nets !== null,
    groups: nets
      ? (Object.keys(groupFact) as FlowGroup[]).map((group) => ({
          group,
          lots: groupFact[group].lots(nets),
          factId: groupFact[group].fact?.fact_id ?? '',
        }))
      : [],
    topBuyers:
      c08?.available && c08.value?.kind === 'ranking'
        ? c08.value.entries.map((entry) => ({ ...entry, factId: c08.fact_id }))
        : [],
    topSellers:
      c09?.available && c09.value?.kind === 'ranking'
        ? c09.value.entries.map((entry) => ({ ...entry, factId: c09.fact_id }))
        : [],
  };

  return {
    ticker: context.ticker,
    selectedSessionDate: context.sessionDate,
    effectiveWindow: window ?? { start: context.periodStart, end: context.periodEnd },
    approved,
    headerProxy,
    proxyPoints,
    cumulativePoints,
    card,
    story,
    health,
    changed,
    lens,
    flow,
  };
}

const CHANGED_GROUPS: readonly BrokerGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];
const CHANGED_MAX_LINES = 3;

function buildChangedStrip(document: FactsDocument): ChangedStripView | null {
  const c25 = factByKey(document, 'C25');
  if (!c25?.available || c25.value?.kind !== 'daily-group-nets' || c25.value.days.length !== 2) return null;
  const [from, to] = c25.value.days;
  if (!from || !to) return null;
  const moves: ChangedMove[] = CHANGED_GROUPS.map((group) => ({
    group,
    fromLots: from.groups[group],
    toLots: to.groups[group],
  }))
    .filter((move) => move.fromLots !== move.toLots)
    .sort((a, b) => Math.abs(b.toLots - b.fromLots) - Math.abs(a.toLots - a.fromLots))
    .slice(0, CHANGED_MAX_LINES);
  return { fromDate: from.date, toDate: to.date, factId: c25.fact_id, moves };
}

export function effectiveWindow(context: FactsContext, data: FactsData): FactPeriod | null {
  const eligibleMarketSessions = data.sessions
    .filter(
      (session) =>
        MARKET_STATUSES.has(session.status) &&
        session.date >= context.periodStart &&
        session.date <= context.periodEnd &&
        isSessionDayEligible(session.date, context.cutoffAt),
    )
    .map((session) => session.date)
    .sort();
  const lastEligible = eligibleMarketSessions[eligibleMarketSessions.length - 1];
  if (!lastEligible || context.periodStart > lastEligible) return null;
  return { start: context.periodStart, end: lastEligible };
}

function isSessionDayEligible(sessionDate: string, cutoffAt: string): boolean {
  const availableAt = new Date(`${sessionDate}T00:00:00Z`);
  availableAt.setUTCDate(availableAt.getUTCDate() + 1);
  return Date.parse(`${availableAt.toISOString().slice(0, 10)}T00:00:00+07:00`) <= Date.parse(cutoffAt);
}

const CARD_PRIORITY = [
  'CL-OBS-C12',
  'CL-OBS-C13',
  'CL-OBS-C04',
  'CL-OBS-C05',
  'CL-OBS-C10',
  'CL-INT-C11',
  'CL-OBS-C15',
  'CL-OBS-C16',
  'CL-OBS-C17',
];

function claimPriority(claimId: string): number {
  const index = CARD_PRIORITY.indexOf(claimId);
  return index === -1 ? CARD_PRIORITY.length : index;
}

function toCardClaim(
  claim: ApprovedClaim,
  factsByKey: ReadonlyMap<string, Fact>,
  locale: Locale,
): CardClaimView {
  const deps = claim.facts.map((key) => factsByKey.get(key)).filter((fact): fact is Fact => Boolean(fact));
  const weakest = deps.reduce<Fact | undefined>(
    (current, fact) =>
      current && STRENGTH_RANK[current.evidence.strength] <= STRENGTH_RANK[fact.evidence.strength] ? current : fact,
    undefined,
  );
  const parts = claim.parts.explained[locale];
  return {
    claimId: claim.claim_id,
    wording: pickText(claim.wording.explained, locale),
    parts: parts ?? [{ kind: 'text', text: pickText(claim.wording.explained, locale) }],
    caveats: claim.caveats.map((caveat) => pickText(caveat, locale)),
    strength: weakest?.evidence.strength ?? 'Not enough data',
    reason: weakest ? pickText(weakest.evidence.reason, locale) : '',
  };
}
