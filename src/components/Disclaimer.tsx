import type { ReactNode } from 'react';
import { useTranslation } from '../i18n';

// A data or method caveat, set apart from the content as an italic disclaimer.
export function Disclaimer({ children, className = '' }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={`text-xs italic leading-relaxed text-muted ${className}`}>
      <span className="font-semibold">{t('brief.disclaimer')}:</span> {children}
    </p>
  );
}
