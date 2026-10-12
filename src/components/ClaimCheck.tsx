import { useEffect, useState } from 'react';
import type { ApprovedClaimsDocument } from '../ai/claims';
import { pickText } from '../engine/facts';
import { radarStatus } from '../engine/radar';
import { useTranslation, type MessageKey } from '../i18n';
import { CaveatList, ClaimSentence, FactPeriodLabel, FactReason, StatusChip, StreakComparison } from './ClaimStatus';

const QUESTIONS = [
  { factKey: 'C12', claimId: 'CL-OBS-C12', labelKey: 'claim.q12' },
  { factKey: 'C13', claimId: 'CL-OBS-C13', labelKey: 'claim.q13' },
] as const;

interface ClaimCheckProps {
  approved: ApprovedClaimsDocument;
  // Present only for the pinned Method-page example: names the fixed snapshot
  // so it is never confused with the latest-session tools above it.
  pinnedLabel?: string;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}

export function ClaimCheck({ approved, pinnedLabel, onOpenEvidence }: ClaimCheckProps) {
  const { t, locale } = useTranslation();
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const { ticker, sessionDate, periodStart, periodEnd, scenario } = approved.context;
  // Locale is deliberately absent: switching language must not hide an answer
  // the evaluator already revealed.
  const analyticalContext = `${ticker}|${sessionDate}|${periodStart}|${periodEnd}|${scenario}`;

  useEffect(() => {
    setRevealed({});
  }, [analyticalContext]);

  return (
    <section aria-label={t('claim.title')} className="card card-pad border-l-4 border-l-buy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{t('claim.title')}</h2>
        {pinnedLabel !== undefined ? <span className="chip chip-line">{pinnedLabel}</span> : null}
      </div>
      <p className="mt-1 text-sm text-muted">{t('claim.intro')}</p>
      <ul className="mt-4 divide-y divide-line">
        {QUESTIONS.map((question) => {
          const fact = approved.facts.find((entry) => entry.key === question.factKey) ?? null;
          const claim = approved.claims.find((entry) => entry.claim_id === question.claimId) ?? null;
          const open = revealed[question.factKey] === true;
          const parts = claim?.available ? claim.parts.explained[locale] : null;
          return (
            <li key={question.factKey} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p id={`claim-question-${question.factKey}`} className="min-w-0 text-sm font-medium text-ink">
                  {t(question.labelKey as MessageKey)}
                </p>
                <button
                  type="button"
                  data-claim-check={question.factKey}
                  aria-expanded={open}
                  aria-controls={`claim-reveal-${question.factKey}`}
                  onClick={() => setRevealed((prev) => ({ ...prev, [question.factKey]: !open }))}
                  className="btn btn-quiet shrink-0 px-2.5 py-1 text-xs"
                >
                  {open ? t('claim.hide') : t('claim.reveal')}
                </button>
              </div>
              {open ? (
                <div id={`claim-reveal-${question.factKey}`} className="card-inset mt-2 animate-panel-in p-3">
                  {fact === null ? (
                    <p className="text-sm text-muted">{t('states.unavailable')}</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip status={radarStatus(fact)} />
                        <FactPeriodLabel fact={fact} onOpenEvidence={onOpenEvidence} />
                      </div>
                      {claim?.available && parts ? (
                        <p className="mt-2 text-sm leading-relaxed text-ink">
                          <ClaimSentence claim={claim} onOpenEvidence={onOpenEvidence} />
                        </p>
                      ) : (
                        <FactReason fact={fact} />
                      )}
                      <StreakComparison fact={fact} onOpenEvidence={onOpenEvidence} />
                      {claim?.available && parts ? (
                        <CaveatList caveats={claim.caveats.map((caveat) => pickText(caveat, locale))} />
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
