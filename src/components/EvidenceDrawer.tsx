import { useEffect, useMemo, useRef } from 'react';
import type { EvidenceFocus, EvidenceRowView, EvidenceView } from '../engine/evidence';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { GROUP_LABEL_KEY, groupDotStyle } from './groupColours';
import { Icon } from './Icon';
import { restoreFocus } from './useDialogTrap';

interface EvidenceDrawerProps {
  view: EvidenceView;
  cutoffAt: string;
  trigger: HTMLElement | null;
  onClose: () => void;
  // The group or broker whose number was clicked. The proof narrows the fact's
  // rows to it, so every list below adds up to that number.
  focus?: EvidenceFocus;
  // Launcher that stays mounted when the dialog holding `trigger` is unmounted
  // to open this drawer, so closing still lands on a real control.
  fallbackTrigger?: HTMLElement | null;
}

const WHO_SHOWN = 5;

// Buy rows add, sell rows subtract: the side carries the sign.
function signed(row: EvidenceRowView): number {
  return row.side === 'buy' ? row.netLots : -row.netLots;
}

function sumBy<K>(rows: readonly EvidenceRowView[], key: (row: EvidenceRowView) => K): Map<K, number> {
  const out = new Map<K, number>();
  for (const row of rows) out.set(key(row), (out.get(key(row)) ?? 0) + signed(row));
  return out;
}

