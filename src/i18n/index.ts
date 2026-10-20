import { useContextStore } from '../store/contextStore';
import type { ContentLocale, Locale } from '../engine/context';
import en from './en.json';
import zh from './zh-CN.json';

export type Messages = typeof en;
export type MessageKey = Paths<Messages>;

type Paths<T> = T extends string
  ? never
  : { [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}` }[keyof T & string];

const dictionaries: Record<Locale, Messages> = { en, 'zh-CN': zh };

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string>): string {
  const template = resolve(dictionaries[locale], key) ?? resolve(dictionaries.en, key) ?? key;
  return vars ? interpolate(template, vars) : template;
}

function resolve(messages: Messages, key: string): string | null {
  let node: unknown = messages;
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return null;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'string' ? node : null;
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) => vars[name] ?? match);
}

// "1 stock" / "3 stocks" for the list headers on the Brief and Portfolio screens.
export function stockCountLabel(count: number, locale: Locale): string {
  return count === 1
    ? translate(locale, 'portfolio.stockCount')
    : translate(locale, 'portfolio.stocksCount', { count: String(count) });
}

export function useTranslation() {
  const locale = useContextStore((state) => state.locale);
  return {
    locale,
    t: (key: MessageKey, vars?: Record<string, string>) => translate(locale, key, vars),
  };
}

// Accepts the stored-content languages too, so engine text formats its numbers.
export function intlLocale(locale: ContentLocale): string {
  return locale === 'id' ? 'id-ID' : locale === 'zh-CN' ? 'zh-CN' : 'en-GB';
}

export function formatSessionDate(isoDate: string, locale: Locale): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatShortDate(isoDate: string, locale: Locale): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}
