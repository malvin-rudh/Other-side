import type { BrokerGroup } from '../data/schemas';
import { currencyOf, formatPrice as formatMoney } from '../data/money';
import { computeContextKey } from '../engine/context';
import type { ContentLocale as Locale } from '../engine/context';
import type { BilingualText, Fact, FactKey, FactValue, FactsContext, FactsDocument, GroupFocus } from '../engine/facts';
import { focusValue, pickText } from '../engine/facts';
import type { PredicateStatus } from '../engine/predicates';
import { compareKind, type ComparisonKind } from '../engine/transactionLens';
import {
  CAVEATS,
  CLAIM_TEMPLATES,
  CURATED_QUESTIONS,
  type CaveatKey,
  type ClaimValueSlot,
  type TemplateNode,
  type WordingVariant,
} from './templates';

export type ClaimSection = 'observed' | 'interpretation' | 'unknown' | 'supports' | 'contradicts';

export type ClaimPredicate =
  | { type: 'fact_available'; fact: FactKey }
  | { type: 'fact_status'; fact: FactKey; status: PredicateStatus }
  | { type: 'fact_bool'; fact: FactKey; equals: boolean }
  | { type: 'fact_gt' | 'fact_lt' | 'fact_gte' | 'fact_lte'; fact: FactKey; value: number; focus?: BrokerGroup | 'residual' }
  | { type: 'fact_dates_nonempty'; fact: FactKey; which: 'excluded' | 'missing' }
  | { type: 'fact_ranking_has'; fact: FactKey; broker: string }
  // A benchmark comparison needs usable benchmark inputs, not merely an
  // available performance fact. Without them the claim's own value slots cannot
  // resolve, so the claim must not be offered at all.
  | { type: 'fact_benchmark_present'; fact: FactKey }
  | { type: 'all' | 'any'; of: readonly ClaimPredicate[] }
  | { type: 'not'; of: ClaimPredicate };

export interface Claim {
  claim_id: string;
  section: ClaimSection;
  facts: readonly FactKey[];
  predicate: ClaimPredicate;
  required_caveats: readonly CaveatKey[];
  thesis?: string;
  // Claims that exist for sentence-level routing only (headlines, feed rows)
  // can opt out of the card excerpt so the card sections keep their reviewed
  // three-claim cap and order.
  cardExcerpt?: boolean;
}

const VIS: CaveatKey[] = ['visible_sample'];
const MAP: CaveatKey[] = ['team_mapping'];
const MAP_VIS: CaveatKey[] = ['team_mapping', 'visible_sample'];
const IMPL: CaveatKey[] = ['implied_reference'];
const IMPL_VIS: CaveatKey[] = ['implied_reference', 'visible_sample'];
const REV_VIS: CaveatKey[] = ['reversal', 'visible_sample'];
const UNK: CaveatKey[] = ['unknown_not_zero'];
const PORT: CaveatKey[] = ['portfolio_model', 'price_source'];

