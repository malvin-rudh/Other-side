// The portfolio analytics card: an exchange-style summary, then Performance
// (portfolio against the index) and Allocation tabs, over the current-holdings
// model and every common close up to the cutoff. Every number on screen opens
// the same evidence drawer the broker facts use. Unavailable states are honest
// and name what is missing instead of hiding holdings.
//
// BriefPortfolioValue is the compact summary the Brief screen embeds under the
// holding rows: the same model and evidence, one chart with a legend.

import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePortfolioAnalytics } from '../data/portfolioPrices';
import { briefCutoffMs } from '../engine/brief';
import { buildPortfolioEvidenceView, type EvidenceView } from '../engine/evidence';
import type { FactsContext, FactKey, Fact } from '../engine/facts';
import { portfolioAnalyticsContext, buildPortfolioFacts } from '../engine/portfolioFacts';
import type { PortfolioAnalytics, PortfolioUnavailable, PortfolioUnavailableCode, PriceSeries } from '../engine/portfolio';
import type { Locale } from '../engine/context';
import { formatSessionDate, intlLocale, useTranslation, type MessageKey } from '../i18n';
import { useContextStore, type PortfolioEntry } from '../store/contextStore';
import { EvidenceButton } from './EvidenceButton';
import { Disclaimer } from './Disclaimer';
import { EvidenceDrawer } from './EvidenceDrawer';
import { idrCompact, signedPercent } from './PortfolioCharts';
import {
  PortfolioAllocationPie as PortfolioAllocationPieSync,
  PortfolioPerformanceChart as PortfolioPerformanceChartSync,
} from './charts/PortfolioLineCharts';
import { Tabs, type TabSpec } from './TabList';

// Same lazy/sync split the stock screen uses, so the Recharts charts stay in
// their own chunk in the browser and still render during server-side tests.
const PortfolioPerformanceChart = import.meta.env.SSR
  ? PortfolioPerformanceChartSync
  : lazy(() => import('./charts/PortfolioLineCharts').then((m) => ({ default: m.PortfolioPerformanceChart })));
const PortfolioAllocationPie = import.meta.env.SSR
  ? PortfolioAllocationPieSync
  : lazy(() => import('./charts/PortfolioLineCharts').then((m) => ({ default: m.PortfolioAllocationPie })));

type Translate = (key: MessageKey, vars?: Record<string, string>) => string;

const UNAVAILABLE_KEYS: Record<PortfolioUnavailableCode, MessageKey> = {
  'no-owned': 'analytics.unavailable.no-owned',
  'missing-quantity': 'analytics.unavailable.missing-quantity',
  'invalid-quantity': 'analytics.unavailable.invalid-quantity',
  'invalid-sessions': 'analytics.unavailable.invalid-sessions',
  'missing-prices': 'analytics.unavailable.missing-prices',
  'currency-mismatch': 'analytics.unavailable.currency-mismatch',
  'mixed-sources': 'analytics.unavailable.mixed-sources',
  'unknown-session-completion': 'analytics.unavailable.unknown-session-completion',
  'insufficient-common-closes': 'analytics.unavailable.insufficient-common-closes',
  'unsafe-arithmetic': 'analytics.unavailable.unsafe-arithmetic',
  'zero-denominator': 'analytics.unavailable.zero-denominator',
};


type OpenEvidence = (factId: string, trigger: HTMLButtonElement) => void;

