// SINI adjusted daily closes from Yahoo Finance (SINI.JK), copied once on
// 17 Oct 2026 for the replay window. Yahoo reports no dividend or split in the
// window, so the adjusted close equals the close. 8 Sep 2026 is left out: Yahoo
// shows no volume that day and repeats the previous close.
export const SINI_ADJUSTED_CLOSES: readonly { date: string; close: number }[] = [
  { date: '2026-08-13', close: 7000 },
  { date: '2026-08-14', close: 7025 },
  { date: '2026-08-18', close: 7175 },
  { date: '2026-08-19', close: 7250 },
  { date: '2026-08-20', close: 7350 },
  { date: '2026-08-21', close: 8075 },
  { date: '2026-08-24', close: 8750 },
  { date: '2026-08-26', close: 8500 },
  { date: '2026-08-27', close: 8750 },
  { date: '2026-08-28', close: 9625 },
  { date: '2026-08-31', close: 10650 },
  { date: '2026-09-01', close: 12500 },
  { date: '2026-09-02', close: 12750 },
  { date: '2026-09-03', close: 14700 },
  { date: '2026-09-04', close: 14500 },
  { date: '2026-09-07', close: 15075 },
  { date: '2026-09-09', close: 14250 },
  { date: '2026-09-10', close: 13550 },
  { date: '2026-09-11', close: 13100 },
  { date: '2026-09-14', close: 13750 },
  { date: '2026-09-15', close: 13350 },
  { date: '2026-09-16', close: 14475 },
  { date: '2026-09-17', close: 16800 },
  { date: '2026-09-18', close: 16900 },
  { date: '2026-09-21', close: 16450 },
  { date: '2026-09-22', close: 16050 },
  { date: '2026-09-23', close: 18300 },
];

const STATIC_CLOSES: Record<string, readonly { date: string; close: number }[]> = {
  SINI: SINI_ADJUSTED_CLOSES,
};

export function staticCloses(ticker: string): readonly { date: string; close: number }[] | null {
  return STATIC_CLOSES[ticker] ?? null;
}
