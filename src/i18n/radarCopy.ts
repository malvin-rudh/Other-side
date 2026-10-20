// Copy for the Live Radar screen, the navigation entry and the score checks.
// Descriptive only: the radar ranks how strongly the layers line up. It never
// says what to do.

import type { Locale } from '../engine/context';
import type { PillarId, RadarLabel } from '../engine/radarScore';

export interface RadarCopy {
  nav: string;
  title: string;
  explainer: string;
  emptyRadar: string;
  pickedTitle: string;
  searchTitle: string;
  searchResults: (count: number) => string;
  forDate: (date: string) => string;
  searchLabel: string;
  searchPlaceholder: string;
  noMatch: (query: string) => string;
  loading: string;
  error: string;
  scoreLabel: string;
  closeLabel: string;
  view: string;
  cardLabel: (ticker: string, name: string, label: string, score: number) => string;
  sweepLabel: string;
  blipLabel: (ticker: string, label: string, score: number) => string;
  labels: Record<RadarLabel, string>;
  legend: Record<'accumulating' | 'mixed' | 'leaving', string>;
  pillars: Record<PillarId, string>;
  checks: Record<string, string>;
  grades: Record<string, string>;
}

const EN: RadarCopy = {
  nav: 'Live Radar',
  title: 'Live Radar',
  explainer: 'Updates on the stocks where broker flow, company health and news line up, or where big holders start to leave.',
  emptyRadar: 'No stock stands out today. Search below to look at any stock.',
  pickedTitle: 'Stocks worth a look',
  searchTitle: 'Search',
  searchResults: (count) => `${count} matching ${count === 1 ? 'stock' : 'stocks'}`,
  forDate: (date) => `Radar for ${date}`,
  searchLabel: 'Search the radar',
  searchPlaceholder: 'Search by ticker or company name',
  noMatch: (query) => `No stock matches "${query}".`,
  loading: 'Reading the broker data...',
  error: 'The radar could not load some stocks.',
  scoreLabel: 'Radar score',
  closeLabel: 'Close',
  view: 'View analysis',
  cardLabel: (ticker, name, label, score) => `View analysis for ${ticker}, ${name}. ${label}. Radar score ${score} out of 100.`,
  sweepLabel: 'Radar animation. Stocks appear as the sweep passes. Select one to open it.',
  blipLabel: (ticker, label, score) => `Open ${ticker}, ${label}, score ${score}`,
  labels: { accumulating: 'Accumulating', leaving: 'Leaving', mixed: 'Mixed', noSignal: 'No signal' },
  legend: {
    accumulating: 'Big brokers keep buying, backed by company health and news.',
    mixed: 'The signals point different ways. No clear side yet.',
    leaving: 'Big brokers are selling, or handing shares to retail apps.',
  },
  pillars: { transactions: 'Transactions', health: 'Company health', events: 'Events' },
  checks: {
    windowNet: 'Institution-facing brokers net bought since the window start',
    recentNet: 'They net bought over the last 5 sessions',
    persistence: 'They net bought on several of the last 5 sessions',
    concentration: 'Net buying is spread across brokers',
    roundTrip: 'Net buyers did not sell back within 3 sessions',
    handover: 'No handover from institution-facing to app-facing brokers',
    equityPositive: 'Equity is a solid share of assets',
    equityUp: 'Equity grew since the prior balance date',
    debtDown: 'Loans and related-party debt fell',
    coreProfit: 'Profit without one-offs, as a share of revenue',
    operatingCash: 'Operating cash flow, as a share of revenue',
    shortTermCover: 'Current assets cover current liabilities',
    story: 'Latest story event is fresh',
    healthEvent: 'Latest health event is fresh',
  },
  grades: {
    windowNet: 'Institution net lots as a share of all lots bought in the window. 0% earns 0, 60% or more earns full points.',
    recentNet: 'The same share over the last 5 sessions. 0% earns 0, 50% or more earns full points.',
    persistence: 'Sessions out of the last 5 with institution net buying. 0 or 1 earns 0, then 2 earns 5, 3 earns 11, 4 earns 17, 5 earns 20.',
    concentration: 'Largest net buyer as a share of all net buying. 60% or more earns 0, 20% or less earns full points.',
    roundTrip: 'Share of net buying from brokers who sold back over 80% within 3 sessions. 50% or more earns 0, none earns full points.',
    handover: 'Earns 0 if institutions are net sellers or handed over to app-facing brokers. Otherwise it falls as app-facing net buying grows against institution net buying: none earns full points, equal or more earns 0.',
    equityPositive: 'Equity divided by total assets. 0% earns 0, 60% or more earns full points. Negative equity earns 0.',
    equityUp: 'Equity growth since the prior balance date. 0% earns 0, 15% or more earns full points.',
    debtDown: 'Change in loans and related-party debt. Up 20% earns 0, unchanged earns 40%, down 30% or more earns full points. No debt earns full points.',
    coreProfit: 'Profit without one-offs divided by revenue. 0% earns 0, 15% or more earns full points.',
    operatingCash: 'Operating cash flow divided by revenue. 0% earns 0, 20% or more earns full points.',
    shortTermCover: 'Current assets divided by current liabilities. 0.8 earns 0, 2.5 or more earns full points.',
    story: 'Points fall in a straight line with the age of the latest event: published today earns 60, 60 days old earns 0.',
    healthEvent: 'The same straight-line fade: published today earns 40, 60 days old earns 0.',
  },
};

