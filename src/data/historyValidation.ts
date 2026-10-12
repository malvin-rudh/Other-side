// Strict validation for provider price history, shared by the server adapter and
// the browser client so both boundaries reject the same malformed answers.
//
// Everything here fails closed. JavaScript date parsing silently normalizes
// impossible dates ("2026-02-31" becomes 3 March) and accepts loose timestamp
// strings, so a regex plus Date.parse is not enough: the calendar round-trip and
// the explicit ISO shape below are what make a supplied value usable. A null
// price stays unknown rather than becoming zero.

export const PRICE_BASES = ['provider-daily-unadjusted', 'sample-fixture-daily'] as const;

export type PriceBasisValue = (typeof PRICE_BASES)[number];

const CALENDAR_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real calendar date, not merely a date-shaped string. Setting the components
// and reading them back rejects 31 February and 30-day-month overflow, and
// avoids Date.UTC's two-digit year remapping.
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = CALENDAR_DATE_RE.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  probe.setUTCHours(0, 0, 0, 0);
  return (
    probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
  );
}

// An instant with an explicit ISO 8601 date, time and zone designator. Rejects
// "not-a-timestamp", bare dates and the loose forms Date.parse would accept.
const TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !TIMESTAMP_RE.test(value)) return false;
  if (!isCalendarDate(value.slice(0, 10))) return false;
  return Number.isFinite(Date.parse(value));
}

// A timezone the platform can actually resolve. Bars are dated in the exchange's
// own zone, so an unusable zone means the dates cannot be trusted.
export function isIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function isPriceBasis(value: unknown): value is PriceBasisValue {
  return typeof value === 'string' && (PRICE_BASES as readonly string[]).includes(value);
}

// Bars must be strictly increasing and unique by date, so a repeated or reversed
// session cannot be read as two observations.
export function isOrderedUniqueDates(dates: readonly string[]): boolean {
  for (let index = 1; index < dates.length; index += 1) {
    if (dates[index - 1]! >= dates[index]!) return false;
  }
  return true;
}

// A supplied OHLCV field is either absent, an explicit null, or a number that
// satisfies its own rule. Absent and null are unknown, which is a legitimate
// answer. A wrong type or an out-of-range number is malformed, and the whole
// answer is refused rather than repaired: turning a supplied "-5" or "12.5" into
// null would present a broken provider answer as a series with a missing close,
// which reads as an unknown session instead of as a fault.
export type SuppliedField = { ok: true; value: number | null } | { ok: false; reason: string };

// Names the supplied type, never its content, so a provider's own payload is not
// echoed back into a message that is rendered on screen.
function describeType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'number' ? 'a non-finite number' : `a ${typeof value}`;
}

export function suppliedPrice(value: unknown, where: string): SuppliedField {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, reason: `${where} was ${describeType(value)}, not a finite number` };
  }
  if (value <= 0) {
    return { ok: false, reason: `${where} was not a positive price` };
  }
  return { ok: true, value };
}

export function suppliedCount(value: unknown, where: string): SuppliedField {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, reason: `${where} was ${describeType(value)}, not a finite number` };
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    return { ok: false, reason: `${where} was not a non-negative integer count` };
  }
  return { ok: true, value };
}
