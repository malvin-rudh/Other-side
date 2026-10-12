import { describe, expect, it } from 'vitest';
import sessions from '../../public/data/sini/sessions.json';
import type { SessionSummary } from '../data/schemas';
import {
  buildSessionTimeline,
  nextCapturedDate,
  previousCapturedDate,
} from './timeline';

const sessionList = sessions.sessions as SessionSummary[];
const timeline = buildSessionTimeline(sessionList);

describe('buildSessionTimeline', () => {
  it('keeps every captured session in date order', () => {
    expect(timeline.capturedDates).toHaveLength(26);
    expect(timeline.capturedDates[0]).toBe('2026-08-14');
    expect(timeline.capturedDates[timeline.capturedDates.length - 1]).toBe('2026-09-23');
    expect(timeline.capturedDates[1]).toBe('2026-08-18');
  });

  it('shows the quarantined session as an excluded grey marker with its raw reason', () => {
    const day = timeline.days.find((entry) => entry.date === '2026-08-13');
    expect(day?.kind).toBe('excluded');
    expect(day?.reason).toBe('quarantined overlapping screenshots');
  });

  it('shows the uncaptured session as a missing grey marker', () => {
    const day = timeline.days.find((entry) => entry.date === '2026-09-08');
    expect(day?.kind).toBe('missing');
    expect(day?.reason).toBe('not captured');
  });

  it('labels both market holidays', () => {
    for (const date of ['2026-08-17', '2026-08-25']) {
      expect(timeline.days.find((entry) => entry.date === date)?.kind).toBe('holiday');
    }
  });

  it('omits weekends entirely', () => {
    expect(timeline.days.some((entry) => entry.date === '2026-08-15')).toBe(false);
    expect(timeline.days.some((entry) => entry.date === '2026-08-16')).toBe(false);
  });

  it('sorts days chronologically regardless of input order', () => {
    const shuffled = buildSessionTimeline([...sessionList].reverse());
    expect(shuffled.days.map((day) => day.date)).toEqual(
      timeline.days.map((day) => day.date),
    );
  });
});

describe('captured-session navigation', () => {
  it('steps across holidays and weekends only between captured sessions', () => {
    expect(previousCapturedDate(timeline, '2026-08-18')).toBe('2026-08-14');
    expect(nextCapturedDate(timeline, '2026-08-14')).toBe('2026-08-18');
    expect(previousCapturedDate(timeline, '2026-08-24')).toBe('2026-08-21');
    expect(nextCapturedDate(timeline, '2026-08-24')).toBe('2026-08-26');
  });

  it('returns null at the ends of the timeline', () => {
    expect(previousCapturedDate(timeline, '2026-08-14')).toBeNull();
    expect(nextCapturedDate(timeline, '2026-09-23')).toBeNull();
  });

  it('never lands on an excluded, missing or holiday date', () => {
    const grey = new Set(['2026-08-13', '2026-09-08', '2026-08-17', '2026-08-25']);
    for (const date of timeline.capturedDates) {
      expect(grey.has(previousCapturedDate(timeline, date) ?? '')).toBe(false);
      expect(grey.has(nextCapturedDate(timeline, date) ?? '')).toBe(false);
    }
  });
});
