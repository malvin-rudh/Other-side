import { useContextStore, type PortfolioEntry, type PortfolioList } from '../store/contextStore';
import { DataModeChip } from './DataModeChip';
import { Icon } from './Icon';
import { useTranslation } from '../i18n';

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

// Provider-only holdings have no broker dataset at all. The card says that
// plainly instead of guessing, and never links to a replay that does not exist.
// Quantity and average price are editable here exactly like registry holdings,
// because the analytics model values provider-only holdings by their quantity.
export function ProviderEntryCard({
  entry,
  onRemove,
  onList,
  onQuantity,
  onAveragePrice,
  inset = false,
}: {
  entry: PortfolioEntry;
  onRemove?: () => void;
  onList?: (list: PortfolioList) => void;
  onQuantity?: (quantityShares: number | null) => void;
  onAveragePrice?: (averagePrice: number | null) => void;
  inset?: boolean;
}) {
  const { t } = useTranslation();
  const record =
    useContextStore((state) =>
      state.providerInstruments.find((candidate) => candidate.symbol === entry.ticker),
    ) ?? null;

  return (
    <article aria-label={entry.ticker} className={inset ? 'card-inset p-3' : 'card card-pad'}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight tabular-nums">{entry.ticker}</h3>
            <DataModeChip mode="provider" />
            <span className="chip chip-line">
              {entry.list === 'owned' ? t('portfolio.owned') : t('portfolio.watchlist')}
            </span>
          </div>
          {record?.name !== null && record?.name !== undefined ? (
            <p className="mt-1 text-sm text-muted">{record.name}</p>
          ) : null}
          {record?.exchange !== null && record?.exchange !== undefined ? (
            <p className="mt-0.5 text-xs text-mutedSoft">{record.exchange}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {onList ? (
            <select
              className="field px-2 py-1.5 text-xs"
              aria-label={t('portfolio.listLabel')}
              value={entry.list}
              onChange={(event) => onList(event.target.value === 'owned' ? 'owned' : 'watchlist')}
            >
              <option value="owned">{t('portfolio.owned')}</option>
              <option value="watchlist">{t('portfolio.watchlist')}</option>
            </select>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              className="btn btn-ghost px-2.5 py-1.5 text-xs"
              onClick={onRemove}
              aria-label={t('portfolio.removeAria', { ticker: entry.ticker })}
              title={t('portfolio.remove')}
            >
              <Icon name="trash" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-3 rounded-lg border border-dashed border-unknown/50 px-3 py-2 text-xs leading-relaxed text-muted">
        {t('portfolio.providerNote')}
      </p>

      {onQuantity && onAveragePrice ? (
        <details className="mt-2">
          <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-muted hover:text-ink">
            {t('portfolio.editDetails')}
            <Icon name="expand" className="h-3.5 w-3.5 text-mutedSoft" />
          </summary>
          <div className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
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
                onChange={(event) => onQuantity(parseShareQuantity(event.target.value))}
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
                onChange={(event) => onAveragePrice(parseAmount(event.target.value))}
              />
            </label>
          </div>
          <p className="note mt-2">
            {entry.quantityShares === null ? t('portfolio.trackedOnly') : t('card.optional')}
          </p>
        </details>
      ) : null}
    </article>
  );
}
