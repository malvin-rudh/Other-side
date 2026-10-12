import { useEffect, useRef } from 'react';
import { EvidenceButton } from './EvidenceButton';
import { Icon } from './Icon';
import type { BrokerGroup } from '../data/schemas';
import type { TradeContextView } from '../engine/tradeContext';
import { formatSessionDate, formatShortDate, intlLocale, useTranslation } from '../i18n';

interface TradeContextSheetProps {
  kind: 'sell' | 'buy';
  view: TradeContextView;
  trigger: HTMLButtonElement | null;
  onClose: () => void;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}

export function TradeContextSheet({ kind, view, trigger, onClose, onOpenEvidence }: TradeContextSheetProps) {
  const { t, locale } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const panelFocusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      const coach = document.querySelector<HTMLElement>('[data-demo-coach]');
      const coachButtons = coach ? Array.from(coach.querySelectorAll<HTMLElement>('button')) : [];
      if (coachButtons.length > 0) {
        const focusable = [...panelFocusable, ...coachButtons];
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        const next = event.shiftKey
          ? index <= 0
            ? focusable[focusable.length - 1]
            : focusable[index - 1]
          : index === -1 || index === focusable.length - 1
            ? focusable[0]
            : focusable[index + 1];
        next?.focus();
        return;
      }
      if (panelFocusable.length === 0) return;
      const first = panelFocusable[0]!;
      const last = panelFocusable[panelFocusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [onClose, trigger]);

  const openEvidence = (factId: string, source: HTMLButtonElement) => {
    onClose();
    onOpenEvidence(factId, source);
  };

  const formatInt = (value: number) =>
    new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);

  const formatSigned = (value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${formatInt(Math.abs(value))}`;
  };

  const groupShort = (group: BrokerGroup): string => {
    switch (group) {
      case 'institution_facing':
        return t('trade.shortInstitution');
      case 'app_facing':
        return t('trade.shortApp');
      case 'other_mixed':
        return t('trade.shortOther');
      default:
        return t('trade.shortUnknown');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-navy/45" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('trade.title')}
        className="relative flex max-h-[85vh] w-full animate-sheet-in flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-lift md:max-w-lg md:rounded-2xl md:border"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight">{t('trade.title')}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('trade.close')}
            className="btn btn-quiet px-2.5"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
          <p className="rounded-lg border border-brand/40 bg-brand/10 px-3 py-2 text-xs font-semibold leading-snug text-brandDeep">
            {t('trade.banner')}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {t('trade.asOf', { session: formatSessionDate(view.asOf.sessionDate, locale) })}
          </p>
          {view.asOf.nextDayHoliday ? (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {t('trade.holidayNextDay', { date: formatSessionDate(view.asOf.nextDayDate, locale) })}
            </p>
          ) : null}

          {kind === 'sell' ? (
            <section className="mt-4 space-y-3">
              {view.sellWording ? (
                <p className="text-sm leading-relaxed text-ink">
                  {view.sellWording}{' '}
                  {view.sellFactId ? (
                    <EvidenceButton factId={view.sellFactId} onActivate={openEvidence}>
                      {t('trade.showEvidence')}
                    </EvidenceButton>
                  ) : null}
                </p>
              ) : (
                <p className="text-sm leading-relaxed text-ink">{t('trade.sellFallback')}</p>
              )}
              {view.positive ? (
                <p className="text-sm leading-relaxed text-ink">
                  {t('trade.positiveSessions', {
                    dates: view.positive.dates.map((date) => formatShortDate(date, locale)).join(', '),
                  })}{' '}
                  <EvidenceButton factId={view.positive.factId} onActivate={openEvidence}>
                    {t('trade.showEvidence')}
                  </EvidenceButton>
                </p>
              ) : null}
              {view.weakLink ? (
                <p className="text-sm leading-relaxed text-ink">
                  {t('trade.weakLinkLabel')}{' '}
                  <EvidenceButton factId={view.weakLink.factId} onActivate={openEvidence}>
                    {formatShortDate(view.weakLink.date, locale)}: {groupShort(view.weakLink.candidateGroup)}{' '}
                    <span className={view.weakLink.candidateValue >= 0 ? 'text-buy' : 'text-sell'}>
                      {formatSigned(view.weakLink.candidateValue)}
                    </span>{' '}
                    {t('trade.vs')} {groupShort(view.weakLink.otherGroup)}{' '}
                    <span className={view.weakLink.otherValue >= 0 ? 'text-buy' : 'text-sell'}>
                      {formatSigned(view.weakLink.otherValue)}
                    </span>{' '}
                    {t('stock.flowLotsUnit')}
                  </EvidenceButton>
                </p>
              ) : null}
            </section>
          ) : (
            <section className="mt-4 space-y-3">
              <p className="text-sm leading-relaxed text-ink">
                {t('trade.buyToday')}{' '}
                {view.today ? (
                  <EvidenceButton factId={view.today.factId} className="font-semibold" onActivate={openEvidence}>
                    ≈Rp{formatInt(view.today.display)}
                  </EvidenceButton>
                ) : (
                  <span className="text-muted">{t('states.unavailable')}</span>
                )}
              </p>
              <p className="text-sm leading-relaxed text-ink">
                {t('trade.buyWindow')}{' '}
                {view.window ? (
                  <EvidenceButton factId={view.window.factId} className="font-semibold" onActivate={openEvidence}>
                    ≈Rp{formatInt(view.window.display)}
                  </EvidenceButton>
                ) : (
                  <span className="text-muted">{t('states.unavailable')}</span>
                )}
              </p>
              {view.direction ? (
                <p className="text-sm leading-relaxed text-ink">
                  {view.direction === 'above' ? t('trade.buyAbove') : t('trade.buyBelow')}
                </p>
              ) : null}
              <p className="text-xs leading-relaxed text-muted">{t('trade.notCostBasis')}</p>
            </section>
          )}

          <section className="card-inset mt-4 p-3">
            <h3 className="eyebrow">{t('trade.limitsTitle')}</h3>
            <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
              <li>{kind === 'sell' ? t('trade.limitSell') : t('trade.limitBuy')}</li>
              <li>{t('trade.identityUnknown')}</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