export const CLAIMS: readonly Claim[] = [
  { claim_id: 'CL-OBS-C02', section: 'observed', facts: ['C02'], predicate: { type: 'fact_available', fact: 'C02' }, required_caveats: VIS },
  { claim_id: 'CL-OBS-C04', section: 'observed', facts: ['C04'], predicate: { type: 'fact_available', fact: 'C04' }, required_caveats: MAP_VIS },
  { claim_id: 'CL-OBS-C05', section: 'observed', facts: ['C05'], predicate: { type: 'fact_available', fact: 'C05' }, required_caveats: MAP_VIS },
  { claim_id: 'CL-OBS-C06', section: 'observed', facts: ['C06'], predicate: { type: 'fact_available', fact: 'C06' }, required_caveats: MAP_VIS },
  { claim_id: 'CL-OBS-C07', section: 'observed', facts: ['C07'], predicate: { type: 'fact_available', fact: 'C07' }, required_caveats: VIS },
  { claim_id: 'CL-OBS-C08', section: 'observed', facts: ['C08'], predicate: { type: 'fact_available', fact: 'C08' }, required_caveats: VIS },
  { claim_id: 'CL-OBS-C09', section: 'observed', facts: ['C09'], predicate: { type: 'fact_available', fact: 'C09' }, required_caveats: VIS },
  { claim_id: 'CL-OBS-C10', section: 'observed', facts: ['C10'], predicate: { type: 'fact_available', fact: 'C10' }, required_caveats: IMPL_VIS },
  { claim_id: 'CL-OBS-C12', section: 'observed', facts: ['C12'], predicate: { type: 'fact_status', fact: 'C12', status: 'passes' }, required_caveats: MAP_VIS },
  { claim_id: 'CL-OBS-C13', section: 'observed', facts: ['C13'], predicate: { type: 'fact_status', fact: 'C13', status: 'passes' }, required_caveats: MAP_VIS },
  { claim_id: 'CL-OBS-C15', section: 'observed', facts: ['C15'], predicate: { type: 'fact_available', fact: 'C15' }, required_caveats: VIS },
  { claim_id: 'CL-OBS-C16', section: 'observed', facts: ['C16'], predicate: { type: 'fact_bool', fact: 'C16', equals: true }, required_caveats: REV_VIS },
  { claim_id: 'CL-OBS-C17', section: 'observed', facts: ['C17'], predicate: { type: 'fact_bool', fact: 'C17', equals: true }, required_caveats: REV_VIS },
  { claim_id: 'CL-OBS-C25', section: 'observed', facts: ['C25'], predicate: { type: 'fact_available', fact: 'C25' }, required_caveats: MAP_VIS },
  { claim_id: 'CL-INT-C11', section: 'interpretation', facts: ['C11'], predicate: { type: 'fact_available', fact: 'C11' }, required_caveats: IMPL },
  { claim_id: 'CL-INT-C18', section: 'interpretation', facts: ['C18'], predicate: { type: 'fact_available', fact: 'C18' }, required_caveats: MAP_VIS },
  { claim_id: 'CL-UNK-C01', section: 'unknown', facts: ['C01'], predicate: { type: 'fact_available', fact: 'C01' }, required_caveats: UNK },
  { claim_id: 'CL-UNK-C03', section: 'unknown', facts: ['C03'], predicate: { type: 'fact_dates_nonempty', fact: 'C03', which: 'missing' }, required_caveats: UNK },
  { claim_id: 'CL-UNK-C24', section: 'unknown', facts: ['C24'], predicate: { type: 'fact_available', fact: 'C24' }, required_caveats: MAP },
  {
    // Bounded to net buying over the selected window (C05). The five-session
    // streak is reported separately by the CL-INST-STREAK-* qualifier claims so
    // positive window buying and a failed recent streak are never collapsed into
    // one contradictory verdict.
    claim_id: 'CL-SUP-INST-LED',
    section: 'supports',
    facts: ['C05'],
    predicate: { type: 'fact_gt', fact: 'C05', value: 0, focus: 'institution_facing' },
    required_caveats: MAP_VIS,
    thesis: 'T-INST-LED',
  },
  {
    claim_id: 'CL-CON-INST-LED',
    section: 'contradicts',
    facts: ['C05'],
    predicate: { type: 'fact_lt', fact: 'C05', value: 0, focus: 'institution_facing' },
    required_caveats: MAP_VIS,
    thesis: 'T-INST-LED',
  },
  {
    // Exactly-zero window net is a distinct, engine-derived result: it is only
    // offered when C05 is available and computes to zero, never inferred from
    // missing observations.
    claim_id: 'CL-FLAT-INST-LED',
    section: 'observed',
    facts: ['C05'],
    predicate: {
      type: 'all',
      of: [
        { type: 'fact_gte', fact: 'C05', value: 0, focus: 'institution_facing' },
        { type: 'fact_lte', fact: 'C05', value: 0, focus: 'institution_facing' },
      ],
    },
    required_caveats: MAP_VIS,
    thesis: 'T-INST-LED',
    cardExcerpt: false,
  },
  {
    // The window net could not be computed at this cutoff. Lists no fact
    // dependency so it renders exactly when C05 is unavailable, keeping missing
    // data separate from a flat result.
    claim_id: 'CL-INST-WINDOW-NA',
    section: 'observed',
    facts: [],
    predicate: { type: 'not', of: { type: 'fact_available', fact: 'C05' } },
    required_caveats: UNK,
    thesis: 'T-INST-LED',
    cardExcerpt: false,
  },
  {
    claim_id: 'CL-INST-STREAK-PASS',
    section: 'observed',
    facts: ['C12'],
    predicate: { type: 'fact_status', fact: 'C12', status: 'passes' },
    required_caveats: MAP_VIS,
    thesis: 'T-INST-LED',
    cardExcerpt: false,
  },
  {
    claim_id: 'CL-INST-STREAK-FAIL',
    section: 'observed',
    facts: ['C12'],
    predicate: { type: 'fact_status', fact: 'C12', status: 'fails' },
    required_caveats: MAP_VIS,
    thesis: 'T-INST-LED',
    cardExcerpt: false,
  },
  {
    // Available exactly when C12 is not: fewer than five captured market
    // sessions in the window. It lists no fact dependency so it can render while
    // C12 is unavailable, and states missing evidence rather than a failed run.
    claim_id: 'CL-INST-STREAK-NA',
    section: 'observed',
    facts: [],
    predicate: { type: 'not', of: { type: 'fact_available', fact: 'C12' } },
    required_caveats: UNK,
    thesis: 'T-INST-LED',
    cardExcerpt: false,
  },
  {
    claim_id: 'CL-SUP-APP-SELLING',
    section: 'supports',
    facts: ['C04'],
    predicate: { type: 'fact_lt', fact: 'C04', value: 0, focus: 'app_facing' },
    required_caveats: MAP_VIS,
    thesis: 'T-APP-SELLING',
  },
  {
    claim_id: 'CL-CON-APP-SELLING',
    section: 'contradicts',
    facts: ['C04'],
    predicate: { type: 'fact_gt', fact: 'C04', value: 0, focus: 'app_facing' },
    required_caveats: MAP_VIS,
    thesis: 'T-APP-SELLING',
  },
  {
    claim_id: 'CL-SUP-HP-BUYER',
    section: 'supports',
    facts: ['C08'],
    predicate: { type: 'fact_ranking_has', fact: 'C08', broker: 'HP' },
    required_caveats: VIS,
    thesis: 'T-HP-SMART',
  },
  {
    claim_id: 'CL-CON-HP-SELLER',
    section: 'contradicts',
    facts: ['C09'],
    predicate: { type: 'fact_ranking_has', fact: 'C09', broker: 'HP' },
    required_caveats: VIS,
    thesis: 'T-HP-SMART',
  },
  {
    claim_id: 'CL-SUP-PRICE-RISE',
    section: 'supports',
    facts: ['C11'],
    predicate: { type: 'fact_gt', fact: 'C11', value: 0 },
    required_caveats: IMPL,
    thesis: 'T-PRICE-PROOF',
  },
  {
    claim_id: 'CL-CON-PRICE-RISE',
    section: 'contradicts',
    facts: ['C11'],
    predicate: { type: 'fact_lt', fact: 'C11', value: 0 },
    required_caveats: IMPL,
    thesis: 'T-PRICE-PROOF',
  },
  {
    claim_id: 'CL-UNK-HP-INTENT',
    section: 'unknown',
    facts: ['C09'],
    predicate: { type: 'fact_available', fact: 'C09' },
    required_caveats: UNK,
    thesis: 'T-HP-SMART',
  },
  {
    claim_id: 'CL-UNK-BUSINESS-PROOF',
    section: 'unknown',
    facts: ['C11'],
    predicate: { type: 'fact_available', fact: 'C11' },
    required_caveats: UNK,
    thesis: 'T-PRICE-PROOF',
  },
  {
    claim_id: 'CL-OBS-C25-MOVE',
    section: 'observed',
    facts: ['C25'],
    predicate: { type: 'fact_available', fact: 'C25' },
    required_caveats: MAP_VIS,
    cardExcerpt: false,
  },
  {
    claim_id: 'CL-PORT-PERF',
    section: 'observed',
    facts: ['P01', 'P04'],
    predicate: { type: 'fact_available', fact: 'P01' },
    required_caveats: PORT,
    cardExcerpt: false,
  },
  {
    claim_id: 'CL-PORT-BENCH',
    section: 'observed',
    facts: ['P01', 'P04'],
    // Available only with usable benchmark inputs. A portfolio with no benchmark
    // has no comparison to state, so the claim is withheld rather than offered
    // with wording its own value slots cannot fill.
    predicate: {
      type: 'all',
      of: [
        { type: 'fact_available', fact: 'P01' },
        { type: 'fact_benchmark_present', fact: 'P01' },
      ],
    },
    required_caveats: PORT,
    cardExcerpt: false,
  },
  {
    claim_id: 'CL-PORT-CONTRIB',
    section: 'observed',
    facts: ['P02', 'P04'],
    predicate: { type: 'fact_available', fact: 'P02' },
    required_caveats: PORT,
    cardExcerpt: false,
  },
  {
    claim_id: 'CL-PORT-ALLOC',
    section: 'observed',
    facts: ['P03', 'P04'],
    predicate: { type: 'fact_available', fact: 'P03' },
    required_caveats: PORT,
    cardExcerpt: false,
  },
  {
    // The complete per-symbol breakdown. Every allocation and contribution row
    // cites this, so a printed number opens a claim about all holdings rather
    // than about whichever one happens to be largest.
    claim_id: 'CL-PORT-BREAKDOWN',
    section: 'observed',
    facts: ['P05', 'P04'],
    predicate: { type: 'fact_available', fact: 'P05' },
    required_caveats: PORT,
    cardExcerpt: false,
  },
  {
    // The dated weight history the allocation lines plot.
    claim_id: 'CL-PORT-WEIGHTS',
    section: 'observed',
    facts: ['P06', 'P04'],
    predicate: { type: 'fact_available', fact: 'P06' },
    required_caveats: PORT,
    cardExcerpt: false,
  },
];

