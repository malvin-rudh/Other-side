// The research method copy, in the three supported locales.
//
// This is reviewed prose: it describes how the prototype reasons, how the Live
// Radar score works, what the data can and cannot say, and what the AI does and
// does not do. It never states a market conclusion, a ranking or a trade.

import type { Locale } from '../engine/context';

export type ResearchLayerId = 'story' | 'flow' | 'health';

export interface ResearchLayer {
  id: ResearchLayerId;
  label: string;
  question: string;
  intro: string;
  checks: string[];
  why: string;
  unknown: string;
}

export interface ResearchContent {
  label: string;
  title: string;
  intro: string;
  framework: string;
  frameworkLine: string;
  checksLabel: string;
  whyLabel: string;
  unknownLabel: string;
  layers: ResearchLayer[];
  scopeTitle: string;
  scope: string;
  dataTitle: string;
  data: { title: string; body: string }[];
  aiTitle: string;
  ai: { title: string; body: string }[];
  source: string;
  proposal: string;
  stocks: string;
  radar: ResearchRadar;
}

export interface ResearchRadar {
  title: string;
  intro: string;
  pillarCol: string;
  checkCol: string;
  pointsCol: string;
  weightWord: string;
  notes: Record<'transactions' | 'health' | 'events', string>;
  eventRows: { text: string; grade: string; points: string }[];
  labelsTitle: string;
  labels: { name: string; rule: string }[];
  scoreRule: string;
  replayTitle: string;
  replay: string;
  limits: string;
  sourcesTitle: string;
  sources: { title: string; url: string; used: string }[];
}

const RADAR_URLS = {
  piotroski: 'https://alphaarchitect.com/value-investing-research-simple-methods-to-improve-the-piotroski-f-score/',
  piotroskiTv: 'https://in.tradingview.com/support/solutions/43000597734',
  altman: 'https://corporatefinanceinstitute.com/resources/accounting/altmans-z-score-model/',
  ajaib: 'https://ajaib.co.id/belajar/investasi/bedah-strategi-bandarmology',
  pluang: 'https://pluang.com/faq/Indonesian%20Stocks/Indonesian%20Stocks%20Transaction/What-are-the-Broker-Foreign-Screeners-for-Indonesian-Stocks-on-Pluang',
  adl: 'https://luxalgo.com/blog/accumulationdistribution-line-basics-explained',
  pead: 'https://business.columbia.edu/sites/default/files-efs/imce-uploads/CEASA/Events%20Page/PEAD_Declined_over_time.pdf',
};

