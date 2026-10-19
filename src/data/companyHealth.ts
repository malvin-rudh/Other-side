// Financial-statement figures per instrument, for the Company Health card.
// Amounts are full rupiah. SINI's are exactly as filed; the SMP sample stocks
// carry made-up reports written to fit each stock's storyline, marked fictional.
// SINI: FinancialStatement-2026-II-SINI.xlsx, the IDX XBRL workbook for the
// Q2 2026 report (results for 1 Jan to 30 Jun 2026, limited review), sheets 1210000
// (financial position), 1311000 (profit or loss) and 1510000 (cash flows).
// The Q1 2026 comparison comes from FinancialStatement-2026-I-SINI.xlsx.

export interface HealthBalance {
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash: number;
  currentAssets: number;
  currentLiabilities: number;
  // Short-term bank loans, current maturities and long-term bank loans.
  bankLoans: number;
  // Amounts due to related parties, current and non-current.
  relatedPartyBorrowings: number;
}

export interface HealthResults {
  revenue: number;
  profitBeforeTax: number;
  // Booked under other gains (losses); the filing's own line item.
  oneOffGain: number;
  netProfit: number;
  operatingCashFlow: number;
}

export interface CompanyHealthReport {
  ticker: string;
  label: string;
  periodEnd: string;
  // The balance-sheet comparison date and the results comparison period end.
  priorBalanceDate: string;
  priorResultsEnd: string;
  // The first day the report may be shown in the replay.
  availableFrom: string;
  reviewType: 'limited-review' | 'audited' | 'unaudited';
  // True for the made-up reports of the fictional sample stocks.
  fictional: boolean;
  balance: HealthBalance;
  priorBalance: HealthBalance;
  results: HealthResults;
  priorResults: HealthResults;
  // The financial report before this one (the previous quarter), when it is
  // on file. Revenue is that report's own year-to-date figure. SINI's real Q1
  // 2026 report is not in the repo yet, so SINI has none and the card falls
  // back to the December balance and the H1 2025 results.
  previousReport?: PreviousReport;
}

export interface PreviousReport {
  label: string;
  periodEnd: string;
  revenue: number;
  totalAssets: number;
  totalLiabilities: number;
  cash: number;
}

const REPORTS: Record<string, CompanyHealthReport> = {
  SINI: {
    ticker: 'SINI',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    // The review report is dated 14 Aug 2026; the replay uses the first public
    // coverage of the results (20 Aug 2026) so no view can see it early.
    availableFrom: '2026-08-20',
    reviewType: 'limited-review',
    fictional: false,
    // FinancialStatement-2026-I-SINI.xlsx, the Q1 2026 report (31 Mar 2026),
    // sheets 1210000 and 1311000.
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 273_935_715_267,
      totalAssets: 1_647_768_740_947,
      totalLiabilities: 2_323_810_134_709,
      cash: 74_429_360_209,
    },
    balance: {
      totalAssets: 5_423_537_074_611,
      totalLiabilities: 5_476_776_544_261,
      totalEquity: -53_239_469_650,
      cash: 336_313_618_627,
      currentAssets: 1_318_160_164_549,
      currentLiabilities: 4_057_769_394_252,
      bankLoans: 933_466_239_095 + 15_732_151_544 + 187_023_893_946,
      relatedPartyBorrowings: 1_519_200_000_000 + 663_407_000_000,
    },
    priorBalance: {
      totalAssets: 1_569_197_460_365,
      totalLiabilities: 2_256_613_426_882,
      totalEquity: -687_415_966_517,
      cash: 33_565_948_051,
      currentAssets: 687_763_151_181,
      currentLiabilities: 1_821_585_075_379,
      bankLoans: 932_303_920_677 + 4_734_929_585 + 13_823_967_757,
      relatedPartyBorrowings: 407_117_000_000,
    },
    results: {
      revenue: 389_235_335_635,
      profitBeforeTax: 631_406_634_846,
      oneOffGain: 662_736_236_983,
      netProfit: 634_013_797_904,
      operatingCashFlow: 7_883_467_039,
    },
    priorResults: {
      revenue: 186_558_179_707,
      profitBeforeTax: -24_003_240_487,
      oneOffGain: 0,
      netProfit: -26_408_121_597,
      operatingCashFlow: -56_983_417_131,
    },
  },
};

