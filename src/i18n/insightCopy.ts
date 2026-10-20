import type { Locale } from '../engine/context';
import { leadingGroups, type FlowSummary, type InsightGroup } from '../engine/insights';
import { formatSessionDate, intlLocale } from './index';

// The sentences built from broker-flow totals: the one-line headline on the
// Brief and Stocks lists, the holding line on My Holdings, and the "What could
// be interpreted?" reading on the analysis page. Every number in them comes
// from FlowSummary, a price change or a filed report; none is invented, and no
// sentence tells anyone to buy or sell.

export interface HealthSignal {
  equityPositive: boolean;
  equityImproving: boolean;
  coreProfit: boolean;
  oneOff: boolean;
}

export interface InterpretationInput {
  summary: FlowSummary;
  priceChange: number | null;
  health: HealthSignal | null;
}

const GROUP: Record<Locale, Record<InsightGroup, string>> = {
  en: { app_facing: 'Retail app brokers', institution_facing: 'Institutional brokers', other_mixed: 'Other / mixed brokers' },
  'zh-CN': { app_facing: '零售App券商', institution_facing: '机构券商', other_mixed: '其他/混合券商' },
};

function lots(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(value));
}

function rupiah(value: number, locale: Locale): string {
  return `Rp${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value)}`;
}

function percent(value: number, locale: Locale): string {
  const formatted = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(Math.abs(value) * 100);
  return `${value >= 0 ? '+' : '−'}${formatted}%`;
}

