import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { StockHeadline } from '../components/StockHeadline';
import { INSTRUMENTS, instrumentNameText } from '../data/instruments';
import { useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';
import '../layout.css';

// Every stock in the prototype registry, one card each, filtered by a ticker or
// name search. Each card opens the same analysis page the Brief uses.
export function StocksScreen() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const selectedSessionDate = useContextStore((state) => state.selectedSessionDate);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return INSTRUMENTS;
    return INSTRUMENTS.filter(
      (instrument) =>
        instrument.ticker.toLowerCase().includes(needle) ||
        instrumentNameText(instrument.name, locale).toLowerCase().includes(needle),
    );
  }, [query, locale]);

  return (
    <section aria-labelledby="stocks-title" className="page-stack">
      <header className="page-hero">
        <h1 id="stocks-title">{t('stocks.title')}</h1>
        <label htmlFor="stocks-search" className="eyebrow mt-6 block">
          {t('stocks.search')}
        </label>
        <div className="relative mt-2">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mutedSoft" />
          <input
            id="stocks-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('stocks.searchPlaceholder')}
            className="field pl-9"
            autoComplete="off"
          />
        </div>
      </header>

      {matches.length === 0 ? (
        <p className="text-sm text-muted">{t('stocks.noMatch', { query: query.trim() })}</p>
      ) : (
        <ul className="grid gap-3">
          {matches.map((instrument) => (
            <li key={instrument.ticker} className="card px-5 py-4">
              <StockHeadline
                ticker={instrument.ticker}
                sessionDate={selectedSessionDate}
                onOpen={() => navigate(`/stock/${instrument.ticker}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
