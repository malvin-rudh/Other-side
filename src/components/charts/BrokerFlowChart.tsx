import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatSessionDate, intlLocale, useTranslation } from '../../i18n';
import { ui } from '../../i18n/analysisCopy';
import type { Locale } from '../../engine/context';
import type { BrokerSeriesPoint } from '../../engine/brokerSeries';
import { BROKER_LINE_COLOURS } from '../groupColours';
import { tickLabel, xTickLabels, yAxisTicks } from './axisTicks';

interface BrokerFlowChartProps {
  points: BrokerSeriesPoint[];
  codes: readonly string[];
  locale: Locale;
  presentation?: boolean;
}

// Cumulative net lots per chosen broker. A session where a broker is outside the
// visible top nine keeps the last cumulative value, so every line is one
// unbroken path from the broker's first observation. Before it, there is no line.
export function carryForward(points: readonly BrokerSeriesPoint[], codes: readonly string[]) {
  const last = new Map<string, number>();
  return points.map((point) => {
    const row: Record<string, number | string | null> = { date: point.date };
    for (const code of codes) {
      const value = point.nets[code];
      if (typeof value === 'number') last.set(code, value);
      row[code] = last.get(code) ?? null;
    }
    return row;
  });
}

export function BrokerFlowChart({ points, codes, locale, presentation = false }: BrokerFlowChartProps) {
  const { t } = useTranslation();
  const copy = ui(locale);
  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  const data: Record<string, number | string | null>[] = carryForward(points, codes).map((row) => ({
    ...row,
    label: formatSessionDate(String(row.date), locale),
  }));
  const values = data.flatMap((row) =>
    codes.flatMap((code) => {
      const value = row[code];
      return typeof value === 'number' ? [value] : [];
    }),
  );
  // The zero line is always inside the domain.
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const pad = Math.max((high - low) * 0.08, 500);
  const yMin = low - pad;
  const yMax = high + pad;

  return (
    <div
      role="img"
      aria-label={copy.brokerChartAria(codes.length, points.length)}
      className={presentation ? 'h-[55vh] min-h-[20rem] w-full' : 'h-64 w-full'}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E3E8F0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#5A6B84', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#E3E8F0' }}
            ticks={xTickLabels(data.map((point) => String(point.label)))}
            interval={0}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yAxisTicks(yMin, yMax)}
            tick={{ fill: '#5A6B84', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickLabel}
            width={44}
          />
          <ReferenceLine y={0} stroke="#0B1220" strokeOpacity={0.55} strokeWidth={1.25} />
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
              typeof value === 'number' ? `${intl.format(value)} ${t('stock.flowLotsUnit')}` : t('states.unavailable'),
              name,
            ]}
          />
          {codes.map((code, index) => (
            <Line
              key={code}
              type="linear"
              dataKey={code}
              stroke={BROKER_LINE_COLOURS[index % BROKER_LINE_COLOURS.length]}
              strokeWidth={2.25}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
