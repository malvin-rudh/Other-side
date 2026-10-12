import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateBrokersDocument,
  validateEventsDocument,
  validateRowsDocument,
  validateSessionManifest,
  type BrokerGroup,
  type BrokerProfile,
  type BrokersDocument,
  type BrokerSide,
  type EventsDocument,
  type NormalizedBrokerRow,
  type RowSource,
  type RowsDocument,
  type SessionManifest,
  type SiniEvent,
} from '../src/data/schemas';
import { parseManifest } from '../src/engine/manifest';
import { parseSafeIntegerLabel } from '../src/data/numberParser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW_BROKERS_CSV = 'data/raw/sini_broker_summary.csv';
const RAW_BROKERS_SEED = 'data/raw/brokers_seed.json';
const RAW_EVENTS = 'data/raw/sini_events.json';
const DATA_VERSION = 'sini-broker-summary-2026-08-14_2026-09-23-v1';
const BROKER_VERSION = 'brokers-team-mapping-v1';
const EVENTS_VERSION = 'sini-events-reviewed-v1';
const TICKER = 'SINI';
const DEFAULT_START = '2026-08-14';
const DEFAULT_END = '2026-09-23';
const SESSION_CALENDAR_END = '2026-09-24';
const QUARANTINED_DATE = '2026-08-13';
const HOLIDAYS = new Set(['2026-08-17', '2026-08-25']);
const MISSING = new Set(['2026-09-08']);
const APP_FACING = new Set(['XL', 'XC', 'YP']);
const INSTITUTION_FACING = new Set(['AK', 'BK', 'ZP', 'YU', 'AI', 'DP', 'TP']);
const MODERATE_PROFILE = new Set(['XL', 'XC', 'AK', 'BK', 'ZP']);

interface CsvRawRow {
  sourceLine: number;
  date: string;
  ticker: string;
  side: string;
  rank: string;
  broker: string;
  group?: string;
  lots: string;
  value_idr: string;
  avg_price?: string;
  frequency?: string;
  source_id?: string;
}

interface RawSeedBroker {
  code: string;
  name: string;
  identity_evidence: string;
  verify?: string;
}

interface RawEvent {
  id: string;
  date: string;
  layer: 'story' | 'health';
  title: string;
  source: string;
  url: string;
}

interface RawEventsDocument {
  ticker: string;
  events: RawEvent[];
}

interface DiagnosticRef {
  sourceLine: number;
  date: string;
  side: string;
  rank: string;
  broker: string;
}

interface RejectedRow {
  reason: string;
  row: DiagnosticRef;
  earlier?: DiagnosticRef;
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
  rejected: RejectedRow[];
}

