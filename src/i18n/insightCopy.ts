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
  id: { app_facing: 'Broker aplikasi ritel', institution_facing: 'Broker institusional', other_mixed: 'Broker lain / campuran' },
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
    return { en: `Since ${since}: broker flows roughly balanced.`, id: `Sejak ${since}: arus broker relatif seimbang.`, 'zh-CN': `自 ${since} 起：券商资金流大致平衡。` }[locale];
  }
  const b = lots(summary.nets[buyer], locale);
  const s = lots(summary.nets[seller], locale);
  return {
    en: `Since ${since}: ${lower(g[buyer], locale)} bought ${b} lots, ${lower(g[seller], locale)} sold ${s}.`,
    id: `Sejak ${since}: ${lower(g[buyer], locale)} membeli ${b} lot, ${lower(g[seller], locale)} menjual ${s} lot.`,
    'zh-CN': `自 ${since} 起：${g[buyer]}净买入 ${b} 手，${g[seller]}净卖出 ${s} 手。`,
  }[locale];
}

// For a stock the user owns: who is holding it with them, at what average
// price, and whether that changed in the latest session.
export function holdingHeadline(summary: FlowSummary, locale: Locale): string {
  const { buyer } = leadingGroups(summary.nets);
  const g = GROUP[locale];
  if (buyer === null) {
    return { en: 'No broker group has built up a net position yet.', id: 'Belum ada kelompok broker yang membangun posisi bersih.', 'zh-CN': '尚无券商分组建立净持仓。' }[locale];
  }
  const net = lots(summary.nets[buyer], locale);
  const average = summary.buyAverage[buyer];
  const at = average === null ? '' : { en: ` at about ${rupiah(average, locale)}`, id: ` di sekitar ${rupiah(average, locale)}`, 'zh-CN': `，均价约 ${rupiah(average, locale)}` }[locale];
  const day = formatSessionDate(summary.end, locale);
  const latest = summary.lastNets[buyer];
  const trend =
    latest > 0
      ? { en: `still adding on ${day}`, id: `masih menambah pada ${day}`, 'zh-CN': `${day} 仍在加仓` }
      : latest < 0
        ? { en: `trimming on ${day}`, id: `mengurangi pada ${day}`, 'zh-CN': `${day} 开始减仓` }
        : { en: `unchanged on ${day}`, id: `tidak berubah pada ${day}`, 'zh-CN': `${day} 无变化` };
  return {
    en: `${g[buyer]} hold it with you: +${net} lots${at}, ${trend.en}.`,
    id: `${g[buyer]} ikut memegang: +${net} lot${at}, ${trend.id}.`,
    'zh-CN': `${g[buyer]}与您同持：净 +${net} 手${at}，${trend['zh-CN']}。`,
  }[locale];
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
        id: `${g[buyer]} menyerap sebagian besar saham yang dijual ${lower(g[seller], locale)} sejak ${since}: ${b} lot dibeli, ${s} lot dijual.`,
        'zh-CN': `自 ${since} 起，${g[buyer]}承接了${g[seller]}卖出的大部分筹码：买入 ${b} 手，对应卖出 ${s} 手。`,
      }[locale],
    );
    const recent = summary.recentNets[buyer];
    lines.push(
      recent > 0
        ? { en: 'They were still net buyers over the last five sessions.', id: 'Dalam lima sesi terakhir mereka masih pembeli bersih.', 'zh-CN': '最近五个时段他们仍为净买入。' }[locale]
        : { en: `Over the last five sessions they turned to selling (${lots(recent, locale)} lots), so the build-up may be slowing.`, id: `Dalam lima sesi terakhir mereka berbalik menjual (${lots(recent, locale)} lot), jadi akumulasi mungkin melambat.`, 'zh-CN': `最近五个时段他们转为净卖出（${lots(recent, locale)} 手），积累可能放缓。` }[locale],
    );
  } else {
    lines.push({ en: `Broker flows since ${since} roughly balance, so no group stands out.`, id: `Arus broker sejak ${since} relatif seimbang, tidak ada kelompok yang menonjol.`, 'zh-CN': `自 ${since} 起券商资金流大致平衡，没有突出的分组。` }[locale]);
  }

  if (priceChange !== null) {
    const move = percent(priceChange, locale);
    const inst = summary.nets.institution_facing;
    const app = summary.nets.app_facing;
    const read =
      inst > 0 && priceChange > 0
        ? { en: 'A rising price with institutions buying fits accumulation by larger investors.', id: 'Harga naik saat broker institusional membeli sejalan dengan akumulasi oleh investor besar.', 'zh-CN': '价格上涨且机构券商买入，符合大资金积累的特征。' }
        : inst < 0 && app > 0
          ? { en: 'Institutions selling to retail apps can mean larger holders are handing shares over.', id: 'Broker institusional menjual ke broker aplikasi ritel bisa berarti pemegang besar sedang melepas saham.', 'zh-CN': '机构券商卖给零售App券商，可能意味着大户在派发筹码。' }
          : app > 0 && priceChange < 0
            ? { en: 'Retail apps buying into a falling price is a weaker sign than institutional buying.', id: 'Broker aplikasi ritel membeli saat harga turun adalah tanda yang lebih lemah dibanding pembelian broker institusional.', 'zh-CN': '零售App券商在下跌中买入，信号弱于机构券商买入。' }
            : { en: 'Flow and price do not point the same way, so read this with care.', id: 'Arus dan harga tidak searah, jadi baca dengan hati-hati.', 'zh-CN': '资金流与价格方向不一致，需谨慎解读。' };
    lines.push(
      {
        en: `The price moved ${move} over the same period. ${read.en}`,
        id: `Harga bergerak ${move} pada periode yang sama. ${read.id}`,
        'zh-CN': `同期价格变动 ${move}。${read['zh-CN']}`,
      }[locale],
    );
  }

  if (health !== null) {
    const equity = health.equityPositive
      ? health.equityImproving
        ? { en: 'positive and growing equity', id: 'ekuitas positif dan bertumbuh', 'zh-CN': '权益为正且增长' }
        : { en: 'positive but shrinking equity', id: 'ekuitas positif tetapi menyusut', 'zh-CN': '权益为正但缩水' }
      : health.equityImproving
        ? { en: 'equity still negative but improving', id: 'ekuitas masih negatif tetapi membaik', 'zh-CN': '权益仍为负但在改善' }
        : { en: 'negative equity', id: 'ekuitas negatif', 'zh-CN': '权益为负' };
    const profit = health.coreProfit
      ? { en: 'a profit without one-offs', id: 'laba tanpa pos non-berulang', 'zh-CN': '扣除一次性项目后盈利' }
      : health.oneOff
        ? { en: 'a loss once the one-off gain is removed', id: 'rugi setelah keuntungan non-berulang dikeluarkan', 'zh-CN': '扣除一次性收益后亏损' }
        : { en: 'a loss', id: 'rugi', 'zh-CN': '亏损' };
    lines.push(
      {
        en: `The latest report shows ${equity.en} and ${profit.en}, so the flow story needs the business to back it up.`,
        id: `Laporan terakhir menunjukkan ${equity.id} dan ${profit.id}, jadi cerita arus perlu didukung kinerja bisnis.`,
        'zh-CN': `最新报告显示${equity['zh-CN']}，且${profit['zh-CN']}，资金流的故事仍需业务基本面支撑。`,
      }[locale],
    );
  }

  lines.push({ en: 'This reads the visible broker data only. It is not advice.', id: 'Ini hanya membaca data broker yang terlihat. Bukan saran.', 'zh-CN': '以上仅基于可见的券商数据，不构成建议。' }[locale]);
  return lines;
}
