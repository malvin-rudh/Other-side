import type { Locale } from '../engine/context';
import type { EvidenceFocus } from '../engine/evidence';
import { leadingGroups, type InsightGroup } from '../engine/insights';
import { formatShortDate, intlLocale } from './index';

// Text for the stock analysis page: the conclusion under the price, the short
// "What was observed?" facts, the "What could be interpreted?" implications and
// the labels of the redesigned cards. Every number comes from the data passed
// in; no sentence tells anyone to buy or sell. Bilingual: en, zh-CN.

export interface Seg {
  text: string;
  factId?: string;
  // Which group or broker the number belongs to, so its evidence adds up to it.
  focus?: EvidenceFocus;
  tone?: 'buy' | 'sell';
}

export interface HealthRead {
  equityPositive: boolean;
  equityImproving: boolean;
  coreProfit: boolean;
  oneOff: boolean;
}

type Nets = Record<InsightGroup, number>;

export interface AnalysisInput {
  // First session of the window and the selected session.
  since: string;
  nets: Nets;
  netFacts: Record<InsightGroup, string>;
  recentNets: Nets;
  topBuyer: { code: string; lots: number; factId: string } | null;
  topSeller: { code: string; lots: number; factId: string } | null;
  // Price change over the window as a fraction, and the close as text.
  priceChange: number | null;
  closeText: string | null;
  health: HealthRead | null;
}

type Text3 = Record<Locale, string>;

const GROUP: Record<Locale, Record<InsightGroup, string>> = {
  en: { app_facing: 'retail app brokers', institution_facing: 'institutional brokers', other_mixed: 'other / mixed brokers' },
  'zh-CN': { app_facing: '零售App券商', institution_facing: '机构券商', other_mixed: '其他/混合券商' },
};

function lotsText(value: number, locale: Locale): string {
  return new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(value));
}

