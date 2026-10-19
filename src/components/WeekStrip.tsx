import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { intlLocale, useTranslation } from '../i18n';
import { briefText } from '../i18n/briefCopy';
import { DateCalendar } from './DateCalendar';
import { Icon } from './Icon';
import { useDialogTrap } from './useDialogTrap';

// A one-row week (Monday to Sunday) for picking a briefing morning, with a
// button that opens the full month calendar in a popup.

const DAY_MS = 86_400_000;

function toMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function mondayOf(iso: string): number {
  const ms = toMs(iso);
  const dow = new Date(ms).getUTCDay();
  return ms - ((dow + 6) % 7) * DAY_MS;
}

export function WeekStrip({
  dates,
  selected,
  onSelect,
  label,
}: {
  dates: readonly string[];
  selected: string | null;
  onSelect: (date: string) => void;
  label: string;
}) {
  const { locale } = useTranslation();
  const available = useMemo(() => new Set(dates), [dates]);
  const anchor = selected ?? dates[dates.length - 1] ?? null;
  const [weekStart, setWeekStart] = useState<number | null>(anchor !== null ? mondayOf(anchor) : null);
  const [popupTrigger, setPopupTrigger] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const openRef = useRef<HTMLButtonElement>(null);

  // Follow the selection when it moves to another week.
  useEffect(() => {
    if (selected !== null) setWeekStart(mondayOf(selected));
  }, [selected]);

  const closePopup = useCallback(() => setOpen(false), []);

  if (weekStart === null || dates.length === 0) return null;

  const first = mondayOf(dates[0]!);
  const last = mondayOf(dates[dates.length - 1]!);
  const days = Array.from({ length: 7 }, (_, i) => isoOf(weekStart + i * DAY_MS));
  const intl = intlLocale(locale);
  const monthFmt = new Intl.DateTimeFormat(intl, { month: 'short', timeZone: 'UTC' });
  const yearFmt = new Intl.DateTimeFormat(intl, { year: 'numeric', timeZone: 'UTC' });
  const weekdayFmt = new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' });
  const startMonth = monthFmt.format(weekStart);
  const endMonth = monthFmt.format(weekStart + 6 * DAY_MS);
  const monthLabel = `${startMonth === endMonth ? startMonth : `${startMonth} – ${endMonth}`} ${yearFmt.format(weekStart + 6 * DAY_MS)}`;

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold tracking-tight text-ink">{monthLabel}</p>
        <button
          ref={openRef}
          type="button"
          className="btn btn-quiet px-3 py-1.5 text-xs"
          onClick={(event) => {
            setPopupTrigger(event.currentTarget);
            setOpen(true);
          }}
        >
          <Icon name="calendar" className="h-3.5 w-3.5" />
          {briefText(locale, 'openCalendar')}
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label={briefText(locale, 'prevWeek')}
          disabled={weekStart <= first}
          onClick={() => setWeekStart(weekStart - 7 * DAY_MS)}
          className="btn btn-quiet h-9 w-9 shrink-0 p-0 disabled:opacity-40"
        >
          <Icon name="prev" />
        </button>
        <ul className="grid min-w-0 flex-1 grid-cols-7 gap-1">
          {days.map((iso) => {
            const enabled = available.has(iso);
            const isSelected = iso === selected;
            const dayNumber = Number(iso.slice(8));
            return (
              <li key={iso} className="min-w-0">
                <button
                  type="button"
                  disabled={!enabled}
                  aria-pressed={isSelected}
                  aria-label={enabled ? iso : `${iso}: ${briefText(locale, 'noBrief')}`}
                  onClick={() => onSelect(iso)}
                  className={`flex w-full flex-col items-center rounded-lg border px-1 py-1.5 text-xs tabular-nums transition-colors ${
                    isSelected
                      ? 'border-brand bg-brand/15 font-semibold text-brandDeep'
                      : enabled
                        ? 'border-line bg-surface text-ink hover:border-brand/50'
                        : 'cursor-not-allowed border-transparent text-mutedSoft opacity-50'
                  }`}
                >
                  <span className="text-[11px] uppercase text-muted">{weekdayFmt.format(toMs(iso))}</span>
                  <span className="text-sm">{dayNumber}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          aria-label={briefText(locale, 'nextWeek')}
          disabled={weekStart >= last}
          onClick={() => setWeekStart(weekStart + 7 * DAY_MS)}
          className="btn btn-quiet h-9 w-9 shrink-0 p-0 disabled:opacity-40"
        >
          <Icon name="next" />
        </button>
      </div>
      {open ? (
        <CalendarPopup
          trigger={popupTrigger}
          onClose={closePopup}
          dates={dates}
          selected={selected}
          label={label}
          onPick={(date) => {
            onSelect(date);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CalendarPopup({
  trigger,
  onClose,
  dates,
  selected,
  label,
  onPick,
}: {
  trigger: HTMLElement | null;
  onClose: () => void;
  dates: readonly string[];
  selected: string | null;
  label: string;
  onPick: (date: string) => void;
}) {
  const { locale } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogTrap(panelRef, closeRef, onClose, trigger);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-navy/45 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="week-strip-calendar-title"
        className="w-full max-w-md animate-sheet-in rounded-2xl border border-line bg-surface p-5 shadow-lift"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 id="week-strip-calendar-title" className="text-base font-semibold tracking-tight">
            {briefText(locale, 'calendarTitle')}
          </h2>
          <button
            ref={closeRef}
            type="button"
            aria-label={briefText(locale, 'close')}
            onClick={onClose}
            className="btn btn-quiet h-8 w-8 p-0"
          >
            <Icon name="close" />
          </button>
        </div>
        <DateCalendar dates={dates} selected={selected} onSelect={onPick} label={label} />
      </div>
    </div>
  );
}
