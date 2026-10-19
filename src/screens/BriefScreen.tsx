import { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { BriefPortfolioValue } from '../components/PortfolioAnalyticsCard';
import { StateBlock } from '../components/StateBlock';
import { StockHeadline } from '../components/StockHeadline';
import { WeekStrip } from '../components/WeekStrip';
import { usePublicData } from '../data/publicData';
import { briefMorningDates, resolveBrief } from '../engine/brief';
import { formatSessionDate, stockCountLabel, useTranslation } from '../i18n';
import { useContextStore, type PortfolioEntry } from '../store/contextStore';
import '../layout.css';

// The briefing calendar (mornings, holidays, gaps) is market level and shared by
// every dataset in this prototype, so it is anchored to the verified case instead
// of the last visited stock, which Brief no longer follows.
const CALENDAR_TICKER = 'SINI';

// The selected briefing morning. Its snapshot session is also the session the
// stock analysis page opens on, so the Brief and the analysis page stay in step.
function useBriefMorning() {
  const briefDate = useContextStore((state) => state.briefDate);
  const setBriefDate = useContextStore((state) => state.setBriefDate);
  const setViewSnapshot = useContextStore((state) => state.setViewSnapshot);
  const calendar = usePublicData(CALENDAR_TICKER);

  const mornings = useMemo(
    () => (calendar.status === 'ready' ? briefMorningDates(calendar.data.sessions) : []),
    [calendar],
  );

  const selectedMorning = useMemo(() => {
    if (mornings.length === 0) return null;
    return briefDate !== null && mornings.includes(briefDate)
      ? briefDate
      : mornings[mornings.length - 1]!;
  }, [mornings, briefDate]);

  useEffect(() => {
    if (selectedMorning !== null && selectedMorning !== briefDate) {
      setBriefDate(selectedMorning);
    }
  }, [selectedMorning, briefDate, setBriefDate]);

  const resolution = useMemo(
    () =>
      calendar.status === 'ready' && selectedMorning !== null
        ? resolveBrief(calendar.data.sessions, selectedMorning)
        : null,
    [calendar, selectedMorning],
  );

  useEffect(() => {
    setViewSnapshot('/', resolution?.snapshot ?? null);
  }, [resolution, setViewSnapshot]);

  return { calendar, mornings, selectedMorning, resolution, setBriefDate };
}

export function BriefScreen() {
  const { t, locale } = useTranslation();
  const portfolio = useContextStore((state) => state.portfolio);
  const { calendar, mornings, selectedMorning, resolution, setBriefDate } = useBriefMorning();

  const owned = portfolio.filter((entry) => entry.list === 'owned');
  const watchlist = portfolio.filter((entry) => entry.list === 'watchlist');

  if (calendar.status === 'error' || calendar.status === 'loading' || resolution === null) {
    return (
      <section aria-labelledby="brief-title" className="page-stack">
        <header className="page-hero">
          <p className="eyebrow">{t('brief.morningLabel')}</p>
          <h1 id="brief-title" className="sr-only">
            {t('brief.title')}
          </h1>
        </header>
        {calendar.status === 'error' ? (
          <StateBlock title={t('states.error')} body={calendar.message} />
        ) : (
          <StateBlock title={t('states.loading')} />
        )}
      </section>
    );
  }

  return (
    <section aria-labelledby="brief-title" className="page-stack">
      <header id="brief-header">
        <p className="eyebrow">{t('brief.morningLabel')}</p>
        <h1 id="brief-title" className="sr-only">
          {t('brief.title')}
        </h1>
      </header>

      {/* The portfolio value runs from the first purchase to the latest close and
          does not follow the calendar; the calendar below only changes what the
          holdings and watchlist say. */}
      {owned.length > 0 ? (
        <section aria-label={t('brief.valueTitle')} className="card page-summary-card -mt-4">
          <BriefPortfolioValue />
        </section>
      ) : null}

      <section aria-label={t('brief.calendarLabel')} className="page-hero">
        {selectedMorning !== null ? (
          <p className="text-sm font-semibold text-ink">
            {t('brief.briefingDate', { date: formatSessionDate(selectedMorning, locale) })}
          </p>
        ) : null}
        {resolution.snapshot === null ? <p className="page-date">{t('brief.noSnapshot')}</p> : null}
        {resolution.marketClosedToday ? (
          <p className="mt-3 rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-sm font-medium text-brandDeep">
            {t('brief.marketClosed')}
          </p>
        ) : null}
        {resolution.gaps.length > 0 && resolution.snapshot !== null ? (
          <p className="mt-3 rounded-lg border border-dashed border-unknown/50 px-3 py-2 text-xs leading-relaxed text-muted">
            {t('brief.gapNote', {
              gap: resolution.gaps.map((gap) => formatSessionDate(gap, locale)).join(', '),
              snapshot: formatSessionDate(resolution.snapshot, locale),
            })}
          </p>
        ) : null}
        <div className="mt-3">
          <WeekStrip dates={mornings} selected={selectedMorning} onSelect={setBriefDate} label={t('brief.calendarLabel')} />
        </div>
      </section>

      <section aria-labelledby="brief-owned" className="page-section">
        <div className="page-section-heading">
          <h2 id="brief-owned">{t('brief.yourPortfolio')}</h2>
          <span className="chip chip-line tabular-nums">
            {stockCountLabel(owned.length, locale)}
          </span>
        </div>

        {owned.length === 0 ? (
          <EmptyList body={t('brief.emptyPortfolio')} />
        ) : (
          <div className="card page-summary-card">
            <BriefList entries={owned} snapshot={resolution.snapshot} mode="holding" />
          </div>
        )}
      </section>

      <section aria-labelledby="brief-watchlist" className="page-section">
        <div className="page-section-heading">
          <h2 id="brief-watchlist">{t('brief.watchlist')}</h2>
          <span className="chip chip-line tabular-nums">
            {stockCountLabel(watchlist.length, locale)}
          </span>
        </div>

        {watchlist.length === 0 ? (
          <EmptyList body={t('brief.emptyWatchlist')} />
        ) : (
          <div className="card page-summary-card">
            <BriefList entries={watchlist} snapshot={resolution.snapshot} mode="flow" />
          </div>
        )}
      </section>
    </section>
  );
}

function EmptyList({ body }: { body: string }) {
  const { t } = useTranslation();
  return (
    <div className="card-inset flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3">
      <p className="min-w-0 text-sm text-muted">{body}</p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link to="/portfolio" className="btn btn-primary px-3 py-1.5 text-xs">
          <Icon name="plus" className="h-3.5 w-3.5" />
          {t('brief.addStock')}
        </Link>
        <Link to="/stocks" className="btn btn-quiet px-3 py-1.5 text-xs">
          {t('nav.stocks')}
        </Link>
      </div>
    </div>
  );
}

// One row per stock, opening the same analysis page as the Stocks screen, pinned
// to the session this briefing morning reads.
function BriefList({
  entries,
  snapshot,
  mode,
}: {
  entries: readonly PortfolioEntry[];
  snapshot: string | null;
  mode: 'flow' | 'holding';
}) {
  const navigate = useNavigate();
  const selectSession = useContextStore((state) => state.selectSession);

  return (
    <ul className="divide-y divide-line">
      {entries.map((entry) => (
        <li key={entry.ticker} className="!py-4">
          <StockHeadline
            ticker={entry.ticker}
            sessionDate={snapshot}
            mode={mode}
            onOpen={() => {
              if (snapshot !== null) selectSession(snapshot);
              navigate(`/stock/${entry.ticker}`);
            }}
          />
        </li>
      ))}
    </ul>
  );
}
