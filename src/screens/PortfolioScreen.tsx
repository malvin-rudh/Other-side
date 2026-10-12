import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataModeChip } from '../components/DataModeChip';
import { Icon } from '../components/Icon';
import { PortfolioAnalyticsCard } from '../components/PortfolioAnalyticsCard';
import { ProviderEntryCard } from '../components/ProviderEntryCard';
import { useDialogTrap } from '../components/useDialogTrap';
import { INSTRUMENTS, instrumentExchange, instrumentNameText, type Instrument } from '../data/instruments';
import { formatSessionDate, useTranslation } from '../i18n';
import { useContextStore, type PortfolioEntry, type PortfolioList } from '../store/contextStore';
import '../layout.css';

function parseAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

// Shares are whole shares, so the field rejects zero and fractional input rather
// than passing a value the analytics engine would have to refuse.
function parseShareQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

export function PortfolioScreen() {
  const { t, locale } = useTranslation();
  const portfolio = useContextStore((state) => state.portfolio);
  const addHolding = useContextStore((state) => state.addHolding);
  const removeHolding = useContextStore((state) => state.removeHolding);
  const setHoldingList = useContextStore((state) => state.setHoldingList);
  const setHoldingQuantity = useContextStore((state) => state.setHoldingQuantity);
  const setHoldingAveragePrice = useContextStore((state) => state.setHoldingAveragePrice);
  const loadSamplePortfolio = useContextStore((state) => state.loadSamplePortfolio);
  const loadSampleAnalyticsPortfolio = useContextStore((state) => state.loadSampleAnalyticsPortfolio);
  const clearPortfolio = useContextStore((state) => state.clearPortfolio);

  const [query, setQuery] = useState('');
  const [confirmTrigger, setConfirmTrigger] = useState<HTMLButtonElement | null>(null);
  const [analyticsConfirmTrigger, setAnalyticsConfirmTrigger] = useState<HTMLButtonElement | null>(null);

  const tracked = new Set(portfolio.map((entry) => entry.ticker));
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
        <div>
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
              className="field min-w-0 flex-1"
              autoComplete="off"
            />
          </div>

          {matches.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t('portfolio.noMatch')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {matches.map((instrument) => (
                <RegistryRow
                  key={instrument.ticker}
                  instrument={instrument}
                  tracked={tracked.has(instrument.ticker)}
                  onAdd={(list) => addHolding(instrument.ticker, list)}
                />
              ))}
            </ul>
          )}
          <p className="note mt-3">{t('portfolio.registryNote')}</p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={(event) => {
              if (portfolio.length === 0) {
                loadSamplePortfolio();
                return;
              }
              setConfirmTrigger(event.currentTarget);
            }}
          >
            <Icon name="plus" className="h-3.5 w-3.5" />
            {t('portfolio.sample')}
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={(event) => {
              if (portfolio.length === 0) {
                loadSampleAnalyticsPortfolio();
                return;
              }
              setAnalyticsConfirmTrigger(event.currentTarget);
            }}
          >
            <Icon name="stock" className="h-3.5 w-3.5" />
            {t('portfolio.analyticsPreset')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={clearPortfolio} disabled={portfolio.length === 0}>
            <Icon name="trash" className="h-3.5 w-3.5" />
            {t('portfolio.clear')}
          </button>
          <span className="chip chip-line tabular-nums">{t('portfolio.entriesCount', { count: String(portfolio.length) })}</span>
        </div>
        <p className="note mt-3">{t('portfolio.sampleHint')}</p>
        <p className="note mt-1.5">{t('portfolio.storageNote')}</p>
      </div>

      <HoldingSection
        id="portfolio-owned"
        heading={t('portfolio.yourHoldings')}
        entries={owned}
        emptyText={t('portfolio.empty')}
        onRemove={removeHolding}
        onList={setHoldingList}
        onQuantity={setHoldingQuantity}
        onAveragePrice={setHoldingAveragePrice}
      />

      <PortfolioAnalyticsCard />

      <HoldingSection
        id="portfolio-watchlist"
        heading={t('portfolio.watchlist')}
        entries={watchlist}
        emptyText={t('portfolio.empty')}
        onRemove={removeHolding}
        onList={setHoldingList}
        onQuantity={setHoldingQuantity}
        onAveragePrice={setHoldingAveragePrice}
      />

      {confirmTrigger ? (
        <SampleConfirmDialog
          count={portfolio.length}
          trigger={confirmTrigger}
          onCancel={() => setConfirmTrigger(null)}
          onConfirm={() => {
            loadSamplePortfolio();
            setConfirmTrigger(null);
          }}
        />
      ) : null}

      {analyticsConfirmTrigger ? (
        <SampleConfirmDialog
          count={portfolio.length}
          trigger={analyticsConfirmTrigger}
          title={t('portfolio.analyticsConfirmTitle')}
          body={t('portfolio.analyticsConfirmBody')}
          confirmLabel={t('portfolio.analyticsConfirm')}
          cancelLabel={t('portfolio.analyticsCancel')}
          onCancel={() => setAnalyticsConfirmTrigger(null)}
          onConfirm={() => {
            loadSampleAnalyticsPortfolio();
            setAnalyticsConfirmTrigger(null);
          }}
        />
      ) : null}
    </section>
  );
}

