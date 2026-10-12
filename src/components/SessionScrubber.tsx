import { useEffect, useRef, useState } from 'react';
import { formatSessionDate, useTranslation } from '../i18n';
import { nextCapturedDate, previousCapturedDate, type SessionTimeline, type TimelineDay } from '../engine/timeline';
import { Icon } from './Icon';

const QUICK_STOPS = ['2026-08-24', '2026-09-03', '2026-09-23'] as const;

interface SessionScrubberProps {
  timeline: SessionTimeline;
  selectedDate: string;
  onSelect: (date: string) => void;
}

export function SessionScrubber({ timeline, selectedDate, onSelect }: SessionScrubberProps) {
  const { t, locale } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const [explainedDay, setExplainedDay] = useState<TimelineDay | null>(null);
  // The full day-by-day marker strip stays one disclosure away so the replay
  // toolbar reads as a toolbar, not as a second chart.
  const [allDates, setAllDates] = useState(false);
  const selectedRef = useRef(selectedDate);
  selectedRef.current = selectedDate;

  const capturedDates = timeline.capturedDates;
  const index = capturedDates.indexOf(selectedDate);
  const prevDate = previousCapturedDate(timeline, selectedDate);
  const nextDate = nextCapturedDate(timeline, selectedDate);

  useEffect(() => {
    setExplainedDay(null);
  }, [selectedDate]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      const current = selectedRef.current;
      const next = nextCapturedDate(timeline, current);
      if (next === null) {
        setPlaying(false);
      } else {
        onSelect(next);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [playing, timeline, onSelect]);

  const markerText = (day: TimelineDay): string => {
    const label = formatSessionDate(day.date, locale);
    if (day.kind === 'holiday') return t('scrubber.markerHolidayAria', { date: label });
    if (day.kind === 'excluded') return t('scrubber.markerGreyAria', { date: label, status: t('scrubber.markerExcluded'), reason: day.reason });
    if (day.kind === 'missing') return t('scrubber.markerGreyAria', { date: label, status: t('scrubber.markerMissing'), reason: day.reason });
    return t('scrubber.markerCapturedAria', { date: label });
  };

  return (
    <section aria-label={t('scrubber.label')} className="card px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{t('scrubber.title')}</h2>
        <button
          type="button"
          onClick={() => setAllDates((open) => !open)}
          aria-expanded={allDates}
          aria-controls="scrubber-all-dates"
          aria-label={allDates ? t('scrubber.hideAllDates') : t('scrubber.showAllDates')}
          title={allDates ? t('scrubber.hideAllDates') : t('scrubber.showAllDates')}
          className="btn btn-quiet shrink-0 px-2 py-1 text-xs"
        >
          <Icon name="calendar" className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {allDates ? t('scrubber.hideAllDates') : t('scrubber.showAllDates')}
          </span>
        </button>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">
        {t('scrubber.replayRule', { date: formatSessionDate(selectedDate, locale) })}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={() => prevDate && onSelect(prevDate)}
            disabled={prevDate === null}
            aria-label={t('scrubber.prev')}
            className="btn btn-quiet px-2.5"
          >
            <Icon name="prev" className="h-3.5 w-3.5" />
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(capturedDates.length - 1, 0)}
            value={index >= 0 ? index : 0}
            disabled={capturedDates.length === 0}
            onChange={(event) => {
              const next = capturedDates[Number(event.target.value)];
              if (next) onSelect(next);
            }}
            aria-label={t('scrubber.sliderAria')}
            aria-valuetext={index >= 0 ? formatSessionDate(selectedDate, locale) : undefined}
            className="min-w-0 flex-1 accent-brand"
          />
          <button
            type="button"
            onClick={() => nextDate && onSelect(nextDate)}
            disabled={nextDate === null}
            aria-label={t('scrubber.next')}
            className="btn btn-quiet px-2.5"
          >
            <Icon name="next" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            disabled={nextDate === null && !playing}
            aria-pressed={playing}
            aria-label={playing ? t('scrubber.stop') : t('scrubber.play')}
            className="btn btn-primary shrink-0"
          >
            <Icon name={playing ? 'pause' : 'play'} className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{playing ? t('scrubber.stop') : t('scrubber.play')}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-0.5">{t('scrubber.quickStops')}</span>
          {QUICK_STOPS.map((date) => (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-label={t('scrubber.quickStopAria', { date: formatSessionDate(date, locale) })}
              aria-current={date === selectedDate ? 'date' : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                date === selectedDate
                  ? 'border-brand bg-brand font-semibold text-navy'
                  : 'border-line bg-surface text-muted hover:border-brand/60 hover:text-brandDeep'
              }`}
            >
              {formatSessionDate(date, locale)}
            </button>
          ))}
        </div>
      </div>

      {/* Collapsed by default but always in the DOM: the marker labels carry the
          excluded, missing and holiday reasons the screen is audited against. */}
      <div id="scrubber-all-dates" hidden={!allDates} className={allDates ? 'mt-3 animate-panel-in' : undefined}>
          <div
            className="overflow-x-auto rounded-lg border border-line bg-surfaceAlt px-3 py-2"
            role="list"
            aria-label={t('scrubber.stripLabel')}
          >
            <div className="flex min-w-max items-end gap-[3px]">
              {timeline.days.map((day) => {
                const selected = day.date === selectedDate;
                if (day.kind === 'captured') {
                  return (
                    <button
                      key={day.date}
                      type="button"
                      role="listitem"
                      onClick={() => onSelect(day.date)}
                      title={markerText(day)}
                      aria-label={markerText(day)}
                      aria-current={selected ? 'date' : undefined}
                      className={`h-6 w-2.5 rounded-sm transition-colors ${
                        selected ? 'bg-brand' : 'bg-lineStrong hover:bg-mutedSoft'
                      }`}
                    />
                  );
                }
                if (day.kind === 'holiday') {
                  return (
                    <span
                      key={day.date}
                      role="listitem"
                      title={markerText(day)}
                      aria-label={markerText(day)}
                      className="flex h-6 w-2.5 flex-col items-center"
                    >
                      <span className="mt-auto h-2 w-2 rounded-full border border-lineStrong bg-surface" />
                      <span className="mt-0.5 whitespace-nowrap text-[8px] leading-none text-muted">
                        {t('scrubber.markerHolidayShort')}
                      </span>
                    </span>
                  );
                }
                return (
                  <button
                    key={day.date}
                    type="button"
                    role="listitem"
                    onClick={() => setExplainedDay(day)}
                    title={markerText(day)}
                    aria-label={markerText(day)}
                    className="h-6 w-2.5 rounded-sm bg-surface outline-dashed outline-1 outline-unknown/70 hover:bg-canvas"
                  />
                );
              })}
            </div>
          </div>

          {explainedDay ? (
            <p role="note" className="card-inset mt-3 px-3 py-2 text-xs leading-relaxed text-muted">
              <span className="font-semibold text-ink">{formatSessionDate(explainedDay.date, locale)}</span>{' '}
              <span className="font-semibold">
                ({explainedDay.kind === 'excluded' ? t('scrubber.markerExcluded') : t('scrubber.markerMissing')})
              </span>{' '}
              <span className="text-ink">{explainedDay.reason}.</span>{' '}
              {explainedDay.kind === 'excluded' ? t('scrubber.excludedExplain') : t('scrubber.missingExplain')}
            </p>
          ) : null}
      </div>
    </section>
  );
}
