import type { ReactNode } from 'react';
import { findHealthReport, type CompanyHealthReport } from '../data/companyHealth';
import type { Locale } from '../engine/context';
import type { EventView } from '../engine/stockView';
import { formatSessionDate, intlLocale, useTranslation, type MessageKey } from '../i18n';
import { Disclaimer } from './Disclaimer';

type Tone = 'up' | 'down' | 'flat';

// The Company Health card body: the checks the engine's health layer runs
// (equity, debt, profit without one-offs, operating cash, short-term cover),
// the headline figures, and health news published after the report. Shown only
// from the day the report could be read in the replay.
export function CompanyHealth({
  ticker,
  sessionDate,
  healthEvents,
}: {
  ticker: string;
  sessionDate: string;
  healthEvents: readonly EventView[];
}) {
  const { t, locale } = useTranslation();
  const report = findHealthReport(ticker);

  if (report === null) {
    return <p className="text-sm text-muted">{t('health.none', { ticker })}</p>;
  }
  if (sessionDate < report.availableFrom) {
    return (
      <p className="text-sm text-muted">
        {t('health.notYet', {
          label: report.label,
          date: formatSessionDate(report.availableFrom, locale),
        })}
      </p>
    );
  }

  // News the report itself could not contain: published after it was public.
  const since = healthEvents.filter((event) => event.publicationDate > report.availableFrom);

  return (
    <div>
      <p className="text-xs text-muted">
        {t('health.source', { label: report.label, date: formatSessionDate(report.periodEnd, locale) })}
      </p>

      <ul className="mt-3 divide-y divide-line">
        {checks(report, locale, t).map((check) => (
          <li key={check.label} className="grid gap-1 py-2.5 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-baseline sm:gap-4">
            <span className="text-sm font-medium text-ink">{check.label}</span>
            <span className="text-sm leading-relaxed text-muted">{check.detail}</span>
            <span className={`text-sm font-semibold sm:text-right ${TONE_CLASS[check.tone]}`}>
              <span aria-hidden="true">{TONE_ARROW[check.tone]} </span>
              {check.status}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label={t('health.revenue', { date: formatSessionDate(report.periodEnd, locale) })}>
          {idr(report.results.revenue, locale)}
          <span className="ml-1 text-xs font-normal text-muted">
            {t('health.versus', { change: signedPercent(report.results.revenue / report.priorResults.revenue - 1, locale) })}
          </span>
        </Figure>
        <Figure label={t('health.totalAssets')}>{idr(report.balance.totalAssets, locale)}</Figure>
        <Figure label={t('health.totalLiabilities')}>{idr(report.balance.totalLiabilities, locale)}</Figure>
        <Figure label={t('health.cash')}>{idr(report.balance.cash, locale)}</Figure>
      </dl>

      {since.length > 0 ? (
        <div className="mt-4">
          <h3 className="eyebrow">{t('health.sinceTitle')}</h3>
          <ul className="mt-2 space-y-2">
            {since.map((event) => (
              <li key={event.id} className="text-sm leading-relaxed text-ink">
                <span className="mr-2 text-xs tabular-nums text-mutedSoft">
                  {formatSessionDate(event.publicationDate, locale)}
                </span>
                {event.text}{' '}
                <a
                  href={event.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-brandDeep underline decoration-dotted underline-offset-4 hover:text-brand"
                >
                  {event.sourceName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.fictional ? (
        <Disclaimer className="mt-4">{t('health.fictionalDisclaimer', { ticker: report.ticker })}</Disclaimer>
      ) : (
        <Disclaimer className="mt-4">{t('health.disclaimer', { label: report.label })}</Disclaimer>
      )}
    </div>
  );
}

const TONE_CLASS: Record<Tone, string> = { up: 'text-buy', down: 'text-sell', flat: 'text-muted' };
const TONE_ARROW: Record<Tone, string> = { up: '▲', down: '▼', flat: '·' };

type Translate = (key: MessageKey, vars?: Record<string, string>) => string;

function checks(report: CompanyHealthReport, locale: Locale, t: Translate) {
  const { balance: now, priorBalance: before, results, priorResults } = report;
  const prior = formatSessionDate(report.priorBalanceDate, locale);
  const coreProfit = results.profitBeforeTax - results.oneOffGain;
  const ratio = (b: typeof now) => b.currentAssets / b.currentLiabilities;
  const debtTone = (current: number, previous: number): Tone => (current < previous ? 'up' : current > previous ? 'down' : 'flat');
  const debtStatus = (current: number, previous: number): string =>
    current < previous ? t('health.falling') : current > previous ? t('health.rising') : t('health.unchanged');

  return [
    {
      label: t('health.equity'),
      detail: t('health.fromTo', { now: idr(now.totalEquity, locale), before: idr(before.totalEquity, locale), date: prior }),
      status:
        now.totalEquity > 0
          ? now.totalEquity >= before.totalEquity
            ? t('health.positive')
            : t('health.positiveFalling')
          : now.totalEquity > before.totalEquity
            ? t('health.negativeImproving')
            : t('health.negative'),
      tone: (now.totalEquity >= before.totalEquity ? 'up' : 'down') as Tone,
    },
    {
      label: t('health.bankLoans'),
      detail: t('health.fromTo', { now: idr(now.bankLoans, locale), before: idr(before.bankLoans, locale), date: prior }),
      status: debtStatus(now.bankLoans, before.bankLoans),
      tone: debtTone(now.bankLoans, before.bankLoans),
    },
    {
      label: t('health.relatedBorrowings'),
      detail: t('health.fromTo', {
        now: idr(now.relatedPartyBorrowings, locale),
        before: idr(before.relatedPartyBorrowings, locale),
        date: prior,
      }),
      status: debtStatus(now.relatedPartyBorrowings, before.relatedPartyBorrowings),
      tone: debtTone(now.relatedPartyBorrowings, before.relatedPartyBorrowings),
    },
    {
      label: t('health.coreProfit'),
      detail: t('health.coreProfitDetail', {
        reported: idr(results.profitBeforeTax, locale),
        gain: idr(results.oneOffGain, locale),
        core: idr(coreProfit, locale),
      }),
      status: coreProfit >= 0 ? t('health.profit') : t('health.loss'),
      tone: (coreProfit >= 0 ? 'up' : 'down') as Tone,
    },
    {
      label: t('health.operatingCash'),
      detail: t('health.operatingCashDetail', {
        now: idr(results.operatingCashFlow, locale),
        before: idr(priorResults.operatingCashFlow, locale),
      }),
      status: results.operatingCashFlow >= 0 ? t('health.inflow') : t('health.outflow'),
      tone: (results.operatingCashFlow >= 0 ? 'up' : 'down') as Tone,
    },
    {
      label: t('health.currentRatio'),
      detail: t('health.currentRatioDetail', {
        now: ratioText(ratio(now), locale),
        before: ratioText(ratio(before), locale),
        date: prior,
      }),
      status: ratio(now) >= 1 ? t('health.covered') : t('health.notCovered'),
      tone: (ratio(now) >= 1 ? 'up' : 'down') as Tone,
    },
  ];
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surfaceAlt px-3 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 text-base font-semibold tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function idr(value: number, locale: Locale): string {
  const formatted = new Intl.NumberFormat(intlLocale(locale), {
    notation: 'compact',
    maximumFractionDigits: Math.abs(value) >= 1e12 ? 2 : 1,
  }).format(Math.abs(value));
  return `${value < 0 ? '−' : ''}Rp${formatted}`;
}

function signedPercent(fraction: number, locale: Locale): string {
  const formatted = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(Math.abs(fraction) * 100);
  return `${fraction >= 0 ? '+' : '−'}${formatted}%`;
}

function ratioText(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(value)}×`;
}
