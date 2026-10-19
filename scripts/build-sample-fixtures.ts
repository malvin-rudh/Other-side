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

// Deterministic fictional fixtures for the sample instruments. Each stock is a
// scripted scenario (accumulation, distribution, a news spike, a calm large cap,
// a reversal) drawn with a seeded generator whose shape follows the verified SINI
// capture: nine visible brokers per side with a steep rank fall-off (each rank
// about 0.6 of the one above), visible flow that grows with the size of the
// price move, institution-facing brokers leaning with the move and app-facing
// brokers leaning against it, persistent per-broker side habits, and broker
// average prices within a few percent of the close. The same seed always gives
// the same files, and the raw CSVs are written first so row sources point at
// real in-repo files.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const START = '2026-08-14';
const END = '2026-09-23';
const HOLIDAYS = new Set(['2026-08-17', '2026-08-25']);
const ROWS_PER_SIDE = 9;
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
  ticker: string;
  dataVersion: string;
  eventsVersion: string;
  csvPath: string;
  missingDates: ReadonlySet<string>;
  dayPlans: DayPlan[];
  bars: SamplePriceBar[];
  events: SiniEvent[];
  market: MarketSpec;
  lotSize: number;
  rowsPerSide: number;
  uncapturedReason: string;
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

type Group = 'app_facing' | 'institution_facing' | 'other_mixed';

// Per-market settings. Indonesia is the default and is what SINI and SMPA to
// SMPE use, so their output does not depend on anything below it. The other
// markets draw from their own fictional broker pool (public/data/brokers.json).
type MarketCode = 'ID' | 'HK' | 'KR' | 'CN';
interface MarketSpec {
  code: MarketCode;
  currency: PricesDocument['currency'];
  timezone: string;
  exchangeName: string;
  tick: (price: number) => number;
  // Fictional broker codes of this market; null for Indonesia (everything else).
  brokerCodes: readonly string[] | null;
}

interface EventSpec {
  layer: 'story' | 'health';
  date: string;
  en: string;
  id: string;
  zh: string;
}

interface Scenario {
  ticker: string;
  seed: number;
  startClose: number;
  // Daily noise and the expected move on market day i of n.
  sigma: number;
  drift: (i: number, n: number) => number;
  // One-day jumps on a market date: the move, how much busier the day is and,
  // optionally, how each group leans that day in place of the usual tilt.
  shocks: Record<string, { move: number; volume: number; lean?: Record<Group, number> }>;
  // How strongly each group leans to net buying (+) or selling (-) on day i.
  tilt: (i: number, n: number) => Record<Group, number>;
  baseVolumeLots: number;
  missingDates: ReadonlySet<string>;
  events: EventSpec[];
  // Optional per-market settings. Left out, a scenario behaves exactly as before:
  // Indonesia, nine rows a side, 100 shares a lot, every market day captured.
  market?: MarketCode;
  rowsPerSide?: number;
  lotSize?: number;
  // Daily price limit (a fraction), applied to the move before the tick grid.
  moveLimit?: number;
  // Overrides the market's exchange name (Shanghai or Shenzhen).
  exchangeName?: string;
  // A day is captured only when this returns true for the day's realised move
  // (China's Dragon Tiger List only publishes big-move days).
  captureRule?: (move: number) => boolean;
  uncapturedReason?: string;
}

const STORY_SOURCE = 'Sample fixture (fictional, not a real announcement)';