const REVIEWED_EVENT_TEXT: Record<string, { en: string; id: string; zh: string }> = {
  'E-SINI-0525-RIGHTS-PLAN': {
    en: 'Rights issue planned to fund acquisition of PT Kemilau Mulia Sakti (Rp1.73T).',
    id: 'Rights issue direncanakan untuk mendanai akuisisi PT Kemilau Mulia Sakti (Rp1,73 triliun).',
    zh: '计划供股，为收购 PT Kemilau Mulia Sakti（约1.73万亿印尼盾）提供资金。',
  },
  'E-SINI-0707-SUSPENSION-LIFTED': {
    en: 'IDX lifted the suspension after pro-forma equity turned positive.',
    id: 'BEI mencabut suspensi setelah ekuitas pro-forma menjadi positif.',
    zh: '备考权益转正后，印尼证券交易所撤销了对该股的停牌。',
  },
  'E-SINI-0722-RIGHTS-DONE': {
    en: 'Rp3.6T rights issue completed at Rp5,000 per share.',
    id: 'Rights issue Rp3,6 triliun selesai pada Rp5.000 per saham.',
    zh: '3.6万亿印尼盾供股完成，发行价为每股5,000印尼盾。',
  },
  'E-SINI-0820-H1': {
    en: 'H1 2026 results: profit Rp683B, including Rp662.7B one-off bargain-purchase gain; operations about -Rp28B before tax.',
    id: 'Kinerja semester I 2026: laba Rp683 miliar, termasuk keuntungan bargain purchase sekali waktu Rp662,7 miliar; operasi sekitar -Rp28 miliar sebelum pajak.',
    zh: '2026年上半年业绩：利润6,830亿印尼盾，其中包含一次性议价收购收益6,627亿印尼盾；税前经营亏损约280亿印尼盾。',
  },
  'E-SINI-0821-EQUITY': {
    en: '31 Jul report: equity about +Rp3.52T (was -Rp687B); expected to leave the special monitoring board.',
    id: 'Laporan 31 Juli: ekuitas sekitar +Rp3,52 triliun (sebelumnya -Rp687 miliar); diperkirakan keluar dari papan pemantauan khusus.',
    zh: '7月31日报告：权益约+3.52万亿印尼盾（此前为-6,870亿印尼盾）；预计将脱离特别监控板。',
  },
  'E-SINI-0831-BOARD-EXIT': {
    en: 'SINI left the special monitoring board.',
    id: 'SINI keluar dari papan pemantauan khusus.',
    zh: 'SINI已脱离特别监控板。',
  },
  'E-SINI-0903-ATH': {
    en: 'SINI reached its first all-time high, Rp14,275 intraday; market value was about Rp16.3T at Rp13,625.',
    id: 'SINI mencapai all-time high pertama, Rp14.275 intraday; nilai pasar sekitar Rp16,3 triliun pada Rp13.625.',
    zh: 'SINI首次创历史新高，盘中触及14,275印尼盾；按13,625印尼盾计市值约16.3万亿印尼盾。',
  },
};

async function main() {
  const rawRows = await readBrokerRows();
  const { rowsDocument, sessionsDocument, validationDocument } = normalizeBrokerRows(rawRows);
  const brokersDocument = await buildBrokerProfiles(rawRows);
  const eventsDocument = await buildEvents();

  assertAjv(validateRowsDocument, rowsDocument, 'rows.json');
  assertAjv(validateSessionManifest, sessionsDocument, 'sessions.json');
  assertAjv(validateBrokersDocument, brokersDocument, 'brokers.json');
  assertAjv(validateEventsDocument, eventsDocument, 'events.json');

  await writeJson('public/data/sini/rows.json', rowsDocument);
  await writeJson('public/data/sini/sessions.json', sessionsDocument);
  await writeJson('public/data/sini/validation.json', validationDocument);
  await writeJson('public/data/brokers.json', brokersDocument);
  await writeJson('public/data/sini/events.json', eventsDocument);

  const manifest = parseManifest({
    dataVersion: DATA_VERSION,
    taxonomyVersion: BROKER_VERSION,
    claimVersion: EVENTS_VERSION,
    dataThrough: lastCapturedDate(sessionsDocument),
  });
  if (!manifest) throw new Error('manifest failed schema validation');
  await writeJson('public/data/manifest.json', manifest);

  if (!validationDocument.verified) {
    console.error(JSON.stringify(validationDocument.issues, null, 2));
    process.exitCode = 1;
  }
}

async function readBrokerRows(): Promise<CsvRawRow[]> {
  const text = await readFile(path.join(ROOT, RAW_BROKERS_CSV), 'utf8');
  const records = parseCsv(text);
  const [headers, ...body] = records;
  if (!headers) throw new Error('Broker CSV is empty');
  return body.map((values, index) => {
    const row: Record<string, string | undefined> = {};
    headers.forEach((header, i) => {
      row[header] = values[i];
    });
    return {
      sourceLine: index + 2,
      date: required(row.date, index + 2, 'date'),
      ticker: required(row.ticker, index + 2, 'ticker'),
      side: required(row.side, index + 2, 'side'),
      rank: required(row.rank, index + 2, 'rank'),
      broker: required(row.broker, index + 2, 'broker').toUpperCase(),
      group: row.group || undefined,
      lots: required(row.lots, index + 2, 'lots'),
      value_idr: required(row.value_idr, index + 2, 'value_idr'),
      avg_price: row.avg_price || undefined,
      frequency: row.frequency || undefined,
      source_id: row.source_id || undefined,
    };
  });
}