function lower(text: string, locale: Locale): string {
  return locale === 'zh-CN' ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

// Who bought and who sold since the window start, in one line.
export function flowHeadline(summary: FlowSummary, locale: Locale): string {
  const { buyer, seller } = leadingGroups(summary.nets);
  const since = formatSessionDate(summary.start, locale);
  const g = GROUP[locale];
  if (buyer === null || seller === null) {
    return { en: `Since ${since}: broker flows roughly balanced.`, 'zh-CN': `自 ${since} 起：券商资金流大致平衡。` }[locale];
  }
  const b = lots(summary.nets[buyer], locale);
  const s = lots(summary.nets[seller], locale);
  return {
    en: `Since ${since}: ${lower(g[buyer], locale)} bought ${b} lots, ${lower(g[seller], locale)} sold ${s}.`,
    'zh-CN': `自 ${since} 起：${g[buyer]}净买入 ${b} 手，${g[seller]}净卖出 ${s} 手。`,
  }[locale];
}

const GROUP_FULL: Record<Locale, Record<InsightGroup, string>> = {
  en: { app_facing: 'Retail app brokers', institution_facing: 'Institutional brokers', other_mixed: 'Other and mixed brokers' },
  'zh-CN': { app_facing: '零售App券商', institution_facing: '机构券商', other_mixed: '其他及混合券商' },
};

export interface HeadlinePrice {
  // Latest close and the formatted price text helpers; null when unknown.
  close: number | null;
  windowStartClose: number | null;
  format: (value: number) => string;
}

// For a stock the user owns, in plain words: who holds it with you, how many
// lots, at what average buying price, what that price means against the latest
// close, and what they did in the latest session.
export function holdingHeadline(summary: FlowSummary, locale: Locale, price: HeadlinePrice | null = null): string {
  const { buyer } = leadingGroups(summary.nets);
  const g = GROUP_FULL[locale];
  if (buyer === null) {
    return { en: 'No broker group has built up a net position yet.', 'zh-CN': '尚无券商分组建立净持仓。' }[locale];
  }
  const net = lots(summary.nets[buyer], locale);
  const average = summary.buyAverage[buyer];
  const day = formatSessionDate(summary.end, locale);
  const latest = summary.lastNets[buyer];
  const act =
    latest > 0
      ? { en: `kept buying on ${day}`, 'zh-CN': `${day} 继续买入` }
      : latest < 0
        ? { en: `trimmed on ${day}`, 'zh-CN': `${day} 减持` }
        : { en: `held steady on ${day}`, 'zh-CN': `${day} 持仓不变` };

  if (average === null) {
    return {
      en: `${g[buyer]} still hold about ${net} lots and ${act.en}.`,
      'zh-CN': `${g[buyer]}仍持有约 ${net} 手，${act['zh-CN']}。`,
    }[locale];
  }

  const avg = price !== null ? price.format(average) : rupiah(average, locale);
  let state: 'gain' | 'loss' | 'even' | null = null;
  if (price !== null && price.close !== null && average > 0) {
    const gap = price.close / average - 1;
    state = gap > 0.02 ? 'gain' : gap < -0.02 ? 'loss' : 'even';
  }
  const implication =
    state === 'gain'
      ? { en: 'so they are sitting on a gain with you', 'zh-CN': '所以他们和您一样处于盈利' }
      : state === 'loss'
        ? { en: 'so they are sitting on a loss', 'zh-CN': '所以他们目前处于亏损' }
        : state === 'even'
          ? { en: 'so they are near break-even', 'zh-CN': '所以他们接近盈亏平衡' }
          : null;
  const first = {
    en: `${g[buyer]} still hold about ${net} lots, bought at around ${avg}`,
    'zh-CN': `${g[buyer]}仍持有约 ${net} 手，买入均价约 ${avg}`,
  }[locale];
  const mid = implication === null ? '' : { en: `, ${implication.en}`, 'zh-CN': `，${implication['zh-CN']}` }[locale];
  const tail = { en: ` and ${act.en}.`, 'zh-CN': `，${act['zh-CN']}。` }[locale];
  return `${first}${mid}${tail}`;
}

// For a stock on the watchlist: who bought and sold since the window start,
// plus a lean read from the last five sessions and the price move. It describes
// what the flow suggests; it never tells anyone what to do.
export function watchlistHeadline(summary: FlowSummary, locale: Locale, price: HeadlinePrice | null = null): string {
  const instRecent = summary.recentNets.institution_facing;
  const appRecent = summary.recentNets.app_facing;
  const instLong = summary.nets.institution_facing;

  type Lean = 'up-squeeze' | 'fading' | 'broad-up' | 'broad-down' | 'mixed';
  const lean: Lean =
    instRecent > 0 && appRecent < 0 ? 'up-squeeze'
    : instRecent < 0 && appRecent > 0 ? 'fading'
    : instRecent > 0 && appRecent >= 0 ? 'broad-up'
    : instRecent < 0 && appRecent <= 0 ? 'broad-down'
    : 'mixed';

  const sustained = instLong > 0;
  const read = {
    'up-squeeze': {
      en: sustained
        ? 'Institutions have kept buying over the last five sessions while retail apps sold: the pressure is building upward.'
        : 'Institutions turned to buying over the last five sessions while retail apps sold: the pressure may be starting to build upward.',
      'zh-CN': sustained
        ? '机构券商近五个时段持续买入，零售App券商在卖出：上行压力正在积聚。'
        : '机构券商近五个时段转为买入，零售App券商在卖出：上行压力可能正在形成。',
    },
    fading: {
      en: sustained
        ? 'Big holders are trimming into retail buying: momentum may be fading.'
        : 'Big holders are selling into retail buying: the lean is downward.',
      'zh-CN': sustained
        ? '大户在散户买入时减持：动能可能在减弱。'
        : '大户在散户买入时卖出：偏向下行。',
    },
    'broad-up': {
      en: 'Institutions and retail apps are both buying lately: demand looks broad, with a lean upward.',
      'zh-CN': '近期机构券商与零售App券商都在买入：需求面较广，偏向上行。',
    },
    'broad-down': {
      en: 'Institutions and retail apps are both selling lately: few buyers are stepping in, with a lean downward.',
      'zh-CN': '近期机构券商与零售App券商都在卖出：接盘者少，偏向下行。',
    },
    mixed: {
      en: 'Institutions have been quiet lately, so there is no clear lean yet.',
      'zh-CN': '近期机构券商较为平静，暂无明确倾向。',
    },
  }[lean][locale];

  let move = '';
  if (price !== null && price.close !== null && price.windowStartClose !== null && price.windowStartClose > 0) {
    const change = price.close / price.windowStartClose - 1;
    const upLean = lean === 'up-squeeze' || lean === 'broad-up';
    const downLean = lean === 'fading' || lean === 'broad-down';
    if (upLean && change < -0.02) move = { en: ' The price has not followed yet.', 'zh-CN': ' 价格尚未跟上。' }[locale];
    else if (downLean && change > 0.02) move = { en: ' The price has not followed yet.', 'zh-CN': ' 价格尚未跟上。' }[locale];
    else if ((upLean && change > 0.02) || (downLean && change < -0.02)) move = { en: ' The price is moving the same way.', 'zh-CN': ' 价格走势与之一致。' }[locale];
  }
  return `${read}${move}`;
}

// The reading under "What could be interpreted?": who absorbed whose shares,
// whether that held lately, how the price moved with it, and what the latest
// report adds. Hedged, never advice.
export function interpretation({ summary, priceChange, health }: InterpretationInput, locale: Locale): string[] {
  const g = GROUP[locale];
  const since = formatSessionDate(summary.start, locale);
  const { buyer, seller } = leadingGroups(summary.nets);
  const lines: string[] = [];

  if (buyer !== null && seller !== null) {
    const b = lots(summary.nets[buyer], locale);
    const s = lots(summary.nets[seller], locale);
    lines.push(
      {
        en: `${g[buyer]} took in most of what ${lower(g[seller], locale)} sold since ${since}: ${b} lots bought against ${s} sold.`,
        'zh-CN': `自 ${since} 起，${g[buyer]}承接了${g[seller]}卖出的大部分筹码：买入 ${b} 手，对应卖出 ${s} 手。`,
      }[locale],
    );
    const recent = summary.recentNets[buyer];
    lines.push(
      recent > 0
        ? { en: 'They were still net buyers over the last five sessions.', 'zh-CN': '最近五个时段他们仍为净买入。' }[locale]
        : { en: `Over the last five sessions they turned to selling (${lots(recent, locale)} lots), so the build-up may be slowing.`, 'zh-CN': `最近五个时段他们转为净卖出（${lots(recent, locale)} 手），积累可能放缓。` }[locale],
    );
  } else {
    lines.push({ en: `Broker flows since ${since} roughly balance, so no group stands out.`, 'zh-CN': `自 ${since} 起券商资金流大致平衡，没有突出的分组。` }[locale]);
  }

  if (priceChange !== null) {
    const move = percent(priceChange, locale);
    const inst = summary.nets.institution_facing;
    const app = summary.nets.app_facing;
    const read =
      inst > 0 && priceChange > 0
        ? { en: 'A rising price with institutions buying fits accumulation by larger investors.', 'zh-CN': '价格上涨且机构券商买入，符合大资金积累的特征。' }
        : inst < 0 && app > 0
          ? { en: 'Institutions selling to retail apps can mean larger holders are handing shares over.', 'zh-CN': '机构券商卖给零售App券商，可能意味着大户在派发筹码。' }
          : app > 0 && priceChange < 0
            ? { en: 'Retail apps buying into a falling price is a weaker sign than institutional buying.', 'zh-CN': '零售App券商在下跌中买入，信号弱于机构券商买入。' }
            : { en: 'Flow and price do not point the same way, so read this with care.', 'zh-CN': '资金流与价格方向不一致，需谨慎解读。' };
    lines.push(
      {
        en: `The price moved ${move} over the same period. ${read.en}`,
        'zh-CN': `同期价格变动 ${move}。${read['zh-CN']}`,
      }[locale],
    );
  }

  if (health !== null) {
    const equity = health.equityPositive
      ? health.equityImproving
        ? { en: 'positive and growing equity', 'zh-CN': '权益为正且增长' }
        : { en: 'positive but shrinking equity', 'zh-CN': '权益为正但缩水' }
      : health.equityImproving
        ? { en: 'equity still negative but improving', 'zh-CN': '权益仍为负但在改善' }
        : { en: 'negative equity', 'zh-CN': '权益为负' };
    const profit = health.coreProfit
      ? { en: 'a profit without one-offs', 'zh-CN': '扣除一次性项目后盈利' }
      : health.oneOff
        ? { en: 'a loss once the one-off gain is removed', 'zh-CN': '扣除一次性收益后亏损' }
        : { en: 'a loss', 'zh-CN': '亏损' };
    lines.push(
      {
        en: `The latest report shows ${equity.en} and ${profit.en}, so the flow story needs the business to back it up.`,
        'zh-CN': `最新报告显示${equity['zh-CN']}，且${profit['zh-CN']}，资金流的故事仍需业务基本面支撑。`,
      }[locale],
    );
  }

  lines.push({ en: 'This reads the visible broker data only. It is not advice.', 'zh-CN': '以上仅基于可见的券商数据，不构成建议。' }[locale]);
  return lines;
}
