import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { ApprovedClaim, ApprovedClaimsDocument, RenderedPart } from '../ai/claims';
import { requestLiveExplanation, type LiveExplainEnvelope } from '../ai/liveClient';
import { loadSavedPlan, type SavedPlanResult } from '../ai/savedPlans';
import { buildThesisView, THESIS_IDS, THESIS_QUESTION_ID, type ThesisItemView } from '../ai/thesisView';
import type { ModelResponse } from '../ai/validate';
import type { Locale } from '../engine/context';
import { pickText } from '../engine/facts';
import { useTranslation, type MessageKey } from '../i18n';
import { useContextStore } from '../store/contextStore';
import { toWireScenario } from '../engine/whatIf';
import { EvidenceButton } from './EvidenceButton';

function thesisLabelKey(thesisId: string): MessageKey {
  return `thesis.theses.${thesisId}` as MessageKey;
}

interface ThesisChipsProps {
  approved: ApprovedClaimsDocument;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}

type PlanState = { status: 'loading' } | SavedPlanResult;

type LiveState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; envelope: LiveExplainEnvelope }
  | { status: 'failed' };

type TypedAnswer = { kind: 'refusal'; reason: 'identity' | 'advice' } | { kind: 'uncovered' };

const IDENTITY_RE =
  /individual investor|who (is|are) (the )?(client|investor|person|people|owner)|identify the|who'?s behind|who is behind|nasabah (yang )?(mana|siapa)|investor perorangan|siapa (nasabah|klien|pemilik)|siapa( [a-z]+){0,3} di balik/i;
const ADVICE_RE =
  /should i (hold|buy|sell)|buy or sell|sell or buy|buy now|sell now|worth (buying|selling)|recommend(ation)?|target price|(good|right|best) time to (buy|sell)|bagus (beli|jual)|(beli|jual) (atau|sekarang)|rekomendasi|harga target|layak (beli|jual)|apakah (saya )?(harus|sebaiknya)|sebaiknya (saya )?(beli|jual|hold)|kapan (saya )?(harus|sebaiknya) (beli|jual)|kapan waktu (yang )?(tepat|baik) (untuk )?(beli|jual)/i;

const TONE_CLASS: Record<string, string> = {
  buy: 'font-semibold text-buy',
  sell: 'font-semibold text-sell',
  neutral: '',
};