function normalizeBrokerRows(rawRows: CsvRawRow[]) {
  const rows: NormalizedBrokerRow[] = [];
  const quarantined: DiagnosticRef[] = [];
  const rejected: RejectedRow[] = [];
  const duplicateRanks = findDuplicateRanks(rawRows);
  const conflictingBrokerDays = findConflictingBrokerDays(rawRows);
  const rankKeys = new Map<string, DiagnosticRef>();
  const acceptedBrokerDaySide = new Map<string, { side: BrokerSide; row: DiagnosticRef }>();

  for (const raw of rawRows) {
    const ref = toDiagnosticRef(raw);
    if (raw.date === QUARANTINED_DATE) {
      quarantined.push(ref);
      continue;
    }

    const side = normalizeSide(raw.side);
    if (!side) {
      rejected.push({ reason: 'unsupported_side', row: ref });
      continue;
    }

    const rank = parseIntegerField(raw.rank, 'rank', ref, rejected);
    const netLots = parseIntegerField(raw.lots, 'lots', ref, rejected);
    const netValueIdr = parseIntegerField(raw.value_idr, 'value_idr', ref, rejected);
    if (rank === null || netLots === null || netValueIdr === null) continue;

    const rankKey = `${raw.date}|${side}|${rank}`;
    const earlierRank = rankKeys.get(rankKey);
    if (earlierRank) {
      rejected.push({ reason: 'duplicate_rank', row: ref, earlier: earlierRank });
      continue;
    }

    const brokerDayKey = `${raw.date}|${raw.broker}`;
    const earlierBrokerDay = acceptedBrokerDaySide.get(brokerDayKey);
    if (earlierBrokerDay && earlierBrokerDay.side !== side) {
      rejected.push({ reason: 'broker_day_on_both_sides', row: ref, earlier: earlierBrokerDay.row });
      continue;
    }

    const source: RowSource = {
      sourceFile: RAW_BROKERS_CSV,
      sourceLine: raw.sourceLine,
      rawDate: raw.date,
      rawTicker: raw.ticker,
      rawSide: raw.side,
      rawRank: raw.rank,
      rawBroker: raw.broker,
      rawLots: raw.lots,
      rawValueIdr: raw.value_idr,
    };
    if (raw.group) source.rawGroup = raw.group;
    if (raw.avg_price) source.rawAveragePrice = raw.avg_price;
    if (raw.frequency) source.rawFrequency = raw.frequency;
    if (raw.source_id) source.rawSourceId = raw.source_id;

    const row: NormalizedBrokerRow = {
      id: stableRowId(raw.ticker, raw.date, side, rank),
      ticker: raw.ticker,
      date: raw.date,
      side,
      rank,
      brokerCode: raw.broker,
      netLots,
      netValueIdr,
      source,
    };
    if (raw.avg_price) row.sourceAveragePrice = parseSafeIntegerLabel(raw.avg_price, 'avg_price');
    if (raw.frequency) row.frequency = parseSafeIntegerLabel(raw.frequency, 'frequency');

    rankKeys.set(rankKey, ref);
    acceptedBrokerDaySide.set(brokerDayKey, { side, row: ref });
    rows.push(row);
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.side.localeCompare(b.side) || a.rank - b.rank);
  const rowsDocument: RowsDocument = { ticker: TICKER, dataVersion: DATA_VERSION, rows };
  const sessionsDocument = buildSessions(rows);
  const validationDocument = buildValidation(rawRows, rows, sessionsDocument, duplicateRanks, conflictingBrokerDays, quarantined, rejected);

  return { rowsDocument, sessionsDocument, validationDocument };
}

