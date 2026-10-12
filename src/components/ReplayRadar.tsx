import { useMemo, useState } from 'react';
import type { ApprovedClaimsDocument } from '../ai/claims';
import { pickText } from '../engine/facts';
import { buildRadarItems, type RadarCategory, type RadarItem } from '../engine/radar';
import { useTranslation, type MessageKey } from '../i18n';
import { EvidenceButton } from './EvidenceButton';
import { CaveatList, FactCoverage, FactPeriodLabel, StatusChip, StreakComparison } from './ClaimStatus';

type Filter = 'all' | RadarCategory;

const FILTERS: readonly Filter[] = ['all', 'activity', 'coverage'];

interface ReplayRadarProps {
  approved: ApprovedClaimsDocument;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
  variant?: 'brief' | 'stock';
}

export function ReplayRadar({ approved, onOpenEvidence, variant = 'stock' }: ReplayRadarProps) {
  const { t, locale } = useTranslation();
  const [filter, setFilter] = useState<Filter>('all');
  const items = useMemo(() => buildRadarItems(approved.facts), [approved.facts]);
  const filtered = filter === 'all' ? items : items.filter((item) => item.category === filter);
  const visible = variant === 'brief' ? filtered.slice(0, 3) : filtered;
  const caveats = useMemo(() => {
    const byId = new Map(approved.claims.map((claim) => [claim.claim_id, claim]));
    const texts = visible.flatMap((item) => {
      const claim = byId.get(item.claimId);
      return claim && claim.available ? claim.caveats.map((caveat) => pickText(caveat, locale)) : [];
    });
    return [...new Set(texts)];
  }, [approved.claims, visible, locale]);

  return (
    <section aria-label={t('radar.title')} className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{t('radar.title')}</h2>
        <span className="chip chip-line">
          <span aria-hidden="true">◷</span>
          {t('badge.historical')}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{t('radar.intro')}</p>

      <div role="group" aria-label={t('radar.filterAria')} className="mt-3 flex flex-wrap gap-1.5">
        {FILTERS.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              filter === key
                ? 'border-brand bg-brand text-navy'
                : 'border-line bg-surface text-muted hover:border-brand/60 hover:text-brandDeep'
            }`}
          >
            {t(`radar.filter.${key}` as MessageKey)}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-lineStrong bg-surfaceAlt px-3 py-6 text-center text-sm text-muted">
          {t('radar.empty')}
        </p>
      ) : (
        <ol key={filter} className="mt-4 animate-fade-in space-y-4">
          {visible.map((item) => (
            <RadarRow key={item.key} item={item} onOpenEvidence={onOpenEvidence} />
          ))}
        </ol>
      )}

      {caveats.length > 0 ? (
        <footer className="mt-4 border-t border-line pt-3">
          <CaveatList caveats={caveats} />
        </footer>
      ) : null}
    </section>
  );
}

function RadarRow({
  item,
  onOpenEvidence,
}: {
  item: RadarItem;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}) {
  const { t, locale } = useTranslation();

  return (
    <li className="relative border-l-2 border-line pl-4">
      <span
        aria-hidden="true"
        className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full border border-surface bg-brand"
      />
      <div className="flex flex-wrap items-center gap-2">
        <FactPeriodLabel fact={item.fact} onOpenEvidence={onOpenEvidence} />
        <StatusChip status={item.status} />
      </div>
      <p className="mt-1 text-sm font-semibold text-ink">{t(`radar.item.${item.key}` as MessageKey)}</p>
      {item.fact.value?.kind === 'coverage' ? (
        <p className="mt-0.5">
          <EvidenceButton factId={item.fact.fact_id} className="text-sm font-semibold" onActivate={onOpenEvidence}>
            {pickText(item.fact.approximate, locale)}
          </EvidenceButton>
        </p>
      ) : null}
      <FactCoverage fact={item.fact} />
      <StreakComparison fact={item.fact} onOpenEvidence={onOpenEvidence} />
    </li>
  );
}
