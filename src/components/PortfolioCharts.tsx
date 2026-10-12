// Number formatters and the plain HTML bars of the portfolio analytics layer.
// The Recharts line charts live in charts/PortfolioLineCharts.tsx so importing
// these never pulls Recharts into the main browser bundle. Every number shown
// comes from engine/portfolio.ts arithmetic; the bars only format it.
// Allocation bars are neutral (they carry no sign), contribution bars keep the
// app-wide sign colours with the sign always printed beside them.

import type { Locale } from '../engine/context';
import type { PortfolioAnalytics } from '../engine/portfolio';
import { intlLocale, useTranslation } from '../i18n';
import { EvidenceButton } from './EvidenceButton';

type OpenEvidence = (factId: string, trigger: HTMLButtonElement) => void;

export function idrCompact(value: number, locale: Locale): string {
  const abs = Math.abs(value);
  if (locale === 'zh-CN') {
    if (abs >= 1e8) return `Rp${(Math.round((abs / 1e8) * 10) / 10).toFixed(1)}亿`;
    if (abs >= 1e4) return `Rp${(Math.round((abs / 1e4) * 10) / 10).toFixed(1)}万`;
    return `Rp${new Intl.NumberFormat('zh-CN').format(abs)}`;
  }
  if (abs >= 1e6) {
    const digits = (Math.round((abs / 1e6) * 10) / 10).toFixed(1);
    return locale === 'id' ? `Rp${digits.replace('.', ',')} jt` : `Rp${digits}m`;
  }
  return `Rp${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(abs)}`;
}

// The magnitude is formatted and the sign is added once, so a negative fraction
// prints one minus sign rather than the sign character followed by the digit
// string's own hyphen. A value that rounds to zero prints no sign at all.
export function signedPercent(fraction: number, locale: Locale): string {
  const pct = Math.round(fraction * 1000) / 10;
  const digits = Math.abs(pct).toFixed(1);
  const body = locale === 'id' ? digits.replace('.', ',') : digits;
  const sign = pct > 0 ? '+' : pct < 0 ? '\u2212' : '';
  return `${sign}${body}%`;
}

// A signed percentage-point amount with no unit suffix. A contribution is one
// holding's share of the whole portfolio change, so printing it with a % sign
// would read as that holding's own return, which is a different number. The
// caller prints the localized unit words after it.
export function signedPoints(fraction: number, locale: Locale): string {
  const points = Math.round(fraction * 1000) / 10;
  const digits = Math.abs(points).toFixed(1);
  const body = locale === 'id' ? digits.replace('.', ',') : digits;
  const sign = points > 0 ? '+' : points < 0 ? '\u2212' : '';
  return `${sign}${body}`;
}

// An unsigned percentage magnitude. Weights are never negative, but the sign is
// still handled here so a negative input cannot print a bare ASCII hyphen.
export function plainPercent(fraction: number, locale: Locale): string {
  const pct = Math.round(fraction * 1000) / 10;
  const digits = Math.abs(pct).toFixed(1);
  const body = locale === 'id' ? digits.replace('.', ',') : digits;
  return pct < 0 ? `\u2212${body}` : body;
}

// Neutral horizontal bars: each owned holding's share of the modelled end
// value. Every printed weight opens the complete per-symbol breakdown fact,
// which carries that holding's own quantity, close, value and total.
export function AllocationBars({
  analytics,
  locale,
  factId,
  onOpenEvidence,
}: {
  analytics: PortfolioAnalytics;
  locale: Locale;
  factId: string;
  onOpenEvidence: OpenEvidence;
}) {
  const { t } = useTranslation();
  const rows = [...analytics.holdings].sort((a, b) => b.weightFraction - a.weightFraction);
  const max = Math.max(...rows.map((row) => row.weightFraction), 0);
  return (
    <ul className="space-y-2.5" aria-label={t('analytics.allocation.listLabel')}>
      {rows.map((row) => (
        <li key={row.symbol}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold tabular-nums">{row.symbol}</span>
            <span className="tabular-nums">
              {factId !== '' ? (
                <EvidenceButton
                  factId={factId}
                  ariaLabel={t('analytics.evidenceWeightAria', { symbol: row.symbol, value: plainPercent(row.weightFraction, locale) })}
                  onActivate={onOpenEvidence}
                >
                  {plainPercent(row.weightFraction, locale)}%
                </EvidenceButton>
              ) : (
                <>{plainPercent(row.weightFraction, locale)}%</>
              )}
              <span className="text-muted"> · {idrCompact(row.endValue, locale)}</span>
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-line" role="presentation">
            <div
              className="h-full rounded-full bg-navy"
              style={{ width: `${max > 0 ? Math.max((row.weightFraction / max) * 100, 1) : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Signed bars around a centre line: each holding's contribution to the change
// in modelled value, printed in percentage points because the contributions sum
// to the portfolio's own change. Teal raises, rose lowers, and the printed sign
// carries the meaning, never the colour alone. Every printed share opens the
// complete per-symbol breakdown fact.
export function ContributionBars({
  analytics,
  locale,
  factId,
  onOpenEvidence,
}: {
  analytics: PortfolioAnalytics;
  locale: Locale;
  factId: string;
  onOpenEvidence: OpenEvidence;
}) {
  const { t } = useTranslation();
  const rows = [...analytics.holdings].sort(
    (a, b) => Math.abs(b.contributionFraction) - Math.abs(a.contributionFraction),
  );
  const max = Math.max(...rows.map((row) => Math.abs(row.contributionFraction)), 0);
  return (
    <ul className="space-y-2.5" aria-label={t('analytics.contribution.listLabel')}>
      {rows.map((row) => {
        const width = max > 0 ? Math.max((Math.abs(row.contributionFraction) / max) * 50, 1) : 0;
        const positive = row.contributionFraction >= 0;
        return (
          <li key={row.symbol}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold tabular-nums">{row.symbol}</span>
              <span className={`tabular-nums ${positive ? 'text-buy' : 'text-sell'}`}>
                {factId !== '' ? (
                  <EvidenceButton
                    factId={factId}
                    className={positive ? 'text-buy' : 'text-sell'}
                    ariaLabel={t('analytics.evidenceContributionAria', {
                      symbol: row.symbol,
                      value: signedPoints(row.contributionFraction, locale),
                    })}
                    onActivate={onOpenEvidence}
                  >
                    {signedPoints(row.contributionFraction, locale)} {t('analytics.points')}
                  </EvidenceButton>
                ) : (
                  <>
                    {signedPoints(row.contributionFraction, locale)} {t('analytics.points')}
                  </>
                )}
              </span>
            </div>
            <div className="relative mt-1 h-2 w-full rounded-full bg-line" role="presentation">
              <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px bg-lineStrong" />
              <div
                className={`absolute inset-y-0 rounded-full ${positive ? 'bg-buy left-1/2' : 'bg-sell right-1/2'}`}
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