const RADAR_EN: ResearchRadar = {
  title: 'How the Live Radar score works',
  intro: 'The radar gives each stock a score from 0 to 100. It is a fixed set of graded checks. Each check earns partial credit by strength, and the credits are added up with fixed weights. There is no machine learning, and nothing is hidden. A stock needs every check at its extreme to reach 100, so strong stocks usually land in the 70s to low 90s. The score says how strongly the three layers line up. It is not a recommendation.',
  pillarCol: 'Pillar',
  checkCol: 'Check',
  pointsCol: 'Points',
  weightWord: 'weight',
  notes: {
    transactions: 'Who is buying or selling, from the broker summary. Institution-facing brokers are the group we follow.',
    health: 'Six graded checks on the latest filed report, in the spirit of the Piotroski F-score. Bigger margins and stronger cover earn more.',
    events: 'How fresh the latest story and health events are. Freshness only: an event can be good or bad news.',
  },
  eventRows: [
    { text: 'Latest story event is fresh', grade: 'Points fall in a straight line with the age of the latest event: published today earns 60, 60 days old earns 0.', points: '0 to 60' },
    { text: 'Latest health event is fresh', grade: 'The same straight-line fade: published today earns 40, 60 days old earns 0.', points: '0 to 40' },
  ],
  labelsTitle: 'Labels',
  labels: [
    { name: 'Leaving', rule: 'Institution-facing brokers net sold over the last 5 sessions, and either also over the whole window or handed their shares to app-facing brokers.' },
    { name: 'Accumulating', rule: 'Not leaving, score 55 or more, and the Transactions pillar at 60 or more.' },
    { name: 'No signal', rule: 'Score below 30, or no broker data on the date.' },
    { name: 'Mixed', rule: 'Everything else.' },
  ],
  scoreRule: 'Each pillar is the sum of its graded checks, from 0 to 100. Score = 50% Transactions + 30% Company health + 20% Events. If a pillar has no data on the date (for example, the report is not public yet), it is dropped and the other weights are scaled up to 100. The Live Radar lists the strongest Accumulating and Leaving stocks, at most 6. Search finds every stock.',
  replayTitle: 'Replay rule',
  replay: 'The radar reads only what was public on the selected session date. Broker rows up to that date, events published on or before it, and a company report only from its available-from date. Change the date and the radar changes with it.',
  limits: 'Limits: only the biggest brokers on each market are visible each day, thresholds are presets we chose, and none of this has been tested for predictive power.',
  sourcesTitle: 'Sources that inspired the checks',
  sources: [
    { title: 'Alpha Architect: improving the Piotroski F-score', url: RADAR_URLS.piotroski, used: 'Binary pass or fail health checks, summed.' },
    { title: 'TradingView: Piotroski F-score', url: RADAR_URLS.piotroskiTv, used: 'Profitability, leverage and cash checks.' },
    { title: 'Corporate Finance Institute: Altman Z-score', url: RADAR_URLS.altman, used: 'Short-term cover and equity as distress signals.' },
    { title: 'Ajaib: bandarmology strategy', url: RADAR_URLS.ajaib, used: 'Concentrated net buying and repeated buying across days.' },
    { title: 'Pluang: broker and foreign screeners', url: RADAR_URLS.pluang, used: 'Top-broker share of net volume, as flow history only.' },
    { title: 'LuxAlgo: accumulation/distribution basics', url: RADAR_URLS.adl, used: 'Cumulative flow as accumulation or distribution.' },
    { title: 'Columbia Business School: post-earnings drift over time', url: RADAR_URLS.pead, used: 'News effects fade, so newer events count more.' },
  ],
};

