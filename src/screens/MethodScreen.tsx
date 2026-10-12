import { useEffect, useMemo, useState } from 'react';
import { ClaimCheck } from '../components/ClaimCheck';
import { EvidenceDrawer } from '../components/EvidenceDrawer';
import { ExploreLauncher } from '../components/ExploreLauncher';
import { ReplayRadar } from '../components/ReplayRadar';
import { usePublicData } from '../data/publicData';
import { buildApprovedClaims } from '../ai/claims';
import { validateModelResponse, type ValidationResult } from '../ai/validate';
import { buildEvidenceView, type EvidenceView } from '../engine/evidence';
import type { Locale } from '../engine/context';
import { buildFacts, type FactsContext } from '../engine/facts';
import { sessionAvailableAt } from '../engine/predicates';
import { WHAT_IF_PREFIX, whatIfBrokerCode } from '../engine/whatIf';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';

const VALIDATOR_SESSION = '2026-08-24';
const VALIDATOR_REQUEST_ID = 'method-validator-demo';
const UNKNOWN_CLAIM_ID = 'CL-METHOD-DOES-NOT-EXIST';

interface ValidatorOutcome {
  wrong: ValidationResult;
  clean: ValidationResult;
  wrongClaimId: string;
  cleanClaimId: string;
  wrongIsUnknownId: boolean;
}

type MethodLayer = {
  kind: 'evidence';
  // The context the fact belongs to: tools facts resolve against the
  // latest-session document, pinned claim-check facts against the 24 Aug one.
  context: FactsContext;
  factId: string;
  trigger: HTMLButtonElement | null;
  fallback: HTMLElement | null;
};

