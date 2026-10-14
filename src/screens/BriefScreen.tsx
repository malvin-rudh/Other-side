import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RenderedPart } from '../ai/claims';
import { DataModeChip } from '../components/DataModeChip';
import { EvidenceText } from '../components/EvidenceButton';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { Icon } from '../components/Icon';
import { InstrumentCard } from '../components/InstrumentCard';
import { BriefPortfolioValue } from '../components/PortfolioAnalyticsCard';
import { ProviderEntryCard } from '../components/ProviderEntryCard';
import { StateBlock } from '../components/StateBlock';
import { findInstrument } from '../data/instruments';
import { usePublicData, type PublicData } from '../data/publicData';
import { briefMorningDates, resolveBrief, type BriefResolution } from '../engine/brief';
import type { Locale } from '../engine/context';
import { buildEvidenceView, type EvidenceView } from '../engine/evidence';
import type { FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { buildStockView } from '../engine/stockView';
import { WHAT_IF_PREFIX, whatIfBrokerCode } from '../engine/whatIf';
import { formatSessionDate, useTranslation } from '../i18n';
import { useContextStore, type PortfolioEntry } from '../store/contextStore';
import '../layout.css';

// The briefing calendar (mornings, holidays, gaps) is market level and shared by
// every dataset in this prototype, so it is anchored to the verified case instead
// of the last visited stock, which Brief no longer follows.
const CALENDAR_TICKER = 'SINI';

type BriefEvidenceLayer = {
  ticker: string;
  sessionDate: string;
  factId: string;
  trigger: HTMLElement | null;
  fallback: HTMLElement | null;
};

type OpenBriefEvidence = (
  ticker: string,
  sessionDate: string,
  factId: string,
  trigger: HTMLElement,
  fallback?: HTMLElement | null,
) => void;

export function BriefScreen() {
  const { t, locale } = useTranslation();
  const scenario = useContextStore((state) => state.scenario);
  const briefDate = useContextStore((state) => state.briefDate);
  const portfolio = useContextStore((state) => state.portfolio);
  const setBriefDate = useContextStore((state) => state.setBriefDate);
  const setScenario = useContextStore((state) => state.setScenario);
  const setViewSnapshot = useContextStore((state) => state.setViewSnapshot);
  const calendar = usePublicData(CALENDAR_TICKER);

  const mornings = useMemo(
    () => (calendar.status === 'ready' ? briefMorningDates(calendar.data.sessions) : []),
    [calendar],
  );

  const selectedMorning = useMemo(() => {
    if (mornings.length === 0) return null;
    return briefDate !== null && mornings.includes(briefDate)
      ? briefDate
      : mornings[mornings.length - 1]!;
  }, [mornings, briefDate]);

  useEffect(() => {
    if (selectedMorning !== null && selectedMorning !== briefDate) {
      setBriefDate(selectedMorning);
    }
  }, [selectedMorning, briefDate, setBriefDate]);

  const resolution = useMemo(
    () =>
      calendar.status === 'ready' && selectedMorning !== null
        ? resolveBrief(calendar.data.sessions, selectedMorning)
        : null,
    [calendar, selectedMorning],
  );

  useEffect(() => {
    setViewSnapshot('/', resolution?.snapshot ?? null);
  }, [resolution, setViewSnapshot]);

  const owned = portfolio.filter((entry) => entry.list === 'owned');
  const watchlist = portfolio.filter((entry) => entry.list === 'watchlist');

  // Derived selection: an explicit choice only survives while its entry exists,
  // otherwise the first entry takes over, so the panel stays valid after removals.
  // Holdings have no panel on the Brief; each summary row opens its stock page.
  const [watchChoice, setWatchChoice] = useState<string | null>(null);
  const selectedOwned = owned[0]?.ticker ?? null;
  const selectedWatch =
    watchChoice !== null && watchlist.some((entry) => entry.ticker === watchChoice)
      ? watchChoice
      : watchlist[0]?.ticker ?? null;

  // One evidence drawer at a time. The layer carries its instrument and session
  // so the drawer rebuilds the exact facts context the panel used, and a change
  // of morning, scenario or selection closes it because that context is gone.
  const [evidenceLayer, setEvidenceLayer] = useState<BriefEvidenceLayer | null>(null);

  useEffect(() => {
    setEvidenceLayer(null);
  }, [selectedMorning, scenario, selectedOwned, selectedWatch]);

  const openEvidence: OpenBriefEvidence = (ticker, sessionDate, factId, trigger, fallback = null) =>
    setEvidenceLayer({ ticker, sessionDate, factId, trigger, fallback });

  // The headline instrument is chosen deterministically: the selected holding
  // and then the selected watchlist stock first, otherwise any tracked verified
  // case ahead of sample datasets, so the sentence describes a reviewed capture
  // whenever the portfolio contains one.
  const headlineTicker = useMemo(() => {
    const selection = [selectedOwned, selectedWatch].filter((ticker): ticker is string => ticker !== null);
    const trackedWithDataset = portfolio
      .map((entry) => entry.ticker)
      .filter((ticker) => findInstrument(ticker)?.hasBrokerDataset ?? false);
    const verified = trackedWithDataset.filter(
      (ticker) => findInstrument(ticker)?.dataMode === 'verified',
    );
    const seen = new Set<string>();
    const ordered = [
      ...selection.filter((ticker) => verified.includes(ticker)),
      ...verified,
      ...selection.filter((ticker) => trackedWithDataset.includes(ticker)),
      ...trackedWithDataset,
    ].filter((ticker) => {
      if (seen.has(ticker)) return false;
      seen.add(ticker);
      return true;
    });
    return ordered[0] ?? null;
  }, [portfolio, selectedOwned, selectedWatch]);

  // The approved headline is the C25-MOVE directional comparison of one
  // instrument, never an invented market-wide conclusion.
  const headline = useInstrumentBrief(headlineTicker ?? '', selectedMorning);
  const headlineComparison =
    headline.view?.approved.claims.find((claim) => claim.claim_id === 'CL-OBS-C25-MOVE' && claim.available) ?? null;
  const headlineParts = headlineComparison?.parts.short[locale] ?? null;
  const headlineSnapshot = headline.resolution?.snapshot ?? null;
  const headlineHasDataset = headline.instrument?.hasBrokerDataset ?? false;

  const evidenceState = usePublicData(evidenceLayer?.ticker ?? null);
  const evidenceContext = useMemo<FactsContext | null>(() => {
    if (evidenceLayer === null || evidenceState.status !== 'ready') return null;
    return briefContext(evidenceState.data, evidenceLayer.ticker, evidenceLayer.sessionDate, scenario, locale);
  }, [evidenceLayer, evidenceState, scenario, locale]);
  const evidenceView: EvidenceView | null = useMemo(
    () =>
      evidenceLayer !== null && evidenceContext !== null && evidenceState.status === 'ready'
        ? buildEvidenceView(evidenceLayer.factId, evidenceContext, evidenceState.data, locale)
        : null,
    [evidenceLayer, evidenceContext, evidenceState, locale],
  );

  const watchEntry =
    selectedWatch !== null ? (watchlist.find((entry) => entry.ticker === selectedWatch) ?? null) : null;

  if (calendar.status === 'error') {
    return (
      <section aria-labelledby="brief-title" className="page-stack">
        <header className="page-hero">
          <div className="page-hero-toolbar">
            <p className="eyebrow">{t('brief.morningLabel')}</p>
          </div>
          <h1 id="brief-title">{t('brief.title')}</h1>
        </header>
        <StateBlock title={t('states.error')} body={calendar.message} />
      </section>
    );
  }

  if (calendar.status === 'loading' || resolution === null) {
    return (
      <section aria-labelledby="brief-title" className="page-stack">
        <header className="page-hero">
          <div className="page-hero-toolbar">
            <p className="eyebrow">{t('brief.morningLabel')}</p>
          </div>
          <h1 id="brief-title">{t('brief.title')}</h1>
        </header>
        <StateBlock title={t('states.loading')} />
      </section>
    );
  }

  return (
    <section aria-labelledby="brief-title" className="page-stack">
      <header id="brief-header" className="page-hero">
        <div className="page-hero-toolbar">
          <p className="eyebrow">{t('brief.morningLabel')}</p>
          <details className="page-history">
            <summary className="btn btn-quiet cursor-pointer gap-1.5 px-3 py-2 text-sm">
              <Icon name="expand" className="h-3.5 w-3.5" />
              {t('brief.historyLabel')}
            </summary>
            <div>
              <label htmlFor="brief-date" className="eyebrow">
                {t('brief.dateLabel')}
              </label>
              <select
                id="brief-date"
                value={selectedMorning ?? ''}
                onChange={(event) => setBriefDate(event.target.value)}
                className="field mt-1.5"
              >
                {mornings.map((morning) => (
                  <option key={morning} value={morning}>
                    {formatSessionDate(morning, locale)}
                  </option>
                ))}
              </select>
            </div>
          </details>
        </div>

        <h1 id="brief-title">
          {headlineParts !== null && headlineTicker !== null && headlineSnapshot !== null ? (
            <>
              <span className="page-headline-ticker tabular-nums">{headlineTicker}</span>
              <ClaimText
                parts={headlineParts}
                onOpenEvidence={(factId, trigger) =>
                  openEvidence(headlineTicker, headlineSnapshot, factId, trigger)
                }
              />
            </>
          ) : headlineHasDataset && headline.status === 'loading' ? (
            t('states.loading')
          ) : (
            t('brief.headlineFallback')
          )}
        </h1>

        {resolution.snapshot === null ? <p className="page-date">{t('brief.noSnapshot')}</p> : null}

        {resolution.marketClosedToday ? (
          <p className="mt-4 rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-sm font-medium text-brandDeep">
            {t('brief.marketClosed')}
          </p>
        ) : null}

        {resolution.gaps.length > 0 && resolution.snapshot !== null ? (
          <p className="mt-3 rounded-lg border border-dashed border-unknown/50 px-3 py-2 text-xs leading-relaxed text-muted">
            {t('brief.gapNote', {
              gap: resolution.gaps.map((gap) => formatSessionDate(gap, locale)).join(', '),
              snapshot: formatSessionDate(resolution.snapshot, locale),
            })}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="brief-owned" className="page-section">
        <div className="page-section-heading">
          <h2 id="brief-owned">{t('brief.yourPortfolio')}</h2>
          <span className="chip chip-line tabular-nums">
            {t('portfolio.entriesCount', { count: String(owned.length) })}
          </span>
        </div>

        {owned.length === 0 ? (
          <div className="card-inset flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3">
            <p className="min-w-0 text-sm text-muted">{t('brief.emptyPortfolio')}</p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link to="/portfolio" className="btn btn-primary px-3 py-1.5 text-xs">
                <Icon name="plus" className="h-3.5 w-3.5" />
                {t('brief.addStock')}
              </Link>
              <Link to="/stocks" className="btn btn-quiet px-3 py-1.5 text-xs">
                {t('nav.stocks')}
              </Link>
            </div>
          </div>
        ) : (
          <div className="card page-summary-card">
            <ul className="divide-y divide-line">
              {owned.map((entry) => (
                <BriefCompactRow
                  key={entry.ticker}
                  ticker={entry.ticker}
                  morning={selectedMorning}
                  onOpenEvidence={openEvidence}
                />
              ))}
            </ul>
            <div className="mt-4 border-t border-line pt-3">
              <BriefPortfolioValue morning={selectedMorning} />
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="brief-watchlist" className="page-section">
        <div className="page-section-heading">
          <h2 id="brief-watchlist">{t('brief.watchlist')}</h2>
          <span className="chip chip-line tabular-nums">
            {t('portfolio.entriesCount', { count: String(watchlist.length) })}
          </span>
        </div>
        {watchlist.length > 1 && selectedWatch !== null ? (
          <TickerTabs
            entries={watchlist}
            selected={selectedWatch}
            onSelect={setWatchChoice}
            ariaLabel={t('brief.selectWatch')}
          />
        ) : null}

        {watchlist.length === 0 ? (
          <div className="card-inset flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3">
            <p className="min-w-0 text-sm text-muted">{t('brief.emptyWatchlist')}</p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Link to="/portfolio" className="btn btn-primary px-3 py-1.5 text-xs">
                <Icon name="plus" className="h-3.5 w-3.5" />
                {t('brief.addStock')}
              </Link>
              <Link to="/stocks" className="btn btn-quiet px-3 py-1.5 text-xs">
                {t('nav.stocks')}
              </Link>
            </div>
          </div>
        ) : watchEntry !== null ? (
          <AnalysisPanel entry={watchEntry} morning={selectedMorning} onOpenEvidence={openEvidence} />
        ) : null}
      </section>

      {evidenceLayer !== null && evidenceView !== null && evidenceContext !== null ? (
        <EvidenceDrawer
          view={evidenceView}
          cutoffAt={evidenceContext.cutoffAt}
          trigger={evidenceLayer.trigger}
          fallbackTrigger={evidenceLayer.fallback}
          onClose={() => setEvidenceLayer(null)}
          onAssumeBroker={(code) => setScenario(`${WHAT_IF_PREFIX}${code}`)}
        />
      ) : null}
    </section>
  );
}

// Every panel resolves its own facts context from its own dataset, so a sample
// instrument never borrows the verified case's session, cutoff or versions.
function briefContext(
  data: PublicData,
  ticker: string,
  sessionDate: string,
  scenario: string,
  locale: Locale,
): FactsContext {
  const whatIfCode = whatIfBrokerCode(scenario);
  return {
    ticker,
    sessionDate,
    cutoffAt: sessionAvailableAt(sessionDate),
    periodStart: data.defaultWindow.start,
    periodEnd: data.defaultWindow.end,
    scenario,
    ...(whatIfCode !== null ? { unknownBrokerCodes: [whatIfCode] as const } : {}),
    locale,
    dataVersion: data.versions.data,
    taxonomyVersion: data.versions.taxonomy,
    claimVersion: data.versions.claims,
  };
}

function useInstrumentBrief(ticker: string, morning: string | null) {
  const { locale } = useTranslation();
  const scenario = useContextStore((state) => state.scenario);
  const instrument = findInstrument(ticker);
  const hasDataset = instrument?.hasBrokerDataset ?? false;
  // Instruments without a reviewed dataset (SMPC, provider-only symbols) never
  // start a fetch, so the expected case stays an honest unavailable state
  // instead of surfacing a 404 or parse message.
  const state = usePublicData(hasDataset ? ticker : null);

  const resolution = useMemo<BriefResolution | null>(
    () => (hasDataset && state.status === 'ready' && morning !== null ? resolveBrief(state.data.sessions, morning) : null),
    [hasDataset, state, morning],
  );
  const context = useMemo<FactsContext | null>(
    () =>
      hasDataset && state.status === 'ready' && resolution !== null && resolution.snapshot !== null
        ? briefContext(state.data, ticker, resolution.snapshot, scenario, locale)
        : null,
    [hasDataset, state, resolution, ticker, scenario, locale],
  );
  const view = useMemo(
    () => (context !== null && state.status === 'ready' ? buildStockView(context, state.data) : null),
    [context, state],
  );

  return {
    instrument,
    status: state.status,
    message: state.status === 'error' ? state.message : null,
    resolution,
    context,
    view,
    data: state.status === 'ready' ? state.data : null,
  };
}

// Every tracked ticker stays on screen as a button, replacing a dropdown whose
// other options were invisible until opened. Scrolls sideways when the list is
// longer than the row.
function TickerTabs({
  entries,
  selected,
  onSelect,
  ariaLabel,
}: {
  entries: readonly PortfolioEntry[];
  selected: string;
  onSelect: (ticker: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="page-ticker-tabs">
      {entries.map((entry) => (
        <button
          key={entry.ticker}
          type="button"
          aria-pressed={entry.ticker === selected}
          onClick={() => onSelect(entry.ticker)}
          className="page-ticker-tab tabular-nums"
        >
          {entry.ticker}
        </button>
      ))}
    </div>
  );
}

function BriefCompactRow({
  ticker,
  morning,
  onOpenEvidence,
}: {
  ticker: string;
  morning: string | null;
  onOpenEvidence: OpenBriefEvidence;
}) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const selectSession = useContextStore((state) => state.selectSession);
  const brief = useInstrumentBrief(ticker, morning);
  const snapshot = brief.resolution?.snapshot ?? null;
  // The leading "What changed" sentence is the approved C25 directional
  // comparison (CL-OBS-C25-MOVE) naming the group and both dates, so a summary
  // row describes an actual change instead of repeating a cumulative window
  // total. It is looked up by id because it opts out of the card excerpt.
  const comparison =
    brief.view?.approved.claims.find((claim) => claim.claim_id === 'CL-OBS-C25-MOVE' && claim.available) ?? null;
  const comparisonParts = comparison?.parts.short[locale] ?? null;
  const headline = brief.view?.card.observed[0] ?? null;

  return (
    <li className="page-summary-row flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
      <span className="page-summary-ticker shrink-0 font-semibold tracking-tight tabular-nums text-ink">{ticker}</span>
      {brief.instrument !== null ? <DataModeChip mode={brief.instrument.dataMode} /> : <DataModeChip mode="provider" />}
      <span className="page-summary-text min-w-0 flex-1 text-sm leading-relaxed text-muted">
        {comparisonParts !== null && snapshot !== null ? (
          <ClaimText
            parts={comparisonParts}
            onOpenEvidence={(factId, trigger) => onOpenEvidence(ticker, snapshot, factId, trigger)}
          />
        ) : headline !== null && snapshot !== null ? (
          <ClaimText
            parts={headline.parts}
            onOpenEvidence={(factId, trigger) => onOpenEvidence(ticker, snapshot, factId, trigger)}
          />
        ) : brief.instrument === null ? (
          t('portfolio.providerNote')
        ) : !brief.instrument.hasBrokerDataset ? (
          t('card.unavailableAnalysis', { ticker })
        ) : brief.status === 'loading' ? (
          t('states.loading')
        ) : brief.status === 'error' ? (
          t('states.error')
        ) : (
          t('card.unavailableAnalysis', { ticker })
        )}
      </span>
      {/* Same destination as the card's View analysis: the stock page pinned
          to the session this row describes. Only rows with a reviewed dataset
          have a stock page to open. */}
      {brief.instrument?.hasBrokerDataset && snapshot !== null ? (
        <button
          type="button"
          onClick={() => {
            selectSession(snapshot);
            navigate(`/stock/${ticker}`);
          }}
          aria-label={`${t('card.openFull')}: ${ticker}`}
          title={`${t('card.openFull')}: ${ticker}`}
          className="page-summary-go"
        >
          <Icon name="next" className="h-4 w-4" />
        </button>
      ) : null}
    </li>
  );
}

function AnalysisPanel({
  entry,
  morning,
  onOpenEvidence,
}: {
  entry: PortfolioEntry;
  morning: string | null;
  onOpenEvidence: OpenBriefEvidence;
}) {
  const { t } = useTranslation();
  const brief = useInstrumentBrief(entry.ticker, morning);

  if (brief.instrument === null) return <ProviderEntryCard entry={entry} />;
  if (!brief.instrument.hasBrokerDataset) {
    // A registry instrument without a reviewed dataset (SMPC) keeps its named,
    // provenance-carrying card and an honest translated state; no fetch was
    // ever started, so no raw error text can leak here.
    return (
      <InstrumentCard
        instrument={brief.instrument}
        entry={entry}
        analysisDate={null}
        view={null}
        context={null}
        data={null}
        onOpenEvidence={() => {}}
      />
    );
  }
  if (brief.status === 'loading') {
    return (
      <div className="card card-pad">
        <p className="text-sm text-muted">{t('states.loading')}</p>
      </div>
    );
  }
  if (brief.status === 'error') {
    return <StateBlock title={t('states.error')} body={brief.message ?? ''} />;
  }

  const sessionDate = brief.resolution?.snapshot ?? null;
  return (
    <InstrumentCard
      instrument={brief.instrument}
      entry={entry}
      analysisDate={sessionDate}
      view={brief.view}
      context={brief.context}
      data={brief.data}
      onOpenEvidence={(factId, trigger) => {
        if (sessionDate !== null) onOpenEvidence(entry.ticker, sessionDate, factId, trigger);
      }}
    />
  );
}

const TONE_CLASS: Record<string, string> = {
  buy: 'font-semibold text-buy',
  sell: 'font-semibold text-sell',
  neutral: '',
};

function ClaimText({
  parts,
  onOpenEvidence,
}: {
  parts: RenderedPart[];
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}) {
  return (
    <>
      {parts.map((part, index) =>
        part.kind === 'value' && part.factId ? (
          <EvidenceText
            key={index}
            factId={part.factId}
            className={TONE_CLASS[part.tone ?? 'neutral']}
            onActivate={onOpenEvidence}
          >
            {part.text}
          </EvidenceText>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
