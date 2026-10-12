// The research method copy, in the three supported locales.
//
// This is reviewed prose rather than templated claims: it describes how the
// prototype reasons and what each layer can and cannot establish. It never states
// a market conclusion, a ranking or a trade. The worked example beside it is not
// prose: it renders the real SINI C12 and C13 checks through the same facts,
// claims and evidence drawer as every other screen, so changing the date changes
// the replay context and the numbers with it.

import type { Locale } from '../engine/context';

export type ResearchLayerId = 'story' | 'health' | 'flow';

export interface ResearchLayer {
  id: ResearchLayerId;
  label: string;
  question: string;
  // Implemented or proposed, stated plainly so the screen never implies more is
  // built than is.
  status: string;
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
  journeyTitle: string;
  journey: { title: string; body: string }[];
  exampleTitle: string;
  exampleIntro: string;
  date: string;
  positive: string;
  largest: string;
  passes: string;
  fails: string;
  missing: string;
  exampleNote: string;
  evidence: string;
  trustTitle: string;
  trust: { title: string; body: string }[];
  detailed: string;
  source: string;
  sourceNote: string;
  proposal: string;
  engine: string;
  replay: string;
}

const EN: ResearchContent = {
  label: 'Research method',
  title: 'A story gets our attention. Evidence earns the next look.',
  intro: 'We start with a change at a company. Then we ask whether its business and the visible transactions support the same explanation. One interesting signal is a reason to investigate, not a conclusion.',
  framework: 'Explore the three layers',
  checksLabel: 'What we look for',
  whyLabel: 'Why it matters',
  unknownLabel: 'What could weaken the story',
  layers: [
    {
      id: 'story',
      label: 'The story',
      question: 'What has actually changed?',
      status: 'Dated event replay available',
      intro: 'A new asset, a change of control or a financing event can change what a company may become. Start with the filing, not the excitement around it.',
      checks: ['A named event with a traceable source and publication date.', 'A clear link to the business, ownership structure or financing.', 'What is completed, what is proposed, and what still depends on another step.'],
      why: 'The event gives us a starting point. We compare activity before and after the information became public, rather than picking a convenient date after seeing the price move.',
      unknown: 'A headline without a filing, an unknown publication date, or a proposed deal described as completed.',
    },
    {
      id: 'health',
      label: 'Company health',
      question: 'Can the business support the story?',
      status: 'Research checklist; financial inputs required',
      intro: 'A strong story still needs a business that can support it. Read the dated accounts to understand whether the change improves the company or only changes the headline.',
      checks: ['Whether sales, earnings and operating cash flow support each other.', 'How debt, cash, equity and funding needs change after the event.', 'Dilution, asset quality and obligations that could limit the benefit.'],
      why: 'These questions help distinguish a business improvement from a story that depends on repeated funding. The proposal sets a direction, not fixed numerical pass thresholds.',
      unknown: 'Outdated accounts, profits without cash support, unclear funding, or missing information. The prototype does not automatically pass a company-health test.',
    },
    {
      id: 'flow',
      label: 'Transaction analysis',
      question: 'Does the visible broker flow support it?',
      status: 'Broker checks available',
      intro: 'Look for a pattern across market sessions, then test whether it survives a closer look. A large net buy on one day means less than a pattern supported by repeated observations.',
      checks: ['Separate steady positive net flow from being the largest net-buyer group.', 'Compare the latest captured sessions and investigate direction reversals.', 'Check concentration and whether the interpretation changes when a broker label is uncertain.'],
      why: 'Transactions can support or challenge the story. They cannot identify a broker’s clients, prove their holdings, or show that the same people bought and sold.',
      unknown: 'A missing required session, brokers outside the visible sample, a label-dependent result, or a reversal treated as a proven same-client round trip.',
    },
  ],
  scopeTitle: 'A research framework, with explicit limits',
  scope: 'The current prototype replays reviewed broker rows and dated events. Company-health screening and a market-wide nightly scan remain proposed work. A passing broker check does not mean the stock passes the whole framework.',
  journeyTitle: 'From a company change to a readable explanation',
  journey: [
    { title: 'Notice the change', body: 'What event deserves a closer look?' },
    { title: 'Read the source', body: 'When did the information become public?' },
    { title: 'Check the business', body: 'Can the accounts support the story?' },
    { title: 'Test the flows', body: 'Do repeated observations agree?' },
    { title: 'Explain the evidence', body: 'State what is supported and what remains unknown.' },
  ],
  exampleTitle: 'Similar words can need different evidence',
  exampleIntro: 'Try the historical SINI example. Positive net flow and being the largest buyer are separate tests. Change the date to see how the available evidence changes.',
  date: 'Broker session',
  positive: 'Steady positive net flow',
  largest: 'Largest net-buyer group',
  passes: 'Supported',
  fails: 'Not supported',
  missing: 'Not enough data',
  exampleNote: 'Each result supports only its named statement. Neither is a stock rating or a trading instruction.',
  evidence: 'Open evidence',
  trustTitle: 'How we keep the explanation honest',
  trust: [
    {
      title: 'A gap stays a gap',
      body: 'Missing sessions and brokers outside the captured top-nine-per-side sample are unknown. We do not fill them with zero.',
    },
    {
      title: 'Only information available then',
      body: 'The replay assumes a session’s broker data becomes available at midnight WIB the following day. Events use publication dates, not effective dates.',
    },
    {
      title: 'Names do not identify investors',
      body: 'Institution-facing and app-facing are team broker classifications. They do not establish customer identity, ownership or a matched counterparty.',
    },
    {
      title: 'A price reference has a limited meaning',
      body: 'The broker reference divides visible net-buy value by the shares represented by those lots. It is not an official close, a client cost basis or a measure of profit.',
    },
    {
      title: 'The model chooses; code checks',
      body: 'Qwen can choose approved claims and allowed wording. Code validates the claims, context, dependencies and caveats before the answer appears.',
    },
  ],
  detailed: 'Data and claim rules',
  source: 'Where this method comes from',
  sourceNote: 'The supplied Round 1 proposal provides the story, company-health and transaction framework. The current project rules and engine define the narrower checks implemented here. The archived proposal contains broader wording and older case figures; current reviewed facts govern this demo.',
  proposal: 'Download Round 1 proposal',
  engine: 'Open how it works',
  replay: 'Open SINI replay',
};

