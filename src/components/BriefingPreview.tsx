import { useMemo, useRef, useState } from 'react';
import type { ApprovedClaimsDocument, RenderedPart } from '../ai/claims';
import type { BrokerGroup } from '../data/schemas';
import type { Locale } from '../engine/context';
import { pickText } from '../engine/facts';
import type { ChangedStripView } from '../engine/stockView';
import { formatSessionDate, intlLocale, useTranslation } from '../i18n';
import { EvidenceButton } from './EvidenceButton';
import { Icon } from './Icon';
import { useDialogTrap } from './useDialogTrap';

const OBSERVATION_LIMIT = 4;

const TONE_CLASS: Record<string, string> = {
  buy: 'font-semibold text-buy',
  sell: 'font-semibold text-sell',
  neutral: '',
};

interface BriefingPreviewProps {
  ticker: string;
  morning: string;
  snapshot: string;
  marketClosed: boolean;
  gaps: readonly string[];
  changed: ChangedStripView | null;
  approved: ApprovedClaimsDocument;
  trigger: HTMLButtonElement | null;
  fallbackTrigger?: HTMLElement | null;
  onClose: () => void;
  onOpenEvidence: (factId: string, trigger: HTMLButtonElement) => void;
}

interface PreviewRow {
  group: string;
  from: string;
  to: string;
  rising: boolean;
  unit: string;
  factId: string;
}

interface PreviewObservation {
  claimId: string;
  // wording.explained is the join of these same parts, so the sentence on screen,
  // the copied text and the .eml body are one canonical rendering.
  text: string;
  parts: RenderedPart[];
  factIds: string[];
}

interface PreviewModel {
  subject: string;
  previewOnly: string;
  historical: string;
  morningLabel: string;
  morning: string;
  snapshotLabel: string;
  snapshot: string;
  notices: string[];
  changedTitle: string;
  changedRange: string | null;
  changedFactId: string | null;
  rows: PreviewRow[];
  noChange: string | null;
  observedTitle: string;
  observations: PreviewObservation[];
  noObservations: string;
  evidenceLabel: string;
  caveatsTitle: string;
  caveats: string[];
  footer: string[];
  contextLabel: string;
  context: string;
}

type Status = 'idle' | 'copied' | 'copyFailed' | 'downloaded';