const SCENARIOS: Scenario[] = [
  {
    // Quiet accumulation: institution-facing brokers buy most days while app
    // clients sell into a slow climb.
    ticker: 'SMPA',
    seed: 11,
    startClose: 5200,
    sigma: 0.011,
    drift: () => 0.0042,
    shocks: { '2026-08-21': { move: 0.031, volume: 2.2 } },
    tilt: (i, n) => ({ institution_facing: 0.45 + 0.35 * (i / n), app_facing: -0.55, other_mixed: 0.05 }),
    baseVolumeLots: 9_000,
    missingDates: new Set(),
    events: [
      {
        layer: 'story',
        date: '2026-08-21',
        en: 'Fictional sample event: the fictional issuer announced a mock long-term supply contract with a state utility.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif mengumumkan kontrak pasokan jangka panjang pura-pura dengan BUMN utilitas.',
        zh: '虚构样本事件：该虚构发行人宣布与一家国有公用事业公司签订模拟长期供货合同。',
      },
      {
        layer: 'health',
        date: '2026-09-11',
        en: 'Fictional sample report: the fictional issuer filed a mock half-year result with revenue up and net debt down.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil semester pura-pura dengan pendapatan naik dan utang bersih turun.',
        zh: '虚构样本报告：该虚构发行人提交模拟半年业绩，收入上升、净负债下降。',
      },
    ],
  },
  {
    // Distribution: institutions buy early, then hand shares to app clients who
    // keep buying while the price stalls and fades.
    ticker: 'SMPB',
    seed: 23,
    startClose: 2000,
    sigma: 0.014,
    drift: (i) => (i < 12 ? 0.0075 : -0.0075),
    shocks: { '2026-08-31': { move: 0.04, volume: 2.6 } },
    tilt: (i) =>
      i < 9
        ? { institution_facing: 0.5, app_facing: -0.2, other_mixed: -0.1 }
        : { institution_facing: -0.85, app_facing: 0.85, other_mixed: 0.05 },
    baseVolumeLots: 14_000,
    missingDates: new Set(['2026-09-08']),
    events: [
      {
        layer: 'story',
        date: '2026-08-31',
        en: 'Fictional sample event: the fictional issuer announced a mock plan to enter the data-centre business.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif mengumumkan rencana pura-pura masuk ke bisnis pusat data.',
        zh: '虚构样本事件：该虚构发行人宣布进军数据中心业务的模拟计划。',
      },
      {
        layer: 'health',
        date: '2026-09-15',
        en: 'Fictional sample report: the fictional issuer filed a mock result showing margins narrowing.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil pura-pura dengan margin menyempit.',
        zh: '虚构样本报告：该虚构发行人提交模拟业绩，利润率收窄。',
      },
    ],
  },
  {
    // A news spike: a mock resource find sends the price up hard on heavy
    // volume, app clients chase it, institutions and mixed desks sell into it.
    ticker: 'SMPC',
    seed: 37,
    startClose: 1500,
    sigma: 0.017,
    drift: (i) => (i > 13 && i < 17 ? 0.035 : i >= 17 ? -0.0075 : 0.0005),
    shocks: {
      '2026-09-02': {
        move: 0.17,
        volume: 6,
        lean: { institution_facing: -1.6, app_facing: 1.6, other_mixed: -0.3 },
      },
    },
    // Market day 11 is the 2 Sep news day.
    tilt: (i) =>
      i < 11
        ? { institution_facing: 0.25, app_facing: -0.1, other_mixed: 0.05 }
        : { institution_facing: -0.75, app_facing: 0.95, other_mixed: -0.35 },
    baseVolumeLots: 20_000,
    missingDates: new Set(),
    events: [
      {
        layer: 'story',
        date: '2026-09-02',
        en: 'Fictional sample event: the fictional issuer reported a mock nickel find at its exploration site.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif melaporkan temuan nikel pura-pura di lokasi eksplorasinya.',
        zh: '虚构样本事件：该虚构发行人报告其勘探区发现模拟镍矿。',
      },
      {
        layer: 'story',
        date: '2026-09-14',
        en: 'Fictional sample event: the fictional exchange flagged unusual price and volume moves in the stock.',
        id: 'Peristiwa contoh fiksi: bursa fiktif menandai pergerakan harga dan volume yang tidak wajar pada saham ini.',
        zh: '虚构样本事件：虚构交易所提示该股价格和成交量出现异常波动。',
      },
    ],
  },
  {
    // A calm large cap: flows roughly balance and the price barely moves.
    ticker: 'SMPD',
    seed: 41,
    startClose: 9000,
    sigma: 0.007,
    drift: () => 0.0006,
    shocks: {},
    tilt: () => ({ institution_facing: 0.1, app_facing: -0.05, other_mixed: 0 }),
    baseVolumeLots: 30_000,
    missingDates: new Set(),
    events: [
      {
        layer: 'health',
        date: '2026-08-28',
        en: 'Fictional sample report: the fictional issuer filed a mock half-year result in line with last year.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil semester pura-pura yang sejalan dengan tahun lalu.',
        zh: '虚构样本报告：该虚构发行人提交与去年持平的模拟半年业绩。',
      },
    ],
  },
  {
    // A reversal: app clients buy the slide, then institutions step in after a
    // mock refinancing and the price turns.
    ticker: 'SMPE',
    seed: 53,
    startClose: 3200,
    sigma: 0.015,
    drift: (i) => (i < 13 ? -0.008 : 0.0095),
    shocks: { '2026-09-03': { move: 0.055, volume: 3 } },
    tilt: (i) =>
      i < 13
        ? { institution_facing: -0.5, app_facing: 0.55, other_mixed: -0.05 }
        : { institution_facing: 0.9, app_facing: -0.55, other_mixed: -0.1 },
    baseVolumeLots: 16_000,
    missingDates: new Set(),
    events: [
      {
        layer: 'health',
        date: '2026-09-03',
        en: 'Fictional sample event: the fictional issuer announced a mock refinancing that pushes its loan maturities out to 2031.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif mengumumkan refinancing pura-pura yang memundurkan jatuh tempo pinjaman ke 2031.',
        zh: '虚构样本事件：该虚构发行人宣布模拟再融资，将贷款到期日延至 2031 年。',
      },
      {
        layer: 'story',
        date: '2026-09-16',
        en: 'Fictional sample event: the fictional issuer named a mock new chief executive from a regional energy group.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif menunjuk CEO baru pura-pura dari grup energi regional.',
        zh: '虚构样本事件：该虚构发行人任命一位来自地区能源集团的模拟新任首席执行官。',
      },
    ],
  },
  {
    // Hong Kong, participant holdings: southbound accumulation. A global-bank
    // participant adds almost every day while online-broker clients trim into a
    // slow climb.
    ticker: 'SHKA',
    seed: 61,
    startClose: 142.3,
    sigma: 0.01,
    drift: () => 0.0035,
    shocks: { '2026-09-09': { move: 0.04, volume: 2.2 } },
    tilt: (i, n) => ({ institution_facing: 0.3 + 0.2 * (i / n), app_facing: -0.45, other_mixed: -0.1 }),
    baseVolumeLots: 6000,
    missingDates: new Set(),
    market: 'HK',
    rowsPerSide: 6,
    lotSize: 200,
    events: [
      {
        layer: 'story',
        date: '2026-09-09',
        en: 'Fictional sample event: the fictional issuer was added to a mock southbound trading list, and mainland-linked holdings rose.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif ditambahkan ke daftar perdagangan southbound pura-pura, dan kepemilikan terkait daratan naik.',
        zh: '虚构样本事件：该虚构发行人被纳入模拟南向交易名单，内地关联持仓上升。',
      },
      {
        layer: 'health',
        date: '2026-09-10',
        en: 'Fictional sample report: the fictional issuer filed a mock interim result with revenue up and borrowings down.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil interim pura-pura dengan pendapatan naik dan pinjaman turun.',
        zh: '虚构样本报告：该虚构发行人提交模拟中期业绩，收入上升、借款下降。',
      },
    ],
  },
  {
    // Hong Kong, participant holdings: a mock share placement at a discount.
    // Global-bank participants sell the placement, online brokers buy the dip.
    ticker: 'SHKB',
    seed: 67,
    startClose: 96.0,
    sigma: 0.016,
    drift: (i) => (i < 10 ? 0.002 : -0.0045),
    shocks: { '2026-09-01': { move: -0.065, volume: 3, lean: { institution_facing: -1.5, app_facing: 1, other_mixed: -0.2 } } },
    tilt: (i) => (i < 10 ? { institution_facing: 0.2, app_facing: -0.1, other_mixed: 0 } : { institution_facing: -0.7, app_facing: 0.7, other_mixed: -0.1 }),
    baseVolumeLots: 9000,
    missingDates: new Set(),
    market: 'HK',
    rowsPerSide: 6,
    lotSize: 500,
    events: [
      {
        layer: 'story',
        date: '2026-09-01',
        en: 'Fictional sample event: the fictional issuer announced a mock share placement at a discount to fund a trial.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif mengumumkan penempatan saham pura-pura dengan diskon untuk membiayai uji klinis.',
        zh: '虚构样本事件：该虚构发行人宣布以折价进行模拟股份配售，为临床试验筹资。',
      },
      {
        layer: 'health',
        date: '2026-09-14',
        en: 'Fictional sample report: the fictional issuer filed a mock interim result showing a wider loss and thinner cash.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil interim pura-pura dengan rugi melebar dan kas menipis.',
        zh: '虚构样本报告：该虚构发行人提交模拟中期业绩，亏损扩大、现金减少。',
      },
    ],
  },
  {
    // Korea, top five member firms: a retail frenzy. A mock battery headline
    // sends the price up on heavy volume, retail-heavy firms chase it and
    // institution-facing firms sell into it, then the price fades.
    ticker: 'SKRA',
    seed: 71,
    startClose: 58000,
    sigma: 0.02,
    drift: (i) => (i < 14 ? 0.002 : i >= 16 ? -0.012 : 0.004),
    shocks: {
      '2026-09-07': { move: 0.08, volume: 3 },
      '2026-09-08': { move: 0.16, volume: 7, lean: { institution_facing: -1.7, app_facing: 1.8, other_mixed: -0.2 } },
    },
    tilt: (i) => (i < 14 ? { institution_facing: 0.2, app_facing: -0.2, other_mixed: -0.15 } : { institution_facing: -0.6, app_facing: 0.6, other_mixed: 0 }),
    baseVolumeLots: 40000,
    missingDates: new Set(),
    market: 'KR',
    rowsPerSide: 5,
    lotSize: 10,
    events: [
      {
        layer: 'story',
        date: '2026-09-08',
        en: 'Fictional sample event: online forums spread a mock rumour of a large battery order, and the fictional stock jumped on heavy volume.',
        id: 'Peristiwa contoh fiksi: forum daring menyebarkan kabar angin pura-pura soal pesanan baterai besar, dan saham fiktif ini melonjak dengan volume besar.',
        zh: '虚构样本事件：网络论坛流传一则关于大额电池订单的模拟传闻，该虚构股票放量大涨。',
      },
      {
        layer: 'health',
        date: '2026-09-17',
        en: 'Fictional sample report: the fictional issuer filed a mock half-year result with thin margins and negative operating cash flow.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil semester pura-pura dengan margin tipis dan arus kas operasi negatif.',
        zh: '虚构样本报告：该虚构发行人提交模拟半年业绩，利润率偏薄、经营现金流为负。',
      },
    ],
  },
  {
    // Korea, top five member firms: steady accumulation by foreign-linked,
    // institution-facing firms while retail-heavy firms sell into a climb.
    ticker: 'SKRB',
    seed: 73,
    startClose: 84000,
    sigma: 0.012,
    drift: () => 0.003,
    shocks: { '2026-09-03': { move: 0.05, volume: 2.5 } },
    tilt: (i, n) => ({ institution_facing: 0.3 + 0.2 * (i / n), app_facing: -0.45, other_mixed: -0.1 }),
    baseVolumeLots: 25000,
    missingDates: new Set(),
    market: 'KR',
    rowsPerSide: 5,
    lotSize: 10,
    events: [
      {
        layer: 'story',
        date: '2026-09-03',
        en: 'Fictional sample event: mock reports of a large foreign fund adding to its holding lifted the fictional stock.',
        id: 'Peristiwa contoh fiksi: laporan pura-pura bahwa dana asing besar menambah kepemilikannya mengangkat saham fiktif ini.',
        zh: '虚构样本事件：一则关于大型外资基金增持的模拟报道推高了该虚构股票。',
      },
      {
        layer: 'health',
        date: '2026-09-10',
        en: 'Fictional sample report: the fictional issuer filed a mock half-year result with higher profit and a lower loan balance.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil semester pura-pura dengan laba naik dan saldo pinjaman turun.',
        zh: '虚构样本报告：该虚构发行人提交模拟半年业绩，利润上升、贷款余额下降。',
      },
    ],
  },
  {
    // China, Dragon Tiger List: a squeeze. Retail-heavy branches chase a run of
    // limit-type days while institutional seats sell into it, then the run
    // reverses. Only big-move days appear on the list.
    ticker: 'SCNA',
    seed: 83,
    startClose: 96,
    sigma: 0.012,
    drift: (i) => (i < 17 ? 0.003 : -0.003),
    shocks: {
      '2026-08-20': { move: 0.09, volume: 3, lean: { institution_facing: -1.2, app_facing: 1.3, other_mixed: 0.1 } },
      '2026-08-27': { move: 0.1, volume: 3.5, lean: { institution_facing: -1.4, app_facing: 1.4, other_mixed: 0.1 } },
      '2026-09-02': { move: 0.1, volume: 4, lean: { institution_facing: -1.5, app_facing: 1.5, other_mixed: 0.1 } },
      '2026-09-04': { move: 0.09, volume: 3.5, lean: { institution_facing: -1.3, app_facing: 1.4, other_mixed: 0 } },
      '2026-09-09': { move: -0.09, volume: 4, lean: { institution_facing: 0.6, app_facing: -1.4, other_mixed: -0.1 } },
      '2026-09-15': { move: -0.095, volume: 4, lean: { institution_facing: 0.5, app_facing: -1.5, other_mixed: -0.1 } },
      '2026-09-21': { move: -0.085, volume: 3, lean: { institution_facing: 0.4, app_facing: -1.3, other_mixed: -0.1 } },
    },
    tilt: (i) => (i < 17 ? { institution_facing: -0.3, app_facing: 0.5, other_mixed: 0 } : { institution_facing: 0.2, app_facing: -0.5, other_mixed: 0 }),
    baseVolumeLots: 18000,
    missingDates: new Set(),
    market: 'CN',
    rowsPerSide: 5,
    lotSize: 100,
    moveLimit: 0.1,
    captureRule: (move) => Math.abs(move) >= 0.07,
    uncapturedReason: 'not on the Dragon Tiger List (no big move)',
    exchangeName: 'Shanghai Stock Exchange (sample)',
    events: [
      {
        layer: 'story',
        date: '2026-09-02',
        en: 'Fictional sample event: the fictional issuer announced a mock robot-arm order from an unnamed carmaker.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif mengumumkan pesanan lengan robot pura-pura dari produsen mobil yang tidak disebutkan.',
        zh: '虚构样本事件：该虚构发行人宣布获得一家未具名车企的模拟机械臂订单。',
      },
      {
        layer: 'health',
        date: '2026-09-16',
        en: 'Fictional sample report: the fictional issuer filed a mock half-year result with profit propped up by a one-off subsidy.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil semester pura-pura dengan laba ditopang subsidi satu kali.',
        zh: '虚构样本报告：该虚构发行人提交模拟半年业绩，利润由一次性补贴支撑。',
      },
    ],
  },
  {
    // China, Dragon Tiger List: institutional seats accumulate on a handful of
    // big up days while retail-heavy branches take profit. Only big-move days
    // appear on the list.
    ticker: 'SCNB',
    seed: 89,
    startClose: 118,
    sigma: 0.01,
    drift: () => 0.0025,
    shocks: {
      '2026-08-19': { move: 0.09, volume: 3 },
      '2026-08-28': { move: 0.09, volume: 3 },
      '2026-09-03': { move: 0.095, volume: 3.5 },
      '2026-09-08': { move: 0.09, volume: 3 },
      '2026-09-11': { move: 0.09, volume: 3 },
      '2026-09-17': { move: -0.085, volume: 3.5, lean: { institution_facing: 0.9, app_facing: -1.2, other_mixed: 0 } },
      '2026-09-22': { move: 0.09, volume: 3 },
    },
    tilt: (i, n) => ({ institution_facing: 0.3 + 0.2 * (i / n), app_facing: -0.45, other_mixed: -0.1 }),
    baseVolumeLots: 14000,
    missingDates: new Set(),
    market: 'CN',
    rowsPerSide: 5,
    lotSize: 100,
    moveLimit: 0.1,
    captureRule: (move) => Math.abs(move) >= 0.07,
    uncapturedReason: 'not on the Dragon Tiger List (no big move)',
    exchangeName: 'Shenzhen Stock Exchange (sample)',
    events: [
      {
        layer: 'story',
        date: '2026-08-28',
        en: 'Fictional sample event: the fictional issuer reported a mock approval for a late-stage drug trial.',
        id: 'Peristiwa contoh fiksi: penerbit fiktif melaporkan persetujuan pura-pura untuk uji coba obat tahap akhir.',
        zh: '虚构样本事件：该虚构发行人报告一项后期药物试验获得模拟批准。',
      },
      {
        layer: 'health',
        date: '2026-09-14',
        en: 'Fictional sample report: the fictional issuer filed a mock half-year result with higher revenue, profit and operating cash flow.',
        id: 'Laporan contoh fiksi: penerbit fiktif melaporkan hasil semester pura-pura dengan pendapatan, laba, dan arus kas operasi naik.',
        zh: '虚构样本报告：该虚构发行人提交模拟半年业绩，收入、利润和经营现金流均上升。',
      },
    ],
  },
];

