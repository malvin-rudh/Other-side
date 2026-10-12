import { useState } from 'react';
import { useTranslation, formatShortDate, intlLocale, type MessageKey } from '../i18n';
import { pickText } from '../engine/facts';
import type { WhatIfClaimReason, WhatIfView } from '../engine/whatIf';

interface WhatIfPanelProps {
  view: WhatIfView;
  onReset: () => void;
}

export function WhatIfPanel({ view, onReset }: WhatIfPanelProps) {
  const { t, locale } = useTranslation();
  const [showSurvived, setShowSurvived] = useState(false);

  const formatInt = (value: number) => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);

  const formatSigned = (value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${formatInt(Math.abs(value))}`;
  };

  const changedGroups = view.groups.filter((row) => row.direction !== 'unchanged');

  return (
    <section
      aria-label={t('whatIf.groupTotalsTitle')}
      className="card card-pad border-brand/45 border-l-4 border-l-brand"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{t('whatIf.groupTotalsTitle')}</h2>
        <span className="chip chip-brand">
          <span aria-hidden="true">⚖</span>
          {t('whatIf.badge', { code: view.brokerCode })}
        </span>
      </div>

      {view.groups.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{t('states.unavailable')}</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="bg-surfaceAlt">
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 pr-3 font-semibold">{t('whatIf.groupColumn')}</th>
                <th className="py-1.5 pr-3 text-right font-semibold">{t('whatIf.before')}</th>
                <th className="py-1.5 text-right font-semibold">{t('whatIf.after')}</th>
              </tr>
            </thead>
            <tbody>
              {view.groups.map((row) => (
                <tr key={row.group} className="border-t border-line">
                  <td className="py-1.5 pr-3">
                    <GroupName group={row.group} />
                  </td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums ${signedClass(row.before)}`}>
                    {formatSigned(row.before)}
                  </td>
                  <td className={`py-1.5 text-right tabular-nums ${signedClass(row.after)}`}>{formatSigned(row.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {changedGroups.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-xs text-muted">
          {changedGroups.map((row) => (
            <li key={row.group}>
              <GroupName group={row.group} />: {t(`whatIf.direction.${row.direction}`)}
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="eyebrow mt-5">{t('whatIf.changedTitle')}</h3>
      {view.changed.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted">{t('whatIf.noClaimChanges')}</p>
      ) : (
        <ul className="mt-2 space-y-2 text-sm">
          {view.changed.map((change, index) => (
            <li key={index} className="card-inset p-3">
              <p className="eyebrow">
                {change.change === 'now_available'
                  ? t('whatIf.nowAvailable')
                  : change.change === 'no_longer_available'
                    ? t('whatIf.noLongerAvailable')
                    : t('whatIf.wordingChanged')}
              </p>
              {change.change === 'wording_changed' ? (
                <>
                  <p className="mt-1 leading-relaxed text-ink">
                    <span className="text-muted">{t('whatIf.before')}: </span>
                    {change.before ? pickText(change.before, locale) : null}
                  </p>
                  <p className="mt-1 leading-relaxed text-ink">
                    <span className="text-muted">{t('whatIf.after')}: </span>
                    {change.after ? pickText(change.after, locale) : null}
                  </p>
                </>
              ) : (
                <p className="mt-1 leading-relaxed text-ink">
                  {change.change === 'now_available'
                    ? change.after
                      ? pickText(change.after, locale)
                      : null
                    : change.before
                      ? pickText(change.before, locale)
                      : null}
                </p>
              )}
              {change.reason ? (
                <p className="mt-1 text-xs leading-snug text-muted">
                  <span className="font-semibold">{t('whatIf.reasonLabel')}: </span>
                  <ReasonText reason={change.reason} />
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <h3 className="eyebrow mt-5">{t('whatIf.survivedTitle')}</h3>
      {view.survived.length === 0 ? (
        <p className="mt-1.5 text-sm text-muted">{t('whatIf.noClaimChanges')}</p>
      ) : (
        <div className="mt-1.5">
          <p className="text-sm text-ink">{t('whatIf.survivedCount', { count: String(view.survived.length) })}</p>
          <button type="button" onClick={() => setShowSurvived((value) => !value)} className="btn btn-quiet mt-2 px-2.5 py-1 text-xs">
            {showSurvived ? t('whatIf.hide') : t('whatIf.show')}
          </button>
          {showSurvived ? (
            <ul className="mt-2 space-y-1.5 text-sm">
              {view.survived.map((sentence, index) => (
                <li key={index} className="leading-relaxed text-ink">
                  {pickText(sentence, locale)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      <p className="note mt-4">{t('whatIf.rowsNote', { code: view.brokerCode })}</p>

      <button type="button" onClick={onReset} className="btn btn-primary mt-4">
        {t('whatIf.reset')}
      </button>
    </section>
  );
}

function ReasonText({ reason }: { reason: WhatIfClaimReason }) {
  const { t, locale } = useTranslation();

  const formatInt = (value: number) => new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);

  const formatSigned = (value: number) => {
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return `${sign}${formatInt(Math.abs(value))}`;
  };

  if (reason.kind === 'text') return <>{pickText(reason.text, locale)}</>;
  if (reason.kind === 'streak_break') {
    return (
      <>
        {t('whatIf.reasonStreakBreak', {
          group: t(groupLabelKey(reason.group)),
          date: formatShortDate(reason.date, locale),
          before: formatSigned(reason.before),
          after: formatSigned(reason.after),
          code: reason.brokerCode,
        })}
      </>
    );
  }
  return (
    <>
      {t('whatIf.reasonStreakNotLargest', {
        group: t(groupLabelKey(reason.group)),
        date: formatShortDate(reason.date, locale),
        code: reason.brokerCode,
      })}
    </>
  );
}

function groupLabelKey(group: string): MessageKey {
  const key =
    group === 'app_facing'
      ? 'stock.groupApp'
      : group === 'institution_facing'
        ? 'stock.groupInstitution'
        : group === 'other_mixed'
          ? 'stock.groupOther'
          : group === 'unknown'
            ? 'stock.groupUnknown'
            : 'stock.groupResidual';
  return key as MessageKey;
}

function GroupName({ group }: { group: string }) {
  const { t } = useTranslation();
  if (group === 'unknown') {
    return <span className="chip chip-unknown">{t(groupLabelKey(group))}</span>;
  }
  return <span className={group === 'residual' ? 'text-muted' : 'font-medium text-ink'}>{t(groupLabelKey(group))}</span>;
}

function signedClass(value: number): string {
  if (value > 0) return 'font-semibold text-buy';
  if (value < 0) return 'font-semibold text-sell';
  return 'font-semibold text-muted';
}
