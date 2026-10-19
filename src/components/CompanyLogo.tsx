import type { ReactNode } from 'react';

// The company's logo on the analysis page. SINI uses its real logo (a public
// image in /logos). The sample stocks are fictional companies, so each has an
// invented mark drawn here that hints at its business. Anything else falls
// back to a neutral monogram badge whose colour comes from the ticker.

const IMAGE_LOGOS: Record<string, string> = {
  SINI: '/logos/SINI.png',
};

// Fictional marks on a 48 x 48 grid: a background colour and the white shapes.
const W = '#FFFFFF';
const ORANGE = '#F58220';
const FICTIONAL: Record<string, { bg: string; mark: ReactNode }> = {
  // Sampel Prima Abadi: a peak with a rising sun.
  SMPA: {
    bg: '#0B1F3A',
    mark: (
      <>
        <circle cx="31" cy="17" r="4.5" fill={ORANGE} />
        <path d="M9 36 21 15l7 12 4-6 7 15z" fill={W} />
      </>
    ),
  },
  // Sampel Buana Lestari: a globe with a leaf.
  SMPB: {
    bg: '#166534',
    mark: (
      <>
        <circle cx="24" cy="24" r="13" fill="none" stroke={W} strokeWidth="3" />
        <path d="M24 11c-6 6-6 20 0 26M11 24h26" fill="none" stroke={W} strokeWidth="2" />
        <path d="M27 30c0-8 5-13 12-13-1 8-5 13-12 13z" fill="#A3E635" />
      </>
    ),
  },
  // Sampel Cipta Mineral: a cut stone.
  SMPC: {
    bg: '#334155',
    mark: (
      <>
        <path d="M14 18 20 11h8l6 7-10 19z" fill={W} />
        <path d="M14 18h20M20 11l4 7 4-7M24 18v19" fill="none" stroke="#334155" strokeWidth="1.6" />
      </>
    ),
  },
  // Sampel Dharma Konsumen: a shopping bag.
  SMPD: {
    bg: '#7F1D1D',
    mark: (
      <>
        <path d="M13 19h22l-2 18H15z" fill={W} />
        <path d="M19 21v-5a5 5 0 0 1 10 0v5" fill="none" stroke={W} strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="24" cy="28" r="2.6" fill="#7F1D1D" />
      </>
    ),
  },
  // Sampel Energi Nusantara: a lightning bolt.
  SMPE: {
    bg: '#92400E',
    mark: <path d="M27 9 14 27h9l-3 12 14-19h-9z" fill={W} />,
  },
  // Sample Harbour Gate Logistics: a gate over water.
  SHKA: {
    bg: '#1E3A8A',
    mark: (
      <>
        <path d="M12 30V20a12 12 0 0 1 24 0v10h-5V20a7 7 0 0 0-14 0v10z" fill={W} />
        <path d="M10 35c3-2.5 6-2.5 9 0s6 2.5 9 0 6-2.5 9 0" fill="none" stroke="#93C5FD" strokeWidth="2.4" strokeLinecap="round" />
      </>
    ),
  },
  // Sample Pearl Coast Biotech: a pearl with a double helix.
  SHKB: {
    bg: '#0F766E',
    mark: (
      <>
        <circle cx="24" cy="24" r="13" fill={W} />
        <path d="M19 14c10 6-10 14 0 20M29 14c-10 6 10 14 0 20" fill="none" stroke="#0F766E" strokeWidth="2.2" strokeLinecap="round" />
      </>
    ),
  },
  // Sample Hangang Battery Materials: a battery cell with a charge mark.
  SKRA: {
    bg: '#14532D',
    mark: (
      <>
        <rect x="15" y="13" width="18" height="25" rx="3" fill="none" stroke={W} strokeWidth="2.6" />
        <rect x="20" y="9" width="8" height="4" rx="1" fill={W} />
        <path d="M25 17 19 27h5l-1 7 6-10h-5z" fill="#4ADE80" />
      </>
    ),
  },
  // Sample Seorak Semiconductor: a chip with a mountain on it.
  SKRB: {
    bg: '#3B0764',
    mark: (
      <>
        <rect x="14" y="14" width="20" height="20" rx="2.5" fill={W} />
        <path d="M17 31 22 22l3 4 2-3 4 8z" fill="#3B0764" />
        <path d="M18 14v-4M24 14v-4M30 14v-4M18 38v-4M24 38v-4M30 38v-4M14 18h-4M14 24h-4M14 30h-4M38 18h-4M38 24h-4M38 30h-4" stroke={W} strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },
  // Sample Yangtze Robotics: a jointed robot arm.
  SCNA: {
    bg: '#1F2937',
    mark: (
      <>
        <path d="M13 37h14M17 37l3-11 11-7 5 4" fill="none" stroke={W} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20" cy="26" r="3" fill={ORANGE} />
        <circle cx="31" cy="19" r="3" fill={ORANGE} />
      </>
    ),
  },
  // Sample Pearl River Pharma: a capsule.
  SCNB: {
    bg: '#0E7490',
    mark: (
      <g transform="rotate(-40 24 24)">
        <rect x="10" y="18" width="28" height="12" rx="6" fill={W} />
        <path d="M24 18h8a6 6 0 0 1 0 12h-8z" fill="#67E8F9" />
      </g>
    ),
  },
};

const SKIP = new Set(['pt', 'tbk', 'the', 'co', 'ltd', 'inc', 'corp', 'limited', 'holdings', 'group']);

function initials(name: string, ticker: string): string {
  const words = name
    .replace(/\(.*?\)|（.*?）/g, ' ')
    .split(/[\s.,-]+/)
    .filter((word) => word.length > 0 && !SKIP.has(word.toLowerCase()));
  const first = words[0]?.[0];
  const second = words[1]?.[0];
  if (first && second) return `${first}${second}`.toUpperCase();
  return ticker.slice(0, 2).toUpperCase();
}

// Hues 190 to 290 only: blue, teal and violet, in line with the house palette.
function hueOf(ticker: string): number {
  let hash = 0;
  for (const char of ticker) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 190 + (hash % 100);
}

export function CompanyLogo({ ticker, name, size = 44 }: { ticker: string; name: string; size?: number }) {
  const radius = Math.round(size * 0.22);
  const image = IMAGE_LOGOS[ticker];
  if (image !== undefined) {
    return (
      <img
        src={image}
        alt=""
        aria-hidden="true"
        data-testid="company-logo"
        width={size}
        height={size}
        className="shrink-0 select-none object-cover"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  const fictional = FICTIONAL[ticker];
  if (fictional !== undefined) {
    return (
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        data-testid="company-logo"
        className="shrink-0"
      >
        <rect width="48" height="48" rx="10.5" fill={fictional.bg} />
        {fictional.mark}
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-testid="company-logo"
      className="inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-tight text-white"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.26),
        background: `hsl(${hueOf(ticker)} 45% 36%)`,
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initials(name, ticker)}
    </span>
  );
}