function buildValidation(
  rawRows: CsvRawRow[],
  acceptedRows: NormalizedBrokerRow[],
  sessionsDocument: SessionManifest,
  duplicateRanks: ValidationDocument['duplicateRanks'],
  conflictingBrokerDays: ValidationDocument['conflictingBrokerDays'],
  quarantined: DiagnosticRef[],
  rejected: RejectedRow[],
): ValidationDocument {
  const issues: string[] = [];
  const rawBySide = countRawSides(rawRows);
  const acceptedBySide = countAcceptedSides(acceptedRows);
  const quarantinedBySide = countDiagnosticSides(quarantined);
  const capturedSessions = sessionsDocument.sessions.filter((session) => session.status === 'captured').length;

  if (rawBySide.buy !== 256 || rawBySide.sell !== 256) issues.push(`raw side counts expected 256/256, got ${rawBySide.buy}/${rawBySide.sell}`);
  if (acceptedBySide.buy !== 234 || acceptedBySide.sell !== 234) issues.push(`accepted side counts expected 234/234, got ${acceptedBySide.buy}/${acceptedBySide.sell}`);
  if (capturedSessions !== 26) issues.push(`captured sessions expected 26, got ${capturedSessions}`);
  if (quarantinedBySide.buy !== 22 || quarantinedBySide.sell !== 22) issues.push(`quarantined side counts expected 22/22, got ${quarantinedBySide.buy}/${quarantinedBySide.sell}`);
  if (rejected.length !== 0) issues.push(`expected no rejected non-quarantined rows, got ${rejected.length}`);

  const byDateSide = new Map<string, NormalizedBrokerRow[]>();
  for (const row of acceptedRows) {
    const key = `${row.date}|${row.side}`;
    byDateSide.set(key, [...(byDateSide.get(key) ?? []), row]);
  }
  for (const [key, rows] of byDateSide) {
    const ranks = new Set(rows.map((row) => row.rank));
    if (rows.length > 9) issues.push(`${key} has more than 9 accepted rows`);
    if (ranks.size !== rows.length) issues.push(`${key} has duplicate accepted ranks`);
  }

  const acceptedBrokerDaySides = new Map<string, Set<BrokerSide>>();
  for (const row of acceptedRows) {
    const key = `${row.date}|${row.brokerCode}`;
    const sides = acceptedBrokerDaySides.get(key) ?? new Set<BrokerSide>();
    sides.add(row.side);
    acceptedBrokerDaySides.set(key, sides);
  }
  for (const [key, sides] of acceptedBrokerDaySides) {
    if (sides.size > 1) issues.push(`accepted broker-day appears on both sides: ${key}`);
  }

  return {
    ticker: TICKER,
    dataVersion: DATA_VERSION,
    verified: issues.length === 0,
    issues,
    counts: {
      raw: { total: rawRows.length, bySide: rawBySide },
      duplicateRankRows: duplicateRanks.length,
      conflictingBrokerDays: conflictingBrokerDays.length,
      quarantined: { total: quarantined.length, bySide: quarantinedBySide },
      rejected: { total: rejected.length },
      accepted: { total: acceptedRows.length, bySide: acceptedBySide, capturedSessions },
    },
    duplicateRanks,
    conflictingBrokerDays,
    quarantined,
    rejected,
  };
}

