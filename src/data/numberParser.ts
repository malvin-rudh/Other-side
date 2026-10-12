const MULTIPLIERS: Record<string, number> = {
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
};

export function parseSafeIntegerLabel(input: string, fieldName = 'value'): number {
  const raw = input.trim();
  if (!raw) throw new Error(`${fieldName} is empty`);

  const suffixMatch = raw.match(/^([+-]?[\d.,]+)\s*([kKmMbB])$/);
  if (suffixMatch) {
    const numberPart = suffixMatch[1] ?? '';
    const suffix = (suffixMatch[2] ?? '').toUpperCase();
    const multiplier = MULTIPLIERS[suffix];
    if (multiplier === undefined) throw new Error(`${fieldName} has unsupported suffix: ${input}`);
    const normalized = normalizeDecimalLabel(numberPart);
    const value = Number(normalized) * multiplier;
    return assertSafeInteger(value, fieldName, input);
  }

  if (/^[+-]?\d+$/.test(raw)) {
    return assertSafeInteger(Number(raw), fieldName, input);
  }

  if (/^[+-]?\d{1,3}(,\d{3})+$/.test(raw)) {
    return assertSafeInteger(Number(raw.replaceAll(',', '')), fieldName, input);
  }

  if (/^[+-]?\d+(\.\d+)?$/.test(raw)) {
    return assertSafeInteger(Number(raw), fieldName, input);
  }

  throw new Error(`${fieldName} is not a supported integer label: ${input}`);
}

function normalizeDecimalLabel(value: string): string {
  if (value.includes(',') && value.includes('.')) {
    return value.replaceAll('.', '').replace(',', '.');
  }
  if (value.includes(',')) {
    return value.replace(',', '.');
  }
  return value;
}

function assertSafeInteger(value: number, fieldName: string, input: string): number {
  if (!Number.isFinite(value)) throw new Error(`${fieldName} is not finite: ${input}`);
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > 0.001) {
    throw new Error(`${fieldName} is not an integer: ${input}`);
  }
  if (!Number.isSafeInteger(rounded)) {
    throw new Error(`${fieldName} is not a safe integer: ${input}`);
  }
  return rounded;
}
