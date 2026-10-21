import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { RadarSweep } from "../components/RadarSweep";
import { Icon } from "../components/Icon";
import { RadarSearchOverlay } from "../components/RadarSearchOverlay";
import { findHealthReport } from "../data/companyHealth";
import {
  INSTRUMENTS,
  instrumentExchange,
  instrumentNameText,
  type Instrument,
} from "../data/instruments";
import { formatPrice } from "../data/money";
import { useSessionClose } from "../data/portfolioPrices";
import { loadPublicData, type PublicData } from "../data/publicData";
import {
  computeRadar,
  effectiveDate,
  type RadarLabel,
  type RadarResult,
} from "../engine/radarScore";
import { formatSessionDate, useTranslation } from "../i18n";
import { radarCopy } from "../i18n/radarCopy";
import { useContextStore } from "../store/contextStore";
import "../layout.css";

const RADAR_INSTRUMENTS = INSTRUMENTS.filter(
  (instrument) => instrument.hasBrokerDataset,
);
// The radar shows only the clear cases: Accumulating or Leaving with a score
// above this, at most this many (label order, then score). The cut-off is not
// shown to users; they only see the stocks that pass it.
const RADAR_MIN_SCORE = 75;
const RADAR_MAX_SHOWN = 6;
// Before anything is typed, the search box lists this many other stocks by score.
const SEARCH_SUGGESTED = 8;
const LABEL_ORDER: Record<RadarLabel, number> = {
  accumulating: 0,
  leaving: 1,
  mixed: 2,
  noSignal: 3,
};
const LABEL_CHIP: Record<RadarLabel, string> = {
  accumulating: "chip chip-buy",
  leaving: "chip chip-sell",
  mixed: "chip chip-brand",
  noSignal: "chip chip-unknown",
};

