import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PublicData } from '../data/publicData';
import { findHealthReport } from '../data/companyHealth';
import { computeRadar, eventsPillar, healthPillar, ramp } from './radarScore';
import { INSTRUMENTS } from '../data/instruments';

function load(ticker: string): PublicData {
  const dir = resolve(__dirname, '../../public/data', ticker.toLowerCase());
  const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
  const rows = read(`${dir}/rows.json`);
  const sessions = read(`${dir}/sessions.json`);
  const events = read(`${dir}/events.json`);
  const brokers = read(resolve(__dirname, '../../public/data/brokers.json'));
  return {
    rows: rows.rows,
    sessions: sessions.sessions,
    defaultWindow: sessions.defaultWindow,
    brokers: brokers.brokers,
    events: events.events,
    versions: { data: '', taxonomy: '', claims: '' },
  };
}

describe('radar score', () => {
  it('scores SINI on 23 Sep from all three pillars', () => {
    const result = computeRadar({ ticker: 'SINI', data: load('SINI'), report: findHealthReport('SINI'), sessionDate: '2026-09-23' });
    expect(result.date).toBe('2026-09-23');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.missing).toEqual([]);
    expect(result.pillars.transactions.checks).toHaveLength(6);
    expect(result.pillars.health.checks).toHaveLength(6);
  });

  it('does not read a health report before its availableFrom date', () => {
    const report = findHealthReport('SINI')!;
    expect(healthPillar(report, '2026-08-19').score).toBeNull();
    expect(healthPillar(report, report.availableFrom).score).not.toBeNull();
  });

  it('ignores events published after the session date', () => {
    const data = load('SINI');
    const early = eventsPillar(data, '2026-05-24');
    expect(early.score).toBe(0);
  });

  it('handles a missing health pillar by rescaling the other weights', () => {
    const data = load('SINI');
    const withReport = computeRadar({ ticker: 'SINI', data, report: findHealthReport('SINI'), sessionDate: '2026-09-23' });
    const without = computeRadar({ ticker: 'SINI', data, report: null, sessionDate: '2026-09-23' });
    expect(without.missing).toContain('health');
    expect(without.pillars.health.score).toBeNull();
    const t = without.pillars.transactions.score!;
    const e = without.pillars.events.score!;
    expect(without.score).toBe(Math.round((t * 50 + e * 20) / 70));
    expect(withReport.missing).not.toContain('health');
  });

  it('returns no signal when there is no dataset', () => {
    const result = computeRadar({ ticker: 'XXXX', data: null, report: null, sessionDate: '2026-09-23' });
    expect(result.label).toBe('noSignal');
    expect(result.score).toBe(0);
    expect(result.reason.code).toBe('noData');
  });

  it('is replay safe: an earlier date gives a result using only earlier rows', () => {
    const data = load('SINI');
    const early = computeRadar({ ticker: 'SINI', data, report: findHealthReport('SINI'), sessionDate: '2026-08-18' });
    expect(early.date).toBe('2026-08-18');
    expect(early.pillars.health.score).toBeNull();
  });

  it('ramp gives linear partial credit in either direction and clamps', () => {
    expect(ramp(0.3, 0, 0.6)).toBeCloseTo(0.5);
    expect(ramp(2, 0, 0.6)).toBe(1);
    expect(ramp(-1, 0, 0.6)).toBe(0);
    expect(ramp(0.4, 0.6, 0.2)).toBeCloseTo(0.5);
    expect(ramp(Number.NaN, 0, 1)).toBe(0);
  });

  it('gives graded partial credit, not only pass or fail', () => {
    const result = computeRadar({ ticker: 'SMPA', data: load('SMPA'), report: findHealthReport('SMPA'), sessionDate: '2026-09-23' });
    const all = Object.values(result.pillars).flatMap((p) => p.checks);
    for (const c of all) {
      expect(c.points).toBeGreaterThanOrEqual(0);
      expect(c.points).toBeLessThanOrEqual(c.max);
    }
    expect(all.filter((c) => c.points > 0 && c.points < c.max).length).toBeGreaterThan(0);
  });

  it('scores realistically on 23 Sep 2026: nothing reaches 100, strong stocks sit in the 70s to low 90s', () => {
    const scores = INSTRUMENTS.filter((i) => i.hasBrokerDataset).map((i) => {
      const r = computeRadar({ ticker: i.ticker, data: load(i.ticker), report: findHealthReport(i.ticker), sessionDate: '2026-09-23' });
      return { ticker: i.ticker, label: r.label, score: r.score };
    });
    expect(scores.length).toBeGreaterThan(0);
    for (const s of scores) expect(s.score).toBeLessThan(100);
    expect(scores.filter((s) => s.label === 'accumulating' && s.score >= 70).length).toBeGreaterThan(0);
    expect(Math.max(...scores.map((s) => s.score))).toBeLessThanOrEqual(95);
  });

  it('is deterministic', () => {
    const run = () => computeRadar({ ticker: 'SINI', data: load('SINI'), report: findHealthReport('SINI'), sessionDate: '2026-09-23' });
    expect(run()).toEqual(run());
  });
});
