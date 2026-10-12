import type { MouseEvent, ReactNode } from 'react';
import { useTranslation } from '../i18n';

interface EvidenceButtonProps {
  factId: string;
  children: ReactNode;
  className?: string;
  // Overrides the default "Open evidence for {factId}" name so grouped
  // controls (charts, tables) can identify group, session and value.
  ariaLabel?: string;
  onActivate?: (factId: string, trigger: HTMLButtonElement) => void;
}

export function EvidenceButton({ factId, children, className, ariaLabel, onActivate }: EvidenceButtonProps) {
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
      className={`rounded px-1 text-inherit underline decoration-dotted decoration-lineStrong underline-offset-4 transition-colors hover:bg-brand/10 hover:decoration-brand ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
