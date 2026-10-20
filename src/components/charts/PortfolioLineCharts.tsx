// The Recharts charts of the portfolio analytics layer, in their own module so
// the lazy/sync split in PortfolioAnalyticsCard keeps Recharts out of the main
// browser bundle. Every number shown here comes from engine/portfolio.ts
// arithmetic over the one selected window; the tooltips and tick labels only
// format it.
//
// Scale rule: the data handed to a chart is a raw fraction, and the multiplication
// by 100 happens exactly once, inside a display formatter. Nothing pre-rounds a
// fraction into a percentage and then formats it as a fraction again.

import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Locale } from '../../engine/context';
import type { PortfolioAnalytics, PriceSeries } from '../../engine/portfolio';
import { formatSessionDate, intlLocale, useTranslation } from '../../i18n';
import { xTickLabels, yAxisTicks } from './axisTicks';
import { idrCompact, plainPercent, signedPercent, signedPoints } from '../PortfolioCharts';

const TOOLTIP_STYLE = {
  background: '#FFFFFF',
  border: '1px solid #E3E8F0',
  borderRadius: 8,
  boxShadow: '0 8px 24px -16px rgba(11, 18, 32, 0.35)',
} as const;

const TOOLTIP_LABEL_STYLE = { color: '#0B1220', fontSize: 12, fontWeight: 600 } as const;

const TICK = { fill: '#5A6B84', fontSize: 11 } as const;

// Stable per-symbol colours for the weight lines. The palette is indexed by the
// symbol's position in the sorted owned list, so a holding keeps its colour
// across renders, across session-window changes and between the two charts.
const WEIGHT_COLOURS = ['#F58220', '#0B1220', '#64748B', '#0F766E', '#BE123C', '#B4530A'] as const;

export function holdingColour(symbol: string, symbols: readonly string[]): string {
  const ordered = [...symbols].sort((a, b) => a.localeCompare(b));
  const index = ordered.indexOf(symbol);
  if (index < 0) return WEIGHT_COLOURS[0]!;
  return WEIGHT_COLOURS[index % WEIGHT_COLOURS.length]!;
}

interface ValueChartProps {
  analytics: PortfolioAnalytics;
  locale: Locale;
  compact?: boolean;
}