const RADAR_ID: ResearchRadar = {
  title: 'Cara kerja skor Radar Langsung',
  intro: 'Radar memberi tiap saham skor 0 sampai 100. Skor ini adalah kumpulan pemeriksaan bertingkat. Tiap pemeriksaan memberi poin sebagian menurut kekuatannya, lalu dijumlahkan dengan bobot tetap. Tidak ada machine learning dan tidak ada yang disembunyikan. Skor 100 menuntut semua pemeriksaan di level ekstrem, jadi saham yang kuat biasanya ada di kisaran 70-an sampai awal 90-an. Skor menunjukkan seberapa kuat ketiga lapisan sejalan. Ini bukan rekomendasi.',
  pillarCol: 'Pilar',
  checkCol: 'Pemeriksaan',
  pointsCol: 'Poin',
  weightWord: 'bobot',
  notes: {
    transactions: 'Siapa yang membeli atau menjual, dari ringkasan broker. Kelompok yang kita ikuti adalah broker sisi institusi.',
    health: 'Enam pemeriksaan bertingkat pada laporan terbaru, mengikuti semangat Piotroski F-score. Margin lebih besar dan kecukupan lebih kuat dapat poin lebih banyak.',
    events: 'Seberapa baru peristiwa cerita dan kesehatan terakhir. Hanya soal kebaruan: peristiwa bisa kabar baik atau buruk.',
  },
  eventRows: [
    { text: 'Peristiwa cerita terbaru masih baru', grade: 'Poin turun lurus menurut usia peristiwa terbaru: terbit hari ini dapat 60, berusia 60 hari dapat 0.', points: '0 sampai 60' },
    { text: 'Peristiwa kesehatan terbaru masih baru', grade: 'Penurunan lurus yang sama: terbit hari ini dapat 40, berusia 60 hari dapat 0.', points: '0 sampai 40' },
  ],
  labelsTitle: 'Label',
  labels: [
    { name: 'Keluar', rule: 'Broker sisi institusi net jual dalam 5 sesi terakhir, dan juga net jual sepanjang periode atau saham beralih ke broker sisi aplikasi.' },
    { name: 'Akumulasi', rule: 'Tidak keluar, skor 55 atau lebih, dan pilar Transaksi 60 atau lebih.' },
    { name: 'Tanpa sinyal', rule: 'Skor di bawah 30, atau tidak ada data broker pada tanggal itu.' },
    { name: 'Campuran', rule: 'Selain yang di atas.' },
  ],
  scoreRule: 'Tiap pilar adalah jumlah pemeriksaan bertingkatnya, dari 0 sampai 100. Skor = 50% Transaksi + 30% Kesehatan perusahaan + 20% Peristiwa. Jika satu pilar tidak punya data pada tanggal itu (misalnya laporan belum terbit), pilar itu dilepas dan bobot lainnya dinaikkan sampai 100. Radar Langsung menampilkan saham Akumulasi dan Keluar yang paling kuat, paling banyak 6. Pencarian menemukan semua saham.',
  replayTitle: 'Aturan replay',
  replay: 'Radar hanya membaca data yang sudah publik pada tanggal sesi yang dipilih: baris broker sampai tanggal itu, peristiwa yang terbit pada atau sebelum tanggal itu, dan laporan perusahaan hanya sejak tanggal tersedianya. Ganti tanggal, radar ikut berubah.',
  limits: 'Batasan: hanya broker terbesar di tiap pasar yang terlihat tiap hari, ambang batas adalah preset pilihan kami, dan semua ini belum diuji daya prediksinya.',
  sourcesTitle: 'Sumber yang menginspirasi pemeriksaan',
  sources: [
    { title: 'Alpha Architect: memperbaiki Piotroski F-score', url: RADAR_URLS.piotroski, used: 'Pemeriksaan kesehatan lolos atau tidak, lalu dijumlahkan.' },
    { title: 'TradingView: Piotroski F-score', url: RADAR_URLS.piotroskiTv, used: 'Pemeriksaan profitabilitas, utang, dan kas.' },
    { title: 'Corporate Finance Institute: Altman Z-score', url: RADAR_URLS.altman, used: 'Kecukupan jangka pendek dan ekuitas sebagai tanda tekanan.' },
    { title: 'Ajaib: strategi bandarmology', url: RADAR_URLS.ajaib, used: 'Net beli yang terkonsentrasi dan pembelian berulang antarhari.' },
    { title: 'Pluang: penyaring broker dan asing', url: RADAR_URLS.pluang, used: 'Porsi broker teratas dari volume bersih, hanya sebagai riwayat aliran.' },
    { title: 'LuxAlgo: dasar akumulasi/distribusi', url: RADAR_URLS.adl, used: 'Aliran kumulatif sebagai akumulasi atau distribusi.' },
    { title: 'Columbia Business School: drift pasca-laporan laba', url: RADAR_URLS.pead, used: 'Efek berita memudar, jadi peristiwa baru dihitung lebih besar.' },
  ],
};

