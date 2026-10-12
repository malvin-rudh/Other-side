import { describe, expect, it } from 'vitest';
import brokersDoc from '../../public/data/brokers.json';
import rowsDoc from '../../public/data/sini/rows.json';
import type { BrokerProfile, NormalizedBrokerRow } from '../data/schemas';
import {
  brokerNet,
  cumulativeGroupNet,
  impliedPriceReference,
  rowsInWindow,
  signedMagnitudes,
  topBuyers,
  topSellers,
} from './flows';

const rows = rowsDoc.rows as NormalizedBrokerRow[];
const brokers = brokersDoc.brokers as BrokerProfile[];
const cleanWindow = { start: '2026-08-14', end: '2026-09-23' };

function rowsForFormula(start: string, end: string, predicate: (row: NormalizedBrokerRow) => boolean) {
  return rowsInWindow(rows, { start, end })
    .filter(predicate)
    .map((row) => `${row.id}:${row.brokerCode}:${row.side}:${row.netLots} lots:${row.netValueIdr} IDR`)
    .join('\n');
}

function groupGapMessage() {
  const totals = cumulativeGroupNet(rows, brokers, cleanWindow);
  return `group totals = ${JSON.stringify(totals)}\nformula: sum(side sign × netLots) for accepted rows in ${cleanWindow.start}..${cleanWindow.end}`;
}

function priceGapMessage(start: string, end: string, predicate: (row: NormalizedBrokerRow) => boolean) {
  return `inputs:\n${rowsForFormula(start, end, predicate)}\nformula: sum netValueIdr / (100 × sum netLots)`;
}

describe('flow engine golden totals', () => {
  it('computes signed row magnitudes from side-supplied signs', () => {
    const buy = rows.find((row) => row.id === 'SINI-20260814-B01');
    const sell = rows.find((row) => row.id === 'SINI-20260814-S01');
    expect(buy).toBeDefined();
    expect(sell).toBeDefined();
    expect(signedMagnitudes(buy!).signedLots).toBe(buy!.netLots);
    expect(signedMagnitudes(sell!).signedLots).toBe(-sell!.netLots);
  });

  it('filters rows in an explicit inclusive window', () => {
    const filtered = rowsInWindow(rows, { start: '2026-08-24', end: '2026-08-24' });
    expect(filtered).toHaveLength(18);
    expect(filtered.every((row) => row.date === '2026-08-24')).toBe(true);
  });

  it('computes cumulative scenario groups for the clean window', () => {
    expect(cumulativeGroupNet(rows, brokers, cleanWindow), groupGapMessage()).toEqual({
      app_facing: -151_156,
      institution_facing: 181_305,
      other_mixed: -116_835,
      unknown: 0,
      residual: -86_686,
    });
  });

  it('computes top buyers and sellers from broker net lots', () => {
    const buyerNets = topBuyers(rows, cleanWindow, 6).map(({ brokerCode, netLots }) => [brokerCode, netLots]);
    expect(buyerNets).toEqual([
      ['CC', 70_932],
      ['TP', 41_183],
      ['MG', 38_552],
      ['AK', 38_393],
      ['ZP', 32_395],
      ['BK', 25_800],
    ]);

    const sellerNets = topSellers(rows, cleanWindow, 12);
    expect(sellerNets.slice(0, 5).map(({ brokerCode, netLots }) => [brokerCode, netLots])).toEqual([
      ['XL', -149_629],
      ['HP', -101_982],
      ['ES', -81_500],
      ['CP', -37_120],
      ['LG', -31_970],
    ]);
    expect(sellerNets.find((net) => net.brokerCode === 'YP')?.netLots).toBe(-9_701);
  });

  it('exposes broker net details without changing the totals', () => {
    expect(brokerNet(rows, cleanWindow).find((net) => net.brokerCode === 'YP')?.netLots).toBe(-9_701);
  });
});

describe('implied net-flow price references', () => {
  it('computes daily visible net-buy references', () => {
    const expected = [
      ['2026-08-14', 7_009],
      ['2026-08-24', 8_777],
      ['2026-09-03', 13_736],
      ['2026-09-23', 17_873],
    ] as const;

    for (const [date, display] of expected) {
      const actual = impliedPriceReference(rows, brokers, 'buy', { type: 'all' }, { start: date, end: date });
      expect(actual.available).toBe(true);
      if (actual.available) {
        expect(actual.display, priceGapMessage(date, date, (row) => row.date === date && row.side === 'buy')).toBe(display);
      }
    }
  });

  it('computes institution-facing net-buy and XL net-sell references', () => {
    const to2Sep = impliedPriceReference(rows, brokers, 'buy', { type: 'group', group: 'institution_facing' }, { start: '2026-08-14', end: '2026-09-02' });
    const full = impliedPriceReference(rows, brokers, 'buy', { type: 'group', group: 'institution_facing' }, cleanWindow);
    const xlSell = impliedPriceReference(rows, brokers, 'sell', { type: 'broker', brokerCode: 'XL' }, cleanWindow);

    expect(to2Sep.available).toBe(true);
    expect(full.available).toBe(true);
    expect(xlSell.available).toBe(true);
    if (to2Sep.available) expect(to2Sep.display).toBe(10_783);
    if (full.available) expect(full.display).toBe(13_317);
    if (xlSell.available) expect(xlSell.display).toBe(12_392);
  });

  it('returns unavailable for missing inputs and non-positive denominators', () => {
    expect(
      impliedPriceReference([{ date: '2026-09-23', side: 'buy', brokerCode: 'XL', netLots: 1 }], brokers, 'buy', { type: 'all' }, { start: '2026-09-23', end: '2026-09-23' }),
    ).toEqual({ available: false, reason: 'missing-input' });
    expect(
      impliedPriceReference([{ date: '2026-09-23', side: 'buy', brokerCode: 'XL', netLots: 0, netValueIdr: 0 }], brokers, 'buy', { type: 'all' }, { start: '2026-09-23', end: '2026-09-23' }),
    ).toEqual({ available: false, reason: 'non-positive-denominator' });
  });

  it('rejects unsafe integer inputs', () => {
    expect(() =>
      signedMagnitudes({ side: 'buy', netLots: Number.MAX_SAFE_INTEGER + 1, netValueIdr: 1 }),
    ).toThrow(/safe integer/);
    expect(
      impliedPriceReference(
        [{ date: '2026-09-23', side: 'buy', brokerCode: 'XL', netLots: Number.MAX_SAFE_INTEGER + 1, netValueIdr: 1 }],
        brokers,
        'buy',
        { type: 'all' },
        { start: '2026-09-23', end: '2026-09-23' },
      ),
    ).toEqual({ available: false, reason: 'unsafe-integer' });
  });
});