function percentText(value: number, locale: Locale): string {
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 }).format(Math.abs(value) * 100)}%`;
}

function cap(text: string, locale: Locale): string {
  return locale === 'zh-CN' ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

function equityClause(h: HealthRead, locale: Locale): string {
  const key = h.equityPositive ? (h.equityImproving ? 'pi' : 'pf') : h.equityImproving ? 'ni' : 'n';
  const text: Record<string, Text3> = {
    pi: { en: 'positive equity', 'zh-CN': '权益为正' },
    pf: { en: 'positive but falling equity', 'zh-CN': '权益为正但在下降' },
    ni: { en: 'negative but improving equity', 'zh-CN': '权益为负但在改善' },
    n: { en: 'negative equity', 'zh-CN': '权益为负' },
  };
  return text[key]![locale];
}

function profitClause(h: HealthRead, locale: Locale): string {
  if (h.oneOff) {
    return h.coreProfit
      ? { en: 'a profit, partly from a one-off gain', 'zh-CN': '盈利，部分来自一次性收益' }[locale]
      : { en: 'a loss once a one-off gain is removed', 'zh-CN': '扣除一次性收益后亏损' }[locale];
  }
  return h.coreProfit
    ? { en: 'a profit', 'zh-CN': '实现盈利' }[locale]
    : { en: 'a loss', 'zh-CN': '出现亏损' }[locale];
}

// Under the price: who is accumulating or leaving, the price move and the
// health read, in under 50 words.
export function conclusion(input: AnalysisInput, locale: Locale): string {
  const { buyer, seller } = leadingGroups(input.nets);
  const g = GROUP[locale];
  const since = formatShortDate(input.since, locale);
  const parts: string[] = [];

  if (buyer !== null && seller !== null) {
    const b = lotsText(input.nets[buyer], locale);
    const s = lotsText(input.nets[seller], locale);
    parts.push(
      {
        en: `Since ${since}, ${g[buyer]} net bought ${b} lots and ${g[seller]} net sold ${s}.`,
        'zh-CN': `自${since}起，${g[buyer]}净买入${b}手，${g[seller]}净卖出${s}手。`,
      }[locale],
    );
  } else {
    parts.push(
      {
        en: `Broker flows have been roughly balanced since ${since}.`,
        'zh-CN': `自${since}起券商资金流大致平衡。`,
      }[locale],
    );
  }

  if (input.priceChange !== null) {
    const pct = percentText(input.priceChange, locale);
    const up = input.priceChange >= 0;
    parts.push(
      {
        en: `The price is ${up ? 'up' : 'down'} ${pct} over the period.`,
        'zh-CN': `期间股价${up ? '上涨' : '下跌'}${pct}。`,
      }[locale],
    );
  }

  if (input.health !== null) {
    const e = equityClause(input.health, locale);
    const p = profitClause(input.health, locale);
    parts.push(
      {
        en: `The latest report shows ${e} and ${p}.`,
        'zh-CN': `最新财报显示${e}，${p}。`,
      }[locale],
    );
  }

  return parts.join(' ');
}

const sep = (locale: Locale) => (locale === 'zh-CN' ? '' : ' ');

// The 3 to 5 facts that matter, each a list of text pieces; numbers carry the
// evidence fact id where the data has one.
export function observedBullets(input: AnalysisInput, locale: Locale): Seg[][] {
  const out: Seg[][] = [];
  const g = GROUP[locale];
  const since = formatShortDate(input.since, locale);
  const { buyer, seller } = leadingGroups(input.nets);

  if (buyer !== null && seller !== null) {
    const bTxt = `${lotsText(input.nets[buyer], locale)}${sep(locale)}${{ en: 'lots', 'zh-CN': '手' }[locale]}`;
    const sTxt = `${lotsText(input.nets[seller], locale)}${sep(locale)}${{ en: 'lots', 'zh-CN': '手' }[locale]}`;
    const pre = {
      en: [`${cap(g[buyer], locale)} net bought `, ` since ${since}. ${cap(g[seller], locale)} net sold `, '.'],
      'zh-CN': [`${g[buyer]}自${since}起净买入`, `。${g[seller]}净卖出`, '。'],
    }[locale];
    out.push([
      { text: pre[0]! },
      { text: bTxt, factId: input.netFacts[buyer], focus: { group: buyer }, tone: 'buy' },
      { text: pre[1]! },
      { text: sTxt, factId: input.netFacts[seller], focus: { group: seller }, tone: 'sell' },
      { text: pre[2]! },
    ]);
  } else {
    out.push([
      {
        text: {
          en: `Group flows have been roughly balanced since ${since}.`,
          'zh-CN': `自${since}起各类券商资金流大致平衡。`,
        }[locale],
      },
    ]);
  }

  if (input.topBuyer !== null && input.topSeller !== null) {
    const fmt = (lots: number) => `${lots > 0 ? '+' : '−'}${lotsText(lots, locale)}`;
    const w = {
      en: ['Largest net buyer: ', '. Largest net seller: ', '.'],
      'zh-CN': ['最大净买入券商：', '。最大净卖出券商：', '。'],
    }[locale];
    out.push([
      { text: w[0]! },
      { text: `${input.topBuyer.code} ${fmt(input.topBuyer.lots)}`, factId: input.topBuyer.factId, focus: { brokerCode: input.topBuyer.code }, tone: 'buy' },
      { text: w[1]! },
      { text: `${input.topSeller.code} ${fmt(input.topSeller.lots)}`, factId: input.topSeller.factId, focus: { brokerCode: input.topSeller.code }, tone: 'sell' },
      { text: w[2]! },
    ]);
  }

  const recent = leadingGroups(input.recentNets);
  if (recent.buyer !== null && recent.seller !== null) {
    const same = recent.buyer === buyer && recent.seller === seller;
    out.push([
      {
        text: same
          ? {
              en: 'The same two groups lead in the last 5 sessions.',
              'zh-CN': '最近5个交易日由同样两类券商主导。',
            }[locale]
          : {
              en: `In the last 5 sessions, ${g[recent.buyer]} net bought most and ${g[recent.seller]} net sold most.`,
              'zh-CN': `最近5个交易日，${g[recent.buyer]}净买入最多，${g[recent.seller]}净卖出最多。`,
            }[locale],
      },
    ]);
  }

  if (input.priceChange !== null) {
    const pct = percentText(input.priceChange, locale);
    const up = input.priceChange >= 0;
    const close = input.closeText;
    out.push([
      {
        text: {
          en: `The price is ${up ? 'up' : 'down'} ${pct} over the period${close ? `, at ${close}` : ''}.`,
          'zh-CN': `期间股价${up ? '上涨' : '下跌'}${pct}${close ? `，收于${close}` : ''}。`,
        }[locale],
      },
    ]);
  }

  if (input.health !== null) {
    const e = equityClause(input.health, locale);
    const p = profitClause(input.health, locale);
    out.push([
      {
        text: {
          en: `The latest report shows ${e} and ${p}.`,
          'zh-CN': `最新财报显示${e}，${p}。`,
        }[locale],
      },
    ]);
  }
  return out.slice(0, 5);
}

// What the observations could mean, what would confirm them and what would
// weaken them. One short hedged paragraph.
export function implications(input: AnalysisInput, locale: Locale): string {
  const out: string[] = [];
  const g = GROUP[locale];
  const { buyer, seller } = leadingGroups(input.nets);

  if (buyer !== null) {
    out.push(
      {
        en: `${cap(g[buyer], locale)} buying more than other groups could mean accumulation by that type of broker. More sessions of net buying would support this. A switch to net selling would weaken it.`,
        'zh-CN': `${g[buyer]}的买入多于其他类别，可能意味着这类券商在吸筹。更多交易日的净买入会支持这一看法，转为净卖出则会削弱它。`,
      }[locale],
    );
  } else if (seller !== null) {
    out.push(
      {
        en: `${cap(g[seller], locale)} selling with no group buying more could mean a gradual exit. More net selling would support this. A move back to buying would weaken it.`,
        'zh-CN': `${g[seller]}在卖出而没有哪类券商更多买入，可能意味着逐步退出。继续净卖出会支持这一看法，转为买入则会削弱它。`,
      }[locale],
    );
  }

  if (input.priceChange !== null && buyer !== null) {
    const up = input.priceChange >= 0;
    out.push(
      up
        ? {
            en: `The price rose while ${g[buyer]} bought, which fits demand-led buying. If the price falls while the same buying continues, that read gets weaker.`,
            'zh-CN': `${g[buyer]}买入的同时股价上涨，与需求推动的买入相符。若同样的买入持续而股价下跌，这一看法会减弱。`,
          }[locale]
        : {
            en: `The price fell even though ${g[buyer]} bought. Selling from other brokers outside the visible list could be absorbing it. A price recovery would support the buying read.`,
            'zh-CN': `尽管${g[buyer]}在买入，股价仍下跌。可见名单之外的其他券商可能在抛售。股价回升会支持买入这一看法。`,
          }[locale],
    );
  }

  if (input.health !== null) {
    out.push(
      input.health.oneOff
        ? {
            en: 'A one-off gain can lift profit without lasting. The next report would show whether profit holds without it.',
            'zh-CN': '一次性收益可以推高利润，但未必持续。下一份财报会显示没有它时利润能否保持。',
          }[locale]
        : {
            en: 'The next report would show whether the financial trend continues or turns.',
            'zh-CN': '下一份财报会显示财务趋势是延续还是转向。',
          }[locale],
    );
  }
  return out.slice(0, 4).join(sep(locale));
}

// Labels for the redesigned cards.
export function ui(locale: Locale) {
  const x = <T,>(en: T, zh: T): T => (locale === 'zh-CN' ? zh : en);
  return {
    addWatchlist: x('Add to Watchlist', '加入自选'),
    addPortfolio: x('Add to Portfolio', '加入投资组合'),
    addedWatchlist: x('Added to Watchlist', '已加入自选'),
    addedPortfolio: x('Added to Portfolio', '已加入投资组合'),
    conclusionLabel: x('Summary', '小结'),

    brokerAdd: x('+ Add broker', '+ 添加券商'),
    brokerMax: x('Maximum 3 brokers. Remove one to add another.', '最多3家券商。移除一家后才能添加。'),
    brokerSubtitle: x(
      'Cumulative net lots per broker, in the visible sample. Above zero means net bought, below zero net sold.',
      '可见样本中各券商的累计净手数。零线以上为净买入，以下为净卖出。',
    ),
    brokerCarryNote: x(
      'On a day a broker is not in the visible top 9, its line carries the last value forward.',
      '某天券商不在可见的前9名时，其折线沿用上一个累计值。',
    ),
    brokerTotal: x('total', '合计'),
    brokerRemove: (code: string) => x(`Remove ${code}`, `移除 ${code}`),
    brokerChartAria: (count: number, sessions: number) =>
      x(
        `Cumulative net lots for ${count} brokers over ${sessions} sessions. Days outside the visible top 9 carry the last value forward.`,
        `${count}家券商在${sessions}个交易日的累计净手数。不在可见前9名的日子沿用上一个值。`,
      ),

    sankeyCaption: (date: string) =>
      x(`Lots sold (left) and bought (right) on ${date}`, `${date} 卖出（左）与买入（右）的手数`),
    sankeyNetTitle: x('Net by group on this day', '当日各类券商净额'),
    sankeyEmpty: x('No broker rows for this session.', '该交易日没有券商数据。'),
    sankeyAria: (date: string) =>
      x(`Flow of lots from selling broker groups to buying broker groups on ${date}`, `${date} 从卖方券商类别到买方券商类别的手数流向`),
    sold: x('Sold', '卖出'),
    bought: x('Bought', '买入'),

    healthChartTitle: x('Before and now', '之前与现在'),
    healthPrevious: x('Previous', '之前'),
    healthLatest: x('Latest', '最新'),
    healthFromTo: (before: string, now: string) => x(`from ${before} to ${now}`, `从 ${before} 到 ${now}`),
    healthRevenue: x('Revenue', '营收'),
    // "+12% from Q1": the change and what it is measured against.
    healthChange: (change: string, base: string) => x(`${change} from ${base}`, `较${base} ${change}`),
    implicationsTitle: x('Implications', '影响'),
    flowTitle: (date: string) => x(`Flow on ${date}`, `${date} 资金流`),
    flowSubtitle: x(
      'The selected day only. Same numbers as the Session broker flow.',
      '仅限所选交易日，数字与“时段券商资金流”一致。',
    ),
  };
}