export function ThesisChips({ approved, onOpenEvidence }: ThesisChipsProps) {
  const { t, locale } = useTranslation();
  const demoToken = useContextStore((state) => state.demoToken);
  const liveEndpoint = useContextStore((state) => state.liveEndpoint);
  const demoMode = useContextStore((state) => state.demoMode);
  const coachStep = useContextStore((state) => state.coachStep);
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [typedAnswer, setTypedAnswer] = useState<TypedAnswer | null>(null);
  const [plans, setPlans] = useState<Record<string, PlanState>>({});
  const [live, setLive] = useState<LiveState>({ status: 'idle' });
  const liveCall = useRef(0);

  const sessionDate = approved.context.sessionDate;
  const scenario = approved.context.scenario;

  useEffect(() => {
    setSelected(null);
    setTypedAnswer(null);
    setPlans({});
    setLive({ status: 'idle' });
    liveCall.current += 1;
  }, [sessionDate, scenario]);

  useEffect(() => {
    if (!demoMode) return;
    if (coachStep === 4 || coachStep === 5) {
      setSelected('T-HP-SMART');
      const curated = approved.questions['Q-THESIS-HP'];
      setQuestion(curated ? pickText(curated.text, locale) : '');
    } else {
      setSelected(null);
      setQuestion('');
    }
  }, [demoMode, coachStep, approved, locale]);

  useEffect(() => {
    if (selected === null) return;
    const cached = plans[selected];
    if (cached) return;
    let cancelled = false;
    void loadSavedPlan(approved.ticker, sessionDate, selected, approved).then((result) => {
      if (cancelled) return;
      setPlans((prev) => ({ ...prev, [selected]: result }));
    });
    return () => {
      cancelled = true;
    };
  }, [selected, plans, approved, tickerAndSession(approved.ticker, sessionDate)]);

  const thesisView = useMemo(
    () => (selected !== null ? buildThesisView(approved, selected, locale) : null),
    [approved, selected, locale],
  );
  const plan = selected !== null ? plans[selected] : undefined;

  const liveReady = demoToken !== '' && liveEndpoint !== '';

  const askLive = () => {
    if (selected === null || !liveReady) return;
    const questionId = THESIS_QUESTION_ID[selected];
    const curated = questionId ? approved.questions[questionId] : undefined;
    if (!curated) return;
    const callId = ++liveCall.current;
    setLive({ status: 'loading' });
    void requestLiveExplanation({
      endpoint: liveEndpoint,
      token: demoToken,
      ticker: approved.ticker,
      date: sessionDate,
      scenario: toWireScenario(scenario),
      locale,
      question: pickText(curated.text, locale),
      thesisId: selected,
      expectedContextKey: approved.contextKey,
    }).then((result) => {
      if (liveCall.current !== callId) return;
      setLive(result.ok ? { status: 'ok', envelope: result.envelope } : { status: 'failed' });
    });
  };

  const submitQuestion = (event: FormEvent) => {
    event.preventDefault();
    const text = question.trim();
    if (text === '') return;
    if (IDENTITY_RE.test(text)) setTypedAnswer({ kind: 'refusal', reason: 'identity' });
    else if (ADVICE_RE.test(text)) setTypedAnswer({ kind: 'refusal', reason: 'advice' });
    else setTypedAnswer({ kind: 'uncovered' });
  };

  const pickChip = (thesisId: string) => {
    setTypedAnswer(null);
    setLive({ status: 'idle' });
    liveCall.current += 1;
    setSelected((prev) => (prev === thesisId ? null : thesisId));
  };

  return (
    <section aria-label={t('thesis.title')} className="card card-pad border-l-4 border-l-navy">
      <h2 className="text-base font-semibold tracking-tight">{t('thesis.title')}</h2>
      <p className="mt-1 text-sm text-muted">{t('thesis.intro')}</p>

      <form onSubmit={submitQuestion} className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          id="thesis-ask"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t('thesis.askPlaceholder')}
          aria-label={t('thesis.askPlaceholder')}
          className="field min-w-0 flex-1 py-1.5"
        />
        <button type="submit" className="btn btn-primary">
          {t('thesis.askButton')}
        </button>
      </form>

      {!liveReady ? (
        <p className="mt-2 text-xs text-muted">
          <Link to="/tour" className="underline decoration-dotted decoration-lineStrong underline-offset-4 hover:decoration-brand">
            {t('thesis.liveSetupHint')}
          </Link>
        </p>
      ) : null}

      {typedAnswer?.kind === 'refusal' ? (
        <p className="card-inset mt-4 border-l-2 border-l-sell p-3 text-sm leading-relaxed text-ink">
          {t(typedAnswer.reason === 'identity' ? 'thesis.refusalIdentity' : 'thesis.refusalAdvice')}
        </p>
      ) : null}

      {typedAnswer?.kind === 'uncovered' ? (
        <div className="mt-4">
          <p className="text-sm text-muted">{t('thesis.uncovered')}</p>
          <p className="mt-2 text-xs text-muted">{t('thesis.suggest')}</p>
          <ChipRow selected={selected} onPick={pickChip} />
        </div>
      ) : null}

      <div className={typedAnswer?.kind === 'uncovered' ? 'hidden' : 'mt-4'}>
        <ChipRow selected={selected} onPick={pickChip} />
      </div>

      {selected !== null && thesisView ? (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="eyebrow">{t(thesisLabelKey(selected))}</h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={askLive}
                disabled={!liveReady || live.status === 'loading'}
                className="rounded-full border border-brand/60 bg-brand/5 px-3 py-1 text-[11px] font-semibold text-brandDeep transition-colors hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {live.status === 'loading' ? t('thesis.loading') : t('thesis.liveButton')}
              </button>
              <span
                className={`chip ${
                  live.status === 'ok'
                    ? 'border-buy/35 bg-buy/10 text-buy'
                    : plan?.status === 'valid'
                      ? 'chip-brand'
                      : 'chip-line'
                }`}
              >
                {live.status === 'ok'
                  ? t('thesis.liveBadge')
                  : plan?.status === 'valid'
                    ? t('thesis.savedBadge')
                    : t('stock.ruleBasedBadge')}
              </span>
            </div>
          </div>

          {live.status === 'ok' ? (
            <PlanAnswer
              response={live.envelope.plan}
              approved={approved}
              locale={locale}
              onOpenEvidence={onOpenEvidence}
              insufficientText={t('thesis.insufficient')}
            />
          ) : live.status === 'loading' ? null : plan?.status === 'valid' ? (
            <PlanAnswer
              response={plan.response}
              approved={approved}
              locale={locale}
              onOpenEvidence={onOpenEvidence}
              insufficientText={t('thesis.insufficient')}
            />
          ) : (
            <>
              {plan?.status === 'loading' ? <p className="mt-2 text-xs text-muted">{t('thesis.loading')}</p> : null}
              <ThesisBuckets view={thesisView} onOpenEvidence={onOpenEvidence} />
              {live.status === 'failed' ? (
                <div className="mt-3">
                  <p className="text-sm text-muted">{t('thesis.liveFailed')}</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink">{t('thesis.insufficient')}</p>
                  <p className="mt-2 text-xs text-muted">{t('thesis.suggest')}</p>
                  <ChipRow selected={selected} onPick={pickChip} />
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}

function tickerAndSession(ticker: string, sessionDate: string): string {
  return `${ticker}|${sessionDate}`;
}

function ChipRow({ selected, onPick }: { selected: string | null; onPick: (thesisId: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {THESIS_IDS.map((thesisId) => (
        <button
          key={thesisId}
          type="button"
          aria-pressed={selected === thesisId}
          onClick={() => onPick(thesisId)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
            selected === thesisId
              ? 'border-brand bg-brand text-navy'
              : 'border-line bg-surface text-muted hover:border-brand/60 hover:text-brandDeep'
          }`}
        >
          {t(`thesis.theses.${thesisId}`)}
        </button>
      ))}
    </div>
  );
}

function Parts({
  parts,
  fallbackFactId,
  onOpenEvidence,
}: {
  parts: RenderedPart[];
  fallbackFactId: string | null;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'value') {
          const factId = part.factId ?? fallbackFactId;
          if (factId) {
            return (
              <EvidenceButton
                key={index}
                factId={factId}
                className={TONE_CLASS[part.tone ?? 'neutral']}
                onActivate={onOpenEvidence}
              >
                {part.text}
              </EvidenceButton>
            );
          }
        }
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}

function ThesisBuckets({
  view,
  onOpenEvidence,
}: {
  view: ReturnType<typeof buildThesisView> & object;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const { t } = useTranslation();
  const buckets: { key: 'supports' | 'contradicts' | 'unknown'; items: ThesisItemView[] }[] = [
    { key: 'supports', items: view.supports },
    { key: 'contradicts', items: view.contradicts },
    { key: 'unknown', items: view.unknown },
  ];
  return (
    <div className="mt-4 space-y-4">
      {buckets.map(({ key, items }) => (
        <section key={key} aria-label={t(`thesis.buckets.${key}`)}>
          <h4 className="eyebrow">{t(`thesis.buckets.${key}`)}</h4>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-mutedSoft">{t('thesis.empty')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {items.map((item) => (
                <li key={item.claimId} className="py-2.5 text-sm leading-relaxed text-ink first:pt-0">
                  <Parts parts={item.parts} fallbackFactId={item.factId} onOpenEvidence={onOpenEvidence} />
                  {item.evaluable ? null : <p className="mt-1 text-xs text-muted">{t('thesis.notEvaluable')}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {view.caveats.length > 0 ? (
        <footer className="space-y-1 border-t border-line pt-3">
          {view.caveats.map((caveat) => (
            <p key={caveat} className="note">
              {caveat}
            </p>
          ))}
        </footer>
      ) : null}
    </div>
  );
}

function PlanAnswer({
  response,
  approved,
  locale,
  onOpenEvidence,
  insufficientText,
}: {
  response: ModelResponse;
  approved: ApprovedClaimsDocument;
  locale: Locale;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
  insufficientText: string;
}) {
  const { t } = useTranslation();
  const byId = new Map(approved.claims.map((claim) => [claim.claim_id, claim]));
  if (response.answer_kind === 'unavailable' || response.claims.length === 0) {
    return <p className="card-inset mt-3 p-3 text-sm leading-relaxed text-ink">{insufficientText}</p>;
  }
  const sections = ['supports', 'contradicts', 'unknown'] as const;
  const buckets: Record<(typeof sections)[number], { claim: ApprovedClaim; variant: 'short' | 'explained' }[]> = {
    supports: [],
    contradicts: [],
    unknown: [],
  };
  for (const ref of response.claims) {
    const claim = byId.get(ref.claim_id);
    if (!claim || !claim.available) continue;
    const key = claim.section === 'contradicts' ? 'contradicts' : claim.section === 'unknown' ? 'unknown' : 'supports';
    buckets[key].push({ claim, variant: ref.wording_variant });
  }
  return (
    <div className="mt-4 space-y-4">
      {sections.map((key) => {
        const items = buckets[key];
        return (
        <section key={key} aria-label={t(`thesis.buckets.${key}`)}>
          <h4 className="eyebrow">{t(`thesis.buckets.${key}`)}</h4>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-mutedSoft">{t('thesis.empty')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {items.map(({ claim, variant }) => {
                const parts = claim.parts[variant][locale] ?? [
                  { kind: 'text' as const, text: pickText(claim.wording[variant], locale) },
                ];
                const caveats = claim.caveats.map((caveat) => pickText(caveat, locale));
                return (
                  <li key={claim.claim_id} className="py-2.5 text-sm leading-relaxed text-ink first:pt-0">
                    <Parts parts={parts} fallbackFactId={null} onOpenEvidence={onOpenEvidence} />
                    {caveats.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted">
                        {caveats.map((caveat, index) => (
                          <li key={index}>{caveat}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        );
      })}
    </div>
  );
}

