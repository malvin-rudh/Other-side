// Guided tour copy: the intro, the list of what the tour covers, and the text
// of each coach step, in the three supported locales. The step order matches
// STEPS in components/DemoCoach.tsx.

import type { Locale } from '../engine/context';

export interface TourStepCopy {
  title: string;
  body: string;
}

export interface TourCopy {
  label: string;
  title: string;
  intro: string;
  hint: string;
  coversTitle: string;
  start: string;
  restart: string;
  running: string;
  steps: TourStepCopy[];
}

const en: TourCopy = {
  label: 'Guided tour',
  title: 'See how Other Side works in six steps',
  intro:
    'The tour opens real screens one at a time, with a short note on what to look at.',
  hint: 'Use Back and Next on the panel. Press Hide or Esc to stop.',
  coversTitle: 'What the tour covers',
  start: 'Start tour',
  restart: 'Restart tour',
  running: 'Tour is running',
  steps: [
    {
      title: 'Your morning brief',
      body: 'The Brief opens with your portfolio value. Pick a day in the week strip, and My Holdings and Watchlist give one line per stock for that day. Click a stock to open its analysis.',
    },
    {
      title: 'The analysis page',
      body: 'The top card shows the close, a short summary, and buttons to add the stock to your Watchlist or Portfolio. The calendar sets the date, and nothing after it is visible. Back returns you to where you came from.',
    },
    {
      title: 'Who is trading',
      body: 'Broker net flow follows up to 3 brokers over time. Below it, the Flow card and the session chart split the day by broker type: retail apps in orange, institutions in navy. Click a highlighted number to see its source.',
    },
    {
      title: 'Company health and events',
      body: 'Now on 23 Sep. Company Health compares the latest report with the one before it: green went up, red went down. Events lists the news and filings from the past 30 days.',
    },
    {
      title: 'Live Radar',
      body: 'The radar picks out stocks where broker flow, company health and news line up, or where big holders start to leave. Click one to open it, or search for any stock below.',
    },
    {
      title: 'Your portfolio',
      body: 'Add a stock with its lots, price and date, then track your value against a sample index. Other Side describes what happened. It never tells you to buy or sell.',
    },
  ],
};

const id: TourCopy = {
  label: 'Tur terpandu',
  title: 'Lihat cara kerja Other Side dalam enam langkah',
  intro:
    'Tur membuka layar asli satu per satu, dengan catatan singkat tentang apa yang perlu dilihat.',
  hint: 'Gunakan Kembali dan Lanjut pada panel. Tekan Sembunyikan atau Esc untuk berhenti.',
  coversTitle: 'Isi tur',
  start: 'Mulai tur',
  restart: 'Mulai ulang tur',
  running: 'Tur sedang berjalan',
  steps: [
    {
      title: 'Brief pagi Anda',
      body: 'Brief dibuka dengan nilai portofolio Anda. Pilih hari di strip minggu, lalu Kepemilikan Saya dan Watchlist memberi satu baris per saham untuk hari itu. Klik saham untuk membuka analisisnya.',
    },
    {
      title: 'Halaman analisis',
      body: 'Kartu atas menampilkan harga penutupan, ringkasan singkat, dan tombol untuk menambah saham ke Watchlist atau Portofolio. Kalender menentukan tanggal, dan data sesudahnya tidak terlihat. Kembali membawa Anda ke halaman asal.',
    },
    {
      title: 'Siapa yang bertransaksi',
      body: 'Arus bersih broker mengikuti hingga 3 broker dari waktu ke waktu. Di bawahnya, kartu Arus dan grafik sesi membagi hari itu menurut jenis broker: aplikasi ritel berwarna oranye, institusi berwarna biru tua. Klik angka yang disorot untuk melihat sumbernya.',
    },
    {
      title: 'Kesehatan perusahaan dan peristiwa',
      body: 'Sekarang di 23 Sep. Kesehatan Perusahaan membandingkan laporan terbaru dengan laporan sebelumnya: hijau berarti naik, merah berarti turun. Peristiwa memuat berita dan keterbukaan informasi 30 hari terakhir.',
    },
    {
      title: 'Radar Langsung',
      body: 'Radar menyorot saham yang arus broker, kesehatan perusahaan, dan beritanya sejalan, atau yang pemegang besarnya mulai keluar. Klik satu saham untuk membukanya, atau cari saham apa pun di bawah.',
    },
    {
      title: 'Portofolio Anda',
      body: 'Tambahkan saham dengan jumlah lot, harga, dan tanggalnya, lalu pantau nilainya dibanding indeks sampel. Other Side menjelaskan apa yang terjadi. Other Side tidak pernah menyuruh Anda membeli atau menjual.',
    },
  ],
};

const zh: TourCopy = {
  label: '引导导览',
  title: '六步了解 Other Side 如何运作',
  intro: '导览会逐个打开真实页面，并用一个小面板说明该看什么。',
  hint: '使用面板上的“上一步”和“下一步”。点击“收起”或按 Esc 可停止。',
  coversTitle: '导览内容',
  start: '开始导览',
  restart: '重新开始导览',
  running: '导览进行中',
  steps: [
    {
      title: '您的晨报',
      body: '简报以您的投资组合市值开头。在周历中选择一天，“我的持仓”和“自选股”会为每只股票给出当天的一句话。点击股票即可打开它的分析页。',
    },
    {
      title: '分析页',
      body: '顶部卡片显示收盘价、一段简短总结，以及加入自选股或投资组合的按钮。日历决定日期，之后的数据都看不到。“返回”会带您回到原来的页面。',
    },
    {
      title: '谁在交易',
      body: '券商净流量可跟踪最多 3 家券商的走势。下方的资金流卡片和时段图按券商类型拆分当天交易：零售 App 为橙色，机构为深蓝色。点击高亮数字即可查看来源。',
    },
    {
      title: '公司健康与事件',
      body: '现在是 9 月 23 日。公司健康将最新报告与上一份报告比较：绿色表示上升，红色表示下降。事件列出过去 30 天的新闻和公告。',
    },
    {
      title: '实时雷达',
      body: '雷达挑出券商资金流、公司健康和新闻相互吻合的股票，或大户开始离场的股票。点击即可打开，也可在下方搜索任意股票。',
    },
    {
      title: '您的投资组合',
      body: '输入手数、价格和日期添加股票，并与示例指数比较您的市值。Other Side 只描述发生了什么，从不告诉您买入或卖出。',
    },
  ],
};

const COPY: Record<Locale, TourCopy> = { en, id, 'zh-CN': zh };

export function tourCopy(locale: Locale): TourCopy {
  return COPY[locale] ?? en;
}

export const TOUR_STEP_COUNT = en.steps.length;
