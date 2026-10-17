// The research method copy, in the three supported locales.
//
// This is reviewed prose: it describes how the prototype reasons, which screen
// shows each layer, what the data can and cannot say, and what the AI does and
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
  checksLabel: string;
  whyLabel: string;
  unknownLabel: string;
  layers: ResearchLayer[];
  scopeTitle: string;
  scope: string;
  whereTitle: string;
  where: { title: string; body: string }[];
  dataTitle: string;
  data: { title: string; body: string }[];
  aiTitle: string;
  ai: { title: string; body: string }[];
  source: string;
  sourceNote: string;
  proposal: string;
  engine: string;
  stocks: string;
}

const EN: ResearchContent = {
  label: 'Research method',
  title: 'A story gets our attention. Evidence earns the next look.',
  intro:
    'Other Side shows who is on the other side of a trade, using the daily IDX broker summary. A broker flow alone does not explain why a stock moves. So we only call something worth a look when three layers line up: the story, the transactions and the health of the company. Other Side never gives buy or sell advice, targets or rankings.',
  framework: 'The three layers',
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
      unknown: 'The summary lists only the top 9 net buyers and top 9 net sellers per day. Brokers outside the list are unknown, not zero. Other / mixed is a team mapping, not proof of who the client is.',
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
  whereTitle: 'Where each layer shows on the Analysis page',
  where: [
    { title: 'Story: Events in the past 30 days', body: 'Dated news and corporate actions for the stock. Pick a session in the calendar at the top and only events published up to then are shown.' },
    { title: 'Transaction analysis: the broker cards', body: 'The Broker net flow card, the Flow card (group nets and the Top 5 net buyers and sellers) and the Session broker flow chart, which switches between Sessions and Cumulative. You can add up to 3 brokers to follow their daily flow.' },
    { title: 'Transaction analysis: reading the flow', body: 'What was observed? lists plain facts that passed the rule check. What could be interpreted? holds a written reading from the language model. It is a placeholder for now.' },
    { title: 'Company health: the Company Health card', body: 'The filed figures listed above, with news published after the report.' },
    { title: 'Brief and Portfolio', body: 'The Brief gives one headline per stock in My Holdings and the Watchlist. Portfolio lets you search instruments, add lots, price and date, and compare your portfolio with a sample index.' },
  ],
  dataTitle: 'Data and limits',
  data: [
    { title: 'SINI is the one real case', body: 'PT Singaraja Putra. Broker flow comes from Stockbit broker summary screenshots for 14 Aug to 23 Sep 2026 (13 Aug excluded, 8 Sep missing). Prices are Yahoo Finance adjusted closes. Financials come from the H1 2026 statements.' },
    { title: 'What SINI shows', body: 'Equity was −Rp53.2bn at 30 Jun 2026, up from −Rp687.4bn at end-2025. Pre-tax profit of Rp631.4bn includes a one-off gain of Rp662.7bn, so it is −Rp31.3bn without it. A 31 Jul report shows equity of about +Rp3.52T after the Rp3.6T rights issue.' },
    { title: 'SMPA to SMPE are sample stocks', body: 'SMPA, SMPB, SMPC, SMPD and SMPE are fictional. They are generated to follow SINI patterns and are always labelled as sample data.' },
    { title: 'Replay without hindsight', body: 'Broker data for session D is assumed to be available at D+1 00:00 WIB. A view pinned to an earlier date cannot see later facts.' },
    { title: 'Visible brokers only', body: 'Only the top 9 buyers and top 9 sellers per day are visible. A broker that is not listed is unknown, not zero.' },
  ],
  aiTitle: 'What the AI does and does not do',
  ai: [
    { title: 'Numbers come from code', body: 'Every number is computed by code from the data rows. No model writes or estimates a number.' },
    { title: 'One validator checks every claim', body: 'A claim is shown only if it passes a single rule check against the data and the replay date.' },
    { title: 'Qwen writes the interpretation only', body: 'Qwen, from Alibaba Cloud, writes the reading from approved facts only. It never invents numbers and never gives advice.' },
  ],
  source: 'Source and engine',
  sourceNote: 'The proposal explains the full idea. The engine page shows how facts and claims are built.',
  proposal: 'Download the proposal',
  engine: 'Open the engine page',
  stocks: 'Open the stocks',
};

