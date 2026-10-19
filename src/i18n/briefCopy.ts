import type { Locale } from '../engine/context';

// Text for the Brief's week strip and its calendar popup.
const COPY = {
  en: {
    weekLabel: 'Week of briefing mornings',
    prevWeek: 'Previous week',
    nextWeek: 'Next week',
    openCalendar: 'Open calendar',
    calendarTitle: 'Select a date',
    close: 'Close calendar',
    noBrief: 'No brief',
  },
  id: {
    weekLabel: 'Pekan pagi pembaruan',
    prevWeek: 'Pekan sebelumnya',
    nextWeek: 'Pekan berikutnya',
    openCalendar: 'Buka kalender',
    calendarTitle: 'Pilih tanggal',
    close: 'Tutup kalender',
    noBrief: 'Tidak ada pembaruan',
  },
  'zh-CN': {
    weekLabel: '简报日所在周',
    prevWeek: '上一周',
    nextWeek: '下一周',
    openCalendar: '打开日历',
    calendarTitle: '选择日期',
    close: '关闭日历',
    noBrief: '无简报',
  },
} as const;

export type BriefCopyKey = keyof (typeof COPY)['en'];

export function briefText(locale: Locale, key: BriefCopyKey): string {
  return COPY[locale][key];
}
