import type { Locale } from '../engine/context';
import { intlLocale } from '../i18n';
import { findInstrument } from './instruments';

// Prices and amounts in each instrument's own currency. Rupiah keeps the "Rp"
// prefix the app has always used; other markets use their usual symbols.
const SYMBOL: Record<string, string> = {
  IDR: 'Rp',
  HKD: 'HK$',
  KRW: '₩',
  CNY: '¥',
};

export function currencyOf(ticker: string): string {
  return findInstrument(ticker)?.currency ?? 'IDR';
}

export function currencySymbol(currency: string): string {
  return SYMBOL[currency] ?? `${currency} `;
}

// A price with the right symbol. Whole units for rupiah and won; two decimals
// at most for currencies that quote cents.
export function formatPrice(value: number, currency: string, locale: Locale): string {
  const digits = currency === 'IDR' || currency === 'KRW' ? 0 : 2;
  const number = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: digits }).format(Math.abs(value));
  return `${value < 0 ? '−' : ''}${currencySymbol(currency)}${number}`;
}

// A large amount in compact form (bn, tn and their local equivalents).
export function formatAmount(value: number, currency: string, locale: Locale, fractionDigits = 1): string {
  const number = new Intl.NumberFormat(intlLocale(locale), {
    notation: 'compact',
    maximumFractionDigits: fractionDigits,
  }).format(Math.abs(value));
  return `${value < 0 ? '−' : ''}${currencySymbol(currency)}${number}`;
}