const ID: ResearchContent = {
  label: 'Metode riset',
  title: 'Cerita menarik perhatian. Bukti menentukan langkah berikutnya.',
  intro:
    'Other Side menunjukkan siapa yang berada di sisi lain sebuah transaksi, memakai ringkasan broker harian IDX. Arus broker saja tidak menjelaskan mengapa saham bergerak. Karena itu sebuah saham baru layak dilihat lebih jauh jika tiga lapisan sejalan: cerita, transaksi, dan kesehatan perusahaan. Other Side tidak pernah memberi saran beli atau jual, target, atau peringkat.',
  framework: 'Tiga lapisan',
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
      unknown: 'Ringkasan hanya memuat 9 pembeli bersih dan 9 penjual bersih teratas per hari. Broker di luar daftar tidak diketahui, bukan nol. Broker lain / campuran adalah pemetaan tim, bukan bukti identitas klien.',
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
  whereTitle: 'Di mana setiap lapisan muncul di halaman Analisis',
  where: [
    { title: 'Cerita: Peristiwa 30 hari terakhir', body: 'Berita dan aksi korporasi bertanggal untuk saham itu. Pilih sesi di kalender atas, dan hanya peristiwa yang terbit sampai saat itu yang tampil.' },
    { title: 'Analisis transaksi: kartu broker', body: 'Kartu Arus bersih broker, kartu Arus (total bersih per kelompok dan 5 pembeli dan penjual bersih teratas), dan grafik Arus broker per sesi yang bisa beralih antara Sesi dan Kumulatif. Anda bisa menambah hingga 3 broker untuk melihat arus hariannya.' },
    { title: 'Analisis transaksi: membaca aliran', body: 'Apa yang teramati? berisi fakta sederhana yang lolos pemeriksaan aturan. Apa yang bisa ditafsirkan? berisi bacaan tertulis dari model bahasa. Untuk saat ini masih sementara.' },
    { title: 'Kesehatan Perusahaan: kartu Kesehatan Perusahaan', body: 'Angka dari laporan yang tercantum di atas, bersama berita yang terbit setelah laporan.' },
    { title: 'Brief dan Portofolio', body: 'Brief memberi satu judul per saham di Kepemilikan Saya dan Watchlist. Portofolio memungkinkan Anda mencari instrumen, menambah lot, harga, dan tanggal, lalu membandingkan portofolio dengan indeks contoh.' },
  ],
  dataTitle: 'Data dan batasannya',
  data: [
    { title: 'SINI adalah satu-satunya kasus nyata', body: 'PT Singaraja Putra. Arus broker berasal dari tangkapan layar ringkasan broker Stockbit untuk 14 Agu sampai 23 Sep 2026 (13 Agu dikeluarkan, 8 Sep tidak terekam). Harga memakai harga penutupan terselaraskan dari Yahoo Finance. Data keuangan berasal dari laporan H1 2026.' },
    { title: 'Yang ditunjukkan SINI', body: 'Ekuitas −Rp53,2 miliar pada 30 Jun 2026, naik dari −Rp687,4 miliar pada akhir 2025. Laba sebelum pajak Rp631,4 miliar termasuk keuntungan non-berulang Rp662,7 miliar, sehingga tanpa itu menjadi −Rp31,3 miliar. Laporan 31 Jul menunjukkan ekuitas sekitar +Rp3,52 triliun setelah rights issue Rp3,6 triliun.' },
    { title: 'SMPA sampai SMPE adalah saham contoh', body: 'SMPA, SMPB, SMPC, SMPD, dan SMPE fiktif. Dibuat mengikuti pola SINI dan selalu diberi label data contoh.' },
    { title: 'Replay tanpa melihat ke depan', body: 'Data broker untuk sesi D dianggap tersedia pada D+1 pukul 00:00 WIB. Tampilan yang dikunci pada tanggal lebih awal tidak bisa melihat fakta yang datang kemudian.' },
    { title: 'Hanya broker yang terlihat', body: 'Hanya 9 pembeli dan 9 penjual teratas per hari yang terlihat. Broker yang tidak tercantum tidak diketahui, bukan nol.' },
  ],
  aiTitle: 'Yang dilakukan dan tidak dilakukan AI',
  ai: [
    { title: 'Angka berasal dari kode', body: 'Setiap angka dihitung oleh kode dari baris data. Tidak ada model yang menulis atau memperkirakan angka.' },
    { title: 'Satu validator memeriksa setiap klaim', body: 'Klaim hanya tampil jika lolos satu pemeriksaan aturan terhadap data dan tanggal replay.' },
    { title: 'Qwen hanya menulis tafsiran', body: 'Qwen dari Alibaba Cloud menulis bacaan hanya dari fakta yang sudah disetujui. Qwen tidak pernah mengarang angka dan tidak memberi saran.' },
  ],
  source: 'Sumber dan mesin',
  sourceNote: 'Proposal menjelaskan gagasan lengkapnya. Halaman mesin menunjukkan cara fakta dan klaim dibangun.',
  proposal: 'Unduh proposal',
  engine: 'Buka halaman mesin',
  stocks: 'Buka daftar saham',
};