// The portfolio model over every common close up to the cutoff, its facts for
// the evidence drawer, and that drawer's state. Shared by the Portfolio card and
// the Brief summary so both show the same window.
function usePortfolioModel(cutoffMs: number | null, resetKey: string) {
  const { locale } = useTranslation();
  const taxonomyVersion = useContextStore((state) => state.taxonomyVersion);
  const claimVersion = useContextStore((state) => state.claimVersion);
  const [evidenceRequest, setEvidenceRequest] = useState<{ factId: string; trigger: HTMLButtonElement } | null>(null);
  const { prices, result } = usePortfolioAnalytics('all', cutoffMs);

  // A changed morning or language is a different context, so an open drawer
  // closes rather than showing numbers the card no longer states.
  useEffect(() => setEvidenceRequest(null), [resetKey, locale]);

  const analytics = result !== null && result.kind === 'ok' ? result.analytics : null;

  const portfolioContext = useMemo<FactsContext | null>(
    () =>
      analytics !== null
        ? portfolioAnalyticsContext({ analytics, locale, taxonomyVersion, claimVersion })
        : null,
    [analytics, locale, taxonomyVersion, claimVersion],
  );

  const factsByKey = useMemo(() => {
    if (analytics === null || portfolioContext === null) return null;
    const document = buildPortfolioFacts(portfolioContext, analytics);
    return new Map(document.facts.map((fact) => [fact.key, fact])) as ReadonlyMap<FactKey, Fact>;
  }, [analytics, portfolioContext]);

  const factId = (key: FactKey): string => factsByKey?.get(key)?.fact_id ?? '';
  const openEvidence: OpenEvidence = (id, trigger) => setEvidenceRequest({ factId: id, trigger });

  const evidenceView = useMemo<EvidenceView | null>(() => {
    if (evidenceRequest === null || analytics === null || portfolioContext === null) return null;
    const series = analytics.holdings
      .map((holding) => prices.seriesBySymbol.get(holding.symbol))
      .filter((entry): entry is PriceSeries => entry !== undefined);
    return buildPortfolioEvidenceView(
      evidenceRequest.factId,
      portfolioContext,
      { analytics, series, benchmarkSeries: prices.benchmark?.series ?? null },
      locale,
    );
  }, [evidenceRequest, analytics, portfolioContext, prices, locale]);

  const drawer =
    evidenceRequest && evidenceView ? (
      <EvidenceDrawer
        view={evidenceView}
        cutoffAt={portfolioContext?.cutoffAt ?? ''}
        trigger={evidenceRequest.trigger}
        onClose={() => setEvidenceRequest(null)}
      />
    ) : null;

  return { prices, result, analytics, factId, openEvidence, drawer };
}

export function PortfolioAnalyticsCard() {
  const { t, locale } = useTranslation();
  const portfolio = useContextStore((state) => state.portfolio);
  const { prices, result, analytics, factId, openEvidence, drawer } = usePortfolioModel(null, 'portfolio');

  if (prices.status === 'loading' || result === null || analytics === null) {
    const reason = result !== null && result.kind === 'unavailable' ? result.reason : null;
    return (
      <section aria-labelledby="analytics-title" className="card card-pad">
        <h2 id="analytics-title" className="text-xl font-semibold tracking-tight">
          {t('analytics.title')}
        </h2>
        <div className="mt-3 rounded-xl border border-dashed border-line bg-surfaceAlt p-4">
          <p className="text-sm leading-relaxed text-muted">
            {reason === null ? t('analytics.loading') : unavailableMessage(reason, t)}
          </p>
          {reason !== null && reason.symbols.length > 0 ? (
            <p className="mt-2 text-xs tabular-nums text-mutedSoft">{reason.symbols.join(' · ')}</p>
          ) : null}
        </div>
        {prices.failures.length > 0 ? <PriceFailureNotes failures={prices.failures} /> : null}
      </section>
    );
  }

  const tabs: readonly TabSpec[] = [
    {
      id: 'performance',
      label: t('analytics.tabPerformance'),
      content: (
        <Suspense fallback={<div className="h-56 w-full" aria-hidden="true" />}>
          <PortfolioPerformanceChart
            analytics={analytics}
            benchmarkSeries={prices.benchmark?.series ?? null}
            locale={locale}
          />
        </Suspense>
      ),
    },
    {
      id: 'allocation',
      label: t('analytics.tabAllocation'),
      content: (
        <div>
          <Suspense fallback={<div className="h-56 w-full" aria-hidden="true" />}>
            <PortfolioAllocationPie
              analytics={analytics}
              locale={locale}
              factId={factId('P05')}
              onOpenEvidence={openEvidence}
            />
          </Suspense>
          <p className="note mt-3">{t('analytics.allocation.note', { date: formatSessionDate(analytics.endDate, locale) })}</p>
        </div>
      ),
    },
  ];

  return (
    <>
      <section aria-labelledby="analytics-title" className="card card-pad">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="analytics-title" className="text-xl font-semibold tracking-tight">
            {t('analytics.title')}
          </h2>
          <span className="text-xs tabular-nums text-muted">{windowLabel(analytics, locale)}</span>
        </div>

        <div className="mt-4">
          <PerformanceSummary
            model={analytics}
            cost={costBasis(portfolio, analytics)}
            locale={locale}
            factId={factId('P01')}
            onOpenEvidence={openEvidence}
          />
        </div>

        <div className="mt-5">
          <Tabs tabs={tabs} ariaLabel={t('analytics.tabsLabel')} idPrefix="portfolio-analytics" />
        </div>

        <Disclaimer className="mt-4">{t('brief.valueNote')}</Disclaimer>
        {prices.failures.length > 0 ? <PriceFailureNotes failures={prices.failures} /> : null}
      </section>
      {drawer}
    </>
  );
}

