import {
  Bar,
  BarChart,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BrokerGroup } from '../../data/schemas';
import type { Locale } from '../../engine/context';
import { formatSessionDate, intlLocale, useTranslation } from '../../i18n';
import { EvidenceButton } from '../EvidenceButton';

export interface ComparisonBarRow {
  group: BrokerGroup;
  fromLots: number;
  toLots: number;
}

interface SessionComparisonChartProps {
  rows: readonly ComparisonBarRow[];
  fromDate: string;
  toDate: string;
  locale: Locale;
  // Evidence routing for the rendered values; without both, no evidence list
  // is rendered and the chart stays a plain labelled image.
  factId?: string | null;
  onOpenEvidence?: (factId: string, trigger: HTMLButtonElement) => void;
}

// Horizontal paired bars for one group per lane, both sessions on the same
// signed axis so the zero line stays visible and the two sessions compare
// directly. Bar colour follows each value's own sign, never the session.
export function SessionComparisonChart({
  rows,
  fromDate,
  toDate,
  locale,
  factId = null,
  onOpenEvidence,
}: SessionComparisonChartProps) {
  const { t } = useTranslation();
  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  // Axis ticks only: short enough that five of them fit a phone-width chart.
  const compact = new Intl.NumberFormat(intlLocale(locale), { notation: 'compact', maximumFractionDigits: 1 });
  const labelOf = (group: BrokerGroup) =>
    group === 'app_facing'
      ? t('stock.groupApp')
      : group === 'institution_facing'
        ? t('stock.groupInstitution')
        : group === 'other_mixed'
          ? t('stock.groupOther')
          : t('stock.groupUnknown');
  const data = rows.map((row) => ({
    group: row.group,
    label: labelOf(row.group),
    fromLots: row.fromLots,
    toLots: row.toLots,
  }));
  const magnitudes = data.flatMap((row) => [Math.abs(row.fromLots), Math.abs(row.toLots)]);
  const bound = niceBound(Math.max(1, ...magnitudes));
  const ticks = [-bound, -bound / 2, 0, bound / 2, bound];
  const prevName = `${t('card.comparePrevious')} ${formatSessionDate(fromDate, locale)}`;
  const latestName = `${t('card.compareSelected')} ${formatSessionDate(toDate, locale)}`;

  const evidenceTarget = factId !== null && onOpenEvidence ? { factId, onOpenEvidence } : null;
  const valueLabel = (label: string, name: string, value: number) =>
    `${label} ${name}: ${intl.format(value)} ${t('stock.flowLotsUnit')}`;
  return (
    <>
    <div
      role="img"
      aria-label={t('card.compareAria', {
        from: formatSessionDate(fromDate, locale),
        to: formatSessionDate(toDate, locale),
      })}
      className="h-64 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 4 }} barGap={2}>
          <XAxis
            type="number"
            domain={[-bound, bound]}
            ticks={ticks}
            interval={0}
            tick={{ fill: '#5A6B84', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#E3E8F0' }}
            tickFormatter={(value: number) => compact.format(value)}
          />
          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: '#5A6B84', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#E3E8F0' }}
            width={104}
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
              name === prevName ? prevName : latestName,
            ]}
          />
          <ReferenceLine x={0} stroke="#0B1220" strokeWidth={1} />
          <Bar dataKey="fromLots" name={prevName} fill="#0F766E" fillOpacity={0.45} barSize={13} radius={[0, 2, 2, 0]}>
            {data.map((row) => (
              <Cell key={`${row.group}-from`} fill={row.fromLots < 0 ? '#BE123C' : '#0F766E'} fillOpacity={0.45} />
            ))}
          </Bar>
          <Bar dataKey="toLots" name={latestName} fill="#0F766E" barSize={13} radius={[0, 2, 2, 0]}>
            {data.map((row) => (
              <Cell key={`${row.group}-to`} fill={row.toLots < 0 ? '#BE123C' : '#0F766E'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
    {/* Bar colour carries the sign, so the legend only explains shade: pale is
        the previous session, solid is the selected one. */}
    <ul aria-hidden="true" className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-ink">
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-unknown/45" />
        {prevName}
      </li>
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-4 rounded-sm bg-unknown" />
        {latestName}
      </li>
    </ul>
    {evidenceTarget !== null ? (
      <ul aria-label={t('card.compareEvidenceList')} className="mt-1">
        {data.map((row) => (
          <li key={`${row.group}-from`}>
            <EvidenceButton
              factId={evidenceTarget.factId}
              onActivate={evidenceTarget.onOpenEvidence}
              ariaLabel={valueLabel(row.label, prevName, row.fromLots)}
              className="sr-only focus:not-sr-only focus:bg-brand/10 focus:px-2 focus:py-0.5"
            >
              {valueLabel(row.label, prevName, row.fromLots)}
            </EvidenceButton>
          </li>
        ))}
        {data.map((row) => (
          <li key={`${row.group}-to`}>
            <EvidenceButton
              factId={evidenceTarget.factId}
              onActivate={evidenceTarget.onOpenEvidence}
              ariaLabel={valueLabel(row.label, latestName, row.toLots)}
              className="sr-only focus:not-sr-only focus:bg-brand/10 focus:px-2 focus:py-0.5"
            >
              {valueLabel(row.label, latestName, row.toLots)}
            </EvidenceButton>
          </li>
        ))}
      </ul>
    ) : null}
    </>
  );
}

// Rounds the axis bound up to 1, 2 or 5 times a power of ten, so the ticks read
// as round numbers instead of the largest observed value.
function niceBound(value: number): number {
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((factor) => factor * power >= value) ?? 10;
  return step * power;
}
