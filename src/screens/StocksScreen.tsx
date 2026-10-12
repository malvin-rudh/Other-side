import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { buildApprovedClaims, type RenderedPart } from '../ai/claims';
import { DataModeChip } from '../components/DataModeChip';
import { EvidenceButton } from '../components/EvidenceButton';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { Icon } from '../components/Icon';
import { ProviderPanel } from '../components/ProviderPanel';
import { StateBlock } from '../components/StateBlock';
import { isEventAvailableAtCutoff } from '../data/events';
import {
  findInstrument,
  INSTRUMENTS,
  instrumentExchange,
  instrumentNameText,
  type DataMode,
  type Instrument,
} from '../data/instruments';
import { usePublicData, type PublicData, type PublicDataState } from '../data/publicData';
import type { BrokerGroup } from '../data/schemas';
import { buildEvidenceView, type EvidenceView } from '../engine/evidence';
import { dailyGroupNet } from '../engine/flows';
import { buildFacts, factId, pickText, type FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { compareKind, type ComparisonKind } from '../engine/transactionLens';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';
import '../layout.css';

type FilterId = 'verified' | 'sample' | 'broker' | 'actions' | 'financials' | 'liquidity';

const CATEGORY_KEYS = {
  all: 'stocks.catAll',
  changes: 'stocks.catChanges',
  events: 'stocks.catEvents',
  following: 'stocks.catFollowing',
} as const;

type CategoryId = keyof typeof CATEGORY_KEYS;

type FeedItem =
  | {
      kind: 'change';
      id: string;
      ticker: string;
      dataset: DataMode;
      fromDate: string;
      toDate: string;
      group: BrokerGroup;
      fromLots: number;
      toLots: number;
      compare: ComparisonKind;
      factId: string;
    }
  | {
      kind: 'event';
      id: string;
      ticker: string;
      dataset: DataMode;
      publicationDate: string;
      text: string;
      sourceName: string;
      sourceUrl: string;
    };

interface InstrumentFeed {
  items: FeedItem[];
  state: PublicDataState;
}

interface EvidenceRequest {
  ticker: string;
  sessionDate: string;
  factId: string;
  trigger: HTMLButtonElement | null;
}

// Approved session-comparison wording, keyed by the shared change classifier so
// the feed can never use a phrase the stock card cannot.
const COMPARE_KEY: Record<ComparisonKind, 'card.compareBuyingIncreased' | 'card.compareBuyingDecreased' | 'card.compareSellingIncreased' | 'card.compareSellingDecreased' | 'card.compareReversalToBuying' | 'card.compareReversalToSelling' | 'card.compareFlatRow'> = {
  'buying-increased': 'card.compareBuyingIncreased',
  'buying-decreased': 'card.compareBuyingDecreased',
  'selling-increased': 'card.compareSellingIncreased',
  'selling-decreased': 'card.compareSellingDecreased',
  'reversal-to-buying': 'card.compareReversalToBuying',
  'reversal-to-selling': 'card.compareReversalToSelling',
  flat: 'card.compareFlatRow',
};

const GROUP_KEY: Record<BrokerGroup, 'stock.groupApp' | 'stock.groupInstitution' | 'stock.groupOther' | 'stock.groupUnknown'> = {
  app_facing: 'stock.groupApp',
  institution_facing: 'stock.groupInstitution',
  other_mixed: 'stock.groupOther',
  unknown: 'stock.groupUnknown',
};

const FEED_GROUPS: readonly BrokerGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

// The feed opens with a manageable page; everything older stays one click away
// instead of pushing provider tools off the first mobile screen.
const FEED_PAGE_SIZE = 10;

export function StocksScreen() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const portfolio = useContextStore((store) => store.portfolio);
  const addHolding = useContextStore((store) => store.addHolding);
  const selectSession = useContextStore((store) => store.selectSession);
  const cutoffOverride = useContextStore((store) => store.cutoffAt);
  const selectedSessionDate = useContextStore((store) => store.selectedSessionDate);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId>('all');
  const [criteria, setCriteria] = useState<readonly FilterId[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRequest | null>(null);
  const [visibleCount, setVisibleCount] = useState(FEED_PAGE_SIZE);

  // The feed is part of the replay: when the visit is anchored to an earlier
  // session or cutoff, items published later stay out of the list entirely.
  const replayCutoff = useMemo(
    () => cutoffOverride ?? (selectedSessionDate !== null ? sessionAvailableAt(selectedSessionDate) : null),
    [cutoffOverride, selectedSessionDate],
  );

  const datasetInstruments = useMemo(() => INSTRUMENTS.filter((instrument) => instrument.hasBrokerDataset), []);
  const feeds = [
    useInstrumentItems(datasetInstruments[0] ?? null, replayCutoff, locale),
    useInstrumentItems(datasetInstruments[1] ?? null, replayCutoff, locale),
    useInstrumentItems(datasetInstruments[2] ?? null, replayCutoff, locale),
  ];
  const datasetStates = datasetInstruments
    .map((instrument, index) => {
      const feed = feeds[index];
      return feed !== undefined ? { instrument, feed } : null;
    })
    .filter((entry): entry is { instrument: Instrument; feed: InstrumentFeed } => entry !== null);

  const feedItems = useMemo(
    () => datasetStates.flatMap((entry) => entry.feed.items).sort(compareItemsDesc),
    [datasetStates],
  );
  // The directional sentence of each change row is the reviewed C25 comparison
  // claim for that session pair, so the feed cannot phrase a move the claim
  // registry has not approved.
  const changeStatements = useMemo(() => {
    const map = new Map<string, readonly RenderedPart[]>();
    for (const entry of datasetStates) {
      if (entry.feed.state.status !== 'ready') continue;
      const data = entry.feed.state.data;
      for (const item of entry.feed.items) {
        if (item.kind !== 'change') continue;
        const context = feedContext(data, item.ticker, item.toDate, locale);
        const claim = buildApprovedClaims(context, buildFacts(context, data)).claims.find(
          (candidate) => candidate.claim_id === 'CL-OBS-C25-MOVE' && candidate.available,
        );
        const parts = claim?.parts.short[locale] ?? null;
        if (parts !== null) map.set(`${item.ticker}|${item.toDate}`, parts);
      }
    }
    return map;
  }, [datasetStates, locale]);
  const allLoading = datasetStates.length > 0 && datasetStates.every((entry) => entry.feed.state.status === 'loading');
  let verifiedError: string | null = null;
  for (const entry of datasetStates) {
    if (entry.instrument.dataMode === 'verified' && entry.feed.state.status === 'error') {
      verifiedError = entry.feed.state.message;
      break;
    }
  }

  const tracked = new Set(portfolio.map((entry) => entry.ticker));
  const normalizedQuery = query.trim().toLowerCase();

  const visibleItems = feedItems.filter((item) => {
    if (category === 'changes' && item.kind !== 'change') return false;
    if (category === 'events' && item.kind !== 'event') return false;
    if (category === 'following' && !tracked.has(item.ticker)) return false;
    if (!matchesQuery(item.ticker, normalizedQuery, locale)) return false;
    return criteria.every((filter) => matchesFilter(item, filter));
  });

  // Any change to the search, category or criteria narrows the list, so the
  // page resets to the first items instead of stranding the visitor mid-feed.
  useEffect(() => {
    setVisibleCount(FEED_PAGE_SIZE);
  }, [query, category, criteria]);
  const pageItems = visibleItems.slice(0, visibleCount);

  const registryMatches =
    normalizedQuery === ''
      ? []
      : INSTRUMENTS.filter(
          (instrument) =>
            instrument.ticker.toLowerCase().includes(normalizedQuery) ||
            instrumentNameText(instrument.name, locale).toLowerCase().includes(normalizedQuery),
        );

  const toggleCriterion = (id: FilterId) =>
    setCriteria((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const openStock = (ticker: string, sessionDate: string) => {
    selectSession(sessionDate);
    navigate(`/stock/${ticker}`);
  };

  const evidenceState = usePublicData(evidence?.ticker ?? null);
  const evidenceContext = useMemo<FactsContext | null>(() => {
    if (evidence === null || evidenceState.status !== 'ready') return null;
    return feedContext(evidenceState.data, evidence.ticker, evidence.sessionDate, locale);
  }, [evidence, evidenceState, locale]);
  const evidenceView = useMemo<EvidenceView | null>(() => {
    if (evidence === null || evidenceContext === null || evidenceState.status !== 'ready') return null;
    return buildEvidenceView(evidence.factId, evidenceContext, evidenceState.data, locale);
  }, [evidence, evidenceContext, evidenceState, locale]);

  const filterSpecs: { id: FilterId; label: string; unavailableForAll: boolean }[] = [
    { id: 'verified', label: t('stocks.filterVerified'), unavailableForAll: false },
    { id: 'sample', label: t('stocks.filterSample'), unavailableForAll: false },
    { id: 'broker', label: t('stocks.filterBrokerActivity'), unavailableForAll: false },
    { id: 'actions', label: t('stocks.filterCorporateActions'), unavailableForAll: false },
    { id: 'financials', label: t('stocks.filterFinancials'), unavailableForAll: true },
    { id: 'liquidity', label: t('stocks.filterLiquidity'), unavailableForAll: true },
  ];

  return (
    <section aria-labelledby="stocks-title" className="page-stack">
      <header id="stocks-header" className="page-hero">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-6 w-1 shrink-0 rounded-full bg-brand" />
          <h1 id="stocks-title" className="text-2xl font-semibold tracking-tight lg:text-[2rem] lg:leading-tight">
            {t('stocks.title')}
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('stocks.intro')}</p>
        <p className="note mt-2">{t('stocks.scopeNote', { count: String(INSTRUMENTS.length) })}</p>
        <p className="note mt-1.5">{t('stocks.noScores')}</p>

        <div className="mt-5 border-t border-line pt-4">
          <label htmlFor="stocks-search" className="eyebrow">
            {t('stocks.search')}
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-mutedSoft">
              <Icon name="search" />
            </span>
            <input
              id="stocks-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="field min-w-0 flex-1"
              autoComplete="off"
            />
          </div>
        </div>

        <div role="group" aria-label={t('stocks.categories')} className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(CATEGORY_KEYS) as CategoryId[]).map((id) => {
            const active = category === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(id)}
                className={active ? 'chip chip-brand' : 'chip chip-line'}
              >
                <span aria-hidden="true">{active ? '✓' : '○'}</span>
                {t(CATEGORY_KEYS[id])}
              </button>
            );
          })}
        </div>

        <details className="mt-4 border-t border-line pt-3">
          <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
            {t('provider.disclosure')}
            <Icon name="expand" className="h-4 w-4 text-mutedSoft" />
          </summary>
          <div className="mt-3">
            <ProviderPanel bare defaultSymbol={INSTRUMENTS[0]?.providerSymbol ?? ''} />
          </div>
        </details>
      </header>

      <div className="grid gap-3 lg:grid-cols-2">
        <details className="card card-pad">
          <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
            {t('stocks.filters')}
            <Icon name="expand" className="h-4 w-4 text-mutedSoft" />
          </summary>
          <div className="mt-3 border-t border-line pt-3">
            <div className="flex flex-wrap gap-2">
              {filterSpecs.map((spec) => {
                const active = criteria.includes(spec.id);
                return (
                  <button
                    key={spec.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleCriterion(spec.id)}
                    title={
                      spec.unavailableForAll
                        ? t('stocks.matchFieldUnavailable', { field: spec.label })
                        : undefined
                    }
                    className={active ? 'chip chip-brand' : 'chip chip-line'}
                  >
                    <span aria-hidden="true">{active ? '✓' : '○'}</span>
                    {spec.label}
                  </button>
                );
              })}
            </div>
            <p className="note mt-2">
              {t('stocks.matchFieldUnavailable', {
                field: `${t('stocks.filterFinancials')} · ${t('stocks.filterLiquidity')}`,
              })}
            </p>
          </div>
        </details>

        <details className="card card-pad">
          <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
            {t('stocks.dataDetails')}
            <Icon name="expand" className="h-4 w-4 text-mutedSoft" />
          </summary>
          <div className="mt-3 space-y-3 border-t border-line pt-3">
            {datasetStates.map((entry) => (
              <DatasetDetails key={entry.instrument.ticker} instrument={entry.instrument} state={entry.feed} cutoff={replayCutoff} />
            ))}
          </div>
        </details>
      </div>

      {verifiedError !== null ? (
        <StateBlock title={t('states.error')} body={verifiedError} />
      ) : allLoading ? (
        <StateBlock title={t('states.loading')} />
      ) : visibleItems.length === 0 ? (
        <div className="card card-pad">
          <p className="text-sm text-muted">{t('stocks.feedEmpty')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-4">
            {pageItems.map((item) => (
              <FeedRow
                key={item.id}
                item={item}
                statement={item.kind === 'change' ? (changeStatements.get(`${item.ticker}|${item.toDate}`) ?? null) : null}
                tracked={tracked.has(item.ticker)}
                onOpen={openStock}
                onFollow={() => addHolding(item.ticker, 'watchlist')}
                onEvidence={(ticker, sessionDate, factId, trigger) => setEvidence({ ticker, sessionDate, factId, trigger })}
              />
            ))}
          </ul>
          {visibleItems.length > visibleCount ? (
            <div className="flex flex-col items-center gap-2 border-t border-line pt-4">
              <p className="text-xs tabular-nums text-muted">
                {t('stocks.showingCount', { shown: String(pageItems.length), total: String(visibleItems.length) })}
              </p>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => setVisibleCount((count) => count + FEED_PAGE_SIZE)}
              >
                {t('stocks.loadMore')}
              </button>
            </div>
          ) : null}
        </div>
      )}

      {registryMatches.length > 0 ? (
        <div>
          <h2 className="eyebrow">{t('stocks.registryMatches')}</h2>
          <ul className="mt-2 space-y-3">
            {registryMatches.map((instrument) => (
              <RegistryRow
                key={instrument.ticker}
                instrument={instrument}
                tracked={tracked.has(instrument.ticker)}
                onAdd={() => addHolding(instrument.ticker, 'watchlist')}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {evidence !== null && evidenceView !== null && evidenceContext !== null ? (
        <EvidenceDrawer
          view={evidenceView}
          cutoffAt={evidenceContext.cutoffAt}
          trigger={evidence.trigger}
          onClose={() => setEvidence(null)}
        />
      ) : null}
    </section>
  );
}

function matchesQuery(ticker: string, normalizedQuery: string, locale: 'en' | 'id' | 'zh-CN'): boolean {
  if (normalizedQuery === '') return true;
  if (ticker.toLowerCase().includes(normalizedQuery)) return true;
  const instrument = findInstrument(ticker);
  return instrument !== null && instrumentNameText(instrument.name, locale).toLowerCase().includes(normalizedQuery);
}

function matchesFilter(item: FeedItem, filter: FilterId): boolean {
  switch (filter) {
    case 'verified':
      return item.dataset === 'verified';
    case 'sample':
      return item.dataset === 'sample';
    case 'broker':
      return item.kind === 'change';
    case 'actions':
      return item.kind === 'event';
    case 'financials':
    case 'liquidity':
      // No reviewed financial or liquidity input exists in this prototype, so the
      // honest answer for every item is unavailable, never a silent pass.
      return false;
  }
}

function compareItemsDesc(a: FeedItem, b: FeedItem): number {
  const aAt = a.kind === 'change' ? a.toDate : a.publicationDate;
  const bAt = b.kind === 'change' ? b.toDate : b.publicationDate;
  return bAt.localeCompare(aAt) || a.ticker.localeCompare(b.ticker) || a.id.localeCompare(b.id);
}

// Feed items are baseline facts only: the what-if scenario is a stock screen
// tool and never changes what the discovery feed counts.
function useInstrumentItems(instrument: Instrument | null, cutoff: string | null, locale: 'en' | 'id' | 'zh-CN'): InstrumentFeed {
  const state = usePublicData(instrument?.ticker ?? null);
  const items = useMemo(
    () =>
      state.status === 'ready' && instrument !== null
        ? [...changeItems(instrument, state.data, cutoff), ...eventItems(instrument, state.data, cutoff, locale)]
        : [],
    [state, instrument, cutoff, locale],
  );
  return { items, state };
}

function changeItems(instrument: Instrument, data: PublicData, cutoff: string | null): FeedItem[] {
  const window = data.defaultWindow;
  const captured = data.sessions
    .filter((session) => session.status === 'captured' && session.date >= window.start && session.date <= window.end)
    .map((session) => session.date)
    .sort((a, b) => a.localeCompare(b));
  const groupsByDate = new Map(dailyGroupNet(data.rows, data.brokers, window).map((day) => [day.date, day.groups]));
  const items: FeedItem[] = [];
  for (let index = 1; index < captured.length; index += 1) {
    const toDate = captured[index];
    const fromDate = captured[index - 1];
    if (toDate === undefined || fromDate === undefined) continue;
    if (cutoff !== null && Date.parse(sessionAvailableAt(toDate)) > Date.parse(cutoff)) continue;
    const from = groupsByDate.get(fromDate);
    const to = groupsByDate.get(toDate);
    if (from === undefined || to === undefined) continue;
    let headline: { group: BrokerGroup; fromLots: number; toLots: number } | null = null;
    for (const group of FEED_GROUPS) {
      const fromLots = from[group];
      const toLots = to[group];
      if (fromLots === toLots) continue;
      if (headline === null || Math.abs(toLots - fromLots) > Math.abs(headline.toLots - headline.fromLots)) {
        headline = { group, fromLots, toLots };
      }
    }
    if (headline === null) continue;
    items.push({
      kind: 'change',
      id: `${instrument.ticker}-C25-${fromDate}-${toDate}`,
      ticker: instrument.ticker,
      dataset: instrument.dataMode,
      fromDate,
      toDate,
      group: headline.group,
      fromLots: headline.fromLots,
      toLots: headline.toLots,
      compare: compareKind(headline.fromLots, headline.toLots),
      // Matches the C25 fact the engine builds at session `toDate`, so the
      // drawer's rebuilt document contains exactly this fact id.
      factId: factId(instrument.ticker, 'C25', { start: fromDate, end: toDate }, 'baseline'),
    });
  }
  return items;
}

function eventItems(
  instrument: Instrument,
  data: PublicData,
  cutoff: string | null,
  locale: 'en' | 'id' | 'zh-CN',
): FeedItem[] {
  return data.events
    .filter((event) => cutoff === null || isEventAvailableAtCutoff(event, cutoff))
    .map((event) => ({
      kind: 'event' as const,
      id: event.id,
      ticker: instrument.ticker,
      dataset: instrument.dataMode,
      publicationDate: event.publicationDate,
      text: pickText(event.text, locale),
      sourceName: event.source.name,
      sourceUrl: event.source.url,
    }));
}

// Same facts context shape the stock screen builds, always at the baseline
// scenario, so the drawer reconstructs the exact document the item cited.
function feedContext(data: PublicData, ticker: string, sessionDate: string, locale: 'en' | 'id' | 'zh-CN'): FactsContext {
  return {
    ticker,
    sessionDate,
    cutoffAt: sessionAvailableAt(sessionDate),
    periodStart: data.defaultWindow.start,
    periodEnd: data.defaultWindow.end,
    scenario: 'default',
    locale,
    dataVersion: data.versions.data,
    taxonomyVersion: data.versions.taxonomy,
    claimVersion: data.versions.claims,
  };
}

function FeedRow({
  item,
  statement = null,
  tracked,
  onOpen,
  onFollow,
  onEvidence,
}: {
  item: FeedItem;
  statement?: readonly RenderedPart[] | null;
  tracked: boolean;
  onOpen: (ticker: string, sessionDate: string) => void;
  onFollow: () => void;
  onEvidence: (ticker: string, sessionDate: string, factId: string, trigger: HTMLButtonElement) => void;
}) {
  const { t, locale } = useTranslation();
  const instrument = findInstrument(item.ticker);
  const name = instrument !== null ? instrumentNameText(instrument.name, locale) : item.ticker;
  const formatLots = (value: number) =>
    new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0, signDisplay: 'exceptZero' }).format(value);

  return (
    <li>
      <article aria-label={item.ticker} className="card card-pad">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight tabular-nums">{item.ticker}</h2>
            <span className="text-sm text-muted">{name}</span>
            <DataModeChip mode={item.dataset} />
          </div>
          {item.kind === 'change' ? (
            <p className="text-xs tabular-nums text-mutedSoft">
              {t('stocks.changeDates', {
                to: formatSessionDate(item.toDate, locale),
                from: formatSessionDate(item.fromDate, locale),
              })}
            </p>
          ) : (
            <p className="text-xs tabular-nums text-mutedSoft">{formatSessionDate(item.publicationDate, locale)}</p>
          )}
        </div>

        {item.kind === 'change' ? (
          <>
            <p className="mt-2 text-sm font-medium leading-relaxed">
              {statement !== null ? (
                <StatementParts
                  parts={statement}
                  onEvidence={(factId, trigger) => onEvidence(item.ticker, item.toDate, factId, trigger)}
                />
              ) : (
                t(COMPARE_KEY[item.compare], { group: t(GROUP_KEY[item.group]) })
              )}
            </p>
            <p className="mt-1.5 text-sm tabular-nums">
              <EvidenceButton
                factId={item.factId}
                onActivate={(factId, trigger) => onEvidence(item.ticker, item.toDate, factId, trigger)}
              >
                {t('stocks.changeLots', { from: formatLots(item.fromLots), to: formatLots(item.toLots) })}
              </EvidenceButton>
            </p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm font-medium leading-relaxed">{item.text}</p>
            <p className="mt-1.5 text-xs">
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-brandDeep underline decoration-dotted underline-offset-4 hover:text-brand"
              >
                {item.sourceName}
              </a>
            </p>
          </>
        )}

        <p className="note mt-2">
          {item.kind === 'change'
            ? t('stocks.whyChange', {
                ticker: item.ticker,
                group: t(GROUP_KEY[item.group]),
                from: formatSessionDate(item.fromDate, locale),
                to: formatSessionDate(item.toDate, locale),
              })
            : t('stocks.whyEvent', { ticker: item.ticker })}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {item.kind === 'change' ? (
            <button type="button" className="btn btn-quiet px-3 py-1.5 text-xs" onClick={() => onOpen(item.ticker, item.toDate)}>
              {t('card.openFull')}
            </button>
          ) : (
            <Link to={`/stock/${item.ticker}`} className="btn btn-quiet px-3 py-1.5 text-xs">
              {t('card.openFull')}
            </Link>
          )}
          {tracked ? (
            <span className="chip chip-line">
              <Icon name="check" className="h-3.5 w-3.5" />
              {t('stocks.following')}
            </span>
          ) : (
            <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={onFollow}>
              <Icon name="plus" className="h-3.5 w-3.5" />
              {t('stocks.follow')}
            </button>
          )}
        </div>
      </article>
    </li>
  );
}

// Renders the reviewed claim parts; any value part keeps its evidence action so
// a number in the sentence opens the same drawer as the numeric row below it.
function StatementParts({
  parts,
  onEvidence,
}: {
  parts: readonly RenderedPart[];
  onEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <>
      {parts.map((part, index) =>
        part.kind === 'value' && part.factId ? (
          <EvidenceButton key={index} factId={part.factId} onActivate={onEvidence}>
            {part.text}
          </EvidenceButton>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function RegistryRow({
  instrument,
  tracked,
  onAdd,
}: {
  instrument: Instrument;
  tracked: boolean;
  onAdd: () => void;
}) {
  const { t, locale } = useTranslation();
  return (
    <li className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight tabular-nums">{instrument.ticker}</h3>
            <DataModeChip mode={instrument.dataMode} />
          </div>
          <p className="mt-1 text-sm text-muted">{instrumentNameText(instrument.name, locale)}</p>
          <p className="mt-0.5 text-xs text-mutedSoft">{instrumentExchange(instrument, locale)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {instrument.hasBrokerDataset ? (
            <Link to={`/stock/${instrument.ticker}`} className="btn btn-quiet px-3 py-1.5 text-xs">
              {t('card.openFull')}
            </Link>
          ) : null}
          {tracked ? (
            <span className="chip chip-line">
              <Icon name="check" className="h-3.5 w-3.5" />
              {t('stocks.following')}
            </span>
          ) : (
            <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={onAdd}>
              <Icon name="plus" className="h-3.5 w-3.5" />
              {t('stocks.follow')}
            </button>
          )}
        </div>
      </div>
      {instrument.hasBrokerDataset ? null : (
        <p className="note mt-3">{t('portfolio.providerNote')}</p>
      )}
    </li>
  );
}

function DatasetDetails({ instrument, state, cutoff }: { instrument: Instrument; state: InstrumentFeed; cutoff: string | null }) {
  const { t, locale } = useTranslation();
  if (state.state.status !== 'ready') {
    return (
      <div className="card-inset p-3">
        <p className="text-sm font-semibold tabular-nums">{instrument.ticker}</p>
        <p className="note mt-1">
          {state.state.status === 'error'
            ? t('card.sampleDatasetUnavailable', { ticker: instrument.ticker })
            : t('states.loading')}
        </p>
      </div>
    );
  }
  const data = state.state.data;
  const { start, end } = data.defaultWindow;
  // Data details are part of the replay too: sessions, rows, events and the
  // missing/excluded lists only count information eligible at the active
  // cutoff, so an earlier snapshot never exposes later coverage.
  const eligibleAtCutoff = (date: string) =>
    cutoff === null || Date.parse(sessionAvailableAt(date)) <= Date.parse(cutoff);
  const inWindow = data.sessions.filter(
    (session) => session.date >= start && session.date <= end && eligibleAtCutoff(session.date),
  );
  const captured = inWindow.filter((session) => session.status === 'captured').length;
  const expected = inWindow.filter(
    (session) => session.status === 'captured' || session.status === 'missing' || session.status === 'excluded',
  ).length;
  const missing = inWindow.filter((session) => session.status === 'missing').map((session) => session.date);
  const excluded = inWindow.filter((session) => session.status === 'excluded').map((session) => session.date);
  const rows = data.rows.filter((row) => row.date >= start && row.date <= end && eligibleAtCutoff(row.date)).length;
  const eventCount =
    cutoff === null ? data.events.length : data.events.filter((event) => isEventAvailableAtCutoff(event, cutoff)).length;
  const formatDateList = (dates: readonly string[]) => dates.map((date) => formatSessionDate(date, locale)).join(', ');
  return (
    <div className="card-inset p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm font-semibold tabular-nums">{instrument.ticker}</p>
        <p className="text-xs tabular-nums text-muted">
          {t('stocks.coverageValue', { captured: String(captured), expected: String(expected) })}
        </p>
      </div>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        <div className="flex justify-between gap-3 border-b border-line pb-1">
          <dt className="text-muted">{t('stocks.detailRows')}</dt>
          <dd className="font-medium tabular-nums">{rows}</dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-line pb-1">
          <dt className="text-muted">{t('stocks.detailEvents')}</dt>
          <dd className="font-medium tabular-nums">{eventCount}</dd>
        </div>
        {missing.length > 0 ? (
          <div className="flex flex-wrap justify-between gap-3 sm:col-span-2">
            <dt className="text-muted">{t('stocks.detailMissing')}</dt>
            <dd className="tabular-nums">{formatDateList(missing)}</dd>
          </div>
        ) : null}
        {excluded.length > 0 ? (
          <div className="flex flex-wrap justify-between gap-3 sm:col-span-2">
            <dt className="text-muted">{t('stocks.detailExcluded')}</dt>
            <dd className="tabular-nums">{formatDateList(excluded)}</dd>
          </div>
        ) : null}
      </dl>
      <p className="note mt-2">{t('stocks.dataIntro')}</p>
    </div>
  );
}