// The Brief's portfolio summary: today's value, the change over the window and
// one chart of the portfolio against the index, with a legend.
export function BriefPortfolioValue({ morning }: { morning: string | null }) {
  const { t, locale } = useTranslation();
  // The selected morning decides which sessions a price may come from, so an
  // August Brief can never expose a September value in the visible UI, the DOM, a
  // tooltip, the evidence or the explanation.
  const cutoffMs = useMemo(() => (morning !== null ? briefCutoffMs(morning) : null), [morning]);
  const { prices, result, analytics, factId, openEvidence, drawer } = usePortfolioModel(cutoffMs, morning ?? '');

  if (prices.status === 'loading' || result === null) {
    return <p className="text-sm text-muted">{t('analytics.loading')}</p>;
  }

  if (analytics === null) {
    const reason = result.kind === 'unavailable' ? result.reason : null;
    return (
      <div>
        {reason !== null ? <Disclaimer>{unavailableMessage(reason, t)}</Disclaimer> : null}
        {prices.failures.length > 0 ? <PriceFailureNotes failures={prices.failures} /> : null}
      </div>
    );
  }

  const p01 = factId('P01');
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="text-sm font-semibold tracking-tight">{t('brief.valueTitle')}</p>
          <p className="mt-0.5 text-xs tabular-nums text-muted">{windowLabel(analytics, locale)}</p>
        </div>
        <p className="text-right">
          <span className="block text-lg font-semibold tabular-nums">
            <EvidenceButton factId={p01} onActivate={openEvidence}>
              {idrCompact(analytics.endValue, locale)}
            </EvidenceButton>
          </span>
          <span className={`text-sm font-semibold tabular-nums ${toneClass(analytics.returnFraction)}`}>
            {signedPercent(analytics.returnFraction, locale)}
          </span>
        </p>
      </div>
      <div className="mt-3">
        <Suspense fallback={<div className="h-56 w-full" aria-hidden="true" />}>
          <PortfolioPerformanceChart
            analytics={analytics}
            benchmarkSeries={prices.benchmark?.series ?? null}
            locale={locale}
          />
        </Suspense>
      </div>
      <Disclaimer className="mt-2">{t('brief.valueNote')}</Disclaimer>
      {prices.failures.length > 0 ? <PriceFailureNotes failures={prices.failures} /> : null}
      {drawer}
    </div>
  );
}

function windowLabel(model: PortfolioAnalytics, locale: Locale): string {
  return `${formatSessionDate(model.startDate, locale)} – ${formatSessionDate(model.endDate, locale)}`;
}

function PriceFailureNotes({ failures }: { failures: readonly { symbol: string; code: string; message: string }[] }) {
  const { t } = useTranslation();
  if (failures.length === 0) return null;
  return (
    <div className="mt-3 space-y-1 rounded-lg border border-dashed border-unknown/50 px-3 py-2">
      <p className="text-xs font-semibold text-muted">{t('analytics.failuresTitle')}</p>
      {failures.map((failure) => (
        <p key={failure.symbol} className="text-xs tabular-nums text-mutedSoft">
          {t('analytics.failureRow', { symbol: failure.symbol, code: failure.code })} {failure.message}
        </p>
      ))}
    </div>
  );
}

