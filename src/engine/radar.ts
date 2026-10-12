import type { Fact, FactKey } from './facts';

export type RadarCategory = 'activity' | 'coverage';

export type RadarStatus = 'observed' | 'not-observed' | 'not-enough-data' | 'unavailable';

export interface RadarItem {
  key: FactKey;
  claimId: string;
  category: RadarCategory;
  fact: Fact;
  status: RadarStatus;
}

// Every entry maps to a fact that already exists in the context document and to
// the approved claim that may describe it. Nothing here is computed twice.
const RADAR_SOURCES: readonly { key: FactKey; claimId: string; category: RadarCategory }[] = [
  { key: 'C25', claimId: 'CL-OBS-C25', category: 'activity' },
  { key: 'C12', claimId: 'CL-OBS-C12', category: 'activity' },
  { key: 'C13', claimId: 'CL-OBS-C13', category: 'activity' },
  { key: 'C16', claimId: 'CL-OBS-C16', category: 'activity' },
  { key: 'C17', claimId: 'CL-OBS-C17', category: 'activity' },
  { key: 'C03', claimId: 'CL-UNK-C03', category: 'coverage' },
];

export function radarStatus(fact: Fact): RadarStatus {
  // A withheld fact reports why through its typed code, so "the five sessions
  // are not all captured" reads as Not enough data rather than Not available.
  if (!fact.available) {
    return fact.unavailable_code === 'insufficient-captured-sessions' ? 'not-enough-data' : 'unavailable';
  }
  const value = fact.value;
  if (value?.kind === 'streak') {
    if (value.status === 'passes') return 'observed';
    return value.status === 'fails' ? 'not-observed' : 'not-enough-data';
  }
  if (value?.kind === 'reversal') return value.reversal.reversed ? 'observed' : 'not-observed';
  if (value?.kind === 'coverage') {
    return value.missingDates.length > 0 || value.excludedDates.length > 0 ? 'observed' : 'not-observed';
  }
  return 'observed';
}

export function buildRadarItems(facts: readonly Fact[]): RadarItem[] {
  const byKey = new Map(facts.map((fact) => [fact.key, fact]));
  const items: RadarItem[] = [];
  for (const source of RADAR_SOURCES) {
    const fact = byKey.get(source.key);
    // A fact the cutoff withholds is not eligible content, so the category falls
    // back to its honest empty state instead of naming something unavailable.
    if (!fact || !fact.available) continue;
    items.push({
      key: source.key,
      claimId: source.claimId,
      category: source.category,
      fact,
      status: radarStatus(fact),
    });
  }
  return items.sort((a, b) => b.fact.period.end.localeCompare(a.fact.period.end));
}
