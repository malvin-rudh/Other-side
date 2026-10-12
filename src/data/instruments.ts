// The prototype's instrument registry. One source of truth for the name and
// metadata of every ticker the app can show, so a ticker never carries two
// different company names on two different screens.
//
// Three data modes are kept explicit and never blended:
//   verified  reviewed historical broker rows under public/data/<ticker>
//   sample    fictional fixture, labelled everywhere; SMPA and SMPB ship their
//             own synthetic datasets, SMPC has none, and none of them is a
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
    hasBrokerDataset: false,
    providerSymbol: null,
    verifiedThrough: null,
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

// The sample portfolio is an explicit, labelled action. It always contains the
// one verified case plus the fictional fixtures, so an evaluator can see all
// three data modes side by side without any real holding being invented.
export const SAMPLE_PORTFOLIO: readonly { ticker: string; list: 'owned' | 'watchlist' }[] = [
  { ticker: 'SINI', list: 'owned' },
  { ticker: 'SMPA', list: 'owned' },
  { ticker: 'SMPB', list: 'watchlist' },
  { ticker: 'SMPC', list: 'watchlist' },
];

// The sample analytics preset is the offline analytics path: every owned
// holding is a fictional fixture with a deterministic prices.json, so the
// analytics card works without a provider. The verified SINI case stays on the
// watchlist precisely because mixing a provider price with fixture prices is
// refused by the analytics engine.
export const SAMPLE_ANALYTICS_PORTFOLIO: readonly {
  ticker: string;
  list: 'owned' | 'watchlist';
  quantityShares: number | null;
}[] = [
  { ticker: 'SMPA', list: 'owned', quantityShares: 1200 },
  { ticker: 'SMPB', list: 'owned', quantityShares: 800 },
  { ticker: 'SINI', list: 'watchlist', quantityShares: null },
  { ticker: 'SMPC', list: 'watchlist', quantityShares: null },
];
