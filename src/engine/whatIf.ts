import { buildApprovedClaims, type ApprovedClaim } from '../ai/claims';
import type { BrokerGroup } from '../data/schemas';
import { buildFacts, factByKey, type BilingualText, type FactsContext, type FactsData, type FactsDocument } from './facts';
import type { FlowScenario, GroupNet } from './flows';
import { groupNetForDate } from './predicates';

export const WHAT_IF_PREFIX = 'unknown-broker:';

export function whatIfBrokerCode(scenario: string): string | null {
  if (!scenario.startsWith(WHAT_IF_PREFIX)) return null;
  const code = scenario.slice(WHAT_IF_PREFIX.length).trim();
  return code.length > 0 ? code : null;
}

export const BASELINE_WIRE_SCENARIO = 'baseline';

export function toWireScenario(storeScenario: string): string {
  return storeScenario === 'default' ? BASELINE_WIRE_SCENARIO : storeScenario;
}

export function parseWireScenario(wire: string): { scenario: string; unknownBrokerCode: string | null } | null {
  if (wire === BASELINE_WIRE_SCENARIO) return { scenario: 'default', unknownBrokerCode: null };
  const code = whatIfBrokerCode(wire);
  if (code !== null) return { scenario: wire, unknownBrokerCode: code };
  return null;
}

export const WHAT_IF_GROUPS: readonly (keyof GroupNet)[] = [
  'app_facing',
  'institution_facing',
  'other_mixed',
  'unknown',
  'residual',
];

const STREAK_GROUPS: readonly BrokerGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

export type WhatIfDirection =
  | 'unchanged'
  | 'remains_positive'
  | 'remains_negative'
  | 'to_zero'
  | 'from_zero'
  | 'flipped';

export interface WhatIfGroupRow {
  group: keyof GroupNet;
  before: number;
  after: number;
  direction: WhatIfDirection;
}

export type WhatIfClaimChangeKind = 'now_available' | 'no_longer_available' | 'wording_changed';

export type WhatIfClaimReason =
  | { kind: 'streak_break'; group: BrokerGroup; date: string; before: number; after: number; brokerCode: string }
  | { kind: 'streak_not_largest'; group: BrokerGroup; date: string; brokerCode: string }
  | { kind: 'text'; text: BilingualText };

export interface WhatIfClaimChange {
  change: WhatIfClaimChangeKind;
  before: BilingualText | null;
  after: BilingualText | null;
  reason: WhatIfClaimReason | null;
}

export interface WhatIfView {
  brokerCode: string;
  period: { start: string; end: string } | null;
  groups: WhatIfGroupRow[];
  changed: WhatIfClaimChange[];
  survived: BilingualText[];
}

export function buildWhatIfView(brokerCode: string, baseContext: FactsContext, data: FactsData): WhatIfView {
  const overrideContext: FactsContext = { ...baseContext, unknownBrokerCodes: [brokerCode] };
  const baselineDoc = buildFacts(baseContext, data);
  const overrideDoc = buildFacts(overrideContext, data);

  const beforeNets = groupNetsOf(baselineDoc);
  const afterNets = groupNetsOf(overrideDoc);

  const groups: WhatIfGroupRow[] = [];
  if (beforeNets !== null && afterNets !== null) {
    for (const group of WHAT_IF_GROUPS) {
      const before = beforeNets[group];
      const after = afterNets[group];
      groups.push({ group, before, after, direction: classifyDirection(before, after) });
    }
  }

  const baselineClaims = buildApprovedClaims(baseContext, baselineDoc).claims;
  const overrideClaims = buildApprovedClaims(overrideContext, overrideDoc).claims;
  const baselineById = new Map(baselineClaims.map((claim) => [claim.claim_id, claim]));
  const changed: WhatIfClaimChange[] = [];
  const survived: BilingualText[] = [];
  for (const after of overrideClaims) {
    const before = baselineById.get(after.claim_id);
    if (!before) continue;
    if (before.available && !after.available) {
      changed.push({
        change: 'no_longer_available',
        before: before.wording.explained,
        after: null,
        reason: buildUnavailableReason(before, baselineDoc, overrideDoc, baseContext, overrideContext, data, brokerCode),
      });
    } else if (!before.available && after.available) {
      changed.push({ change: 'now_available', before: null, after: after.wording.explained, reason: null });
    } else if (before.available && after.available) {
      if (JSON.stringify(before.wording) !== JSON.stringify(after.wording)) {
        changed.push({
          change: 'wording_changed',
          before: before.wording.explained,
          after: after.wording.explained,
          reason: null,
        });
      } else {
        survived.push(after.wording.explained);
      }
    }
  }

  const periodFact = factByKey(baselineDoc, 'C04');
  return {
    brokerCode,
    period: periodFact ? { start: periodFact.period.start, end: periodFact.period.end } : null,
    groups,
    changed,
    survived,
  };
}