const ZH: ResearchContent = {
  label: '研究方法',
  title: '故事吸引注意，证据决定是否值得再看。',
  intro:
    'Other Side 利用印尼交易所（IDX）每日券商汇总，显示一笔交易的另一边是谁。仅凭券商资金流向，无法解释股价为何变动。因此只有三个层面相互吻合时，我们才认为一只股票值得继续研究：故事、交易和公司健康状况。Other Side 从不给出买入或卖出建议、目标价或排名。',
  framework: '三个层面',
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
      unknown: '汇总每天只列出净买入前 9 名和净卖出前 9 名。名单之外的券商为未知，而不是零。其他/混合是团队的归类，不能证明客户身份。',
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
  whereTitle: '各层面在分析页的位置',
  where: [
    { title: '故事：过去 30 天的事件', body: '该股票带日期的新闻和公司行动。在顶部日历选择一个时段，只会显示截至当时已发布的事件。' },
    { title: '交易分析：券商卡片', body: '券商净流入卡片、资金流卡片（各分组净额以及前 5 大净买入方和净卖出方），以及可在“时段”和“累计”之间切换的时段券商资金流图。您最多可添加 3 家券商查看其每日资金流。' },
    { title: '交易分析：解读流向', body: '“观察到了什么？”列出通过规则检查的简单事实。“可以如何解读？”是语言模型撰写的解读，目前仍是占位内容。' },
    { title: '公司健康状况：公司健康状况卡片', body: '上文列出的财报数字，以及报告之后发布的新闻。' },
    { title: '简报和投资组合', body: '简报为“我的持仓”和自选列表中的每只股票给出一条标题。投资组合可搜索标的，添加手数、价格和日期，并与示例指数对比。' },
  ],
  dataTitle: '数据与局限',
  data: [
    { title: 'SINI 是唯一的真实案例', body: 'PT Singaraja Putra。券商流向来自 Stockbit 券商汇总截图，时间为 2026 年 8 月 14 日至 9 月 23 日（不含 8 月 13 日，缺少 9 月 8 日）。价格为 Yahoo Finance 的复权收盘价。财务数据来自 2026 年上半年报表。' },
    { title: 'SINI 显示了什么', body: '2026 年 6 月 30 日权益为 −532 亿印尼盾，2025 年底为 −6,874 亿印尼盾。税前利润 6,314 亿印尼盾包含 6,627 亿印尼盾的一次性收益，剔除后为 −313 亿印尼盾。7 月 31 日的报告显示，在 3.6 万亿印尼盾配股之后，权益约为 +3.52 万亿印尼盾。' },
    { title: 'SMPA 至 SMPE 是示例股票', body: 'SMPA、SMPB、SMPC、SMPD 和 SMPE 是虚构的。它们按 SINI 的模式生成，并始终标注为示例数据。' },
    { title: '不带事后视角的回放', body: '交易日 D 的券商数据假定在 D+1 日 00:00 WIB才可用。固定在较早日期的视图看不到之后的事实。' },
    { title: '只有可见的券商', body: '每天只能看到前 9 名买方和前 9 名卖方。未列出的券商是未知，而不是零。' },
  ],
  aiTitle: 'AI 做什么，不做什么',
  ai: [
    { title: '数字由代码计算', body: '每个数字都由代码根据数据行计算得出。没有任何模型书写或估算数字。' },
    { title: '一个校验器检查每条论断', body: '一条论断只有在通过针对数据和回放日期的同一套规则检查后才会显示。' },
    { title: 'Qwen 只写解读', body: '阿里云的 Qwen 只根据已批准的事实撰写解读。它从不编造数字，也不给建议。' },
  ],
  source: '来源与引擎',
  sourceNote: '提案说明完整的想法。引擎页面展示事实和论断是如何生成的。',
  proposal: '下载提案',
  engine: '打开引擎页面',
  stocks: '打开股票列表',
};

const CONTENT: Record<Locale, ResearchContent> = { en: EN, id: ID, 'zh-CN': ZH };

export function researchContent(locale: Locale): ResearchContent {
  return CONTENT[locale];
}
