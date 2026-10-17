import type { BilingualText, FactKey, GroupFocus } from '../engine/facts';

export type WordingVariant = 'short' | 'explained';

export type ClaimValueSlot =
  | { kind: 'direction'; fact: FactKey; focus?: GroupFocus }
  | { kind: 'lots'; fact: FactKey; focus?: GroupFocus; which?: 'from' | 'to'; sign: 'abs' | 'explicit' }
  | { kind: 'price'; fact: FactKey; which: 'display' | 'from' | 'to' }
  | { kind: 'count'; fact: FactKey }
  | { kind: 'fact_date'; fact: FactKey; which: 'start' | 'end' }
  | { kind: 'day_span'; fact: FactKey; which: 'first' | 'last' }
  | { kind: 'sensitivity_broker'; fact: FactKey }
  | { kind: 'sensitivity_lots'; fact: FactKey; which: 'baseline' | 'overridden'; focus: GroupFocus }
  | { kind: 'dates_list'; fact: FactKey; which: 'excluded' | 'missing' }
  | { kind: 'rank_position'; fact: FactKey; broker: string }
  | { kind: 'ranking_lots'; fact: FactKey; broker: string; sign: 'abs' | 'explicit' }
  | { kind: 'move_group'; fact: FactKey }
  | { kind: 'move_direction'; fact: FactKey }
  | { kind: 'move_lots'; fact: FactKey; which: 'from' | 'to'; sign: 'abs' | 'explicit' }
  | { kind: 'portfolio_percent'; fact: FactKey; focus: 'portfolio' | 'benchmark' }
  | { kind: 'portfolio_value'; fact: FactKey; which: 'start' | 'end' }
  | { kind: 'portfolio_price'; fact: FactKey; which: 'start' | 'end' }
  | { kind: 'portfolio_symbol'; fact: FactKey; focus?: 'holding' | 'benchmark' }
  | { kind: 'portfolio_quantity'; fact: FactKey }
  | { kind: 'portfolio_sessions'; fact: FactKey }
  | { kind: 'portfolio_contribution'; fact: FactKey }
  | { kind: 'portfolio_weight'; fact: FactKey }
  | { kind: 'portfolio_holdings_count'; fact: FactKey }
  | { kind: 'portfolio_weight_dates'; fact: FactKey };

export type TemplateNode = { kind: 'text'; text: BilingualText } | { kind: 'slot'; slot: ClaimValueSlot };

export interface ClaimTemplate {
  short: TemplateNode[];
  explained: TemplateNode[];
}

const text = (en: string, id: string, zh: string): TemplateNode => ({ kind: 'text', text: { en, id, zh } });
const slot = (value: ClaimValueSlot): TemplateNode => ({ kind: 'slot', slot: value });

export const CAVEATS = {
  visible_sample: {
    en: 'Visible top-nine-per-side sample only; brokers outside the sample are unknown.',
    id: 'Hanya sampel sembilan teratas per sisi yang terlihat; broker di luar sampel tidak diketahui.',
    zh: '仅为可见的前九大每边样本；样本外的券商未知。',
  },
  team_mapping: {
    en: 'Group labels are team mapping and do not establish customer identity.',
    id: 'Label grup adalah pemetaan tim dan tidak menetapkan identitas nasabah.',
    zh: '分组标签仅为团队映射，不代表客户身份。',
  },
  implied_reference: {
    en: 'Net-flow implied price reference, not an official close, VWAP, cost basis or executable quote.',
    id: 'Referensi harga tersirat arus bersih, bukan penutup resmi, VWAP, biaya perolehan, atau kutipan yang dapat dieksekusi.',
    zh: '净流入隐含价格参考，并非官方收盘价、VWAP、成本基准或可执行报价。',
  },
  reversal: {
    en: 'Opposite observed net directions through one broker, not a proven same-client round trip.',
    id: 'Arah bersih teramati yang berlawanan melalui satu broker, bukan pembalikan putaran klien yang sama yang terbukti.',
    zh: '通过同一券商观察到的相反净方向，并非已证实的同一客户往返交易。',
  },
  unknown_not_zero: {
    en: 'Missing sessions and brokers outside the sample are unknown, not zero.',
    id: 'Sesi yang hilang dan broker di luar sampel tidak diketahui, bukan nol.',
    zh: '缺失时段与样本外的券商是未知而非零。',
  },
  portfolio_model: {
    en: 'Current-holdings model: quantities are held fixed, excluding trades, cash, dividends, fees and rights subscriptions.',
    id: 'Model kepemilikan saat ini: kuantitas tetap, tanpa transaksi, kas, dividen, biaya, atau hak memesan efek.',
    zh: '当前持仓模型：数量固定，不含交易、现金、分红、费用与配股认购。',
  },
  price_source: {
    en: 'Prices come from the stated source: provider daily bars are unadjusted closes, sample fixtures are fictional values; neither is a broker implied-price reference.',
    id: 'Harga berasal dari sumber yang disebutkan: bar harian penyedia adalah penutupan tanpa penyesuaian, fixture sampel bernilai fiksi; keduanya bukan referensi harga tersirat broker.',
    zh: '价格来自所述来源：供应商日度数据为未调整收盘价，样本数据为虚构值；两者都不是券商隐含价格参考。',
  },
} as const;

export type CaveatKey = keyof typeof CAVEATS;

