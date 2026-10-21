import { useEffect, useState } from 'react';
import type { Locale } from '../../engine/context';
import { formatShortDate } from '../../i18n';
import { xTickLabels } from './axisTicks';

const NARROW_QUERY = '(max-width: 639px)';

function useNarrowScreen(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(NARROW_QUERY).matches : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(query.matches);
    onChange();
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

// The date ticks for a chart's x-axis. Wide screens keep five full dates
// ("14 Aug 2026"); on a phone five full dates overlap, so the axis prints four
// short ones ("14 Aug"). Points keep their full label, so tooltips still show
// the year.
export function useDateAxis(points: readonly { date: string; label: string }[], locale: Locale) {
  const narrow = useNarrowScreen();
  const labels = points.map((point) => point.label);
  if (!narrow) return { ticks: xTickLabels(labels), tickFormatter: undefined };
  const short = new Map(points.map((point) => [point.label, formatShortDate(point.date, locale)]));
  return {
    ticks: xTickLabels(labels, 4),
    tickFormatter: (value: string) => short.get(value) ?? value,
  };
}