const RADAR_ZH: ResearchRadar = {
  title: '实时雷达分数如何计算',
  intro: '雷达给每只股票打 0 到 100 分。它是一组固定的分级检查，每项按强度给部分分数，再按固定权重相加。没有机器学习，也没有隐藏内容。要拿到 100 分，每项检查都必须达到极端水平，所以强势股票通常落在 70 多分到 90 出头。分数表示三个层面吻合的程度，不是建议。',
  pillarCol: '支柱',
  checkCol: '检查项',
  pointsCol: '分值',
  weightWord: '权重',
  notes: {
    transactions: '根据券商汇总看谁在买入或卖出。我们跟踪的是机构侧券商。',
    health: '对最新已披露报告做六项分级检查，思路类似 Piotroski F-score。利润率越高、偿付能力越强，得分越多。',
    events: '最新的消息事件和健康事件有多新。只看新近程度：事件可能是好消息，也可能是坏消息。',
  },
  eventRows: [
    { text: '最新的消息事件够新', grade: '分数随最新事件的天数按直线下降：今天发布得 60 分，满 60 天得 0 分。', points: '0 至 60' },
    { text: '最新的健康事件够新', grade: '同样的直线衰减：今天发布得 40 分，满 60 天得 0 分。', points: '0 至 40' },
  ],
  labelsTitle: '标签',
  labels: [
    { name: '离场', rule: '机构侧券商最近 5 个交易日净卖出，并且整个窗口也是净卖出，或把筹码交给了应用侧券商。' },
    { name: '吸筹', rule: '不属于离场，分数 55 或以上，且交易支柱 60 或以上。' },
    { name: '无信号', rule: '分数低于 30，或该日期没有券商数据。' },
    { name: '混合', rule: '其余情况。' },
  ],
  scoreRule: '每个支柱是其分级检查之和，范围 0 到 100。分数 = 50% 交易 + 30% 公司健康 + 20% 事件。若某个支柱在该日期没有数据（例如报告尚未公开），则该支柱不计入，其余权重按比例放大到 100。实时雷达列出信号最强的吸筹和离场股票，最多 6 只。搜索可找到所有股票。',
  replayTitle: '回放规则',
  replay: '雷达只读取所选交易日当天已公开的内容：该日期之前的券商数据、在该日期当天或之前发布的事件，以及自可用日期起的公司报告。更换日期，雷达随之改变。',
  limits: '局限：每个市场每天只能看到最大的几家券商，阈值是我们选定的预设，且这些都没有经过预测能力的检验。',
  sourcesTitle: '启发这些检查的来源',
  sources: [
    { title: 'Alpha Architect：改进 Piotroski F-score', url: RADAR_URLS.piotroski, used: '二元通过或不通过的健康检查，再相加。' },
    { title: 'TradingView：Piotroski F-score', url: RADAR_URLS.piotroskiTv, used: '盈利、杠杆和现金检查。' },
    { title: 'Corporate Finance Institute：Altman Z-score', url: RADAR_URLS.altman, used: '以短期偿付能力和权益作为困境信号。' },
    { title: 'Ajaib：bandarmology 策略', url: RADAR_URLS.ajaib, used: '集中的净买入和跨日重复买入。' },
    { title: 'Pluang：券商与外资筛选', url: RADAR_URLS.pluang, used: '前几名券商占净成交量的比例，仅作流向历史。' },
    { title: 'LuxAlgo：累积/派发基础', url: RADAR_URLS.adl, used: '把累计资金流视为吸筹或派发。' },
    { title: '哥伦比亚商学院：盈余公告后漂移随时间的变化', url: RADAR_URLS.pead, used: '消息的影响会衰减，所以较新的事件权重更大。' },
  ],
};