export const CLAIMS_BY_ID: ReadonlyMap<string, Claim> = new Map(CLAIMS.map((claim) => [claim.claim_id, claim]));

export interface Thesis {
  supports: readonly string[];
  contradicts: readonly string[];
  unknown: readonly string[];
  // Mutually-exclusive window-result claims (net buying, net selling, flat, or
  // unavailable) rendered as the concise lead answer. At most one is available
  // at a given cutoff.
  window?: readonly string[];
  // Mutually-exclusive recency qualifier claims rendered as their own labelled
  // line, separate from the buckets. At most one is available at a cutoff.
  streak?: readonly string[];
}

export const THESES: Record<string, Thesis> = {
  'T-INST-LED': {
    supports: ['CL-SUP-INST-LED'],
    contradicts: ['CL-CON-INST-LED'],
    unknown: ['CL-UNK-C24'],
    window: ['CL-SUP-INST-LED', 'CL-CON-INST-LED', 'CL-FLAT-INST-LED', 'CL-INST-WINDOW-NA'],
    streak: ['CL-INST-STREAK-PASS', 'CL-INST-STREAK-FAIL', 'CL-INST-STREAK-NA'],
  },
  'T-APP-SELLING': { supports: ['CL-SUP-APP-SELLING'], contradicts: ['CL-CON-APP-SELLING'], unknown: [] },
  'T-HP-SMART': { supports: ['CL-SUP-HP-BUYER'], contradicts: ['CL-CON-HP-SELLER'], unknown: ['CL-UNK-HP-INTENT'] },
  'T-PRICE-PROOF': { supports: ['CL-SUP-PRICE-RISE'], contradicts: ['CL-CON-PRICE-RISE'], unknown: ['CL-UNK-BUSINESS-PROOF'] },
};