// Median lots at each rank relative to rank 1 in the SINI capture.
const RANK_SHAPE = [1, 0.61, 0.36, 0.29, 0.2, 0.14, 0.1, 0.1, 0.06] as const;

// Small deterministic generator (mulberry32) and a normal draw on top of it.
function rng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, normal };
}

// IDX price fractions.
function tickSize(price: number): number {
  if (price < 200) return 1;
  if (price < 500) return 2;
  if (price < 2000) return 5;
  if (price < 5000) return 10;
  return 25;
}

function toTick(price: number, tickFor: (price: number) => number = tickSize): number {
  const tick = tickFor(price);
  return Number(Math.max(tick, Math.round(price / tick) * tick).toFixed(4));
}

// HKEX spread table (HKD).
function hkTickSize(price: number): number {
  if (price < 0.25) return 0.001;
  if (price < 0.5) return 0.005;
  if (price < 10) return 0.01;
  if (price < 20) return 0.02;
  if (price < 100) return 0.05;
  if (price < 200) return 0.1;
  if (price < 500) return 0.2;
  if (price < 1000) return 0.5;
  if (price < 2000) return 1;
  if (price < 5000) return 2;
  return 5;
}

// KRX tick sizes for KOSPI stocks (KRW).
function krTickSize(price: number): number {
  if (price < 2000) return 1;
  if (price < 5000) return 5;
  if (price < 20000) return 10;
  if (price < 50000) return 50;
  if (price < 200000) return 100;
  if (price < 500000) return 500;
  return 1000;
}

