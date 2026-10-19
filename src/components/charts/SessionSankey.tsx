import type { PublicData } from '../../data/publicData';
import type { Locale } from '../../engine/context';
import { formatSessionDate, intlLocale, useTranslation } from '../../i18n';
import { ui } from '../../i18n/analysisCopy';
import { GROUP_COLOURS, GROUP_LABEL_KEY, GROUP_ORDER, groupDotStyle } from '../groupColours';

type G = 'app_facing' | 'institution_facing' | 'other_mixed' | 'unknown';
type ByGroup = Record<G, number>;

export interface SessionFlow {
  buy: ByGroup;
  sell: ByGroup;
  total: number;
  // Lots added to Unclassified on the shorter side so both sides balance.
  added: { side: 'buy' | 'sell'; lots: number } | null;
  nets: ByGroup;
  // The visible brokers of the day, biggest first: top buyers by lots bought,
  // top sellers by lots sold (shown as negative nets).
  topBuyers: { code: string; lots: number; group: G }[];
  topSellers: { code: string; lots: number; group: G }[];
}

const zero = (): ByGroup => ({ app_facing: 0, institution_facing: 0, other_mixed: 0, unknown: 0 });

// Visible buy and sell lots of one session by broker group. The visible rows
// are the top nine per side, so the two totals differ; the difference goes to
// Unclassified on the short side and the group nets then sum to zero.
export function buildSessionFlow(data: Pick<PublicData, 'rows' | 'brokers'>, date: string): SessionFlow | null {
  const groupOf = new Map(data.brokers.map((broker) => [broker.code, broker.group]));
  const buy = zero();
  const sell = zero();
  const topBuyers: SessionFlow['topBuyers'] = [];
  const topSellers: SessionFlow['topSellers'] = [];
  let any = false;
  for (const row of data.rows) {
    if (row.date !== date) continue;
    any = true;
    const group = (groupOf.get(row.brokerCode) ?? 'unknown') as G;
    (row.side === 'buy' ? buy : sell)[group] += row.netLots;
    (row.side === 'buy' ? topBuyers : topSellers).push({ code: row.brokerCode, lots: row.side === 'buy' ? row.netLots : -row.netLots, group });
  }
  topBuyers.sort((a, b) => b.lots - a.lots);
  topSellers.sort((a, b) => a.lots - b.lots);
  if (!any) return null;
  const sum = (v: ByGroup) => v.app_facing + v.institution_facing + v.other_mixed + v.unknown;
  const diff = sum(buy) - sum(sell);
  let added: SessionFlow['added'] = null;
  if (diff > 0) {
    sell.unknown += diff;
    added = { side: 'sell', lots: diff };
  } else if (diff < 0) {
    buy.unknown += -diff;
    added = { side: 'buy', lots: -diff };
  }
  const nets = zero();
  for (const g of GROUP_ORDER) nets[g as G] = buy[g as G] - sell[g as G];
  return { buy, sell, total: sum(buy), added, nets, topBuyers, topSellers };
}

const W = 320;
const NODE_X_LEFT = 86;
const NODE_X_RIGHT = 226;
const NODE_W = 8;
const GAP = 10;
const PAD = 6;
const LABEL_LINES = 14;

