// The portfolio analytics card: Performance / Allocation / Contribution tabs
// over the current-holdings model, plus the "Explain my portfolio" rule-based
// preview below it. Every number on screen opens the same evidence drawer the
// broker facts use, built from the portfolio facts document. Unavailable states
// are honest and name what is missing instead of hiding holdings.
//
// BriefPortfolioValue is the compact summary the Brief screen embeds under the
// holding rows: the same model, session controls and evidence, one value chart.

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { buildApprovedClaims, type ApprovedClaim } from '../ai/claims';
import { usePortfolioAnalytics } from '../data/portfolioPrices';
import { briefCutoffMs } from '../engine/brief';
import { buildPortfolioEvidenceView, type EvidenceView } from '../engine/evidence';
import { pickText, type FactsContext, type FactKey, type Fact } from '../engine/facts';
import { portfolioAnalyticsContext, buildPortfolioFacts } from '../engine/portfolioFacts';
import type { PortfolioAnalytics, PortfolioUnavailable, PortfolioUnavailableCode, PriceSeries } from '../engine/portfolio';
import { formatSessionDate, useTranslation, type MessageKey } from '../i18n';
import { useContextStore } from '../store/contextStore';
import { EvidenceButton } from './EvidenceButton';
import { EvidenceDrawer } from './EvidenceDrawer';
import { AllocationBars, ContributionBars, idrCompact, signedPercent } from './PortfolioCharts';
import {
  PortfolioAllocationChart as PortfolioAllocationChartSync,
  PortfolioPerformanceChart as PortfolioPerformanceChartSync,
  PortfolioValueChart as PortfolioValueChartSync,
} from './charts/PortfolioLineCharts';
import { Tabs, type TabSpec } from './TabList';

// Same lazy/sync split the stock screen uses, so the Recharts charts stay in
// their own chunk in the browser and still render during server-side tests.
const PortfolioValueChart = import.meta.env.SSR
  ? PortfolioValueChartSync
  : lazy(() => import('./charts/PortfolioLineCharts').then((m) => ({ default: m.PortfolioValueChart })));
const PortfolioPerformanceChart = import.meta.env.SSR
  ? PortfolioPerformanceChartSync
  : lazy(() => import('./charts/PortfolioLineCharts').then((m) => ({ default: m.PortfolioPerformanceChart })));
const PortfolioAllocationChart = import.meta.env.SSR
  ? PortfolioAllocationChartSync
  : lazy(() => import('./charts/PortfolioLineCharts').then((m) => ({ default: m.PortfolioAllocationChart })));

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

const SESSION_CHOICES: readonly number[] = [3, 5, 7];
const PORTFOLIO_CLAIM_IDS = ['CL-PORT-PERF', 'CL-PORT-BENCH', 'CL-PORT-CONTRIB', 'CL-PORT-ALLOC'] as const;

const TONE_CLASS: Record<string, string> = {
  buy: 'font-semibold text-buy',
  sell: 'font-semibold text-sell',
  neutral: '',
};

type OpenEvidence = (factId: string, trigger: HTMLButtonElement) => void;