const ID: ResearchContent = {
  label: 'Metode riset',
  title: 'Cerita menarik perhatian. Bukti menentukan langkah berikutnya.',
  intro: 'Kita mulai dari perubahan di perusahaan. Lalu kita periksa apakah bisnis dan transaksi yang terlihat mendukung penjelasan yang sama. Satu sinyal menarik adalah alasan untuk menyelidiki, bukan kesimpulan.',
  framework: 'Jelajahi tiga lapisan',
  checksLabel: 'Yang kita cari',
  whyLabel: 'Mengapa penting',
  unknownLabel: 'Yang dapat melemahkan cerita',
  layers: [
    {
      id: 'story',
      label: 'Cerita',
      question: 'Apa yang benar-benar berubah?',
      status: 'Replay peristiwa bertanggal tersedia',
      intro: 'Aset baru, perubahan kendali, atau pendanaan dapat mengubah arah perusahaan. Mulai dari keterbukaan informasi, bukan antusiasme di sekitarnya.',
      checks: ['Peristiwa jelas dengan sumber dan tanggal publikasi yang dapat ditelusuri.', 'Hubungan dengan bisnis, struktur kepemilikan, atau pendanaan.', 'Mana yang selesai, masih diusulkan, dan bergantung pada langkah berikutnya.'],
      why: 'Peristiwa memberi titik awal. Kita membandingkan aktivitas sebelum dan sesudah informasi dipublikasikan, bukan memilih tanggal setelah melihat harga bergerak.',
      unknown: 'Judul tanpa dokumen, tanggal publikasi tidak diketahui, atau rencana transaksi yang dianggap sudah selesai.',
    },
    {
      id: 'health',
      label: 'Kesehatan bisnis',
      question: 'Apakah bisnis mendukung ceritanya?',
      status: 'Daftar pertanyaan riset; perlu data keuangan',
      intro: 'Cerita yang kuat tetap membutuhkan bisnis yang mendukungnya. Baca laporan bertanggal untuk memahami apakah perubahan memperbaiki perusahaan atau hanya mengubah judul berita.',
      checks: ['Apakah penjualan, laba, dan arus kas operasi saling mendukung.', 'Perubahan utang, kas, ekuitas, dan kebutuhan dana setelah peristiwa.', 'Dilusi, kualitas aset, dan kewajiban yang dapat membatasi manfaat.'],
      why: 'Pertanyaan ini membedakan perbaikan bisnis dari cerita yang bergantung pada pendanaan berulang. Proposal memberikan arah, bukan ambang angka kelulusan tetap.',
      unknown: 'Laporan lama, laba tanpa dukungan kas, pendanaan tidak jelas, atau informasi hilang. Prototipe belum otomatis meluluskan pemeriksaan kesehatan bisnis.',
    },
    {
      id: 'flow',
      label: 'Analisis transaksi',
      question: 'Apakah arus broker yang terlihat mendukungnya?',
      status: 'Pemeriksaan broker tersedia',
      intro: 'Cari pola lintas sesi pasar, lalu uji apakah pola itu bertahan saat diperiksa. Pembelian bersih besar pada satu hari berbeda dari pola yang didukung pengamatan berulang.',
      checks: ['Bedakan arus bersih positif yang konsisten dari grup pembeli bersih terbesar.', 'Bandingkan sesi tertangkap terbaru dan periksa pembalikan arah.', 'Periksa konsentrasi serta dampak klasifikasi broker yang belum pasti.'],
      why: 'Transaksi dapat mendukung atau menantang cerita. Data ini tidak mengidentifikasi nasabah broker, membuktikan kepemilikan, atau menunjukkan bahwa orang yang sama membeli dan menjual.',
      unknown: 'Sesi wajib yang hilang, broker di luar sampel, hasil yang bergantung pada klasifikasi, atau pembalikan yang dianggap transaksi bolak-balik nasabah yang sama.',
    },
  ],
  scopeTitle: 'Kerangka riset dengan batas yang jelas',
  scope: 'Prototipe saat ini menampilkan ulang data broker yang ditinjau dan peristiwa bertanggal. Penyaringan kesehatan bisnis serta pemindaian seluruh pasar setiap malam masih merupakan rancangan. Lolos pemeriksaan broker tidak berarti saham lolos seluruh kerangka.',
  journeyTitle: 'Dari perubahan perusahaan ke penjelasan yang mudah dibaca',
  journey: [
    { title: 'Temukan perubahan', body: 'Peristiwa apa yang perlu diperiksa?' },
    { title: 'Baca sumbernya', body: 'Kapan informasi menjadi publik?' },
    { title: 'Periksa bisnis', body: 'Apakah laporan mendukung cerita?' },
    { title: 'Uji arus transaksi', body: 'Apakah pengamatan berulang sejalan?' },
    { title: 'Jelaskan buktinya', body: 'Nyatakan yang didukung dan yang belum diketahui.' },
  ],
  exampleTitle: 'Kata yang mirip membutuhkan bukti berbeda',
  exampleIntro: 'Coba contoh historis SINI. Arus bersih positif dan menjadi pembeli terbesar adalah dua pemeriksaan terpisah. Ganti tanggal untuk melihat perubahan bukti yang tersedia.',
  date: 'Sesi broker',
  positive: 'Arus bersih positif konsisten',
  largest: 'Grup pembeli bersih terbesar',
  passes: 'Didukung',
  fails: 'Tidak didukung',
  missing: 'Data belum cukup',
  exampleNote: 'Hasil hanya mendukung pernyataan yang disebut. Bukan peringkat saham atau instruksi perdagangan.',
  evidence: 'Buka bukti',
  trustTitle: 'Cara menjaga penjelasan tetap jujur',
  trust: [
    {
      title: 'Data hilang tetap hilang',
      body: 'Sesi hilang dan broker di luar sampel sembilan teratas per sisi tidak diketahui. Kita tidak mengisinya dengan nol.',
    },
    {
      title: 'Hanya informasi yang tersedia saat itu',
      body: 'Replay mengasumsikan data broker tersedia pada tengah malam WIB hari berikutnya. Peristiwa memakai tanggal publikasi, bukan tanggal efektif.',
    },
    {
      title: 'Nama tidak mengidentifikasi investor',
      body: 'Institution-facing dan app-facing adalah klasifikasi broker oleh tim. Tidak menetapkan identitas nasabah, kepemilikan, atau lawan transaksi tertentu.',
    },
    {
      title: 'Referensi harga memiliki batas',
      body: 'Referensi broker membagi nilai beli bersih terlihat dengan jumlah saham yang diwakili lot tersebut. Bukan harga penutupan resmi, biaya nasabah, atau ukuran keuntungan.',
    },
    {
      title: 'Model memilih; kode memeriksa',
      body: 'Qwen memilih klaim yang disetujui dan variasi kalimat yang diizinkan. Kode memvalidasi klaim, konteks, ketergantungan, dan batas interpretasi sebelum jawaban muncul.',
    },
  ],
  detailed: 'Aturan data dan klaim',
  source: 'Sumber metode ini',
  sourceNote: 'Proposal Ronde 1 yang diberikan menyediakan kerangka cerita, kesehatan bisnis, dan transaksi. Aturan proyek serta engine saat ini menentukan pemeriksaan yang lebih terbatas. Proposal arsip memakai bahasa lebih luas dan angka kasus lama; demo mengikuti fakta terkini yang ditinjau.',
  proposal: 'Unduh proposal Ronde 1',
  engine: 'Buka cara kerja',
  replay: 'Buka replay SINI',
};

