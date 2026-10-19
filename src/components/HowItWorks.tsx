import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { methodCopy } from '../i18n/methodCopy';
import type { Locale } from '../engine/context';

// The "How it works" part of the Research method page: the path from data to
// screen, the three layers (the product's main signal), the broker types, the
// replay rule and the three rules.

const BROKER_STYLES = [
  'border-brand/40 bg-brand/10 text-brandDeep',
  'border-ink bg-ink text-white',
  'border-lineStrong bg-line text-ink',
  'border-dashed border-mutedSoft bg-transparent text-muted',
];

function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-brand ${className}`}
    >
      <path d="M4 12h15M13 6l6 6-6 6" />
    </svg>
  );
}

export function HowItWorksFlow({ locale }: { locale: Locale }) {
  const c = methodCopy[locale];
  return (
    <section aria-label={c.flowTitle} className="card card-pad">
      <ol className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-stretch lg:gap-1">
        {c.flow.map((step, index) => (
          <li key={step.title} className="flex flex-col items-center gap-2 lg:flex-1 lg:flex-row lg:gap-1">
            <div className="card-inset w-full min-w-0 flex-1 p-3 lg:h-full">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
                <Icon name={step.icon} className="h-4 w-4" />
              </span>
              <h4 className="mt-2 text-sm font-semibold tracking-tight text-ink">{step.title}</h4>
              <p className="mt-0.5 text-xs leading-snug text-muted">{step.line}</p>
            </div>
            {index < c.flow.length - 1 && <Arrow className="h-5 w-5 rotate-90 lg:rotate-0" />}
          </li>
        ))}
      </ol>
    </section>
  );
}

export interface LayerCard {
  id: string;
  label: string;
  question: string;
}

// The three layers in one row of equal cards joined by clear arrows, followed
// by whatever detail the page passes in (the per-layer tabs and how to read
// the result).
export function ThreeLayers({
  title,
  line,
  layers,
  children,
}: {
  title: string;
  line: string;
  layers: readonly LayerCard[];
  children?: ReactNode;
}) {
  return (
    <section aria-labelledby="research-framework" className="rounded-2xl border border-brand/30 bg-brand/5 p-4 sm:p-6">
      <h3 id="research-framework" className="text-xl font-semibold tracking-tight text-ink">
        {title}
      </h3>
      <p className="mt-1 text-sm font-medium text-brandDeep">{line}</p>
      <ol className="mt-4 grid items-stretch gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-3">
        {layers.map((layer, index) => (
          <LayerItem key={layer.id} layer={layer} index={index} last={index === layers.length - 1} />
        ))}
      </ol>
      {children}
    </section>
  );
}

function LayerItem({ layer, index, last }: { layer: LayerCard; index: number; last: boolean }) {
  return (
    <>
      <li className="card flex h-full flex-col p-4 sm:p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-lg font-semibold text-white">
          {index + 1}
        </span>
        <h4 className="mt-3 text-lg font-semibold tracking-tight text-ink">{layer.label.replace(/^\d+\.\s*/, '')}</h4>
        <p className="mt-1 text-sm leading-relaxed text-muted">{layer.question}</p>
      </li>
      {!last && (
        <li aria-hidden="true" className="flex items-center justify-center py-1 lg:py-0">
          <Arrow className="h-8 w-8 rotate-90 lg:rotate-0" />
        </li>
      )}
    </>
  );
}

export function BrokersAndReplay({ locale }: { locale: Locale }) {
  const c = methodCopy[locale];
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-2">
      <section aria-labelledby="method-brokers" className="card card-pad">
        <h3 id="method-brokers" className="text-base font-semibold tracking-tight text-ink">
          {c.brokersTitle}
        </h3>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {c.brokers.map((b, i) => (
            <li key={b.title} className={`min-w-0 rounded-lg border p-2.5 ${BROKER_STYLES[i]}`}>
              <p className="text-xs font-semibold leading-snug">{b.title}</p>
              <p className="mt-1 text-[11px] font-medium tabular-nums opacity-80">{b.codes}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">{c.brokersNote}</p>
      </section>

      <section aria-labelledby="method-replay" className="card card-pad">
        <h3 id="method-replay" className="text-base font-semibold tracking-tight text-ink">
          {c.replayTitle}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.replayNote}</p>
        {/* Three dots on a line: the trading day, the next morning when its
            data appears, and later days that stay hidden. */}
        <ol className="relative mt-4 grid grid-cols-3 gap-2 text-center">
          <span aria-hidden="true" className="absolute left-[16%] right-[16%] top-[7px] h-px bg-line" />
          {[
            { label: c.replayDay, dot: 'border-ink bg-ink', text: 'text-ink' },
            { label: c.replayMorning, dot: 'border-brand bg-brand', text: 'font-semibold text-brandDeep' },
            { label: c.replayLater, dot: 'border-dashed border-mutedSoft bg-surface', text: 'text-mutedSoft' },
          ].map((step) => (
            <li key={step.label} className="relative flex flex-col items-center gap-2">
              <span aria-hidden="true" className={`h-3.5 w-3.5 rounded-full border-2 ${step.dot}`} />
              <span className={`text-xs leading-snug ${step.text}`}>{step.label}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function MethodRules({ locale }: { locale: Locale }) {
  const c = methodCopy[locale];
  return (
    <ul aria-label={c.rulesTitle} className="grid gap-3 sm:grid-cols-3">
      {c.rules.map((rule) => (
        <li key={rule.text} className="card flex items-center gap-3 p-3 sm:p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brandDeep">
            <Icon name={rule.icon} className="h-5 w-5" />
          </span>
          <p className="min-w-0 text-sm font-medium leading-snug text-ink">{rule.text}</p>
        </li>
      ))}
    </ul>
  );
}