const ZH: RadarCopy = {
  nav: '实时雷达',
  title: '实时雷达',
  explainer: '持续更新券商流向、公司健康和消息面相互吻合的股票，或大户开始离场的股票。',
  emptyRadar: '今天没有特别突出的股票。可在下方搜索查看任意股票。',
  pickedTitle: '值得关注的股票',
  searchTitle: '搜索',
  searchResults: (count) => `${count} 只匹配的股票`,
  forDate: (date) => `${date} 的雷达`,
  searchLabel: '搜索雷达',
  searchPlaceholder: '按代码或公司名称搜索',
  noMatch: (query) => `没有与“${query}”匹配的股票。`,
  loading: '正在读取券商数据...',
  error: '雷达无法加载部分股票。',
  scoreLabel: '雷达分数',
  closeLabel: '收盘价',
  view: '查看分析',
  cardLabel: (ticker, name, label, score) => `查看 ${ticker}（${name}）的分析。${label}。雷达分数 ${score}，满分 100。`,
  sweepLabel: '雷达动画。扫描经过时股票会出现。选择一只即可打开。',
  blipLabel: (ticker, label, score) => `打开 ${ticker}，${label}，分数 ${score}`,
  labels: { accumulating: '吸筹', leaving: '离场', mixed: '混合', noSignal: '无信号' },
  legend: {
    accumulating: '大型券商持续买入，并有公司健康和新闻支撑。',
    mixed: '各项信号方向不一，暂无明确的一方。',
    leaving: '大型券商在卖出，或把股票转给零售 App。',
  },
  pillars: { transactions: '交易', health: '公司健康', events: '事件' },
  checks: {
    windowNet: '机构侧券商自窗口起始日起净买入',
    recentNet: '最近 5 个交易日净买入',
    persistence: '最近 5 个交易日中多天净买入',
    concentration: '净买入分散在多家券商',
    roundTrip: '净买方没有在 3 个交易日内回吐',
    handover: '没有从机构侧向应用侧券商的交接',
    equityPositive: '权益占资产的比例稳固',
    equityUp: '权益较上一个资产负债表日增长',
    debtDown: '银行贷款与关联方债务下降',
    coreProfit: '剔除一次性项目后的利润占收入的比例',
    operatingCash: '经营现金流占收入的比例',
    shortTermCover: '流动资产可覆盖流动负债',
    story: '最新的消息事件够新',
    healthEvent: '最新的健康事件够新',
  },
  grades: {
    windowNet: '机构净买入手数占窗口内全部买入手数的比例。0% 得 0 分，60% 及以上得满分。',
    recentNet: '最近 5 个交易日的同一比例。0% 得 0 分，50% 及以上得满分。',
    persistence: '最近 5 个交易日中机构净买入的天数。0 或 1 天得 0 分，2 天得 5 分，3 天得 11 分，4 天得 17 分，5 天得 20 分。',
    concentration: '最大净买方占全部净买入的比例。60% 及以上得 0 分，20% 及以下得满分。',
    roundTrip: '在 3 个交易日内回吐超过 80% 的券商，其净买入占全部净买入的比例。50% 及以上得 0 分，为零得满分。',
    handover: '机构净卖出或交接给应用侧券商，得 0 分。否则，随应用侧净买入相对机构净买入增大而下降：没有则得满分，相等或更多得 0 分。',
    equityPositive: '权益除以总资产。0% 得 0 分，60% 及以上得满分。权益为负得 0 分。',
    equityUp: '权益较上一个资产负债表日的增长。0% 得 0 分，15% 及以上得满分。',
    debtDown: '银行贷款与关联方债务的变化。上升 20% 得 0 分，持平得 40%，下降 30% 及以上得满分。无债务得满分。',
    coreProfit: '剔除一次性项目后的利润除以收入。0% 得 0 分，15% 及以上得满分。',
    operatingCash: '经营现金流除以收入。0% 得 0 分，20% 及以上得满分。',
    shortTermCover: '流动资产除以流动负债。0.8 得 0 分，2.5 及以上得满分。',
    story: '分数随最新事件的天数按直线下降：今天发布得 60 分，满 60 天得 0 分。',
    healthEvent: '同样的直线衰减：今天发布得 40 分，满 60 天得 0 分。',
  },
};

const COPY: Record<Locale, RadarCopy> = { en: EN, 'zh-CN': ZH };

export function radarCopy(locale: Locale): RadarCopy {
  return COPY[locale];
}
