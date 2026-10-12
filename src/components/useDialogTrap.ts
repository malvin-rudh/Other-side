import { useEffect, type RefObject } from 'react';

// Restores focus on close. The trigger can be detached when opening the drawer
// unmounted the dialog that held it, so a mounted launcher is kept as fallback.
export function restoreFocus(trigger: HTMLElement | null, fallback: HTMLElement | null): void {
  const target =
    trigger !== null && document.contains(trigger)
      ? trigger
      : fallback !== null && document.contains(fallback)
        ? fallback
        : null;
  target?.focus();
}

// Shared trap for the presentation dialogs added on top of the existing sheets:
// Escape closes, Tab cycles the panel and, while the demo coach is on screen,
// its own Next, Back and Hide buttons, and focus returns to the trigger.
export function useDialogTrap(
  panelRef: RefObject<HTMLDivElement>,
  closeRef: RefObject<HTMLButtonElement>,
  onClose: () => void,
  trigger: HTMLElement | null,
  fallback: HTMLElement | null = null,
): void {
  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const panelFocusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      const coach = document.querySelector<HTMLElement>('[data-demo-coach]');
      const coachButtons = coach ? Array.from(coach.querySelectorAll<HTMLElement>('button')) : [];
      const focusable = [...panelFocusable, ...coachButtons];
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      event.preventDefault();
      const next = event.shiftKey
        ? index <= 0
          ? focusable[focusable.length - 1]
          : focusable[index - 1]
        : index === -1 || index === focusable.length - 1
          ? focusable[0]
          : focusable[index + 1];
      next?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreFocus(trigger, fallback);
    };
  }, [onClose, trigger, fallback, panelRef, closeRef]);
}
