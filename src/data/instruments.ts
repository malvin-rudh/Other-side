// The prototype's instrument registry. One source of truth for the name and
// metadata of every ticker the app can show, so a ticker never carries two
// different company names on two different screens.
//
// Three data modes are kept explicit and never blended:
//   verified  reviewed historical broker rows under public/data/<ticker>
//   sample    fictional fixture, labelled everywhere; SMPA to SMPE each ship
//             a generated broker dataset and prices, and none of them is a
//             listed company or a real capture
//   provider  a live quote from the server adapter, shown with its own
//             timestamp and never merged into the historical replay snapshot

import type { Locale } from '../engine/context';

export type DataMode = 'verified' | 'sample' | 'provider';

export interface Instrument {
  ticker: string;
  name: { en: string; id: string; zh: string };
  exchange: { en: string; id: string; zh: string };
  currency: string;
  dataMode: DataMode;
  // Only a verified instrument has reviewed rows, sessions and events to load.
  hasBrokerDataset: boolean;
  // Symbol the provider adapter would look up, when a lookup makes sense at all.
  providerSymbol: string | null;
  // Last session of the reviewed dataset, when one exists.
  verifiedThrough: string | null;
}

export const INSTRUMENTS: readonly Instrument[] = [
  {
    ticker: 'SINI',
    name: { en: 'PT Singaraja Putra', id: 'PT Singaraja Putra', zh: 'PT Singaraja Putra' },
    exchange: { en: 'Indonesia Stock Exchange', id: 'Bursa Efek Indonesia', zh: '印度尼西亚证券交易所' },
    currency: 'IDR',
    dataMode: 'verified',
    hasBrokerDataset: true,
    providerSymbol: 'SINI.JK',
    verifiedThrough: '2026-09-23',
  },
  {
    ticker: 'SMPA',
    name: { en: 'Sampel Prima Abadi (fictional)', id: 'Sampel Prima Abadi (fiktif)', zh: 'Sampel Prima Abadi（虚构）' },
    exchange: { en: 'Not listed (sample fixture)', id: 'Tidak tercatat (data sampel)', zh: '未上市（示例数据）' },
    currency: 'IDR',
    dataMode: 'sample',
    hasBrokerDataset: true,
    providerSymbol: null,
    verifiedThrough: '2026-09-23',
  },
  {
    ticker: 'SMPB',
    name: { en: 'Sampel Buana Lestari (fictional)', id: 'Sampel Buana Lestari (fiktif)', zh: 'Sampel Buana Lestari（虚构）' },
    exchange: { en: 'Not listed (sample fixture)', id: 'Tidak tercatat (data sampel)', zh: '未上市（示例数据）' },
    currency: 'IDR',
    dataMode: 'sample',
    hasBrokerDataset: true,
    providerSymbol: null,
    verifiedThrough: '2026-09-23',
  },
  {
    ticker: 'SMPC',
    name: { en: 'Sampel Cipta Mineral (fictional)', id: 'Sampel Cipta Mineral (fiktif)', zh: 'Sampel Cipta Mineral（虚构）' },
    exchange: { en: 'Not listed (sample fixture)', id: 'Tidak tercatat (data sampel)', zh: '未上市（示例数据）' },
    currency: 'IDR',
    dataMode: 'sample',
    hasBrokerDataset: true,
    providerSymbol: null,
    verifiedThrough: '2026-09-23',
  },
  {
    ticker: 'SMPD',
    name: { en: 'Sampel Dharma Konsumen (fictional)', id: 'Sampel Dharma Konsumen (fiktif)', zh: 'Sampel Dharma Konsumen（虚构）' },
    exchange: { en: 'Not listed (sample fixture)', id: 'Tidak tercatat (data sampel)', zh: '未上市（示例数据）' },
    currency: 'IDR',
    dataMode: 'sample',
    hasBrokerDataset: true,
    providerSymbol: null,
    verifiedThrough: '2026-09-23',
  },
  {
    ticker: 'SMPE',
    name: { en: 'Sampel Energi Nusantara (fictional)', id: 'Sampel Energi Nusantara (fiktif)', zh: 'Sampel Energi Nusantara（虚构）' },
    exchange: { en: 'Not listed (sample fixture)', id: 'Tidak tercatat (data sampel)', zh: '未上市（示例数据）' },
    currency: 'IDR',
    dataMode: 'sample',
    hasBrokerDataset: true,
    providerSymbol: null,
    verifiedThrough: '2026-09-23',
  },
];

const BY_TICKER = new Map(INSTRUMENTS.map((instrument) => [instrument.ticker, instrument]));

export function findInstrument(ticker: string): Instrument | null {
  return BY_TICKER.get(ticker.trim().toUpperCase()) ?? null;
}

export function instrumentName(ticker: string, locale: Locale, fallback: string): string {
  return findInstrument(ticker)?.name[locale === 'zh-CN' ? 'zh' : locale] ?? fallback;
}

export function instrumentNameText(name: Instrument['name'], locale: Locale): string {
  return name[locale === 'zh-CN' ? 'zh' : locale];
}

export function instrumentExchange(instrument: Instrument, locale: Locale): string {
  return instrument.exchange[locale === 'zh-CN' ? 'zh' : locale];
}

// The sample portfolio, also what a fresh visit starts with: two fictional
// holdings with deterministic prices.json fixtures, so the holdings and the
// analytics card work offline, plus SINI and SMPC on the watchlist. The verified
// SINI case stays on the watchlist because mixing a provider price with fixture
// prices is refused by the analytics engine.
export const SAMPLE_PORTFOLIO: readonly {
  ticker: string;
  list: 'owned' | 'watchlist';
  quantityShares: number | null;
  averagePrice: number | null;
  purchaseDate: string | null;
}[] = [
  { ticker: 'SMPA', list: 'owned', quantityShares: 1200, averagePrice: 5200, purchaseDate: '2026-08-14' },
  { ticker: 'SMPB', list: 'owned', quantityShares: 800, averagePrice: 2000, purchaseDate: '2026-08-14' },
  { ticker: 'SINI', list: 'watchlist', quantityShares: null, averagePrice: null, purchaseDate: null },
  { ticker: 'SMPC', list: 'watchlist', quantityShares: null, averagePrice: null, purchaseDate: null },
];
