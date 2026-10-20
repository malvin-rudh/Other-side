import { useEffect, useMemo, useRef, useState } from 'react';

// A small live-radar animation. A sweep turns once every SWEEP_SECONDS; blips
// for the stocks on the radar light up as it passes and fade. Every
// SWAP_MS one blip is swapped for another stock, so stocks keep appearing.
// Position is deterministic: distance from the centre follows the score
// (stronger is nearer), the angle is spread by list position. Plain React with
// CSS keyframes; reduced motion shows a still radar with the first blips lit.

export interface RadarSweepItem {
  ticker: string;
  score: number;
  label: string;
  // Used only for the clickable name.
  accumulating: boolean;
}

interface RadarSweepProps {
  items: RadarSweepItem[];
  ariaLabel: string;
  blipLabel: (item: RadarSweepItem) => string;
  onOpen: (ticker: string) => void;
}

const SWEEP_SECONDS = 6;
const SWAP_MS = 2500;
const VISIBLE = 4;
const GOLDEN_ANGLE = 137.508;
const SCORE_FLOOR = 30;
const SCORE_SPAN = 70;

// A radar scope drawn straight on the page: the field is the page background,
// rings, grid and ticks are dark navy, the sweep and blips are brand orange.
const FIELD = '#F5F7FA';
const LINE = '#0B1F3A';
const ORANGE = '#F58220';
const LABEL = '#0B1220';
// The scope disc inside the square, in viewBox units (220 wide).
const VIEW = 220;
const CENTER = 110;
const DISC = 80;
// Disc radius and inset as a share of the square, for placing HTML on top.
const DISC_PCT = (DISC / VIEW) * 100;
const INSET_PCT = ((CENTER - DISC) / VIEW) * 100;

interface Slot {
  index: number;
  gen: number;
  delay: number;
}

// Blip angle in degrees clockwise from the top, and distance as a 0..1 share
// of the radius. Both depend only on the list position and the score.
function blipAngle(index: number): number {
  return (index * GOLDEN_ANGLE + 20) % 360;
}
function blipDistance(score: number): number {
  const strength = Math.min(1, Math.max(0, (score - SCORE_FLOOR) / SCORE_SPAN));
  return 0.2 + 0.65 * (1 - strength);
}