export function PortfolioAnalyticsCard() {
  const { t, locale } = useTranslation();
  const taxonomyVersion = useContextStore((state) => state.taxonomyVersion);
  const claimVersion = useContextStore((state) => state.claimVersion);
  const [sessions, setSessions] = useState(5);
  const [evidenceRequest, setEvidenceRequest] = useState<{ factId: string; trigger: HTMLButtonElement } | null>(null);
  const { prices, result } = usePortfolioAnalytics(sessions);

  // A changed window or language is a different context, so an open drawer
  // closes rather than showing numbers the card no longer states.
  useEffect(() => setEvidenceRequest(null), [sessions, locale]);

  const analytics = result !== null && result.kind === 'ok' ? result.analytics : null;

  const portfolioContext = useMemo<FactsContext | null>(
    () =>
      analytics !== null
        ? portfolioAnalyticsContext({ analytics, locale, taxonomyVersion, claimVersion })
        : null,
    [analytics, locale, taxonomyVersion, claimVersion],
  );

  const approved = useMemo(() => {
    if (analytics === null || portfolioContext === null) return null;
    const document = buildPortfolioFacts(portfolioContext, analytics);
    return { document, claims: buildApprovedClaims(portfolioContext, document).claims };
  }, [analytics, portfolioContext]);

  const factsByKey = useMemo(
    () =>
      approved === null
        ? null
        : (new Map(approved.document.facts.map((fact) => [fact.key, fact])) as ReadonlyMap<FactKey, Fact>),
    [approved],
  );

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

  if (prices.status === 'loading') {
    return (
      <section aria-labelledby="analytics-title" className="card card-pad">
        <h2 id="analytics-title" className="text-base font-semibold tracking-tight">
          {t('analytics.title')}
        </h2>
        <p className="mt-3 text-sm text-muted">{t('analytics.loading')}</p>
      </section>
    );
  }

  if (result === null || result.kind === 'unavailable') {
    const reason = result !== null && result.kind === 'unavailable' ? result.reason : null;
    return (
      <>
        <section aria-labelledby="analytics-title" className="card card-pad">
          <h2 id="analytics-title" className="text-base font-semibold tracking-tight">
            {t('analytics.title')}
          </h2>
          <div className="mt-3 rounded-xl border border-dashed border-line bg-surfaceAlt p-4">
            <p className="text-sm leading-relaxed text-muted">
              {reason === null ? t('analytics.loading') : unavailableMessage(reason, sessions, t)}
            </p>
            {reason !== null && reason.symbols.length > 0 ? (
              <p className="mt-2 text-xs tabular-nums text-mutedSoft">{reason.symbols.join(' · ')}</p>
            ) : null}
          </div>
          {prices.failures.length > 0 ? <PriceFailureNotes failures={prices.failures} /> : null}
        </section>
        {evidenceRequest && evidenceView ? (
          <EvidenceDrawer
            view={evidenceView}
            cutoffAt={portfolioContext?.cutoffAt ?? ''}
            trigger={evidenceRequest.trigger}
            onClose={() => setEvidenceRequest(null)}
          />
        ) : null}
      </>
    );
  }

  // result.kind === 'ok' from here; analytics and approved are non-null.
  const model = analytics as PortfolioAnalytics;
  const windowLabel = `${formatSessionDate(model.startDate, locale)} – ${formatSessionDate(model.endDate, locale)}`;
  const p01 = factId('P01');
  const p04 = factId('P04');
  // P05 is the complete per-symbol breakdown, so a row's number opens a fact
  // that carries its own symbol rather than the largest holding's. P02 and P03
  // stay as the summary facts behind the explain sentences.
  const p05 = factId('P05');

  const tabs: readonly TabSpec[] = [
    {
      id: 'performance',
      label: t('analytics.tabPerformance'),
      content: (
        <div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <div>
              <dt className="eyebrow">{t('analytics.startValue')}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                <EvidenceButton factId={p01} onActivate={openEvidence}>
                  {idrCompact(model.startValue, locale)}
                </EvidenceButton>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t('analytics.endValue')}</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                <EvidenceButton factId={p01} onActivate={openEvidence}>
                  {idrCompact(model.endValue, locale)}
                </EvidenceButton>
              </dd>
            </div>
            <div>
              <dt className="eyebrow">{t('analytics.change')}</dt>
              <dd
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  model.returnFraction > 0 ? 'text-buy' : model.returnFraction < 0 ? 'text-sell' : ''
                }`}
              >
                <EvidenceButton factId={p01} onActivate={openEvidence}>
                  {signedPercent(model.returnFraction, locale)}
                </EvidenceButton>
              </dd>
            </div>
            {model.benchmark !== null ? (
              <div>
                <dt className="eyebrow">{t('analytics.benchmarkChange', { symbol: model.benchmark.symbol })}</dt>
                <dd
                  className={`mt-0.5 text-sm font-semibold tabular-nums ${
                    model.benchmark.returnFraction > 0
                      ? 'text-buy'
                      : model.benchmark.returnFraction < 0
                        ? 'text-sell'
                        : ''
                  }`}
                >
                  <EvidenceButton factId={p01} onActivate={openEvidence}>
                    {signedPercent(model.benchmark.returnFraction, locale)}
                  </EvidenceButton>
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-4">
            <Suspense fallback={<div className="h-56 w-full" aria-hidden="true" />}>
              <PortfolioPerformanceChart
                analytics={model}
                benchmarkSeries={prices.benchmark?.series ?? null}
                locale={locale}
              />
            </Suspense>
          </div>
        </div>
      ),
    },
    {
      id: 'allocation',
      label: t('analytics.tabAllocation'),
      content: (
        <div>
          <AllocationBars analytics={model} locale={locale} factId={p05} onOpenEvidence={openEvidence} />
          <p className="note mt-3">{t('analytics.allocation.note', { date: formatSessionDate(model.endDate, locale) })}</p>
        </div>
      ),
    },
    {
      id: 'contribution',
      label: t('analytics.tabContribution'),
      content: (
        <div>
          <ContributionBars analytics={model} locale={locale} factId={p05} onOpenEvidence={openEvidence} />
          <p className="note mt-3">
            {t('analytics.contribution.note', {
              start: formatSessionDate(model.startDate, locale),
              end: formatSessionDate(model.endDate, locale),
            })}
          </p>
        </div>
      ),
    },
  ];

  const portClaims =
    approved === null
      ? []
      : approved.claims.filter((claim) =>
          (PORTFOLIO_CLAIM_IDS as readonly string[]).includes(claim.claim_id),
        );
  const explainCaveats = [
    ...new Set(portClaims.flatMap((claim) => claim.caveats.map((caveat) => pickText(caveat, locale)))),
  ];

  return (
    <>
      <section aria-labelledby="analytics-title" className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="analytics-title" className="text-base font-semibold tracking-tight">
            {t('analytics.title')}
          </h2>
          <span className="chip chip-line">{basisChip(model.basis, t)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="group" aria-label={t('analytics.sessionsLabel')} className="flex flex-wrap gap-1.5">
            {SESSION_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                aria-pressed={sessions === choice}
                onClick={() => setSessions(choice)}
                className={sessions === choice ? 'chip chip-brand' : 'chip chip-line'}
              >
                {t('analytics.sessionsOption', { count: String(choice) })}
              </button>
            ))}
          </div>
          <span className="text-xs tabular-nums text-muted">{windowLabel}</span>
        </div>

        <div className="mt-4">
          <Tabs tabs={tabs} ariaLabel={t('analytics.tabsLabel')} idPrefix="portfolio-analytics" />
        </div>

        <footer className="mt-5 space-y-1.5 border-t border-line pt-3">
          <p className="note">
            <EvidenceButton factId={p04} onActivate={openEvidence}>
              {t('analytics.commonCloses', { count: String(model.commonCloses) })}
            </EvidenceButton>
          </p>
          <p className="note">{t('analytics.modelNote')}</p>
          {model.basis === 'sample' ? <p className="note">{t('analytics.sampleNote')}</p> : null}
          {model.benchmark === null ? <p className="note">{t('analytics.noBenchmarkNote')}</p> : null}
        </footer>

        {prices.failures.length > 0 ? <PriceFailureNotes failures={prices.failures} /> : null}
      </section>

      <section aria-labelledby="portfolio-explain-title" className="card card-pad">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="portfolio-explain-title" className="text-base font-semibold tracking-tight">
            {t('analytics.explainTitle')}
          </h2>
          <span className="chip chip-line">{t('stock.ruleBasedBadge')}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('analytics.explainIntro')}</p>
        {portClaims.length > 0 ? (
          <ul className="mt-3 divide-y divide-line">
            {portClaims.map((claim) => (
              <ExplainClaim key={claim.claim_id} claim={claim} locale={locale} onOpenEvidence={openEvidence} />
            ))}
          </ul>
        ) : null}
        {explainCaveats.length > 0 ? (
          <footer className="mt-4 space-y-1 border-t border-line pt-3">
            {explainCaveats.map((caveat) => (
              <p key={caveat} className="note">
                {caveat}
              </p>
            ))}
          </footer>
        ) : null}
      </section>

      {evidenceRequest && evidenceView ? (
        <EvidenceDrawer
          view={evidenceView}
          cutoffAt={portfolioContext?.cutoffAt ?? ''}
          trigger={evidenceRequest.trigger}
          onClose={() => setEvidenceRequest(null)}
        />
      ) : null}
    </>
  );
}

export function BriefPortfolioValue({ morning }: { morning: string | null }) {
  const { t, locale } = useTranslation();
  const taxonomyVersion = useContextStore((state) => state.taxonomyVersion);
  const claimVersion = useContextStore((state) => state.claimVersion);
  const [sessions, setSessions] = useState(5);
  const [evidenceRequest, setEvidenceRequest] = useState<{ factId: string; trigger: HTMLButtonElement } | null>(null);
  // The selected morning decides which sessions a price may come from, so an
  // August Brief can never expose a September value in the visible UI, the DOM, a
  // tooltip, the evidence or the explanation.
  const cutoffMs = useMemo(() => (morning !== null ? briefCutoffMs(morning) : null), [morning]);
  const { prices, result } = usePortfolioAnalytics(sessions, cutoffMs);

  // An open drawer describes one context. A changed morning, window or language
  // closes it instead of leaving the previous context's numbers on screen.
  useEffect(() => setEvidenceRequest(null), [morning, sessions, locale]);

  const analytics = result !== null && result.kind === 'ok' ? result.analytics : null;

  const portfolioContext = useMemo<FactsContext | null>(
    () =>
      analytics !== null
        ? portfolioAnalyticsContext({ analytics, locale, taxonomyVersion, claimVersion })
        : null,
    [analytics, locale, taxonomyVersion, claimVersion],
  );

  const approved = useMemo(() => {
    if (analytics === null || portfolioContext === null) return null;
    const document = buildPortfolioFacts(portfolioContext, analytics);
    return { document, claims: buildApprovedClaims(portfolioContext, document).claims };
  }, [analytics, portfolioContext]);

  const factsByKey = useMemo(
    () =>
      approved === null
        ? null
        : (new Map(approved.document.facts.map((fact) => [fact.key, fact])) as ReadonlyMap<FactKey, Fact>),
    [approved],
  );
  const p01 = factsByKey?.get('P01')?.fact_id ?? '';
  // The dated weight history: every weight the allocation lines print, including
  // the legend's start, end and change, opens this fact.
  const p06 = factsByKey?.get('P06')?.fact_id ?? '';

  const openEvidence = (factId: string, trigger: HTMLButtonElement) => setEvidenceRequest({ factId, trigger });

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

  if (prices.status === 'loading') {
    return <p className="text-sm text-muted">{t('analytics.loading')}</p>;
  }

  if (result === null || result.kind === 'unavailable') {
    const reason = result !== null && result.kind === 'unavailable' ? result.reason : null;
    return (
      <div>
        <p className="text-sm leading-relaxed text-muted">
          {reason === null ? t('analytics.loading') : unavailableMessage(reason, sessions, t)}
        </p>
        {reason !== null && reason.symbols.length > 0 ? (
          <p className="mt-2 text-xs tabular-nums text-mutedSoft">{reason.symbols.join(' · ')}</p>
        ) : null}
        {prices.failures.length > 0 ? <PriceFailureNotes failures={prices.failures} /> : null}
      </div>
    );
  }

  // result.kind === 'ok' from here; analytics and portfolioContext are non-null.
  const model = analytics as PortfolioAnalytics;
  const windowLabel = `${formatSessionDate(model.startDate, locale)} – ${formatSessionDate(model.endDate, locale)}`;

  // Allocation opens first: the weight lines are what the selected 3/5/7 window
  // actually changed. Both tabs read the same window, so the session controls
  // above move them together.
  const chartTabs: readonly TabSpec[] = [
    {
      id: 'performance',
      label: t('analytics.tabPerformance'),
      content: (
        <Suspense fallback={<div className="h-40 w-full" aria-hidden="true" />}>
          <PortfolioValueChart analytics={model} locale={locale} compact />
        </Suspense>
      ),
    },
    {
      id: 'allocation',
      label: t('analytics.tabAllocation'),
      content: (
        <div>
          <Suspense fallback={<div className="h-40 w-full" aria-hidden="true" />}>
            <PortfolioAllocationChart
              analytics={model}
              locale={locale}
              factId={p06}
              onOpenEvidence={openEvidence}
              compact
            />
          </Suspense>
          <p className="note mt-2">{t('analytics.allocationDrift')}</p>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-semibold tracking-tight">{t('brief.valueTitle')}</p>
        <span className="text-xs tabular-nums text-muted">{windowLabel}</span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div role="group" aria-label={t('analytics.sessionsLabel')} className="flex flex-wrap gap-1.5">
          {SESSION_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              aria-pressed={sessions === choice}
              onClick={() => setSessions(choice)}
              className={sessions === choice ? 'chip chip-brand' : 'chip chip-line'}
            >
              {t('analytics.sessionsOption', { count: String(choice) })}
            </button>
          ))}
        </div>
        <span
          className={`text-sm font-semibold tabular-nums ${
            model.returnFraction > 0 ? 'text-buy' : model.returnFraction < 0 ? 'text-sell' : ''
          }`}
        >
          <EvidenceButton factId={p01} onActivate={openEvidence}>
            {signedPercent(model.returnFraction, locale)}
          </EvidenceButton>
          <span className="mx-1.5 text-muted" aria-hidden="true">
            ·
          </span>
          <EvidenceButton factId={p01} onActivate={openEvidence}>
            {idrCompact(model.endValue, locale)}
          </EvidenceButton>
        </span>
      </div>
      <div className="mt-3">
        <Tabs
          tabs={chartTabs}
          ariaLabel={t('analytics.chartTabsLabel')}
          idPrefix="brief-portfolio"
          initialTab="allocation"
        />
      </div>
      <p className="note mt-2">{t('brief.valueNote')}</p>
      {prices.failures.length > 0 ? <PriceFailureNotes failures={prices.failures} /> : null}
      {evidenceRequest && evidenceView ? (
        <EvidenceDrawer
          view={evidenceView}
          cutoffAt={portfolioContext?.cutoffAt ?? ''}
          trigger={evidenceRequest.trigger}
          onClose={() => setEvidenceRequest(null)}
        />
      ) : null}
    </div>
  );
}

function ExplainClaim({
  claim,
  locale,
  onOpenEvidence,
}: {
  claim: ApprovedClaim;
  locale: 'en' | 'id' | 'zh-CN';
  onOpenEvidence: OpenEvidence;
}) {
  const parts = claim.parts.explained[locale];
  if (!claim.available || parts === null) return null;
  return (
    <li className="py-2.5 first:pt-0 last:pb-0">
      <p className="text-sm leading-relaxed text-ink">
        {parts.map((part, index) =>
          part.kind === 'value' ? (
            <EvidenceButton
              key={`${claim.claim_id}-${index}`}
              factId={part.factId ?? ''}
              className={TONE_CLASS[part.tone ?? 'neutral']}
              onActivate={onOpenEvidence}
            >
              {part.text}
            </EvidenceButton>
          ) : (
            <span key={`${claim.claim_id}-${index}`}>{part.text}</span>
          ),
        )}
      </p>
    </li>
  );
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

function basisChip(basis: 'real' | 'sample', t: Translate): string {
  return t(basis === 'sample' ? 'analytics.basisSample' : 'analytics.basisReal');
}

function unavailableMessage(reason: PortfolioUnavailable, sessions: number, t: Translate): string {
  return t(UNAVAILABLE_KEYS[reason.code], {
    symbols: reason.symbols.join(', '),
    sessions: String(sessions),
    needed: String(sessions + 1),
    found: String(reason.found ?? 0),
  });
}
