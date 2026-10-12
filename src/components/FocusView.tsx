import { useRef, type ReactNode } from 'react';
import { useTranslation } from '../i18n';
import { Icon } from './Icon';
import { useDialogTrap } from './useDialogTrap';

interface FocusViewProps {
  title: string;
  meta?: ReactNode;
  caveats?: readonly string[];
  trigger: HTMLButtonElement | null;
  fallbackTrigger?: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
}

// Presentation size for content that already exists on screen: same components,
// same context, no replay advance and no model call.
export function FocusView({
  title,
  meta,
  caveats,
  trigger,
  fallbackTrigger = null,
  onClose,
  children,
}: FocusViewProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useDialogTrap(panelRef, closeRef, onClose, trigger, fallbackTrigger);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-navy/50" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92vh] w-full max-w-5xl animate-panel-in flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
      >
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <span className="chip chip-line">
                <span aria-hidden="true">◷</span>
                {t('badge.historical')}
              </span>
            </div>
            {meta ? <div className="mt-1.5 text-xs leading-relaxed text-muted">{meta}</div> : null}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('focus.close')} className="btn btn-quiet px-2.5">
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto bg-canvas px-4 py-5 md:px-6">{children}</div>

        {caveats && caveats.length > 0 ? (
          <footer className="space-y-1 border-t border-line px-5 py-3">
            {caveats.map((caveat) => (
              <p key={caveat} className="note">
                {caveat}
              </p>
            ))}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
