import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateEventsDocument,
  validatePricesDocument,
  validateRowsDocument,
  validateSessionManifest,
  type BrokerSide,
  type EventsDocument,
  type NormalizedBrokerRow,
  type PricesDocument,
  type RowSource,
  type RowsDocument,
  type SamplePriceBar,
  type SessionManifest,
  type SiniEvent,
} from '../src/data/schemas';

// Deterministic fictional fixtures for SMPA and SMPB. Every value is a pure
// arithmetic formula of the session index so the output never drifts between
// runs, and the raw CSVs are written first so row sources point at real
// in-repo files.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '2026-08-14';
const END = '2026-09-23';
const HOLIDAYS = new Set(['2026-08-17', '2026-08-25']);
const ROWS_PER_SIDE = 5;
const CSV_HEADER = 'date,ticker,side,rank,broker,lots,value_idr,avg_price,frequency,source_id';

interface BrokerSpec {
  code: string;
  lots: number;
  price: number;
  frequency: number;
}
interface DayPlan {
  date: string;
  buy: BrokerSpec[];
  sell: BrokerSpec[];
}
interface FixtureSpec {
  ticker: 'SMPA' | 'SMPB';
  dataVersion: string;
  eventsVersion: string;
  csvPath: string;
  missingDates: ReadonlySet<string>;
  dayPlans: DayPlan[];
  events: SiniEvent[];
  expected: { capturedSessions: number; rowsPerSide: number };
}

interface DiagnosticRef {
  sourceLine: number;
  date: string;
  side: string;
  rank: string;
  broker: string;
}
interface ValidationDocument {
  ticker: string;
  dataVersion: string;
  verified: boolean;
  issues: string[];
  counts: {
    raw: { total: number; bySide: Record<BrokerSide, number> };
    duplicateRankRows: number;
    conflictingBrokerDays: number;
    quarantined: { total: number; bySide: Record<BrokerSide, number> };
    rejected: { total: number };
    accepted: { total: number; bySide: Record<BrokerSide, number>; capturedSessions: number };
  };
  duplicateRanks: Array<{ key: string; first: DiagnosticRef; duplicate: DiagnosticRef }>;
  conflictingBrokerDays: Array<{ key: string; rows: DiagnosticRef[] }>;
  quarantined: DiagnosticRef[];
  rejected: Array<{ reason: string; row: DiagnosticRef }>;
}

function smpaDayPlans(capturedDates: string[]): DayPlan[] {
  return capturedDates.map((date, i) => {
    // Sessions 0-17: app-facing brokers accumulate while institution and other
    // brokers sell. From session 18 the pattern flips, so the transaction lens
    // has a genuine reversal to describe.
    const flip = i >= 18;
    const accumulateSide = ['XL', 'XC', 'YP', 'XA', 'CC'];
    const counterSide = ['AZ', 'AK', 'BK', 'ZP', 'TP'];
    const buyCodes = flip ? counterSide : accumulateSide;
    const sellCodes = flip ? accumulateSide : counterSide;
    const base = flip ? 90 + 6 * (i - 18) : 120 + 12 * i;
    const lotsDec = flip ? 8 : 14;
    const priceBase = 5000 + 25 * i;
    const priceStep = flip ? 3 : 14;
    const spec = (code: string, rank: number): BrokerSpec => ({
      code,
      lots: Math.max(1, base - lotsDec * (rank - 1)),
      price: priceBase + priceStep * (rank - 1),
      frequency: 7 - rank,
    });
    return {
      date,
      buy: buyCodes.map((code, idx) => spec(code, idx + 1)),
      sell: sellCodes.map((code, idx) => spec(code, idx + 1)),
    };
  });
}