function RegistryRow({
  instrument,
  tracked,
  onAdd,
}: {
  instrument: Instrument;
  tracked: boolean;
  onAdd: (list: PortfolioList) => void;
}) {
  const { t, locale } = useTranslation();
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-ink">{instrument.ticker}</span>
          <DataModeChip mode={instrument.dataMode} />
        </div>
        <p className="mt-0.5 truncate text-xs text-muted">{instrumentNameText(instrument.name, locale)}</p>
        <p className="mt-0.5 text-[11px] text-mutedSoft">
          {instrumentExchange(instrument, locale)}
          {instrument.verifiedThrough !== null
            ? ` · ${t('dataMode.verifiedNote', { date: formatSessionDate(instrument.verifiedThrough, locale) })}`
            : ''}
        </p>
      </div>
      {tracked ? (
        <span className="chip chip-line">
          <Icon name="check" className="h-3.5 w-3.5" />
          {t('portfolio.added')}
        </span>
      ) : (
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn btn-primary px-3 py-1.5 text-xs" onClick={() => onAdd('owned')}>
            <Icon name="plus" className="h-3.5 w-3.5" />
            {t('portfolio.ownThis')}
          </button>
          <button type="button" className="btn btn-quiet px-3 py-1.5 text-xs" onClick={() => onAdd('watchlist')}>
            {t('portfolio.followOnly')}
          </button>
        </div>
      )}
    </li>
  );
}

