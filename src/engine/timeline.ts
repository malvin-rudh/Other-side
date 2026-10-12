import type { SessionSummary } from '../data/schemas';

export type TimelineDayKind = 'captured' | 'holiday' | 'excluded' | 'missing';

export interface TimelineDay {
  date: string;
  kind: TimelineDayKind;
  reason: string;
}

export interface SessionTimeline {
  days: TimelineDay[];
  capturedDates: string[];
}

export function buildSessionTimeline(sessions: readonly SessionSummary[]): SessionTimeline {
  const days: TimelineDay[] = [];
  const capturedDates: string[] = [];
  for (const session of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    if (session.status === 'captured') {
      days.push({ date: session.date, kind: 'captured', reason: session.reason });
      capturedDates.push(session.date);
    } else if (session.status === 'holiday') {
      days.push({ date: session.date, kind: 'holiday', reason: session.reason });
    } else if (session.status === 'excluded' || session.status === 'missing') {
      days.push({ date: session.date, kind: session.status, reason: session.reason });
    }
  }
  return { days, capturedDates };
}

export function previousCapturedDate(timeline: SessionTimeline, selected: string): string | null {
  const before = timeline.capturedDates.filter((date) => date < selected);
  return before.length > 0 ? (before[before.length - 1] ?? null) : null;
}

export function nextCapturedDate(timeline: SessionTimeline, selected: string): string | null {
  return timeline.capturedDates.find((date) => date > selected) ?? null;
}
