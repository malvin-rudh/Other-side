import type { CSSProperties } from 'react';
import type { BrokerGroup } from '../data/schemas';

// One palette for broker groups on the stock page, in the product's own
// colours: brand orange, dark navy, light grey and a dashed outline for
// Unclassified. It avoids the green and red used for buy and sell signs, so a
// colour never reads as a direction.
export const GROUP_COLOURS: Record<BrokerGroup, string> = {
  app_facing: '#F58220',
  institution_facing: '#0B1F3A',
  other_mixed: '#B8C2D1',
  unknown: '#E8EDF3',
};

export const GROUP_ORDER: readonly BrokerGroup[] = ['app_facing', 'institution_facing', 'other_mixed', 'unknown'];

export const GROUP_LABEL_KEY: Record<
  BrokerGroup,
  'stock.groupApp' | 'stock.groupInstitution' | 'stock.groupOther' | 'stock.groupUnknown'
> = {
  app_facing: 'stock.groupApp',
  institution_facing: 'stock.groupInstitution',
  other_mixed: 'stock.groupOther',
  unknown: 'stock.groupUnknown',
};

export function groupColour(group: BrokerGroup | 'residual'): string {
  return group === 'residual' ? GROUP_COLOURS.unknown : GROUP_COLOURS[group];
}

// A small round dot in the group colour; Unclassified is a dashed grey ring.
export function groupDotStyle(group: BrokerGroup | 'residual', size = 10): CSSProperties {
  const unclassified = group === 'unknown' || group === 'residual';
  return {
    width: size,
    height: size,
    borderRadius: 9999,
    flexShrink: 0,
    display: 'inline-block',
    background: unclassified ? '#F1F5F9' : groupColour(group),
    border: unclassified ? '1.5px dashed #94A3B8' : 'none',
  };
}

// Line colours for the chosen brokers: muted teal, deep amber and slate, clear
// of the group palette (orange, navy, light grey) and firm enough to read.
export const BROKER_LINE_COLOURS = ['#0F766E', '#B4530A', '#475569'] as const;
