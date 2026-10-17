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
  title: 'See how Other Side works in nine steps',
  intro:
    'The tour opens real screens on real data, one at a time. A small panel tells you what to look at. You can click anything while it runs.',
  hint: 'Use Back and Next on the panel. Press Hide or Esc to stop.',
  coversTitle: 'What the tour covers',
  start: 'Start tour',
  restart: 'Restart tour',
  running: 'Tour is running',
  steps: [
    {
      title: 'The morning brief',
      body: 'The Brief reads one trading session for the stocks you follow. Use the calendar at the top right to pick a briefing morning. My Holdings and Watchlist show one headline per stock. This morning reads the 24 Aug session.',
    },
    {
      title: 'Open the SINI analysis',
      body: 'The top card shows the ticker, company name and close price. Use its calendar to pick a session. Nothing after the chosen date is visible, so you see what an analyst saw that day.',
    },
    {
      title: 'Who traded: the Flow card',
      body: 'The Flow card groups brokers. Compare the retail app group with the institutional groups. Top 5 net buyers and sellers show the brokers behind each net number.',
    },
    {
      title: 'Session broker flow',
      body: 'The chart shows broker flow for each session. Switch between Sessions and Cumulative. In Broker net flow, pick up to 3 brokers to follow them side by side.',
    },
    {
      title: 'What was observed',
      body: 'Each bullet under "What was observed?" is a number from the data. Click one to open its evidence. "What could be interpreted?" lists readings, not conclusions.',
    },
    {
      title: 'Jump to 23 Sep: health and events',
      body: 'The date is now 23 Sep. Company Health shows equity still negative at 30 Jun, with a one-off gain. Events in the past 30 days lists what the company reported.',
    },
    {
      title: 'Find any stock',
      body: 'Stocks lists every covered stock with a headline. Search by ticker or name. SINI is the real case. SMPA to SMPE are fictional samples for trying the screens.',
    },
    {
      title: 'Build a portfolio',
      body: 'On Portfolio, search an instrument and press Add to Portfolio. Enter lots, buy price and date. My Holdings shows your purchase details and lets you edit or delete. Portfolio Analytics compares your value with a sample index.',
    },
    {
      title: 'Never advice',
      body: 'Other Side describes what happened. It does not tell you to buy or sell. Every number opens its source, so you can check it yourself.',
    },
  ],
};

const id: TourCopy = {
  label: 'Tur terpandu',
  title: 'Lihat cara kerja Other Side dalam sembilan langkah',
  intro:
    'Tur membuka layar asli dengan data asli, satu per satu. Panel kecil menjelaskan apa yang perlu dilihat. Anda boleh mengklik apa saja selama tur berjalan.',
  hint: 'Gunakan Kembali dan Lanjut pada panel. Tekan Sembunyikan atau Esc untuk berhenti.',
  coversTitle: 'Isi tur',
  start: 'Mulai tur',
  restart: 'Mulai ulang tur',
  running: 'Tur sedang berjalan',
  steps: [
    {
      title: 'Brief pagi',
      body: 'Brief membaca satu sesi perdagangan untuk saham yang Anda ikuti. Pakai kalender di kanan atas untuk memilih pagi brief. Kepemilikan Saya dan Watchlist menampilkan satu judul per saham. Pagi ini membaca sesi 24 Agu.',
    },
    {
      title: 'Buka analisis SINI',
      body: 'Kartu atas menampilkan kode, nama perusahaan, dan harga penutupan. Pakai kalendernya untuk memilih sesi. Data setelah tanggal terpilih tidak terlihat, jadi Anda melihat apa yang dilihat analis hari itu.',
    },
    {
      title: 'Siapa yang bertransaksi: kartu Arus',
      body: 'Kartu Arus mengelompokkan broker. Bandingkan broker aplikasi ritel dengan broker institusional. 5 Pembeli dan Penjual Bersih Teratas menunjukkan broker di balik setiap angka bersih.',
    },
    {
      title: 'Aliran broker per sesi',
      body: 'Grafik menampilkan aliran broker tiap sesi. Beralih antara Sesi dan Kumulatif. Di Arus bersih broker, pilih hingga 3 broker untuk dibandingkan berdampingan.',
    },
    {
      title: 'Apa yang teramati',
      body: 'Setiap poin di bawah "Apa yang teramati?" adalah angka dari data. Klik satu poin untuk membuka buktinya. "Apa yang bisa ditafsirkan?" berisi pembacaan, bukan kesimpulan.',
    },
    {
      title: 'Lompat ke 23 Sep: kesehatan dan peristiwa',
      body: 'Tanggal sekarang 23 Sep. Kesehatan Perusahaan menunjukkan ekuitas masih negatif pada 30 Jun, dengan satu keuntungan non-berulang. Peristiwa 30 hari terakhir memuat apa yang dilaporkan perusahaan.',
    },
    {
      title: 'Cari saham apa saja',
      body: 'Daftar saham memuat semua saham yang tercakup, lengkap dengan judul. Cari dengan kode atau nama. SINI adalah kasus nyata. SMPA sampai SMPE adalah contoh fiktif untuk mencoba layar.',
    },
    {
      title: 'Susun portofolio',
      body: 'Di Portofolio, cari instrumen lalu tekan Tambah ke Portofolio. Isi lot, harga beli, dan tanggal. Kepemilikan Saya menampilkan detail pembelian dan bisa diubah atau dihapus. Analitik Portofolio membandingkan nilai Anda dengan indeks contoh.',
    },
    {
      title: 'Bukan nasihat',
      body: 'Other Side menjelaskan apa yang terjadi. Aplikasi ini tidak menyuruh Anda membeli atau menjual. Setiap angka membuka sumbernya, jadi Anda bisa memeriksanya sendiri.',
    },
  ],
};

