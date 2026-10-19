import { findHealthReport, type CompanyHealthReport } from '../data/companyHealth';
import { currencyOf, formatAmount } from '../data/money';
import type { Locale } from '../engine/context';
import type { EventView } from '../engine/stockView';
import { formatSessionDate, intlLocale, useTranslation, type MessageKey } from '../i18n';
import { ui } from '../i18n/analysisCopy';
import { Disclaimer } from './Disclaimer';


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
  const currency = currencyOf(ticker);

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

      <HealthBars factors={factors(report, currency, locale, t)} locale={locale} />

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles(report, locale, t).map((tile) => (
          <Figure key={tile.key} label={tile.label} value={formatAmount(tile.value, currency, locale)} change={tile.change} />
        ))}
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

type Translate = (key: MessageKey, vars?: Record<string, string>) => string;

interface Factor {
  label: string;
  before: number;
  now: number;
  format: (value: number) => string;
}

function factors(report: CompanyHealthReport, currency: string, locale: Locale, t: Translate): Factor[] {
  const { balance: now, priorBalance: before, results, priorResults } = report;
  const money = (value: number) => formatAmount(value, currency, locale);
  const ratio = (b: typeof now) => b.currentAssets / b.currentLiabilities;
  return [
    { label: t('health.equity'), before: before.totalEquity, now: now.totalEquity, format: money },
    { label: t('health.bankLoans'), before: before.bankLoans, now: now.bankLoans, format: money },
    {
      label: t('health.relatedBorrowings'),
      before: before.relatedPartyBorrowings,
      now: now.relatedPartyBorrowings,
      format: money,
    },
    {
      label: t('health.coreProfit'),
      before: priorResults.profitBeforeTax - priorResults.oneOffGain,
      now: results.profitBeforeTax - results.oneOffGain,
      format: money,
    },
    {
      label: t('health.operatingCash'),
      before: priorResults.operatingCashFlow,
      now: results.operatingCashFlow,
      format: money,
    },
    {
      label: t('health.currentRatio'),
      before: ratio(before),
      now: ratio(now),
      format: (value) => ratioText(value, locale),
    },
  ];
}

// All factors in one vertical bar chart: a column per factor with the previous
// value (grey) and the latest (green when it went up, red when it went down,
// grey when unchanged) side by side on one shared zero line. Factors differ in unit and size, so each
// column is scaled to its own larger value; the numbers under each column carry
// the actual amounts.
const PLOT_HEIGHT = 168;