const ZH: ResearchContent = {
  label: '研究方法',
  title: '故事吸引关注，证据决定下一步。',
  intro: '从公司的变化开始，再核对业务和可见交易是否支持同一种解释。一个有趣信号是继续研究的理由，而不是结论。',
  framework: '探索三个层面',
  checksLabel: '我们关注什么',
  whyLabel: '为什么重要',
  unknownLabel: '什么会削弱这个故事',
  layers: [
    {
      id: 'story',
      label: '公司故事',
      question: '究竟发生了什么变化？',
      status: '可回放带日期的事件',
      intro: '新资产、控制权变化或融资可能改变公司的方向。先看披露文件，再看市场热度。',
      checks: ['明确事件、可追溯来源及发布日期。', '与业务、所有权结构或融资的直接联系。', '区分已完成、拟议及仍依赖后续步骤的事项。'],
      why: '事件为观察提供起点。比较信息公开前后的活动，而不是看到价格走势后再挑选方便的日期。',
      unknown: '没有文件支持的标题、未知发布日期，或把拟议交易说成已经完成。',
    },
    {
      id: 'health',
      label: '企业健康',
      question: '业务能支撑这个故事吗？',
      status: '研究清单；需要财务输入',
      intro: '有吸引力的故事也需要业务支持。阅读带日期的财务报告，判断变化是在改善企业，还是仅仅改变新闻标题。',
      checks: ['销售、利润和经营现金流是否互相支持。', '事件后债务、现金、权益及资金需求如何变化。', '稀释、资产质量及可能限制收益的义务。'],
      why: '这些问题有助于区分业务改善与依赖反复融资的故事。提案提供研究方向，并没有固定数值的通过门槛。',
      unknown: '过时报告、缺乏现金支持的利润、融资不明或信息缺失。原型尚未自动运行企业健康筛选。',
    },
    {
      id: 'flow',
      label: '交易分析',
      question: '可见券商资金流支持它吗？',
      status: '券商检查可用',
      intro: '观察多个交易日的模式，再检查它是否经得起细看。单日的大额净买入不同于反复观察支持的趋势。',
      checks: ['区分持续正净流与最大净买入分组。', '比较最近已采集的交易日，检查方向反转。', '检查集中度及不确定的券商分类是否改变解释。'],
      why: '交易可以支持或挑战故事，但不能识别券商客户、证明持仓，或证明买卖双方是同一批人。',
      unknown: '必需交易日缺失、样本外券商、依赖分类的结果，或把方向反转当作同一客户的往返交易。',
    },
  ],
  scopeTitle: '有明确边界的研究框架',
  scope: '当前原型回放已审阅的券商数据和带日期的事件。企业健康筛选与全市场夜间扫描仍属于拟议功能。通过券商检查不代表股票通过整个框架。',
  journeyTitle: '从公司变化到易读解释',
  journey: [
    { title: '发现变化', body: '什么事件值得进一步查看？' },
    { title: '阅读来源', body: '信息何时公开？' },
    { title: '检查业务', body: '报表能支持故事吗？' },
    { title: '检验交易流', body: '重复观察是否一致？' },
    { title: '解释证据', body: '说明哪些得到支持，哪些仍未知。' },
  ],
  exampleTitle: '相似的说法需要不同证据',
  exampleIntro: '试用SINI历史案例。正净流和最大买入方是不同的检查。切换日期，查看当时可用的证据如何变化。',
  date: '券商交易日',
  positive: '持续正净流',
  largest: '最大净买入分组',
  passes: '有支持',
  fails: '无支持',
  missing: '数据不足',
  exampleNote: '结果只支持所标明的说法，不是股票评级或交易指令。',
  evidence: '打开证据',
  trustTitle: '如何保持解释诚实',
  trust: [
    {
      title: '缺失仍是缺失',
      body: '缺失交易日及每侧前九大样本之外的券商未知，不用零填补。',
    },
    {
      title: '只用当时可得信息',
      body: '回放假设券商数据于次日WIB午夜可用。事件按发布日期而非生效日期处理。',
    },
    {
      title: '名称不识别投资者',
      body: '面向机构和面向应用是团队的券商分类，不代表客户身份、持仓或确切交易对手。',
    },
    {
      title: '价格参考有边界',
      body: '券商参考将可见净买入金额除以相关手数代表的股数，不是官方收盘价、客户成本或利润。',
    },
    {
      title: '模型选择，代码核验',
      body: 'Qwen只能选择已批准的说法及措辞。代码在显示前核验说法、上下文、依赖和限制条件。',
    },
  ],
  detailed: '数据与说法规则',
  source: '方法来源',
  sourceNote: '提供的第一轮提案给出故事、企业健康和交易框架。当前项目规则与引擎定义本原型实际执行的更有限检查。存档提案含较宽泛措辞和旧案例数字；本演示以当前已审阅事实为准。',
  proposal: '下载第一轮提案',
  engine: '打开工作原理',
  replay: '打开SINI回放',
};

export function researchContent(locale: Locale): ResearchContent {
  return locale === 'id' ? ID : locale === 'zh-CN' ? ZH : EN;
}