function buildSessions(rows: NormalizedBrokerRow[]): SessionManifest {
  const acceptedByDateSide = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.date}|${row.side}`;
    acceptedByDateSide.set(key, (acceptedByDateSide.get(key) ?? 0) + 1);
  }
  const acceptedDates = new Set(rows.map((row) => row.date));
  const sessions: SessionManifest['sessions'] = [];

  for (const current of dateRange(QUARANTINED_DATE, SESSION_CALENDAR_END)) {
    const rowCounts = {
      buy: acceptedByDateSide.get(`${current}|buy`) ?? 0,
      sell: acceptedByDateSide.get(`${current}|sell`) ?? 0,
    };
    if (current === QUARANTINED_DATE) {
      sessions.push({ date: current, ticker: TICKER, status: 'excluded', reason: 'quarantined overlapping screenshots', rowCounts });
    } else if (HOLIDAYS.has(current)) {
      sessions.push({ date: current, ticker: TICKER, status: 'holiday', reason: 'market holiday', rowCounts });
    } else if (isWeekend(current)) {
      sessions.push({ date: current, ticker: TICKER, status: 'weekend', reason: 'weekend', rowCounts });
    } else if (MISSING.has(current)) {
      sessions.push({ date: current, ticker: TICKER, status: 'missing', reason: 'not captured', rowCounts });
    } else if (acceptedDates.has(current)) {
      sessions.push({ date: current, ticker: TICKER, status: 'captured', reason: 'captured top nine per side', rowCounts });
    } else {
      sessions.push({ date: current, ticker: TICKER, status: 'missing', reason: 'not present in raw capture', rowCounts });
    }
  }

  return {
    ticker: TICKER,
    dataVersion: DATA_VERSION,
    defaultWindow: { start: DEFAULT_START, end: DEFAULT_END },
    sessions,
  };
}

async function buildBrokerProfiles(rawRows: CsvRawRow[]): Promise<BrokersDocument> {
  const rawSeed = JSON.parse(await readFile(path.join(ROOT, RAW_BROKERS_SEED), 'utf8')) as RawSeedBroker[];
  const seedByCode = new Map(rawSeed.map((broker) => [broker.code, broker]));
  const observedCodes = new Set(rawRows.map((row) => row.broker));
  const codes = [...new Set([...seedByCode.keys(), ...observedCodes])].sort();
  const brokers: BrokerProfile[] = codes.map((code) => toBrokerProfile(code, seedByCode.get(code)));
  return { version: BROKER_VERSION, brokers };
}

function toBrokerProfile(code: string, seed: RawSeedBroker | undefined): BrokerProfile {
  const group = groupForBroker(code, seed);
  const profileStrength = MODERATE_PROFILE.has(code) ? 'Moderate' : 'Weak';
  const profileReason = profileReasonFor(group, profileStrength);
  const name = seed && seed.name !== 'TO VERIFY' ? seed.name : null;
  const identityStrength = (seed?.identity_evidence ?? 'Not enough data') as BrokerProfile['identityEvidence']['strength'];
  const identityKnown = identityStrength === 'Strong' && name !== null;
  return {
    code,
    name,
    group,
    identityEvidence: {
      strength: identityKnown ? identityStrength : 'Not enough data',
      reason: identityKnown ? 'Broker code and name are present in the seed file.' : 'Broker identity is unresolved in the seed file.',
      basis: seed ? RAW_BROKERS_SEED : 'pending',
    },
    profileEvidence: {
      strength: profileStrength,
      reason: profileReason,
      basis: 'team mapping supplied for this prototype',
      sourceReference: 'pending',
    },
    note: {
      en: 'Profile does not establish customer identity.',
      id: 'Profil tidak menetapkan identitas nasabah.',
      zh: '该画像不能确认任何客户的身份。',
    },
  };
}

function groupForBroker(code: string, seed: RawSeedBroker | undefined): BrokerGroup {
  if (!seed) return 'unknown';
  if (APP_FACING.has(code)) return 'app_facing';
  if (INSTITUTION_FACING.has(code)) return 'institution_facing';
  return 'other_mixed';
}

function profileReasonFor(group: BrokerGroup, strength: 'Moderate' | 'Weak') {
  if (strength === 'Moderate' && group === 'app_facing') {
    return {
      en: 'Team mapping labels this broker as app-facing; source citation is pending.',
      id: 'Pemetaan tim mengelompokkan broker ini sebagai app-facing; sitasi sumber masih pending.',
      zh: '团队映射将该券商归为面向App的券商；来源引用仍待补齐。',
    };
  }
  if (strength === 'Moderate' && group === 'institution_facing') {
    return {
      en: 'Team mapping labels this broker as institution-facing; source citation is pending.',
      id: 'Pemetaan tim mengelompokkan broker ini sebagai institution-facing; sitasi sumber masih pending.',
      zh: '团队映射将该券商归为面向机构的券商；来源引用仍待补齐。',
    };
  }
  return {
    en: 'Team mapping gives only a broad broker profile; client mix is not established.',
    id: 'Pemetaan tim hanya memberi profil broker secara umum; campuran nasabah tidak ditetapkan.',
    zh: '团队映射仅给出宽泛的券商画像；客户构成并未确认。',
  };
}

async function buildEvents(): Promise<EventsDocument> {
  const raw = JSON.parse(await readFile(path.join(ROOT, RAW_EVENTS), 'utf8')) as RawEventsDocument;
  const events = raw.events.map(toSiniEvent);
  return { ticker: raw.ticker, version: EVENTS_VERSION, events };
}

function toSiniEvent(raw: RawEvent): SiniEvent {
  const text = REVIEWED_EVENT_TEXT[raw.id];
  if (!text) throw new Error(`Missing reviewed event text for ${raw.id}`);
  const event: SiniEvent = {
    id: raw.id,
    layer: raw.layer,
    publicationDate: raw.date,
    availableAt: `${raw.date}T00:00:00+07:00`,
    source: { name: raw.source, url: raw.url },
    text,
  };
  if (raw.layer === 'health') event.reportingDate = raw.date;
  else event.eventDate = raw.date;
  return event;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      current = '';
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else {
      current += char;
    }
  }
  row.push(current);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function required(value: string | undefined, line: number, field: string): string {
  if (value === undefined || value === '') throw new Error(`${field} missing at ${RAW_BROKERS_CSV}:${line}`);
  return value;
}

function normalizeSide(side: string): BrokerSide | null {
  if (side === 'buy' || side === 'sell') return side;
  return null;
}

function parseIntegerField(field: string, fieldName: string, ref: DiagnosticRef, rejected: RejectedRow[]): number | null {
  try {
    return parseSafeIntegerLabel(field, fieldName);
  } catch (error) {
    rejected.push({ reason: `${fieldName}_parse_failed: ${(error as Error).message}`, row: ref });
    return null;
  }
}

function stableRowId(ticker: string, date: string, side: BrokerSide, rank: number): string {
  return `${ticker}-${date.replaceAll('-', '')}-${side === 'buy' ? 'B' : 'S'}${String(rank).padStart(2, '0')}`;
}

function toDiagnosticRef(row: CsvRawRow): DiagnosticRef {
  return { sourceLine: row.sourceLine, date: row.date, side: row.side, rank: row.rank, broker: row.broker };
}

function findDuplicateRanks(rows: CsvRawRow[]): ValidationDocument['duplicateRanks'] {
  const seen = new Map<string, DiagnosticRef>();
  const duplicates: ValidationDocument['duplicateRanks'] = [];
  for (const row of rows) {
    const ref = toDiagnosticRef(row);
    const key = `${row.date}|${row.side}|${row.rank}`;
    const first = seen.get(key);
    if (first) duplicates.push({ key, first, duplicate: ref });
    else seen.set(key, ref);
  }
  return duplicates;
}

function findConflictingBrokerDays(rows: CsvRawRow[]): ValidationDocument['conflictingBrokerDays'] {
  const byBrokerDay = new Map<string, DiagnosticRef[]>();
  for (const row of rows) {
    const key = `${row.date}|${row.broker}`;
    byBrokerDay.set(key, [...(byBrokerDay.get(key) ?? []), toDiagnosticRef(row)]);
  }
  return [...byBrokerDay]
    .filter(([, refs]) => new Set(refs.map((ref) => ref.side)).size > 1)
    .map(([key, refs]) => ({ key, rows: refs }));
}

function countRawSides(rows: CsvRawRow[]): Record<BrokerSide, number> {
  return rows.reduce<Record<BrokerSide, number>>(
    (counts, row) => {
      const side = normalizeSide(row.side);
      if (side) counts[side] += 1;
      return counts;
    },
    { buy: 0, sell: 0 },
  );
}

function countAcceptedSides(rows: NormalizedBrokerRow[]): Record<BrokerSide, number> {
  return rows.reduce<Record<BrokerSide, number>>(
    (counts, row) => {
      counts[row.side] += 1;
      return counts;
    },
    { buy: 0, sell: 0 },
  );
}

function countDiagnosticSides(rows: DiagnosticRef[]): Record<BrokerSide, number> {
  return rows.reduce<Record<BrokerSide, number>>(
    (counts, row) => {
      const side = normalizeSide(row.side);
      if (side) counts[side] += 1;
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

function lastCapturedDate(sessions: SessionManifest): string | null {
  const captured = sessions.sessions.filter((session) => session.status === 'captured');
  return captured.at(-1)?.date ?? null;
}

await main();