// The modelled portfolio value V(t) across the selected window. One orange area,
// IDR axis, no benchmark: the benchmark lives on the performance chart where
// both series share a percentage baseline.
export function PortfolioValueChart({ analytics, locale, compact = false }: ValueChartProps) {
  const { t } = useTranslation();
  const gradientId = useId();
  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  const data = analytics.valueSeries.map((point) => ({
    date: point.date,
    label: formatSessionDate(point.date, locale),
    value: point.value,
  }));
  const values = data.map((point) => point.value);
  const pad = values.length > 1 ? Math.max((Math.max(...values) - Math.min(...values)) * 0.05, 1) : 1;
  const yMin = Math.min(...values) - pad;
  const yMax = Math.max(...values) + pad;
  const yTicks = yAxisTicks(yMin, yMax);
  const xTicks = xTickLabels(data.map((point) => point.label));

  return (
    <div
      role="img"
      aria-label={t('analytics.chart.valueAria', { count: String(data.length) })}
      className={compact ? 'h-40 w-full' : 'h-56 w-full'}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F58220" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#F58220" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E3E8F0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={TICK}
            tickLine={false}
            axisLine={{ stroke: '#E3E8F0' }}
            ticks={xTicks}
            interval={0}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => idrCompact(value, locale)}
            width={64}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={{ fontSize: 12 }}
            formatter={(value: unknown, name: string) => [
              typeof value === 'number' ? `Rp${intl.format(value)}` : '\u2014',
              name === 'value' ? t('analytics.chart.valueName') : name,
            ]}
          />
          <Area
            type="linear"
            dataKey="value"
            stroke="#F58220"
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface PerformanceChartProps {
  analytics: PortfolioAnalytics;
  benchmarkSeries: PriceSeries | null;
  locale: Locale;
}

// Portfolio and benchmark percentage change on one shared baseline: the first of
// the same N+1 consumed closes the return facts are computed from, so the line
// ends equal the stated percentages exactly.
export function PortfolioPerformanceChart({ analytics, benchmarkSeries, locale }: PerformanceChartProps) {
  const { t } = useTranslation();
  const valueByDate = new Map(analytics.valueSeries.map((point) => [point.date, point.value]));
  const benchmarkByDate = new Map<string, number>();
  if (benchmarkSeries !== null && analytics.benchmark !== null) {
    for (const bar of benchmarkSeries.bars) {
      if (bar.close !== null) benchmarkByDate.set(bar.date, bar.close);
    }
  }
  const windowDates = analytics.valueSeries.map((point) => point.date);
  const baselineValue = valueByDate.get(windowDates[0] ?? '') ?? null;
  const baselineBenchmark =
    analytics.benchmark !== null && benchmarkByDate.size > 0
      ? benchmarkByDate.get(windowDates[0] ?? '') ?? null
      : null;

  // Raw fractions on the axis. signedPercent multiplies by 100 once, at display.
  const data = windowDates.map((date) => ({
    date,
    label: formatSessionDate(date, locale),
    portfolio:
      baselineValue !== null && baselineValue !== 0 && valueByDate.has(date)
        ? valueByDate.get(date)! / baselineValue - 1
        : null,
    benchmark:
      baselineBenchmark !== null && baselineBenchmark !== 0 && benchmarkByDate.has(date)
        ? benchmarkByDate.get(date)! / baselineBenchmark - 1
        : null,
  }));

  const seriesValues = data
    .flatMap((point) => [point.portfolio, point.benchmark])
    .filter((value): value is number => value !== null);
  const pad =
    seriesValues.length > 1 ? Math.max((Math.max(...seriesValues) - Math.min(...seriesValues)) * 0.1, 0.005) : 0.005;
  const yMin = (seriesValues.length > 0 ? Math.min(...seriesValues) : -0.01) - pad;
  const yMax = (seriesValues.length > 0 ? Math.max(...seriesValues) : 0.01) + pad;
  // Deduplicated through the formatter this axis actually prints, so distinct
  // percentages keep their own gridline.
  const yTicks = yAxisTicks(yMin, yMax, 5, (value) => signedPercent(value, locale));
  const xTicks = xTickLabels(data.map((point) => point.label));

  return (
    <div role="img" aria-label={t('analytics.chart.performanceAria')} className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#E3E8F0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={TICK}
            tickLine={false}
            axisLine={{ stroke: '#E3E8F0' }}
            ticks={xTicks}
            interval={0}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tick={TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: number) => signedPercent(value, locale)}
            width={56}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={{ fontSize: 12 }}
            formatter={(value: unknown, name: string) => [
              typeof value === 'number' ? signedPercent(value, locale) : '\u2014',
              name === 'portfolio'
                ? t('analytics.chart.portfolioName')
                : benchmarkLabel(analytics.benchmark?.symbol ?? '', t),
            ]}
          />
          <Legend
            formatter={(name: string) =>
              name === 'portfolio'
                ? t('analytics.chart.portfolioName')
                : benchmarkLabel(analytics.benchmark?.symbol ?? '', t)
            }
            wrapperStyle={{ fontSize: 12, color: '#0B1220', paddingTop: 4 }}
          />
          <Line type="linear" dataKey="portfolio" stroke="#0B1220" strokeWidth={2} dot={false} connectNulls={false} />
          {analytics.benchmark !== null ? (
            <Line
              type="linear"
              dataKey="benchmark"
              stroke="#F58220"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls={false}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// One plotted date: the axis label plus each holding's weight in percent. The
// declared members stay string so the axis helpers keep their types, while the
// index signature carries the per-symbol weight columns.
interface AllocationRow {
  date: string;
  label: string;
  [symbol: string]: string | number;
}

interface AllocationChartProps {
  analytics: PortfolioAnalytics;
  locale: Locale;
  // The dated weight-history fact. Every printed weight opens it, so a number on
  // a line always resolves to the fact that carries its own symbol and date.
  compact?: boolean;
}

// Each owned holding's market-value weight through the selected dates, computed
// as quantity x close / total. The scale fits the data, the axis prints
// percentages, and the legend carries the start weight, the end weight and the
// change in percentage points.
export function PortfolioAllocationChart({
  analytics,
  locale,
  compact = false,
}: AllocationChartProps) {
  const { t } = useTranslation();
  const symbols: string[] = analytics.weightSeries[0]?.entries.map((entry) => entry.symbol) ?? [];

  const data = analytics.weightSeries.map((point) => {
    const row: AllocationRow = {
      date: point.date,
      label: formatSessionDate(point.date, locale),
    };
    for (const entry of point.entries) row[entry.symbol] = entry.weightFraction * 100;
    return row;
  });

  const weights = data.flatMap((row) => symbols.map((symbol) => row[symbol])).filter((v): v is number => typeof v === 'number');
  const pad = weights.length > 1 ? Math.max((Math.max(...weights) - Math.min(...weights)) * 0.1, 0.5) : 0.5;
  const yMin = Math.max((weights.length > 0 ? Math.min(...weights) : 0) - pad, 0);
  const yMax = (weights.length > 0 ? Math.max(...weights) : 100) + pad;
  // The plotted values are already percentages, so the label divides by 100 once
  // to reuse the fraction formatter. Deduplicating through it is what keeps 20,
  // 40, 60 and 80 as four readable ticks rather than two.
  const percentTick = (value: number): string => `${plainPercent(value / 100, locale)}%`;
  const yTicks = yAxisTicks(yMin, yMax, 5, percentTick);
  const xTicks = xTickLabels(data.map((point) => point.label));

  return (
    <div>
      <div
        role="img"
        aria-label={t('analytics.chart.allocationAria', { count: String(symbols.length) })}
        className={compact ? 'h-40 w-full' : 'h-56 w-full'}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: 8 }}>
            <CartesianGrid stroke="#E3E8F0" vertical={false} />
            <XAxis
              dataKey="label"
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: '#E3E8F0' }}
              ticks={xTicks}
              interval={0}
            />
            <YAxis
              domain={[yMin, yMax]}
              ticks={yTicks}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              tickFormatter={percentTick}
              width={48}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={{ fontSize: 12 }}
              formatter={(value: unknown, name: string) => [
                typeof value === 'number' ? `${plainPercent(value / 100, locale)}%` : '\u2014',
                name,
              ]}
            />
            {symbols.map((symbol) => (
              <Line
                key={symbol}
                type="linear"
                dataKey={symbol}
                stroke={holdingColour(symbol, symbols)}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 space-y-1" aria-label={t('analytics.weightChange')}>
        {analytics.holdings.map((holding) => {
          const weightChange = holding.weightFraction - holding.startWeightFraction;
          const colour = holdingColour(holding.symbol, symbols);
          return (
            <li key={holding.symbol} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4 shrink-0 rounded-full"
                style={{ backgroundColor: colour }}
              />
              <span className="font-semibold tabular-nums text-ink">{holding.symbol}</span>
              <span className="tabular-nums text-muted">
                {plainPercent(holding.startWeightFraction, locale)}%
                <span aria-hidden="true"> {'\u2192'} </span>
                {plainPercent(holding.weightFraction, locale)}%
                <span className="ml-1.5 text-ink">
                  {signedPoints(weightChange, locale)} {t('analytics.points')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The index line's name: the real IHSG, or the fictional sample index that
// imitates it.
function benchmarkLabel(symbol: string, t: (key: 'analytics.indexReal' | 'analytics.indexSample') => string): string {
  return symbol === '^JKSE' ? t('analytics.indexReal') : t('analytics.indexSample');
}

// Each owned holding's share of today's value as a donut, with a legend that
// names every slice.
export function PortfolioAllocationPie({
  analytics,
  locale,
}: {
  analytics: PortfolioAnalytics;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const symbols = analytics.holdings.map((holding) => holding.symbol);
  const rows = [...analytics.holdings].sort((a, b) => b.weightFraction - a.weightFraction);
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div role="img" aria-label={t('analytics.allocation.listLabel')} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={rows.map((row) => ({ name: row.symbol, value: row.weightFraction }))}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="90%"
              paddingAngle={1}
              stroke="#FFFFFF"
              isAnimationActive={false}
            >
              {rows.map((row) => (
                <Cell key={row.symbol} fill={holdingColour(row.symbol, symbols)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              itemStyle={{ fontSize: 12 }}
              formatter={(value: unknown, name: string) => [
                typeof value === 'number' ? `${plainPercent(value, locale)}%` : '\u2014',
                name,
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.symbol} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ background: holdingColour(row.symbol, symbols) }}
              />
              <span className="font-semibold tabular-nums">{row.symbol}</span>
            </span>
            <span className="tabular-nums">
              {plainPercent(row.weightFraction, locale)}%
              <span className="text-muted"> · {idrCompact(row.endValue, locale)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
