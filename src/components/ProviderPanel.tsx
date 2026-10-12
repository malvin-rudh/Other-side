import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchProviderQuote,
  fetchProviderSearch,
  fetchProviderStatus,
  isProviderStatus,
  type ProviderMatch,
  type ProviderQuote,
  type ProviderStatus,
} from '../data/providerClient';
import type { Locale } from '../engine/context';
import { intlLocale, useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';
import { Icon } from './Icon';

type StatusState =
  | { kind: 'idle' }
  | { kind: 'status'; status: ProviderStatus }
  | { kind: 'error'; code: string; message: string };

type QuoteState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'quote'; quote: ProviderQuote } | { kind: 'error'; code: string; message: string };

type SearchState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'matches'; matches: ProviderMatch[] } | { kind: 'error'; code: string };

function formatStamp(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

// Current market data lives in its own panel with its own timestamp. It is never
// merged into a historical broker snapshot, and the connection is only reported
// as verified after a lookup has actually succeeded. `bare` renders the panel
// without its own card chrome so a host can wrap it in a disclosure.
export function ProviderPanel({ defaultSymbol = '', bare = false }: { defaultSymbol?: string; bare?: boolean }) {
  const { t, locale } = useTranslation();
  const liveEndpoint = useContextStore((state) => state.liveEndpoint);
  const demoToken = useContextStore((state) => state.demoToken);
  const portfolio = useContextStore((state) => state.portfolio);
  const addProviderHolding = useContextStore((state) => state.addProviderHolding);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const [status, setStatus] = useState<StatusState>({ kind: 'idle' });
  const [quote, setQuote] = useState<QuoteState>({ kind: 'idle' });
  const [searchQuery, setSearchQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  // Stale answers are dropped per operation: status, quote and search each keep
  // their own request id, so one recheck can never invalidate a lookup or leave
  // its button loading forever.
  const statusId = useRef(0);
  const quoteId = useRef(0);
  const searchId = useRef(0);
  // Status has several writers, so a request id alone cannot order them: a
  // quote lookup that reports provider status is fresher knowledge than a
  // recheck started earlier. Every status write from a lookup moves this
  // authority on, and a recheck response is only applied when it still holds
  // the authority it was captured with.
  const statusAuthority = useRef(0);

  // Changing the endpoint or the token invalidates every in-flight response:
  // all three request ids move on, so an answer addressed to an older context
  // can never match again, and every control returns to a usable idle state.
  useEffect(() => {
    statusId.current += 1;
    quoteId.current += 1;
    searchId.current += 1;
    statusAuthority.current += 1;
    setStatus({ kind: 'idle' });
    setQuote({ kind: 'idle' });
    setSearch({ kind: 'idle' });
  }, [liveEndpoint, demoToken]);

  // No status fetch on mount: connected state is earned only by an explicit
  // check or a successful live lookup, so the panel starts honestly idle.
  const refreshStatus = useCallback(() => {
    const id = ++statusId.current;
    const authorityAtStart = statusAuthority.current;
    setStatus({ kind: 'idle' });
    void fetchProviderStatus(liveEndpoint).then((result) => {
      if (id !== statusId.current || authorityAtStart !== statusAuthority.current) return;
      if (isProviderStatus(result)) {
        setStatus({ kind: 'status', status: result });
        return;
      }
      setStatus(
        result.kind === 'no-endpoint'
          ? { kind: 'error', code: 'NO_ENDPOINT', message: 'no usable endpoint' }
          : { kind: 'error', code: result.code, message: result.message },
      );
    });
  }, [liveEndpoint]);

  const lookUp = () => {
    const trimmed = symbol.trim();
    if (trimmed === '') return;
    const id = ++quoteId.current;
    setQuote({ kind: 'loading' });
    void fetchProviderQuote(liveEndpoint, demoToken, trimmed).then((result) => {
      if (id !== quoteId.current) return;
      if (result.ok) {
        setQuote({ kind: 'quote', quote: result.quote });
        statusAuthority.current += 1;
        setStatus({ kind: 'status', status: result.status });
        return;
      }
      setQuote({ kind: 'error', code: result.failure.kind === 'no-endpoint' ? 'NO_ENDPOINT' : result.failure.code, message: result.failure.kind === 'no-endpoint' ? 'no usable endpoint' : result.failure.message });
      if (result.failure.kind === 'error' && result.failure.status !== null) {
        statusAuthority.current += 1;
        setStatus({ kind: 'status', status: result.failure.status });
      }
    });
  };

  const connected = status.kind === 'status' && status.status.connected;
  const disabled = status.kind === 'status' && !status.status.enabled;

  const runSearch = () => {
    const trimmed = searchQuery.trim();
    if (trimmed === '') return;
    const id = ++searchId.current;
    setSearch({ kind: 'loading' });
    void fetchProviderSearch(liveEndpoint, demoToken, trimmed).then((result) => {
      if (id !== searchId.current) return;
      setSearch(result.ok ? { kind: 'matches', matches: result.matches } : { kind: 'error', code: result.failure.kind === 'no-endpoint' ? 'NO_ENDPOINT' : result.failure.code });
    });
  };

  return (
    <section aria-labelledby="provider-title" className={bare ? '' : 'card card-pad'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="provider-title" className="text-base font-semibold tracking-tight">
            {t('provider.title')}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{t('provider.intro')}</p>
        </div>
        <span
          className={
            connected
              ? 'chip chip-buy'
              : disabled
                ? 'chip chip-line'
                : 'chip chip-unknown'
          }
        >
          <span aria-hidden="true">{connected ? '●' : '○'}</span>
          {connected
            ? t('provider.statusConnected')
            : disabled
              ? t('provider.statusDisabled')
              : t('provider.statusUnavailable')}
        </span>
      </div>

      <p className="note mt-3">
        {status.kind === 'status' && status.status.checkedAt !== null
          ? t('provider.checkedAt', { time: formatStamp(status.status.checkedAt, locale) })
          : t('provider.neverChecked')}
        {status.kind === 'error' ? ` ${t('provider.unreachable')}` : ''}
      </p>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1">
            <span className="eyebrow">{t('provider.symbol')}</span>
            <input
              className="field mt-1"
              value={symbol}
              placeholder={t('provider.symbolPlaceholder')}
              onChange={(event) => setSymbol(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') lookUp();
              }}
            />
          </label>
          <button type="button" className="btn btn-quiet" onClick={lookUp} disabled={symbol.trim() === '' || quote.kind === 'loading'}>
            <Icon name="search" className="h-3.5 w-3.5" />
            {quote.kind === 'loading' ? t('states.loading') : t('provider.lookup')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={refreshStatus}>
            {t('provider.status')}
          </button>
        </div>
        {demoToken === '' ? (
          <p className="note mt-2">{t('provider.tokenHint')}</p>
        ) : null}

        {quote.kind === 'quote' ? <QuoteTable quote={quote.quote} /> : null}
        {quote.kind === 'error' ? (
          <p className="mt-3 rounded-lg border border-dashed border-unknown/50 px-3 py-2 text-xs leading-relaxed text-muted">
            <span className="font-semibold text-ink">{quote.code}</span>
            {' · '}
            {quote.code === 'UNREACHABLE' || quote.code === 'UPSTREAM_TIMEOUT' || quote.code === 'NO_ENDPOINT'
              ? t('provider.unreachable')
              : t('provider.unavailable')}
          </p>
        ) : null}
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[12rem] flex-1">
            <span className="eyebrow">{t('provider.search')}</span>
            <input
              className="field mt-1"
              value={searchQuery}
              placeholder={t('provider.searchPlaceholder')}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') runSearch();
              }}
            />
          </label>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={runSearch}
            disabled={searchQuery.trim() === '' || search.kind === 'loading'}
          >
            <Icon name="search" className="h-3.5 w-3.5" />
            {search.kind === 'loading' ? t('states.loading') : t('provider.searchButton')}
          </button>
        </div>

        {search.kind === 'matches' ? (
          search.matches.length === 0 ? (
            <p className="note mt-2">{t('provider.noMatches')}</p>
          ) : (
            <div className="mt-3">
              <p className="note">{t('provider.matches')}</p>
              <ul className="mt-2 divide-y divide-line">
                {search.matches.map((match) => {
                  const tracked = portfolio.some((entry) => entry.ticker === match.symbol);
                  return (
                    <li key={match.symbol} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
                      <span className="min-w-0 text-sm">
                        <span className="font-semibold tabular-nums text-ink">{match.symbol}</span>
                        {match.name !== null ? <span className="ml-2 text-muted">{match.name}</span> : null}
                        {match.exchange !== null ? <span className="ml-2 text-xs text-mutedSoft">{match.exchange}</span> : null}
                      </span>
                      {tracked ? (
                        <span className="chip chip-line">
                          <Icon name="check" className="h-3.5 w-3.5" />
                          {t('portfolio.added')}
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            className="btn btn-primary px-2.5 py-1 text-xs"
                            onClick={() => addProviderHolding({ symbol: match.symbol, name: match.name, exchange: match.exchange }, 'owned')}
                          >
                            {t('provider.addOwned')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost px-2.5 py-1 text-xs"
                            onClick={() => addProviderHolding({ symbol: match.symbol, name: match.name, exchange: match.exchange }, 'watchlist')}
                          >
                            {t('provider.addWatchlist')}
                          </button>
                        </span>
                      )}
                      <button
                        type="button"
                        className="btn btn-ghost px-2.5 py-1 text-xs"
                        onClick={() => {
                          setSymbol(match.symbol);
                          setSearch({ kind: 'idle' });
                          setSearchQuery('');
                        }}
                      >
                        {t('provider.useSymbol')}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        ) : null}
        {search.kind === 'error' ? (
          <p className="note mt-2">
            <span className="font-semibold text-ink">{search.code}</span>
            {' · '}
            {search.code === 'UNREACHABLE' || search.code === 'UPSTREAM_TIMEOUT' || search.code === 'NO_ENDPOINT'
              ? t('provider.unreachable')
              : t('provider.unavailable')}
          </p>
        ) : null}
      </div>

      <div className="mt-4 space-y-1.5 border-t border-line pt-4">
        <p className="note">{t('provider.notPartOfReplay')}</p>
        <p className="note">{t('provider.roadmap')}</p>
        <p className="note">{t('provider.noEmail')}</p>
      </div>
    </section>
  );

  function QuoteTable({ quote: value }: { quote: ProviderQuote }) {
    const rows: { label: string; value: string }[] = [
      { label: t('provider.symbol'), value: value.symbol },
      {
        label: t('provider.price'),
        value:
          value.price === null
            ? t('provider.unavailable')
            : `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 2 }).format(value.price)}${
                value.currency !== null ? ` ${value.currency}` : ''
              }`,
      },
      { label: t('provider.currency'), value: value.currency ?? t('stocks.fieldUnavailable') },
      {
        label: t('provider.asOf'),
        value: value.asOf === null ? t('provider.delayUnknown') : formatStamp(value.asOf, locale),
      },
      { label: t('provider.delay'), value: value.delay ?? t('provider.delayUnknown') },
      { label: t('provider.source'), value: value.source },
    ];
    return (
      <dl className="mt-3 divide-y divide-line">
        {rows.map((row) => (
          <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-sm">
            <dt className="text-muted">{row.label}</dt>
            <dd className="tabular-nums font-medium text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    );
  }
}