export function MethodScreen() {
  const { t, locale } = useTranslation();
  const scenario = useContextStore((state) => state.scenario);
  const setScenario = useContextStore((state) => state.setScenario);
  const state = usePublicData('SINI');
  const [outcome, setOutcome] = useState<ValidatorOutcome | null>(null);
  const [layers, setLayers] = useState<MethodLayer[]>([]);
  const top = layers.length > 0 ? (layers[layers.length - 1] ?? null) : null;
  const evidenceLayer = top?.kind === 'evidence' ? top : null;

  const cards = [
    { title: t('method.sourceTitle'), body: t('method.sourceBody') },
    { title: t('method.limitsTitle'), body: t('method.limitsBody') },
    { title: t('method.groupsTitle'), body: t('method.groupsBody') },
    { title: t('method.replayTitle'), body: t('method.replayBody') },
    { title: t('method.codeTitle'), body: t('method.codeBody') },
    { title: t('method.priceTitle'), body: t('method.priceBody') },
    { title: t('method.costTitle'), body: t('method.costBody') },
    { title: t('method.risksTitle'), body: t('method.risksBody'), pre: true },
    { title: t('method.pilotTitle'), body: t('method.pilotBody') },
  ];

  const ready = state.status === 'ready';

  const runValidator = () => {
    if (state.status !== 'ready') return;
    const data = state.data;
    const context = {
      ticker: 'SINI',
      sessionDate: VALIDATOR_SESSION,
      cutoffAt: sessionAvailableAt(VALIDATOR_SESSION),
      periodStart: data.defaultWindow.start,
      periodEnd: data.defaultWindow.end,
      scenario: 'default',
      locale,
      dataVersion: data.versions.data,
      taxonomyVersion: data.versions.taxonomy,
      claimVersion: data.versions.claims,
    };
    const document = buildFacts(context, data);
    const approved = buildApprovedClaims(context, document);
    const cleanClaim = approved.claims.find((claim) => claim.available) ?? null;
    const futureFactClaim =
      approved.claims.find((claim) => {
        if (claim.available) return false;
        return claim.facts.some((key) => {
          const fact = approved.facts.find((entry) => entry.key === key);
          return fact !== undefined && Date.parse(fact.available_at) > Date.parse(context.cutoffAt);
        });
      }) ?? null;
    const wrongClaimId = futureFactClaim !== null ? futureFactClaim.claim_id : UNKNOWN_CLAIM_ID;
    const cleanClaimId = cleanClaim !== null ? cleanClaim.claim_id : UNKNOWN_CLAIM_ID;

    const envelope = (claimId: string): unknown => ({
      contextKey: approved.contextKey,
      requestId: VALIDATOR_REQUEST_ID,
      answer_kind: 'claims',
      claims: [{ claim_id: claimId, wording_variant: 'short' }],
      follow_up_ids: [],
    });

    const wrong = validateModelResponse({
      response: envelope(wrongClaimId),
      expectedContextKey: approved.contextKey,
      latestRequestId: VALIDATOR_REQUEST_ID,
      approved,
      cutoffAt: context.cutoffAt,
    });
    const clean = validateModelResponse({
      response: envelope(cleanClaimId),
      expectedContextKey: approved.contextKey,
      latestRequestId: VALIDATOR_REQUEST_ID,
      approved,
      cutoffAt: context.cutoffAt,
    });
    setOutcome({
      wrong,
      clean,
      wrongClaimId,
      cleanClaimId,
      wrongIsUnknownId: futureFactClaim === null,
    });
  };

  const validatorDate = useMemo(
    () => (ready ? formatValidatorDate(VALIDATOR_SESSION, locale) : ''),
    [ready, locale],
  );

  // Replay tools anchor to the latest captured session so they demo the fullest
  // window; the validator demo stays pinned to 24 Aug regardless.
  const latestSession = useMemo(() => {
    if (state.status !== 'ready') return null;
    const captured = state.data.sessions
      .filter((session) => session.status === 'captured')
      .map((session) => session.date)
      .sort();
    return captured[captured.length - 1] ?? null;
  }, [state]);

  const whatIfCode = whatIfBrokerCode(scenario);

  const toolsContext = useMemo<FactsContext | null>(() => {
    if (state.status !== 'ready' || latestSession === null) return null;
    return {
      ticker: 'SINI',
      sessionDate: latestSession,
      cutoffAt: sessionAvailableAt(latestSession),
      periodStart: state.data.defaultWindow.start,
      periodEnd: state.data.defaultWindow.end,
      scenario,
      ...(whatIfCode !== null ? { unknownBrokerCodes: [whatIfCode] as const } : {}),
      locale,
      dataVersion: state.data.versions.data,
      taxonomyVersion: state.data.versions.taxonomy,
      claimVersion: state.data.versions.claims,
    };
  }, [state, latestSession, scenario, whatIfCode, locale]);

  const toolsApproved = useMemo(() => {
    if (toolsContext === null || state.status !== 'ready') return null;
    return buildApprovedClaims(toolsContext, buildFacts(toolsContext, state.data));
  }, [toolsContext, state]);

  // The claim-check example is pinned to the 24 Aug snapshot — the validator's
  // session — so its checked answers stay stable no matter which session the
  // replay tools anchor to.
  const pinnedContext = useMemo<FactsContext | null>(() => {
    if (state.status !== 'ready') return null;
    return {
      ticker: 'SINI',
      sessionDate: VALIDATOR_SESSION,
      cutoffAt: sessionAvailableAt(VALIDATOR_SESSION),
      periodStart: state.data.defaultWindow.start,
      periodEnd: state.data.defaultWindow.end,
      scenario: 'default',
      locale,
      dataVersion: state.data.versions.data,
      taxonomyVersion: state.data.versions.taxonomy,
      claimVersion: state.data.versions.claims,
    };
  }, [state, locale]);

  const pinnedApproved = useMemo(() => {
    if (pinnedContext === null || state.status !== 'ready') return null;
    return buildApprovedClaims(pinnedContext, buildFacts(pinnedContext, state.data));
  }, [pinnedContext, state]);

  const focusRequest = useContextStore((state) => state.focusRequest);
  const clearFocusRequest = useContextStore((state) => state.clearFocusRequest);

  // The Explore "Check a claim" shortcut lands on this page: scroll to the
  // pinned claim-check control and hand it focus once the section rendered.
  useEffect(() => {
    if (focusRequest === null || focusRequest.panel !== 'claim-check') return;
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

  useEffect(() => {
    setLayers([]);
  }, [latestSession, scenario]);

  const popLayer = () => setLayers((prev) => prev.slice(0, -1));

  const openEvidence = (context: FactsContext, factId: string, trigger: HTMLButtonElement, fallback: HTMLElement | null = null) =>
    setLayers((prev) => [...prev, { kind: 'evidence', context, factId, trigger, fallback }]);

  const evidenceView: EvidenceView | null = useMemo(
    () =>
      evidenceLayer !== null && state.status === 'ready'
        ? buildEvidenceView(evidenceLayer.factId, evidenceLayer.context, state.data, locale)
        : null,
    [evidenceLayer, state, locale],
  );

  return (
    <section aria-labelledby="method-title">
      <header>
        <p className="eyebrow">{t('app.pill')}</p>
        <h1 id="method-title" className="mt-1 text-2xl font-semibold tracking-tight lg:text-[2rem] lg:leading-tight">
          {t('method.title')}
        </h1>
      </header>
      <div className="mt-5">
        <ExploreLauncher />
      </div>
      <div className="mt-4 grid items-start gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <article key={card.title} className="card card-pad">
            <h2 className="text-sm font-semibold tracking-tight text-ink">{card.title}</h2>
            <p className={`mt-2 text-sm leading-relaxed text-muted ${card.pre ? 'whitespace-pre-line' : ''}`}>
              {card.body}
            </p>
          </article>
        ))}

        <article
          aria-label={t('method.validatorTitle')}
          className="card card-pad border-l-4 border-l-brand md:col-span-2"
        >
          <h2 className="text-base font-semibold tracking-tight text-ink">{t('method.validatorTitle')}</h2>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            {t('method.validatorBody', { date: validatorDate })}
          </p>
          <button type="button" onClick={runValidator} disabled={!ready} className="btn btn-primary mt-4">
            <span aria-hidden="true">▶</span>
            {t('method.validatorButton')}
          </button>
          {outcome ? (
            <div className="mt-4 space-y-2">
              <div
                className={`card-inset flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 p-3 ${
                  outcome.wrong.ok ? 'border-l-buy' : 'border-l-sell'
                }`}
              >
                <span className={`chip ${outcome.wrong.ok ? 'chip-buy' : 'chip-sell'}`}>
                  <span aria-hidden="true">{outcome.wrong.ok ? '✓' : '✕'}</span>
                  {t(outcome.wrong.ok ? 'method.validatorAccepted' : 'method.validatorRejected')}
                </span>
                <span className="text-xs text-muted">
                  {t(outcome.wrongIsUnknownId ? 'method.validatorUnknownPlan' : 'method.validatorWrongPlan', {
                    id: outcome.wrongClaimId,
                  })}
                </span>
                {!outcome.wrong.ok ? (
                  <span className="text-xs text-muted">
                    {t('method.validatorReason', { reason: outcome.wrong.reason })}
                  </span>
                ) : null}
              </div>
              <div
                className={`card-inset flex flex-wrap items-baseline gap-x-3 gap-y-1 border-l-2 p-3 ${
                  outcome.clean.ok ? 'border-l-buy' : 'border-l-sell'
                }`}
              >
                <span className={`chip ${outcome.clean.ok ? 'chip-buy' : 'chip-sell'}`}>
                  <span aria-hidden="true">{outcome.clean.ok ? '✓' : '✕'}</span>
                  {t(outcome.clean.ok ? 'method.validatorAccepted' : 'method.validatorRejected')}
                </span>
                {outcome.clean.ok ? (
                  <span className="text-xs text-muted">
                    {t('method.validatorCleanClaim', { id: outcome.cleanClaimId })}
                  </span>
                ) : (
                  <span className="text-xs text-muted">
                    {t('method.validatorReason', { reason: outcome.clean.reason })}
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </article>
      </div>

      <section aria-label={t('method.toolsTitle')} className="mt-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{t('method.toolsTitle')}</h2>
          {latestSession !== null ? (
            <span className="chip chip-line">{t('brief.analysisDate', { date: formatSessionDate(latestSession, locale) })}</span>
          ) : null}
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-muted">{t('method.toolsIntro')}</p>
        {toolsApproved !== null && toolsContext !== null && pinnedApproved !== null && pinnedContext !== null ? (
          <>
            <ReplayRadar approved={toolsApproved} onOpenEvidence={(factId, trigger) => openEvidence(toolsContext, factId, trigger)} />
            <ClaimCheck
              approved={pinnedApproved}
              pinnedLabel={t('method.pinnedChip', { date: formatSessionDate(VALIDATOR_SESSION, locale) })}
              onOpenEvidence={(factId, trigger) => openEvidence(pinnedContext, factId, trigger)}
            />
          </>
        ) : (
          <p className="card card-pad text-sm text-muted">{t('states.loading')}</p>
        )}
      </section>

      {evidenceLayer !== null && evidenceView !== null ? (
        <EvidenceDrawer
          view={evidenceView}
          cutoffAt={evidenceLayer.context.cutoffAt}
          trigger={evidenceLayer.trigger}
          fallbackTrigger={evidenceLayer.fallback}
          onClose={popLayer}
          onAssumeBroker={(code) => setScenario(`${WHAT_IF_PREFIX}${code}`)}
        />
      ) : null}
    </section>
  );
}

function formatValidatorDate(isoDate: string, locale: Locale): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}
