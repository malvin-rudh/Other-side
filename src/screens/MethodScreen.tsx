import { Icon } from '../components/Icon';
import { methodCopy } from '../i18n/methodCopy';
import { useTranslation } from '../i18n';

const BROKER_STYLES = [
  'border-brand/40 bg-brand/10 text-brandDeep',
  'border-ink bg-ink text-white',
  'border-lineStrong bg-line text-ink',
  'border-dashed border-mutedSoft bg-transparent text-muted',
];

function Arrow({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-5 w-5 shrink-0 text-brand ${className}`}
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function MethodScreen() {
  const { locale } = useTranslation();
  const c = methodCopy[locale];

  return (
    <section aria-labelledby="method-title" className="page-stack">
      <header className="page-hero">
        <p className="eyebrow">{c.eyebrow}</p>
        <h1 id="method-title" className="mt-1 text-2xl font-semibold tracking-tight lg:text-[2rem] lg:leading-tight">
          {c.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">{c.intro}</p>
      </header>

      <section aria-labelledby="method-flow" className="card card-pad border-l-4 border-l-brand">
        <h2 id="method-flow" className="sr-only">
          {c.flowTitle}
        </h2>
        <ol className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-stretch lg:gap-1">
          {c.flow.map((step, index) => (
            <li key={step.title} className="flex flex-col items-center gap-2 lg:flex-1 lg:flex-row lg:gap-1">
              <div className="card-inset w-full min-w-0 flex-1 p-3 lg:h-full">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-white">
                  <Icon name={step.icon} className="h-4 w-4" />
                </span>
                <h3 className="mt-2 text-sm font-semibold tracking-tight text-ink">{step.title}</h3>
                <p className="mt-0.5 text-xs leading-snug text-muted">{step.line}</p>
              </div>
              {index < c.flow.length - 1 && <Arrow className="rotate-90 lg:rotate-0" />}
            </li>
          ))}
        </ol>
      </section>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <section aria-labelledby="method-brokers" className="card card-pad">
          <h2 id="method-brokers" className="text-base font-semibold tracking-tight text-ink">
            {c.brokersTitle}
          </h2>
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
          <h2 id="method-replay" className="text-base font-semibold tracking-tight text-ink">
            {c.replayTitle}
          </h2>
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

      <section aria-labelledby="method-rules" className="space-y-2">
        <h2 id="method-rules" className="sr-only">
          {c.rulesTitle}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {c.rules.map((rule) => (
            <li key={rule.text} className="card flex items-center gap-3 p-3 sm:p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brandDeep">
                <Icon name={rule.icon} className="h-5 w-5" />
              </span>
              <p className="min-w-0 text-sm font-medium leading-snug text-ink">{rule.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-muted">{c.footnote}</p>
    </section>
  );
}
