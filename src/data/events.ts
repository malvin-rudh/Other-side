import type { SiniEvent } from './schemas';

export function isEventAvailableAtCutoff(event: Pick<SiniEvent, 'availableAt'>, cutoffAt: string): boolean {
  return Date.parse(event.availableAt) <= Date.parse(cutoffAt);
}