// Claims that answer a thesis as a window result or a recency qualifier rather
// than as bucket evidence: they appear in some thesis's `window` or `streak`
// list but in none of its supports/contradicts/unknown lists. They are rendered
// as the concise lead (window) or the labelled qualifier line (streak), never as
// support, so the plan renderer skips them and the shared validator rejects a
// plan that carries only these and would otherwise render empty buckets. Derived
// from THESES so it cannot drift from the wiring; CL-SUP/CON-INST-LED are in both
// `window` and a bucket list, so they stay bucket evidence and are excluded here.
export const NON_BUCKET_CLAIM_IDS: ReadonlySet<string> = (() => {
  const bucketed = new Set<string>();
  for (const thesis of Object.values(THESES)) {
    for (const id of [...thesis.supports, ...thesis.contradicts, ...thesis.unknown]) bucketed.add(id);
  }
  const nonBucket = new Set<string>();
  for (const thesis of Object.values(THESES)) {
    for (const id of [...(thesis.window ?? []), ...(thesis.streak ?? [])]) {
      if (!bucketed.has(id)) nonBucket.add(id);
    }
  }
  return nonBucket;
})();

export type ThesisClaimPlacement = 'supports' | 'contradicts' | 'unknown' | 'evidence';

export function classifyThesisClaim(thesis: Thesis, claimId: string): ThesisClaimPlacement | null {
  if (thesis.supports.includes(claimId)) return 'supports';
  if (thesis.contradicts.includes(claimId)) return 'contradicts';
  if (thesis.unknown.includes(claimId)) return 'unknown';
  if (thesis.window?.includes(claimId) || thesis.streak?.includes(claimId)) return null;
  return 'evidence';
}

export function claimWording(claimId: string, variant: WordingVariant): BilingualText {
  const template = CLAIM_TEMPLATES[claimId];
  if (!template) throw new Error(`unknown claim template: ${claimId}`);
  return {
    en: joinTemplateText(template[variant], 'en'),
    id: joinTemplateText(template[variant], 'id'),
    zh: joinTemplateText(template[variant], 'zh-CN'),
  };
}

function joinTemplateText(nodes: readonly TemplateNode[], locale: Locale): string {
  return nodes.map((node) => (node.kind === 'text' ? pickText(node.text, locale) : '')).join('');
}

function joinParts(parts: readonly RenderedPart[]): string {
  return parts.map((part) => part.text).join('');
}

function intlLocale(locale: Locale): string {
  return locale === 'id' ? 'id-ID' : locale === 'zh-CN' ? 'zh-CN' : 'en-GB';
}

function formatCompactLots(value: number, locale: Locale): string {
  const abs = Math.abs(value);
  if (locale === 'zh-CN') {
    if (abs < 10000) return new Intl.NumberFormat('zh-CN').format(abs);
    return `${Math.round(abs / 100) / 100}万`;
  }
  if (abs < 1000) return new Intl.NumberFormat(intlLocale(locale)).format(abs);
  const rounded = Math.round((abs / 1000) * 10) / 10;
  const num = locale === 'id' ? rounded.toFixed(1).replace('.', ',') : rounded.toFixed(1);
  return locale === 'id' ? `${num} rb` : `${num}k`;
}

function formatSignedLots(value: number, locale: Locale): string {
  const grouped = new Intl.NumberFormat(intlLocale(locale)).format(Math.abs(value));
  return value < 0 ? `\u2212${grouped}` : `+${grouped}`;
}

function formatPrice(value: number, locale: Locale): string {
  const grouped = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value);
  return `Rp${grouped}`;
}

function formatSignedPercent(fraction: number, locale: Locale): string {
  const rounded = Math.round(fraction * 1000) / 10;
  const digits = Math.abs(rounded).toFixed(1);
  return `${rounded < 0 ? '\u2212' : '+'}${locale === 'id' ? digits.replace('.', ',') : digits}%`;
}

// A signed percentage-point amount with no unit suffix, because the template
// carries the localized unit words after the value.
function formatSignedPoints(fraction: number, locale: Locale): string {
  const rounded = Math.round(fraction * 1000) / 10;
  const digits = Math.abs(rounded).toFixed(1);
  return `${rounded < 0 ? '\u2212' : '+'}${locale === 'id' ? digits.replace('.', ',') : digits}`;
}

function formatPercent(fraction: number, locale: Locale): string {
  const digits = (Math.round(fraction * 1000) / 10).toFixed(1);
  return `${locale === 'id' ? digits.replace('.', ',') : digits}%`;
}