function smpbDayPlans(capturedDates: string[]): DayPlan[] {
  return capturedDates.map((date, i) => {
    // Institution-facing brokers accumulate every session; one app-facing
    // broker alternates sides so its group flow oscillates. TP spikes once on
    // 2026-09-01, which the five-session checks must read as a real change.
    const odd = i % 2 === 1;
    const buyCodes = odd ? ['AK', 'TP', 'XL', 'BK', 'YU'] : ['AK', 'TP', 'BK', 'YU', 'AI'];
    const sellCodes = odd ? ['AI', 'DP', 'ZP', 'XA', 'CC'] : ['XL', 'DP', 'ZP', 'XA', 'CC'];
    const spike = date === '2026-09-01';
    const priceBase = 2000 + 8 * i;
    const instBase = 200 + 5 * i;
    const otherBase = 80 + 4 * i;
    const spec = (code: string, rank: number): BrokerSpec => {
      const isInstitution = code === 'AK' || code === 'TP';
      const base = isInstitution ? instBase : otherBase;
      const lotsDec = isInstitution ? 20 : 10;
      let lots = Math.max(1, base - lotsDec * (rank - 1));
      if (spike && code === 'TP') lots *= 6;
      return { code, lots, price: priceBase + 5 * (rank - 1), frequency: 7 - rank };
    };
    return {
      date,
      buy: buyCodes.map((code, idx) => spec(code, idx + 1)),
      sell: sellCodes.map((code, idx) => spec(code, idx + 1)),
    };
  });
}

function fixtureEvents(ticker: 'SMPA' | 'SMPB'): SiniEvent[] {
  const source = (ref: string) => ({
    name: 'Sample fixture (fictional, not a real announcement)',
    url: `sample://fixture/${ticker.toLowerCase()}/${ref}`,
  });
  const story: SiniEvent = {
    id: `E-${ticker}-FIXTURE-01`,
    layer: 'story',
    eventDate: ticker === 'SMPA' ? '2026-08-20' : '2026-08-28',
    publicationDate: ticker === 'SMPA' ? '2026-08-21' : '2026-08-29',
    availableAt: `${ticker === 'SMPA' ? '2026-08-21' : '2026-08-29'}T00:00:00+07:00`,
    source: source('event-01'),
    text: {
      en: 'Fictional sample event: the fictional issuer announced a mock expansion plan. This text exists only inside the sample fixture.',
      id: 'Peristiwa contoh fiksi: penerbit fiktif mengumumkan rencana ekspansi pura-pura. Teks ini hanya ada di dalam fixture contoh.',
      zh: '虚构样本事件：该虚构发行人宣布了一项模拟扩张计划。此文本仅存在于样本数据集中。',
    },
  };
  const health: SiniEvent = {
    id: `E-${ticker}-FIXTURE-02`,
    layer: 'health',
    reportingDate: ticker === 'SMPA' ? '2026-09-10' : '2026-09-14',
    publicationDate: ticker === 'SMPA' ? '2026-09-11' : '2026-09-15',
    availableAt: `${ticker === 'SMPA' ? '2026-09-11' : '2026-09-15'}T00:00:00+07:00`,
    source: source('event-02'),
    text: {
      en: 'Fictional sample report: the fictional issuer filed a mock quarterly result. This text exists only inside the sample fixture.',
      id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil kuartal pura-pura. Teks ini hanya ada di dalam fixture contoh.',
      zh: '虚构样本报告：该虚构发行人提交了模拟的季度业绩。此文本仅存在于样本数据集中。',
    },
  };
  return [story, health];
}

const FIXTURES: FixtureSpec[] = [
  {
    ticker: 'SMPA',
    dataVersion: 'sample-fixture-smpa-2026-08-14_2026-09-23-v1',
    eventsVersion: 'sample-fixture-smpa-events-v1',
    csvPath: 'data/raw/samples/smpa_broker_summary.csv',
    missingDates: new Set(),
    dayPlans: [],
    events: fixtureEvents('SMPA'),
    expected: { capturedSessions: 27, rowsPerSide: 135 },
  },
  {
    ticker: 'SMPB',
    dataVersion: 'sample-fixture-smpb-2026-08-14_2026-09-23-v1',
    eventsVersion: 'sample-fixture-smpb-events-v1',
    csvPath: 'data/raw/samples/smpb_broker_summary.csv',
    missingDates: new Set(['2026-09-08']),
    dayPlans: [],
    events: fixtureEvents('SMPB'),
    expected: { capturedSessions: 26, rowsPerSide: 130 },
  },
];

