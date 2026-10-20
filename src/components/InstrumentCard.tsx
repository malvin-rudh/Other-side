import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { RenderedPart } from '../ai/claims';
import type { BrokerGroup } from '../data/schemas';
import { instrumentNameText, type Instrument } from '../data/instruments';
import { buildBrokerSeries, MAX_VISIBLE_BROKER_LINES } from '../engine/brokerSeries';
import type { Locale } from '../engine/context';
import { pickText, type FactsContext, type FactsData } from '../engine/facts';
import type { PredicateStatus } from '../engine/predicates';
import type { EventView, StockView } from '../engine/stockView';
import type { LensRow, StreakCheckView } from '../engine/transactionLens';
import { formatSessionDate, intlLocale, useTranslation, type MessageKey } from '../i18n';
import { useContextStore, type PortfolioEntry } from '../store/contextStore';
import { BrokerPickerDialog } from './BrokerPickerDialog';
import { BrokerFlowChart as BrokerFlowChartSync } from './charts/BrokerFlowChart';
import { GroupNetChart as GroupNetChartSync } from './charts/GroupNetChart';
import { SessionComparisonChart as SessionComparisonChartSync } from './charts/SessionComparisonChart';
import { DataModeChip } from './DataModeChip';
import { EvidenceButton, EvidenceText } from './EvidenceButton';
import { Icon } from './Icon';
import { BROKER_LINE_COLOURS, groupDotStyle } from './groupColours';
import { SessionSankey, buildSessionFlow } from './charts/SessionSankey';
import type { PublicData } from '../data/publicData';
import type { EvidenceFocus } from '../engine/evidence';
import { ui } from '../i18n/analysisCopy';
import { Tabs, type TabSpec } from './TabList';

// Same lazy/sync split the stock screen uses, so the charts stay in their own
// chunk in the browser and still render during server-side tests.
const GroupNetChart = import.meta.env.SSR
  ? GroupNetChartSync
  : lazy(() => import('./charts/GroupNetChart').then((m) => ({ default: m.GroupNetChart })));
const BrokerFlowChart = import.meta.env.SSR
  ? BrokerFlowChartSync
  : lazy(() => import('./charts/BrokerFlowChart').then((m) => ({ default: m.BrokerFlowChart })));
const SessionComparisonChart = import.meta.env.SSR
  ? SessionComparisonChartSync
  : lazy(() =>
      import('./charts/SessionComparisonChart').then((m) => ({ default: m.SessionComparisonChart })),
    );

const TONE_CLASS: Record<string, string> = {
  buy: 'font-semibold text-buy',
  sell: 'font-semibold text-sell',
  neutral: '',
};

// Shared widths so the Previous / Selected headers sit exactly over their columns.
const LENS_NUM = 'inline-block w-[5.5rem] shrink-0 text-right tabular-nums';
const LENS_ARROW = 'inline-block w-5 shrink-0 text-center';
const LENS_UNIT = 'inline-block w-9 shrink-0 pl-1.5 text-left';

interface InstrumentCardProps {
  instrument: Instrument;
  entry: PortfolioEntry;
  // The session this card actually analysed, after the replay cutoff. Shown as
  // the analysis date so no card can look fresher than the data behind it.
  analysisDate: string | null;
  view: StockView | null;
  context: FactsContext | null;
  data: FactsData | null;
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}