function HealthBars({ factors: rows, locale }: { factors: Factor[]; locale: Locale }) {
  const copy = ui(locale);
  const anyNegative = rows.some((row) => row.before < 0 || row.now < 0);
  // Room above and below the zero line; below only when something is negative.
  const up = anyNegative ? Math.round(PLOT_HEIGHT * 0.62) : PLOT_HEIGHT;
  const down = PLOT_HEIGHT - up;

  return (
    <div className="mt-3" data-testid="health-chart">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h3 className="eyebrow">{copy.healthChartTitle}</h3>
        <p className="flex items-center gap-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-2 rounded-sm" style={{ background: '#CBD5E1' }} />
            {copy.healthPrevious}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3 w-2 rounded-sm bg-buy" />
            <span aria-hidden="true" className="-ml-1 h-3 w-2 rounded-sm bg-sell" />
            {copy.healthLatest}
          </span>
        </p>
      </div>

      <div className="mt-3 rounded-lg border border-line bg-surfaceAlt px-2 pb-2 pt-3">
        <div className="relative grid grid-cols-6 gap-1 sm:gap-3" style={{ height: PLOT_HEIGHT }}>
          <span aria-hidden="true" className="absolute inset-x-0 h-px bg-lineStrong" style={{ top: up }} />
          {rows.map((row) => {
            const scale = Math.max(Math.abs(row.before), Math.abs(row.now)) || 1;
            const change = row.now - row.before;
            // Direction only: up is green, down is red, unchanged is grey.
            const colour = change === 0 ? 'bg-mutedSoft' : change > 0 ? 'bg-buy' : 'bg-sell';
            const bar = (value: number, className: string, style?: { background: string }) => {
              const room = value >= 0 ? up : down;
              const height = Math.max((Math.abs(value) / scale) * (room - 4), 2);
              return (
                <span
                  className={`absolute w-[72%] max-w-[30px] rounded-sm ${className}`}
                  style={{
                    ...style,
                    height,
                    ...(value >= 0 ? { bottom: PLOT_HEIGHT - up } : { top: up }),
                  }}
                />
              );
            };
            return (
              <div
                key={row.label}
                role="img"
                aria-label={`${row.label}: ${copy.healthFromTo(row.format(row.before), row.format(row.now))}`}
                className="relative flex justify-center"
              >
                <div className="relative h-full w-full max-w-[96px]">
                  <div className="absolute inset-y-0 left-[8%] right-1/2 flex justify-end">
                    {bar(row.before, 'right-[6%]', { background: '#CBD5E1' })}
                  </div>
                  <div className="absolute inset-y-0 left-1/2 right-[8%]">{bar(row.now, `left-[6%] ${colour}`)}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-6 gap-1 border-t border-line pt-2 sm:gap-3">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0 text-center">
              <p className="text-[11px] font-medium leading-tight text-ink sm:text-xs">{row.label}</p>
              <p className="mt-1 text-[10px] leading-tight tabular-nums text-muted sm:text-[11px]">
                {row.format(row.before)}
                <span aria-hidden="true" className="block text-mutedSoft">
                  ↓
                </span>
                <span className="font-semibold text-ink">{row.format(row.now)}</span>
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface Tile {
  key: string;
  label: string;
  value: number;
  change: { text: string; sign: number } | null;
}

// The four figure tiles. "From Q1" means the previous available report: with
// a previous report, revenue is Q2 on its own (H1 minus Q1 year to date)
// against Q1, and the balance items are 30 Jun against 31 Mar. Without one
// (SINI) the comparisons that exist are used and named honestly: balance items
// against Dec, revenue H1 against H1 of last year.
function tiles(report: CompanyHealthReport, locale: Locale, t: Translate): Tile[] {
  const copy = ui(locale);
  const prev = report.previousReport;
  const month = new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const quarter = prev ? (prev.label.split(' ')[0] ?? prev.label) : null;
  const balanceBase = quarter ?? month.format(new Date(`${report.priorBalanceDate}T00:00:00Z`));
  const revenueBase = quarter ?? `H1 ${report.priorResultsEnd.slice(0, 4)}`;

  // `compared` is the figure the change is measured on; `value` is what the tile shows.
  const make = (key: string, label: string, value: number, compared: number, before: number, base: string): Tile => {
    if (before <= 0) return { key, label, value, change: null };
    const pct = Math.round((compared / before - 1) * 100);
    const sign = pct === 0 ? 0 : pct > 0 ? 1 : -1;
    const text = `${sign > 0 ? '+' : sign < 0 ? '−' : ''}${new Intl.NumberFormat(intlLocale(locale)).format(Math.abs(pct))}%`;
    return { key, label, value, change: { text: copy.healthChange(text, base), sign } };
  };

  const b = report.balance;
  const before = prev ?? report.priorBalance;
  const revenue = report.results.revenue;
  return [
    prev
      ? // Shows Q2's own revenue so the figure and its change describe the same quarter.
        make('revenue', copy.healthRevenue, revenue - prev.revenue, revenue - prev.revenue, prev.revenue, revenueBase)
      : make('revenue', copy.healthRevenue, revenue, revenue, report.priorResults.revenue, revenueBase),
    make('assets', t('health.totalAssets'), b.totalAssets, b.totalAssets, before.totalAssets, balanceBase),
    make('liabilities', t('health.totalLiabilities'), b.totalLiabilities, b.totalLiabilities, before.totalLiabilities, balanceBase),
    make('cash', t('health.cash'), b.cash, b.cash, before.cash, balanceBase),
  ];
}

function Figure({ label, value, change }: { label: string; value: string; change: Tile['change'] }) {
  return (
    <div className="rounded-lg border border-line bg-surfaceAlt px-3 py-2.5">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-base font-semibold tabular-nums text-ink">{value}</span>
        {change !== null ? (
          <span
            data-testid="health-change"
            className={`text-xs font-semibold tabular-nums ${change.sign > 0 ? 'text-buy' : change.sign < 0 ? 'text-sell' : 'text-muted'}`}
          >
            {change.text}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function ratioText(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(value)}×`;
}