function formatIdrCompact(value: number, locale: Locale): string {
  const abs = Math.abs(value);
  if (locale === 'zh-CN') {
    if (abs >= 1e8) return `Rp${(Math.round((abs / 1e8) * 10) / 10).toFixed(1)}亿`;
    if (abs >= 1e4) return `Rp${(Math.round((abs / 1e4) * 10) / 10).toFixed(1)}万`;
    return `Rp${new Intl.NumberFormat('zh-CN').format(abs)}`;
  }
  if (abs >= 1e6) {
    const digits = (Math.round((abs / 1e6) * 10) / 10).toFixed(1);
    return locale === 'id' ? `Rp${digits.replace('.', ',')} jt` : `Rp${digits}m`;
  }
  const grouped = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(abs);
  return `Rp${grouped}`;
}

function formatShortDate(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function directionWord(amount: number, locale: Locale): string {
  if (locale === 'zh-CN') {
    if (amount > 0) return '净买入';
    if (amount < 0) return '净卖出';
    return '持平';
  }
  if (amount > 0) return locale === 'id' ? 'pembeli bersih' : 'net buyers';
  if (amount < 0) return locale === 'id' ? 'penjual bersih' : 'net sellers';
  return locale === 'id' ? 'netral' : 'flat';
}

interface C25Move {
  group: BrokerGroup;
  fromLots: number;
  toLots: number;
  kind: ComparisonKind;
}

const MOVE_GROUPS: readonly BrokerGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

// The headline move mirrors buildTransactionLens exactly: the largest changed
// group by absolute lot delta, falling back to the first group when nothing
// moved, so the approved sentence can never drift from the lens rows.
function c25Move(value: FactValue): C25Move | null {
  if (value.kind !== 'daily-group-nets' || value.days.length !== 2) return null;
  const [from, to] = value.days;
  if (!from || !to) return null;
  const rows: C25Move[] = MOVE_GROUPS.map((group) => ({
    group,
    fromLots: from.groups[group],
    toLots: to.groups[group],
    kind: compareKind(from.groups[group], to.groups[group]),
  }));
  const changed = rows.filter((row) => row.kind !== 'flat');
  return changed.slice().sort((a, b) => Math.abs(b.toLots - b.fromLots) - Math.abs(a.toLots - a.fromLots))[0] ?? rows[0] ?? null;
}

function moveGroupLabel(group: BrokerGroup, locale: Locale): string {
  if (locale === 'zh-CN') {
    if (group === 'app_facing') return '零售App券商';
    if (group === 'institution_facing') return '机构券商';
    if (group === 'other_mixed') return '其他/混合券商';
    return '未分类券商';
  }
  if (locale === 'id') {
    if (group === 'app_facing') return 'broker aplikasi ritel';
    if (group === 'institution_facing') return 'broker institusional';
    if (group === 'other_mixed') return 'broker lain / campuran';
    return 'broker tidak terklasifikasi';
  }
  if (group === 'app_facing') return 'retail app brokers';
  if (group === 'institution_facing') return 'institutional brokers';
  if (group === 'other_mixed') return 'other / mixed brokers';
  return 'unclassified brokers';
}

function moveDirectionPhrase(kind: ComparisonKind, locale: Locale): { text: string; tone: SlotTone } {
  const tone: SlotTone = kind === 'flat' ? 'neutral' : kind === 'buying-increased' || kind === 'reversal-to-buying' ? 'buy' : 'sell';
  if (locale === 'zh-CN') {
    const zh: Record<ComparisonKind, string> = {
      'buying-increased': '净买入增加',
      'buying-decreased': '净买入减少',
      'selling-increased': '净卖出增加',
      'selling-decreased': '净卖出减少',
      'reversal-to-buying': '从净卖出转为净买入',
      'reversal-to-selling': '从净买入转为净卖出',
      flat: '净手数基本持平',
    };
    return { text: zh[kind], tone };
  }
  if (locale === 'id') {
    const id: Record<ComparisonKind, string> = {
      'buying-increased': ' meningkatkan pembelian bersih',
      'buying-decreased': ' mengurangi pembelian bersih',
      'selling-increased': ' meningkatkan penjualan bersih',
      'selling-decreased': ' mengurangi penjualan bersih',
      'reversal-to-buying': ' berpindah dari penjualan bersih ke pembelian bersih',
      'reversal-to-selling': ' berpindah dari pembelian bersih ke penjualan bersih',
      flat: ' tidak berubah secara bersih',
    };
    return { text: id[kind], tone };
  }
  const en: Record<ComparisonKind, string> = {
    'buying-increased': ' increased net buying',
    'buying-decreased': ' reduced net buying',
    'selling-increased': ' increased net selling',
    'selling-decreased': ' reduced net selling',
    'reversal-to-buying': ' moved from net selling to net buying',
    'reversal-to-selling': ' moved from net buying to net selling',
    flat: ' were unchanged on net',
  };
  return { text: en[kind], tone };
}

function slotAmount(value: FactValue, focus?: GroupFocus, which?: 'from' | 'to'): number | null {
  if (value.kind === 'group-nets') return focus ? focusValue(value.nets, focus) : null;
  if (value.kind === 'daily-broker-nets') return value.days.reduce((sum, day) => sum + day.netLots, 0);
  if (value.kind === 'daily-group-nets') {
    if (!focus) return null;
    const day = which === 'to' ? value.days[value.days.length - 1] : value.days[0];
    return day ? focusValue(day.groups, focus) : null;
  }
  return null;
}

export type SlotTone = 'buy' | 'sell' | 'neutral';

export interface RenderedPart {
  kind: 'text' | 'value';
  text: string;
  factId?: string;
  tone?: SlotTone;
}

function rankPhrase(position: number, locale: Locale): string {
  if (locale === 'zh-CN') return `第${position}大`;
  if (locale === 'id') return `ke-${position} terbesar`;
  const suffix = position === 1 ? 'st' : position === 2 ? 'nd' : position === 3 ? 'rd' : 'th';
  return `${position}${suffix}-largest`;
}

function resolveSlot(
  claimSlot: ClaimValueSlot,
  factsByKey: ReadonlyMap<FactKey, Fact>,
  locale: Locale,
): { text: string; tone: SlotTone } | null {
  const fact = factsByKey.get(claimSlot.fact);
  if (!fact?.available || !fact.value) return null;
  const value = fact.value;
  const toneOf = (amount: number): SlotTone => (amount > 0 ? 'buy' : amount < 0 ? 'sell' : 'neutral');
  switch (claimSlot.kind) {
    case 'direction': {
      const amount = value.kind === 'reversal' ? null : slotAmount(value, claimSlot.focus);
      if (amount === null) return null;
      return { text: directionWord(amount, locale), tone: toneOf(amount) };
    }
    case 'lots': {
      let amount: number | null;
      if (value.kind === 'reversal') {
        amount = claimSlot.which === 'to' ? value.reversal.toNetLots : value.reversal.fromNetLots;
      } else {
        amount = slotAmount(value, claimSlot.focus, claimSlot.which);
      }
      if (amount === null) return null;
      const text =
        claimSlot.sign === 'explicit' ? formatSignedLots(amount, locale) : formatCompactLots(amount, locale);
      return { text, tone: toneOf(amount) };
    }
    case 'price': {
      let amount: number | null = null;
      if (value.kind === 'ratio') amount = value.display;
      if (value.kind === 'ratio-delta') amount = claimSlot.which === 'to' ? value.to.display : value.from.display;
      if (amount === null) return null;
      // Fact ids carry the ticker (F-<TICKER>-...), so a price reads in that
      // instrument's own currency.
      return { text: formatMoney(amount, currencyOf(fact.fact_id.split('-')[1] ?? ''), locale), tone: 'neutral' };
    }
    case 'count': {
      let amount: number | null = null;
      if (value.kind === 'integer') amount = value.value;
      if (value.kind === 'daily-broker-nets') amount = value.days.length;
      if (amount === null) return null;
      return { text: new Intl.NumberFormat(intlLocale(locale)).format(amount), tone: 'neutral' };
    }
    case 'fact_date': {
      const date = claimSlot.which === 'start' ? fact.period.start : fact.period.end;
      return { text: formatShortDate(date, locale), tone: 'neutral' };
    }
    case 'day_span': {
      let date: string | undefined;
      if (value.kind === 'daily-broker-nets') {
        date = claimSlot.which === 'first' ? value.days[0]?.date : value.days[value.days.length - 1]?.date;
      }
      if (!date) return null;
      return { text: formatShortDate(date, locale), tone: 'neutral' };
    }
    case 'sensitivity_broker': {
      if (value.kind !== 'sensitivity') return null;
      return { text: value.brokerCode, tone: 'neutral' };
    }
    case 'sensitivity_lots': {
      if (value.kind !== 'sensitivity') return null;
      const amount = focusValue(value[claimSlot.which], claimSlot.focus);
      return { text: formatCompactLots(amount, locale), tone: toneOf(amount) };
    }
    case 'dates_list': {
      const dates =
        value.kind === 'dates' && claimSlot.which === 'excluded'
          ? value.dates
          : value.kind === 'coverage' && claimSlot.which === 'missing'
            ? value.missingDates
            : [];
      if (dates.length === 0) return null;
      return { text: dates.map((date) => formatShortDate(date, locale)).join(', '), tone: 'neutral' };
    }
    case 'rank_position': {
      if (value.kind !== 'ranking') return null;
      const index = value.entries.findIndex((entry) => entry.brokerCode === claimSlot.broker);
      if (index === -1) return null;
      return { text: rankPhrase(index + 1, locale), tone: 'neutral' };
    }
    case 'ranking_lots': {
      if (value.kind !== 'ranking') return null;
      const entry = value.entries.find((candidate) => candidate.brokerCode === claimSlot.broker);
      if (!entry) return null;
      const text =
        claimSlot.sign === 'explicit' ? formatSignedLots(entry.netLots, locale) : formatCompactLots(entry.netLots, locale);
      return { text, tone: toneOf(entry.netLots) };
    }
    case 'move_group': {
      if (value.kind !== 'daily-group-nets') return null;
      const move = c25Move(value);
      if (!move) return null;
      return { text: moveGroupLabel(move.group, locale), tone: 'neutral' };
    }
    case 'move_direction': {
      if (value.kind !== 'daily-group-nets') return null;
      const move = c25Move(value);
      if (!move) return null;
      return moveDirectionPhrase(move.kind, locale);
    }
    case 'move_lots': {
      if (value.kind !== 'daily-group-nets') return null;
      const move = c25Move(value);
      if (!move) return null;
      const amount = claimSlot.which === 'to' ? move.toLots : move.fromLots;
      const text = claimSlot.sign === 'explicit' ? formatSignedLots(amount, locale) : formatCompactLots(amount, locale);
      return { text, tone: toneOf(amount) };
    }
    case 'portfolio_percent': {
      if (value.kind !== 'portfolio-performance') return null;
      const fraction =
        claimSlot.focus === 'benchmark' ? (value.benchmark?.returnFraction ?? null) : value.returnFraction;
      if (fraction === null || !Number.isFinite(fraction)) return null;
      return { text: formatSignedPercent(fraction, locale), tone: toneOf(fraction) };
    }
    case 'portfolio_value': {
      if (value.kind !== 'portfolio-performance') return null;
      const amount = claimSlot.which === 'end' ? value.endValue : value.startValue;
      if (!Number.isFinite(amount)) return null;
      return { text: formatIdrCompact(amount, locale), tone: 'neutral' };
    }
    case 'portfolio_price': {
      if (claimSlot.which === 'end') {
        if (value.kind !== 'portfolio-contribution' && value.kind !== 'portfolio-allocation') return null;
        return { text: formatPrice(value.endClose, locale), tone: 'neutral' };
      }
      // Only the contribution fact carries a start close; an allocation slot
      // asking for one resolves to nothing rather than a borrowed number.
      if (value.kind !== 'portfolio-contribution') return null;
      return { text: formatPrice(value.startClose, locale), tone: 'neutral' };
    }
    case 'portfolio_symbol': {
      if (claimSlot.focus === 'benchmark') {
        if (value.kind !== 'portfolio-performance' || value.benchmark === null) return null;
        return { text: value.benchmark.symbol, tone: 'neutral' };
      }
      if (value.kind !== 'portfolio-contribution' && value.kind !== 'portfolio-allocation') return null;
      return { text: value.symbol, tone: 'neutral' };
    }
    case 'portfolio_quantity': {
      if (value.kind !== 'portfolio-contribution' && value.kind !== 'portfolio-allocation') return null;
      return { text: new Intl.NumberFormat(intlLocale(locale)).format(value.quantityShares), tone: 'neutral' };
    }
    case 'portfolio_sessions': {
      if (value.kind !== 'portfolio-performance') return null;
      return { text: new Intl.NumberFormat(intlLocale(locale)).format(value.sessions), tone: 'neutral' };
    }
    case 'portfolio_contribution': {
      if (value.kind !== 'portfolio-contribution') return null;
      if (!Number.isFinite(value.contributionFraction)) return null;
      // A contribution is one holding's share of the whole portfolio change, so
      // it is printed in percentage points. Printing it with a % sign would read
      // as that holding's own return, which is a different number.
      return { text: formatSignedPoints(value.contributionFraction, locale), tone: toneOf(value.contributionFraction) };
    }
    case 'portfolio_weight': {
      if (value.kind !== 'portfolio-allocation') return null;
      if (!Number.isFinite(value.weightFraction)) return null;
      return { text: formatPercent(value.weightFraction, locale), tone: 'neutral' };
    }
    case 'portfolio_holdings_count': {
      if (value.kind !== 'portfolio-breakdown') return null;
      return { text: new Intl.NumberFormat(intlLocale(locale)).format(value.holdings.length), tone: 'neutral' };
    }
    case 'portfolio_weight_dates': {
      if (value.kind !== 'portfolio-weight-history') return null;
      return { text: new Intl.NumberFormat(intlLocale(locale)).format(value.points.length), tone: 'neutral' };
    }
  }
}

export function renderClaimParts(
  claimId: string,
  variant: WordingVariant,
  locale: Locale,
  factsByKey: ReadonlyMap<FactKey, Fact>,
): RenderedPart[] | null {
  const template = CLAIM_TEMPLATES[claimId];
  if (!template) return null;
  const parts: RenderedPart[] = [];
  for (const node of template[variant]) {
    if (node.kind === 'text') {
      parts.push({ kind: 'text', text: pickText(node.text, locale) });
      continue;
    }
    const resolved = resolveSlot(node.slot, factsByKey, locale);
    if (!resolved) return null;
    parts.push({ kind: 'value', text: resolved.text, factId: factsByKey.get(node.slot.fact)?.fact_id, tone: resolved.tone });
  }
  return parts;
}

export function claimCaveatTexts(claim: Claim): BilingualText[] {
  return claim.required_caveats.map((key) => CAVEATS[key]);
}

function numericValue(fact: Fact, focus?: BrokerGroup | 'residual'): number | null {
  const value = fact.value;
  if (!value) return null;
  switch (value.kind) {
    case 'integer':
      return value.value;
    case 'ratio':
      return value.display;
    case 'ratio-delta':
      return value.delta;
    case 'group-nets':
      return focus ? value.nets[focus] : null;
    default:
      return null;
  }
}

export function evaluateClaimPredicate(
  predicate: ClaimPredicate,
  factsByKey: ReadonlyMap<FactKey, Fact>,
): boolean {
  switch (predicate.type) {
    case 'fact_available':
      return factsByKey.get(predicate.fact)?.available === true;
    case 'fact_status': {
      const fact = factsByKey.get(predicate.fact);
      if (!fact || fact.value?.kind !== 'streak') return false;
      return fact.value.status === predicate.status;
    }
    case 'fact_bool': {
      const fact = factsByKey.get(predicate.fact);
      if (!fact || fact.value?.kind !== 'reversal') return false;
      return fact.value.reversal.reversed === predicate.equals;
    }
    case 'fact_gt':
    case 'fact_lt':
    case 'fact_gte':
    case 'fact_lte': {
      const fact = factsByKey.get(predicate.fact);
      if (!fact?.available) return false;
      const numeric = numericValue(fact, predicate.focus);
      if (numeric === null) return false;
      switch (predicate.type) {
        case 'fact_gt':
          return numeric > predicate.value;
        case 'fact_lt':
          return numeric < predicate.value;
        case 'fact_gte':
          return numeric >= predicate.value;
        case 'fact_lte':
          return numeric <= predicate.value;
      }
      return false;
    }
    case 'fact_dates_nonempty': {
      const fact = factsByKey.get(predicate.fact);
      if (!fact?.available || !fact.value) return false;
      if (fact.value.kind === 'dates') return fact.value.dates.length > 0;
      if (fact.value.kind === 'coverage') {
        return predicate.which === 'missing' ? fact.value.missingDates.length > 0 : fact.value.excludedDates.length > 0;
      }
      return false;
    }
    case 'fact_ranking_has': {
      const fact = factsByKey.get(predicate.fact);
      if (!fact?.available || fact.value?.kind !== 'ranking') return false;
      return fact.value.entries.some((entry) => entry.brokerCode === predicate.broker);
    }
    case 'fact_benchmark_present': {
      const fact = factsByKey.get(predicate.fact);
      if (!fact?.available || fact.value?.kind !== 'portfolio-performance') return false;
      const benchmark = fact.value.benchmark;
      return (
        benchmark !== null &&
        Number.isFinite(benchmark.startClose) &&
        Number.isFinite(benchmark.endClose) &&
        Number.isFinite(benchmark.returnFraction) &&
        benchmark.startClose !== 0
      );
    }
    case 'all':
      return predicate.of.every((entry) => evaluateClaimPredicate(entry, factsByKey));
    case 'any':
      return predicate.of.some((entry) => evaluateClaimPredicate(entry, factsByKey));
    case 'not':
      return !evaluateClaimPredicate(predicate.of, factsByKey);
  }
}

export function isClaimAvailable(claim: Claim, factsByKey: ReadonlyMap<FactKey, Fact>): boolean {
  const depsAvailable = claim.facts.every((key) => factsByKey.get(key)?.available === true);
  return depsAvailable && evaluateClaimPredicate(claim.predicate, factsByKey);
}

export interface ApprovedClaim extends Claim {
  wording: Record<WordingVariant, BilingualText>;
  parts: Record<WordingVariant, Record<Locale, RenderedPart[] | null>>;
  caveats: BilingualText[];
  available: boolean;
}

export interface ApprovedClaimsDocument {
  ticker: string;
  context: FactsContext;
  contextKey: string;
  facts: Fact[];
  claims: ApprovedClaim[];
  theses: Record<string, Thesis>;
  questions: Record<string, typeof CURATED_QUESTIONS[string]>;
}

export function buildApprovedClaims(context: FactsContext, document: FactsDocument): ApprovedClaimsDocument {
  const factsByKey: ReadonlyMap<FactKey, Fact> = new Map(document.facts.map((fact) => [fact.key, fact]));
  const contextKey = computeContextKey({ ...context, selectedSessionDate: context.sessionDate });
  const claims: ApprovedClaim[] = CLAIMS.map((claim) => {
    const parts: ApprovedClaim['parts'] = {
      short: {
        en: renderClaimParts(claim.claim_id, 'short', 'en', factsByKey),
        id: renderClaimParts(claim.claim_id, 'short', 'id', factsByKey),
        'zh-CN': renderClaimParts(claim.claim_id, 'short', 'zh-CN', factsByKey),
      },
      explained: {
        en: renderClaimParts(claim.claim_id, 'explained', 'en', factsByKey),
        id: renderClaimParts(claim.claim_id, 'explained', 'id', factsByKey),
        'zh-CN': renderClaimParts(claim.claim_id, 'explained', 'zh-CN', factsByKey),
      },
    };
    const fallback = claimWording(claim.claim_id, 'explained');
    return {
      ...claim,
      wording: {
        short: claimWording(claim.claim_id, 'short'),
        explained: {
          en: parts.explained.en ? joinParts(parts.explained.en) : fallback.en,
          id: parts.explained.id ? joinParts(parts.explained.id) : fallback.id,
          zh: parts.explained['zh-CN'] ? joinParts(parts.explained['zh-CN']) : fallback.zh,
        },
      },
      parts,
      caveats: claimCaveatTexts(claim),
      available: isClaimAvailable(claim, factsByKey),
    };
  });
  return {
    ticker: document.ticker,
    context,
    contextKey,
    facts: [...document.facts],
    claims,
    theses: THESES,
    questions: CURATED_QUESTIONS,
  };
}
