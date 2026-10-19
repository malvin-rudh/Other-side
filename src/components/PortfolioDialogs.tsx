import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { currencyOf, currencySymbol, formatPrice } from '../data/money';
import type { Locale } from '../engine/context';
import { intlLocale, useTranslation } from '../i18n';
import type { PortfolioEntry } from '../store/contextStore';
import { useDialogTrap } from './useDialogTrap';

// The Portfolio overlays, shared with the analysis page: the buy overlay (lots,
// price per share, buy date) and a confirmation dialog.

// Indonesian shares trade in lots of 100.
export const LOT_SIZE = 100;

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// The buy overlay: lots, price per share and buy date. Opens empty for a new
// holding and pre-filled when editing one.
export function PurchaseDialog({
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
              <span className="eyebrow">{t('portfolio.priceLabel', { currency: currencySymbol(currencyOf(ticker)).trim() })}</span>
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
                  cost: formatPrice(lotsValue * LOT_SIZE * priceValue, currencyOf(ticker), locale),
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

export function ConfirmDialog({
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