async function main() {
  const marketDates = [...dateRange(START, END)].filter((date) => !HOLIDAYS.has(date) && !isWeekend(date));
  for (const spec of FIXTURES) {
    const capturedDates = marketDates.filter((date) => !spec.missingDates.has(date));
    if (capturedDates.length !== spec.expected.capturedSessions) {
      throw new Error(`${spec.ticker}: expected ${spec.expected.capturedSessions} captured sessions, calendar gives ${capturedDates.length}`);
    }
    spec.dayPlans = spec.ticker === 'SMPA' ? smpaDayPlans(capturedDates) : smpbDayPlans(capturedDates);
    await buildFixture(spec, marketDates);
  }
  await buildBenchmark(marketDates);
}

// Fictional daily price fixtures for the sample instruments. Pure arithmetic of
// the session index, covering every market date in the window (a broker capture
// gap is not a market closure), so the sample analytics preset has complete
// closes to model.
function samplePriceBars(
  marketDates: readonly string[],
  closeAt: (index: number) => number,
  deltas: { open: number; high: number; low: number },
  volumeAt: (index: number) => number | null,
): SamplePriceBar[] {
  return marketDates.map((date, index) => {
    const close = closeAt(index);
    return {
      date,
      open: close - deltas.open,
      high: close + deltas.high,
      low: close - deltas.low,
      close,
      volume: volumeAt(index),
    };
  });
}

function pricesVersion(kind: 'prices' | 'benchmark', symbol: string): string {
  return `sample-${kind}-${symbol.toLowerCase()}-${START.replaceAll('-', '_')}_${END.replaceAll('-', '_')}-v1`;
}

function buildPricesDocument(
  symbol: string,
  version: string,
  sourceRef: string,
  bars: SamplePriceBar[],
): PricesDocument {
  return {
    symbol,
    version,
    currency: 'IDR',
    exchangeTimezone: 'Asia/Jakarta',
    exchangeName: 'Not listed (sample fixture)',
    source: sourceRef,
    priceBasis: 'sample-fixture-daily',
    bars,
  };
}

// The fictional sample benchmark. It is deliberately NOT named or labelled
// IHSG: it is a versioned fictional index that never mixes with real provider
// prices and never stands in for ^JKSE.
async function buildBenchmark(marketDates: readonly string[]) {
  const symbol = 'SMPLIDX';
  const bars = samplePriceBars(
    marketDates,
    (index) => 7150 + 9 * index + ((index * index) % 4) * 6,
    { open: 10, high: 14, low: 14 },
    () => null,
  );
  const document = buildPricesDocument(symbol, pricesVersion('benchmark', symbol), 'sample://fixture/smplidx/prices', bars);
  assertAjv(validatePricesDocument, document, `${symbol} prices.json`);
  await writeJson('public/data/smplidx/prices.json', document);
  console.log(`${symbol}: ${bars.length} fictional benchmark bars`);
}

