import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatSessionDate, intlLocale, useTranslation } from '../../i18n';
import type { Locale } from '../../engine/context';
import type { BrokerSeriesPoint } from '../../engine/brokerSeries';
import { tickLabel, xTickLabels, yAxisTicks } from './axisTicks';

// Categorical, not directional: these are individual broker channels, so the
// palette carries no buy/sell meaning and the legend labels every line.
const SERIES_COLORS = ['#0B1220', '#B4530A', '#0F766E'] as const;

interface BrokerFlowChartProps {
  points: BrokerSeriesPoint[];
  codes: readonly string[];
  locale: Locale;
  presentation?: boolean;
}

export function BrokerFlowChart({ points, codes, locale, presentation = false }: BrokerFlowChartProps) {
  const { t } = useTranslation();
  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  const data = points.map((point) => {
    const row: Record<string, number | string | null> = {
      date: point.date,
      label: formatSessionDate(point.date, locale),
    };
    for (const code of codes) row[code] = point.nets[code] ?? null;
    return row;
  });
  const values = data.flatMap((row) =>
    codes.flatMap((code) => {
      const value = row[code];
      return typeof value === 'number' ? [value] : [];
    }),
  );
  const pad = values.length > 1 ? Math.max((Math.max(...values) - Math.min(...values)) * 0.05, 500) : 500;
  const yMin = values.length > 0 ? Math.min(...values) - pad : -500;
  const yMax = values.length > 0 ? Math.max(...values) + pad : 500;

  return (
    <div
      role="img"
      aria-label={t('stock.brokerChartAria', {
        count: String(codes.length),
        sessions: String(points.length),
      })}
      className={presentation ? 'h-[55vh] min-h-[20rem] w-full' : 'h-64 w-full'}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: 8 }}>
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
              typeof value === 'number' ? `${intl.format(value)} ${t('stock.flowLotsUnit')}` : t('states.unavailable'),
              name,
            ]}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#0B1220', paddingTop: 4 }} />
          {codes.map((code, index) => {
            const color: string = SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0];
            return (
              <Line
                key={code}
                type="linear"
                dataKey={code}
                stroke={color}
                strokeWidth={2}
                dot={(props: { cx?: number; cy?: number; index?: number }) => (
                  <IsolatedDot key={`${code}-${props.index}`} {...props} data={data} code={code} color={color} />
                )}
                connectNulls={false}
                // Recharts only draws dots after the draw-in animation ends, so
                // an interrupted animation would hide isolated observations.
                isAnimationActive={false}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Lines break wherever a broker is outside the visible sample, so a session
// observed with no observed neighbour has no segment to draw. Without a dot it
// would vanish (ES in SINI: seen on 1 and 3 Sept only); joined points keep the
// plain line.
function IsolatedDot({
  cx,
  cy,
  index,
  data,
  code,
  color,
}: {
  cx?: number;
  cy?: number;
  index?: number;
  data: readonly Record<string, number | string | null>[];
  code: string;
  color: string;
}) {
  if (cx === undefined || cy === undefined || index === undefined) return <g />;
  const value = data[index]?.[code];
  const joined = (offset: number) => typeof data[index + offset]?.[code] === 'number';
  if (typeof value !== 'number' || joined(-1) || joined(1)) return <g />;
  return <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="#FFFFFF" strokeWidth={1.5} />;
}
