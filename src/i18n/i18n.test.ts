import { describe, expect, it } from 'vitest';
import { formatSessionDate, translate } from './index';
import en from './en.json';
import id from './id.json';

function collectKeys(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
    collectKeys(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('i18n dictionaries', () => {
  it('has identical key sets in English and Indonesian', () => {
    expect(collectKeys(id).sort()).toEqual(collectKeys(en).sort());
  });

  it('defines bilingual loading, empty, unavailable and error strings', () => {
    for (const locale of ['en', 'id'] as const) {
      expect(translate(locale, 'states.loading').length).toBeGreaterThan(0);
      expect(translate(locale, 'states.empty').length).toBeGreaterThan(0);
      expect(translate(locale, 'states.unavailable').length).toBeGreaterThan(0);
      expect(translate(locale, 'states.error').length).toBeGreaterThan(0);
    }
  });
});

describe('translate', () => {
  it('interpolates placeholders', () => {
    expect(translate('en', 'badge.dataThrough', { date: '23 Sep 2026' })).toBe(
      'data through 23 Sep 2026',
    );
    expect(translate('id', 'badge.dataThrough', { date: '23 Sep 2026' })).toBe(
      'data hingga 23 Sep 2026',
    );
  });

  it('renders EN and ID from the same key path', () => {
    expect(translate('en', 'nav.method')).toBe('Method');
    expect(translate('id', 'nav.method')).toBe('Metode');
  });
});

describe('formatSessionDate', () => {
  it('formats the ISO session date for each locale', () => {
    // Month abbreviation varies slightly across ICU versions ("Sep" vs "Sept").
    expect(formatSessionDate('2026-09-23', 'en')).toMatch(/^23 Sep/);
    expect(formatSessionDate('2026-09-23', 'id')).toMatch(/^23 Sep/);
    expect(formatSessionDate('2026-09-23', 'en')).toContain('2026');
  });
});
