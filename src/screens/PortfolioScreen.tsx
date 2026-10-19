import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataModeChip } from '../components/DataModeChip';
import { Icon } from '../components/Icon';
import { PortfolioAnalyticsCard } from '../components/PortfolioAnalyticsCard';
import { ConfirmDialog, LOT_SIZE, PurchaseDialog } from '../components/PortfolioDialogs';
import { findInstrument, INSTRUMENTS, instrumentExchange, instrumentNameText } from '../data/instruments';
import type { Locale } from '../engine/context';
import { formatSessionDate, intlLocale, stockCountLabel, useTranslation } from '../i18n';
import { currencyOf, formatPrice } from '../data/money';
import { useContextStore, type PortfolioEntry } from '../store/contextStore';
import '../layout.css';


type DialogState =
  | { kind: 'buy'; ticker: string; trigger: HTMLElement | null }
  | { kind: 'remove'; ticker: string; list: PortfolioEntry['list']; trigger: HTMLElement | null }
  | { kind: 'sample'; trigger: HTMLElement | null };

export function PortfolioScreen() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const portfolio = useContextStore((state) => state.portfolio);
  const addHolding = useContextStore((state) => state.addHolding);
  const removeHolding = useContextStore((state) => state.removeHolding);
  const recordPurchase = useContextStore((state) => state.recordPurchase);
  const loadSamplePortfolio = useContextStore((state) => state.loadSamplePortfolio);

  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const listOf = new Map(portfolio.map((entry) => [entry.ticker, entry.list]));
  const normalizedQuery = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (normalizedQuery === '') return INSTRUMENTS;
    return INSTRUMENTS.filter(
      (instrument) =>
        instrument.ticker.toLowerCase().includes(normalizedQuery) ||
        instrumentNameText(instrument.name, locale).toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, locale]);

  const owned = portfolio.filter((entry) => entry.list === 'owned');
  const watchlist = portfolio.filter((entry) => entry.list === 'watchlist');

  const openBuy = (ticker: string, trigger: HTMLElement) => setDialog({ kind: 'buy', ticker, trigger });
  const openRemove = (entry: PortfolioEntry, trigger: HTMLElement) =>
    setDialog({ kind: 'remove', ticker: entry.ticker, list: entry.list, trigger });
  const openAnalysis = (ticker: string) => navigate(`/stock/${ticker}`);
  const loadSample = (trigger: HTMLElement) => {
    if (portfolio.length === 0) {
      loadSamplePortfolio();
      return;
    }
    setDialog({ kind: 'sample', trigger });
  };

  const buyEntry = dialog?.kind === 'buy' ? (portfolio.find((entry) => entry.ticker === dialog.ticker) ?? null) : null;

  return (
    <section aria-labelledby="portfolio-title" className="page-stack">
      <header id="portfolio-header" className="page-hero">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className="h-6 w-1 shrink-0 rounded-full bg-brand" />
          <h1 id="portfolio-title" className="text-2xl font-semibold tracking-tight lg:text-[2rem] lg:leading-tight">
            {t('portfolio.title')}
          </h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('portfolio.intro')}</p>
      </header>

      <PortfolioAnalyticsCard />

      <ListCard id="portfolio-owned" heading={t('portfolio.myHoldings')} count={owned.length}>
        {owned.length === 0 ? (
          <EmptyNote text={t('portfolio.emptyHoldings')} />
        ) : (
          <ul className="divide-y divide-line">
            {owned.map((entry) => (
              <li key={entry.ticker} className="py-4 first:pt-1 last:pb-1">
                <div className="portfolio-row !p-0">
                  <StockIdentity ticker={entry.ticker} />
                  <RowActions
                    ticker={entry.ticker}
                    onAnalysis={() => openAnalysis(entry.ticker)}
                    onEdit={(trigger) => openBuy(entry.ticker, trigger)}
                    onRemove={(trigger) => openRemove(entry, trigger)}
                  />
                </div>
                <PurchaseDetails entry={entry} locale={locale} onAdd={(trigger) => openBuy(entry.ticker, trigger)} />
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      <ListCard id="portfolio-watchlist" heading={t('portfolio.watchlist')} count={watchlist.length}>
        {watchlist.length === 0 ? (
          <EmptyNote text={t('portfolio.emptyWatchlist')} />
        ) : (
          <ul className="divide-y divide-line">
            {watchlist.map((entry) => (
              <li key={entry.ticker} className="portfolio-row">
                <StockIdentity ticker={entry.ticker} />
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    className="btn btn-quiet px-3 py-1.5 text-xs"
                    onClick={(event) => openBuy(entry.ticker, event.currentTarget)}
                  >
                    <Icon name="plus" className="h-3.5 w-3.5" />
                    {t('portfolio.addToPortfolio')}
                  </button>
                  <RowActions
                    ticker={entry.ticker}
                    onAnalysis={() => openAnalysis(entry.ticker)}
                    onRemove={(trigger) => openRemove(entry, trigger)}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </ListCard>

      <div className="card card-pad">
        <label htmlFor="portfolio-search" className="eyebrow">
          {t('portfolio.search')}
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-mutedSoft">
            <Icon name="search" />
          </span>
          <input
            id="portfolio-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('stocks.searchPlaceholder')}
            className="field min-w-0 flex-1"
            autoComplete="off"
          />
        </div>

        {matches.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t('portfolio.noMatch')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {matches.map((instrument) => {
              const list = listOf.get(instrument.ticker) ?? null;
              return (
                <li key={instrument.ticker} className="portfolio-row">
                  <StockIdentity ticker={instrument.ticker} />
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {list === 'owned' ? (
                      <AddedChip label={t('portfolio.addedPortfolio')} />
                    ) : (
                      <>
                        {list === 'watchlist' ? <AddedChip label={t('portfolio.addedWatchlist')} /> : null}
                        <button
                          type="button"
                          className="btn btn-primary px-3 py-1.5 text-xs"
                          onClick={(event) => openBuy(instrument.ticker, event.currentTarget)}
                        >
                          <Icon name="plus" className="h-3.5 w-3.5" />
                          {t('portfolio.addToPortfolio')}
                        </button>
                        {list === null ? (
                          <button
                            type="button"
                            className="btn btn-quiet px-3 py-1.5 text-xs"
                            onClick={() => addHolding(instrument.ticker, 'watchlist')}
                          >
                            {t('portfolio.addToWatchlist')}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <button type="button" className="btn btn-quiet" onClick={(event) => loadSample(event.currentTarget)}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            {t('portfolio.sample')}
          </button>
        </div>
      </div>

      {dialog?.kind === 'buy' ? (
        <PurchaseDialog
          ticker={dialog.ticker}
          entry={buyEntry}
          trigger={dialog.trigger}
          onCancel={() => setDialog(null)}
          onSave={(purchase) => {
            recordPurchase(dialog.ticker, purchase);
            setDialog(null);
          }}
        />
      ) : null}

      {dialog?.kind === 'remove' ? (
        <ConfirmDialog
          trigger={dialog.trigger}
          title={t(dialog.list === 'owned' ? 'portfolio.removeHoldingTitle' : 'portfolio.removeWatchTitle', {
            ticker: dialog.ticker,
          })}
          body={t(dialog.list === 'owned' ? 'portfolio.removeHoldingBody' : 'portfolio.removeWatchBody', {
            ticker: dialog.ticker,
          })}
          confirmLabel={t('portfolio.remove')}
          cancelLabel={t('portfolio.keep')}
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            removeHolding(dialog.ticker);
            setDialog(null);
          }}
        />
      ) : null}

      {dialog?.kind === 'sample' ? (
        <ConfirmDialog
          trigger={dialog.trigger}
          title={t('portfolio.sampleConfirmTitle')}
          body={t('portfolio.sampleConfirmBody', { count: String(portfolio.length) })}
          confirmLabel={t('portfolio.sampleConfirm')}
          cancelLabel={t('portfolio.sampleCancel')}
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            loadSamplePortfolio();
            setDialog(null);
          }}
        />
      ) : null}
    </section>
  );
}

// Ticker, company name and exchange: how a stock reads in every Portfolio list.
function StockIdentity({ ticker }: { ticker: string }) {
  const { locale } = useTranslation();
  const instrument = findInstrument(ticker);
  const provider = useContextStore((state) => state.providerInstruments.find((entry) => entry.symbol === ticker));
  const name = instrument !== null ? instrumentNameText(instrument.name, locale) : (provider?.name ?? null);
  const exchange = instrument !== null ? instrumentExchange(instrument, locale) : (provider?.exchange ?? null);
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold tracking-tight tabular-nums text-ink">{ticker}</span>
        <DataModeChip mode={instrument?.dataMode ?? 'provider'} />
      </div>
      {name !== null ? <p className="mt-0.5 truncate text-sm text-muted">{name}</p> : null}
      {exchange !== null ? <p className="mt-0.5 text-xs text-mutedSoft">{exchange}</p> : null}
    </div>
  );
}

function AddedChip({ label }: { label: string }) {
  return (
    <span className="chip chip-line">
      <Icon name="check" className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function RowActions({
  ticker,
  onAnalysis,
  onEdit,
  onRemove,
}: {
  ticker: string;
  onAnalysis: () => void;
  onEdit?: (trigger: HTMLElement) => void;
  onRemove: (trigger: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        className="btn btn-quiet px-3 py-1.5 text-xs"
        onClick={onAnalysis}
        aria-label={`${t('card.openFull')}: ${ticker}`}
      >
        {t('card.openFull')}
      </button>
      {onEdit ? (
        <button
          type="button"
          className="btn btn-quiet px-3 py-1.5 text-xs"
          onClick={(event) => onEdit(event.currentTarget)}
          aria-label={t('portfolio.editAria', { ticker })}
        >
          {t('portfolio.edit')}
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn-ghost px-2.5 py-1.5 text-xs"
        onClick={(event) => onRemove(event.currentTarget)}
        aria-label={t('portfolio.removeAria', { ticker })}
        title={t('portfolio.remove')}
      >
        <Icon name="trash" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// The holding's purchase: date, lots (and shares), average price and cost.
function PurchaseDetails({
  entry,
  locale,
  onAdd,
}: {
  entry: PortfolioEntry;
  locale: Locale;
  onAdd: (trigger: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  if (entry.quantityShares === null || entry.averagePrice === null) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2">
        <p className="text-xs text-muted">{t('portfolio.detailsMissing')}</p>
        <button
          type="button"
          className="btn btn-quiet ml-auto px-2.5 py-1 text-xs"
          onClick={(event) => onAdd(event.currentTarget)}
        >
          {t('portfolio.addDetails')}
        </button>
      </div>
    );
  }
  const lots = entry.quantityShares / LOT_SIZE;
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-surfaceAlt px-3 py-2.5 sm:grid-cols-4">
      <Detail label={t('portfolio.boughtOn')}>
        {entry.purchaseDate !== null ? formatSessionDate(entry.purchaseDate, locale) : '—'}
      </Detail>
      <Detail label={t('portfolio.lotsLabelShort')}>
        {formatNumber(lots, locale)}
        <span className="ml-1 text-xs font-normal text-mutedSoft">
          {t('portfolio.sharesValue', { shares: formatNumber(entry.quantityShares, locale) })}
        </span>
      </Detail>
      <Detail label={t('portfolio.avgPrice')}>{formatPrice(entry.averagePrice, currencyOf(entry.ticker), locale)}</Detail>
      <Detail label={t('portfolio.costBasis')}>
        {formatPrice(entry.averagePrice * entry.quantityShares, currencyOf(entry.ticker), locale)}
      </Detail>
    </dl>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function ListCard({ id, heading, count, children }: { id: string; heading: string; count: number; children: ReactNode }) {
  const { locale } = useTranslation();
  return (
    <section aria-labelledby={id} className="card card-pad">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {heading}
        </h2>
        <span className="chip chip-line tabular-nums">{stockCountLabel(count, locale)}</span>
      </div>
      {children}
    </section>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surfaceAlt p-4">
      <p className="text-sm text-muted">{text}</p>
    </div>
  );
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(value);
}