// Shanghai and Shenzhen A-shares: one fen (CNY).
function cnTickSize(): number {
  return 0.01;
}

// Fictional broker codes per market. Appended to brokers.json in this order, so
// the Indonesian pool (every code not listed here) never changes.
const HK_CODES = ['HA', 'HB', 'HC', 'HD', 'HE', 'HF', 'HG', 'HH', 'HJ', 'HK', 'HL', 'HM', 'HN', 'HQ', 'HR', 'HS', 'HT', 'HU', 'HV', 'HW', 'HX', 'HY'] as const;
const KR_CODES = ['KA', 'KB', 'KC', 'KD', 'KE', 'KF', 'KG', 'KH', 'KJ', 'KL', 'KM', 'KN', 'KQ', 'KR', 'KS', 'KT'] as const;
const CN_CODES = ['CA', 'CB', 'CD', 'CE', 'CF', 'CG', 'CH', 'CJ', 'CK', 'CL', 'CM', 'CN', 'CQ', 'CR', 'CS', 'CT', 'CU', 'CV'] as const;

const MARKETS: Record<MarketCode, MarketSpec> = {
  ID: { code: 'ID', currency: 'IDR', timezone: 'Asia/Jakarta', exchangeName: 'Not listed (sample fixture)', tick: tickSize, brokerCodes: null },
  HK: { code: 'HK', currency: 'HKD', timezone: 'Asia/Hong_Kong', exchangeName: 'Hong Kong Stock Exchange (sample)', tick: hkTickSize, brokerCodes: HK_CODES },
  KR: { code: 'KR', currency: 'KRW', timezone: 'Asia/Seoul', exchangeName: 'Korea Exchange (sample)', tick: krTickSize, brokerCodes: KR_CODES },
  CN: { code: 'CN', currency: 'CNY', timezone: 'Asia/Shanghai', exchangeName: 'Shanghai and Shenzhen Stock Exchanges (sample)', tick: cnTickSize, brokerCodes: CN_CODES },
};
const NON_ID_CODES: ReadonlySet<string> = new Set([...HK_CODES, ...KR_CODES, ...CN_CODES]);