// Seconds until the sweep next reaches the blip's angle.
function delayFor(angle: number, phaseSeconds: number): number {
  const at = (angle / 360) * SWEEP_SECONDS;
  return (at - phaseSeconds + SWEEP_SECONDS) % SWEEP_SECONDS;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const CSS = `
.rsw-sweep { animation: rsw-turn ${SWEEP_SECONDS}s linear infinite; }
.rsw-blip-core { opacity: 0; animation: rsw-flash ${SWEEP_SECONDS}s linear infinite; }
.rsw-blip:focus-visible { outline: 2px solid ${ORANGE}; outline-offset: 1px; border-radius: 9999px; }
.rsw-blip:focus-visible .rsw-blip-core, .rsw-blip:hover .rsw-blip-core { opacity: 1; animation: none; }
@keyframes rsw-turn { to { transform: rotate(360deg); } }
@keyframes rsw-flash {
  0% { opacity: 1; transform: scale(1.5); }
  8% { transform: scale(1); }
  100% { opacity: 0.12; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .rsw-sweep { animation: none; transform: rotate(40deg); }
  .rsw-blip-core { animation: none; opacity: 1; }
}
`;

export function RadarSweep({ items, ariaLabel, blipLabel, onOpen }: RadarSweepProps) {
  const reduced = usePrefersReducedMotion();
  const count = items.length;
  const shown = Math.min(VISIBLE, count);
  const startedAt = useRef<number>(typeof performance !== 'undefined' ? performance.now() : 0);

  const [slots, setSlots] = useState<Slot[]>(() =>
    Array.from({ length: shown }, (_, i) => ({ index: i, gen: 0, delay: delayFor(blipAngle(i), 0) })),
  );
  const tickRef = useRef(0);

  // Keep the slots valid when the list changes.
  useEffect(() => {
    setSlots(Array.from({ length: shown }, (_, i) => ({ index: i, gen: 0, delay: delayFor(blipAngle(i), 0) })));
    tickRef.current = 0;
  }, [count, shown]);

  // Swap one slot for the next stock that is not already on screen.
  useEffect(() => {
    if (reduced || count <= VISIBLE) return;
    const timer = window.setInterval(() => {
      const phase = (((performance.now() - startedAt.current) / 1000) % SWEEP_SECONDS + SWEEP_SECONDS) % SWEEP_SECONDS;
      const slot = tickRef.current;
      tickRef.current += 1;
      setSlots((current) => {
        const taken = new Set(current.map((s) => s.index));
        let next = (Math.max(...current.map((s) => s.index)) + 1) % count;
        while (taken.has(next)) next = (next + 1) % count;
        const at = slot % current.length;
        const copy = current.slice();
        copy[at] = { index: next, gen: current[at]!.gen + 1, delay: delayFor(blipAngle(next), phase) };
        return copy;
      });
    }, SWAP_MS);
    return () => window.clearInterval(timer);
  }, [reduced, count]);

  const blips = useMemo(
    () =>
      slots.map((slot) => {
        const item = items[slot.index];
        if (item === undefined) return null;
        const angle = (blipAngle(slot.index) * Math.PI) / 180;
        const distance = blipDistance(item.score);
        const left = 50 + distance * DISC_PCT * Math.sin(angle);
        const top = 50 - distance * DISC_PCT * Math.cos(angle);
        return { slot, item, left, top };
      }),
    [slots, items],
  );

  return (
    <figure className="m-0" data-testid="radar-sweep">
      <style>{CSS}</style>
      <div
        className="relative mx-auto aspect-square w-full max-w-[380px] overflow-hidden rounded-2xl"
        style={{ background: FIELD }}
        role="group"
        aria-label={ariaLabel}
      >
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
          <defs>
            <clipPath id="rsw-disc">
              <circle cx={CENTER} cy={CENTER} r={DISC} />
            </clipPath>
          </defs>
          {/* Fine grid inside the scope. */}
          <g clipPath="url(#rsw-disc)" stroke={LINE} strokeOpacity="0.12" strokeWidth="0.5">
            {Array.from({ length: 17 }, (_, i) => CENTER - DISC + i * 10).map((v) => (
              <g key={v}>
                <line x1={v} y1={CENTER - DISC} x2={v} y2={CENTER + DISC} />
                <line x1={CENTER - DISC} y1={v} x2={CENTER + DISC} y2={v} />
              </g>
            ))}
          </g>
          {[DISC, DISC * 0.75, DISC * 0.5, DISC * 0.25].map((r, i) => (
            <circle key={r} cx={CENTER} cy={CENTER} r={r} fill="none" stroke={LINE} strokeOpacity={i === 0 ? 0.9 : 0.55} strokeWidth={i === 0 ? 1.1 : 0.8} />
          ))}
          <line x1={CENTER} y1={CENTER - DISC} x2={CENTER} y2={CENTER + DISC} stroke={LINE} strokeOpacity="0.55" strokeWidth="0.8" />
          <line x1={CENTER - DISC} y1={CENTER} x2={CENTER + DISC} y2={CENTER} stroke={LINE} strokeOpacity="0.55" strokeWidth="0.8" />
          {/* Tick marks around the rim, longer at the four main points. */}
          {Array.from({ length: 48 }, (_, i) => i * 7.5).map((deg) => {
            const major = deg % 90 === 0;
            const rad = (deg * Math.PI) / 180;
            const r1 = DISC + 7;
            const r2 = DISC + (major ? 15 : 11);
            return (
              <line
                key={deg}
                x1={CENTER + r1 * Math.sin(rad)}
                y1={CENTER - r1 * Math.cos(rad)}
                x2={CENTER + r2 * Math.sin(rad)}
                y2={CENTER - r2 * Math.cos(rad)}
                stroke={LINE}
                strokeOpacity={major ? 0.95 : 0.6}
                strokeWidth={major ? 2.2 : 1}
                strokeLinecap="round"
              />
            );
          })}
          <circle cx={CENTER} cy={CENTER} r="1.8" fill={ORANGE} />
        </svg>

        {/* The sweep: a bright leading edge with a fading orange wedge behind it. */}
        <div
          className="pointer-events-none absolute overflow-hidden rounded-full"
          style={{ inset: `${INSET_PCT}%` }}
          aria-hidden="true"
        >
          <div
            className="rsw-sweep absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, rgba(245,130,32,0) 0deg, rgba(245,130,32,0) 290deg, rgba(245,130,32,0.16) 330deg, rgba(245,130,32,0.65) 360deg)',
            }}
          >
            <div className="absolute left-1/2 top-0 h-1/2 w-[1.5px] -translate-x-1/2" style={{ background: ORANGE }} />
          </div>
        </div>

        {blips.map((blip) =>
          blip === null ? null : (
            <button
              key={`${blip.slot.index}-${blip.slot.gen}`}
              type="button"
              className="rsw-blip absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center border-0 bg-transparent p-0"
              style={{ left: `${blip.left}%`, top: `${blip.top}%` }}
              aria-label={blipLabel(blip.item)}
              onClick={() => onOpen(blip.item.ticker)}
              data-testid={`radar-blip-${blip.item.ticker}`}
            >
              <span
                className="rsw-blip-core flex items-center"
                style={{ animationDelay: `${blip.slot.delay.toFixed(2)}s` }}
                aria-hidden="true"
              >
                <span
                  className="block h-3 w-3 rounded-full"
                  style={{
                    background: blip.item.accumulating ? ORANGE : LINE,
                    boxShadow: blip.item.accumulating
                      ? '0 0 6px 2px rgba(245,130,32,0.8), 0 0 14px 4px rgba(245,130,32,0.3)'
                      : '0 0 6px 2px rgba(11,31,58,0.35)',
                  }}
                />
                <span
                  className="pointer-events-none absolute whitespace-nowrap text-[10px] font-semibold tracking-wide"
                  style={{ color: LABEL, ...(blip.left > 58 ? { right: '60%', paddingRight: 4 } : { left: '60%', paddingLeft: 4 }) }}
                >
                  {blip.item.ticker}
                </span>
              </span>
            </button>
          ),
        )}
      </div>
    </figure>
  );
}
