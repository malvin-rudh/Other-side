import { describe, expect, it } from 'vitest';
import validation from '../../public/data/sini/validation.json';
import manifest from '../../public/data/manifest.json';
import sessions from '../../public/data/sini/sessions.json';
import { parseManifest } from '../engine/manifest';

describe('data build diagnostics', () => {
  it('records 13 Aug duplicate-rank and broker-day conflict diagnostics without accepting the day', () => {
    expect(validation.counts.duplicateRankRows).toBe(18);
    expect(validation.counts.conflictingBrokerDays).toBe(6);
    expect(validation.quarantined).toHaveLength(44);
    expect(validation.duplicateRanks.every((entry) => entry.key.startsWith('2026-08-13|'))).toBe(true);
    expect(validation.conflictingBrokerDays.every((entry) => entry.key.startsWith('2026-08-13|'))).toBe(true);
  });
});

describe('manifest build', () => {
  it('ships a schema-valid manifest whose versions match the built documents', () => {
    const parsed = parseManifest(manifest);
    expect(parsed).not.toBeNull();
    expect(parsed?.dataVersion).toBe(sessions.dataVersion);
    expect(parsed?.dataThrough).toBe('2026-09-23');
  });
});