async function buildFixture(spec: FixtureSpec, marketDates: readonly string[]) {
  const rawRecords = spec.dayPlans.flatMap(({ date, buy, sell }) => [
    ...buy.map((broker, idx) => toRawRecord(spec.ticker, date, 'buy', idx + 1, broker)),
    ...sell.map((broker, idx) => toRawRecord(spec.ticker, date, 'sell', idx + 1, broker)),
  ]);

  const csvText = [CSV_HEADER, ...rawRecords.map((record) => record.line)].join('\n') + '\n';
  await mkdir(path.dirname(path.join(ROOT, spec.csvPath)), { recursive: true });
  await writeFile(path.join(ROOT, spec.csvPath), csvText, 'utf8');

  const parsed = await readCsvBack(spec);
  const rows = parsed.map(toNormalizedRow(spec));
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.side.localeCompare(b.side) || a.rank - b.rank);

  const rowsDocument: RowsDocument = { ticker: spec.ticker, dataVersion: spec.dataVersion, rows };
  const sessionsDocument = buildSessions(spec, rows);
  const validationDocument = buildValidation(spec, rawRecords.length, rows, sessionsDocument);
  const eventsDocument: EventsDocument = { ticker: spec.ticker, version: spec.eventsVersion, events: spec.events };

  assertAjv(validateRowsDocument, rowsDocument, `${spec.ticker} rows.json`);
  assertAjv(validateSessionManifest, sessionsDocument, `${spec.ticker} sessions.json`);
  assertAjv(validateEventsDocument, eventsDocument, `${spec.ticker} events.json`);

  const base = `public/data/${spec.ticker.toLowerCase()}`;
  await writeJson(`${base}/rows.json`, rowsDocument);
  await writeJson(`${base}/sessions.json`, sessionsDocument);
  await writeJson(`${base}/events.json`, eventsDocument);
  await writeJson(`${base}/validation.json`, validationDocument);

  const bars =
    spec.ticker === 'SMPA'
      ? samplePriceBars(
          marketDates,
          (index) => 5200 + 18 * index + ((index * index) % 7) * 10,
          { open: 15, high: 25, low: 25 },
          (index) => 1_200_000 + 80_000 * index,
        )
      : samplePriceBars(
          marketDates,
          (index) => 2000 + 12 * index + ((index * index) % 5) * 8,
          { open: 8, high: 12, low: 12 },
          (index) => 900_000 + 60_000 * index,
        );
  const pricesDocument = buildPricesDocument(
    spec.ticker,
    pricesVersion('prices', spec.ticker),
    `sample://fixture/${spec.ticker.toLowerCase()}/prices`,
    bars,
  );
  assertAjv(validatePricesDocument, pricesDocument, `${spec.ticker} prices.json`);
  await writeJson(`${base}/prices.json`, pricesDocument);

  console.log(
    `${spec.ticker}: ${rows.length} rows, ${validationDocument.counts.accepted.capturedSessions} captured sessions, verified=${validationDocument.verified}`,
  );
  if (!validationDocument.verified) {
    console.error(JSON.stringify(validationDocument.issues, null, 2));
    process.exitCode = 1;
  }
}

interface RawRecord {
  line: string;
  date: string;
  ticker: string;
  side: BrokerSide;
  rank: number;
  broker: string;
  lots: number;
  valueIdr: number;
  price: number;
  frequency: number;
}

function toRawRecord(ticker: string, date: string, side: BrokerSide, rank: number, broker: BrokerSpec): RawRecord {
  const valueIdr = broker.lots * 100 * broker.price;
  if (!Number.isSafeInteger(valueIdr)) throw new Error(`unsafe value for ${ticker} ${date} ${side} ${broker.code}`);
  return {
    line: [
      date,
      ticker,
      side,
      String(rank),
      broker.code,
      String(broker.lots),
      String(valueIdr),
      String(broker.price),
      String(broker.frequency),
      `SMPSRC-${ticker}-${date.replaceAll('-', '')}-${side === 'buy' ? 'B' : 'S'}${String(rank).padStart(2, '0')}`,
    ].join(','),
    date,
    ticker,
    side,
    rank,
    broker: broker.code,
    lots: broker.lots,
    valueIdr,
    price: broker.price,
    frequency: broker.frequency,
  };
}

