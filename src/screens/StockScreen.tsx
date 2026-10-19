import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { CompanyHealth } from '../components/CompanyHealth';
import { CompanyLogo } from '../components/CompanyLogo';
import { DataModeChip } from '../components/DataModeChip';
import { DateCalendar } from '../components/DateCalendar';
import { Disclaimer } from '../components/Disclaimer';
import { EvidenceButton } from '../components/EvidenceButton';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { groupColour, groupDotStyle } from '../components/groupColours';
import { BrokerTrends, SessionSankeyCard } from '../components/InstrumentCard';
import { buildSessionFlow, type SessionFlow } from '../components/charts/SessionSankey';
import { PurchaseDialog } from '../components/PortfolioDialogs';
import { StateBlock } from '../components/StateBlock';
import { findInstrument, instrumentExchange, instrumentName, instrumentNameText } from '../data/instruments';
import { useSessionClose } from '../data/portfolioPrices';
import { usePublicData, type PublicData } from '../data/publicData';
import { findHealthReport } from '../data/companyHealth';
import { summarizeFlows } from '../engine/insights';
import { conclusion, implications, observedBullets, ui, type AnalysisInput, type Seg } from '../i18n/analysisCopy';
import { currencyOf, formatPrice } from '../data/money';
import type { BrokerGroup } from '../data/schemas';
import { briefMorningDates } from '../engine/brief';
import type { Locale } from '../engine/context';
import { buildEvidenceView, type EvidenceView } from '../engine/evidence';
import type { FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { buildStockView, type EventView, type RankingEntryView, type StockView } from '../engine/stockView';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { useContextStore, type PortfolioEntry } from '../store/contextStore';

type FlowGroupKey = BrokerGroup;

type EvidenceLayer = { factId: string; trigger: HTMLButtonElement | null };

// A calendar date with no broker rows: a holiday, a session that was not
// captured, or one excluded from the dataset.
type NoDataDay = { date: string; status: 'holiday' | 'missing' | 'excluded' };

const NO_DATA_KEY: Record<NoDataDay['status'], 'stock.noDataHoliday' | 'stock.noDataMissing' | 'stock.noDataExcluded'> = {
  holiday: 'stock.noDataHoliday',
  missing: 'stock.noDataMissing',
  excluded: 'stock.noDataExcluded',
};

// Brokers listed per side. Early in the window fewer than ten brokers have net
// bought or sold, so five keeps the lists full on every date.
const RANKING_SIZE = 5;
// Events published in this many days up to the selected session.
const EVENT_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

const FLOW_GROUPS: readonly FlowGroupKey[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

// The stock analysis page, reached from the Stocks list and the Brief lists. One
// header card (stock, close, calendar), then the flow card on the left and the
// chart, events and observations on the right. The calendar shares its session
// with the Brief, so either screen opens on the other's date.
export function StockScreen() {
  const { ticker: routeTicker } = useParams<{ ticker: string }>();
  const { t, locale } = useTranslation();
  const setTicker = useContextStore((state) => state.setTicker);
  const ticker = useContextStore((state) => state.ticker);
  const selectedSessionDate = useContextStore((state) => state.selectedSessionDate);
  const periodStart = useContextStore((state) => state.periodStart);
  const periodEnd = useContextStore((state) => state.periodEnd);
  const selectSession = useContextStore((state) => state.selectSession);
  const setBriefDate = useContextStore((state) => state.setBriefDate);
  const setPeriod = useContextStore((state) => state.setPeriod);
  const setViewSnapshot = useContextStore((state) => state.setViewSnapshot);

  useEffect(() => {
    if (routeTicker) setTicker(routeTicker);
  }, [routeTicker, setTicker]);

  useEffect(() => {
    setViewSnapshot(`/stock/${ticker}`, selectedSessionDate);
  }, [ticker, selectedSessionDate, setViewSnapshot]);

  // Registry instruments without a reviewed dataset never start a fetch:
  // the expected case renders its honest unavailable card below instead of a
  // raw 404 parse message. Unknown tickers keep the fetching error path.
  const instrument = findInstrument(ticker);
  const state = usePublicData(instrument !== null && !instrument.hasBrokerDataset ? null : ticker);
  // A no-data date picked on the calendar. It is shown, not analysed, so the
  // shared session (and the Brief) stays on the last session with data.
  const [noDataDay, setNoDataDay] = useState<NoDataDay | null>(null);
  useEffect(() => {
    setNoDataDay(null);
  }, [ticker]);
  const close = useSessionClose(ticker, noDataDay?.date ?? selectedSessionDate, periodStart);

  // The shared date can land on a day this stock has no broker rows for (a
  // China stock is only listed on big-move days), so show the no-data card
  // then too, with the dataset's own reason.
  const sharedSession =
    state.status === 'ready' && selectedSessionDate !== null
      ? state.data.sessions.find((session) => session.date === selectedSessionDate)
      : undefined;
  const shownNoData: (NoDataDay & { reason?: string }) | null =
    noDataDay ??
    (sharedSession !== undefined && sharedSession.status !== 'captured' && sharedSession.status !== 'weekend'
      ? { date: sharedSession.date, status: sharedSession.status, reason: sharedSession.reason }
      : null);

  useEffect(() => {
    if (state.status === 'ready' && (periodStart === null || periodEnd === null)) {
      setPeriod(state.data.defaultWindow.start, state.data.defaultWindow.end);
    }
  }, [state, periodStart, periodEnd, setPeriod]);

  const capturedSessions = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.sessions
      .filter((session) => session.status === 'captured')
      .map((session) => session.date)
      .sort();
  }, [state]);

  // Every trading-calendar date is selectable; only captured ones have analysis.
  const calendarDays = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.sessions
      .filter((session) => session.status !== 'weekend')
      .map((session) => session.date)
      .sort();
  }, [state]);

  const mornings = useMemo(
    () => (state.status === 'ready' ? briefMorningDates(state.data.sessions) : []),
    [state],
  );

  useEffect(() => {
    if (selectedSessionDate === null && capturedSessions.length > 0) {
      const last = capturedSessions[capturedSessions.length - 1];
      if (last) selectSession(last);
    }
  }, [selectedSessionDate, capturedSessions, selectSession]);

  // Picking a session here also moves the Brief to the morning that reads it.
  const pickSession = (date: string) => {
    const session = state.status === 'ready' ? state.data.sessions.find((entry) => entry.date === date) : undefined;
    if (session !== undefined && session.status !== 'captured' && session.status !== 'weekend') {
      setNoDataDay({ date, status: session.status });
      return;
    }
    setNoDataDay(null);
    selectSession(date);
    const morning = mornings.find((entry) => entry > date);
    if (morning !== undefined) setBriefDate(morning);
  };

  const factsContext = useMemo<FactsContext | null>(() => {
    if (state.status !== 'ready' || selectedSessionDate === null || periodStart === null || periodEnd === null) {
      return null;
    }
    return {
      ticker,
      sessionDate: selectedSessionDate,
      cutoffAt: sessionAvailableAt(selectedSessionDate),
      periodStart,
      periodEnd,
      scenario: 'default',
      locale,
      dataVersion: state.data.versions.data,
      taxonomyVersion: state.data.versions.taxonomy,
      claimVersion: state.data.versions.claims,
    };
  }, [state, ticker, selectedSessionDate, periodStart, periodEnd, locale]);

  const view = useMemo(
    () => (factsContext !== null && state.status === 'ready' ? buildStockView(factsContext, state.data) : null),
    [factsContext, state],
  );

  const [evidence, setEvidence] = useState<EvidenceLayer | null>(null);
  useEffect(() => {
    setEvidence(null);
  }, [selectedSessionDate, ticker]);

  const evidenceFactId = evidence?.factId ?? null;
  const evidenceView: EvidenceView | null = useMemo(
    () =>
      evidenceFactId !== null && factsContext !== null && state.status === 'ready'
        ? buildEvidenceView(evidenceFactId, factsContext, state.data, locale)
        : null,
    [evidenceFactId, factsContext, state, locale],
  );

  const openEvidence = (factId: string, trigger: HTMLElement) =>
    setEvidence({ factId, trigger: trigger instanceof HTMLButtonElement ? trigger : null });

  if (instrument !== null && !instrument.hasBrokerDataset) {
    return (
      <section aria-labelledby="stock-title" className="space-y-3">
        <header id="stock-header" className="card px-4 py-4 sm:px-5">
          <StockIdentity
            logo={<CompanyLogo ticker={instrument.ticker} name={instrumentNameText(instrument.name, locale)} />}
            title={`${instrument.ticker} · ${instrumentNameText(instrument.name, locale)}`}
            chip={<DataModeChip mode={instrument.dataMode} />}
            subline={instrumentExchange(instrument, locale)}
          />
        </header>
        <Disclaimer>
          {t('card.unavailableAnalysis', { ticker: instrument.ticker })}{' '}
          {instrument.dataMode === 'sample' ? t('dataMode.sampleNote') : ''}
        </Disclaimer>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-labelledby="stock-title">
        <h1 id="stock-title" className="text-2xl font-semibold tracking-tight">
          {t('stock.title')} · {ticker}
        </h1>
        <div className="mt-6">
          <StateBlock title={t('states.error')} body={state.message} />
        </div>
      </section>
    );
  }

  if (state.status === 'loading' || view === null) {
    return (
      <section aria-labelledby="stock-title">
        <h1 id="stock-title" className="text-2xl font-semibold tracking-tight">
          {t('stock.title')} · {ticker}
        </h1>
        <div className="mt-6">
          <StateBlock title={t('states.loading')} />
        </div>
      </section>
    );
  }

  const recentEvents = recentEventsFor(view);
  const currency = currencyOf(view.ticker);
  const companyName = instrumentName(view.ticker, locale, t('stock.companyName'));
  const analysis = buildAnalysisInput(view, state.data, close, locale, currency);
  const observed = analysis !== null ? observedBullets(analysis, locale) : [];
  const implicationText = analysis !== null ? implications(analysis, locale) : '';
  const dayFlow = buildSessionFlow(state.data, view.selectedSessionDate);

  return (
    <section aria-labelledby="stock-title" className="space-y-3">
      <header id="stock-header" className="card flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
        <StockIdentity
          logo={<CompanyLogo ticker={view.ticker} name={companyName} />}
          title={`${view.ticker} · ${companyName}`}
          chip={<DataModeChip mode={instrument?.dataMode ?? 'verified'} />}
          subline={
            <>
              <CloseBlock close={close} currency={currency} />
              {analysis !== null ? (
                <p data-testid="stock-conclusion" className="mt-3 max-w-xl text-sm leading-relaxed text-ink">
                  {conclusion(analysis, locale)}
                </p>
              ) : null}
              <WatchActions ticker={view.ticker} currency={currency} />
            </>
          }
        />
        <DateCalendar
          dates={calendarDays}
          selected={shownNoData?.date ?? view.selectedSessionDate}
          onSelect={pickSession}
          label={t('stock.calendarLabel')}
        />
      </header>

      {shownNoData !== null ? (
        <article className="card px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">
            {t('stock.noDataTitle', { date: formatSessionDate(shownNoData.date, locale) })}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {shownNoData.reason?.includes('Dragon Tiger') ? t('stock.noDataDragonTiger') : t(NO_DATA_KEY[shownNoData.status])}
          </p>
        </article>
      ) : (
        <>
          {factsContext !== null && state.status === 'ready' ? (
            <Panel id="stock-broker-flow" title={t('stock.brokerFlowTitle')}>
              <BrokerTrends
                key={`${ticker}-${view.selectedSessionDate}`}
                context={factsContext}
                data={state.data}
                locale={locale}
                onOpenEvidence={openEvidence}
              />
            </Panel>
          ) : null}

          {/* Both columns end on the same line: the grid stretches the shorter
              side, and on the right the observations card takes up the slack. */}
          <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Panel title={ui(locale).flowTitle(formatSessionDate(view.selectedSessionDate, locale))}>
              <FlowPanel flow={dayFlow} />
            </Panel>

            <div className="flex flex-col gap-3">
              <Panel title={t('stock.sessionFlowTitle')}>
                <SessionSankeyCard data={state.data} date={view.selectedSessionDate} locale={locale} />
              </Panel>

              <Panel title={t('stock.observedTitle')} className="flex-1">
                {analysis !== null && observed.length > 0 ? (
                  <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink marker:text-mutedSoft">
                    {observed.map((bullet, index) => (
                      <li key={index}>
                        <SegParts parts={bullet} onOpenEvidence={openEvidence} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{t('states.empty')}</p>
                )}
                <h2 className="mt-5 text-sm font-semibold tracking-tight">{ui(locale).implicationsTitle}</h2>
                <p className="mt-2 text-sm leading-relaxed text-ink">{implicationText}</p>
              </Panel>
            </div>
          </div>

          <Panel id="stock-health" title={t('health.title')}>
            <CompanyHealth ticker={view.ticker} sessionDate={view.selectedSessionDate} healthEvents={view.health} />
          </Panel>

          <Panel title={t('stock.eventsTitle', { days: String(EVENT_WINDOW_DAYS) })}>
            <EventList events={recentEvents} />
          </Panel>
        </>
      )}

      {evidence && evidenceView ? (
        <EvidenceDrawer
          view={evidenceView}
          cutoffAt={sessionAvailableAt(view.selectedSessionDate)}
          trigger={evidence.trigger}
          onClose={() => setEvidence(null)}
        />
      ) : null}
    </section>
  );
}

// What the text on the page is built from: group totals up to the selected
// session, the biggest broker on each side, the price move over the window and
// the latest report once it was public.
function buildAnalysisInput(
  view: StockView,
  data: PublicData,
  close: ReturnType<typeof useSessionClose>,
  locale: Locale,
  currency: string,
): AnalysisInput | null {
  const summary = summarizeFlows(data, view.selectedSessionDate);
  if (summary === null || !view.flow.available) return null;
  const lotsOf = (group: BrokerGroup) => view.flow.groups.find((entry) => entry.group === group);
  const nets = {
    app_facing: lotsOf('app_facing')?.lots ?? summary.nets.app_facing,
    institution_facing: lotsOf('institution_facing')?.lots ?? summary.nets.institution_facing,
    other_mixed: lotsOf('other_mixed')?.lots ?? summary.nets.other_mixed,
  };
  const netFacts = {
    app_facing: lotsOf('app_facing')?.factId ?? '',
    institution_facing: lotsOf('institution_facing')?.factId ?? '',
    other_mixed: lotsOf('other_mixed')?.factId ?? '',
  };
  const priceChange =
    close.status === 'ready' && close.close.windowStartClose !== null
      ? close.close.close / close.close.windowStartClose - 1
      : null;
  const report = findHealthReport(view.ticker);
  const health =
    report !== null && view.selectedSessionDate >= report.availableFrom
      ? {
          equityPositive: report.balance.totalEquity > 0,
          equityImproving: report.balance.totalEquity >= report.priorBalance.totalEquity,
          coreProfit: report.results.profitBeforeTax - report.results.oneOffGain >= 0,
          oneOff: report.results.oneOffGain !== 0,
        }
      : null;
  const top = (entry: RankingEntryView | undefined) =>
    entry ? { code: entry.brokerCode, lots: entry.netLots, factId: entry.factId } : null;
  return {
    since: summary.start,
    nets,
    netFacts,
    recentNets: summary.recentNets,
    topBuyer: top(view.flow.topBuyers[0]),
    topSeller: top(view.flow.topSellers[0]),
    priceChange,
    closeText: close.status === 'ready' ? formatPrice(close.close.close, currency, locale) : null,
    health,
  };
}

// Story and health events published in the window up to the selected session,
// newest first. The view has already dropped anything published after it.
function recentEventsFor(view: StockView): EventView[] {
  const end = Date.parse(`${view.selectedSessionDate}T00:00:00Z`);
  const start = end - EVENT_WINDOW_DAYS * DAY_MS;
  return [...view.story, ...view.health]
    .filter((event) => Date.parse(`${event.publicationDate}T00:00:00Z`) > start)
    .sort((a, b) => b.publicationDate.localeCompare(a.publicationDate));
}

function StockIdentity({
  logo,
  title,
  chip,
  subline,
}: {
  logo: ReactNode;
  title: string;
  chip: ReactNode;
  subline: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 basis-[20rem]">
      <div className="flex items-center gap-3">
        {logo}
        <div className="min-w-0">
          <h1 id="stock-title" className="text-lg font-semibold tracking-tight lg:text-xl">
            {title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">{chip}</div>
        </div>
      </div>
      <div className="mt-4">{subline}</div>
    </div>
  );
}

// Add to Watchlist / Add to Portfolio. A held stock shows only the portfolio
// chip; a watchlisted one still offers the portfolio button.
function WatchActions({ ticker, currency }: { ticker: string; currency: string }) {
  const { locale } = useTranslation();
  const copy = ui(locale);
  const portfolio = useContextStore((state) => state.portfolio) as PortfolioEntry[] | undefined;
  const addHolding = useContextStore((state) => state.addHolding);
  const recordPurchase = useContextStore((state) => state.recordPurchase);
  const entry = portfolio?.find((item) => item.ticker === ticker) ?? null;
  const [buying, setBuying] = useState(false);
  const buyRef = useRef<HTMLButtonElement>(null);
  const owned = entry?.list === 'owned';
  const watched = entry?.list === 'watchlist';

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-currency={currency}>
      {owned ? (
        <span className="chip chip-line gap-1.5 text-ink">
          <span aria-hidden="true" className="font-bold text-buy">✓</span>
          {copy.addedPortfolio}
        </span>
      ) : (
        <>
          {watched ? (
            <span className="chip chip-line gap-1.5 text-ink">
              <span aria-hidden="true" className="font-bold text-buy">✓</span>
              {copy.addedWatchlist}
            </span>
          ) : (
            <button type="button" onClick={() => addHolding(ticker, 'watchlist')} className="btn btn-quiet px-3 py-1.5 text-xs">
              {copy.addWatchlist}
            </button>
          )}
          <button
            ref={buyRef}
            type="button"
            onClick={() => setBuying(true)}
            aria-haspopup="dialog"
            className="btn btn-primary px-3 py-1.5 text-xs"
          >
            {copy.addPortfolio}
          </button>
        </>
      )}
      {buying ? (
        <PurchaseDialog
          ticker={ticker}
          entry={entry}
          trigger={buyRef.current}
          onCancel={() => setBuying(false)}
          onSave={(purchase) => {
            recordPurchase(ticker, purchase);
            setBuying(false);
          }}
        />
      ) : null}
    </div>
  );
}

// The last close in large type, with the move against the session before.
function CloseBlock({ close, currency }: { close: ReturnType<typeof useSessionClose>; currency: string }) {
  const { t, locale } = useTranslation();
  if (close.status === 'loading') return <p className="text-sm text-muted">{t('states.loading')}</p>;
  if (close.status === 'unavailable') return <p className="text-sm text-muted">{t('stock.closeUnavailable')}</p>;
  const { close: price, date, previousClose, basis } = close.close;
  const change = previousClose !== null ? price - previousClose : null;
  return (
    <div>
      <p className="eyebrow">
        {t('stock.closeLabel')} · {formatSessionDate(date, locale)}
        {basis === 'sample-fixture-daily' ? ` · ${t('stock.closeSample')}` : ''}
      </p>
      <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-ink">{formatPrice(price, currency, locale)}</p>
      {change !== null && previousClose !== null ? (
        <p className={`mt-1 text-sm font-semibold tabular-nums ${signedClass(change)}`}>
          {change >= 0 ? '+' : '−'}
          {formatPrice(Math.abs(change), currency, locale).replace(/^−/, '')} ({change >= 0 ? '+' : '−'}
          {new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(Math.abs((change / previousClose) * 100))}%)
          <span className="ml-1.5 font-normal text-muted">{t('stock.closeVsPrevious')}</span>
        </p>
      ) : null}
    </div>
  );
}

// The flow card for the selected day. It reads the same SessionFlow as the
// Sankey, so the group nets (with the Unclassified remainder) and the top
// brokers are the same numbers by construction.
function FlowPanel({ flow }: { flow: SessionFlow | null }) {
  const { t, locale } = useTranslation();

  if (flow === null || flow.total === 0) {
    return <StateBlock title={t('states.unavailable')} />;
  }

  return (
    <div className="space-y-5">
      <p className="note -mt-1">{ui(locale).flowSubtitle}</p>
      <ul className="divide-y divide-line">
        {FLOW_GROUPS.map((group) => (
          <li key={group} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0">
            <span className="flex min-w-0 items-center gap-2 font-medium text-ink">
              <span aria-hidden="true" data-group-colour={groupColour(group)} style={groupDotStyle(group, 12)} />
              <span className="truncate">{t(GROUP_KEY[group])}</span>
            </span>
            <span className={`shrink-0 tabular-nums ${signedClass(flow.nets[group])}`}>
              {formatSigned(flow.nets[group], locale)} {t('stock.flowLotsUnit')}
            </span>
          </li>
        ))}
      </ul>
      <RankingList title={t('stock.flowTopBuyers')} entries={flow.topBuyers.slice(0, RANKING_SIZE)} />
      <RankingList title={t('stock.flowTopSellers')} entries={flow.topSellers.slice(0, RANKING_SIZE)} />
      <Disclaimer>{t('stock.flowLotsNote')}</Disclaimer>
    </div>
  );
}

const GROUP_KEY: Record<FlowGroupKey, 'stock.groupApp' | 'stock.groupInstitution' | 'stock.groupOther' | 'stock.groupUnknown'> = {
  app_facing: 'stock.groupApp',
  institution_facing: 'stock.groupInstitution',
  other_mixed: 'stock.groupOther',
  unknown: 'stock.groupUnknown',
};

function RankingList({ title, entries }: { title: string; entries: SessionFlow['topBuyers'] }) {
  const { locale } = useTranslation();
  const { t } = useTranslation();

  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <ol className="mt-2 divide-y divide-line">
        {entries.map((entry, index) => (
          <li key={entry.code} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-mutedSoft">{index + 1}</span>
              <span aria-hidden="true" data-group-colour={groupColour(entry.group)} style={groupDotStyle(entry.group, 9)} />
              <span className="font-semibold text-ink">{entry.code}</span>
            </span>
            <span className={`shrink-0 tabular-nums ${signedClass(entry.lots)}`}>
              {formatSigned(entry.lots, locale)} {t('stock.flowLotsUnit')}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function EventList({ events }: { events: EventView[] }) {
  const { t, locale } = useTranslation();

  if (events.length === 0) {
    return <p className="text-sm text-muted">{t('stock.noRecentEvents', { days: String(EVENT_WINDOW_DAYS) })}</p>;
  }

  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="card-inset border-l-2 border-l-brand/70 p-3">
          <p className="eyebrow">{formatSessionDate(event.publicationDate, locale)}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{event.text}</p>
          <p className="mt-1.5 text-xs">
            <a
              href={event.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brandDeep underline decoration-dotted underline-offset-4 hover:text-brand"
            >
              {event.sourceName}
            </a>
          </p>
        </li>
      ))}
    </ul>
  );
}

const TONE_CLASS: Record<string, string> = {
  buy: 'font-semibold text-buy',
  sell: 'font-semibold text-sell',
  neutral: '',
};

function SegParts({
  parts,
  onOpenEvidence,
}: {
  parts: Seg[];
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <>
      {parts.map((part, index) =>
        part.factId ? (
          <EvidenceButton
            key={index}
            factId={part.factId}
            className={TONE_CLASS[part.tone ?? 'neutral']}
            onActivate={onOpenEvidence}
          >
            {part.text}
          </EvidenceButton>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

function Panel({ id, title, children, className = '' }: { id?: string; title: string; children: ReactNode; className?: string }) {
  return (
    <article id={id} aria-label={title} className={`card scroll-mt-20 px-4 py-4 sm:px-5 ${className}`}>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </article>
  );
}

function signedClass(value: number): string {
  if (value > 0) return 'font-semibold text-buy';
  if (value < 0) return 'font-semibold text-sell';
  return 'font-semibold text-muted';
}

function formatSigned(value: number, locale: Locale): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatInt(Math.abs(value), locale)}`;
}

function formatInt(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
}
