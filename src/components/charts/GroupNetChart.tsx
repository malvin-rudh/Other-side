import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatSessionDate, intlLocale, useTranslation } from '../../i18n';
import type { Locale } from '../../engine/context';
import type { CumulativePoint } from '../../engine/stockView';
import { tickLabel, xTickLabels, yAxisTicks } from './axisTicks';

interface GroupNetChartProps {
  points: CumulativePoint[];
  locale: Locale;
  presentation?: boolean;
}

export function GroupNetChart({ points, locale, presentation = false }: GroupNetChartProps) {
  const { t } = useTranslation();
  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  const data = points.map((point) => ({
    date: point.date,
    label: formatSessionDate(point.date, locale),
    app: point.appFacing,
    institution: point.institutionFacing,
    other: point.otherMixed,
    unknown: point.unknown,
  }));
  const seriesValues = data.flatMap((point) =>
    [point.app, point.institution, point.other, point.unknown].filter((value): value is number => value !== null),
  );
  const pad = seriesValues.length > 1 ? Math.max((Math.max(...seriesValues) - Math.min(...seriesValues)) * 0.05, 500) : 500;
  const yMin = seriesValues.length > 0 ? Math.min(...seriesValues) - pad : -500;
  const yMax = seriesValues.length > 0 ? Math.max(...seriesValues) + pad : 500;
  const yTicks = yAxisTicks(yMin, yMax);
  const xTicks = xTickLabels(data.map((point) => point.label));

  return (
    <div
      role="img"
      aria-label={t('stock.groupNetChartAria', { count: String(points.length) })}
      className={presentation ? 'h-[55vh] min-h-[20rem] w-full' : 'h-64 w-full'}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#E3E8F0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#5A6B84', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#E3E8F0' }} ticks={xTicks} interval={0} />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tick={{ fill: '#5A6B84', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickLabel}
            width={52}
          />
          <Tooltip
            contentStyle={{
              background: '#FFFFFF',
              border: '1px solid #E3E8F0',
              borderRadius: 8,
              boxShadow: '0 8px 24px -16px rgba(11, 18, 32, 0.35)',
            }}
            labelStyle={{ color: '#0B1220', fontSize: 12, fontWeight: 600 }}
            itemStyle={{ fontSize: 12 }}
            formatter={(value: unknown, name: string) => [
              typeof value === 'number' ? intl.format(value) : '—',
              legendLabel(name),
            ]}
          />
          <Legend
            formatter={(name: string) => legendLabel(name)}
            wrapperStyle={{ fontSize: 12, color: '#0B1220', paddingTop: 4 }}
          />
          <Line type="linear" dataKey="app" stroke="#0F766E" strokeWidth={2} dot={false} connectNulls={false} />
          <Line type="linear" dataKey="institution" stroke="#B4530A" strokeWidth={2} dot={false} connectNulls={false} />
          <Line type="linear" dataKey="other" stroke="#8494AB" strokeWidth={1.5} dot={false} connectNulls={false} />
          <Area
            type="linear"
            dataKey="unknown"
            stroke="#64748B"
            fill="#64748B"
            fillOpacity={0.1}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            dot={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );

  function legendLabel(name: string): string {
    switch (name) {
      case 'app':
        return t('stock.groupApp');
      case 'institution':
        return t('stock.groupInstitution');
      case 'other':
        return t('stock.groupOther');
      default:
        return t('stock.groupUnknown');
    }
  }
}
