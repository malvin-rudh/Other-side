import { describe, expect, it } from 'vitest';
import { tickLabel, xTickLabels, yAxisTicks } from './axisTicks';

describe('tickLabel', () => {
  it('keeps zero and one-decimal thousands readable', () => {
    expect(tickLabel(0)).toBe('0');
    expect(tickLabel(8777)).toBe('8.8k');
    expect(tickLabel(7500)).toBe('7.5k');
    expect(tickLabel(17873)).toBe('17.9k');
    expect(tickLabel(140000)).toBe('140k');
    expect(tickLabel(-57539)).toBe('-57.5k');
  });
});

describe('yAxisTicks', () => {
  it('emits unique rounded labels across a 24 Aug proxy domain', () => {
    const ticks = yAxisTicks(7794, 8977);
    const labels = ticks.map(tickLabel);
    expect(labels.length).toBeGreaterThan(1);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) {
      expect(label).toMatch(/^-?\d+(\.\d)?k$/);
    }
    expect(ticks[0]).toBeGreaterThanOrEqual(7794);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(8977);
  });

  it('emits unique rounded labels across the full-window domain', () => {
    const ticks = yAxisTicks(-57539, 181305);
    const labels = ticks.map(tickLabel);
    expect(new Set(labels).size).toBe(labels.length);
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('handles degenerate ranges without dividing by zero', () => {
    expect(yAxisTicks(5, 5)).toEqual([5]);
    expect(yAxisTicks(10, 2)).toEqual([]);
    expect(yAxisTicks(Number.NaN, 10)).toEqual([]);
  });
});

describe('xTickLabels', () => {
  const month = ['14 Aug', '18 Aug', '19 Aug', '20 Aug', '21 Aug', '24 Aug'];

  it('always keeps the first session label and stays within the target count', () => {
    const ticks = xTickLabels(month);
    expect(ticks[0]).toBe('14 Aug');
    expect(ticks[ticks.length - 1]).toBe('24 Aug');
    expect(ticks.length).toBeLessThanOrEqual(5);
  });

  it('keeps every label when the series is short and returns the input for empties', () => {
    expect(xTickLabels(month, 10)).toEqual(month);
    expect(xTickLabels([], 4)).toEqual([]);
  });
});
