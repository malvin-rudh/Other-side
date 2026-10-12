import type { ApprovedClaim, RenderedPart } from '../ai/claims';
import type { BrokerGroup } from '../data/schemas';
import type { Locale } from '../engine/context';
import { pickText, type Fact } from '../engine/facts';
import type { RadarStatus } from '../engine/radar';
import { formatSessionDate, formatShortDate, intlLocale, useTranslation, type MessageKey } from '../i18n';
import { EvidenceButton } from './EvidenceButton';

type OpenEvidence = (factId: string, trigger: HTMLButtonElement) => void;

const STATUS_CHIP: Record<RadarStatus, { className: string; glyph: string; labelKey: MessageKey }> = {
  observed: { className: 'chip-buy', glyph: '✓', labelKey: 'status.observed' },
  'not-observed': { className: 'chip-line', glyph: '✕', labelKey: 'status.notObserved' },
  'not-enough-data': { className: 'chip-unknown', glyph: '?', labelKey: 'status.notEnough' },
  unavailable: { className: 'chip-unknown', glyph: '○', labelKey: 'status.unavailable' },
};

const TONE_CLASS: Record<string, string> = {
  buy: 'font-semibold text-buy',
  sell: 'font-semibold text-sell',
  neutral: '',
};

const BAR_CLASS: Record<'buy' | 'sell' | 'flat', string> = {
  buy: 'bg-buy',
  sell: 'bg-sell',
  flat: 'bg-lineStrong',
};

export function StatusChip({ status }: { status: RadarStatus }) {
  const { t } = useTranslation();
  const spec = STATUS_CHIP[status];
  return (
    <span className={`chip shrink-0 ${spec.className}`}>
      <span aria-hidden="true">{spec.glyph}</span>
      {t(spec.labelKey)}
    </span>
  );
}

export function FactPeriodLabel({ fact, onOpenEvidence }: { fact: Fact; onOpenEvidence?: OpenEvidence }) {
  const { locale } = useTranslation();
  const { start, end } = fact.period;
  const text =
    start === end
      ? formatSessionDate(start, locale)
      : `${formatShortDate(start, locale)} → ${formatShortDate(end, locale)}`;
  if (!onOpenEvidence) return <span className="text-xs font-medium text-muted">{text}</span>;
  return (
    <EvidenceButton factId={fact.fact_id} className="text-xs font-medium text-muted" onActivate={onOpenEvidence}>
      {text}
    </EvidenceButton>
  );
}

// Approved wording only: the claim is rendered from its own reviewed parts, and
// every value slot keeps the evidence link it was built with.
export function ClaimSentence({ claim, onOpenEvidence }: { claim: ApprovedClaim; onOpenEvidence: OpenEvidence }) {
  const { locale } = useTranslation();
  const parts: RenderedPart[] | null = claim.parts.explained[locale];
  if (!parts) return <>{pickText(claim.wording.explained, locale)}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.kind === 'value' && part.factId ? (
          <EvidenceButton
            key={index}
            factId={part.factId}
            className={TONE_CLASS[part.tone ?? 'neutral']}
            onActivate={onOpenEvidence}
          >
            {part.text}
          </EvidenceButton>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

export function FactReason({ fact }: { fact: Fact }) {
  const { locale } = useTranslation();
  const text = fact.available
    ? pickText(fact.evidence.reason, locale)
    : pickText(fact.unavailable_reason ?? fact.coverage_note, locale);
  return <p className="mt-1.5 text-xs leading-relaxed text-muted">{text}</p>;
}

// Fact-level body for the timeline: what the row checked, or why it is withheld.
// The approved claim sentence stays with the card and the claim check, so one
// statement is not repeated verbatim in three places on the same screen.
export function FactCoverage({ fact }: { fact: Fact }) {
  const { locale } = useTranslation();
  const text = fact.available
    ? pickText(fact.coverage_note, locale)
    : pickText(fact.unavailable_reason ?? fact.coverage_note, locale);
  return <p className="mt-0.5 text-sm leading-relaxed text-muted">{text}</p>;
}

// The failed-streak comparison drawn from fact.value.comparison only: two
// proportional bars, signed lots, group labels, and evidence on each value.
// A fact without a comparison renders no bars at all.
export function StreakComparison({ fact, onOpenEvidence }: { fact: Fact; onOpenEvidence: OpenEvidence }) {
  const { t, locale } = useTranslation();
  const value = fact.value;
  if (value?.kind !== 'streak' || !value.comparison) return null;
  const comparison = value.comparison;
  const date = formatShortDate(comparison.date, locale);
  const rows = [
    { group: comparison.candidateGroup, lots: comparison.candidateValue },
    { group: comparison.otherGroup, lots: comparison.otherValue },
  ];
  const scale = Math.max(Math.abs(comparison.candidateValue), Math.abs(comparison.otherValue), 1);

  return (
    <div className="mt-2">
      <p className="text-xs font-medium text-muted">{t('radar.comparisonLabel', { date })}</p>
      <ul className="mt-1.5 space-y-1.5" aria-label={t('radar.comparisonAria', { date })}>
        {rows.map((row, index) => (
          <li key={`${row.group}-${index}`}>
            {index === 1 ? (
              <p className="mb-1 pl-1 text-[10px] uppercase tracking-[0.08em] text-mutedSoft sm:pl-[8.5rem]">
                {t('radar.versus')}
              </p>
            ) : null}
            {/* Label and signed value stay on one line; the bar drops below it on
                narrow screens so long group names are never truncated. */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:grid-cols-[7.5rem_minmax(0,1fr)_auto]">
              <span className="min-w-0 text-xs text-muted">{t(groupKey(row.group))}</span>
              <span
                aria-hidden="true"
                className="order-last col-span-2 block h-2 rounded-sm bg-line sm:order-none sm:col-span-1"
              >
                <span
                  className={`block h-2 rounded-sm ${BAR_CLASS[row.lots > 0 ? 'buy' : row.lots < 0 ? 'sell' : 'flat']}`}
                  style={{ width: `${Math.max(2, Math.round((Math.abs(row.lots) / scale) * 100))}%` }}
                />
              </span>
              <EvidenceButton
                factId={fact.fact_id}
                className={`justify-self-end whitespace-nowrap text-xs font-semibold tabular-nums ${
                  row.lots > 0 ? 'text-buy' : row.lots < 0 ? 'text-sell' : 'text-muted'
                }`}
                onActivate={onOpenEvidence}
              >
                {formatSigned(row.lots, locale)} {t('stock.flowLotsUnit')}
              </EvidenceButton>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CaveatList({ caveats }: { caveats: readonly string[] }) {
  if (caveats.length === 0) return null;
  return (
    <ul className="mt-2 space-y-0.5">
      {caveats.map((caveat) => (
        <li key={caveat} className="note">
          {caveat}
        </li>
      ))}
    </ul>
  );
}

function groupKey(group: BrokerGroup | 'residual'): MessageKey {
  switch (group) {
    case 'institution_facing':
      return 'stock.groupInstitution';
    case 'app_facing':
      return 'stock.groupApp';
    case 'other_mixed':
      return 'stock.groupOther';
    case 'unknown':
      return 'stock.groupUnknown';
    default:
      return 'stock.groupResidual';
  }
}

function formatSigned(value: number, locale: Locale): string {
  const grouped = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(
    Math.abs(value),
  );
  return value < 0 ? `−${grouped}` : `+${grouped}`;
}