const EN: ResearchContent = {
  label: 'Research method',
  title: 'A story gets our attention. Evidence earns the next look.',
  intro:
    'Other Side shows who is on the other side of a trade, from the daily broker data of four markets: Indonesia, Hong Kong, Korea and China. A broker flow alone does not explain a move, so a stock is only worth a look when three layers line up: the story, the transactions and the health of the company. No buy or sell advice.',
  framework: 'The three layers',
  frameworkLine: 'Our main signal: a stock is only worth a look when all three line up.',
  checksLabel: 'What we look for',
  whyLabel: 'Why it matters',
  unknownLabel: 'What could weaken it',
  layers: [
    {
      id: 'story',
      label: '1. Story',
      question: 'What has actually changed?',
      intro: 'News and corporate actions: a rights issue, a change of control, a new asset, a financing deal. We start from the filing, not from the excitement around it.',
      checks: [
        'A named event with a source and a publication date.',
        'A clear link to the business, ownership or financing.',
        'What is completed, what is only proposed, and what still depends on another step.',
      ],
      why: 'The event is the starting point. We read activity before and after the information became public, not around a date picked after the price moved.',
      unknown: 'A headline without a filing, an unknown date, or a proposed deal described as done.',
    },
    {
      id: 'flow',
      label: '2. Transaction analysis',
      question: 'Who is actually accumulating?',
      intro: 'Net lots per broker group, the top 5 net buyers and sellers, the daily session comparison, cumulative flows, and the daily flow of up to 3 brokers you choose.',
      checks: [
        'Net lots by group: Retail app brokers, Institutional brokers, Other / mixed brokers and Unclassified.',
        'Whether the same side keeps buying or selling over several sessions, not on one day.',
        'Whether the cumulative flow and the daily bars tell the same story.',
      ],
      why: 'A story that is real should leave a trace in who buys and sells. If the visible flow points the other way, the story needs more proof.',
      unknown: 'Each market shows only its biggest brokers per day; the rest goes to Unclassified. A broker outside the list is unknown, not zero. Other / mixed is a team mapping, not proof of who the client is.',
    },
    {
      id: 'health',
      label: '3. Company health',
      question: 'Can the company carry the story?',
      intro: 'Read from filed financial statements, shown as headline figures together with news published after the report.',
      checks: [
        'Equity positive, or turning positive.',
        'Bank loans and related-party borrowings rising or falling.',
        'Profit without one-off gains.',
        'Cash from operations.',
        'Short-term cover: current assets divided by current liabilities.',
      ],
      why: 'A flow into a weak balance sheet is a different case from a flow into a sound one. Profit that comes from a one-off gain says little about the business itself.',
      unknown: 'Reports are filed late and cover a past period. News after the report can change the picture, so it is shown beside the figures.',
    },
  ],
  scopeTitle: 'How to read the result',
  scope: 'When the layers agree, the stock is worth reading further. When they disagree, that is the finding. Either way, the page describes what was observed and what could be interpreted. It does not say what to do.',
  dataTitle: 'Data and limits',
  data: [
    { title: 'SINI is the one real case', body: 'PT Singaraja Putra on the Indonesia Stock Exchange. Broker flow comes from Stockbit broker summary screenshots for 14 Aug to 23 Sep 2026 (8 Sep missing). Prices are Yahoo Finance adjusted closes. Company health uses the filed Q1 and Q2 2026 statements.' },
    { title: '11 sample stocks on four markets', body: 'SMPA to SMPE (Indonesia), SHKA and SHKB (Hong Kong), SKRA and SKRB (Korea), SCNA (Shanghai) and SCNB (Shenzhen) are fictional. Their flows, prices, reports and news are generated to follow SINI-like patterns and are always labelled as samples.' },
    { title: 'Replay without hindsight', body: 'On every market, a trading day\'s broker data counts as public only from the next day. Reports and news count from their publication date. Pick a past date and nothing after it is visible on the Brief, the analysis page or the Live Radar.' },
    { title: 'Visible brokers only', body: 'Each market publishes only its biggest brokers per day: the top 9 buyers and sellers in Indonesia, 6 in Hong Kong and 5 in Korea. China\'s Dragon Tiger List shows the top 5 only on big-move days, so other days have no data. Lots outside the list go to Unclassified, so the groups still add up. Unknown is not zero.' },
  ],
  aiTitle: 'What the AI does and does not do',
  ai: [
    { title: 'Numbers come from code', body: 'Every number is computed by code from the data rows. No model writes or estimates a number.' },
    { title: 'One validator checks every claim', body: 'A claim is shown only if it passes a single rule check against the data and the replay date.' },
    { title: 'Qwen writes the interpretation only', body: 'Qwen, from Alibaba Cloud, writes the reading from approved facts only. It never invents numbers and never gives advice.' },
  ],
  source: 'Source',
  proposal: 'Download the proposal',
  stocks: 'Open the Live Radar',
  radar: RADAR_EN,
};

