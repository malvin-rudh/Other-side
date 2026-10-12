import { useState } from 'react';
import type { CardClaimView, CardSection } from '../engine/stockView';
import { useTranslation } from '../i18n';
import { EvidenceButton } from './EvidenceButton';
import { Icon } from './Icon';

interface OtherSideCardProps {
  card: Record<CardSection, CardClaimView[]>;
  onOpenEvidence?: (factId: string, trigger: HTMLButtonElement) => void;
  onExpand?: (trigger: HTMLButtonElement) => void;
  titleId?: string;
}

const SECTION_ORDER: CardSection[] = ['observed', 'interpretation', 'unknown'];

const SECTION_CAPS: Record<CardSection, number> = {
  observed: 3,
  interpretation: 2,
  unknown: 2,
};

const TONE_CLASS: Record<string, string> = {
  buy: 'font-semibold text-buy',
  sell: 'font-semibold text-sell',
  neutral: '',
};

// The spine glyph shows how each layer relates to the one above it: a solid mark
// for what the rows show, a half mark for reading, a hollow mark for what stays
// unknown. It is not a score and it carries no certainty ranking.
const SECTION_NODE: Record<CardSection, { glyph: string; className: string }> = {
  observed: { glyph: '●', className: 'spine-node-observed' },
  interpretation: { glyph: '◐', className: 'spine-node-interpretation' },
  unknown: { glyph: '○', className: 'spine-node-unknown' },
};

export function OtherSideCard({
  card,
  onOpenEvidence,
  onExpand,
  titleId = 'otherside-card-title',
}: OtherSideCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<CardSection, boolean>>({
    observed: false,
    interpretation: false,
    unknown: false,
  });
  const total = SECTION_ORDER.reduce((sum, section) => sum + card[section].length, 0);

  const sections = SECTION_ORDER.map((section) => {
    const claims = card[section];
    const visible = expanded[section] ? claims : claims.slice(0, SECTION_CAPS[section]);
    return { section, claims, visible, hiddenCount: claims.length - visible.length };
  });
  const footerCaveats = [...new Set(sections.flatMap((entry) => entry.visible.flatMap((claim) => claim.caveats)))];

  return (
    <article aria-labelledby={titleId} className="card px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-base font-semibold tracking-tight">
          {t('stock.cardTitle')}
        </h2>
        <div className="flex items-center gap-2">
          <span className="chip chip-line">{t('stock.ruleBasedBadge')}</span>
          {onExpand ? (
            <button
              type="button"
              onClick={(event) => onExpand(event.currentTarget)}
              aria-label={`${t('focus.expand')} ${t('stock.cardTitle')}`}
              title={t('focus.expand')}
              className="btn btn-quiet px-2 py-1 text-xs"
            >
              <Icon name="expand" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      {total === 0 ? (
        <p className="mt-4 text-sm text-muted">{t('stock.cardEmpty')}</p>
      ) : (
        <div className="relative mt-4">
          <span aria-hidden="true" className="absolute bottom-4 left-3 top-4 w-px bg-line" />
          <ol className="space-y-5">
            {sections.map(({ section, claims, visible, hiddenCount }) =>
              claims.length === 0 ? null : (
                <li key={section} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3">
                  <span
                    aria-hidden="true"
                    className={`spine-node z-10 mt-0.5 ${SECTION_NODE[section].className}`}
                  >
                    {SECTION_NODE[section].glyph}
                  </span>
                  <section aria-label={t(`stock.section.${section}`)} className="min-w-0">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.09em] text-muted">
                      {t(`stock.section.${section}`)}
                    </h3>
                    <ul className="mt-2 divide-y divide-line">
                      {visible.map((claim) => (
                        <li key={claim.claimId} className="py-2 first:pt-0">
                          <p className="text-sm leading-relaxed text-ink">
                            {claim.parts.map((part, index) =>
                              part.kind === 'value' ? (
                                <EvidenceButton
                                  key={`${claim.claimId}-${index}`}
                                  factId={part.factId ?? ''}
                                  className={TONE_CLASS[part.tone ?? 'neutral']}
                                  onActivate={onOpenEvidence}
                                >
                                  {part.text}
                                </EvidenceButton>
                              ) : (
                                <span key={`${claim.claimId}-${index}`}>{part.text}</span>
                              ),
                            )}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StrengthChip strength={claim.strength} />
                            <span className="text-xs leading-snug text-muted">{claim.reason}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {hiddenCount > 0 ? (
                      <button
                        type="button"
                        className="mt-2 text-xs font-semibold text-brandDeep underline decoration-dotted underline-offset-4 hover:text-brand"
                        onClick={() => setExpanded((prev) => ({ ...prev, [section]: true }))}
                      >
                        {t('stock.showAll', { count: String(hiddenCount) })}
                      </button>
                    ) : null}
                  </section>
                </li>
              ),
            )}
          </ol>
        </div>
      )}
      {footerCaveats.length > 0 ? (
        <footer className="mt-5 space-y-1 border-t border-line pt-3">
          {footerCaveats.map((caveat) => (
            <p key={caveat} className="note">
              {caveat}
            </p>
          ))}
        </footer>
      ) : null}
    </article>
  );
}

const STRENGTH_STYLE: Record<CardClaimView['strength'], string> = {
  Strong: 'border-buy/35 bg-buy/10 text-buy',
  Moderate: 'border-brand/45 bg-brand/10 text-brandDeep',
  Weak: 'border-lineStrong bg-surfaceAlt text-muted',
  'Not enough data': 'border-sell/30 bg-sell/10 text-sell',
};

function StrengthChip({ strength }: { strength: CardClaimView['strength'] }) {
  const { t } = useTranslation();
  return <span className={`chip shrink-0 ${STRENGTH_STYLE[strength]}`}>{t(`stock.strength.${strength}`)}</span>;
}