// Every instrument that ships a broker dataset is loaded once; failures leave a
// null entry so one broken dataset never blanks the radar.
function useRadarData(): {
  ready: boolean;
  datasets: ReadonlyMap<string, PublicData | null>;
} {
  const [datasets, setDatasets] = useState<ReadonlyMap<
    string,
    PublicData | null
  > | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      RADAR_INSTRUMENTS.map((instrument) =>
        loadPublicData(instrument.ticker)
          .then((data): [string, PublicData | null] => [
            instrument.ticker,
            data,
          ])
          .catch((): [string, PublicData | null] => [instrument.ticker, null]),
      ),
    ).then((entries) => {
      if (!cancelled) setDatasets(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { ready: datasets !== null, datasets: datasets ?? new Map() };
}

function CloseLine({
  ticker,
  date,
  label,
}: {
  ticker: string;
  date: string;
  label: string;
}) {
  const { locale } = useTranslation();
  const state = useSessionClose(ticker, date);
  const currency =
    INSTRUMENTS.find((i) => i.ticker === ticker)?.currency ?? "IDR";
  if (state.status !== "ready") return null;
  return (
    <p className="text-xs text-muted">
      {label} {formatPrice(state.close.close, currency, locale)}
    </p>
  );
}

function RadarCard({
  instrument,
  result,
  className = "",
}: {
  instrument: Instrument;
  result: RadarResult;
  className?: string;
}) {
  const { locale } = useTranslation();
  const copy = radarCopy(locale);
  const name = instrumentNameText(instrument.name, locale);
  return (
    <li data-testid={`radar-${instrument.ticker}`} className={className}>
      <Link
        to={`/stock/${instrument.ticker}`}
        aria-label={copy.cardLabel(
          instrument.ticker,
          name,
          copy.labels[result.label],
          result.score,
        )}
        className="card group flex items-stretch justify-between gap-4 px-5 py-4 text-ink no-underline transition-colors hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight">
              {instrument.ticker}
            </h2>
            <span className={LABEL_CHIP[result.label]}>
              {copy.labels[result.label]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-ink">{name}</p>
          <p className="text-xs text-muted">
            {instrumentExchange(instrument, locale)}
          </p>
          <CloseLine
            ticker={instrument.ticker}
            date={result.date}
            label={copy.closeLabel}
          />
        </div>
        <div
          className="flex shrink-0 flex-col items-end justify-between text-right"
          aria-hidden="true"
        >
          <div className="flex flex-col items-end">
            <svg
              viewBox="0 0 24 24"
              className="h-[33px] w-[33px] text-brand transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
            <span className="text-[11px] font-semibold text-brandDeep">
              {copy.view}
            </span>
          </div>
          <p className="mt-3 text-4xl font-semibold leading-none tracking-tight tabular-nums">
            {result.score}
            <span className="text-base font-medium text-muted">/100</span>
          </p>
        </div>
      </Link>
    </li>
  );
}

// The Live Radar: every instrument with a broker dataset is scored by the preset
// rule in engine/radarScore; the page shows the clearest few, and search reaches
// all of them. Rule-based, replay-safe, no advice.
export function StocksScreen() {
  const { locale } = useTranslation();
  const copy = radarCopy(locale);
  const navigate = useNavigate();
  const selectedSessionDate = useContextStore(
    (state) => state.selectedSessionDate,
  );
  const [query, setQuery] = useState("");
  const { ready, datasets } = useRadarData();
  // Phone-only search overlay and the swipe position of the picks.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const [pickIndex, setPickIndex] = useState(0);
  const openSearch = () => {
    // Focus inside the tap so the phone keyboard opens straight away.
    searchInputRef.current?.focus();
    setSearchOpen(true);
  };
  const closeSearch = useCallback(() => {
    searchInputRef.current?.blur();
    setSearchOpen(false);
    searchTriggerRef.current?.focus();
  }, []);

  const ranked = useMemo(() => {
    return RADAR_INSTRUMENTS.map((instrument) => ({
      instrument,
      result: computeRadar({
        ticker: instrument.ticker,
        data: datasets.get(instrument.ticker) ?? null,
        report: findHealthReport(instrument.ticker),
        sessionDate: selectedSessionDate,
      }),
    })).sort(
      (a, b) =>
        LABEL_ORDER[a.result.label] - LABEL_ORDER[b.result.label] ||
        b.result.score - a.result.score ||
        a.instrument.ticker.localeCompare(b.instrument.ticker),
    );
  }, [datasets, selectedSessionDate]);

  const featured = useMemo(
    () =>
      ranked
        .filter(
          ({ result }) =>
            (result.label === "accumulating" || result.label === "leaving") &&
            result.score > RADAR_MIN_SCORE,
        )
        .slice(0, RADAR_MAX_SHOWN),
    [ranked],
  );

  // The stocks not on the radar, highest score first.
  const suggested = useMemo(() => {
    const picked = new Set(featured.map(({ instrument }) => instrument.ticker));
    return ranked
      .filter(({ instrument }) => !picked.has(instrument.ticker))
      .sort(
        (a, b) =>
          b.result.score - a.result.score ||
          a.instrument.ticker.localeCompare(b.instrument.ticker),
      )
      .slice(0, SEARCH_SUGGESTED);
  }, [featured, ranked]);

  const searching = query.trim() !== "";
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") return [];
    return ranked.filter(
      ({ instrument }) =>
        instrument.ticker.toLowerCase().includes(needle) ||
        instrumentNameText(instrument.name, locale)
          .toLowerCase()
          .includes(needle),
    );
  }, [ranked, query, locale]);

  const sweepItems = useMemo(
    () =>
      featured.map(({ instrument, result }) => ({
        ticker: instrument.ticker,
        score: result.score,
        label: copy.labels[result.label],
        accumulating: result.label === "accumulating",
      })),
    [featured, copy],
  );

  const radarDate = useMemo(() => {
    if (selectedSessionDate !== null) return selectedSessionDate;
    const first = [...datasets.values()].find(
      (d): d is PublicData => d !== null,
    );
    return first === undefined ? null : effectiveDate(first, null);
  }, [datasets, selectedSessionDate]);

  return (
    <section aria-labelledby="stocks-title" className="page-stack">
      <header className="page-hero">
        <div className="flex items-start justify-between gap-3">
          <h1 id="stocks-title">{copy.title}</h1>
          <button
            ref={searchTriggerRef}
            type="button"
            onClick={openSearch}
            aria-label={copy.searchOpen}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink shadow-sm transition-colors hover:border-brand md:hidden"
            data-testid="radar-search-open"
          >
            <Icon name="search" className="h-4 w-4" />
            {copy.searchTitle}
          </button>
        </div>
        <p className="mt-2 text-sm text-muted">{copy.explainer}</p>
        {radarDate !== null ? (
          <p className="mt-2 text-sm font-semibold text-ink">
            {copy.forDate(formatSessionDate(radarDate, locale))}
          </p>
        ) : null}
      </header>

      {!ready ? (
        <p className="text-sm text-muted" role="status">
          {copy.loading}
        </p>
      ) : (
        <>
          {/* What the three labels mean, in one line each. */}
          <ul className="grid gap-2 sm:grid-cols-3" data-testid="radar-legend">
            {(['accumulating', 'mixed', 'leaving'] as const).map((label) => (
              <li key={label} className="card flex items-start gap-2.5 px-3 py-2.5">
                <span className={`${LABEL_CHIP[label]} shrink-0`}>{copy.labels[label]}</span>
                <span className="text-xs leading-snug text-muted">{copy.legend[label]}</span>
              </li>
            ))}
          </ul>

          {/* Section 1: the radar on the left, the stocks it picked up on the right. */}
          {/* On wide screens the row is as tall as the radar, and the list
              scrolls inside that height. On narrow screens it scrolls inside a
              fixed height. */}
          <div className="grid items-start gap-5 lg:grid-cols-5 lg:items-stretch">
            <div className="lg:col-span-3">
              <RadarSweep
                items={sweepItems}
                ariaLabel={copy.sweepLabel}
                blipLabel={(item) =>
                  copy.blipLabel(item.ticker, item.label, item.score)
                }
                onOpen={(ticker) => navigate(`/stock/${ticker}`)}
              />
            </div>
            <div
              className="relative min-w-0 lg:col-span-2"
              data-testid="radar-picks"
            >
              <div className="flex flex-col lg:absolute lg:inset-0">
                <h2 className="eyebrow">{copy.pickedTitle}</h2>
                {featured.length === 0 ? (
                  <p className="mt-3 text-sm text-muted" role="status">
                    {copy.emptyRadar}
                  </p>
                ) : (
                  <>
                    {/* Phones: a sideways row with the next card peeking in.
                        From md up: the vertical list that scrolls in place. */}
                    <ul
                      className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:max-h-[480px] md:min-h-0 md:flex-1 md:snap-none md:content-start md:overflow-y-auto md:overflow-x-hidden md:overscroll-contain md:px-0 md:pb-1 md:pr-1 md:[scrollbar-width:auto] md:[&::-webkit-scrollbar]:block lg:max-h-none"
                      data-testid="radar-picks-list"
                      onScroll={(event) => {
                        const list = event.currentTarget;
                        const first = list.firstElementChild as HTMLElement | null;
                        if (first === null || list.scrollWidth <= list.clientWidth) return;
                        const step = first.offsetWidth + 12;
                        setPickIndex(Math.min(featured.length - 1, Math.round(list.scrollLeft / step)));
                      }}
                    >
                      {featured.map(({ instrument, result }) => (
                        <RadarCard
                          key={instrument.ticker}
                          instrument={instrument}
                          result={result}
                          className="w-[85%] shrink-0 snap-start [&>a]:h-full md:w-auto md:shrink md:[&>a]:h-auto"
                        />
                      ))}
                    </ul>
                    {featured.length > 1 ? (
                      <div className="mt-1 flex items-center justify-between md:hidden" data-testid="radar-picks-dots">
                        <span className="flex items-center gap-1.5" aria-label={copy.swipePosition(pickIndex + 1, featured.length)} role="img">
                          {featured.map(({ instrument }, index) => (
                            <span
                              key={instrument.ticker}
                              aria-hidden="true"
                              className={`h-1.5 rounded-full transition-all ${index === pickIndex ? "w-4 bg-brand" : "w-1.5 bg-lineStrong"}`}
                            />
                          ))}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-medium text-muted">
                          {copy.swipeHint}
                          <span aria-hidden="true">→</span>
                        </span>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Section 2: search reaches every stock, on the radar or not. */}
          {/* Tablet and desktop only: on phones search lives in the overlay. */}
          <div className="card hidden px-5 py-4 md:block" data-testid="radar-search">
            <label htmlFor="stocks-search" className="eyebrow block">
              {copy.searchTitle}
            </label>
            <div className="relative mt-3">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedSoft"
              />
              <input
                id="stocks-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.searchPlaceholder}
                aria-label={copy.searchLabel}
                className="field pl-9"
                autoComplete="off"
              />
            </div>
            {searching ? (
              <>
                <p className="mt-3 text-sm text-muted" role="status">
                  {copy.searchResults(matches.length)}
                </p>
                {matches.length === 0 ? (
                  <p className="mt-1 text-sm text-muted">
                    {copy.noMatch(query.trim())}
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-3 md:grid-cols-2">
                    {matches.map(({ instrument, result }) => (
                      <RadarCard
                        key={instrument.ticker}
                        instrument={instrument}
                        result={result}
                      />
                    ))}
                  </ul>
                )}
              </>
            ) : suggested.length > 0 ? (
              <ul
                className="mt-3 grid gap-3 md:grid-cols-2"
                data-testid="radar-suggested"
              >
                {suggested.map(({ instrument, result }) => (
                  <RadarCard
                    key={instrument.ticker}
                    instrument={instrument}
                    result={result}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        </>
      )}
      <RadarSearchOverlay open={searchOpen} onClose={closeSearch} stocks={ranked} inputRef={searchInputRef} />
    </section>
  );
}