export function BriefingPreview({
  ticker,
  morning,
  snapshot,
  marketClosed,
  gaps,
  changed,
  approved,
  trigger,
  fallbackTrigger = null,
  onClose,
  onOpenEvidence,
}: BriefingPreviewProps) {
  const { t, locale } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  useDialogTrap(panelRef, closeRef, onClose, trigger, fallbackTrigger);

  const model = useMemo<PreviewModel>(() => {
    const groupLabel = (group: BrokerGroup): string =>
      t(
        group === 'institution_facing'
          ? 'stock.groupInstitution'
          : group === 'app_facing'
            ? 'stock.groupApp'
            : group === 'unknown'
              ? 'stock.groupUnknown'
              : 'stock.groupOther',
      );
    const notices: string[] = [];
    if (marketClosed) notices.push(t('brief.marketClosed'));
    if (gaps.length > 0) {
      notices.push(
        t('brief.gapNote', {
          gap: gaps.map((gap) => formatSessionDate(gap, locale)).join(', '),
          snapshot: formatSessionDate(snapshot, locale),
        }),
      );
    }
    const observedClaims = approved.claims
      .filter((claim) => claim.available && claim.section === 'observed')
      .slice(0, OBSERVATION_LIMIT);
    const observations: PreviewObservation[] = observedClaims.map((claim) => ({
      claimId: claim.claim_id,
      text: pickText(claim.wording.explained, locale),
      parts: claim.parts.explained[locale] ?? [{ kind: 'text', text: pickText(claim.wording.explained, locale) }],
      factIds: claim.facts.flatMap((key) => {
        const fact = approved.facts.find((entry) => entry.key === key);
        return fact ? [fact.fact_id] : [];
      }),
    }));
    return {
      subject: t('preview.subject', { ticker, date: formatSessionDate(morning, locale) }),
      previewOnly: t('preview.previewOnly'),
      historical: t('badge.historical'),
      morningLabel: t('preview.morningLabel'),
      morning: formatSessionDate(morning, locale),
      snapshotLabel: t('preview.snapshotLabel'),
      snapshot: t('preview.snapshotValue', { date: formatSessionDate(snapshot, locale) }),
      notices,
      changedTitle: t('changed.title'),
      changedRange: changed
        ? t('changed.range', {
            from: formatSessionDate(changed.fromDate, locale),
            to: formatSessionDate(changed.toDate, locale),
          })
        : null,
      changedFactId: changed?.factId ?? null,
      rows: changed
        ? changed.moves.map((move) => ({
            group: groupLabel(move.group),
            from: formatSigned(move.fromLots, locale),
            to: formatSigned(move.toLots, locale),
            rising: move.toLots > move.fromLots,
            unit: t('stock.flowLotsUnit'),
            factId: changed.factId,
          }))
        : [],
      noChange: changed ? null : t('changed.noPrevious'),
      observedTitle: t('preview.observedTitle'),
      observations,
      noObservations: t('preview.noObservations'),
      evidenceLabel: t('preview.evidenceLabel'),
      caveatsTitle: t('preview.caveatsTitle'),
      caveats: [...new Set(observedClaims.flatMap((claim) => claim.caveats.map((caveat) => pickText(caveat, locale))))],
      footer: [t('footer.line')],
      contextLabel: t('preview.contextLabel'),
      context: approved.contextKey,
    };
  }, [t, locale, ticker, morning, snapshot, marketClosed, gaps, changed, approved]);

  const text = useMemo(() => toPlainText(model), [model]);

  const copy = async () => {
    if (!navigator.clipboard) {
      setStatus('copyFailed');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('copyFailed');
    }
  };

  const download = () => {
    const blob = new Blob([toEml(model, text)], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `other-side-brief-${morning}.eml`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStatus('downloaded');
  };

  const statusText =
    status === 'copied'
      ? t('preview.copied')
      : status === 'copyFailed'
        ? t('preview.copyFailed')
        : status === 'downloaded'
          ? t('preview.downloaded')
          : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-navy/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('preview.title')}
        className="relative flex max-h-[92vh] w-full max-w-2xl animate-panel-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
      >
        <header className="border-b border-line px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">{t('preview.title')}</h2>
                <span className="chip chip-line">
                  <span aria-hidden="true">◷</span>
                  {model.historical}
                </span>
              </div>
              <p className="mt-1.5 inline-flex">
                <span className="chip chip-brand">
                  <Icon name="mail" className="h-3.5 w-3.5" />
                  {model.previewOnly}
                </span>
              </p>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t('preview.close')}
              className="btn btn-quiet shrink-0 px-2.5"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="mt-3 text-sm text-muted">
            <span className="eyebrow mr-2">{t('preview.subjectLabel')}</span>
            <span className="font-medium text-ink">{model.subject}</span>
          </p>
        </header>

        <div className="flex-1 overflow-y-auto bg-canvas px-4 py-5">
          <article className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-5 shadow-card">
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted">{model.morningLabel}</dt>
                <dd className="min-w-0 font-medium text-ink">{model.morning}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-muted">{model.snapshotLabel}</dt>
                <dd className="min-w-0 text-ink">{model.snapshot}</dd>
              </div>
            </dl>

            {model.notices.length > 0 ? (
              <div className="mt-4 space-y-2">
                {model.notices.map((notice) => (
                  <p key={notice} className="rounded-lg border border-brand/35 bg-brand/10 px-3 py-2 text-xs leading-relaxed text-brandDeep">
                    {notice}
                  </p>
                ))}
              </div>
            ) : null}

            <section className="mt-5 border-t border-line pt-4" aria-label={model.changedTitle}>
              <h3 className="text-sm font-semibold text-ink">{model.changedTitle}</h3>
              {model.changedRange ? <p className="mt-0.5 text-xs text-muted">{model.changedRange}</p> : null}
              {model.changedFactId ? (
                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span className="eyebrow">{model.evidenceLabel}</span>
                  <EvidenceButton
                    factId={model.changedFactId}
                    className="break-all text-muted"
                    onActivate={onOpenEvidence}
                  >
                    {model.changedFactId}
                  </EvidenceButton>
                </p>
              ) : null}
              {model.rows.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {model.rows.map((row) => (
                    <li key={row.group} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                      <span className="font-medium text-ink">{row.group}</span>
                      <EvidenceButton factId={row.factId} onActivate={onOpenEvidence}>
                        <span className="tabular-nums text-muted">{row.from}</span>
                        <span aria-hidden="true" className="mx-1.5 text-xs text-muted">
                          {row.rising ? '▲' : '▼'}
                        </span>
                        <span className={`tabular-nums ${row.to.startsWith('−') ? 'font-semibold text-sell' : 'font-semibold text-buy'}`}>
                          {row.to}
                        </span>
                        <span className="ml-1.5 text-xs text-muted">{t('stock.flowLotsUnit')}</span>
                      </EvidenceButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted">{model.noChange}</p>
              )}
            </section>

            <section className="mt-5 border-t border-line pt-4" aria-label={model.observedTitle}>
              <h3 className="text-sm font-semibold text-ink">{model.observedTitle}</h3>
              {model.observations.length === 0 ? (
                <p className="mt-2 text-sm text-muted">{model.noObservations}</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {model.observations.map((observation) => (
                    <li key={observation.claimId}>
                      <p className="text-sm leading-relaxed text-ink">
                        {observation.parts.map((part, index) =>
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
                      </p>
                      {observation.factIds.length > 0 ? (
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                          <span className="eyebrow">{t('preview.evidenceLabel')}</span>
                          {observation.factIds.map((factId) => (
                            <EvidenceButton
                              key={factId}
                              factId={factId}
                              className="break-all text-muted"
                              onActivate={onOpenEvidence}
                            >
                              {factId}
                            </EvidenceButton>
                          ))}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {model.caveats.length > 0 ? (
              <section className="mt-5 border-t border-line pt-4" aria-label={model.caveatsTitle}>
                <h3 className="eyebrow">{model.caveatsTitle}</h3>
                <ul className="mt-2 space-y-1">
                  {model.caveats.map((caveat) => (
                    <li key={caveat} className="note">
                      {caveat}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <footer className="mt-5 space-y-1 border-t border-line pt-4">
              {model.footer.map((line) => (
                <p key={line} className="note">
                  {line}
                </p>
              ))}
              <p className="note break-all">
                <span className="font-semibold">{model.contextLabel}:</span> {model.context}
              </p>
            </footer>
          </article>
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={copy} className="btn btn-primary">
            <Icon name="copy" className="h-3.5 w-3.5" />
            {t('preview.copy')}
          </button>
          <button type="button" onClick={download} className="btn btn-quiet">
            <Icon name="download" className="h-3.5 w-3.5" />
            {t('preview.download')}
          </button>
          <p role="status" aria-live="polite" className="ml-auto text-xs text-muted">
            {statusText}
          </p>
        </footer>
      </div>
    </div>
  );
}

// One source of truth for the exported text, built from the same model the
// preview renders, so the download and the copy always match what is on screen.
function toPlainText(model: PreviewModel): string {
  const lines: string[] = [
    model.subject,
    '',
    model.previewOnly,
    model.historical,
    '',
    `${model.morningLabel}: ${model.morning}`,
    `${model.snapshotLabel}: ${model.snapshot}`,
  ];
  for (const notice of model.notices) lines.push(notice);
  lines.push('', model.changedTitle + (model.changedRange ? ` (${model.changedRange})` : ''));
  if (model.changedFactId !== null) {
    lines.push(
      `${model.evidenceLabel}: ${model.changedFactId}${model.changedRange ? ` · ${model.changedRange}` : ''}`,
    );
  }
  if (model.rows.length > 0) {
    for (const row of model.rows) {
      lines.push(`${row.group}: ${row.from} → ${row.to} ${row.unit} [${row.factId}]`);
    }
  } else if (model.noChange) {
    lines.push(model.noChange);
  }
  lines.push('', model.observedTitle);
  if (model.observations.length === 0) {
    lines.push(model.noObservations);
  } else {
    for (const observation of model.observations) {
      lines.push(`- ${observation.text}`);
      if (observation.factIds.length > 0) {
        lines.push(`  ${model.evidenceLabel}: ${observation.factIds.join(', ')}`);
      }
    }
  }
  if (model.caveats.length > 0) {
    lines.push('', model.caveatsTitle);
    for (const caveat of model.caveats) lines.push(`- ${caveat}`);
  }
  lines.push('');
  for (const line of model.footer) lines.push(line);
  lines.push(`${model.contextLabel}: ${model.context}`);
  return lines.join('\n');
}

function toEml(model: PreviewModel, body: string): string {
  const headers = [
    'MIME-Version: 1.0',
    'X-Unsent: 1',
    `Date: ${new Date().toUTCString()}`,
    `Subject: ${encodeSubject(model.subject)}`,
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  return `${headers.join('\r\n')}\r\n\r\n${body.replace(/\r?\n/g, '\r\n')}\r\n`;
}

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7e]*$/.test(subject)) return subject;
  const bytes = new TextEncoder().encode(subject);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `=?UTF-8?B?${btoa(binary)}?=`;
}

function formatSigned(value: number, locale: Locale): string {
  const grouped = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(
    Math.abs(value),
  );
  return value < 0 ? `−${grouped}` : `+${grouped}`;
}
