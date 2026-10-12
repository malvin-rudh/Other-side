import type { ReactNode } from 'react';

export type IconName =
  | 'brief'
  | 'stock'
  | 'stocks'
  | 'portfolio'
  | 'how'
  | 'advanced'
  | 'method'
  | 'import'
  | 'more'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'tour'
  | 'check'
  | 'thesis'
  | 'assumption'
  | 'expand'
  | 'close'
  | 'mail'
  | 'copy'
  | 'download'
  | 'calendar'
  | 'search'
  | 'plus'
  | 'trash'
  | 'globe';

// One 16px stroke grid for every icon in the product, so the rail, the launcher
// and the dialogs share a single visual weight. All icons are decorative; the
// control that carries them keeps its own accessible name.
const PATHS: Record<IconName, ReactNode> = {
  brief: (
    <>
      <path d="M3.5 2.5h6.2l2.8 2.8v8.2H3.5z" />
      <path d="M9.7 2.5v2.8h2.8" />
      <path d="M5.8 8.6h4.4M5.8 11h3" />
    </>
  ),
  stock: (
    <>
      <path d="M2.5 13.5h11" />
      <path d="M5 13.5V8.2M8 13.5V4.2M11 13.5V10" />
    </>
  ),
  method: (
    <>
      <path d="M3 4.5h10M3 8h10M3 11.5h6" />
    </>
  ),
  import: (
    <>
      <path d="M8 10.8V3.2M5.2 6 8 3.2 10.8 6" />
      <path d="M3 11v2h10v-2" />
    </>
  ),
  more: (
    <>
      <circle cx="3.4" cy="8" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.05" fill="currentColor" stroke="none" />
      <circle cx="12.6" cy="8" r="1.05" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="M5.6 3.8 12 8l-6.4 4.2z" />,
  pause: <path d="M6.2 4.2v7.6M9.8 4.2v7.6" />,
  prev: <path d="M9.8 3.6 5.4 8l4.4 4.4" />,
  next: <path d="M6.2 3.6 10.6 8l-4.4 4.4" />,
  tour: (
    <>
      <path d="M4.2 14V2.8" />
      <path d="M4.2 3.4h7.6l-1.7 2.5 1.7 2.5H4.2z" />
    </>
  ),
  check: <path d="M3.4 8.6 6.4 11.6 12.6 4.6" />,
  thesis: (
    <>
      <path d="M8 3.2v9.6M4.6 12.8h6.8M2.6 6.4h10.8" />
      <path d="M2.6 6.4 1.2 9.8h2.8zM13.4 6.4 12 9.8h2.8z" />
    </>
  ),
  assumption: (
    <>
      <path d="M2.8 5.4h10.4M2.8 10.6h10.4" />
      <path d="M6.2 3.4v4M10.4 8.6v4" />
    </>
  ),
  expand: <path d="M6.2 2.8H2.8v3.4M9.8 13.2h3.4V9.8M2.8 9.8v3.4h3.4M13.2 6.2V2.8H9.8" />,
  close: <path d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8" />,
  mail: (
    <>
      <path d="M2.5 4.5h11v7h-11z" />
      <path d="m2.9 5 5.1 3.8L13.1 5" />
    </>
  ),
  copy: (
    <>
      <path d="M5.8 5.8h6.9v6.9H5.8z" />
      <path d="M10.2 3.3H3.3v6.9" />
    </>
  ),
  download: <path d="M8 2.8v7.6M5 7.6 8 10.6l3-3M3.2 13.2h9.6" />,
  calendar: (
    <>
      <path d="M2.8 4.8h10.4v8.4H2.8z" />
      <path d="M2.8 7.6h10.4M5.6 2.8v3M10.4 2.8v3" />
    </>
  ),
  stocks: (
    <>
      <path d="M2.8 3.4h10.4M2.8 8h10.4M2.8 12.6h6.4" />
      <path d="M11.4 11.2 12.8 12.6l-1.4 1.4" />
    </>
  ),
  portfolio: (
    <>
      <path d="M2.4 5.6h11.2v7.2H2.4z" />
      <path d="M6.2 5.6V3.8h3.6v1.8M2.4 8.8h11.2" />
    </>
  ),
  how: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M8 7.2v3.6M8 5.2v.1" />
    </>
  ),
  advanced: (
    <>
      <path d="M2.8 5.4h10.4M2.8 10.6h10.4" />
      <circle cx="6" cy="5.4" r="1.5" />
      <circle cx="10.4" cy="10.6" r="1.5" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4.2" />
      <path d="m10.2 10.2 3 3" />
    </>
  ),
  plus: <path d="M8 3.4v9.2M3.4 8h9.2" />,
  trash: (
    <>
      <path d="M3.4 4.6h9.2M6.4 4.6V3.2h3.2v1.4" />
      <path d="M4.6 4.6 5.4 13h5.2l.8-8.4" />
    </>
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="5.4" />
      <path d="M2.6 8h10.8M8 2.6c1.8 2 1.8 8.8 0 10.8-1.8-2-1.8-8.8 0-10.8z" />
    </>
  ),
};

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