const zh: TourCopy = {
  label: '引导导览',
  title: '九步了解 Other Side 如何运作',
  intro: '导览会逐个打开真实页面和真实数据。一个小面板会告诉您该看什么。导览进行时您可以随意点击。',
  hint: '使用面板上的“上一步”和“下一步”。点击“收起”或按 Esc 可停止。',
  coversTitle: '导览内容',
  start: '开始导览',
  restart: '重新开始导览',
  running: '导览进行中',
  steps: [
    {
      title: '晨报',
      body: '简报读取您关注股票的一个交易时段。用右上角的日历选择简报日期。我的持仓和自选列表为每只股票显示一条标题。今晨读取的是 8 月 24 日的时段。',
    },
    {
      title: '打开 SINI 分析',
      body: '顶部卡片显示代码、公司名称和收盘价。用它的日历选择时段。所选日期之后的数据不可见，所以您看到的就是当天分析师能看到的内容。',
    },
    {
      title: '谁在交易：资金流卡片',
      body: '资金流卡片把券商分组。比较零售App券商和机构券商。前 5 大净买入方和净卖出方显示每个净额背后的券商。',
    },
    {
      title: '时段券商资金流',
      body: '图表显示每个时段的券商资金流。可在“时段”和“累计”之间切换。在“券商净流入”中最多选 3 家券商并排比较。',
    },
    {
      title: '已观测的内容',
      body: '“观察到了什么？”下的每条要点都是数据中的数字。点击一条可打开其证据。“可以如何解读？”列出的是解读，不是结论。',
    },
    {
      title: '跳到 9 月 23 日：公司健康状况与事件',
      body: '日期现在是 9 月 23 日。公司健康状况显示 6 月 30 日权益仍为负，并有一笔一次性收益。过去 30 天的事件列出公司公布的内容。',
    },
    {
      title: '查找任何股票',
      body: '股票页列出所有覆盖的股票及其标题。可按代码或名称搜索。SINI 是真实案例。SMPA 到 SMPE 是用于试用页面的虚构示例。',
    },
    {
      title: '建立投资组合',
      body: '在投资组合页搜索标的并点击“加入投资组合”。填写手数、买入价和日期。我的持仓显示买入信息，可编辑或删除。投资组合分析将您的价值与示例指数比较。',
    },
    {
      title: '从不提供建议',
      body: 'Other Side 只描述发生了什么，不会告诉您买入或卖出。每个数字都能打开来源，您可以自己核对。',
    },
  ],
};

const COPY: Record<Locale, TourCopy> = { en, id, 'zh-CN': zh };

export function tourCopy(locale: Locale): TourCopy {
  return COPY[locale] ?? en;
}

export const TOUR_STEP_COUNT = en.steps.length;