function universeFor(market: MarketSpec, all: readonly BrokerProfileLite[]): BrokerProfileLite[] {
  const codes = market.brokerCodes;
  return codes === null ? all.filter((b) => !NON_ID_CODES.has(b.code)) : all.filter((b) => codes.includes(b.code));
}

interface BrokerProfileLite {
  code: string;
  group: Group;
}

interface GeneratedStock {
  bars: SamplePriceBar[];
  dayPlans: DayPlan[];
}

function marketOf(scenario: Scenario): MarketSpec {
  return MARKETS[scenario.market ?? 'ID'];
}

function generateStock(scenario: Scenario, marketDates: readonly string[], universe: readonly BrokerProfileLite[]): GeneratedStock {
  const random = rng(scenario.seed);
  const n = marketDates.length;
  const market = marketOf(scenario);
  const rowsPerSide = scenario.rowsPerSide ?? ROWS_PER_SIDE;
  const tickOf = (price: number) => toTick(price, market.tick);

  // Prices: drift plus noise plus scripted shocks, on the IDX tick grid.
  const bars: SamplePriceBar[] = [];
  const moves: number[] = [];
  const volumes: number[] = [];
  let previous = scenario.startClose;
  marketDates.forEach((date, i) => {
    const shock = scenario.shocks[date];
    const rawMove = i === 0 ? 0 : scenario.drift(i, n) + scenario.sigma * random.normal() + (shock?.move ?? 0);
    const limit = scenario.moveLimit;
    const move = limit === undefined ? rawMove : Math.max(-limit, Math.min(limit, rawMove));
    const close = i === 0 ? scenario.startClose : tickOf(previous * (1 + move));
    const realised = i === 0 ? 0 : close / previous - 1;
    const range = Math.max(Math.abs(realised), scenario.sigma * 0.6);
    const open = tickOf(previous * (1 + (random.next() - 0.5) * scenario.sigma));
    const high = tickOf(Math.max(open, close) * (1 + range * (0.3 + 0.4 * random.next())));
    const low = tickOf(Math.min(open, close) * (1 - range * (0.3 + 0.4 * random.next())));
    // Busier days are the big-move days, as in the SINI capture.
    const busy = 1 + 9 * Math.abs(realised) + (shock ? shock.volume - 1 : 0);
    const volumeLots = Math.round(scenario.baseVolumeLots * (0.7 + 0.6 * random.next()) * busy);
    bars.push({ date, open, high, low: Math.min(low, close, open), close, volume: volumeLots * (scenario.lotSize ?? 100) });
    moves.push(realised);
    volumes.push(volumeLots);
    previous = close;
  });

  // Each broker keeps a side habit and a size for the whole window.
  const habits = universe.map((broker) => ({
    ...broker,
    habit: Math.max(-1, Math.min(1, random.normal() * 0.45)),
    size: Math.exp(random.normal() * 0.8),
  }));

  const dayPlans: DayPlan[] = [];
  marketDates.forEach((date, i) => {
    if (scenario.missingDates.has(date)) return;
    if (scenario.captureRule && !scenario.captureRule(moves[i]!)) return;
    const close = bars[i]!.close;
    // Capped, so one shock day cannot flip a group's habit on its own.
    const z = Math.max(-2.5, Math.min(2.5, moves[i]! / scenario.sigma));
    const tilt = scenario.tilt(i, n);
    // Institutions lean with the day's move, app clients against it.
    const lean: Record<Group, number> = scenario.shocks[date]?.lean ?? {
      institution_facing: tilt.institution_facing + 0.12 * z,
      app_facing: tilt.app_facing - 0.1 * z,
      other_mixed: tilt.other_mixed,
    };
    const nets = habits.map((broker) => ({
      code: broker.code,
      net: (broker.habit + 1.3 * lean[broker.group] + 0.85 * random.normal()) * broker.size * Math.exp(random.normal() * 0.5),
    }));
    if (scenario.market !== undefined) {
      // Smaller broker pools of the other markets: when a lean leaves too few
      // brokers on one side, the weakest nets of the crowded side cross over.
      for (const sign of [1, -1]) {
        const crowded = nets.filter((entry) => Math.sign(entry.net) === sign).sort((x, y) => Math.abs(x.net) - Math.abs(y.net));
        const short = rowsPerSide - nets.filter((entry) => Math.sign(entry.net) === -sign).length;
        for (let k = 0; k < short && k < crowded.length - rowsPerSide; k += 1) crowded[k]!.net = -crowded[k]!.net;
      }
    }
    const buyers = nets.filter((entry) => entry.net > 0).sort((a, b) => b.net - a.net).slice(0, rowsPerSide);
    const sellers = nets.filter((entry) => entry.net < 0).sort((a, b) => a.net - b.net).slice(0, rowsPerSide);
    if (buyers.length < rowsPerSide || sellers.length < rowsPerSide) {
      throw new Error(`${scenario.ticker} ${date}: fewer than ${rowsPerSide} brokers on a side (${buyers.length} buy, ${sellers.length} sell, pool ${habits.length})`);
    }
    // The visible top nine carry a quarter to a half of the day's volume.
    const buyTotal = volumes[i]! * (0.25 + 0.25 * random.next());
    const sellTotal = buyTotal * (0.9 + 0.25 * random.next());
    // Sizes follow the SINI rank fall-off, with some day-to-day noise.
    const toSpecs = (list: { code: string; net: number }[], total: number, sideBias: number): BrokerSpec[] => {
      const shares = RANK_SHAPE.slice(0, rowsPerSide).map((share) => share * Math.exp(0.18 * random.normal()));
      const weight = shares.reduce((sum, share) => sum + share, 0);
      let ceiling = Number.POSITIVE_INFINITY;
      return list.map((entry, rank) => {
        const lots = Math.max(1, Math.min(ceiling, Math.round((shares[rank]! / weight) * total)));
        ceiling = lots;
        return {
          code: entry.code,
          lots,
          price: Math.max(1, Math.round(tickOf(close * (1 + sideBias + 0.015 * random.normal())))),
          frequency: Math.max(1, Math.round(lots / (8 + 12 * random.next()))),
        };
      });
    };
    dayPlans.push({ date, buy: toSpecs(buyers, buyTotal, 0.003), sell: toSpecs(sellers, sellTotal, -0.003) });
  });

  return { bars, dayPlans };
}

