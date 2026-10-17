import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataModeChip } from '../components/DataModeChip';
import { Icon } from '../components/Icon';
import { PortfolioAnalyticsCard } from '../components/PortfolioAnalyticsCard';
import { useDialogTrap } from '../components/useDialogTrap';
import { findInstrument, INSTRUMENTS, instrumentExchange, instrumentNameText } from '../data/instruments';
import type { Locale } from '../engine/context';
import { formatSessionDate, intlLocale, stockCountLabel, useTranslation } from '../i18n';
import { useContextStore, type PortfolioEntry } from '../store/contextStore';
import '../layout.css';

// Indonesian shares trade in lots of 100.
const LOT_SIZE = 100;

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

      <PortfolioAnalyticsCard />

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
      <Detail label={t('portfolio.avgPrice')}>Rp{formatNumber(entry.averagePrice, locale)}</Detail>
      <Detail label={t('portfolio.costBasis')}>Rp{formatNumber(entry.averagePrice * entry.quantityShares, locale)}</Detail>
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

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// The buy overlay: lots, price per share and buy date. Opens empty for a new
// holding and pre-filled when editing one.
function PurchaseDialog({
  ticker,
  entry,
  trigger,
  onCancel,
  onSave,
}: {
  ticker: string;
  entry: PortfolioEntry | null;
  trigger: HTMLElement | null;
  onCancel: () => void;
  onSave: (purchase: { quantityShares: number; averagePrice: number; purchaseDate: string }) => void;
}) {
  const { t, locale } = useTranslation();
  const today = todayIso();
  // A new buy, details for a holding added without them, or an edit.
  const mode =
    entry === null || entry.list !== 'owned' ? 'new' : entry.quantityShares === null ? 'details' : 'edit';
  const [lots, setLots] = useState(
    entry?.quantityShares != null ? String(entry.quantityShares / LOT_SIZE) : '',
  );
  const [price, setPrice] = useState(entry?.averagePrice != null ? String(entry.averagePrice) : '');
  const [date, setDate] = useState(entry?.purchaseDate ?? today);
  const [submitted, setSubmitted] = useState(false);
  const lotsRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    lotsRef.current?.focus();
  }, []);

  const lotsValue = Number(lots);
  const lotsOk = lots.trim() !== '' && Number.isSafeInteger(lotsValue) && lotsValue > 0;
  const priceValue = Number(price);
  const priceOk = price.trim() !== '' && Number.isFinite(priceValue) && priceValue > 0;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const valid = lotsOk && priceOk && dateOk;

  return (
    <DialogShell trigger={trigger} titleId="purchase-title" onCancel={onCancel}>
      {(closeRef) => (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(true);
            if (valid) onSave({ quantityShares: lotsValue * LOT_SIZE, averagePrice: priceValue, purchaseDate: date });
          }}
        >
          <h2 id="purchase-title" className="text-base font-semibold tracking-tight">
            {t(mode === 'edit' ? 'portfolio.editTitle' : mode === 'details' ? 'portfolio.detailsTitle' : 'portfolio.buyTitle', {
              ticker,
            })}
          </h2>
          <div className="mt-4 grid gap-3">
            <label className="block">
              <span className="eyebrow">{t('portfolio.lotsLabel')}</span>
              <input
                ref={lotsRef}
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                className="field mt-1 tabular-nums"
                value={lots}
                onChange={(event) => setLots(event.target.value)}
              />
              <span className="mt-1 block text-xs text-mutedSoft">
                {t('portfolio.lotsHint', {
                  shares: lotsOk ? formatNumber(lotsValue * LOT_SIZE, locale) : '0',
                })}
              </span>
              {submitted && !lotsOk ? <FieldError text={t('portfolio.lotsError')} /> : null}
            </label>
            <label className="block">
              <span className="eyebrow">{t('portfolio.priceLabel')}</span>
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                className="field mt-1 tabular-nums"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
              {submitted && !priceOk ? <FieldError text={t('portfolio.priceError')} /> : null}
            </label>
            <label className="block">
              <span className="eyebrow">{t('portfolio.dateLabel')}</span>
              <input
                type="date"
                max={today}
                className="field mt-1 tabular-nums"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
              {submitted && !dateOk ? <FieldError text={t('portfolio.dateError')} /> : null}
            </label>
            {lotsOk && priceOk ? (
              <p className="text-sm text-muted">
                {t('portfolio.costPreview', {
                  cost: `Rp${formatNumber(lotsValue * LOT_SIZE * priceValue, locale)}`,
                })}
              </p>
            ) : null}
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button ref={closeRef} type="button" className="btn btn-quiet" onClick={onCancel}>
              {t('portfolio.cancel')}
            </button>
            <button type="submit" className="btn btn-primary">
              {t(mode === 'new' ? 'portfolio.addToPortfolio' : 'portfolio.saveEdit')}
            </button>
          </div>
        </form>
      )}
    </DialogShell>
  );
}

function FieldError({ text }: { text: string }) {
  return <span className="mt-1 block text-xs font-medium text-sell">{text}</span>;
}

function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  trigger: HTMLElement | null;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogShell trigger={trigger} titleId="confirm-title" onCancel={onCancel}>
      {(closeRef) => (
        <>
          <h2 id="confirm-title" className="text-base font-semibold tracking-tight">
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button ref={closeRef} type="button" className="btn btn-quiet" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={danger ? 'btn border-sell bg-sell text-white hover:bg-sell/90' : 'btn btn-primary'}
              onClick={onConfirm}
            >
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </DialogShell>
  );
}

function DialogShell({
  trigger,
  titleId,
  onCancel,
  children,
}: {
  trigger: HTMLElement | null;
  titleId: string;
  onCancel: () => void;
  children: (closeRef: RefObject<HTMLButtonElement>) => ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogTrap(panelRef, closeRef, onCancel, trigger);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy/45 p-4 sm:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md animate-sheet-in rounded-2xl border border-line bg-surface p-5 shadow-lift"
      >
        {children(closeRef)}
      </div>
    </div>
  );
}

function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(value);
}