export function InstrumentCard({
  instrument,
  entry,
  analysisDate,
  view,
  context,
  data,
  onOpenEvidence,
}: InstrumentCardProps) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const selectSession = useContextStore((state) => state.selectSession);
  const idPrefix = `card-${instrument.ticker.toLowerCase()}`;

  // The C25 move claim is the comparison sentence the Overview tab renders, so
  // its fact IDs are what the collapsible evidence list cites.
  const moveClaim =
    view?.approved.claims.find((claim) => claim.claim_id === 'CL-OBS-C25-MOVE' && claim.available) ?? null;
  const moveFactIds = [
    ...new Set((moveClaim?.parts.short[locale] ?? []).flatMap((part) => (part.factId ? [part.factId] : []))),
  ];

  const tabs: TabSpec[] =
    view === null || context === null || data === null
      ? []
      : [
          {
            id: 'overview',
            label: t('card.tabOverview'),
            content: <OverviewTab view={view} locale={locale} onOpenEvidence={onOpenEvidence} />,
          },
          {
            id: 'broker-flow',
            label: t('card.tabBrokerFlow'),
            content: (
              <BrokerFlowTab
                context={context}
                data={data}
                checks={view.lens.checks}
                locale={locale}
                onOpenEvidence={onOpenEvidence}
              />
            ),
          },
          {
            id: 'events',
            label: t('card.tabEvents'),
            content: <EventsTab events={view.story} />,
          },
          {
            id: 'financials',
            label: t('card.tabFinancials'),
            content: (
              <p className="rounded-lg border border-dashed border-unknown/50 px-3 py-3 text-sm leading-relaxed text-muted">
                {t('card.financialsUnavailable')}
              </p>
            ),
          },
        ];

  return (
    <article aria-labelledby={`${idPrefix}-title`} className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={`${idPrefix}-title`} className="text-2xl font-semibold tracking-tight tabular-nums">
              {instrument.ticker}
            </h3>
            <span className="chip chip-line">{entry.list === 'owned' ? t('portfolio.owned') : t('portfolio.watchlist')}</span>
          </div>
          <p className="mt-1 text-sm text-muted">{instrumentNameText(instrument.name, locale)}</p>
          {(entry.quantityShares !== null || entry.averagePrice !== null) && view !== null ? (
            <p className="note mt-2">
              {entry.quantityShares !== null
                ? `${t('card.quantityLabel')}: ${formatInt(entry.quantityShares, locale)}`
                : `${t('card.quantityLabel')}: ${t('card.notProvided')}`}
              {' · '}
              {entry.averagePrice !== null
                ? `${t('card.averagePriceLabel')}: Rp${formatInt(entry.averagePrice, locale)}`
                : `${t('card.averagePriceLabel')}: ${t('card.notProvided')}`}
              {' · '}
              {t('card.optional')}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <DataModeChip mode={instrument.dataMode} />
          <span className="tabular-nums">
            {t('brief.analysisDate', {
              date: analysisDate === null ? t('stocks.fieldUnavailable') : formatSessionDate(analysisDate, locale),
            })}
          </span>
          {instrument.hasBrokerDataset && analysisDate !== null ? (
            <button
              type="button"
              onClick={() => {
                selectSession(analysisDate);
                navigate(`/stock/${instrument.ticker}`);
              }}
              className="btn btn-quiet px-3 py-1.5 text-xs"
            >
              {t('card.openFull')}
            </button>
          ) : null}
        </div>
      </div>

      {view === null ? (
        <p className="mt-4 rounded-lg border border-dashed border-unknown/50 px-3 py-3 text-sm leading-relaxed text-muted">
          {instrument.dataMode === 'sample' && instrument.hasBrokerDataset
            ? t('card.sampleDatasetAvailable')
            : t('card.unavailableAnalysis', { ticker: instrument.ticker }) +
              (instrument.dataMode === 'sample' ? ` ${t('dataMode.sampleNote')}` : '')}
        </p>
      ) : (
        <>
          <div className="mt-4">
            <Tabs tabs={tabs} ariaLabel={t('card.tabsAria', { ticker: instrument.ticker })} idPrefix={idPrefix} />
          </div>

          <details className="mt-4 border-t border-line pt-3">
            <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-ink">
              <Icon name="expand" className="h-3.5 w-3.5" />
              {t('card.moreEvidence')}
            </summary>
            <div className="mt-3 space-y-3">
              <FactIdList
                label={t('preview.evidenceLabel')}
                factIds={moveFactIds}
                onOpenEvidence={onOpenEvidence}
              />
              <RawFlowRows view={view} locale={locale} onOpenEvidence={onOpenEvidence} />
              <ul className="space-y-1.5 border-t border-line pt-3">
                {[
                  t('card.explainOverview'),
                  t('card.explainBrokerFlow', { count: String(MAX_VISIBLE_BROKER_LINES) }),
                  t('card.explainEvents'),
                ].map((note) => (
                  <li key={note} className="note">
                    {note}
                  </li>
                ))}
              </ul>
              <Link to="/research" className="btn btn-ghost px-3 py-1.5 text-xs">
                {t('nav.howItWorks')}
              </Link>
            </div>
          </details>
        </>
      )}
    </article>
  );
}

// The selected session alone: who sold to whom, by broker group, as a Sankey.
export function SessionSankeyCard({ data, date, locale }: { data: PublicData; date: string; locale: Locale }) {
  const { t } = useTranslation();
  const flow = useMemo(() => buildSessionFlow(data, date), [data, date]);
  if (flow === null || flow.total === 0) {
    return <p className="py-6 text-center text-sm text-muted">{ui(locale).sankeyEmpty || t('states.empty')}</p>;
  }
  return <SessionSankey flow={flow} date={date} locale={locale} />;
}

// The session comparison chart with a switch to cumulative group flows. Used by
// the Overview tab and by the stock analysis page.
export function SessionFlowChart({
  view,
  locale,
  onOpenEvidence,
}: {
  view: StockView;
  locale: Locale;
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const [showCumulative, setShowCumulative] = useState(false);
  const lens = view.lens;
  const lensFactId = lens.available && lens.factId !== null ? lens.factId : null;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="eyebrow">{t('card.compareTitle')}</p>
        <div
          role="group"
          aria-label={t('card.compareViewAria')}
          className="flex shrink-0 overflow-hidden rounded-lg border border-line text-xs"
        >
          <button
            type="button"
            aria-pressed={!showCumulative}
            onClick={() => setShowCumulative(false)}
            className={`px-2.5 py-1 transition-colors ${
              showCumulative ? 'text-muted hover:bg-canvas' : 'bg-brand/10 font-semibold text-ink'
            }`}
          >
            {t('card.compareViewSession')}
          </button>
          <button
            type="button"
            aria-pressed={showCumulative}
            onClick={() => setShowCumulative(true)}
            className={`border-l border-line px-2.5 py-1 transition-colors ${
              showCumulative ? 'bg-brand/10 font-semibold text-ink' : 'text-muted hover:bg-canvas'
            }`}
          >
            {t('card.compareViewCumulative')}
          </button>
        </div>
      </div>
      {showCumulative ? (
        view.cumulativePoints.length > 0 ? (
          <Suspense fallback={<div className="h-64 w-full" aria-hidden="true" />}>
            <GroupNetChart points={view.cumulativePoints} locale={locale} />
          </Suspense>
        ) : (
          <p className="py-6 text-center text-sm text-muted">{t('states.empty')}</p>
        )
      ) : lens.available && lens.fromDate !== null && lens.toDate !== null ? (
        <Suspense fallback={<div className="h-64 w-full" aria-hidden="true" />}>
          <SessionComparisonChart
            rows={lens.rows}
            fromDate={lens.fromDate}
            toDate={lens.toDate}
            locale={locale}
            factId={lensFactId}
            onOpenEvidence={onOpenEvidence}
          />
        </Suspense>
      ) : (
        <p className="py-6 text-center text-sm text-muted">{t('changed.noPrevious')}</p>
      )}
    </>
  );
}

function OverviewTab({
  view,
  locale,
  onOpenEvidence,
}: {
  view: StockView;
  locale: Locale;
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const lens = view.lens;
  // Narrowing on lens.factId does not survive into the rows .map callback, so
  // the non-null fact id is captured once here.
  const lensFactId = lens.available && lens.factId !== null ? lens.factId : null;
  // The directional sentence is the reviewed C25 comparison claim, never a
  // dictionary key assembled in the component.
  const moveStatement =
    view.approved.claims.find((claim) => claim.claim_id === 'CL-OBS-C25-MOVE' && claim.available)?.parts
      .short[locale] ?? null;
  return (
    <div>
      <div className="card-inset p-3">
        <SessionFlowChart view={view} locale={locale} onOpenEvidence={onOpenEvidence} />
      </div>

      {lensFactId !== null ? (
        <div className="mt-3">
          {lens.missingBetween > 0 ? (
            <p className="text-xs text-muted">{t('card.compareGap', { count: String(lens.missingBetween) })}</p>
          ) : null}
          {moveStatement !== null ? (
            <p className={`${lens.missingBetween > 0 ? 'mt-1' : ''} text-sm leading-relaxed text-ink`}>
              <ClaimParts parts={moveStatement} onOpenEvidence={onOpenEvidence} />
            </p>
          ) : null}
          {lens.fromDate !== null && lens.toDate !== null ? (
            <div
              aria-hidden="true"
              className="mt-3 flex items-end justify-end border-b border-line px-0.5 pb-1.5 text-[11px] leading-tight text-muted"
            >
              <span className={LENS_NUM}>
                {t('card.comparePrevious')}
                <span className="block tabular-nums text-mutedSoft">{formatSessionDate(lens.fromDate, locale)}</span>
              </span>
              <span className={LENS_ARROW} />
              <span className={`${LENS_NUM} font-semibold text-ink`}>
                {t('card.compareSelected')}
                <span className="block font-normal tabular-nums text-mutedSoft">{formatSessionDate(lens.toDate, locale)}</span>
              </span>
              <span className={LENS_UNIT} />
            </div>
          ) : null}
          <ul className="divide-y divide-line">
            {lens.rows.map((row) => (
              <LensRowCell key={row.group} row={row} factId={lensFactId} onOpenEvidence={onOpenEvidence} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function LensRowCell({
  row,
  factId,
  onOpenEvidence,
}: {
  row: LensRow;
  factId: string;
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}) {
  const { t, locale } = useTranslation();
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-1.5 text-sm">
      <GroupChip group={row.group} plain />
      <EvidenceButton quiet factId={factId} onActivate={onOpenEvidence} className="inline-flex items-baseline">
        <span className={`${LENS_NUM} ${signedClass(row.fromLots)}`}>{formatSigned(row.fromLots, locale)}</span>
        <span aria-hidden="true" className={`${LENS_ARROW} text-xs text-muted`}>
          {row.toLots > row.fromLots ? '▲' : row.toLots < row.fromLots ? '▼' : '·'}
        </span>
        <span className={`${LENS_NUM} ${signedClass(row.toLots)}`}>{formatSigned(row.toLots, locale)}</span>
        <span className={`${LENS_UNIT} text-xs text-muted`}>{t('stock.flowLotsUnit')}</span>
      </EvidenceButton>
    </li>
  );
}

type BrokerSection = 'trends' | 'checks';

function BrokerFlowTab({
  context,
  data,
  checks,
  locale,
  onOpenEvidence,
}: {
  context: FactsContext;
  data: FactsData;
  checks: readonly StreakCheckView[];
  locale: Locale;
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<BrokerSection>('trends');

  return (
    <div>
      <div
        role="group"
        aria-label={t('card.flowViewAria')}
        className="mb-3 flex w-fit overflow-hidden rounded-lg border border-line text-xs"
      >
        <button
          type="button"
          aria-pressed={section === 'trends'}
          onClick={() => setSection('trends')}
          className={`px-3 py-1.5 transition-colors ${
            section === 'trends' ? 'bg-brand/10 font-semibold text-ink' : 'text-muted hover:bg-canvas'
          }`}
        >
          {t('card.flowViewTrends')}
        </button>
        <button
          type="button"
          aria-pressed={section === 'checks'}
          onClick={() => setSection('checks')}
          className={`border-l border-line px-3 py-1.5 transition-colors ${
            section === 'checks' ? 'bg-brand/10 font-semibold text-ink' : 'text-muted hover:bg-canvas'
          }`}
        >
          {t('card.flowViewChecks')}
        </button>
      </div>
      {section === 'trends' ? (
        <div className="card-inset p-3">
          <p className="eyebrow">{t('stock.brokerFlowTitle')}</p>
          <BrokerTrends context={context} data={data} locale={locale} onOpenEvidence={onOpenEvidence} />
        </div>
      ) : (
        <ChecksPanel checks={checks} onOpenEvidence={onOpenEvidence} />
      )}
    </div>
  );
}

// Daily net flow for up to three chosen brokers, with the picker that chooses
// them. Used by the Broker flow tab and by the stock analysis page.
export function BrokerTrends({
  context,
  data,
  locale,
  onOpenEvidence,
}: {
  context: FactsContext;
  data: FactsData;
  locale: Locale;
  onOpenEvidence: (factId: string, trigger: HTMLElement, focus?: EvidenceFocus) => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  // Built once per context to read the default selection, then rebuilt only when
  // the evaluator changes which brokers are on screen.
  const probe = useMemo(() => buildBrokerSeries(context, data, []), [context, data]);
  const [selected, setSelected] = useState<readonly string[] | null>(null);
  const codes = selected ?? probe?.defaultCodes ?? [];
  const series = useMemo(
    () => (codes.length === 0 ? probe : buildBrokerSeries(context, data, codes)),
    [codes, probe, context, data],
  );

  if (probe === null || series === null || probe.summaries.length === 0) {
    return <p className="mt-2 py-6 text-center text-sm text-muted">{t('card.brokerNone')}</p>;
  }

  const toggle = (code: string) =>
    setSelected((current) => {
      const active = current ?? probe.defaultCodes;
      return active.includes(code)
        ? active.filter((entry) => entry !== code)
        : active.length >= MAX_VISIBLE_BROKER_LINES
          ? active
          : [...active, code];
    });

  const copy = ui(locale);
  const atMax = codes.length >= MAX_VISIBLE_BROKER_LINES;

  return (
    <>
      <p className="mt-1 text-xs leading-relaxed text-muted">{copy.brokerSubtitle}</p>
      {codes.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">{t('card.brokerNone')}</p>
      ) : (
        <div className="mt-2">
          <Suspense fallback={<div className="h-64 w-full" aria-hidden="true" />}>
            <BrokerFlowChart points={series.points} codes={codes} locale={locale} />
          </Suspense>
          <p className="note mt-1">{copy.brokerCarryNote}</p>
        </div>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <ul className="grid flex-1 gap-2 sm:grid-cols-3" aria-label={t('stock.brokerFlowTitle')}>
          {codes.map((code, index) => {
            const summary = series.summaries.find((entry) => entry.brokerCode === code);
            if (!summary) return null;
            return (
              <li key={code} className="card-inset flex items-start gap-2.5 p-2.5">
                <span
                  aria-hidden="true"
                  className="mt-2 h-1 w-4 shrink-0 rounded-full"
                  style={{ background: BROKER_LINE_COLOURS[index % BROKER_LINE_COLOURS.length] }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold tabular-nums text-ink">{summary.brokerCode}</span>
                    <button
                      type="button"
                      onClick={() => toggle(code)}
                      aria-label={copy.brokerRemove(code)}
                      className="rounded p-0.5 text-mutedSoft transition-colors hover:text-ink"
                    >
                      <Icon name="close" className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[15px] text-muted">
                    <span aria-hidden="true" style={groupDotStyle(summary.group, 10)} />
                    <span className="truncate">{groupText(summary.group, t)}</span>
                  </p>
                  <p className="mt-1 text-[15px] text-muted">
                    {copy.brokerTotal}{' '}
                    <EvidenceButton
                      quiet
                      factId={summary.factId}
                      className={`tabular-nums ${signedClass(summary.netLots)}`}
                      onActivate={(id, trigger) => onOpenEvidence(id, trigger, { brokerCode: code })}
                    >
                      {formatSigned(summary.netLots, locale)} {t('stock.flowLotsUnit')}
                    </EvidenceButton>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-col justify-center gap-1 sm:w-44">
          <button
            ref={pickerTriggerRef}
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            disabled={atMax}
            className="btn btn-primary justify-center px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          >
            {copy.brokerAdd}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            aria-haspopup="dialog"
            className="text-xs font-semibold text-brandDeep underline decoration-dotted underline-offset-4 hover:text-brand"
          >
            {t('card.brokerChoose')}
          </button>
          {atMax ? <p className="note">{copy.brokerMax}</p> : null}
        </div>
      </div>
      {pickerOpen ? (
        <BrokerPickerDialog
          summaries={probe.summaries}
          selected={codes}
          maxLines={MAX_VISIBLE_BROKER_LINES}
          onToggle={toggle}
          onReset={() => setSelected(null)}
          onClose={() => setPickerOpen(false)}
          trigger={pickerTriggerRef.current}
        />
      ) : null}
    </>
  );
}

function ChecksPanel({
  checks,
  onOpenEvidence,
}: {
  checks: readonly StreakCheckView[];
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}) {
  const { t, locale } = useTranslation();
  return (
    <div>
      <ul className="space-y-3">
        {checks.map((check) => (
          <li key={check.key} className="card-inset p-3">
            <div className="flex items-start gap-3">
              {check.available && check.approximate ? (
                <EvidenceButton
                  quiet
                  factId={check.factId}
                  onActivate={onOpenEvidence}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold no-underline ${checkBadgeClass(check.status)}`}
                >
                  <span aria-hidden="true">{check.status === 'passes' ? '✓' : check.status === 'fails' ? '✕' : '?'}</span>
                  {pickText(check.approximate, locale)}
                </EvidenceButton>
              ) : (
                <span className="chip chip-line shrink-0 px-2.5 py-1 text-xs text-muted">{t('status.notEnough')}</span>
              )}
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
                {check.note ? pickText(check.note, locale) : ''}
              </p>
            </div>
            {check.available && check.cells.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] text-mutedSoft">{t('card.flowChecksDaily')}</p>
                <ol className="mt-1.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${check.cells.length}, minmax(0, 1fr))` }}>
                  {check.cells.map((cell) => (
                    <li key={cell.date}>
                      <EvidenceButton
                        quiet
                        factId={check.factId}
                        onActivate={onOpenEvidence}
                        className={`flex w-full flex-col items-center gap-0.5 rounded-md border py-1.5 no-underline ${
                          cell.ok ? 'border-buy/30 bg-buy/10 text-buy' : 'border-sell/30 bg-sell/10 text-sell'
                        }`}
                      >
                        <span aria-hidden="true" className={`text-sm font-bold leading-none ${cell.ok ? 'text-buy' : 'text-sell'}`}>
                          {cell.ok ? '✓' : '✕'}
                        </span>
                        <span className="text-[11px] leading-tight tabular-nums text-muted">
                          {formatSessionDate(cell.date, locale)}
                        </span>
                      </EvidenceButton>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {!check.available && check.unavailableReason ? (
              <p className="mt-2 text-xs text-muted">{pickText(check.unavailableReason, locale)}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="note mt-3">{t('card.streakDifference')}</p>
    </div>
  );
}

function checkBadgeClass(status: PredicateStatus | null): string {
  if (status === 'passes') return 'border-buy/30 bg-buy/10 text-buy';
  if (status === 'fails') return 'border-sell/30 bg-sell/10 text-sell';
  return 'border-line bg-surfaceAlt text-muted';
}

function EventsTab({ events }: { events: readonly EventView[] }) {
  const { t, locale } = useTranslation();
  if (events.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-unknown/50 px-3 py-3 text-sm leading-relaxed text-muted">
        {t('preview.noObservations')}
      </p>
    );
  }
  return (
    <div>
      <ol className="relative space-y-3 border-l border-line pl-4">
        {events.map((event) => (
          <li key={event.id} className="relative">
            <span aria-hidden="true" className="absolute -left-[1.35rem] top-1.5 h-2 w-2 rounded-full bg-brand" />
            <p className="text-[11px] tabular-nums text-mutedSoft">
              {formatSessionDate(event.publicationDate, locale)}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed text-ink">{event.text}</p>
            <p className="mt-0.5 text-xs text-muted">
              <a
                href={event.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-dotted decoration-lineStrong underline-offset-4 hover:decoration-brand"
              >
                {event.sourceName}
              </a>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RawFlowRows({
  view,
  locale,
  onOpenEvidence,
}: {
  view: StockView;
  locale: Locale;
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  if (!view.flow.available) {
    return <p className="note">{t('states.unavailable')}</p>;
  }
  const columns: { label: string; entries: { brokerCode: string; netLots: number; factId: string }[] }[] = [
    { label: t('stock.flowTopBuyers'), entries: view.flow.topBuyers },
    { label: t('stock.flowTopSellers'), entries: view.flow.topSellers },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {columns.map((column) => (
        <div key={column.label}>
          <p className="eyebrow">{column.label}</p>
          <ul className="mt-1 divide-y divide-line">
            {column.entries.map((entry) => (
              <li key={entry.brokerCode} className="flex items-baseline justify-between gap-2 py-1 text-xs">
                <span className="font-semibold tabular-nums text-ink">{entry.brokerCode}</span>
                <EvidenceButton factId={entry.factId} onActivate={onOpenEvidence}>
                  <span className={`tabular-nums ${signedClass(entry.netLots)}`}>{formatSigned(entry.netLots, locale)}</span>
                  <span className="ml-1 text-muted">{t('stock.flowLotsUnit')}</span>
                </EvidenceButton>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="note sm:col-span-2">{t('stock.flowLotsNote')}</p>
    </div>
  );
}

function FactIdList({
  label,
  factIds,
  onOpenEvidence,
}: {
  label: string;
  factIds: readonly string[];
  onOpenEvidence: (factId: string, trigger: HTMLElement) => void;
}) {
  if (factIds.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span className="eyebrow">{label}</span>
      {factIds.map((factId) => (
        <EvidenceButton key={factId} factId={factId} className="break-all text-muted" onActivate={onOpenEvidence}>
          {factId}
        </EvidenceButton>
      ))}
    </p>
  );
}

function ClaimParts({
  parts,
  onOpenEvidence,
}: {
  parts: readonly RenderedPart[];
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

function GroupChip({ group, plain = false }: { group: BrokerGroup; plain?: boolean }) {
  const { t } = useTranslation();
  const label = groupText(group, t);
  if (group === 'unknown') return <span className="font-medium text-muted">{label}</span>;
  return plain ? <span className="font-medium text-ink">{label}</span> : <span className="text-xs text-muted">{label}</span>;
}

function groupText(group: BrokerGroup, t: (key: MessageKey) => string): string {
  if (group === 'app_facing') return t('stock.groupApp');
  if (group === 'institution_facing') return t('stock.groupInstitution');
  if (group === 'other_mixed') return t('stock.groupOther');
  return t('stock.groupUnknown');
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
