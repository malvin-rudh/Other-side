import type { SessionSummary } from '../data/schemas';

// The instant a Brief morning is read at: midnight WIB on that date. Broker data
// for session D is assumed available at D+1 00:00 WIB, so at this instant the
// newest session a price may come from is the one before the morning, and no
// later value can reach the visible UI, the DOM, a tooltip or the evidence.
export function briefCutoffMs(briefDate: string): number {
  return Date.parse(`${briefDate}T00:00:00+07:00`);
}

export interface BriefResolution {
  briefDate: string;
  marketClosedToday: boolean;
  snapshot: string | null;
  comparison: string | null;
  gaps: string[];
}

export function briefMorningDates(sessions: readonly SessionSummary[]): string[] {
  const capturedDates = sessions
    .filter((session) => session.status === 'captured')
    .map((session) => session.date)
    .sort();
  return sessions
    .filter(
      (session) =>
        session.status !== 'weekend' &&
        capturedDates.some((date) => date < session.date),
    )
    .map((session) => session.date)
    .sort();
}

export function resolveBrief(
  sessions: readonly SessionSummary[],
  briefDate: string,
): BriefResolution {
  const capturedBefore = (date: string): string | null => {
    const candidates = sessions
      .filter((session) => session.status === 'captured' && session.date < date)
      .map((session) => session.date)
      .sort();
    return candidates[candidates.length - 1] ?? null;
  };

  const snapshot = capturedBefore(briefDate);
  const comparison = snapshot !== null ? capturedBefore(snapshot) : null;
  const gaps =
    snapshot !== null
      ? sessions
          .filter(
            (session) =>
              (session.status === 'missing' || session.status === 'excluded') &&
              session.date > snapshot &&
              session.date < briefDate,
          )
          .map((session) => session.date)
          .sort()
      : [];

  return {
    briefDate,
    marketClosedToday: sessions.some(
      (session) => session.date === briefDate && session.status === 'holiday',
    ),
    snapshot,
    comparison,
    gaps,
  };
}
