import { useEffect, useMemo, useRef, useState } from 'react';
import type { BrokerGroup } from '../data/schemas';
import type { BrokerSeriesSummary } from '../engine/brokerSeries';
import { useTranslation } from '../i18n';
import { Icon } from './Icon';

interface BrokerPickerDialogProps {
  summaries: readonly BrokerSeriesSummary[];
  selected: readonly string[];
  maxLines: number;
  onToggle: (code: string) => void;
  onReset: () => void;
  onClose: () => void;
  trigger: HTMLButtonElement | null;
}

function groupKey(group: BrokerGroup): 'stock.groupApp' | 'stock.groupInstitution' | 'stock.groupOther' | 'stock.groupUnknown' {
  return group === 'app_facing'
    ? 'stock.groupApp'
    : group === 'institution_facing'
      ? 'stock.groupInstitution'
      : group === 'other_mixed'
        ? 'stock.groupOther'
        : 'stock.groupUnknown';
}

export function BrokerPickerDialog({
  summaries,
  selected,
  maxLines,
  onToggle,
  onReset,
  onClose,
  trigger,
}: BrokerPickerDialogProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    searchRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [onClose, trigger]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const ranked = [...summaries].sort(
      (a, b) => Math.abs(b.netLots) - Math.abs(a.netLots) || a.brokerCode.localeCompare(b.brokerCode),
    );
    if (needle === '') return ranked;
    return ranked.filter(
      (summary) =>
        summary.brokerCode.toLowerCase().includes(needle) ||
        t(groupKey(summary.group)).toLowerCase().includes(needle),
    );
  }, [summaries, query, t]);

  const atLimit = selected.length >= maxLines;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-navy/45" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('card.brokerDialogAria')}
        className="relative flex max-h-[85vh] w-full animate-sheet-in flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-lift md:max-w-lg md:rounded-2xl md:border"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight">{t('card.brokerDialogAria')}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('card.brokerClose')}
            className="btn btn-quiet px-2.5"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-5 pt-3">
          <p
            role="status"
            className="mb-3 rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-xs font-medium text-brandDeep"
          >
            {t('card.brokerLimit', { count: String(maxLines) })}{' '}
            <span className="tabular-nums">
              {t('card.brokerSelected', { selected: String(selected.length), count: String(maxLines) })}
            </span>
          </p>
          <div className="flex items-center justify-between gap-3">
            <label className="sr-only" htmlFor="broker-picker-search">
              {t('card.brokerSearchLabel')}
            </label>
            <input
              id="broker-picker-search"
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('card.brokerSearchPlaceholder')}
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink outline-none placeholder:text-mutedSoft focus:border-brand"
            />
            <button type="button" onClick={onReset} className="btn btn-quiet shrink-0 px-2.5 py-1.5 text-xs">
              {t('card.brokerReset')}
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{t('card.brokerNoMatch')}</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {rows.map((summary) => {
                const checked = selected.includes(summary.brokerCode);
                return (
                  <li key={summary.brokerCode}>
                    <label className="flex cursor-pointer items-center gap-2.5 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 shrink-0 accent-[#F58220]"
                        checked={checked}
                        disabled={!checked && atLimit}
                        onChange={() => onToggle(summary.brokerCode)}
                      />
                      <span className="font-semibold tabular-nums text-ink">{summary.brokerCode}</span>
                      <span className="min-w-0 truncate text-xs text-muted">{t(groupKey(summary.group))}</span>
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-mutedSoft">
                        {t('card.brokerObserved', {
                          observed: String(summary.observedSessions),
                          captured: String(summary.capturedSessions),
                        })}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

        </div>

        <footer className="border-t border-line px-4 py-3">
          <button type="button" onClick={onClose} className="btn btn-primary w-full justify-center">
            {t('card.brokerDone')}
          </button>
        </footer>
      </div>
    </div>
  );
}
