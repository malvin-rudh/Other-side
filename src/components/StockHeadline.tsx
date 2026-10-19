import { useMemo } from 'react';
import { findInstrument, instrumentNameText } from '../data/instruments';
import { currencyOf, formatPrice } from '../data/money';
import { usePublicData } from '../data/publicData';
import { useSessionClose } from '../data/portfolioPrices';
import { summarizeFlows } from '../engine/insights';
import { useTranslation } from '../i18n';
import { holdingHeadline, watchlistHeadline, type HeadlinePrice } from '../i18n/insightCopy';
import { DataModeChip } from './DataModeChip';
import { Disclaimer } from './Disclaimer';

// One stock in a list: ticker, company name, one headline sentence and the way
// into its analysis page. Shared by the Brief lists and the Stocks screen so a
// stock reads the same wherever it appears. The headline says who bought and
// who sold up to the session on screen; for a holding it says who holds the
// stock with the user, at what price, and whether that changed.
export function StockHeadline({
  ticker,
  onOpen,
  sessionDate = null,
  mode = 'flow',
}: {
  ticker: string;
  onOpen: () => void;
  sessionDate?: string | null;
  mode?: 'flow' | 'holding';
}) {
  const { t, locale } = useTranslation();
  const instrument = findInstrument(ticker);
  const state = usePublicData(instrument?.hasBrokerDataset ? ticker : null);
  const summary = useMemo(
    () => (state.status === 'ready' ? summarizeFlows(state.data, sessionDate ?? state.data.defaultWindow.end) : null),
    [state, sessionDate],
  );
  const closeState = useSessionClose(ticker, summary?.end ?? null, summary?.start ?? null);
  const headline = useMemo(() => {
    if (summary === null) return null;
    const currency = currencyOf(ticker);
    const close = closeState.status === 'ready' ? closeState.close : null;
    const price: HeadlinePrice = {
      close: close?.close ?? null,
      windowStartClose: close?.windowStartClose ?? null,
      format: (value) => formatPrice(value, currency, locale),
    };
    return mode === 'holding' ? holdingHeadline(summary, locale, price) : watchlistHeadline(summary, locale, price);
  }, [summary, closeState, ticker, mode, locale]);
  const disclaimer =
    instrument === null
      ? t('portfolio.providerNote')
      : !instrument.hasBrokerDataset
        ? t('card.unavailableAnalysis', { ticker })
        : null;

  return (
    <div className="stock-headline">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[17px] font-semibold tracking-tight tabular-nums text-ink">{ticker}</span>
          <DataModeChip mode={instrument?.dataMode ?? 'provider'} />
        </div>
        {instrument !== null ? (
          <p className="mt-0.5 text-xs text-mutedSoft">{instrumentNameText(instrument.name, locale)}</p>
        ) : null}
        {headline !== null ? <p className="mt-2 text-sm leading-relaxed text-ink">{headline}</p> : null}
        {disclaimer !== null ? <Disclaimer className="mt-1">{disclaimer}</Disclaimer> : null}
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('card.openFull')}: ${ticker}`}
        className="btn btn-quiet shrink-0 px-3 py-1.5 text-xs"
      >
        {t('card.openFull')}
      </button>
    </div>
  );
}
