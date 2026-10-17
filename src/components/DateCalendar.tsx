import { useEffect, useMemo, useState } from 'react';
import type { Locale } from '../engine/context';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { Icon } from './Icon';

// A month calendar for picking one date from a fixed set (briefing mornings,
// captured sessions). Only those dates are selectable; the week button on the
// left of each row jumps to the latest selectable date in that week.

type Day = { iso: string; inMonth: boolean };

const DAY_MS = 86_400_000;

function isoOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function shiftMonth(key: string, delta: number): string {
  const [year, month] = key.split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

// Weeks start on Sunday. Always six rows so the panel never changes height.
function monthWeeks(key: string): Day[][] {
  const first = Date.parse(`${key}-01T00:00:00Z`);
  const start = first - new Date(first).getUTCDay() * DAY_MS;
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => {
      const iso = isoOf(start + (week * 7 + day) * DAY_MS);
      return { iso, inMonth: monthKey(iso) === key };
    }),
  );
}

function weekdayLabels(locale: Locale): string[] {
  const format = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'narrow', timeZone: 'UTC' });
  // 2026-09-06 is a Sunday.
  return Array.from({ length: 7 }, (_, day) => format.format(new Date(Date.UTC(2026, 8, 6 + day))));
}

function monthLabel(key: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${key}-01T00:00:00Z`),
  );
}

export function DateCalendar({
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
  const { t, locale } = useTranslation();
  const available = useMemo(() => new Set(dates), [dates]);
  const firstMonth = dates.length > 0 ? monthKey(dates[0]!) : null;
  const lastMonth = dates.length > 0 ? monthKey(dates[dates.length - 1]!) : null;
  const [month, setMonth] = useState<string | null>(selected !== null ? monthKey(selected) : lastMonth);

  // Follow the selection when it moves to another month (week jump, reset).
  useEffect(() => {
    if (selected !== null) setMonth(monthKey(selected));
  }, [selected]);

  if (month === null || firstMonth === null || lastMonth === null) return null;

  const weeks = monthWeeks(month);
  const labels = weekdayLabels(locale);
  const canPrev = month > firstMonth;
  const canNext = month < lastMonth;

  return (
    <div className="date-calendar" role="group" aria-label={label}>
      <div className="date-calendar-head">
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, -1))}
          disabled={!canPrev}
          aria-label={t('calendar.prev')}
          className="date-calendar-nav"
        >
          <Icon name="prev" className="h-3.5 w-3.5" />
        </button>
        <span className="date-calendar-month" aria-live="polite">
          {monthLabel(month, locale)}
        </span>
        <button
          type="button"
          onClick={() => setMonth(shiftMonth(month, 1))}
          disabled={!canNext}
          aria-label={t('calendar.next')}
          className="date-calendar-nav"
        >
          <Icon name="next" className="h-3.5 w-3.5" />
        </button>
      </div>
      <table className="date-calendar-grid">
        <thead>
          <tr>
            <th aria-hidden="true" className="date-calendar-weekcol" />
            {labels.map((label, index) => (
              <th key={index} scope="col">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => {
            const weekDates = week.filter((day) => available.has(day.iso));
            const latest = weekDates[weekDates.length - 1]?.iso ?? null;
            return (
              <tr key={week[0]!.iso}>
                <td className="date-calendar-weekcol">
                  <button
                    type="button"
                    disabled={latest === null}
                    onClick={() => latest !== null && onSelect(latest)}
                    aria-label={t('calendar.week', { date: formatSessionDate(week[0]!.iso, locale) })}
                    className="date-calendar-week"
                  >
                    »
                  </button>
                </td>
                {week.map((day) => {
                  const isAvailable = available.has(day.iso);
                  const isSelected = day.iso === selected;
                  return (
                    <td key={day.iso}>
                      <button
                        type="button"
                        disabled={!isAvailable}
                        aria-pressed={isSelected}
                        aria-label={formatSessionDate(day.iso, locale)}
                        onClick={() => onSelect(day.iso)}
                        className={`date-calendar-day${day.inMonth ? '' : ' is-outside'}`}
                      >
                        {Number(day.iso.slice(8))}
                      </button>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
