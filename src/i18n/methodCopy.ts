// Copy for the "How it works" screen, in the three supported locales.

import type { Locale } from '../engine/context';

export type MethodIcon = 'calendar' | 'search' | 'check' | 'thesis' | 'stocks';

export interface MethodFlowStep {
  icon: MethodIcon;
  title: string;
  line: string;
}

export interface MethodRule {
  icon: 'search' | 'check' | 'how';
  text: string;
}

export interface MethodBrokerType {
  title: string;
  codes: string;
}

export interface MethodCopy {
  eyebrow: string;
  title: string;
  intro: string;
  flowTitle: string;
  flow: MethodFlowStep[];
  brokersTitle: string;
  brokers: MethodBrokerType[];
  brokersNote: string;
  replayTitle: string;
  replayNote: string;
  replayDay: string;
  replayMorning: string;
  replayLater: string;
  rulesTitle: string;
  rules: MethodRule[];
  footnote: string;
}

const en: MethodCopy = {
  eyebrow: 'Proposed Mirae feature',
  title: 'How it works',
  intro:
    'Other Side shows who is buying and selling a stock, by broker type, from the daily broker summary. No advice.',
  flowTitle: 'From data to screen',
  flow: [
    { icon: 'calendar', title: 'Daily broker data', line: 'One summary per session' },
    { icon: 'search', title: 'Code counts flows', line: 'Net buy and sell' },
    { icon: 'check', title: 'Checked facts', line: 'Each one has a source' },
    { icon: 'thesis', title: 'Plain reading', line: 'Short sentences' },
    { icon: 'stocks', title: 'Your screens', line: 'Brief, Stocks, Analysis, Portfolio' },
  ],
  brokersTitle: 'Four broker types',
  brokers: [
    { title: 'Retail app brokers', codes: 'XL, XC, YP' },
    { title: 'Institutional brokers', codes: 'AK, BK, ZP' },
    { title: 'Other / mixed brokers', codes: 'CC, MG, PD' },
    { title: 'Unclassified', codes: 'none' },
  ],
  brokersNote: 'Grouping is a team mapping, not client identity.',
  replayTitle: 'Looking back at a past date',
  replayNote: 'Pick any date and you see only what was known that morning. Yesterday\'s broker data appears overnight; nothing from later days leaks in.',
  replayDay: '23 Sep: trading day',
  replayMorning: '24 Sep morning: data shows up',
  replayLater: 'Later days: hidden',
  rulesTitle: 'Three rules',
  rules: [
    { icon: 'check', text: 'Every number comes from the data.' },
    { icon: 'search', text: 'Every number opens its source.' },
    { icon: 'how', text: 'Never a buy or sell call.' },
  ],
  footnote: 'SINI is real data. SMPA to SMPE are fictional samples.',
};

const id: MethodCopy = {
  eyebrow: 'Fitur usulan Mirae Asset',
  title: 'Cara kerja',
  intro:
    'Other Side menunjukkan siapa yang membeli dan menjual sebuah saham, menurut jenis broker, dari ringkasan broker harian. Tanpa saran.',
  flowTitle: 'Dari data ke layar',
  flow: [
    { icon: 'calendar', title: 'Data broker harian', line: 'Satu ringkasan per sesi' },
    { icon: 'search', title: 'Kode menghitung arus', line: 'Beli bersih dan jual bersih' },
    { icon: 'check', title: 'Fakta terverifikasi', line: 'Setiap fakta ada sumbernya' },
    { icon: 'thesis', title: 'Bacaan sederhana', line: 'Kalimat pendek' },
    { icon: 'stocks', title: 'Layar Anda', line: 'Brief, Saham, Analisis, Portofolio' },
  ],
  brokersTitle: 'Empat jenis broker',
  brokers: [
    { title: 'Broker aplikasi ritel', codes: 'XL, XC, YP' },
    { title: 'Broker institusional', codes: 'AK, BK, ZP' },
    { title: 'Broker lain / campuran', codes: 'CC, MG, PD' },
    { title: 'Tidak terklasifikasi', codes: 'tidak ada' },
  ],
  brokersNote: 'Pengelompokan adalah pemetaan tim, bukan identitas nasabah.',
  replayTitle: 'Melihat tanggal lampau',
  replayNote: 'Pilih tanggal mana pun dan Anda hanya melihat apa yang sudah diketahui pagi itu. Data broker kemarin muncul semalam; tidak ada data dari hari setelahnya yang ikut terlihat.',
  replayDay: '23 Sep: hari perdagangan',
  replayMorning: '24 Sep pagi: data muncul',
  replayLater: 'Hari berikutnya: tersembunyi',
  rulesTitle: 'Tiga aturan',
  rules: [
    { icon: 'check', text: 'Setiap angka berasal dari data.' },
    { icon: 'search', text: 'Setiap angka membuka sumbernya.' },
    { icon: 'how', text: 'Tidak pernah ada ajakan beli atau jual.' },
  ],
  footnote: 'SINI adalah data nyata. SMPA sampai SMPE adalah contoh fiktif.',
};

const zh: MethodCopy = {
  eyebrow: 'Mirae 提案功能',
  title: '运作方式',
  intro: 'Other Side 根据每日券商汇总，按券商类型显示谁在买入和卖出某只股票。不提供建议。',
  flowTitle: '从数据到页面',
  flow: [
    { icon: 'calendar', title: '每日券商数据', line: '每个交易日一份汇总' },
    { icon: 'search', title: '代码统计资金流', line: '净买入与净卖出' },
    { icon: 'check', title: '核实的事实', line: '每条都有来源' },
    { icon: 'thesis', title: '通俗解读', line: '简短句子' },
    { icon: 'stocks', title: '您的页面', line: '简报、股票、分析、投资组合' },
  ],
  brokersTitle: '四类券商',
  brokers: [
    { title: '零售App券商', codes: 'XL, XC, YP' },
    { title: '机构券商', codes: 'AK, BK, ZP' },
    { title: '其他/混合券商', codes: 'CC, MG, PD' },
    { title: '未分类', codes: '无' },
  ],
  brokersNote: '分组是团队的映射，不代表客户身份。',
  replayTitle: '查看过去的日期',
  replayNote: '选择任意日期，您只会看到当天早上已知的信息。前一交易日的券商数据在夜间出现，之后日期的数据不会提前显示。',
  replayDay: '9月23日：交易日',
  replayMorning: '9月24日早上：数据出现',
  replayLater: '之后的日期：隐藏',
  rulesTitle: '三条规则',
  rules: [
    { icon: 'check', text: '每个数字都来自数据。' },
    { icon: 'search', text: '每个数字都可查看来源。' },
    { icon: 'how', text: '绝不给出买入或卖出建议。' },
  ],
  footnote: 'SINI 是真实数据。SMPA 至 SMPE 是虚构样本。',
};

export const methodCopy: Record<Locale, MethodCopy> = { en, id, 'zh-CN': zh };