const ID: ResearchContent = {
  label: 'Metode riset',
  title: 'Cerita menarik perhatian. Bukti menentukan langkah berikutnya.',
  intro:
    'Other Side menunjukkan siapa yang berada di sisi lain sebuah transaksi, dari data broker harian empat pasar: Indonesia, Hong Kong, Korea, dan Tiongkok. Arus broker saja tidak menjelaskan pergerakan harga, jadi sebuah saham baru layak dilihat jika tiga lapisan sejalan: cerita, transaksi, dan kesehatan perusahaan. Tanpa saran beli atau jual.',
  framework: 'Tiga lapisan',
  frameworkLine: 'Sinyal utama kami: saham baru layak dilihat jika ketiganya sejalan.',
  checksLabel: 'Yang kita cari',
  whyLabel: 'Mengapa penting',
  unknownLabel: 'Yang dapat melemahkannya',
  layers: [
    {
      id: 'story',
      label: '1. Cerita',
      question: 'Apa yang sebenarnya berubah?',
      intro: 'Berita dan aksi korporasi: rights issue, pergantian pengendali, aset baru, pendanaan. Kita mulai dari dokumen resmi, bukan dari antusiasme di sekitarnya.',
      checks: [
        'Peristiwa bernama dengan sumber dan tanggal publikasi.',
        'Kaitan yang jelas dengan bisnis, kepemilikan, atau pendanaan.',
        'Mana yang sudah selesai, mana yang baru usulan, dan mana yang masih bergantung pada langkah lain.',
      ],
      why: 'Peristiwa adalah titik awal. Kita membaca aktivitas sebelum dan sesudah informasi terbuka, bukan di sekitar tanggal yang dipilih setelah harga bergerak.',
      unknown: 'Berita tanpa dokumen resmi, tanggal yang tidak diketahui, atau usulan transaksi yang ditulis seolah sudah selesai.',
    },
    {
      id: 'flow',
      label: '2. Analisis transaksi',
      question: 'Siapa yang benar-benar mengakumulasi?',
      intro: 'Lot bersih per kelompok broker, 5 pembeli dan penjual bersih teratas, perbandingan sesi harian, arus kumulatif, dan arus harian hingga 3 broker pilihan Anda.',
      checks: [
        'Lot bersih per kelompok: Broker aplikasi ritel, Broker institusional, Broker lain / campuran, dan Tidak terklasifikasi.',
        'Apakah pihak yang sama terus membeli atau menjual selama beberapa sesi, bukan hanya satu hari.',
        'Apakah arus kumulatif dan batang harian menceritakan hal yang sama.',
      ],
      why: 'Cerita yang nyata seharusnya meninggalkan jejak pada siapa yang membeli dan menjual. Jika arus yang terlihat berlawanan, cerita itu perlu bukti tambahan.',
      unknown: 'Tiap pasar hanya memuat broker terbesarnya per hari; sisanya masuk ke Tidak diketahui. Broker di luar daftar tidak diketahui, bukan nol. Broker lain / campuran adalah pemetaan tim, bukan bukti identitas klien.',
    },
    {
      id: 'health',
      label: '3. Kesehatan perusahaan',
      question: 'Apakah perusahaan sanggup menopang ceritanya?',
      intro: 'Dibaca dari laporan keuangan yang sudah disampaikan, ditampilkan sebagai angka utama bersama berita yang terbit setelah laporan.',
      checks: [
        'Ekuitas positif, atau sedang menuju positif.',
        'Utang bank dan utang ke pihak berelasi naik atau turun.',
        'Laba tanpa keuntungan non-berulang.',
        'Kas dari operasi.',
        'Cakupan jangka pendek: aset lancar dibagi liabilitas jangka pendek.',
      ],
      why: 'Arus dana ke neraca yang lemah adalah kasus yang berbeda dari arus ke neraca yang sehat. Laba dari keuntungan non-berulang tidak banyak bicara tentang bisnisnya.',
      unknown: 'Laporan terbit terlambat dan mencakup periode lalu. Berita setelah laporan bisa mengubah gambaran, jadi ditampilkan di samping angkanya.',
    },
  ],
  scopeTitle: 'Cara membaca hasilnya',
  scope: 'Jika ketiga lapisan sejalan, saham itu layak dibaca lebih jauh. Jika berbeda, perbedaan itu sendiri adalah temuannya. Dalam kedua kasus, halaman hanya menjelaskan apa yang teramati dan apa yang bisa ditafsirkan. Halaman tidak menyuruh Anda berbuat apa-apa.',
  dataTitle: 'Data dan batasannya',
  data: [
    { title: 'SINI adalah satu-satunya kasus nyata', body: 'PT Singaraja Putra di Bursa Efek Indonesia. Arus broker berasal dari tangkapan layar ringkasan broker Stockbit untuk 14 Agu sampai 23 Sep 2026 (8 Sep tidak ada). Harga memakai harga penutupan yang disesuaikan dari Yahoo Finance. Kesehatan perusahaan memakai laporan Q1 dan Q2 2026 yang sudah disampaikan.' },
    { title: '11 saham sampel di empat pasar', body: 'SMPA sampai SMPE (Indonesia), SHKA dan SHKB (Hong Kong), SKRA dan SKRB (Korea), SCNA (Shanghai) dan SCNB (Shenzhen) adalah fiktif. Arus, harga, laporan, dan beritanya dibuat mengikuti pola mirip SINI dan selalu diberi label sampel.' },
    { title: 'Replay tanpa melihat ke depan', body: 'Di setiap pasar, data broker suatu hari perdagangan baru dianggap publik mulai hari berikutnya. Laporan dan berita dihitung sejak tanggal terbitnya. Pilih tanggal lampau dan tidak ada data sesudahnya yang terlihat di Brief, halaman analisis, maupun Radar Langsung.' },
    { title: 'Hanya broker yang terlihat', body: 'Tiap pasar hanya memuat broker terbesarnya per hari: 9 pembeli dan penjual teratas di Indonesia, 6 di Hong Kong, dan 5 di Korea. Dragon Tiger List di Tiongkok hanya memuat 5 teratas pada hari dengan pergerakan besar, jadi hari lain tidak punya data. Lot di luar daftar masuk ke Tidak diketahui agar jumlah kelompok tetap seimbang. Tidak diketahui bukan berarti nol.' },
  ],
  aiTitle: 'Yang dilakukan dan tidak dilakukan AI',
  ai: [
    { title: 'Angka berasal dari kode', body: 'Setiap angka dihitung oleh kode dari baris data. Tidak ada model yang menulis atau memperkirakan angka.' },
    { title: 'Satu validator memeriksa setiap klaim', body: 'Klaim hanya tampil jika lolos satu pemeriksaan aturan terhadap data dan tanggal replay.' },
    { title: 'Qwen hanya menulis tafsiran', body: 'Qwen dari Alibaba Cloud menulis bacaan hanya dari fakta yang sudah disetujui. Qwen tidak pernah mengarang angka dan tidak memberi saran.' },
  ],
  source: 'Sumber',
  proposal: 'Unduh proposal',
  stocks: 'Buka Radar Langsung',
  radar: RADAR_ID,
};

