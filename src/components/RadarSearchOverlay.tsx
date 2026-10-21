import { useEffect, useMemo, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { instrumentNameText, type Instrument } from '../data/instruments';
import type { RadarLabel, RadarResult } from '../engine/radarScore';
import { useTranslation } from '../i18n';
import { radarCopy } from '../i18n/radarCopy';
import { CompanyLogo } from './CompanyLogo';
import { Icon } from './Icon';

const LABEL_CHIP: Record<RadarLabel, string> = {
  accumulating: 'chip chip-buy',
  leaving: 'chip chip-sell',
  mixed: 'chip chip-brand',
  noSignal: 'chip chip-unknown',
};

interface RadarSearchOverlayProps {
  open: boolean;
  onClose: () => void;
  // Every scored stock; the overlay filters it as the reader types.
  stocks: readonly { instrument: Instrument; result: RadarResult }[];
  // The input stays mounted (only faded out) so the trigger can focus it inside
  // the tap itself, which is what makes a phone open the keyboard.
  inputRef: RefObject<HTMLInputElement>;
}

// Phone-only search for the Live Radar: a field across the top of the screen
// over a dimmed page, with matches listed under it as the reader types.
export function RadarSearchOverlay({ open, onClose, stocks, inputRef }: RadarSearchOverlayProps) {
  const { locale } = useTranslation();
  const copy = radarCopy(locale);
  const [query, setQuery] = useState('');

  // Close on Esc, keep the page behind still, and start empty next time.
  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle === ''
        ? []
        : stocks.filter(
            ({ instrument }) =>
              instrument.ticker.toLowerCase().includes(needle) ||
              instrumentNameText(instrument.name, locale).toLowerCase().includes(needle),
          ),
    [stocks, needle, locale],
  );

  return (
    <div
      className={`fixed inset-0 z-50 transition-opacity duration-200 md:hidden ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      aria-hidden={!open}
      data-testid="radar-search-overlay"
    >
      <div className="absolute inset-0 bg-navy/70" aria-hidden="true" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={copy.searchOpen}
        className="relative bg-surface px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] shadow-lift"
      >
        <div className="flex items-center justify-end gap-2">
          {/* The field grows from the search button's corner to the full width. */}
          <div className={`relative transition-[width] duration-200 ease-out ${open ? 'w-full' : 'w-10'}`}>
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedSoft" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchLabel}
              tabIndex={open ? 0 : -1}
              autoComplete="off"
              // 16px keeps iOS from zooming the page when the field takes focus.
              className="field pl-9 text-base"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            tabIndex={open ? 0 : -1}
            className="shrink-0 px-1 text-sm font-semibold text-brandDeep"
          >
            {copy.searchCancel}
          </button>
        </div>

        {needle !== '' ? (
          matches.length === 0 ? (
            <p className="mt-3 px-1 text-sm text-muted" role="status">
              {copy.noMatch(query.trim())}
            </p>
          ) : (
            <ul className="mt-2 max-h-[50vh] divide-y divide-line overflow-y-auto overscroll-contain" data-testid="radar-search-results">
              {matches.map(({ instrument, result }) => {
                const name = instrumentNameText(instrument.name, locale);
                return (
                  <li key={instrument.ticker}>
                    <Link
                      to={`/stock/${instrument.ticker}`}
                      onClick={onClose}
                      tabIndex={open ? 0 : -1}
                      className="flex items-center gap-3 px-1 py-2.5 text-ink no-underline"
                    >
                      <CompanyLogo ticker={instrument.ticker} name={name} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{instrument.ticker}</span>
                          <span className={LABEL_CHIP[result.label]}>{copy.labels[result.label]}</span>
                        </span>
                        <span className="block truncate text-xs text-muted">{name}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {result.score}
                        <span className="text-xs font-medium text-muted">/100</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