function HoldingSection({
  id,
  heading,
  entries,
  emptyText,
  onRemove,
  onList,
  onQuantity,
  onAveragePrice,
}: {
  id: string;
  heading: string;
  entries: PortfolioEntry[];
  emptyText: string;
  onRemove: (ticker: string) => void;
  onList: (ticker: string, list: PortfolioList) => void;
  onQuantity: (ticker: string, quantityShares: number | null) => void;
  onAveragePrice: (ticker: string, averagePrice: number | null) => void;
}) {
  const { t, locale } = useTranslation();
  return (
    <section aria-labelledby={id} className="card card-pad">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="text-xl font-semibold tracking-tight">
          {heading}
        </h2>
        <span className="chip chip-line tabular-nums">{t('portfolio.entriesCount', { count: String(entries.length) })}</span>
      </div>

      {entries.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-line bg-surfaceAlt p-4">
          <p className="text-sm text-muted">{emptyText}</p>
          <Link to="/stocks" className="btn btn-quiet mt-3">
            <Icon name="stocks" className="h-3.5 w-3.5" />
            {t('nav.stocks')}
          </Link>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {entries.map((entry) => {
            const instrument = INSTRUMENTS.find((candidate) => candidate.ticker === entry.ticker);
            if (instrument === undefined) {
              return (
                <li key={entry.ticker}>
                  <ProviderEntryCard
                    entry={entry}
                    inset
                    onList={(list) => onList(entry.ticker, list)}
                    onRemove={() => onRemove(entry.ticker)}
                    onQuantity={(quantityShares) => onQuantity(entry.ticker, quantityShares)}
                    onAveragePrice={(averagePrice) => onAveragePrice(entry.ticker, averagePrice)}
                  />
                </li>
              );
            }
            return (
              <li key={entry.ticker} className="card-inset p-3">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-ink">{instrument.ticker}</span>
                      <DataModeChip mode={instrument.dataMode} />
                      <span className="chip chip-line">
                        {entry.list === 'owned' ? t('portfolio.owned') : t('portfolio.watchlist')}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{instrumentNameText(instrument.name, locale)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {instrument.hasBrokerDataset ? (
                      <Link
                        to={`/stock/${instrument.ticker}`}
                        className="btn btn-quiet px-3 py-1.5 text-xs"
                        aria-label={t('portfolio.openAria', { ticker: instrument.ticker })}
                      >
                        {t('card.openFull')}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-ghost px-2.5 py-1.5 text-xs"
                      onClick={() => onRemove(entry.ticker)}
                      aria-label={t('portfolio.removeAria', { ticker: instrument.ticker })}
                      title={t('portfolio.remove')}
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <details className="mt-2">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink">
                    {t('portfolio.editDetails')}
                    <Icon name="expand" className="h-3.5 w-3.5 text-mutedSoft" />
                  </summary>
                  <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[11rem_minmax(0,1fr)_minmax(0,1fr)]">
                    <label className="block">
                      <span className="eyebrow">{t('portfolio.listLabel')}</span>
                      <select
                        className="field mt-1"
                        value={entry.list}
                        onChange={(event) => onList(entry.ticker, event.target.value === 'owned' ? 'owned' : 'watchlist')}
                      >
                        <option value="owned">{t('portfolio.owned')}</option>
                        <option value="watchlist">{t('portfolio.watchlist')}</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="eyebrow">{t('portfolio.quantityLabel')}</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        className="field mt-1 tabular-nums"
                        value={entry.quantityShares === null ? '' : String(entry.quantityShares)}
                        placeholder={t('card.notProvided')}
                        onChange={(event) => onQuantity(entry.ticker, parseShareQuantity(event.target.value))}
                      />
                    </label>
                    <label className="block">
                      <span className="eyebrow">{t('portfolio.averagePriceLabel')}</span>
                      <input
                        type="number"
                        min={0}
                        step={5}
                        inputMode="decimal"
                        className="field mt-1 tabular-nums"
                        value={entry.averagePrice === null ? '' : String(entry.averagePrice)}
                        placeholder={t('card.notProvided')}
                        onChange={(event) => onAveragePrice(entry.ticker, parseAmount(event.target.value))}
                      />
                    </label>
                  </div>
                  <p className="note mt-2">
                    {entry.quantityShares === null ? t('portfolio.trackedOnly') : `${t('card.optional')} · ${instrument.currency}`}
                  </p>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Loading a sample portfolio or the sample analytics preset replaces the
// evaluator's own entries, so both ask first instead of doing it silently.
function SampleConfirmDialog({
  count,
  trigger,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  count: number;
  trigger: HTMLElement | null;
  title?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogTrap(panelRef, closeRef, onCancel, trigger);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-navy/45 p-4 sm:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-confirm-title"
        className="w-full max-w-md animate-sheet-in rounded-2xl border border-line bg-surface p-5 shadow-lift"
      >
        <h2 id="sample-confirm-title" className="text-base font-semibold tracking-tight">
          {title ?? t('portfolio.sampleConfirmTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {body ?? t('portfolio.sampleConfirmBody', { count: String(count) })}
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button ref={closeRef} type="button" className="btn btn-quiet" onClick={onCancel}>
            {cancelLabel ?? t('portfolio.sampleCancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            {confirmLabel ?? t('portfolio.sampleConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