const ZH: ResearchContent = {
  label: '研究方法',
  title: '故事吸引注意，证据决定是否值得再看。',
  intro:
    'Other Side 利用四个市场（印尼、香港、韩国和中国）的每日券商数据，显示一笔交易的另一边是谁。仅凭券商资金流无法解释股价变动，所以只有当三个层面相互吻合时，一只股票才值得关注：故事、交易和公司健康状况。不提供买卖建议。',
  framework: '三个层面',
  frameworkLine: '我们的核心信号：只有三者同时吻合，股票才值得关注。',
  checksLabel: '我们检查什么',
  whyLabel: '为什么重要',
  unknownLabel: '什么会削弱它',
  layers: [
    {
      id: 'story',
      label: '1. 故事',
      question: '到底发生了什么变化？',
      intro: '新闻和公司行动：配股、控制权变更、新资产、融资。我们从正式文件出发，而不是从围绕它的热度出发。',
      checks: [
        '有名称、来源和发布日期的事件。',
        '与业务、股权或融资之间有明确联系。',
        '哪些已完成，哪些只是提议，哪些仍取决于下一步。',
      ],
      why: '事件是起点。我们比较信息公开前后的交易活动，而不是在股价变动之后挑选一个方便的日期。',
      unknown: '没有正式文件的标题、发布日期不明，或把仅是提议的交易写成已完成。',
    },
    {
      id: 'flow',
      label: '2. 交易分析',
      question: '到底是谁在吸筹？',
      intro: '各券商分组的净手数、前 5 大净买入方和净卖出方、各时段对比、累计资金流，以及您选定的最多 3 家券商的每日资金流。',
      checks: [
        '按分组的净手数：零售App券商、机构券商、其他/混合券商和未分类。',
        '同一方是否连续多个时段持续买入或卖出，而不是只有一天。',
        '累计资金流和每日柱状图是否讲述同一个故事。',
      ],
      why: '真实的故事应当在买卖双方留下痕迹。如果可见的资金流与之相反，这个故事就需要更多证据。',
      unknown: '每个市场每天只公布最大的几家券商，其余归入"未知"。名单之外的券商为未知，而不是零。其他/混合是团队的归类，不能证明客户身份。',
    },
    {
      id: 'health',
      label: '3. 公司健康状况',
      question: '公司撑得起这个故事吗？',
      intro: '根据已提交的财务报表，以关键数字呈现，并附上报告发布之后的新闻。',
      checks: [
        '权益为正，或正在转正。',
        '银行贷款和关联方借款是上升还是下降。',
        '扣除一次性收益后的利润。',
        '经营现金流。',
        '短期偿付能力：流动资产除以流动负债。',
      ],
      why: '资金流入资产负债表薄弱的公司，与流入稳健的公司，是两种不同的情况。来自一次性收益的利润，对业务本身说明不了多少。',
      unknown: '报告提交较晚，且只覆盖过去的期间。报告之后的新闻可能改变整体图景，所以放在数字旁边一并显示。',
    },
  ],
  scopeTitle: '如何解读结果',
  scope: '三个层面一致时，这只股票值得继续阅读。不一致时，这种不一致本身就是发现。无论哪种情况，页面只描述观察到了什么，以及可以如何解读，不会告诉您该怎么做。',
  dataTitle: '数据与局限',
  data: [
    { title: 'SINI 是唯一的真实案例', body: 'PT Singaraja Putra，在印度尼西亚证券交易所上市。券商资金流来自 2026 年 8 月 14 日至 9 月 23 日的 Stockbit 券商汇总截图（缺 9 月 8 日）。价格为 Yahoo Finance 复权收盘价。公司健康使用已提交的 2026 年第一季度和第二季度报表。' },
    { title: '四个市场的 11 只示例股票', body: 'SMPA 至 SMPE（印尼）、SHKA 和 SHKB（香港）、SKRA 和 SKRB（韩国）、SCNA（上海）和 SCNB（深圳）均为虚构。它们的资金流、价格、报告和新闻按与 SINI 类似的模式生成，并始终标注为示例。' },
    { title: '回看时不带后见之明', body: '在每个市场，一个交易日的券商数据从次日起才算公开。报告和新闻从发布日期起计入。选择过去的某一天，简报、分析页和实时雷达都看不到之后的任何数据。' },
    { title: '只看得到公开的券商', body: '每个市场每天只公布最大的几家券商：印尼为买卖各前 9 名，香港 6 名，韩国 5 名。中国的龙虎榜只在大幅波动的日子公布前 5 名，其他日子没有数据。名单之外的手数归入"未知"，各组合计仍然平衡。未知不等于零。' },
  ],
  aiTitle: 'AI 做什么，不做什么',
  ai: [
    { title: '数字由代码计算', body: '每个数字都由代码根据数据行计算得出。没有任何模型书写或估算数字。' },
    { title: '一个校验器检查每条论断', body: '一条论断只有在通过针对数据和回放日期的同一套规则检查后才会显示。' },
    { title: 'Qwen 只写解读', body: '阿里云的 Qwen 只根据已批准的事实撰写解读。它从不编造数字，也不给建议。' },
  ],
  source: '来源',
  proposal: '下载提案',
  stocks: '打开实时雷达',
  radar: RADAR_ZH,
};

const CONTENT: Record<Locale, ResearchContent> = { en: EN, id: ID, 'zh-CN': ZH };

export function researchContent(locale: Locale): ResearchContent {
  return CONTENT[locale];
}
