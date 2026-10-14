import { useEffect, useRef, useState } from 'react';
import type { EvidenceStrength } from '../data/schemas';
import type { EvidencePortfolioView, EvidenceView } from '../engine/evidence';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { Icon } from './Icon';
import { restoreFocus } from './useDialogTrap';

interface EvidenceDrawerProps {
  view: EvidenceView;
  cutoffAt: string;
  trigger: HTMLElement | null;
  onClose: () => void;
  initialTab?: TabKey;
  onAssumeBroker?: (code: string) => void;
  // Launcher that stays mounted when the dialog holding `trigger` is unmounted
  // to open this drawer, so closing still lands on a real control.
  fallbackTrigger?: HTMLElement | null;
}

type TabKey = 'summary' | 'rows' | 'method';

export function EvidenceDrawer({
  view,
  cutoffAt,
  trigger,
  onClose,
  initialTab = 'summary',
  onAssumeBroker,
  fallbackTrigger = null,
}: EvidenceDrawerProps) {
  const { t, locale } = useTranslation();
  const [tab, setTab] = useState<TabKey>(initialTab);
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
      restoreFocus(trigger, fallbackTrigger);
    };
  }, [onClose, trigger, fallbackTrigger]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'summary', label: t('evidence.tabSummary') },
    { key: 'rows', label: view.prices !== undefined ? t('evidence.tabPrices') : t('evidence.tabRows') },
    { key: 'method', label: t('evidence.tabMethod') },
  ];

  const formatInt = (value: number) =>
    new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);

  const cutoffText = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(cutoffAt));

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-navy/45" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${t('evidence.title')} · ${view.factId}`}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] animate-sheet-in flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-lift md:inset-y-0 md:left-auto md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight">{t('evidence.title')}</h2>
            <p className="break-all text-xs text-muted">{view.factId}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('evidence.close')}
            className="btn btn-quiet px-2.5"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </header>

        <nav className="flex gap-1 border-b border-line px-4 pt-2" role="tablist" aria-label={t('evidence.title')}>
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
              className={`-mb-px rounded-t-lg border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
                tab === item.key
                  ? 'border-brand text-ink'
                  : 'border-transparent text-muted hover:border-lineStrong hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto px-4 pb-6 pt-3">
          {tab === 'summary' ? (
            <div role="tabpanel" aria-label={t('evidence.tabSummary')}>
              <section>
                <h3 className="eyebrow">
                  {t('evidence.summary.claimsLabel')}
                </h3>
                {view.claims.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">{t('evidence.summary.noClaims')}</p>
                ) : (
                  <ul className="mt-2 space-y-3">
                    {view.claims.map((claim) => (
                      <li key={claim.claimId} className="card-inset p-3">
                        <p className="text-sm leading-relaxed text-ink">{claim.wording}</p>
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <StrengthChip strength={claim.strength} />
                          <span className="text-muted">{claim.reason}</span>
                        </p>
                        {claim.caveats.length > 0 ? (
                          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted">
                            {claim.caveats.map((caveat, index) => (
                              <li key={index}>{caveat}</li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="eyebrow">
                    {t('evidence.summary.factIdLabel')}
                  </dt>
                  <dd className="mt-0.5 break-all text-ink">{view.factId}</dd>
                </div>
                <div>
                  <dt className="eyebrow">
                    {t('evidence.summary.approxLabel')}
                  </dt>
                  <dd className="mt-0.5 text-ink">{view.approximate}</dd>
                </div>
                <div>
                  <dt className="eyebrow">
                    {t('evidence.summary.parsedLabel')}
                  </dt>
                  <dd className="mt-0.5 text-ink">
                    {view.parsedTotals === null ? (
                      t('evidence.summary.notAvailable')
                    ) : (
                      <>
                        {t('evidence.summary.lots', { value: formatInt(view.parsedTotals.lots) })} ·{' '}
                        {t('evidence.summary.value', { value: formatInt(view.parsedTotals.valueIdr) })}
                      </>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}

          {tab === 'rows' ? (
            <div
              role="tabpanel"
              aria-label={view.prices !== undefined ? t('evidence.tabPrices') : t('evidence.tabRows')}
            >
              {view.prices !== undefined ? (
                <div className="space-y-4">
                  {view.portfolio !== undefined ? <PortfolioBreakdown portfolio={view.portfolio} /> : null}
                  {view.prices.map((series) => (
                    <section key={series.symbol}>
                      <h3 className="text-sm font-semibold text-ink">
                        {series.symbol}
                        {series.currency !== null ? ` · ${series.currency}` : ''}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        {t(`evidence.prices.basis.${series.priceBasis}`)} · {series.source} · {series.dataVersion}
                      </p>
                      <div className="mt-2 max-h-56 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="sticky top-0 bg-surfaceAlt">
                            <tr className="text-muted">
                              <th className="py-1 pr-3 font-semibold">{t('evidence.prices.date')}</th>
                              <th className="py-1 text-right font-semibold">{t('evidence.prices.close')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {series.bars.map((bar) => (
                              <tr key={bar.date} className="border-t border-line text-ink">
                                <td className="py-1 pr-3 whitespace-nowrap">{formatSessionDate(bar.date, locale)}</td>
                                <td className="py-1 text-right tabular-nums">
                                  {bar.close !== null ? formatInt(bar.close) : t('evidence.prices.unknownClose')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {series.sourceHistory !== null ? (
                        <p className="note mt-1.5">
                          {t('evidence.prices.consumed', {
                            count: String(series.bars.length),
                            total: String(series.sourceHistory.barCount),
                            first: formatSessionDate(series.sourceHistory.firstDate, locale),
                            last: formatSessionDate(series.sourceHistory.lastDate, locale),
                          })}
                        </p>
                      ) : null}
                    </section>
                  ))}
                  <p className="note">{t('evidence.prices.note')}</p>
                </div>
              ) : view.rows.length === 0 ? (
                <p className="text-sm text-muted">{t('evidence.rows.noRows')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="bg-surfaceAlt">
                      <tr className="text-muted">
                        <th className="py-1 pr-3 font-semibold">{t('evidence.rows.date')}</th>
                        <th className="py-1 pr-3 font-semibold">{t('evidence.rows.side')}</th>
                        <th className="py-1 pr-3 font-semibold">{t('evidence.rows.rank')}</th>
                        <th className="py-1 pr-3 font-semibold">{t('evidence.rows.broker')}</th>
                        <th className="py-1 pr-3 text-right font-semibold">{t('evidence.rows.netLots')}</th>
                        <th className="py-1 pr-3 text-right font-semibold">{t('evidence.rows.netValue')}</th>
                        <th className="py-1 pr-3 text-right font-semibold">{t('evidence.rows.sourceAvg')}</th>
                        <th className="py-1 pr-3 font-semibold">{t('evidence.rows.rawLabel')}</th>
                        <th className="py-1 font-semibold">{t('evidence.rows.rowId')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {view.rows.map((row) => (
                        <tr key={row.id} className="border-t border-line align-top text-ink">
                          <td className="py-1.5 pr-3 whitespace-nowrap">{formatSessionDate(row.date, locale)}</td>
                          <td className="py-1.5 pr-3">
                            <span
                              className={
                                row.side === 'buy'
                                  ? 'font-semibold text-buy'
                                  : 'font-semibold text-sell'
                              }
                            >
                              {row.side === 'buy' ? t('evidence.rows.buy') : t('evidence.rows.sell')}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">{row.rank}</td>
                          <td className="py-1.5 pr-3 font-medium">
                            {row.brokerCode}
                            {onAssumeBroker ? (
                              <button
                                type="button"
                                aria-label={t('whatIf.assumeAria', { code: row.brokerCode })}
                                title={t('whatIf.assumeAria', { code: row.brokerCode })}
                                onClick={() => onAssumeBroker(row.brokerCode)}
                                className="ml-1.5 rounded-full border border-dashed border-brand/50 bg-brand/5 px-1.5 text-[11px] font-semibold text-brandDeep transition-colors hover:border-brand hover:bg-brand/15"
                              >
                                {t('whatIf.assumeLabel')}
                              </button>
                            ) : null}
                          </td>
                          <td className={`py-1.5 pr-3 text-right tabular-nums ${row.netLots > 0 ? 'text-buy' : row.netLots < 0 ? 'text-sell' : ''}`}>
                            {row.netLots > 0 ? '+' : ''}
                            {formatInt(row.netLots)}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">
                            {formatInt(row.netValueIdr)}
                          </td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">
                            {row.sourceAveragePrice !== null ? formatInt(row.sourceAveragePrice) : '—'}
                          </td>
                          <td className="py-1.5 pr-3 text-muted">{row.rawLabel}</td>
                          <td className="py-1.5 break-all text-muted">{row.id}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {view.prices === undefined ? <p className="note mt-3">{t('evidence.rows.unknownNote')}</p> : null}
            </div>
          ) : null}

          {tab === 'method' ? (
            <div role="tabpanel" aria-label={t('evidence.tabMethod')}>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="eyebrow">
                    {t('evidence.method.formulaLabel')}
                  </dt>
                  <dd className="mt-0.5 leading-relaxed text-ink">{t(`evidence.method.formula.${view.factType}`)}</dd>
                </div>
                <div>
                  <dt className="eyebrow">
                    {t('evidence.method.periodLabel')}
                  </dt>
                  <dd className="mt-0.5 text-ink">
                    {view.period
                      ? `${formatSessionDate(view.period.start, locale)} → ${formatSessionDate(view.period.end, locale)}`
                      : t('evidence.summary.notAvailable')}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">
                    {t('evidence.method.cutoffLabel')}
                  </dt>
                  <dd className="mt-0.5 text-ink">{cutoffText}</dd>
                </div>
                <div>
                  <dt className="eyebrow">
                    {t('evidence.method.coverageLabel')}
                  </dt>
                  <dd className="mt-0.5 leading-relaxed text-ink">{view.coverageNote}</dd>
                </div>
                <div>
                  <dt className="eyebrow">
                    {t('evidence.method.exclusionsLabel')}
                  </dt>
                  <dd className="mt-0.5">
                    {view.exclusions.length === 0 ? (
                      <span className="text-ink">{t('evidence.method.noExclusions')}</span>
                    ) : (
                      <ul className="space-y-1">
                        {view.exclusions.map((exclusion) => (
                          <li key={exclusion.date} className="text-ink">
                            {formatSessionDate(exclusion.date, locale)}:{' '}
                            <span className="font-semibold">
                              {exclusion.status === 'excluded'
                                ? t('evidence.method.excluded')
                                : t('evidence.method.missing')}
                            </span>{' '}
                            · <span className="text-muted">{exclusion.reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StrengthChip({ strength }: { strength: EvidenceStrength }) {  const { t } = useTranslation();
  const tone =
    strength === 'Strong'
      ? 'bg-buy/10 text-buy'
      : strength === 'Moderate'
        ? 'bg-brand/12 text-brandDeep'
        : strength === 'Weak'
          ? 'bg-sell/10 text-sell'
          : 'bg-canvas text-muted';
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>
      {t(`stock.strength.${strength}`)}
    </span>
  );
}

// The complete per-symbol arithmetic behind a portfolio number. Every row on
// screen resolves here, so the drawer always shows the selected symbol's own
// quantity, closes, values and share, the totals those shares divide by, and the
// formula. Nothing is summarised away to the largest holding.
function PortfolioBreakdown({ portfolio }: { portfolio: EvidencePortfolioView }) {
  const { t, locale } = useTranslation();
  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  const percent = (fraction: number) => `${(Math.round(fraction * 1000) / 10).toFixed(1)}%`;
  const points = (fraction: number) => {
    const value = Math.round(fraction * 1000) / 10;
    const digits = Math.abs(value).toFixed(1);
    return `${value > 0 ? '+' : value < 0 ? '\u2212' : ''}${locale === 'id' ? digits.replace('.', ',') : digits}`;
  };
  const symbols = portfolio.holdings.map((holding) => holding.symbol);

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-sm font-semibold text-ink">{t('evidence.portfolio.breakdownTitle')}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {t('evidence.portfolio.breakdownDates', {
            start: formatSessionDate(portfolio.startDate, locale),
            end: formatSessionDate(portfolio.endDate, locale),
          })}
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead className="bg-surfaceAlt">
              <tr className="text-muted">
                <th className="py-1 pr-3 font-semibold">{t('evidence.portfolio.symbol')}</th>
                <th className="py-1 pr-3 text-right font-semibold">{t('evidence.portfolio.shares')}</th>
                <th className="py-1 pr-3 text-right font-semibold">{t('evidence.portfolio.startClose')}</th>
                <th className="py-1 pr-3 text-right font-semibold">{t('evidence.portfolio.endClose')}</th>
                <th className="py-1 pr-3 text-right font-semibold">{t('evidence.portfolio.startValue')}</th>
                <th className="py-1 pr-3 text-right font-semibold">{t('evidence.portfolio.endValue')}</th>
                <th className="py-1 pr-3 text-right font-semibold">{t('evidence.portfolio.weight')}</th>
                <th className="py-1 text-right font-semibold">{t('evidence.portfolio.contribution')}</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.holdings.map((holding) => (
                <tr key={holding.symbol} className="border-t border-line text-ink">
                  <td className="py-1 pr-3 font-semibold whitespace-nowrap">{holding.symbol}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{intl.format(holding.quantityShares)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{intl.format(holding.startClose)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{intl.format(holding.endClose)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{intl.format(holding.startValue)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{intl.format(holding.endValue)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{percent(holding.weightFraction)}</td>
                  <td className="py-1 text-right tabular-nums">{points(holding.contributionFraction)}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-semibold text-ink">
                <td className="py-1 pr-3">{t('evidence.portfolio.total')}</td>
                <td className="py-1 pr-3" />
                <td className="py-1 pr-3" />
                <td className="py-1 pr-3" />
                <td className="py-1 pr-3 text-right tabular-nums">{intl.format(portfolio.totalStartValue)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{intl.format(portfolio.totalEndValue)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {percent(portfolio.holdings.reduce((sum, holding) => sum + holding.weightFraction, 0))}
                </td>
                <td className="py-1" />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="note mt-2">{t('evidence.portfolio.contributionUnit')}</p>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-ink">{t('evidence.portfolio.weightHistoryTitle')}</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surfaceAlt">
              <tr className="text-muted">
                <th className="py-1 pr-3 font-semibold">{t('evidence.prices.date')}</th>
                {symbols.map((symbol) => (
                  <th key={symbol} className="py-1 pr-3 text-right font-semibold">
                    {symbol}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {portfolio.weights.map((point) => (
                <tr key={point.date} className="border-t border-line text-ink">
                  <td className="py-1 pr-3 whitespace-nowrap">{formatSessionDate(point.date, locale)}</td>
                  {symbols.map((symbol) => {
                    const entry = point.entries.find((candidate) => candidate.symbol === symbol);
                    return (
                      <td key={symbol} className="py-1 pr-3 text-right tabular-nums">
                        {entry !== undefined ? percent(entry.weightFraction) : '\u2014'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card-inset p-3">
        <h3 className="text-xs font-semibold text-ink">{t('evidence.portfolio.formulaTitle')}</h3>
        <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted">
          <li className="tabular-nums">{t('evidence.portfolio.valueFormula')}</li>
          <li className="tabular-nums">{t('evidence.portfolio.returnFormula')}</li>
          <li className="tabular-nums">{t('evidence.portfolio.weightFormula')}</li>
          <li className="tabular-nums">{t('evidence.portfolio.contributionFormula')}</li>
        </ul>
      </section>
    </div>
  );
}
