import { describe, expect, it } from 'vitest';
import { parseSafeIntegerLabel } from './numberParser';

describe('parseSafeIntegerLabel', () => {
  it('parses integer strings and Indonesian-style suffix labels', () => {
    expect(parseSafeIntegerLabel('1600')).toBe(1600);
    expect(parseSafeIntegerLabel('1,6K')).toBe(1600);
    expect(parseSafeIntegerLabel('1,1B')).toBe(1_100_000_000);
    expect(parseSafeIntegerLabel('2.5M')).toBe(2_500_000);
  });

  it('normalizes binary floating-point artifacts near an integer', () => {
    expect(parseSafeIntegerLabel('32799999.999999996')).toBe(32_800_000);
    expect(parseSafeIntegerLabel('34200000000.000004')).toBe(34_200_000_000);
  });

  it('rejects genuinely fractional values and unsafe integers', () => {
    expect(() => parseSafeIntegerLabel('10.5')).toThrow(/not an integer/);
    expect(() => parseSafeIntegerLabel('9007199254740992')).toThrow(/not a safe integer/);
  });
});
