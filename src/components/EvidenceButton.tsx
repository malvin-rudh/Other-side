import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { useTranslation } from '../i18n';

interface EvidenceButtonProps {
  factId: string;
  children: ReactNode;
  className?: string;
  // Overrides the default "Open evidence for {factId}" name so grouped
  // controls (charts, tables) can identify group, session and value.
  ariaLabel?: string;
  onActivate?: (factId: string, trigger: HTMLButtonElement) => void;
  // Quiet links carry no resting underline, so a sentence where every value
  // opens evidence still reads as plain text; hover and keyboard focus reveal
  // the link. Used on the Brief, where most readers scan rather than audit.
  quiet?: boolean;
}

const LINK_CLASS =
  'rounded px-1 text-inherit underline decoration-dotted decoration-lineStrong underline-offset-4 transition-colors hover:bg-brand/10 hover:decoration-brand';
const QUIET_CLASS =
  '-mx-0.5 rounded px-0.5 text-inherit decoration-dotted decoration-brand underline-offset-4 transition-colors hover:bg-brand/10 hover:underline focus-visible:underline';

export function EvidenceButton({ factId, children, className, ariaLabel, onActivate, quiet = false }: EvidenceButtonProps) {
  const { t } = useTranslation();
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onActivate?.(factId, event.currentTarget);
  };
  const label = ariaLabel ?? t('stock.evidenceAria', { id: factId });
  return (
    <button
      type="button"
      data-fact-id={factId}
      aria-label={label}
      title={label}
      onClick={handleClick}
      className={`${quiet ? QUIET_CLASS : LINK_CLASS} ${className ?? ''}`}
    >
      {children}
    </button>
  );
}

interface EvidenceTextProps {
  factId: string;
  children: ReactNode;
  className?: string;
  onActivate?: (factId: string, trigger: HTMLElement) => void;
}

// A quiet evidence link for a value inside a running sentence. A native button
// is always one unbreakable box, so a long phrase such as a direction verb
// jumps to its own line; this span wraps with the sentence and keeps button
// semantics, focus and Enter / Space activation.
export function EvidenceText({ factId, children, className, onActivate }: EvidenceTextProps) {
  const { t } = useTranslation();
  const label = t('stock.evidenceAria', { id: factId });
  const activate = (target: HTMLElement) => onActivate?.(factId, target);
  return (
    <span
      role="button"
      tabIndex={0}
      data-fact-id={factId}
      aria-label={label}
      title={label}
      onClick={(event) => activate(event.currentTarget)}
      onKeyDown={(event: KeyboardEvent<HTMLSpanElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate(event.currentTarget);
        }
      }}
      className={`cursor-pointer rounded decoration-dotted decoration-brand underline-offset-4 transition-colors [box-decoration-break:clone] hover:bg-brand/10 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${className ?? ''}`}
    >
      {children}
    </span>
  );
}