export const CLAIM_TEMPLATES: Record<string, ClaimTemplate> = {
  'CL-OBS-C02': {
    short: [text('Session count for the window.', 'Jumlah sesi untuk jendela.', '窗口的时段数量。')],
    explained: [
      text('The visible broker summary captured ', 'Ringkasan broker yang terlihat menangkap ', '可见的券商汇总捕获了 '),
      slot({ kind: 'count', fact: 'C02' }),
      text(' market sessions between ', ' sesi pasar antara ', ' 个市场时段，介于 '),
      slot({ kind: 'fact_date', fact: 'C02', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C02', which: 'end' }),
      text('.', '.', '。'),
    ],
  },
  'CL-OBS-C04': {
    short: [text('Net lots of retail app brokers.', 'Lot bersih broker aplikasi ritel.', '零售App券商净手数。')],
    explained: [
      text('Retail app brokers were ', 'Broker aplikasi ritel menjadi ', '零售App券商为'),
      slot({ kind: 'direction', fact: 'C04', focus: 'app_facing' }),
      text(' of about ', ' sekitar ', '，净额约 '),
      slot({ kind: 'lots', fact: 'C04', focus: 'app_facing', sign: 'abs' }),
      text(' lots from ', ' lot dari ', ' 手，时间从 '),
      slot({ kind: 'fact_date', fact: 'C04', which: 'start' }),
      text(' to ', ' hingga ', ' 到 '),
      slot({ kind: 'fact_date', fact: 'C04', which: 'end' }),
      text('.', '.', '。'),
    ],
  },
  'CL-OBS-C05': {
    short: [text('Net lots of institutional brokers.', 'Lot bersih broker institusional.', '机构券商净手数。')],
    explained: [
      text('Institutional brokers were ', 'Broker institusional menjadi ', '机构券商为'),
      slot({ kind: 'direction', fact: 'C05', focus: 'institution_facing' }),
      text(' of about ', ' sekitar ', '，净额约 '),
      slot({ kind: 'lots', fact: 'C05', focus: 'institution_facing', sign: 'abs' }),
      text(' lots from ', ' lot dari ', ' 手，时间从 '),
      slot({ kind: 'fact_date', fact: 'C05', which: 'start' }),
      text(' to ', ' hingga ', ' 到 '),
      slot({ kind: 'fact_date', fact: 'C05', which: 'end' }),
      text('.', '.', '。'),
    ],
  },
  'CL-OBS-C06': {
    short: [
      text(
        'Net lots of other / mixed and unclassified brokers.',
        'Lot bersih broker lain / campuran dan tidak terklasifikasi.',
        '其他/混合及未分类券商净手数。',
      ),
    ],
    explained: [
      text('Other / mixed and unclassified brokers were ', 'Broker lain / campuran dan tidak terklasifikasi menjadi ', '其他/混合及未分类券商为'),
      slot({ kind: 'direction', fact: 'C06', focus: 'combined_other' }),
      text(' of about ', ' sekitar ', '，净额约 '),
      slot({ kind: 'lots', fact: 'C06', focus: 'combined_other', sign: 'abs' }),
      text(' lots in the visible sample.', ' lot dalam sampel yang terlihat.', ' 手（可见样本内）。'),
    ],
  },
  'CL-OBS-C07': {
    short: [text('Signed total of the visible sample.', 'Total bertanda dari sampel yang terlihat.', '可见样本的带符号总数。')],
    explained: [
      text('The visible sample residual (all brokers) was ', 'Residu sampel yang terlihat (semua broker) adalah ', '可见样本残差（所有券商）为 '),
      slot({ kind: 'lots', fact: 'C07', focus: 'residual', sign: 'explicit' }),
      text(' lots between ', ' lot antara ', ' 手，介于 '),
      slot({ kind: 'fact_date', fact: 'C07', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C07', which: 'end' }),
      text('.', '.', ' 之间。'),
    ],
  },
  'CL-OBS-C08': {
    short: [text('Largest visible net buyers by lots.', 'Pembeli bersih terlihat terbesar berdasarkan lot.', '按手数排名的最大可见净买入方。')],
    explained: [
      text(
        'Brokers ranked by visible net-buy lots inside the top-nine-per-side sample.',
        'Broker diperingkat berdasarkan lot beli bersih yang terlihat di dalam sampel sembilan teratas per sisi.',
        '在前九大每边样本内，按可见净买入手数对券商排名。',
      ),
    ],
  },
  'CL-OBS-C09': {
    short: [text('Largest visible net sellers by lots.', 'Penjual bersih terlihat terbesar berdasarkan lot.', '按手数排名的最大可见净卖出方。')],
    explained: [
      text(
        'Brokers ranked by visible net-sell lots inside the top-nine-per-side sample.',
        'Broker diperingkat berdasarkan lot jual bersih yang terlihat di dalam sampel sembilan teratas per sisi.',
        '在前九大每边样本内，按可见净卖出手数对券商排名。',
      ),
    ],
  },
  'CL-OBS-C10': {
    short: [text('Window average net-flow implied price reference.', 'Rata-rata jendela referensi harga tersirat arus bersih.', '窗口平均净流入隐含价格参考。')],
    explained: [
      text(
        'The window average net-flow implied price reference is about ',
        'Rata-rata jendela referensi harga tersirat arus bersih adalah sekitar ',
        '窗口平均净流入隐含价格参考约为 ',
      ),
      slot({ kind: 'price', fact: 'C10', which: 'display' }),
      text('.', '.', '。'),
    ],
  },
  'CL-OBS-C12': {
    short: [text('Institutional positive streak.', 'Rentetan positif institusional.', '机构券商的正净额连续记录。')],
    explained: [
      text(
        'Institutional brokers were net buyers in each of the last five sessions (',
        'Broker institusional menjadi pembeli bersih di masing-masing dari lima sesi terakhir (',
        '机构券商在最近五个时段（',
      ),
      slot({ kind: 'fact_date', fact: 'C12', which: 'start' }),
      text(' to ', ' hingga ', ' 至 '),
      slot({ kind: 'fact_date', fact: 'C12', which: 'end' }),
      text(', visible sample).', ', sampel yang terlihat).', '，可见样本）的每一个都是净买入方。'),
    ],
  },
  'CL-OBS-C13': {
    short: [text('Institutional main-buyer streak.', 'Rentetan pembeli utama institusional.', '机构券商的主力买入连续记录。')],
    explained: [
      text(
        'Institutional brokers were the strictly largest visible net-buying group in each of the last five sessions (',
        'Broker institusional adalah grup pembelian bersih terlihat yang terbesar secara ketat di masing-masing dari lima sesi terakhir (',
        '机构券商在最近五个时段（',
      ),
      slot({ kind: 'fact_date', fact: 'C13', which: 'start' }),
      text(' to ', ' hingga ', ' 至 '),
      slot({ kind: 'fact_date', fact: 'C13', which: 'end' }),
      text(', visible sample).', ', sampel yang terlihat).', '，可见样本）的每一个都是严格最大的可见净买入组。'),
    ],
  },
  'CL-OBS-C15': {
    short: [text('ES visible net selling.', 'Penjualan bersih ES yang terlihat.', 'ES 可见净卖出。')],
    explained: [
      text('ES was ', 'ES menjadi ', 'ES 为'),
      slot({ kind: 'direction', fact: 'C15' }),
      text(' of about ', ' sekitar ', '，净额约 '),
      slot({ kind: 'lots', fact: 'C15', sign: 'abs' }),
      text(' lots across ', ' lot selama ', ' 手，跨 '),
      slot({ kind: 'count', fact: 'C15' }),
      text(' visible sessions (', ' sesi terlihat (', ' 个可见时段（'),
      slot({ kind: 'day_span', fact: 'C15', which: 'first' }),
      text(' to ', ' hingga ', ' 至 '),
      slot({ kind: 'day_span', fact: 'C15', which: 'last' }),
      text(').', ').', '）。'),
    ],
  },
  'CL-OBS-C16': {
    short: [text('CC observed direction change.', 'Perubahan arah teramati CC.', 'CC 观察到的方向变化。')],
    explained: [
      text('CC swung from ', 'CC berayun dari ', 'CC 从 '),
      slot({ kind: 'lots', fact: 'C16', which: 'from', sign: 'explicit' }),
      text(' lots on ', ' lot pada ', ' 手（'),
      slot({ kind: 'fact_date', fact: 'C16', which: 'start' }),
      text(' to ', ' menjadi ', '）变为 '),
      slot({ kind: 'lots', fact: 'C16', which: 'to', sign: 'explicit' }),
      text(' lots on ', ' lot pada ', ' 手（'),
      slot({ kind: 'fact_date', fact: 'C16', which: 'end' }),
      text('.', '.', '）。'),
    ],
  },
  'CL-OBS-C17': {
    short: [text('AZ observed direction change.', 'Perubahan arah teramati AZ.', 'AZ 观察到的方向变化。')],
    explained: [
      text('AZ swung from ', 'AZ berayun dari ', 'AZ 从 '),
      slot({ kind: 'lots', fact: 'C17', which: 'from', sign: 'explicit' }),
      text(' lots on ', ' lot pada ', ' 手（'),
      slot({ kind: 'fact_date', fact: 'C17', which: 'start' }),
      text(' to ', ' menjadi ', '）变为 '),
      slot({ kind: 'lots', fact: 'C17', which: 'to', sign: 'explicit' }),
      text(' lots on ', ' lot pada ', ' 手（'),
      slot({ kind: 'fact_date', fact: 'C17', which: 'end' }),
      text('.', '.', '）。'),
    ],
  },
  'CL-OBS-C25': {
    short: [
      text('Change from ', 'Perubahan dari ', '自 '),
      slot({ kind: 'fact_date', fact: 'C25', which: 'start' }),
      text(' to ', ' hingga ', ' 至 '),
      slot({ kind: 'fact_date', fact: 'C25', which: 'end' }),
      text('.', '.', ' 的变化。'),
    ],
    explained: [
      text('Compared with ', 'Dibandingkan dengan ', '与 '),
      slot({ kind: 'fact_date', fact: 'C25', which: 'start' }),
      text(', group nets on the selected session ', ', lot grup pada sesi terpilih ', ' 相比，所选时段 '),
      slot({ kind: 'fact_date', fact: 'C25', which: 'end' }),
      text(': retail app from ', ': aplikasi ritel dari ', ' 的各组净手数：零售App从 '),
      slot({ kind: 'lots', fact: 'C25', focus: 'app_facing', which: 'from', sign: 'explicit' }),
      text(' to ', ' ke ', ' 变为 '),
      slot({ kind: 'lots', fact: 'C25', focus: 'app_facing', which: 'to', sign: 'explicit' }),
      text(' lots, institutional from ', ' lot, institusional dari ', ' 手，机构从 '),
      slot({ kind: 'lots', fact: 'C25', focus: 'institution_facing', which: 'from', sign: 'explicit' }),
      text(' to ', ' ke ', ' 变为 '),
      slot({ kind: 'lots', fact: 'C25', focus: 'institution_facing', which: 'to', sign: 'explicit' }),
      text(' lots, other / mixed from ', ' lot, lain / campuran dari ', ' 手，其他/混合从 '),
      slot({ kind: 'lots', fact: 'C25', focus: 'other_mixed', which: 'from', sign: 'explicit' }),
      text(' to ', ' ke ', ' 变为 '),
      slot({ kind: 'lots', fact: 'C25', focus: 'other_mixed', which: 'to', sign: 'explicit' }),
      text(' lots, unclassified from ', ' lot, tidak terklasifikasi dari ', ' 手，未分类从 '),
      slot({ kind: 'lots', fact: 'C25', focus: 'unknown', which: 'from', sign: 'explicit' }),
      text(' to ', ' ke ', ' 变为 '),
      slot({ kind: 'lots', fact: 'C25', focus: 'unknown', which: 'to', sign: 'explicit' }),
      text(' lots.', ' lot.', ' 手。'),
    ],
  },
  'CL-OBS-C25-MOVE': {
    short: [
      text('Between ', 'Antara ', '介于 '),
      slot({ kind: 'fact_date', fact: 'C25', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C25', which: 'end' }),
      text(', ', ', ', ' 之间，'),
      slot({ kind: 'move_group', fact: 'C25' }),
      slot({ kind: 'move_direction', fact: 'C25' }),
      text('.', '.', '。'),
    ],
    explained: [
      text('Between ', 'Antara ', '介于 '),
      slot({ kind: 'fact_date', fact: 'C25', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C25', which: 'end' }),
      text(', ', ', ', ' 之间，'),
      slot({ kind: 'move_group', fact: 'C25' }),
      slot({ kind: 'move_direction', fact: 'C25' }),
      text(' from ', ' dari ', '，从 '),
      slot({ kind: 'move_lots', fact: 'C25', which: 'from', sign: 'explicit' }),
      text(' to ', ' ke ', ' 手变为 '),
      slot({ kind: 'move_lots', fact: 'C25', which: 'to', sign: 'explicit' }),
      text(' lots (visible sample).', ' lot (sampel yang terlihat).', ' 手（可见样本）。'),
    ],
  },
  'CL-INT-C11': {
    short: [text('Move in the daily net-flow implied price reference.', 'Pergerakan referensi harga tersirat arus bersih harian.', '日度净流入隐含价格参考的变动。')],
    explained: [
      text('The net-flow implied price reference moved from about ', 'Referensi harga tersirat arus bersih bergerak dari sekitar ', '净流入隐含价格参考从约 '),
      slot({ kind: 'price', fact: 'C11', which: 'from' }),
      text(' to ', ' menjadi ', ' 变为 '),
      slot({ kind: 'price', fact: 'C11', which: 'to' }),
      text(' between ', ' antara ', '，时间介于 '),
      slot({ kind: 'fact_date', fact: 'C11', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C11', which: 'end' }),
      text('.', '.', ' 之间。'),
    ],
  },
  'CL-INT-C18': {
    short: [text('Label sensitivity of the largest institutional buyer.', 'Sensitivitas label pembeli institusional terbesar.', '最大机构买入方的标签敏感性。')],
    explained: [
      text('If ', 'Jika ', '若 '),
      slot({ kind: 'sensitivity_broker', fact: 'C18' }),
      text(
        ', the largest visible institutional buyer, is moved to Unknown, the institutional net falls from about ',
        ', broker pembeli institusional terbesar yang terlihat, dipindahkan ke tidak terklasifikasi, lot bersih institusional turun dari sekitar ',
        '（可见的最大机构净买入方）被移至未分类，机构净额将从约 ',
      ),
      slot({ kind: 'sensitivity_lots', fact: 'C18', which: 'baseline', focus: 'institution_facing' }),
      text(' to ', ' ke ', ' 手降至 '),
      slot({ kind: 'sensitivity_lots', fact: 'C18', which: 'overridden', focus: 'institution_facing' }),
      text(' lots.', ' lot.', ' 手。'),
    ],
  },
  'CL-UNK-C01': {
    short: [text('Excluded session, with reason.', 'Sesi yang dikeluarkan, dengan alasannya.', '被排除的时段及其原因。')],
    explained: [
      slot({ kind: 'dates_list', fact: 'C01', which: 'excluded' }),
      text(
        ' is excluded: overlapping screenshots put the same brokers on both sides.',
        ' dikeluarkan: tangkapan layar yang tumpang tindih menempatkan broker yang sama di kedua sisi.',
        ' 被排除：重叠的截图使相同的券商同时出现在两侧。',
      ),
    ],
  },
  'CL-UNK-C03': {
    short: [text('Sessions not captured.', 'Sesi yang tidak terekam.', '未捕获的时段。')],
    explained: [
      slot({ kind: 'dates_list', fact: 'C03', which: 'missing' }),
      text(
        ' was not captured, so its flows are unknown, not zero.',
        ' tidak terekam, sehingga arusnya tidak diketahui, bukan nol.',
        ' 未被捕获，因此其流向未知而非零。',
      ),
    ],
  },
  'CL-UNK-C24': {
    short: [
      text(
        'End clients unknown.',
        'Nasabah akhir tidak diketahui.',
        '最终客户未知。',
      ),
    ],
    explained: [
      text(
        'Who the end clients are, and whether they still hold the shares.',
        'Siapa nasabah akhirnya, dan apakah mereka masih memegang sahamnya.',
        '最终客户是谁，以及他们是否仍持有这些股份。',
      ),
    ],
  },
  // The thesis is bounded to net buying over the selected window, so the
  // supports/contradicts pair reads the C05 window net only. The five-session
  // streak is a separate recency check rendered by the CL-INST-STREAK-* claims,
  // never folded into this sentence, so positive window buying and a failed
  // recent streak can both be stated without contradicting each other.
  'CL-SUP-INST-LED': {
    short: [
      text(
        'Supports: institutional brokers were net buyers over this window.',
        'Mendukung: broker institusional menjadi pembeli bersih di jendela ini.',
        '支持：机构券商在本窗口内为净买入方。',
      ),
    ],
    explained: [
      text('Institutional brokers were ', 'Broker institusional menjadi ', '机构券商在本窗口内为'),
      slot({ kind: 'direction', fact: 'C05', focus: 'institution_facing' }),
      text(' over this window, about ', ' di jendela ini, sekitar ', '，净额约 '),
      slot({ kind: 'lots', fact: 'C05', focus: 'institution_facing', sign: 'abs' }),
      text(' lots from ', ' lot dari ', ' 手，时间从 '),
      slot({ kind: 'fact_date', fact: 'C05', which: 'start' }),
      text(' to ', ' hingga ', ' 到 '),
      slot({ kind: 'fact_date', fact: 'C05', which: 'end' }),
      text('.', '.', '。'),
    ],
  },
  'CL-CON-INST-LED': {
    short: [
      text(
        'Contradicts: institutional brokers were net sellers over this window.',
        'Menentang: broker institusional menjadi penjual bersih di jendela ini.',
        '反对：机构券商在本窗口内为净卖出方。',
      ),
    ],
    explained: [
      text('Institutional brokers were ', 'Broker institusional menjadi ', '机构券商在本窗口内为'),
      slot({ kind: 'direction', fact: 'C05', focus: 'institution_facing' }),
      text(' over this window, about ', ' di jendela ini, sekitar ', '，净额约 '),
      slot({ kind: 'lots', fact: 'C05', focus: 'institution_facing', sign: 'abs' }),
      text(' lots from ', ' lot dari ', ' 手，时间从 '),
      slot({ kind: 'fact_date', fact: 'C05', which: 'start' }),
      text(' to ', ' hingga ', ' 到 '),
      slot({ kind: 'fact_date', fact: 'C05', which: 'end' }),
      text('.', '.', '。'),
    ],
  },
  // Exactly-zero window net. Distinct from the unavailable case below: this is a
  // computed flat result, not a stand-in for missing observations.
  'CL-FLAT-INST-LED': {
    short: [
      text(
        'Institutional net flow was flat over this window.',
        'Arus bersih institusional datar di jendela ini.',
        '机构券商在本窗口内净流向持平。',
      ),
    ],
    explained: [
      text('Institutional net flow was ', 'Arus bersih institusional ', '机构券商在本窗口内净流向'),
      slot({ kind: 'direction', fact: 'C05', focus: 'institution_facing' }),
      text(' across this window (', ' di jendela ini (', '（'),
      slot({ kind: 'lots', fact: 'C05', focus: 'institution_facing', sign: 'abs' }),
      text(' lots from ', ' lot dari ', ' 手，时间从 '),
      slot({ kind: 'fact_date', fact: 'C05', which: 'start' }),
      text(' to ', ' hingga ', ' 到 '),
      slot({ kind: 'fact_date', fact: 'C05', which: 'end' }),
      text(').', ').', '）。'),
    ],
  },
  'CL-INST-WINDOW-NA': {
    short: [
      text(
        'Not enough visible broker data for the window net.',
        'Data broker yang terlihat tidak cukup untuk arus bersih jendela.',
        '可见券商数据不足以计算窗口净流向。',
      ),
    ],
    explained: [
      text(
        'Not enough visible broker data in this window to state institutional net flow. Missing sessions are unknown, not zero.',
        'Data broker yang terlihat di jendela ini tidak cukup untuk menyatakan arus bersih institusional. Sesi yang hilang tidak diketahui, bukan nol.',
        '本窗口内可见的券商数据不足，无法说明机构券商净流向。缺失时段为未知，而非零。',
      ),
    ],
  },
  // Recency qualifier for the institution thesis: one of these three is
  // available at any cutoff, naming whether the latest five-session buying
  // streak passed, failed, or could not be evaluated for lack of captured
  // sessions. A failed streak is a distinct condition from missing evidence.
  'CL-INST-STREAK-PASS': {
    short: [
      text(
        'Latest five-session buying streak held.',
        'Rentetan pembelian lima sesi terbaru bertahan.',
        '最近五个时段的买入连续记录成立。',
      ),
    ],
    explained: [
      text(
        'The latest five-session buying streak held: institutional brokers were net buyers in each session from ',
        'Rentetan pembelian lima sesi terbaru bertahan: broker institusional menjadi pembeli bersih di setiap sesi dari ',
        '最近五个时段的买入连续记录成立：机构券商在每个时段均为净买入方，时间从 ',
      ),
      slot({ kind: 'fact_date', fact: 'C12', which: 'start' }),
      text(' to ', ' hingga ', ' 到 '),
      slot({ kind: 'fact_date', fact: 'C12', which: 'end' }),
      text('.', '.', '。'),
    ],
  },
  'CL-INST-STREAK-FAIL': {
    short: [
      text(
        'Latest five-session buying streak failed.',
        'Rentetan pembelian lima sesi terbaru gagal.',
        '最近五个时段的买入连续记录未通过。',
      ),
    ],
    explained: [
      text(
        'The latest five-session buying streak failed: institutional brokers were not net buyers in every session from ',
        'Rentetan pembelian lima sesi terbaru gagal: broker institusional tidak menjadi pembeli bersih di setiap sesi dari ',
        '最近五个时段的买入连续记录未通过：机构券商并非在每个时段都为净买入方，时间从 ',
      ),
      slot({ kind: 'fact_date', fact: 'C12', which: 'start' }),
      text(' to ', ' hingga ', ' 到 '),
      slot({ kind: 'fact_date', fact: 'C12', which: 'end' }),
      text('.', '.', '。'),
    ],
  },
  'CL-INST-STREAK-NA': {
    short: [
      text(
        'Latest five-session streak: not enough captured sessions.',
        'Rentetan lima sesi terbaru: sesi terekam tidak cukup.',
        '最近五个时段连续记录：已采集时段不足。',
      ),
    ],
    explained: [
      text(
        'Not enough captured market sessions in this window to check the latest five-session buying streak.',
        'Sesi pasar terekam di jendela ini tidak cukup untuk memeriksa rentetan pembelian lima sesi terbaru.',
        '本窗口内已采集的市场时段不足，无法检查最近五个时段的买入连续记录。',
      ),
    ],
  },
  'CL-SUP-APP-SELLING': {
    short: [text('Supports: retail app brokers were net sellers.', 'Mendukung: broker aplikasi ritel menjadi penjual bersih.', '支持：零售App券商为净卖出方。')],
    explained: [
      text('Retail app brokers’ visible net lots are negative between ', 'Lot bersih broker aplikasi ritel yang terlihat negatif antara ', '零售App券商的可见净手数在 '),
      slot({ kind: 'fact_date', fact: 'C04', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C04', which: 'end' }),
      text('.', '.', ' 之间为负。'),
    ],
  },
  'CL-CON-APP-SELLING': {
    short: [text('Contradicts: retail app selling.', 'Menentang: penjualan aplikasi ritel.', '反对：零售App券商卖出。')],
    explained: [
      text('Retail app brokers’ visible net lots are positive between ', 'Lot bersih broker aplikasi ritel yang terlihat positif antara ', '零售App券商的可见净手数在 '),
      slot({ kind: 'fact_date', fact: 'C04', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C04', which: 'end' }),
      text('.', '.', ' 之间为正。'),
    ],
  },
  'CL-SUP-HP-BUYER': {
    short: [text('Supports: HP appears among the largest visible net buyers.', 'Mendukung: HP muncul di antara pembeli bersih terlihat terbesar.', '支持：HP 出现在最大可见净买入方之列。')],
    explained: [
      text('HP was the ', 'HP adalah pembeli bersih terlihat ', 'HP 是 '),
      slot({ kind: 'rank_position', fact: 'C08', broker: 'HP' }),
      text(' visible net buyer between ', ' antara ', ' 可见净买入方，时间介于 '),
      slot({ kind: 'fact_date', fact: 'C08', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C08', which: 'end' }),
      text(' with about ', ' dengan sekitar ', ' 之间，净买入约 '),
      slot({ kind: 'ranking_lots', fact: 'C08', broker: 'HP', sign: 'abs' }),
      text(' net-bought lots.', ' lot beli bersih.', ' 手。'),
    ],
  },
  'CL-CON-HP-SELLER': {
    short: [text('Contradicts: HP appears among the largest visible net sellers.', 'Menentang: HP muncul di antara penjual bersih terlihat terbesar.', '反对：HP 出现在最大可见净卖出方之列。')],
    explained: [
      text('HP was the ', 'HP adalah penjual bersih terlihat ', 'HP 是 '),
      slot({ kind: 'rank_position', fact: 'C09', broker: 'HP' }),
      text(' visible net seller between ', ' antara ', ' 可见净卖出方，时间介于 '),
      slot({ kind: 'fact_date', fact: 'C09', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'C09', which: 'end' }),
      text(' with about ', ' dengan sekitar ', ' 之间，净卖出约 '),
      slot({ kind: 'ranking_lots', fact: 'C09', broker: 'HP', sign: 'abs' }),
      text(' net-sold lots.', ' lot jual bersih.', ' 手。'),
    ],
  },
  'CL-SUP-PRICE-RISE': {
    short: [text('Supports: the daily net-flow implied price reference rose.', 'Mendukung: referensi harga tersirat arus bersih harian naik.', '支持：日度净流入隐含价格参考上升。')],
    explained: [
      text('The net-flow implied price reference rose from about ', 'Referensi harga tersirat arus bersih naik dari sekitar ', '净流入隐含价格参考从约 '),
      slot({ kind: 'price', fact: 'C11', which: 'from' }),
      text(' to ', ' ke ', ' 升至 '),
      slot({ kind: 'price', fact: 'C11', which: 'to' }),
      text('.', '.', '。'),
    ],
  },
  'CL-CON-PRICE-RISE': {
    short: [text('Contradicts: the daily net-flow implied price reference fell.', 'Menentang: referensi harga tersirat arus bersih harian turun.', '反对：日度净流入隐含价格参考下降。')],
    explained: [
      text('The net-flow implied price reference fell from about ', 'Referensi harga tersirat arus bersih turun dari sekitar ', '净流入隐含价格参考从约 '),
      slot({ kind: 'price', fact: 'C11', which: 'from' }),
      text(' to ', ' ke ', ' 降至 '),
      slot({ kind: 'price', fact: 'C11', which: 'to' }),
      text('.', '.', '。'),
    ],
  },
  'CL-UNK-HP-INTENT': {
    short: [
      text(
        'Whether HP’s visible net flow reflects informed positioning or routine client orders cannot be determined from broker summaries.',
        'Apakah arus bersih HP yang terlihat mencerminkan posisi berinformasi atau pesanan klien rutin tidak dapat ditentukan dari ringkasan broker.',
        '无法从券商汇总判断 HP 的可见净流向反映的是知情布局还是常规客户订单。',
      ),
    ],
    explained: [
      text(
        'Whether HP’s visible net flow reflects informed positioning or routine client orders cannot be determined from broker summaries.',
        'Apakah arus bersih HP yang terlihat mencerminkan posisi berinformasi atau pesanan klien rutin tidak dapat ditentukan dari ringkasan broker.',
        '无法从券商汇总判断 HP 的可见净流向反映的是知情布局还是常规客户订单。',
      ),
    ],
  },
  'CL-UNK-BUSINESS-PROOF': {
    short: [
      text(
        'Whether the price rise reflects an improvement in the business cannot be determined from broker flow data.',
        'Apakah kenaikan harga mencerminkan perbaikan bisnis tidak dapat ditentukan dari data arus broker.',
        '无法从券商流向数据判断价格上涨是否反映了业务的改善。',
      ),
    ],
    explained: [
      text(
        'Whether the price rise reflects an improvement in the business cannot be determined from broker flow data.',
        'Apakah kenaikan harga mencerminkan perbaikan bisnis tidak dapat ditentukan dari data arus broker.',
        '无法从券商流向数据判断价格上涨是否反映了业务的改善。',
      ),
    ],
  },
  'CL-PORT-PERF': {
    short: [text('Modelled portfolio value change.', 'Perubahan nilai portofolio termodel.', '模拟组合价值变动。')],
    explained: [
      text('Between ', 'Antara ', '介于 '),
      slot({ kind: 'fact_date', fact: 'P01', which: 'start' }),
      text(' and ', ' dan ', ' 与 '),
      slot({ kind: 'fact_date', fact: 'P01', which: 'end' }),
      text(', the modelled portfolio value moved from ', ', nilai portofolio termodel bergerak dari ', '，模拟组合价值从 '),
      slot({ kind: 'portfolio_value', fact: 'P01', which: 'start' }),
      text(' to ', ' menjadi ', ' 变为 '),
      slot({ kind: 'portfolio_value', fact: 'P01', which: 'end' }),
      text(' across ', ' selama ', '，跨 '),
      slot({ kind: 'portfolio_sessions', fact: 'P01' }),
      text(' common trading sessions, a change of ', ' sesi perdagangan bersama, perubahan ', ' 个共同交易日，变动 '),
      slot({ kind: 'portfolio_percent', fact: 'P01', focus: 'portfolio' }),
      text('.', '.', '。'),
    ],
  },
  'CL-PORT-BENCH': {
    short: [
      text('Benchmark change on the shared baseline.', 'Perubahan benchmark pada garis dasar bersama.', '共同基线上的基准变动。'),
    ],
    explained: [
      text('Over the same dates, the ', 'Pada tanggal yang sama, benchmark harga ', '在相同日期，'),
      slot({ kind: 'portfolio_symbol', fact: 'P01', focus: 'benchmark' }),
      text(' price benchmark moved ', ' bergerak ', ' 价格基准变动 '),
      slot({ kind: 'portfolio_percent', fact: 'P01', focus: 'benchmark' }),
      text('.', '.', '。'),
    ],
  },
  'CL-PORT-CONTRIB': {
    short: [
      text('Largest contribution to the modelled change.', 'Kontribusi terbesar terhadap perubahan termodel.', '对模拟变动贡献最大的持仓。'),
    ],
    explained: [
      text('Contributed the largest share of the modelled change: ', 'Menyumbang bagian terbesar dari perubahan termodel: ', '对模拟变动的贡献最大：'),
      slot({ kind: 'portfolio_symbol', fact: 'P02' }),
      text(' moved from ', ' bergerak dari ', ' 从 '),
      slot({ kind: 'portfolio_price', fact: 'P02', which: 'start' }),
      text(' to ', ' menjadi ', ' 变为 '),
      slot({ kind: 'portfolio_price', fact: 'P02', which: 'end' }),
      text(' on ', ' pada ', '，按 '),
      slot({ kind: 'portfolio_quantity', fact: 'P02' }),
      text(' shares, or ', ' lembar saham, atau ', ' 股计算，即占总变动的 '),
      slot({ kind: 'portfolio_contribution', fact: 'P02' }),
      text(
        ' percentage points of the total change.',
        ' poin persentase dari total perubahan.',
        ' 个百分点。',
      ),
    ],
  },
  'CL-PORT-ALLOC': {
    short: [
      text('Largest modelled allocation weight.', 'Bobot alokasi termodel terbesar.', '最大的模拟配置权重。'),
    ],
    explained: [
      text('Carries the largest modelled weight: ', 'Membawa bobot termodel terbesar: ', '占模拟组合价值最大：'),
      slot({ kind: 'portfolio_symbol', fact: 'P03' }),
      text(' is about ', ' adalah sekitar ', ' 约为 '),
      slot({ kind: 'portfolio_weight', fact: 'P03' }),
      text(' of the modelled portfolio value on ', ' dari nilai portofolio termodel pada ', '，日期 '),
      slot({ kind: 'fact_date', fact: 'P03', which: 'end' }),
      text(', from ', ', dari ', '，持有 '),
      slot({ kind: 'portfolio_quantity', fact: 'P03' }),
      text(' shares at ', ' lembar saham pada ', ' 股，价格 '),
      slot({ kind: 'portfolio_price', fact: 'P03', which: 'end' }),
      text('.', '.', '。'),
    ],
  },
  'CL-PORT-BREAKDOWN': {
    short: [
      text('All holdings with their own numbers.', 'Semua holding dengan angkanya sendiri.', '全部持仓及各自数字。'),
    ],
    explained: [
      text(
        'Lists all ',
        'Mencantumkan seluruh ',
        '列出全部 ',
      ),
      slot({ kind: 'portfolio_holdings_count', fact: 'P05' }),
      text(
        ' owned holdings with the quantity, both closing prices, values, weight and contribution of each, against the portfolio totals those shares divide by.',
        ' holding yang dimiliki dengan kuantitas, kedua harga penutupan, nilai, bobot, dan kontribusi masing-masing, terhadap total portofolio yang menjadi pembaginya.',
        ' 只自有持仓各自的数量、两个收盘价、市值、权重与贡献，以及作为分母的组合总值。',
      ),
    ],
  },
  'CL-PORT-WEIGHTS': {
    short: [text('Dated weight history.', 'Riwayat bobot bertanggal.', '按日期的权重历史。')],
    explained: [
      text(
        'Gives the weight of every holding on all ',
        'Menyajikan bobot setiap holding pada seluruh ',
        '给出每只持仓在全部 ',
      ),
      slot({ kind: 'portfolio_weight_dates', fact: 'P06' }),
      text(' consumed dates, from ', ' tanggal yang dipakai, dari ', ' 个所用日期上的权重，自 '),
      slot({ kind: 'fact_date', fact: 'P06', which: 'start' }),
      text(' to ', ' sampai ', ' 至 '),
      slot({ kind: 'fact_date', fact: 'P06', which: 'end' }),
      text(
        '. Weights on one date sum to the whole portfolio.',
        '. Bobot pada satu tanggal berjumlah seluruh portofolio.',
        '。同一日期的权重合计为整个组合。',
      ),
    ],
  },
};

export interface CuratedQuestion {
  text: BilingualText;
  claim_ids: readonly string[];
  follow_up_ids: readonly string[];
}

export const CURATED_QUESTIONS: Record<string, CuratedQuestion> = {
  'Q-WINDOW-NET': {
    text: {
      en: 'Who was buying and selling in the window?',
      id: 'Siapa yang membeli dan menjual dalam jendela?',
      zh: '窗口内谁在买入和卖出？',
    },
    claim_ids: ['CL-OBS-C05', 'CL-OBS-C04', 'CL-OBS-C06', 'CL-OBS-C08', 'CL-OBS-C09'],
    follow_up_ids: ['Q-STREAK', 'Q-LABELS'],
  },
  'Q-STREAK': {
    text: {
      en: 'Did institutional brokers keep buying?',
      id: 'Apakah broker institusional terus membeli?',
      zh: '机构券商是否持续买入？',
    },
    claim_ids: ['CL-OBS-C12', 'CL-OBS-C13', 'CL-SUP-INST-LED', 'CL-CON-INST-LED'],
    follow_up_ids: ['Q-WINDOW-NET', 'Q-LABELS'],
  },
  'Q-LABELS': {
    text: {
      en: 'How are brokers grouped?',
      id: 'Bagaimana broker dikelompokkan?',
      zh: '券商是如何分组的？',
    },
    claim_ids: ['CL-UNK-C24', 'CL-INT-C18'],
    follow_up_ids: ['Q-WINDOW-NET'],
  },
  'Q-THESIS-INST': {
    text: {
      en: 'Were institutional brokers net buyers over this window?',
      id: 'Apakah broker institusional menjadi pembeli bersih di jendela ini?',
      zh: '机构券商在本窗口内是否为净买入方？',
    },
    claim_ids: ['CL-SUP-INST-LED', 'CL-CON-INST-LED', 'CL-OBS-C05', 'CL-UNK-C24'],
    follow_up_ids: ['Q-THESIS-HP', 'Q-THESIS-PRICE'],
  },
  'Q-THESIS-HP': {
    text: {
      en: 'HP is smart money',
      id: 'HP adalah smart money',
      zh: 'HP 是聪明的资金',
    },
    claim_ids: ['CL-SUP-HP-BUYER', 'CL-CON-HP-SELLER', 'CL-OBS-C08', 'CL-OBS-C09', 'CL-UNK-HP-INTENT'],
    follow_up_ids: ['Q-THESIS-INST', 'Q-THESIS-PRICE'],
  },
  'Q-THESIS-PRICE': {
    text: {
      en: 'The price rise proves the business improved',
      id: 'Kenaikan harga membuktikan bisnis membaik',
      zh: '价格上涨证明业务改善',
    },
    claim_ids: ['CL-SUP-PRICE-RISE', 'CL-CON-PRICE-RISE', 'CL-INT-C11', 'CL-UNK-BUSINESS-PROOF'],
    follow_up_ids: ['Q-THESIS-INST', 'Q-THESIS-HP'],
  },
};