async function readCsvBack(spec: FixtureSpec): Promise<Array<Omit<RawRecord, 'line'> & { sourceLine: number }>> {
  const text = await readFile(path.join(ROOT, spec.csvPath), 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const [header, ...body] = lines;
  if (header !== CSV_HEADER) throw new Error(`${spec.csvPath}: unexpected header`);
  return body.map((line, index) => {
    const fields = line.split(',');
    if (fields.length !== 10) throw new Error(`${spec.csvPath}:${index + 2}: expected 10 fields`);
    const side = fields[2];
    if (side !== 'buy' && side !== 'sell') throw new Error(`${spec.csvPath}:${index + 2}: bad side`);
    const rank = Number(fields[3]);
    const lots = Number(fields[5]);
    const valueIdr = Number(fields[6]);
    const price = Number(fields[7]);
    const frequency = Number(fields[8]);
    for (const [name, value] of [
      ['rank', rank],
      ['lots', lots],
      ['value_idr', valueIdr],
      ['avg_price', price],
      ['frequency', frequency],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${spec.csvPath}:${index + 2}: ${name} is not a positive safe integer`);
    }
    return {
      sourceLine: index + 2,
      date: fields[0],
      ticker: fields[1],
      side,
      rank,
      broker: fields[4],
      lots,
      valueIdr,
      price,
      frequency,
    };
  });
}

function toNormalizedRow(spec: FixtureSpec) {
  return (raw: Awaited<ReturnType<typeof readCsvBack>>[number]): NormalizedBrokerRow => {
    const source: RowSource = {
      sourceFile: spec.csvPath,
      sourceLine: raw.sourceLine,
      rawDate: raw.date,
      rawTicker: raw.ticker,
      rawSide: raw.side,
      rawRank: String(raw.rank),
      rawBroker: raw.broker,
      rawLots: String(raw.lots),
      rawValueIdr: String(raw.valueIdr),
      rawAveragePrice: String(raw.price),
      rawFrequency: String(raw.frequency),
      rawSourceId: `SMPSRC-${spec.ticker}-${raw.date.replaceAll('-', '')}-${raw.side === 'buy' ? 'B' : 'S'}${String(raw.rank).padStart(2, '0')}`,
    };
    const row: NormalizedBrokerRow = {
      id: `${spec.ticker}-${raw.date.replaceAll('-', '')}-${raw.side === 'buy' ? 'B' : 'S'}${String(raw.rank).padStart(2, '0')}`,
      ticker: spec.ticker,
      date: raw.date,
      side: raw.side,
      rank: raw.rank,
      brokerCode: raw.broker,
      netLots: raw.lots,
      netValueIdr: raw.valueIdr,
      source,
    };
    row.sourceAveragePrice = raw.price;
    row.frequency = raw.frequency;
    return row;
  };
}

function buildSessions(spec: FixtureSpec, rows: NormalizedBrokerRow[]): SessionManifest {
  const acceptedByDateSide = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.date}|${row.side}`;
    acceptedByDateSide.set(key, (acceptedByDateSide.get(key) ?? 0) + 1);
  }
  const acceptedDates = new Set(rows.map((row) => row.date));
  const sessions: SessionManifest['sessions'] = [];
  for (const current of dateRange(START, END)) {
    const rowCounts = {
      buy: acceptedByDateSide.get(`${current}|buy`) ?? 0,
      sell: acceptedByDateSide.get(`${current}|sell`) ?? 0,
    };
    if (HOLIDAYS.has(current)) {
      sessions.push({ date: current, ticker: spec.ticker, status: 'holiday', reason: 'market holiday', rowCounts });
    } else if (isWeekend(current)) {
      sessions.push({ date: current, ticker: spec.ticker, status: 'weekend', reason: 'weekend', rowCounts });
    } else if (spec.missingDates.has(current)) {
      sessions.push({ date: current, ticker: spec.ticker, status: 'missing', reason: 'not captured', rowCounts });
    } else if (acceptedDates.has(current)) {
      sessions.push({ date: current, ticker: spec.ticker, status: 'captured', reason: 'captured sample rows (fictional fixture)', rowCounts });
    } else {
      sessions.push({ date: current, ticker: spec.ticker, status: 'missing', reason: 'not present in sample capture', rowCounts });
    }
  }
  return {
    ticker: spec.ticker,
    dataVersion: spec.dataVersion,
    defaultWindow: { start: START, end: END },
    sessions,
  };
}

function buildValidation(
  spec: FixtureSpec,
  rawTotal: number,
  rows: NormalizedBrokerRow[],
  sessionsDocument: SessionManifest,
): ValidationDocument {
  const issues: string[] = [];
  const bySide = countSides(rows);
  const capturedSessions = sessionsDocument.sessions.filter((session) => session.status === 'captured').length;
  if (bySide.buy !== spec.expected.rowsPerSide || bySide.sell !== spec.expected.rowsPerSide) {
    issues.push(`accepted side counts expected ${spec.expected.rowsPerSide}/${spec.expected.rowsPerSide}, got ${bySide.buy}/${bySide.sell}`);
  }
  if (capturedSessions !== spec.expected.capturedSessions) {
    issues.push(`captured sessions expected ${spec.expected.capturedSessions}, got ${capturedSessions}`);
  }
  if (rawTotal !== rows.length) issues.push(`raw total ${rawTotal} differs from accepted total ${rows.length}`);

  const byDateSide = new Map<string, NormalizedBrokerRow[]>();
  for (const row of rows) {
    const key = `${row.date}|${row.side}`;
    byDateSide.set(key, [...(byDateSide.get(key) ?? []), row]);
  }
  for (const [key, dayRows] of byDateSide) {
    const ranks = new Set(dayRows.map((row) => row.rank));
    if (dayRows.length > 9) issues.push(`${key} has more than 9 accepted rows`);
    if (ranks.size !== dayRows.length) issues.push(`${key} has duplicate accepted ranks`);
  }

  const brokerDaySides = new Map<string, Set<BrokerSide>>();
  for (const row of rows) {
    const key = `${row.date}|${row.brokerCode}`;
    const sides = brokerDaySides.get(key) ?? new Set<BrokerSide>();
    sides.add(row.side);
    brokerDaySides.set(key, sides);
  }
  for (const [key, sides] of brokerDaySides) {
    if (sides.size > 1) issues.push(`accepted broker-day appears on both sides: ${key}`);
  }

  return {
    ticker: spec.ticker,
    dataVersion: spec.dataVersion,
    verified: issues.length === 0,
    issues,
    counts: {
      raw: { total: rawTotal, bySide: countSides(rows) },
      duplicateRankRows: 0,
      conflictingBrokerDays: 0,
      quarantined: { total: 0, bySide: { buy: 0, sell: 0 } },
      rejected: { total: 0 },
      accepted: { total: rows.length, bySide, capturedSessions },
    },
    duplicateRanks: [],
    conflictingBrokerDays: [],
    quarantined: [],
    rejected: [],
  };
}

function countSides(rows: NormalizedBrokerRow[]): Record<BrokerSide, number> {
  return rows.reduce<Record<BrokerSide, number>>(
    (counts, row) => {
      counts[row.side] += 1;
      return counts;
    },
    { buy: 0, sell: 0 },
  );
}

function* dateRange(start: string, end: string) {
  let current = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  while (current <= last) {
    yield new Date(current).toISOString().slice(0, 10);
    current += 86_400_000;
  }
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

function assertAjv<T>(validate: (data: unknown) => data is T, data: T, label: string) {
  if (!validate(data)) {
    const errors = 'errors' in validate ? JSON.stringify(validate.errors, null, 2) : 'unknown errors';
    throw new Error(`${label} failed schema validation: ${errors}`);
  }
}

async function writeJson(relativePath: string, data: unknown) {
  const output = path.join(ROOT, relativePath);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

await main();
