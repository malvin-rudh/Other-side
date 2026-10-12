import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { DataModeChip } from '../components/DataModeChip';
import { EvidenceButton } from '../components/EvidenceButton';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { FocusView } from '../components/FocusView';
import { Icon } from '../components/Icon';
import { OtherSideCard } from '../components/OtherSideCard';
import { SessionScrubber } from '../components/SessionScrubber';
import { ThesisChips } from '../components/ThesisChips';
import { TradeContextSheet } from '../components/TradeContextSheet';
import { WhatIfPanel } from '../components/WhatIfPanel';
import { GroupNetChart as GroupNetChartSync } from '../components/charts/GroupNetChart';
import { ProxyChart as ProxyChartSync } from '../components/charts/ProxyChart';
import { StateBlock } from '../components/StateBlock';
import { findInstrument, instrumentExchange, instrumentName, instrumentNameText } from '../data/instruments';
import { usePublicData } from '../data/publicData';
import { buildEvidenceView, type EvidenceView } from '../engine/evidence';
import type { Locale } from '../engine/context';
import type { FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import {
  buildStockView,
  type ChangedStripView,
  type EventView,
  type RankingEntryView,
  type StockView,
} from '../engine/stockView';
import { buildSessionTimeline } from '../engine/timeline';
import { buildTradeContext, type TradeContextView } from '../engine/tradeContext';
import { WHAT_IF_PREFIX, buildWhatIfView, whatIfBrokerCode, type WhatIfView } from '../engine/whatIf';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';

// Recharts is the heavy part of the screen: lazy-load it in the browser so the
// initial chunk stays small, but keep a sync import for SSR/tests where a
// thrown lazy promise cannot be awaited (renderToStaticMarkup).
const ProxyChart = import.meta.env.SSR
  ? ProxyChartSync
  : lazy(() => import('../components/charts/ProxyChart').then((m) => ({ default: m.ProxyChart })));
const GroupNetChart = import.meta.env.SSR
  ? GroupNetChartSync
  : lazy(() => import('../components/charts/GroupNetChart').then((m) => ({ default: m.GroupNetChart })));

type PanelKey = 'story' | 'health' | 'flow';
type FlowGroupKey = StockView['flow']['groups'][number]['group'];
type FocusKind = 'card' | 'proxy' | 'group';

type DialogLayer =
  | { kind: 'evidence'; factId: string; trigger: HTMLButtonElement | null; fallback: HTMLElement | null }
  | { kind: 'simulate'; action: 'sell' | 'buy'; trigger: HTMLButtonElement | null }
  | { kind: 'focus'; view: FocusKind; trigger: HTMLButtonElement | null };

const NUM_CELL = 'inline-block w-16 shrink-0 text-right tabular-nums';

export function StockScreen() {
  const { ticker: routeTicker } = useParams<{ ticker: string }>();
  const { t, locale } = useTranslation();
  const setTicker = useContextStore((state) => state.setTicker);
  const ticker = useContextStore((state) => state.ticker);
  const selectedSessionDate = useContextStore((state) => state.selectedSessionDate);
  const periodStart = useContextStore((state) => state.periodStart);
  const periodEnd = useContextStore((state) => state.periodEnd);
  const scenario = useContextStore((state) => state.scenario);
  const setScenario = useContextStore((state) => state.setScenario);
  const demoMode = useContextStore((state) => state.demoMode);
  const coachStep = useContextStore((state) => state.coachStep);
  const selectSession = useContextStore((state) => state.selectSession);
  const setPeriod = useContextStore((state) => state.setPeriod);
  const setViewSnapshot = useContextStore((state) => state.setViewSnapshot);
  const focusRequest = useContextStore((state) => state.focusRequest);
  const clearFocusRequest = useContextStore((state) => state.clearFocusRequest);
  const [requestedPanel, setRequestedPanel] = useState<PanelKey | null>(null);
  const [primaryChart, setPrimaryChart] = useState<'groups' | 'proxy'>('groups');

  useEffect(() => {
    if (routeTicker) setTicker(routeTicker);
  }, [routeTicker, setTicker]);

  useEffect(() => {
    setViewSnapshot(`/stock/${ticker}`, selectedSessionDate);
  }, [ticker, selectedSessionDate, setViewSnapshot]);

  // Registry instruments without a reviewed dataset (SMPC) never start a fetch:
  // the expected case renders its honest unavailable card below instead of a
  // raw 404 parse message. Unknown tickers keep the fetching error path.
  const instrument = findInstrument(ticker);
  const state = usePublicData(instrument !== null && !instrument.hasBrokerDataset ? null : ticker);

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

  const timeline = useMemo(
    () => (state.status === 'ready' ? buildSessionTimeline(state.data.sessions) : null),
    [state],
  );

  useEffect(() => {
    if (selectedSessionDate === null && capturedSessions.length > 0) {
      const last = capturedSessions[capturedSessions.length - 1];
      if (last) selectSession(last);
    }
  }, [selectedSessionDate, capturedSessions, selectSession]);

  const whatIfCode = whatIfBrokerCode(scenario);

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
      scenario,
      ...(whatIfCode !== null ? { unknownBrokerCodes: [whatIfCode] as const } : {}),
      locale,
      dataVersion: state.data.versions.data,
      taxonomyVersion: state.data.versions.taxonomy,
      claimVersion: state.data.versions.claims,
    };
  }, [state, ticker, selectedSessionDate, periodStart, periodEnd, scenario, whatIfCode, locale]);

  const view = useMemo(
    () => (factsContext !== null && state.status === 'ready' ? buildStockView(factsContext, state.data) : null),
    [factsContext, state],
  );

  // One stack of overlay layers, of which only the topmost is mounted. That
  // keeps a single focus trap live at a time, and closing a drawer re-mounts the
  // dialog that opened it, so focus lands on a real control again.
  const [layers, setLayers] = useState<DialogLayer[]>([]);
  const top = layers.length > 0 ? (layers[layers.length - 1] ?? null) : null;
  const evidenceLayer = top?.kind === 'evidence' ? top : null;
  const simulateLayer = top?.kind === 'simulate' ? top : null;
  const focusLayer = top?.kind === 'focus' ? top : null;

  useEffect(() => {
    setLayers([]);
  }, [selectedSessionDate, scenario]);

  useEffect(() => {
    if (!demoMode) return;
    if (coachStep === 2 || coachStep === 7) {
      setLayers([{ kind: 'simulate', action: coachStep === 2 ? 'sell' : 'buy', trigger: null }]);
      return;
    }
    if (coachStep === 5) {
      const fact = view?.approved.facts.find((entry) => entry.key === 'C09' && entry.available === true);
      setLayers(fact ? [{ kind: 'evidence', factId: fact.fact_id, trigger: null, fallback: null }] : []);
      return;
    }
    setLayers([]);
  }, [demoMode, coachStep, view]);

  // An Explore shortcut hands over a control to focus; the target can be a
  // render or two away because the session change rebuilds the view first.
  // Claim Check requests belong to the Method page and are ignored here.
  useEffect(() => {
    if (focusRequest === null || focusRequest.panel === 'claim-check') return;
    setLayers([]);
    if (focusRequest.panel === 'flow') setRequestedPanel('flow');
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const target = document.querySelector<HTMLElement>(focusRequest.selector);
      if (target) {
        window.clearInterval(timer);
        clearFocusRequest();
        target.scrollIntoView({ block: 'center' });
        target.focus({ preventScroll: true });
        return;
      }
      if (attempts >= 20) {
        window.clearInterval(timer);
        clearFocusRequest();
      }
    }, 75);
    return () => window.clearInterval(timer);
  }, [focusRequest, clearFocusRequest]);

  const whatIfView: WhatIfView | null = useMemo(() => {
    if (whatIfCode === null || factsContext === null || state.status !== 'ready') return null;
    return buildWhatIfView(whatIfCode, { ...factsContext, unknownBrokerCodes: [] }, state.data);
  }, [whatIfCode, factsContext, state]);

  const evidenceFactId = evidenceLayer?.factId ?? null;
  const evidenceView: EvidenceView | null = useMemo(
    () =>
      evidenceFactId !== null && factsContext !== null && state.status === 'ready'
        ? buildEvidenceView(evidenceFactId, factsContext, state.data, locale)
        : null,
    [evidenceFactId, factsContext, state, locale],
  );

  const simulateKind = simulateLayer?.action ?? null;
  const tradeView: TradeContextView | null = useMemo(() => {
    if (simulateKind === null || factsContext === null || state.status !== 'ready') return null;
    return buildTradeContext(simulateKind, factsContext, state.data);
  }, [simulateKind, factsContext, state]);

  const popLayer = () => setLayers((prev) => prev.slice(0, -1));
  // `fallback` is the launcher of the dialog that opened this drawer; it stays
  // mounted while that dialog is unmounted to make room for the drawer.
  const openEvidence = (factId: string, trigger: HTMLButtonElement, fallback: HTMLElement | null = null) =>
    setLayers((prev) => [...prev, { kind: 'evidence', factId, trigger, fallback }]);
  const openSimulation = (action: 'sell' | 'buy', trigger: HTMLButtonElement) =>
    setLayers((prev) => [...prev, { kind: 'simulate', action, trigger }]);
  const openFocus = (kind: FocusKind, trigger: HTMLButtonElement) =>
    setLayers((prev) => [...prev, { kind: 'focus', view: kind, trigger }]);
  const assumeBroker = (code: string) => setScenario(`${WHAT_IF_PREFIX}${code}`);
  const resetWhatIf = () => setScenario('default');

  if (instrument !== null && !instrument.hasBrokerDataset) {
    return (
      <section aria-labelledby="stock-title" className="space-y-3">
        <header id="stock-header" className="card px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-full bg-brand" />
              <h1 id="stock-title" className="text-lg font-semibold tracking-tight lg:text-xl">
                {instrument.ticker} · {instrumentNameText(instrument.name, locale)}
              </h1>
              <DataModeChip mode={instrument.dataMode} />
            </div>
            <p className="mt-1 text-xs text-mutedSoft">{instrumentExchange(instrument, locale)}</p>
          </div>
        </header>
        <p className="rounded-lg border border-dashed border-unknown/50 px-3 py-3 text-sm leading-relaxed text-muted">
          {t('card.unavailableAnalysis', { ticker: instrument.ticker })}{' '}
          {instrument.dataMode === 'sample' ? t('dataMode.sampleNote') : ''}
        </p>
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

  return (
    <section aria-labelledby="stock-title" className="space-y-3">
      <header id="stock-header" className="card px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-full bg-brand" />
            <h1 id="stock-title" className="text-lg font-semibold tracking-tight lg:text-xl">
              {view.ticker} · {instrumentName(view.ticker, locale, t('stock.companyName'))}
            </h1>
            <DataModeChip mode={findInstrument(view.ticker)?.dataMode ?? 'verified'} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {view.headerProxy.display !== null && view.headerProxy.date !== null && view.headerProxy.factId ? (
              <EvidenceButton factId={view.headerProxy.factId} className="font-semibold text-ink" onActivate={openEvidence}>
                ≈Rp{formatInt(view.headerProxy.display, locale)} · {formatShortDate(view.headerProxy.date, locale)}
              </EvidenceButton>
            ) : (
              <span>—</span>
            )}{' '}
            <span className="text-xs">· {t('stock.proxyDisclaimer')}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {t('stock.periodLabel')}: {formatSessionDate(view.effectiveWindow.start, locale)} →{' '}
            {formatSessionDate(view.effectiveWindow.end, locale)}
          </p>
        </div>
      </header>

      {timeline ? (
        <SessionScrubber timeline={timeline} selectedDate={view.selectedSessionDate} onSelect={selectSession} />
      ) : null}

      {whatIfView && whatIfCode ? <WhatIfPanel view={whatIfView} onReset={resetWhatIf} /> : null}

      {/* First screen: the explanation and one primary chart, side by side on
          desktop, explanation first on mobile. The second chart is one toggle
          away instead of stacked below. */}
      <div className="grid items-start gap-3 lg:grid-cols-2">
        <OtherSideCard
          card={view.card}
          onOpenEvidence={openEvidence}
          onExpand={(trigger) => openFocus('card', trigger)}
        />
        <Panel
          title={primaryChart === 'groups' ? t('stock.groupNetChartTitle') : t('stock.proxyChartTitle')}
          onExpand={
            primaryChart === 'groups'
              ? view.cumulativePoints.length > 0
                ? (trigger) => openFocus('group', trigger)
                : undefined
              : view.proxyPoints.length > 0
                ? (trigger) => openFocus('proxy', trigger)
                : undefined
          }
        >
          <div role="group" aria-label={t('stock.chartViewLabel')} className="mb-2.5 flex flex-wrap gap-1.5">
            <button
              type="button"
              aria-pressed={primaryChart === 'groups'}
              onClick={() => setPrimaryChart('groups')}
              className={primaryChart === 'groups' ? 'chip chip-brand' : 'chip chip-line'}
            >
              {t('stock.chartGroups')}
            </button>
            <button
              type="button"
              aria-pressed={primaryChart === 'proxy'}
              onClick={() => setPrimaryChart('proxy')}
              className={primaryChart === 'proxy' ? 'chip chip-brand' : 'chip chip-line'}
            >
              {t('stock.chartProxy')}
            </button>
          </div>
          {primaryChart === 'groups' ? (
            view.cumulativePoints.length > 0 ? (
              <Suspense fallback={<div className="h-64 w-full" aria-hidden="true" />}>
                <GroupNetChart points={view.cumulativePoints} locale={locale} />
              </Suspense>
            ) : (
              <StateBlock title={t('states.empty')} />
            )
          ) : view.proxyPoints.length > 0 ? (
            <Suspense fallback={<div className="h-48 w-full" aria-hidden="true" />}>
              <ProxyChart points={view.proxyPoints} selectedSessionDate={view.selectedSessionDate} locale={locale} />
            </Suspense>
          ) : (
            <StateBlock title={t('states.empty')} />
          )}
        </Panel>
      </div>

      <ChangedStrip strip={view.changed} onOpenEvidence={openEvidence} />

      <ThesisChips approved={view.approved} onOpenEvidence={openEvidence} />

      <Panels
        view={view}
        requestedPanel={requestedPanel}
        onOpenEvidence={openEvidence}
        onAssumeBroker={assumeBroker}
      />

      <details className="card px-4 py-3 sm:px-5">
        <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold tracking-tight">
          {t('stock.demoTools')}
          <Icon name="expand" className="h-4 w-4 text-mutedSoft" />
        </summary>
        <div className="mt-3 border-t border-line pt-3">
          <SimulationActions onOpen={openSimulation} />
          <p className="note mt-2">{t('stock.demoToolsNote')}</p>
        </div>
      </details>

      {evidenceLayer && evidenceView ? (
        <EvidenceDrawer
          view={evidenceView}
          cutoffAt={sessionAvailableAt(view.selectedSessionDate)}
          trigger={evidenceLayer.trigger}
          fallbackTrigger={evidenceLayer.fallback}
          onClose={popLayer}
          onAssumeBroker={assumeBroker}
        />
      ) : null}

      {simulateLayer && tradeView ? (
        <TradeContextSheet
          kind={simulateLayer.action}
          view={tradeView}
          trigger={simulateLayer.trigger}
          onClose={popLayer}
          onOpenEvidence={(factId, trigger) => openEvidence(factId, trigger, simulateLayer.trigger)}
        />
      ) : null}

      {focusLayer ? (
        <FocusView
          title={
            focusLayer.view === 'card'
              ? t('stock.cardTitle')
              : focusLayer.view === 'proxy'
                ? t('stock.proxyChartTitle')
                : t('stock.groupNetChartTitle')
          }
          meta={
            <>
              {t('stock.periodLabel')}: {formatSessionDate(view.effectiveWindow.start, locale)} →{' '}
              {formatSessionDate(view.effectiveWindow.end, locale)}
              {focusLayer.view === 'proxy'
                ? ' · ≈Rp'
                : focusLayer.view === 'group'
                  ? ` · ${t('stock.flowLotsUnit')}`
                  : ''}
            </>
          }
          caveats={
            focusLayer.view === 'proxy'
              ? [t('stock.proxyDisclaimer')]
              : focusLayer.view === 'group'
                ? [t('stock.flowLotsNote')]
                : undefined
          }
          trigger={focusLayer.trigger}
          onClose={popLayer}
        >
          {focusLayer.view === 'card' ? (
            <OtherSideCard
              card={view.card}
              titleId="otherside-card-title-focus"
              onOpenEvidence={(factId, trigger) => openEvidence(factId, trigger, focusLayer.trigger)}
            />
          ) : focusLayer.view === 'proxy' ? (
            <Suspense fallback={<div className="h-[45vh] w-full" aria-hidden="true" />}>
              <ProxyChart
                points={view.proxyPoints}
                selectedSessionDate={view.selectedSessionDate}
                locale={locale}
                presentation
              />
            </Suspense>
          ) : (
            <Suspense fallback={<div className="h-[55vh] w-full" aria-hidden="true" />}>
              <GroupNetChart points={view.cumulativePoints} locale={locale} presentation />
            </Suspense>
          )}
        </FocusView>
      ) : null}
    </section>
  );
}

function ChangedStrip({
  strip,
  onOpenEvidence,
}: {
  strip: ChangedStripView | null;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const { t, locale } = useTranslation();
  // Compact summary up front, per-group moves one disclosure away.
  const [open, setOpen] = useState(false);

  return (
    <section aria-label={t('changed.title')} className="card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight">{t('changed.title')}</h2>
        {strip ? (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="changed-details"
            className="btn btn-quiet shrink-0 px-2.5 py-1 text-xs"
          >
            {open ? t('changed.hideDetails') : t('changed.showDetails')}
          </button>
        ) : null}
      </div>
      {strip ? (
        <p className="mt-1 text-xs text-muted">
          {t('changed.range', {
            from: formatSessionDate(strip.fromDate, locale),
            to: formatSessionDate(strip.toDate, locale),
          })}{' '}
          · {t('changed.summary', { count: String(strip.moves.length) })}
        </p>
      ) : null}
      <div id="changed-details" hidden={!open}>
        {strip ? (
          <ul className="mt-2 divide-y divide-line">
            {strip.moves.map((move) => (
              <li key={move.group} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm">
                <GroupLabel group={move.group} />
                <EvidenceButton factId={strip.factId} onActivate={onOpenEvidence}>
                  <span className={`${NUM_CELL} ${signedClass(move.fromLots)}`}>{formatSigned(move.fromLots, locale)}</span>
                  <span aria-hidden="true" className="mx-1.5 shrink-0 text-xs text-muted">
                    {move.toLots > move.fromLots ? '▲' : '▼'}
                  </span>
                  <span className={`${NUM_CELL} ${signedClass(move.toLots)}`}>{formatSigned(move.toLots, locale)}</span>
                  <span className="ml-1.5 shrink-0 text-xs text-muted">{t('stock.flowLotsUnit')}</span>
                </EvidenceButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">{t('changed.noPrevious')}</p>
        )}
      </div>
    </section>
  );
}

function Panels({
  view,
  requestedPanel,
  onOpenEvidence,
  onAssumeBroker,
}: {
  view: StockView;
  requestedPanel: PanelKey | null;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
  onAssumeBroker: (code: string) => void;
}) {
  const { t } = useTranslation();
  const [activePanel, setActivePanel] = useState<PanelKey>('story');

  useEffect(() => {
    if (requestedPanel !== null) setActivePanel(requestedPanel);
  }, [requestedPanel]);

  const panels: { key: PanelKey; label: string; content: ReactNode }[] = [
    { key: 'story', label: t('stock.storyTitle'), content: <EventList events={view.story} /> },
    { key: 'health', label: t('stock.healthTitle'), content: <EventList events={view.health} /> },
    {
      key: 'flow',
      label: t('stock.flowTitle'),
      content: <FlowPanel view={view} onOpenEvidence={onOpenEvidence} onAssumeBroker={onAssumeBroker} />,
    },
  ];

  return (
    <div>
      <nav
        className="flex gap-1 rounded-xl border border-line bg-surfaceAlt p-1 md:hidden"
        role="tablist"
        aria-label={t('stock.panelsLabel')}
      >
        {panels.map((panel) => (
          <button
            key={panel.key}
            type="button"
            role="tab"
            aria-selected={activePanel === panel.key}
            onClick={() => setActivePanel(panel.key)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors ${
              activePanel === panel.key ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
            }`}
          >
            {panel.label}
          </button>
        ))}
      </nav>
      <div className="grid gap-4 md:grid-cols-3">
        {panels.map((panel) => (
          <section
            key={panel.key}
            role="tabpanel"
            aria-label={panel.label}
            className={activePanel === panel.key ? '' : 'hidden md:block'}
          >
            <Panel title={panel.label}>{panel.content}</Panel>
          </section>
        ))}
      </div>
    </div>
  );
}

function FlowPanel({
  view,
  onOpenEvidence,
  onAssumeBroker,
}: {
  view: StockView;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
  onAssumeBroker: (code: string) => void;
}) {
  const { t, locale } = useTranslation();
  const flow = view.flow;

  if (!flow.available) {
    return <StateBlock title={t('states.unavailable')} />;
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-line">
        {flow.groups.map((group) => (
          <li key={group.group} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0">
            <GroupLabel group={group.group} />
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
      <p className="note">{t('stock.flowLotsNote')}</p>
      <RankingList
        title={t('stock.flowTopBuyers')}
        entries={flow.topBuyers}
        onOpenEvidence={onOpenEvidence}
        onAssumeBroker={onAssumeBroker}
      />
      <RankingList
        title={t('stock.flowTopSellers')}
        entries={flow.topSellers}
        onOpenEvidence={onOpenEvidence}
        onAssumeBroker={onAssumeBroker}
      />
    </div>
  );
}

function GroupLabel({ group }: { group: FlowGroupKey }) {
  const { t } = useTranslation();
  if (group === 'unknown') {
    return <span className="chip chip-unknown">{t('stock.groupUnknown')}</span>;
  }
  const key =
    group === 'app_facing'
      ? 'stock.groupApp'
      : group === 'institution_facing'
        ? 'stock.groupInstitution'
        : group === 'other_mixed'
          ? 'stock.groupOther'
          : 'stock.groupResidual';
  return <span className={group === 'residual' ? 'text-muted' : 'font-medium text-ink'}>{t(key)}</span>;
}

function RankingList({
  title,
  entries,
  onOpenEvidence,
  onAssumeBroker,
}: {
  title: string;
  entries: RankingEntryView[];
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
  onAssumeBroker: (code: string) => void;
}) {
  const { t, locale } = useTranslation();

  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="eyebrow">{title}</h3>
      <ul className="mt-2 divide-y divide-line">
        {entries.map((entry) => (
          <li key={entry.brokerCode} className="flex items-baseline justify-between gap-3 py-2 text-sm first:pt-0">
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="font-semibold text-ink">{entry.brokerCode}</span>
              <button
                type="button"
                data-assume-broker={entry.brokerCode}
                aria-label={t('whatIf.assumeAria', { code: entry.brokerCode })}
                title={t('whatIf.assumeAria', { code: entry.brokerCode })}
                onClick={() => onAssumeBroker(entry.brokerCode)}
                className="chip border-dashed border-brand/50 bg-brand/5 text-brandDeep transition-colors hover:border-brand hover:bg-brand/15"
              >
                {t('whatIf.assumeLabel')}
              </button>
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
      </ul>
    </div>
  );
}

function EventList({ events }: { events: EventView[] }) {
  const { t, locale } = useTranslation();

  if (events.length === 0) {
    return <p className="text-sm text-muted">{t('stock.nothingYet')}</p>;
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

function SimulationActions({ onOpen }: { onOpen: (kind: 'sell' | 'buy', trigger: HTMLButtonElement) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-start gap-2">
      {(['sell', 'buy'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={(event) => onOpen(kind, event.currentTarget)}
          className="btn btn-quiet"
        >
          <span aria-hidden="true" className={kind === 'sell' ? 'text-sell' : 'text-buy'}>
            {kind === 'sell' ? '↓' : '↑'}
          </span>
          {kind === 'sell' ? t('trade.openSell') : t('trade.openBuy')}
        </button>
      ))}
    </div>
  );
}

function Panel({
  title,
  children,
  onExpand,
}: {
  title: string;
  children: ReactNode;
  onExpand?: (trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  return (
    <article
      aria-label={title}
      className="card px-4 py-3 [contain-intrinsic-size:auto_320px] [content-visibility:auto] sm:px-5"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {onExpand ? (
          <button
            type="button"
            onClick={(event) => onExpand(event.currentTarget)}
            aria-label={`${t('focus.expand')} ${title}`}
            title={t('focus.expand')}
            className="btn btn-quiet shrink-0 px-2 py-1 text-xs"
          >
            <Icon name="expand" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <div className="mt-2.5">{children}</div>
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

function formatShortDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
