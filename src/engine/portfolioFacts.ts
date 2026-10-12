// Portfolio model facts. A separate document from buildFacts: the 28 reviewed
// broker facts stay untouched, and these P-facts describe only the priced
// current-holdings model built by engine/portfolio.ts. Claims about them live
// in the same reviewed registry as every other claim.

import { computePortfolioKey } from './context';
import {
  factId,
  trilingual,
  type Fact,
  type FactPeriod,
  type FactsContext,
  type FactsDocument,
} from './facts';
import { largestAllocation, largestContribution, type PortfolioAnalytics } from './portfolio';

export const PORTFOLIO_TICKER = 'PORTFOLIO';

// Valuation only supports complete IDR portfolios, and IDR prices come from IDX,
// whose regular session closes at 16:00 WIB with no daylight saving. That makes
// the exchange offset a constant here rather than an assumption about any zone.
function portfolioSessionEnd(sessionDate: string): string {
  return `${sessionDate}T16:00:00+07:00`;
}

export function portfolioAnalyticsContext(input: {
  analytics: PortfolioAnalytics;
  locale: FactsContext['locale'];
  taxonomyVersion: string;
  claimVersion: string;
}): FactsContext {
  const { analytics } = input;
  return {
    ticker: PORTFOLIO_TICKER,
    sessionDate: analytics.endDate,
    cutoffAt: portfolioSessionEnd(analytics.endDate),
    periodStart: analytics.startDate,
    periodEnd: analytics.endDate,
    scenario: 'default',
    locale: input.locale,
    dataVersion: analytics.dataVersion,
    taxonomyVersion: input.taxonomyVersion,
    claimVersion: input.claimVersion,
    portfolioKey: computePortfolioKey({
      symbols: analytics.holdings.map((holding) => holding.symbol),
      quantityBySymbol: new Map(analytics.holdings.map((holding) => [holding.symbol, holding.quantityShares])),
      currency: analytics.currency,
      startDate: analytics.startDate,
      endDate: analytics.endDate,
      dataVersion: analytics.dataVersion,
      benchmarkSymbol: analytics.benchmark?.symbol ?? null,
      cutoffAt: analytics.cutoffAt,
    }),
  };
}

