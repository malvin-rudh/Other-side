import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatSessionDate, intlLocale, useTranslation } from '../../i18n';
import type { Locale } from '../../engine/context';
import type { ProxyPoint } from '../../engine/stockView';
import { tickLabel, xTickLabels, yAxisTicks } from './axisTicks';

interface ProxyChartProps {
  points: ProxyPoint[];
  selectedSessionDate: string;
  locale: Locale;
  presentation?: boolean;
}

export function ProxyChart({ points, selectedSessionDate, locale, presentation = false }: ProxyChartProps) {
  const { t } = useTranslation();
  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  const data = points.map((point) => ({
    date: point.date,
    label: formatSessionDate(point.date, locale),
    proxy: point.display,
  }));
  const selected = data.find((point) => point.date === selectedSessionDate);
  const capturedCount = points.filter((point) => point.display !== null).length;
  const capturedValues = data.flatMap((point) => (point.proxy !== null ? [point.proxy] : []));
  const yMin = capturedValues.length > 0 ? Math.min(...capturedValues) - 200 : 0;
  const yMax = capturedValues.length > 0 ? Math.max(...capturedValues) + 200 : 1;
  const yTicks = capturedValues.length > 0 ? yAxisTicks(yMin, yMax) : [];
  const xTicks = xTickLabels(data.map((point) => point.label));

  return (
    <div
      role="img"
      aria-label={t('stock.proxyChartAria', { count: String(capturedCount) })}
      className={presentation ? 'h-[45vh] min-h-[16rem] w-full' : 'h-48 w-full'}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 48, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#E3E8F0" vertical={false} />
          <XAxis dataKey="label" tick={{ fill: '#5A6B84', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#E3E8F0' }} ticks={xTicks} interval={0} />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tick={{ fill: '#5A6B84', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={tickLabel}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: '#FFFFFF',
              border: '1px solid #E3E8F0',
              borderRadius: 8,
              boxShadow: '0 8px 24px -16px rgba(11, 18, 32, 0.35)',
            }}
            labelStyle={{ color: '#0B1220', fontSize: 12, fontWeight: 600 }}
            itemStyle={{ color: '#0B1220', fontSize: 12 }}
            formatter={(value: unknown) => (typeof value === 'number' ? `Rp${intl.format(value)}` : '—')}
          />
          <Line type="linear" dataKey="proxy" stroke="#0B1220" strokeWidth={2} dot={false} />
          {selected && selected.proxy !== null ? (
            <ReferenceDot x={selected.label} y={selected.proxy} r={5} fill="#F58220" stroke="#FFFFFF" strokeWidth={2} />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