// The evidence for a number on the analysis page, laid out as a proof a reader
// can follow: the number, the days that add up to it, the brokers that make it
// up, and where the data comes from. The original rows stay one click away.
export function EvidenceDrawer({ view, cutoffAt, trigger, onClose, focus, fallbackTrigger = null }: EvidenceDrawerProps) {
  const { t, locale } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const panelFocusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
        ),
      );
      const coach = document.querySelector<HTMLElement>('[data-demo-coach]');
      const coachButtons = coach ? Array.from(coach.querySelectorAll<HTMLElement>('button')) : [];
      if (coachButtons.length > 0) {
        const focusable = [...panelFocusable, ...coachButtons];
        const index = focusable.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        const next = event.shiftKey
          ? index <= 0
            ? focusable[focusable.length - 1]
            : focusable[index - 1]
          : index === -1 || index === focusable.length - 1
            ? focusable[0]
            : focusable[index + 1];
        next?.focus();
        return;
      }
      if (panelFocusable.length === 0) return;
      const first = panelFocusable[0]!;
      const last = panelFocusable[panelFocusable.length - 1]!;
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
      restoreFocus(trigger, fallbackTrigger);
    };
  }, [onClose, trigger, fallbackTrigger]);

  const rows = useMemo(
    () =>
      view.rows.filter(
        (row) =>
          (focus?.brokerCode === undefined || row.brokerCode === focus.brokerCode) &&
          (focus?.group === undefined || row.group === focus.group),
      ),
    [view.rows, focus],
  );

  const days = useMemo(() => [...sumBy(rows, (row) => row.date)].sort((a, b) => a[0].localeCompare(b[0])), [rows]);
  const brokers = useMemo(
    () => [...sumBy(rows, (row) => row.brokerCode)].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || a[0].localeCompare(b[0])),
    [rows],
  );
  const groupOfBroker = useMemo(() => new Map(rows.map((row) => [row.brokerCode, row.group])), [rows]);
  const total = days.reduce((sum, [, lots]) => sum + lots, 0);

  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  const signedLots = (value: number) =>
    t('evidence.proof.lots', { value: `${value > 0 ? '+' : value < 0 ? '−' : ''}${intl.format(Math.abs(value))}` });
  const tone = (value: number) => (value > 0 ? 'text-buy' : value < 0 ? 'text-sell' : 'text-muted');

  const cutoffText = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(cutoffAt));

  const subject =
    focus?.brokerCode !== undefined
      ? t('evidence.proof.broker', { code: focus.brokerCode })
      : focus?.group !== undefined
        ? t(GROUP_LABEL_KEY[focus.group])
        : t('evidence.proof.groupAll');
  const subjectGroup = focus?.group ?? (focus?.brokerCode !== undefined ? groupOfBroker.get(focus.brokerCode) : undefined);

  const firstDay = days[0]?.[0];
  const lastDay = days[days.length - 1]?.[0];
  const daysText =
    firstDay === undefined || lastDay === undefined
      ? null
      : days.length === 1
        ? t('evidence.proof.daysOne', { date: formatSessionDate(firstDay, locale) })
        : t('evidence.proof.daysMany', {
            start: formatSessionDate(firstDay, locale),
            end: formatSessionDate(lastDay, locale),
            count: String(days.length),
          });

  const maxDay = Math.max(...days.map(([, lots]) => Math.abs(lots)), 1);
  const shownBrokers = brokers.slice(0, WHO_SHOWN);
  const restBrokers = brokers.slice(WHO_SHOWN);
  const restLots = restBrokers.reduce((sum, [, lots]) => sum + lots, 0);
  const maxBroker = Math.max(...shownBrokers.map(([, lots]) => Math.abs(lots)), Math.abs(restLots), 1);

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-navy/45" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${t('evidence.proof.title')} · ${subject}`}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] animate-sheet-in flex-col overflow-hidden rounded-t-2xl border-t border-line bg-surface shadow-lift md:inset-y-0 md:left-auto md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-l md:border-t-0"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight">{t('evidence.proof.title')}</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('evidence.close')} className="btn btn-quiet px-2.5">
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-4">
          {/* The number being proved. */}
          <section className="rounded-xl border border-line bg-surfaceAlt p-4" data-testid="proof-total">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-ink">
              {subjectGroup !== undefined ? <span aria-hidden="true" style={groupDotStyle(subjectGroup, 10)} /> : null}
              {subject}
              {focus?.brokerCode !== undefined && subjectGroup !== undefined ? (
                <span className="text-xs font-medium text-muted">{t(GROUP_LABEL_KEY[subjectGroup])}</span>
              ) : null}
            </p>
            {rows.length > 0 ? (
              <>
                <p className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${tone(total)}`}>{signedLots(total)}</p>
                {daysText !== null ? <p className="mt-1 text-xs text-muted">{daysText}</p> : null}
              </>
            ) : (
              <>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{view.approximate}</p>
                <p className="mt-1 text-xs text-muted">{t('evidence.proof.noRows')}</p>
              </>
            )}
          </section>

          {rows.length > 0 ? (
            <>
              {/* Step 1: the days add up to the number. */}
              <section aria-labelledby="proof-days">
                <h3 id="proof-days" className="eyebrow">
                  {t('evidence.proof.dayTitle')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">{t('evidence.proof.dayNote')}</p>
                <ul className="mt-2 space-y-1" data-testid="proof-days">
                  {days.map(([date, lots]) => (
                    <li key={date} className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 text-xs">
                      <span className="tabular-nums text-muted">{formatSessionDate(date, locale)}</span>
                      <Bar value={lots} max={maxDay} />
                      <span className={`text-right font-semibold tabular-nums ${tone(lots)}`}>{signedLots(lots)}</span>
                    </li>
                  ))}
                  <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 border-t border-lineStrong pt-1.5 text-sm">
                    <span className="font-semibold text-ink">{t('evidence.proof.total')}</span>
                    <span aria-hidden="true" className="text-center text-mutedSoft">
                      =
                    </span>
                    <span className={`text-right font-semibold tabular-nums ${tone(total)}`}>{signedLots(total)}</span>
                  </li>
                </ul>
              </section>

              {/* Step 2: the brokers behind it (skipped when it is one broker). */}
              {focus?.brokerCode === undefined && brokers.length > 1 ? (
                <section aria-labelledby="proof-who">
                  <h3 id="proof-who" className="eyebrow">
                    {t('evidence.proof.whoTitle')}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{t('evidence.proof.whoNote')}</p>
                  <ul className="mt-2 space-y-1.5" data-testid="proof-who">
                    {shownBrokers.map(([code, lots]) => (
                      <li key={code} className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 text-xs">
                        <span className="flex items-center gap-1.5 font-semibold text-ink">
                          <span aria-hidden="true" style={groupDotStyle(groupOfBroker.get(code) ?? 'unknown', 8)} />
                          {code}
                        </span>
                        <Bar value={lots} max={maxBroker} />
                        <span className={`text-right font-semibold tabular-nums ${tone(lots)}`}>{signedLots(lots)}</span>
                      </li>
                    ))}
                    {restBrokers.length > 0 ? (
                      <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.5rem] items-center gap-2 text-xs">
                        <span className="text-muted">{t('evidence.proof.more', { count: String(restBrokers.length) })}</span>
                        <Bar value={restLots} max={maxBroker} />
                        <span className={`text-right font-semibold tabular-nums ${tone(restLots)}`}>{signedLots(restLots)}</span>
                      </li>
                    ) : null}
                  </ul>
                </section>
              ) : null}
            </>
          ) : null}

          {/* Step 3: where the data comes from. */}
          <section aria-labelledby="proof-source">
            <h3 id="proof-source" className="eyebrow">
              {t('evidence.proof.sourceTitle')}
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink">
              <li>{t('evidence.proof.sourceLine')}</li>
              <li>{t('evidence.proof.cutoffLine', { cutoff: cutoffText })}</li>
              {view.exclusions.length > 0 ? (
                <li>
                  {t('evidence.proof.missingLine', {
                    dates: view.exclusions.map((entry) => formatSessionDate(entry.date, locale)).join(', '),
                  })}
                </li>
              ) : null}
              <li className="text-muted">{t('evidence.proof.unknownLine')}</li>
            </ul>
          </section>

          {rows.length > 0 ? (
            <details className="group rounded-lg border border-line">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-brandDeep">
                {t('evidence.proof.rawToggle')}
              </summary>
              <div className="max-h-72 overflow-y-auto border-t border-line">
                <table className="w-full text-left text-xs" data-testid="proof-rows">
                  <thead className="sticky top-0 bg-surfaceAlt">
                    <tr className="text-muted">
                      <th className="px-3 py-1 font-semibold">{t('evidence.proof.rawDate')}</th>
                      <th className="py-1 pr-3 font-semibold">{t('evidence.proof.rawBroker')}</th>
                      <th className="py-1 pr-3 font-semibold">{t('evidence.proof.rawSide')}</th>
                      <th className="px-3 py-1 text-right font-semibold">{t('evidence.proof.rawLots')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows]
                      .sort((a, b) => a.date.localeCompare(b.date) || a.side.localeCompare(b.side) || a.rank - b.rank)
                      .map((row) => (
                        <tr key={row.id} className="border-t border-line text-ink">
                          <td className="whitespace-nowrap px-3 py-1 tabular-nums">{formatSessionDate(row.date, locale)}</td>
                          <td className="py-1 pr-3 font-medium">{row.brokerCode}</td>
                          <td className={`py-1 pr-3 font-semibold ${row.side === 'buy' ? 'text-buy' : 'text-sell'}`}>
                            {row.side === 'buy' ? t('evidence.rows.buy') : t('evidence.rows.sell')}
                          </td>
                          <td className={`px-3 py-1 text-right tabular-nums ${tone(signed(row))}`}>
                            {signed(row) > 0 ? '+' : '−'}
                            {intl.format(row.netLots)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// A bar that grows right from the centre for buying and left for selling.
function Bar({ value, max }: { value: number; max: number }) {
  const width = `${Math.max((Math.abs(value) / max) * 50, value === 0 ? 0 : 1.5)}%`;
  return (
    <span aria-hidden="true" className="relative block h-2.5 rounded-full bg-line/60">
      <span className="absolute inset-y-0 left-1/2 w-px bg-lineStrong" />
      <span
        className={`absolute inset-y-0 rounded-full ${value >= 0 ? 'left-1/2 bg-buy' : 'right-1/2 bg-sell'}`}
        style={{ width }}
      />
    </span>
  );
}