export function buildPortfolioFacts(context: FactsContext, analytics: PortfolioAnalytics): FactsDocument {
  const versions = {
    data: context.dataVersion,
    taxonomy: context.taxonomyVersion,
    claims: context.claimVersion,
  };
  const period: FactPeriod = { start: analytics.startDate, end: analytics.endDate };
  const variant = `n${analytics.sessions}`;
  const availableAt = portfolioSessionEnd(analytics.endDate);
  const strongReason = trilingual(
    (locale) =>
      locale === 'zh-CN'
        ? '基于共享日期上完整收盘价的确定性算术。'
        : locale === 'id'
          ? 'Aritmetika deterministik atas penutupan lengkap pada tanggal bersama.'
          : 'Deterministic arithmetic over the complete closes on the shared dates.',
  );
  const modelNote = trilingual(
    (locale) =>
      locale === 'zh-CN'
        ? '当前持仓模型：数量固定，不含交易、现金、分红、费用与配股认购。'
        : locale === 'id'
          ? 'Model kepemilikan saat ini: kuantitas tetap, tanpa transaksi, kas, dividen, biaya, atau hak memesan efek.'
          : 'Current-holdings model: quantities fixed, excluding trades, cash, dividends, fees and rights subscriptions.',
  );

  const facts: Fact[] = [];

  facts.push({
    fact_id: factId(PORTFOLIO_TICKER, 'P01', period, variant),
    key: 'P01',
    type: 'portfolio-performance',
    period,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: analytics.valueSeries.map((point) => point.date),
    value: {
      kind: 'portfolio-performance',
      currency: analytics.currency,
      sessions: analytics.sessions,
      startDate: analytics.startDate,
      endDate: analytics.endDate,
      startValue: analytics.startValue,
      endValue: analytics.endValue,
      returnFraction: analytics.returnFraction,
      benchmark: analytics.benchmark,
    },
    unit: 'fraction',
    approximate: trilingual(
      (locale) =>
        locale === 'zh-CN'
          ? '对已加载收盘价的精确算术；显示时才四舍五入。'
          : locale === 'id'
            ? 'Aritmetika persis atas penutupan yang dimuat; pembulatan hanya untuk tampilan.'
            : 'Exact arithmetic on the loaded closes; rounding happens for display only.',
    ),
    coverage_note: modelNote,
    available_at: availableAt,
    evidence: { strength: 'Strong', reason: strongReason },
    versions,
    available: true,
  });

  const contribution = largestContribution(analytics);
  facts.push({
    fact_id: factId(PORTFOLIO_TICKER, 'P02', period, variant),
    key: 'P02',
    type: 'portfolio-contribution',
    period,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: [analytics.startDate, analytics.endDate],
    value: {
      kind: 'portfolio-contribution',
      symbol: contribution.symbol,
      quantityShares: contribution.quantityShares,
      startClose: contribution.startClose,
      endClose: contribution.endClose,
      priceChangeIdr: contribution.priceChangeIdr,
      contributionFraction: contribution.contributionFraction,
      holdingsCount: analytics.holdings.length,
    },
    unit: 'fraction',
    approximate: trilingual(
      (locale) =>
        locale === 'zh-CN'
          ? '贡献为期初价值的占比，按固定数量与收盘差计算。'
          : locale === 'id'
            ? 'Kontribusi sebagai bagian dari nilai awal, dihitung dari kuantitas tetap dan selisih penutupan.'
            : 'Contribution as a share of the starting value, from the fixed quantity and the close difference.',
    ),
    coverage_note: modelNote,
    available_at: availableAt,
    evidence: { strength: 'Strong', reason: strongReason },
    versions,
    available: true,
  });

  const allocation = largestAllocation(analytics);
  facts.push({
    fact_id: factId(PORTFOLIO_TICKER, 'P03', period, variant),
    key: 'P03',
    type: 'portfolio-allocation',
    period,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: [analytics.endDate],
    value: {
      kind: 'portfolio-allocation',
      symbol: allocation.symbol,
      quantityShares: allocation.quantityShares,
      endClose: allocation.endClose,
      weightFraction: allocation.weightFraction,
      endValue: allocation.endValue,
      holdingsCount: analytics.holdings.length,
    },
    unit: 'fraction',
    approximate: trilingual(
      (locale) =>
        locale === 'zh-CN'
          ? '权重为该持仓期末市值占组合期末价值的比例。'
          : locale === 'id'
            ? 'Bobot adalah nilai pasar akhir holding terhadap nilai akhir portofolio.'
            : 'Weight is the holding end market value over the portfolio end value.',
    ),
    coverage_note: modelNote,
    available_at: availableAt,
    evidence: { strength: 'Strong', reason: strongReason },
    versions,
    available: true,
  });

  facts.push({
    fact_id: factId(PORTFOLIO_TICKER, 'P04', period, variant),
    key: 'P04',
    type: 'portfolio-coverage',
    period,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: [analytics.startDate, analytics.endDate],
    value: {
      kind: 'portfolio-coverage',
      currency: analytics.currency,
      symbols: analytics.holdings.map((holding) => holding.symbol),
      sessions: analytics.sessions,
      commonCloses: analytics.commonCloses,
      basis: analytics.basis,
      benchmarkSymbol: analytics.benchmark?.symbol ?? null,
      dataVersion: analytics.dataVersion,
      cutoffAt: analytics.cutoffAt,
      completedThrough: analytics.completedThrough,
    },
    unit: 'none',
    approximate: trilingual(
      (locale) =>
        locale === 'zh-CN'
          ? '覆盖范围来自已加载的价格序列与共同收盘日。'
          : locale === 'id'
            ? 'Cakupan berasal dari seri harga yang dimuat dan tanggal penutupan bersama.'
            : 'Coverage from the loaded price series and the common close dates.',
    ),
    coverage_note: trilingual((locale) =>
      analytics.basis === 'sample'
        ? locale === 'zh-CN'
          ? '价格为虚构样本数据，不是市场数据；基准为虚构指数 SMPLIDX，并非 IHSG。'
          : locale === 'id'
            ? 'Harga adalah fixture fiksi, bukan data pasar; benchmark adalah indeks fiksi SMPLIDX, bukan IHSG.'
            : 'Prices are fictional sample fixtures, not market data; the benchmark is the fictional SMPLIDX, never IHSG.'
        : locale === 'zh-CN'
          ? '价格为供应商报告的日度数据（未作调整）；基准为 ^JKSE 价格回报指数。'
          : locale === 'id'
            ? 'Harga adalah bar harian penyedia tanpa penyesuaian; benchmark adalah indeks imbal hasil harga ^JKSE.'
            : 'Prices are provider-reported daily bars with no adjustment; the benchmark is the ^JKSE price-return index.',
    ),
    available_at: availableAt,
    evidence: { strength: 'Strong', reason: strongReason },
    versions,
    available: true,
  });

  // P05 carries every owned holding's own numbers, so an allocation or a
  // contribution row opens a fact that contains its own symbol, quantity,
  // closes and the totals it divides by. P02 and P03 stay as the summary claims
  // about the single largest holding; they are never a row's evidence again.
  facts.push({
    fact_id: factId(PORTFOLIO_TICKER, 'P05', period, variant),
    key: 'P05',
    type: 'portfolio-breakdown',
    period,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: [analytics.startDate, analytics.endDate],
    value: {
      kind: 'portfolio-breakdown',
      currency: analytics.currency,
      startDate: analytics.startDate,
      endDate: analytics.endDate,
      totalStartValue: analytics.startValue,
      totalEndValue: analytics.endValue,
      holdings: analytics.holdings.map((holding) => ({
        symbol: holding.symbol,
        quantityShares: holding.quantityShares,
        startClose: holding.startClose,
        endClose: holding.endClose,
        startValue: holding.startValue,
        endValue: holding.endValue,
        priceChangeIdr: holding.priceChangeIdr,
        startWeightFraction: holding.startWeightFraction,
        weightFraction: holding.weightFraction,
        contributionFraction: holding.contributionFraction,
      })),
    },
    unit: 'none',
    approximate: trilingual(
      (locale) =>
        locale === 'zh-CN'
          ? '权重为期末市值除以组合期末总值；贡献为价格变动金额除以期初总值，以百分点表示。显示时才四舍五入。'
          : locale === 'id'
            ? 'Bobot adalah nilai akhir dibagi total nilai akhir portofolio; kontribusi adalah perubahan nilai dibagi total nilai awal, dalam poin persentase. Pembulatan hanya untuk tampilan.'
            : 'Weight is the holding end value over the portfolio end total; contribution is the value change over the portfolio start total, in percentage points. Rounding happens for display only.',
    ),
    coverage_note: modelNote,
    available_at: availableAt,
    evidence: { strength: 'Strong', reason: strongReason },
    versions,
    available: true,
  });

  // P06 is the dated weight history the allocation lines plot: one point per
  // consumed date, each holding's weight within that date's total.
  facts.push({
    fact_id: factId(PORTFOLIO_TICKER, 'P06', period, variant),
    key: 'P06',
    type: 'portfolio-weight-history',
    period,
    source_row_ids: [],
    source_event_ids: [],
    source_sessions: analytics.weightSeries.map((point) => point.date),
    value: {
      kind: 'portfolio-weight-history',
      currency: analytics.currency,
      points: analytics.weightSeries.map((point) => ({
        date: point.date,
        total: point.total,
        entries: point.entries.map((entry) => ({
          symbol: entry.symbol,
          quantityShares: entry.quantityShares,
          close: entry.close,
          value: entry.value,
          weightFraction: entry.weightFraction,
        })),
      })),
    },
    unit: 'fraction',
    approximate: trilingual(
      (locale) =>
        locale === 'zh-CN'
          ? '每个日期的权重为数量乘以该日收盘价，再除以当日组合总值；同一日期各权重合计为 100%。'
          : locale === 'id'
            ? 'Bobot tiap tanggal adalah kuantitas dikali penutupan hari itu, dibagi total portofolio hari itu; bobot pada satu tanggal berjumlah 100%.'
            : 'Each date’s weight is the quantity times that date’s close, over that date’s portfolio total; weights on one date sum to 100%.',
    ),
    coverage_note: modelNote,
    available_at: availableAt,
    evidence: { strength: 'Strong', reason: strongReason },
    versions,
    available: true,
  });

  return { ticker: PORTFOLIO_TICKER, context, facts };
}