function wrap(text: string): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line !== '' && `${line} ${word}`.length > LABEL_LINES) {
      lines.push(line);
      line = word;
    } else {
      line = line === '' ? word : `${line} ${word}`;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

interface Node {
  group: G;
  lots: number;
  y: number;
  h: number;
  cursor: number;
  labelY: number;
}

function layout(values: ByGroup, scale: number): Node[] {
  const nodes: Node[] = [];
  let y = PAD;
  for (const group of GROUP_ORDER as readonly G[]) {
    const lots = values[group];
    if (lots <= 0) continue;
    const h = Math.max(lots * scale, 2);
    nodes.push({ group, lots, y, h, cursor: y, labelY: 0 });
    y += h + GAP;
  }
  return nodes;
}

export function SessionSankey({ flow, date, locale }: { flow: SessionFlow; date: string; locale: Locale }) {
  const { t } = useTranslation();
  const copy = ui(locale);
  const intl = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  const unit = t('stock.flowLotsUnit');

  const nl = GROUP_ORDER.filter((g) => flow.sell[g as G] > 0).length;
  const nr = GROUP_ORDER.filter((g) => flow.buy[g as G] > 0).length;
  const usable = 190;
  const scale = flow.total > 0 ? Math.min((usable - GAP * Math.max(nl - 1, 0)) / flow.total, (usable - GAP * Math.max(nr - 1, 0)) / flow.total) : 0;

  const left = layout(flow.sell, scale);
  const right = layout(flow.buy, scale);

  // Labels sit at the node centre, pushed down so neighbours never overlap.
  const placeLabels = (nodes: Node[]) => {
    let min = 0;
    for (const node of nodes) {
      node.labelY = Math.max(node.y + node.h / 2 - 11, min);
      min = node.labelY + 38;
    }
  };
  placeLabels(left);
  placeLabels(right);

  const height = Math.max(
    usable + PAD * 2,
    ...left.map((n) => n.labelY + 40),
    ...right.map((n) => n.labelY + 40),
    ...left.map((n) => n.y + n.h + PAD),
    ...right.map((n) => n.y + n.h + PAD),
  );

  const links = left.flatMap((s) =>
    right.map((b) => {
      const lots = (s.lots * b.lots) / flow.total;
      const h = lots * scale;
      const y0 = s.cursor + h / 2;
      const y1 = b.cursor + h / 2;
      s.cursor += h;
      b.cursor += h;
      return { key: `${s.group}-${b.group}`, group: s.group, h, y0, y1 };
    }),
  );

  const xs = NODE_X_LEFT + NODE_W;
  const xe = NODE_X_RIGHT;
  const xm = (xs + xe) / 2;

  const label = (node: Node, side: 'left' | 'right') => {
    const lines = [...wrap(t(GROUP_LABEL_KEY[node.group])), `${intl.format(node.lots)} ${unit}`];
    const x = side === 'left' ? NODE_X_LEFT - 6 : NODE_X_RIGHT + NODE_W + 6;
    return (
      <text key={`${side}-${node.group}`} x={x} y={node.labelY + 10} textAnchor={side === 'left' ? 'end' : 'start'} fontSize={10}>
        {lines.map((line, i) => (
          <tspan
            key={i}
            x={x}
            dy={i === 0 ? 0 : 11}
            className={i === lines.length - 1 ? 'fill-current text-muted' : 'fill-current text-ink'}
            fontWeight={i === lines.length - 1 ? 400 : 600}
          >
            {line}
          </tspan>
        ))}
      </text>
    );
  };

  return (
    <div>
      <p className="eyebrow">{copy.sankeyCaption(formatSessionDate(date, locale))}</p>
      <div className="mt-1 flex justify-between px-1 text-[11px] font-semibold text-muted">
        <span>{copy.sold}</span>
        <span>{copy.bought}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={copy.sankeyAria(formatSessionDate(date, locale))}
        className="mt-1 block h-auto w-full"
        data-testid="session-sankey"
      >
        {links.map((link) => (
          <path
            key={link.key}
            d={`M${xs},${link.y0} C${xm},${link.y0} ${xm},${link.y1} ${xe},${link.y1}`}
            fill="none"
            stroke={GROUP_COLOURS[link.group]}
            strokeOpacity={link.group === 'unknown' ? 0.55 : 0.32}
            strokeWidth={Math.max(link.h, 0.5)}
          />
        ))}
        {left.map((n) => (
          <rect key={`l-${n.group}`} x={NODE_X_LEFT} y={n.y} width={NODE_W} height={n.h} rx={2} fill={GROUP_COLOURS[n.group]} stroke={n.group === 'unknown' ? '#94A3B8' : 'none'} strokeDasharray={n.group === 'unknown' ? '2 2' : undefined} />
        ))}
        {right.map((n) => (
          <rect key={`r-${n.group}`} x={NODE_X_RIGHT} y={n.y} width={NODE_W} height={n.h} rx={2} fill={GROUP_COLOURS[n.group]} stroke={n.group === 'unknown' ? '#94A3B8' : 'none'} strokeDasharray={n.group === 'unknown' ? '2 2' : undefined} />
        ))}
        {left.map((n) => label(n, 'left'))}
        {right.map((n) => label(n, 'right'))}
      </svg>

      <h3 className="eyebrow mt-4">{copy.sankeyNetTitle}</h3>
      <ul className="mt-2 divide-y divide-line">
        {GROUP_ORDER.map((group) => {
          const net = flow.nets[group as G];
          return (
            <li key={group} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-ink">
                <span aria-hidden="true" style={groupDotStyle(group)} />
                <span className="truncate">{t(GROUP_LABEL_KEY[group])}</span>
              </span>
              <span className={`shrink-0 tabular-nums ${net > 0 ? 'font-semibold text-buy' : net < 0 ? 'font-semibold text-sell' : 'font-semibold text-muted'}`}>
                {net > 0 ? '+' : net < 0 ? '−' : ''}
                {intl.format(Math.abs(net))} {unit}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