function groupNetsOf(document: FactsDocument): GroupNet | null {
  const fact = factByKey(document, 'C04');
  if (!fact?.available || !fact.value || fact.value.kind !== 'group-nets') return null;
  return fact.value.nets;
}

function classifyDirection(before: number, after: number): WhatIfDirection {
  if (before === after) return 'unchanged';
  if (after === 0) return 'to_zero';
  if (before === 0) return 'from_zero';
  if (before > 0 && after > 0) return 'remains_positive';
  if (before < 0 && after < 0) return 'remains_negative';
  return 'flipped';
}

function scenarioOf(context: FactsContext): FlowScenario | undefined {
  return context.unknownBrokerCodes && context.unknownBrokerCodes.length > 0
    ? { unknownBrokerCodes: context.unknownBrokerCodes }
    : undefined;
}

function buildUnavailableReason(
  claim: ApprovedClaim,
  baselineDoc: FactsDocument,
  overrideDoc: FactsDocument,
  baseContext: FactsContext,
  overrideContext: FactsContext,
  data: FactsData,
  brokerCode: string,
): WhatIfClaimReason {
  for (const key of claim.facts) {
    const baseFact = factByKey(baselineDoc, key);
    const overrideFact = factByKey(overrideDoc, key);
    if (!overrideFact) continue;
    if (!overrideFact.available) {
      if (overrideFact.unavailable_reason) return { kind: 'text', text: overrideFact.unavailable_reason };
      continue;
    }
    if (
      baseFact?.value?.kind === 'streak' &&
      overrideFact.value?.kind === 'streak' &&
      baseFact.value.status === 'passes' &&
      overrideFact.value.status === 'fails'
    ) {
      const baseScenario = scenarioOf(baseContext);
      const overrideScenario = scenarioOf(overrideContext);
      for (const date of baseFact.value.dates) {
        const before = groupNetForDate(data.rows, data.brokers, date, baseScenario)[baseFact.value.group];
        const after = groupNetForDate(data.rows, data.brokers, date, overrideScenario)[baseFact.value.group];
        if (before > 0 && after <= 0) {
          return {
            kind: 'streak_break',
            group: baseFact.value.group,
            date,
            before,
            after,
            brokerCode,
          };
        }
      }
      for (const date of baseFact.value.dates) {
        const before = groupNetForDate(data.rows, data.brokers, date, baseScenario);
        const after = groupNetForDate(data.rows, data.brokers, date, overrideScenario);
        if (isStrictLargest(before, baseFact.value.group) && !isStrictLargest(after, baseFact.value.group)) {
          return { kind: 'streak_not_largest', group: baseFact.value.group, date, brokerCode };
        }
      }
    }
  }
  return {
    kind: 'text',
    text: {
      en: `This statement is not supported when ${brokerCode} is treated as unclassified.`,
      id: `Pernyataan ini tidak didukung ketika ${brokerCode} diperlakukan sebagai tidak terklasifikasi.`,
      zh: `当${brokerCode}被归为未分类时，该论述不再成立。`,
    },
  };
}

function isStrictLargest(net: GroupNet, group: BrokerGroup): boolean {
  if (net[group] <= 0) return false;
  return STREAK_GROUPS.every((other) => other === group || net[other] < net[group]);
}