function unavailableMessage(reason: PortfolioUnavailable, t: Translate): string {
  if (reason.code === 'insufficient-common-closes') return t('analytics.notEnoughHistory');
  const found = reason.found ?? 0;
  return t(UNAVAILABLE_KEYS[reason.code], {
    symbols: reason.symbols.join(', '),
    sessions: String(Math.max(found - 1, 1)),
    needed: '2',
    found: String(found),
  });
}

// What the owned holdings cost to buy, from the purchase each one records. Null
// when any modelled holding has no average price, so a partial cost never poses
// as the whole portfolio's.
function costBasis(portfolio: readonly PortfolioEntry[], model: PortfolioAnalytics): number | null {
  let total = 0;
  for (const holding of model.holdings) {
    const entry = portfolio.find((candidate) => candidate.ticker === holding.symbol);
    if (entry === undefined || entry.averagePrice === null) return null;
    total += entry.averagePrice * holding.quantityShares;
  }
  return total;
}

function benchmarkName(symbol: string, t: Translate): string {
  return symbol === '^JKSE' ? t('analytics.indexReal') : t('analytics.indexSample');
}

function toneClass(value: number): string {
  return value > 0 ? 'text-buy' : value < 0 ? 'text-sell' : '';
}

// The exchange-style summary: what the holdings are worth, what they cost, the
// gain on cost, and the window's return against the index.
function PerformanceSummary({
  model,
  cost,
  locale,
  factId,
  onOpenEvidence,
}: {
  model: PortfolioAnalytics;
  cost: number | null;
  locale: Locale;
  factId: string;
  onOpenEvidence: OpenEvidence;
}) {
  const { t } = useTranslation();
  const gain = cost !== null ? model.endValue - cost : null;
  const excess = model.benchmark !== null ? model.returnFraction - model.benchmark.returnFraction : null;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Kpi label={t('analytics.marketValue')}>
        <EvidenceButton factId={factId} onActivate={onOpenEvidence}>
          {idrCompact(model.endValue, locale)}
        </EvidenceButton>
      </Kpi>
      <Kpi label={t('analytics.totalCost')}>{cost !== null ? idrCompact(cost, locale) : '—'}</Kpi>
      <Kpi label={t('analytics.unrealised')} tone={gain !== null ? toneClass(gain) : ''}>
        {gain !== null && cost !== null && cost > 0 ? (
          <>
            {gain > 0 ? '+' : ''}
            {idrCompact(gain, locale)}
            <span className="ml-1 text-xs">({signedPercent(gain / cost, locale)})</span>
          </>
        ) : (
          '—'
        )}
      </Kpi>
      <Kpi label={t('analytics.windowReturn', { date: formatSessionDate(model.startDate, locale) })} tone={toneClass(model.returnFraction)}>
        <EvidenceButton factId={factId} onActivate={onOpenEvidence}>
          {signedPercent(model.returnFraction, locale)}
        </EvidenceButton>
      </Kpi>
      <Kpi
        label={model.benchmark !== null ? benchmarkName(model.benchmark.symbol, t) : t('analytics.indexNone')}
        tone={model.benchmark !== null ? toneClass(model.benchmark.returnFraction) : ''}
      >
        {model.benchmark !== null ? signedPercent(model.benchmark.returnFraction, locale) : '—'}
      </Kpi>
      <Kpi label={t('analytics.vsIndex')} tone={excess !== null ? toneClass(excess) : ''}>
        {excess !== null ? (
          <>
            {excess > 0 ? '+' : ''}
            {new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(excess * 100)}{' '}
            <span className="text-xs">{t('analytics.pointsShort')}</span>
            <span className="mt-0.5 block text-[11px] font-normal text-muted">
              {excess >= 0 ? t('analytics.aheadOfIndex') : t('analytics.behindIndex')}
            </span>
          </>
        ) : (
          '—'
        )}
      </Kpi>
    </dl>
  );
}

function Kpi({ label, tone = '', children }: { label: string; tone?: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surfaceAlt px-3 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className={`mt-1 text-base font-semibold tabular-nums ${tone}`}>{children}</dd>
    </div>
  );
}