function scenarioEvents(scenario: Scenario): SiniEvent[] {
  return scenario.events.map((event, index) => ({
    id: `E-${scenario.ticker}-FIXTURE-${String(index + 1).padStart(2, '0')}`,
    layer: event.layer,
    ...(event.layer === 'story' ? { eventDate: event.date } : { reportingDate: event.date }),
    publicationDate: event.date,
    availableAt: `${event.date}T00:00:00+07:00`,
    source: { name: STORY_SOURCE, url: `sample://fixture/${scenario.ticker.toLowerCase()}/event-${String(index + 1).padStart(2, '0')}` },
    text: { en: event.en, id: event.id, zh: event.zh },
  }));
}

async function readUniverse(): Promise<BrokerProfileLite[]> {
  const document = JSON.parse(await readFile(path.join(ROOT, 'public/data/brokers.json'), 'utf8')) as {
    brokers: { code: string; group: string }[];
  };
  return document.brokers
    .filter((broker): broker is BrokerProfileLite => broker.group !== 'unknown')
    .map((broker) => ({ code: broker.code, group: broker.group as Group }));
}

async function main() {
  const marketDates = [...dateRange(START, END)].filter((date) => !HOLIDAYS.has(date) && !isWeekend(date));
  const allBrokers = await readUniverse();
  for (const scenario of SCENARIOS) {
    const market = { ...marketOf(scenario), exchangeName: scenario.exchangeName ?? marketOf(scenario).exchangeName };
    const rowsPerSide = scenario.rowsPerSide ?? ROWS_PER_SIDE;
    const generated = generateStock(scenario, marketDates, universeFor(market, allBrokers));
    const capturedSessions = generated.dayPlans.length;
    const spec: FixtureSpec = {
      ticker: scenario.ticker,
      dataVersion: `sample-fixture-${scenario.ticker.toLowerCase()}-${START}_${END}-v2`,
      eventsVersion: `sample-fixture-${scenario.ticker.toLowerCase()}-events-v2`,
      csvPath: `data/raw/samples/${scenario.ticker.toLowerCase()}_broker_summary.csv`,
      missingDates: scenario.missingDates,
      dayPlans: generated.dayPlans,
      bars: generated.bars,
      events: scenarioEvents(scenario),
      market,
      lotSize: scenario.lotSize ?? 100,
      rowsPerSide,
      uncapturedReason: scenario.uncapturedReason ?? 'not present in sample capture',
      expected: { capturedSessions, rowsPerSide: capturedSessions * rowsPerSide },
    };
    await buildFixture(spec);
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
  market: MarketSpec = MARKETS.ID,
): PricesDocument {
  return {
    symbol,
    version,
    currency: market.currency,
    exchangeTimezone: market.timezone,
    exchangeName: market.exchangeName,
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

async function buildFixture(spec: FixtureSpec) {
  const rawRecords = spec.dayPlans.flatMap(({ date, buy, sell }) => [
    ...buy.map((broker, idx) => toRawRecord(spec.ticker, date, 'buy', idx + 1, broker, spec.lotSize)),
    ...sell.map((broker, idx) => toRawRecord(spec.ticker, date, 'sell', idx + 1, broker, spec.lotSize)),
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

  const bars = spec.bars;
  const pricesDocument = buildPricesDocument(
    spec.ticker,
    pricesVersion('prices', spec.ticker),
    `sample://fixture/${spec.ticker.toLowerCase()}/prices`,
    bars,
    spec.market,
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

function toRawRecord(ticker: string, date: string, side: BrokerSide, rank: number, broker: BrokerSpec, lotSize = 100): RawRecord {
  // The value column keeps its legacy name; it is in the instrument's own currency.
  const valueIdr = broker.lots * lotSize * broker.price;
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
      sessions.push({ date: current, ticker: spec.ticker, status: 'missing', reason: spec.uncapturedReason, rowCounts });
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
    if (dayRows.length > spec.rowsPerSide) issues.push(`${key} has more than ${spec.rowsPerSide} accepted rows`);
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
