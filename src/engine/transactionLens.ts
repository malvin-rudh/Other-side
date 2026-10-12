import type { BrokerGroup } from '../data/schemas';
import { factByKey, type BilingualText, type Fact, type FactsContext, type FactsData, type FactsDocument } from './facts';
import {
  isSessionEligibleAtCutoff,
  rowsEligibleAtCutoff,
  streakDayCells,
  type PredicateStatus,
  type StreakDayCell,
} from './predicates';

export type ComparisonKind =
  | 'buying-increased'
  | 'buying-decreased'
  | 'selling-increased'
  | 'selling-decreased'
  | 'reversal-to-buying'
  | 'reversal-to-selling'
  | 'flat';

export interface LensRow {
  group: BrokerGroup;
  fromLots: number;
  toLots: number;
  kind: ComparisonKind;
}

export interface StreakCheckView {
  key: 'C12' | 'C13';
  factId: string;
  available: boolean;
  status: PredicateStatus | null;
  approximate: BilingualText | null;
  note: BilingualText | null;
  unavailableReason: BilingualText | null;
  // Per-day predicate outcomes across the same five-session window the fact
  // used; empty when the window itself is not fully captured.
  cells: StreakDayCell[];
}

export interface TransactionLensView {
  available: boolean;
  factId: string | null;
  fromDate: string | null;
  toDate: string | null;
  // Number of missing or excluded market sessions skipped between the two
  // compared sessions, so the panel can say the pair is not adjacent.
  missingBetween: number;
  rows: LensRow[];
  headline: LensRow | null;
  checks: StreakCheckView[];
}

const LENS_GROUPS: readonly BrokerGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

// Classifies the observed net-lot move between the previous captured session
// and the selected one. Ties stay flat; a reversal needs opposite nonzero
// signs. Moving to zero shrinks the starting side (selling or buying decreased
// to zero), and moving off zero grows the landing side — never the other way.
export function compareKind(fromLots: number, toLots: number): ComparisonKind {
  if (fromLots === toLots) return 'flat';
  if (fromLots < 0 && toLots > 0) return 'reversal-to-buying';
  if (fromLots > 0 && toLots < 0) return 'reversal-to-selling';
  if (toLots === 0) return fromLots < 0 ? 'selling-decreased' : 'buying-decreased';
  if (fromLots === 0) return toLots > 0 ? 'buying-increased' : 'selling-increased';
  if (toLots > 0) return toLots > fromLots ? 'buying-increased' : 'buying-decreased';
  return Math.abs(toLots) > Math.abs(fromLots) ? 'selling-increased' : 'selling-decreased';
}

export function buildTransactionLens(data: FactsData, document: FactsDocument): TransactionLensView {
  const c25 = factByKey(document, 'C25');
  const view: TransactionLensView = {
    available: false,
    factId: c25?.fact_id ?? null,
    fromDate: null,
    toDate: null,
    missingBetween: 0,
    rows: [],
    headline: null,
    checks: [streakCheck(data, document.context, document, 'C12', 'positive'), streakCheck(data, document.context, document, 'C13', 'main-buyer')],
  };
  if (!c25?.available || c25.value?.kind !== 'daily-group-nets' || c25.value.days.length !== 2) return view;
  const [from, to] = c25.value.days;
  if (!from || !to) return view;
  view.available = true;
  view.fromDate = from.date;
  view.toDate = to.date;
  view.missingBetween = data.sessions.filter(
    (session) =>
      session.date > from.date &&
      session.date < to.date &&
      (session.status === 'missing' || session.status === 'excluded'),
  ).length;
  view.rows = LENS_GROUPS.map((group) => ({
    group,
    fromLots: from.groups[group],
    toLots: to.groups[group],
    kind: compareKind(from.groups[group], to.groups[group]),
  }));
  const changed = view.rows.filter((row) => row.kind !== 'flat');
  view.headline =
    changed.slice().sort((a, b) => Math.abs(b.toLots - b.fromLots) - Math.abs(a.toLots - a.fromLots))[0] ??
    view.rows[0] ??
    null;
  return view;
}

function streakCheck(
  data: FactsData,
  context: FactsContext,
  document: FactsDocument,
  key: 'C12' | 'C13',
  flavour: 'positive' | 'main-buyer',
): StreakCheckView {
  const fact: Fact | undefined = factByKey(document, key);
  if (!fact) {
    return { key, factId: '', available: false, status: null, approximate: null, note: null, unavailableReason: null, cells: [] };
  }
  const value = fact.available && fact.value?.kind === 'streak' ? fact.value : null;
  return {
    key,
    factId: fact.fact_id,
    available: fact.available,
    status: value?.status ?? null,
    approximate: fact.approximate,
    note: fact.coverage_note,
    unavailableReason: fact.unavailable_reason ?? null,
    cells: fact.available ? lensStreakCells(data, context, flavour) : [],
  };
}

// Recomputes the per-day outcomes over the same cutoff-filtered sessions, rows
// and window buildStreak used for this document, so the cells can never show a
// window other than the one behind the fact's own status.
function lensStreakCells(data: FactsData, context: FactsContext, flavour: 'positive' | 'main-buyer'): StreakDayCell[] {
  const periodSessions = data.sessions
    .filter(
      (session) =>
        isSessionEligibleAtCutoff(session.date, context.cutoffAt) && session.date >= context.periodStart,
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const market = periodSessions.filter((session) => session.status !== 'holiday' && session.status !== 'weekend');
  const visibleEnd = market[market.length - 1]?.date ?? context.sessionDate;
  const endingDate = context.sessionDate <= visibleEnd ? context.sessionDate : visibleEnd;
  const scenario =
    context.unknownBrokerCodes && context.unknownBrokerCodes.length > 0
      ? { unknownBrokerCodes: [...context.unknownBrokerCodes] }
      : undefined;
  return streakDayCells(
    flavour,
    rowsEligibleAtCutoff(data.rows, context.cutoffAt),
    data.brokers,
    periodSessions,
    'institution_facing',
    endingDate,
    5,
    scenario,
  );
}
