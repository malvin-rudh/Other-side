import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { RenderedPart } from '../ai/claims';
import { CompanyHealth } from '../components/CompanyHealth';
import { DataModeChip } from '../components/DataModeChip';
import { DateCalendar } from '../components/DateCalendar';
import { Disclaimer } from '../components/Disclaimer';
import { EvidenceButton } from '../components/EvidenceButton';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { BrokerTrends, SessionFlowChart } from '../components/InstrumentCard';
import { StateBlock } from '../components/StateBlock';
import { findInstrument, instrumentExchange, instrumentName, instrumentNameText } from '../data/instruments';
import { useSessionClose } from '../data/portfolioPrices';
import { usePublicData, type PublicData } from '../data/publicData';
import { findHealthReport } from '../data/companyHealth';
import { summarizeFlows } from '../engine/insights';
import { interpretation } from '../i18n/insightCopy';
import { briefMorningDates } from '../engine/brief';
import type { Locale } from '../engine/context';
import { buildEvidenceView, type EvidenceView } from '../engine/evidence';
import type { FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { buildStockView, type EventView, type RankingEntryView, type StockView } from '../engine/stockView';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';

type FlowGroupKey = StockView['flow']['groups'][number]['group'];

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
// Observed claims shown as bullets; the rest of the registry stays behind evidence.
const MAX_OBSERVED = 10;
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
  const interpretationLines = readFlows(view, state.data, close, locale);

  return (
    <section aria-labelledby="stock-title" className="space-y-3">
      <header id="stock-header" className="card flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
        <StockIdentity
          title={`${view.ticker} · ${instrumentName(view.ticker, locale, t('stock.companyName'))}`}
          chip={<DataModeChip mode={instrument?.dataMode ?? 'verified'} />}
          subline={<CloseBlock close={close} />}
        />
        <DateCalendar
          dates={calendarDays}
          selected={noDataDay?.date ?? view.selectedSessionDate}
          onSelect={pickSession}
          label={t('stock.calendarLabel')}
        />
      </header>

      {noDataDay !== null ? (
        <article className="card px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight">
            {t('stock.noDataTitle', { date: formatSessionDate(noDataDay.date, locale) })}
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(NO_DATA_KEY[noDataDay.status])}</p>
        </article>
      ) : (
        <>
          {factsContext !== null && state.status === 'ready' ? (
            <Panel title={t('stock.brokerFlowTitle')}>
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
            <Panel title={t('stock.flowTitle')}>
              <FlowPanel view={view} onOpenEvidence={openEvidence} />
            </Panel>

            <div className="flex flex-col gap-3">
              <Panel title={t('stock.sessionFlowTitle')}>
                <SessionFlowChart view={view} locale={locale} onOpenEvidence={openEvidence} />
              </Panel>

              <Panel title={t('stock.observedTitle')} className="flex-1">
                {view.card.observed.length > 0 ? (
                  <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink marker:text-mutedSoft">
                    {view.card.observed.slice(0, MAX_OBSERVED).map((claim) => (
                      <li key={claim.claimId}>
                        <ClaimParts parts={claim.parts} onOpenEvidence={openEvidence} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">{t('states.empty')}</p>
                )}
                <h2 className="mt-5 text-sm font-semibold tracking-tight">{t('stock.interpretedTitle')}</h2>
                <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink">
                  {interpretationLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </Panel>
            </div>
          </div>

          <Panel title={t('health.title')}>
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

// The "What could be interpreted?" reading: broker-group totals up to the
// selected session, the price move over the window, and the latest report once
// it was public.
function readFlows(
  view: StockView,
  data: PublicData,
  close: ReturnType<typeof useSessionClose>,
  locale: Locale,
): string[] {
  const summary = summarizeFlows(data, view.selectedSessionDate);
  if (summary === null) return [];
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
  return interpretation({ summary, priceChange, health }, locale);
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

function StockIdentity({ title, chip, subline }: { title: string; chip: ReactNode; subline: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-full bg-brand" />
        <h1 id="stock-title" className="text-lg font-semibold tracking-tight lg:text-xl">
          {title}
        </h1>
        {chip}
      </div>
      <div className="mt-4">{subline}</div>
    </div>
  );
}

// The last close in large type, with the move against the session before.
function CloseBlock({ close }: { close: ReturnType<typeof useSessionClose> }) {
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
      <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums text-ink">Rp{formatInt(price, locale)}</p>
      {change !== null && previousClose !== null ? (
        <p className={`mt-1 text-sm font-semibold tabular-nums ${signedClass(change)}`}>
          {formatSigned(change, locale)} ({change >= 0 ? '+' : '−'}
          {new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(Math.abs((change / previousClose) * 100))}%)
          <span className="ml-1.5 font-normal text-muted">{t('stock.closeVsPrevious')}</span>
        </p>
      ) : null}
    </div>
  );
}

function FlowPanel({
  view,
  onOpenEvidence,
}: {
  view: StockView;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const { t, locale } = useTranslation();
  const flow = view.flow;

  if (!flow.available) {
    return <StateBlock title={t('states.unavailable')} />;
  }

  const groups = flow.groups.filter((group) => FLOW_GROUPS.includes(group.group));

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-line">
        {groups.map((group) => (
          <li key={group.group} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0">
            <span className="font-medium text-ink">{t(GROUP_KEY[group.group])}</span>
            <EvidenceButton
              factId={group.factId}
              className={`shrink-0 tabular-nums ${signedClass(group.lots)}`}
              onActivate={onOpenEvidence}
            >
              {formatSigned(group.lots, locale)} {t('stock.flowLotsUnit')}
            </EvidenceButton>
          </li>
        ))}
      </ul>
      <RankingList
        title={t('stock.flowTopBuyers')}
        entries={flow.topBuyers.slice(0, RANKING_SIZE)}
        onOpenEvidence={onOpenEvidence}
      />
      <RankingList
        title={t('stock.flowTopSellers')}
        entries={flow.topSellers.slice(0, RANKING_SIZE)}
        onOpenEvidence={onOpenEvidence}
      />
      <Disclaimer>{t('stock.flowLotsNote')}</Disclaimer>
    </div>
  );
}

const GROUP_KEY: Record<FlowGroupKey, 'stock.groupApp' | 'stock.groupInstitution' | 'stock.groupOther' | 'stock.groupUnknown' | 'stock.groupResidual'> = {
  app_facing: 'stock.groupApp',
  institution_facing: 'stock.groupInstitution',
  other_mixed: 'stock.groupOther',
  unknown: 'stock.groupUnknown',
  residual: 'stock.groupResidual',
};

function RankingList({
  title,
  entries,
  onOpenEvidence,
}: {
  title: string;
  entries: RankingEntryView[];
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const { t, locale } = useTranslation();

  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <ol className="mt-2 divide-y divide-line">
        {entries.map((entry, index) => (
          <li key={entry.brokerCode} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="w-5 shrink-0 text-right text-xs tabular-nums text-mutedSoft">{index + 1}</span>
              <span className="font-semibold text-ink">{entry.brokerCode}</span>
            </span>
            <EvidenceButton
              factId={entry.factId}
              className={`shrink-0 tabular-nums ${signedClass(entry.netLots)}`}
              onActivate={onOpenEvidence}
            >
              {entry.netLots > 0 ? '+' : ''}
              {formatInt(entry.netLots, locale)} {t('stock.flowLotsUnit')}
            </EvidenceButton>
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

function ClaimParts({
  parts,
  onOpenEvidence,
}: {
  parts: RenderedPart[];
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <>
      {parts.map((part, index) =>
        part.kind === 'value' && part.factId ? (
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

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <article aria-label={title} className={`card px-4 py-4 sm:px-5 ${className}`}>
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