const FICTIONAL_REPORTS: Record<string, CompanyHealthReport> = {
  SMPA: {
    // Fictional. Accumulation story: growing, paying down debt.
    ticker: 'SMPA',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-09-11',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 4_250_000_000_000,
      totalLiabilities: 2_150_000_000_000,
      totalEquity: 2_100_000_000_000,
      cash: 610_000_000_000,
      currentAssets: 1_600_000_000_000,
      currentLiabilities: 1_000_000_000_000,
      bankLoans: 700_000_000_000,
      relatedPartyBorrowings: 40_000_000_000,
    },
    priorBalance: {
      totalAssets: 3_980_000_000_000,
      totalLiabilities: 2_080_000_000_000,
      totalEquity: 1_900_000_000_000,
      cash: 480_000_000_000,
      currentAssets: 1_450_000_000_000,
      currentLiabilities: 1_050_000_000_000,
      bankLoans: 820_000_000_000,
      relatedPartyBorrowings: 50_000_000_000,
    },
    results: {
      revenue: 1_450_000_000_000,
      profitBeforeTax: 210_000_000_000,
      oneOffGain: 0,
      netProfit: 165_000_000_000,
      operatingCashFlow: 190_000_000_000,
    },
    priorResults: {
      revenue: 1_280_000_000_000,
      profitBeforeTax: 172_000_000_000,
      oneOffGain: 0,
      netProfit: 134_000_000_000,
      operatingCashFlow: 140_000_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 690_000_000_000,
      totalAssets: 4_120_000_000_000,
      totalLiabilities: 2_130_000_000_000,
      cash: 540_000_000_000,
    },
  },
  SMPB: {
    // Fictional. Distribution story: margins narrowing, debt up, a one-off asset sale props up profit.
    ticker: 'SMPB',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-09-15',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 1_980_000_000_000,
      totalLiabilities: 1_080_000_000_000,
      totalEquity: 900_000_000_000,
      cash: 95_000_000_000,
      currentAssets: 520_000_000_000,
      currentLiabilities: 547_000_000_000,
      bankLoans: 520_000_000_000,
      relatedPartyBorrowings: 0,
    },
    priorBalance: {
      totalAssets: 1_870_000_000_000,
      totalLiabilities: 920_000_000_000,
      totalEquity: 950_000_000_000,
      cash: 140_000_000_000,
      currentAssets: 560_000_000_000,
      currentLiabilities: 487_000_000_000,
      bankLoans: 400_000_000_000,
      relatedPartyBorrowings: 0,
    },
    results: {
      revenue: 610_000_000_000,
      profitBeforeTax: 22_000_000_000,
      oneOffGain: 15_000_000_000,
      netProfit: 16_000_000_000,
      operatingCashFlow: -12_000_000_000,
    },
    priorResults: {
      revenue: 580_000_000_000,
      profitBeforeTax: 41_000_000_000,
      oneOffGain: 0,
      netProfit: 31_000_000_000,
      operatingCashFlow: 35_000_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 300_000_000_000,
      totalAssets: 1_920_000_000_000,
      totalLiabilities: 1_000_000_000_000,
      cash: 120_000_000_000,
    },
  },
  SMPC: {
    // Fictional. News-spike story: an early-stage explorer with little revenue, funded by its parent.
    ticker: 'SMPC',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-08-31',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 640_000_000_000,
      totalLiabilities: 330_000_000_000,
      totalEquity: 310_000_000_000,
      cash: 22_000_000_000,
      currentAssets: 85_000_000_000,
      currentLiabilities: 140_000_000_000,
      bankLoans: 60_000_000_000,
      relatedPartyBorrowings: 210_000_000_000,
    },
    priorBalance: {
      totalAssets: 590_000_000_000,
      totalLiabilities: 260_000_000_000,
      totalEquity: 330_000_000_000,
      cash: 48_000_000_000,
      currentAssets: 96_000_000_000,
      currentLiabilities: 118_000_000_000,
      bankLoans: 45_000_000_000,
      relatedPartyBorrowings: 120_000_000_000,
    },
    results: {
      revenue: 12_000_000_000,
      profitBeforeTax: -38_000_000_000,
      oneOffGain: 0,
      netProfit: -38_000_000_000,
      operatingCashFlow: -41_000_000_000,
    },
    priorResults: {
      revenue: 9_000_000_000,
      profitBeforeTax: -26_000_000_000,
      oneOffGain: 0,
      netProfit: -26_000_000_000,
      operatingCashFlow: -29_000_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 5_000_000_000,
      totalAssets: 615_000_000_000,
      totalLiabilities: 295_000_000_000,
      cash: 35_000_000_000,
    },
  },
  SMPD: {
    // Fictional. Calm large-cap story: steady results, little change.
    ticker: 'SMPD',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-08-28',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 31_600_000_000_000,
      totalLiabilities: 13_200_000_000_000,
      totalEquity: 18_400_000_000_000,
      cash: 4_100_000_000_000,
      currentAssets: 9_800_000_000_000,
      currentLiabilities: 6_100_000_000_000,
      bankLoans: 2_000_000_000_000,
      relatedPartyBorrowings: 0,
    },
    priorBalance: {
      totalAssets: 31_100_000_000_000,
      totalLiabilities: 13_000_000_000_000,
      totalEquity: 18_100_000_000_000,
      cash: 3_800_000_000_000,
      currentAssets: 9_500_000_000_000,
      currentLiabilities: 6_010_000_000_000,
      bankLoans: 2_100_000_000_000,
      relatedPartyBorrowings: 0,
    },
    results: {
      revenue: 21_600_000_000_000,
      profitBeforeTax: 2_900_000_000_000,
      oneOffGain: 0,
      netProfit: 2_250_000_000_000,
      operatingCashFlow: 3_100_000_000_000,
    },
    priorResults: {
      revenue: 21_100_000_000_000,
      profitBeforeTax: 2_780_000_000_000,
      oneOffGain: 0,
      netProfit: 2_160_000_000_000,
      operatingCashFlow: 2_800_000_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 10_700_000_000_000,
      totalAssets: 31_400_000_000_000,
      totalLiabilities: 13_100_000_000_000,
      cash: 3_900_000_000_000,
    },
  },
  SMPE: {
    // Fictional. Reversal story: a weak half and rising debt before the September refinancing.
    ticker: 'SMPE',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-08-26',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 5_400_000_000_000,
      totalLiabilities: 4_200_000_000_000,
      totalEquity: 1_200_000_000_000,
      cash: 310_000_000_000,
      currentAssets: 1_450_000_000_000,
      currentLiabilities: 1_650_000_000_000,
      bankLoans: 2_600_000_000_000,
      relatedPartyBorrowings: 280_000_000_000,
    },
    priorBalance: {
      totalAssets: 5_520_000_000_000,
      totalLiabilities: 4_170_000_000_000,
      totalEquity: 1_350_000_000_000,
      cash: 420_000_000_000,
      currentAssets: 1_620_000_000_000,
      currentLiabilities: 1_590_000_000_000,
      bankLoans: 2_400_000_000_000,
      relatedPartyBorrowings: 300_000_000_000,
    },
    results: {
      revenue: 1_900_000_000_000,
      profitBeforeTax: -60_000_000_000,
      oneOffGain: 25_000_000_000,
      netProfit: -52_000_000_000,
      operatingCashFlow: 95_000_000_000,
    },
    priorResults: {
      revenue: 2_200_000_000_000,
      profitBeforeTax: 48_000_000_000,
      oneOffGain: 0,
      netProfit: 37_000_000_000,
      operatingCashFlow: 160_000_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 1_020_000_000_000,
      totalAssets: 5_450_000_000_000,
      totalLiabilities: 4_190_000_000_000,
      cash: 360_000_000_000,
    },
  },
  SHKA: {
    // Fictional. Hong Kong, HKD. Southbound accumulation story: growing, borrowings down.
    ticker: 'SHKA',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-09-10',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 18_400_000_000,
      totalLiabilities: 9_100_000_000,
      totalEquity: 9_300_000_000,
      cash: 2_600_000_000,
      currentAssets: 5_200_000_000,
      currentLiabilities: 3_900_000_000,
      bankLoans: 3_200_000_000,
      relatedPartyBorrowings: 150_000_000,
    },
    priorBalance: {
      totalAssets: 17_600_000_000,
      totalLiabilities: 9_000_000_000,
      totalEquity: 8_600_000_000,
      cash: 2_100_000_000,
      currentAssets: 4_800_000_000,
      currentLiabilities: 3_800_000_000,
      bankLoans: 3_500_000_000,
      relatedPartyBorrowings: 200_000_000,
    },
    results: {
      revenue: 5_600_000_000,
      profitBeforeTax: 780_000_000,
      oneOffGain: 0,
      netProfit: 640_000_000,
      operatingCashFlow: 820_000_000,
    },
    priorResults: {
      revenue: 5_000_000_000,
      profitBeforeTax: 640_000_000,
      oneOffGain: 0,
      netProfit: 520_000_000,
      operatingCashFlow: 600_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 2_700_000_000,
      totalAssets: 18_000_000_000,
      totalLiabilities: 9_050_000_000,
      cash: 2_350_000_000,
    },
  },
  SHKB: {
    // Fictional. Hong Kong, HKD. Placement story: a widening loss and thinning cash before a share placement.
    ticker: 'SHKB',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-09-14',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 4_600_000_000,
      totalLiabilities: 2_700_000_000,
      totalEquity: 1_900_000_000,
      cash: 1_100_000_000,
      currentAssets: 1_700_000_000,
      currentLiabilities: 1_500_000_000,
      bankLoans: 1_100_000_000,
      relatedPartyBorrowings: 300_000_000,
    },
    priorBalance: {
      totalAssets: 4_900_000_000,
      totalLiabilities: 2_500_000_000,
      totalEquity: 2_400_000_000,
      cash: 1_600_000_000,
      currentAssets: 2_200_000_000,
      currentLiabilities: 1_300_000_000,
      bankLoans: 900_000_000,
      relatedPartyBorrowings: 250_000_000,
    },
    results: {
      revenue: 380_000_000,
      profitBeforeTax: -310_000_000,
      oneOffGain: 0,
      netProfit: -295_000_000,
      operatingCashFlow: -260_000_000,
    },
    priorResults: {
      revenue: 340_000_000,
      profitBeforeTax: -220_000_000,
      oneOffGain: 0,
      netProfit: -210_000_000,
      operatingCashFlow: -190_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 185_000_000,
      totalAssets: 4_750_000_000,
      totalLiabilities: 2_600_000_000,
      cash: 1_350_000_000,
    },
  },
  SKRA: {
    // Fictional. Korea, KRW. Retail frenzy story: thin margins, current liabilities above current assets, cash burn.
    ticker: 'SKRA',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-09-17',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 1_840_000_000_000,
      totalLiabilities: 1_220_000_000_000,
      totalEquity: 620_000_000_000,
      cash: 140_000_000_000,
      currentAssets: 620_000_000_000,
      currentLiabilities: 710_000_000_000,
      bankLoans: 580_000_000_000,
      relatedPartyBorrowings: 50_000_000_000,
    },
    priorBalance: {
      totalAssets: 1_660_000_000_000,
      totalLiabilities: 1_050_000_000_000,
      totalEquity: 610_000_000_000,
      cash: 200_000_000_000,
      currentAssets: 600_000_000_000,
      currentLiabilities: 580_000_000_000,
      bankLoans: 460_000_000_000,
      relatedPartyBorrowings: 40_000_000_000,
    },
    results: {
      revenue: 520_000_000_000,
      profitBeforeTax: 18_000_000_000,
      oneOffGain: 0,
      netProfit: 11_000_000_000,
      operatingCashFlow: -22_000_000_000,
    },
    priorResults: {
      revenue: 410_000_000_000,
      profitBeforeTax: 29_000_000_000,
      oneOffGain: 0,
      netProfit: 22_000_000_000,
      operatingCashFlow: 15_000_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 240_000_000_000,
      totalAssets: 1_750_000_000_000,
      totalLiabilities: 1_130_000_000_000,
      cash: 170_000_000_000,
    },
  },
  SKRB: {
    // Fictional. Korea, KRW. Steady accumulation story: growing profit, loan balance down.
    ticker: 'SKRB',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-09-10',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 6_900_000_000_000,
      totalLiabilities: 2_400_000_000_000,
      totalEquity: 4_500_000_000_000,
      cash: 1_300_000_000_000,
      currentAssets: 3_100_000_000_000,
      currentLiabilities: 1_500_000_000_000,
      bankLoans: 800_000_000_000,
      relatedPartyBorrowings: 0,
    },
    priorBalance: {
      totalAssets: 6_400_000_000_000,
      totalLiabilities: 2_400_000_000_000,
      totalEquity: 4_000_000_000_000,
      cash: 1_000_000_000_000,
      currentAssets: 2_800_000_000_000,
      currentLiabilities: 1_500_000_000_000,
      bankLoans: 900_000_000_000,
      relatedPartyBorrowings: 0,
    },
    results: {
      revenue: 2_350_000_000_000,
      profitBeforeTax: 410_000_000_000,
      oneOffGain: 0,
      netProfit: 320_000_000_000,
      operatingCashFlow: 470_000_000_000,
    },
    priorResults: {
      revenue: 1_900_000_000_000,
      profitBeforeTax: 290_000_000_000,
      oneOffGain: 0,
      netProfit: 225_000_000_000,
      operatingCashFlow: 330_000_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 1_130_000_000_000,
      totalAssets: 6_650_000_000_000,
      totalLiabilities: 2_400_000_000_000,
      cash: 1_150_000_000_000,
    },
  },
  SCNA: {
    // Fictional. China, CNY. Squeeze story: thin profit propped by a one-off subsidy, cash flow negative, short-term debt heavy.
    ticker: 'SCNA',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-09-16',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 3_600_000_000,
      totalLiabilities: 2_300_000_000,
      totalEquity: 1_300_000_000,
      cash: 350_000_000,
      currentAssets: 1_900_000_000,
      currentLiabilities: 1_700_000_000,
      bankLoans: 900_000_000,
      relatedPartyBorrowings: 120_000_000,
    },
    priorBalance: {
      totalAssets: 3_300_000_000,
      totalLiabilities: 2_000_000_000,
      totalEquity: 1_300_000_000,
      cash: 500_000_000,
      currentAssets: 1_800_000_000,
      currentLiabilities: 1_400_000_000,
      bankLoans: 700_000_000,
      relatedPartyBorrowings: 80_000_000,
    },
    results: {
      revenue: 640_000_000,
      profitBeforeTax: 38_000_000,
      oneOffGain: 22_000_000,
      netProfit: 31_000_000,
      operatingCashFlow: -45_000_000,
    },
    priorResults: {
      revenue: 560_000_000,
      profitBeforeTax: 61_000_000,
      oneOffGain: 0,
      netProfit: 52_000_000,
      operatingCashFlow: 20_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 305_000_000,
      totalAssets: 3_450_000_000,
      totalLiabilities: 2_150_000_000,
      cash: 420_000_000,
    },
  },
  SCNB: {
    // Fictional. China, CNY. Institutional accumulation story: growing revenue and profit, low debt.
    ticker: 'SCNB',
    label: 'Q2 2026',
    periodEnd: '2026-06-30',
    priorBalanceDate: '2025-12-31',
    priorResultsEnd: '2025-06-30',
    availableFrom: '2026-09-14',
    reviewType: 'unaudited',
    fictional: true,
    balance: {
      totalAssets: 5_900_000_000,
      totalLiabilities: 1_900_000_000,
      totalEquity: 4_000_000_000,
      cash: 1_400_000_000,
      currentAssets: 3_000_000_000,
      currentLiabilities: 1_100_000_000,
      bankLoans: 500_000_000,
      relatedPartyBorrowings: 0,
    },
    priorBalance: {
      totalAssets: 5_500_000_000,
      totalLiabilities: 1_900_000_000,
      totalEquity: 3_600_000_000,
      cash: 1_100_000_000,
      currentAssets: 2_700_000_000,
      currentLiabilities: 1_100_000_000,
      bankLoans: 600_000_000,
      relatedPartyBorrowings: 0,
    },
    results: {
      revenue: 1_250_000_000,
      profitBeforeTax: 290_000_000,
      oneOffGain: 0,
      netProfit: 245_000_000,
      operatingCashFlow: 310_000_000,
    },
    priorResults: {
      revenue: 1_050_000_000,
      profitBeforeTax: 220_000_000,
      oneOffGain: 0,
      netProfit: 185_000_000,
      operatingCashFlow: 205_000_000,
    },
    // Q1 2026 report: revenue is its own year-to-date figure (1 Jan to 31 Mar).
    previousReport: {
      label: 'Q1 2026',
      periodEnd: '2026-03-31',
      revenue: 590_000_000,
      totalAssets: 5_700_000_000,
      totalLiabilities: 1_900_000_000,
      cash: 1_250_000_000,
    },
  },
};

export function findHealthReport(ticker: string): CompanyHealthReport | null {
  return REPORTS[ticker] ?? FICTIONAL_REPORTS[ticker] ?? null;
}
