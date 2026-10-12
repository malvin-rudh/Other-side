export function tickLabel(value: number): string {
  if (value === 0) return '0';
  const rounded = Math.round(value / 100) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text}k`;
}

// Ticks are deduplicated by the label the axis actually prints, so two values
// that would render identically cannot both draw a gridline. The default is the
// broker thousands formatter every existing lot and value axis uses; a chart
// whose axis prints something else passes its own formatter, because deduplicating
// percentage ticks through a thousands formatter collapses distinct values
// (20, 40, 60 and 80 all become "0k" or "0.1k") and silently drops half of them.
export function yAxisTicks(
  min: number,
  max: number,
  targetCount = 5,
  labelFor: (value: number) => string = tickLabel,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return [];
  if (max === min) return [min];
  const rawStep = (max - min) / targetCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= rawStep);
  if (step === undefined || step === 0) return [];
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  const seen = new Set<string>();
  const count = Math.floor((max - first) / step + 1e-9);
  for (let index = 0; index <= count; index += 1) {
    const value = first + index * step;
    const label = labelFor(value);
    if (seen.has(label)) continue;
    seen.add(label);
    ticks.push(value);
  }
  return ticks;
}

export function xTickLabels(labels: readonly string[], targetCount = 5): string[] {
  if (labels.length === 0) return [];
  if (labels.length <= targetCount) return [...labels];
  const indexes = new Set<number>([0, labels.length - 1]);
  const middleCount = targetCount - 2;
  for (let index = 1; index <= middleCount; index += 1) {
    indexes.add(Math.round((index * (labels.length - 1)) / (targetCount - 1)));
  }
  return [...indexes].sort((a, b) => a - b).map((index) => labels[index]).filter((label): label is string => Boolean(label));
}
