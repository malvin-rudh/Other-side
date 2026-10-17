import { Icon } from '../components/Icon';
import { useTranslation } from '../i18n';
import { tourCopy } from '../i18n/tourCopy';
import { useContextStore } from '../store/contextStore';

export function GuidedTourScreen() {
  const { locale } = useTranslation();
  const copy = tourCopy(locale);
  const demoMode = useContextStore((state) => state.demoMode);
  const setDemoMode = useContextStore((state) => state.setDemoMode);
  const setCoachStep = useContextStore((state) => state.setCoachStep);

  const startTour = () => {
    setDemoMode(true);
    setCoachStep(0);
  };

  return (
    <section aria-labelledby="tour-title" className="space-y-4">
      <header className="card card-pad">
        <p className="eyebrow">{copy.label}</p>
        <h1 id="tour-title" className="mt-1 text-2xl font-semibold tracking-tight lg:text-[2rem] lg:leading-tight">
          {copy.title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{copy.intro}</p>
        <p className="mt-2 text-xs text-mutedSoft">{copy.hint}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={startTour} className="btn btn-primary">
            <Icon name="tour" className="h-3.5 w-3.5" />
            {demoMode ? copy.restart : copy.start}
          </button>
          {demoMode ? <span className="chip chip-line">{copy.running}</span> : null}
        </div>
      </header>

      <section aria-labelledby="tour-covers" className="card card-pad">
        <h2 id="tour-covers" className="text-base font-semibold tracking-tight">
          {copy.coversTitle}
        </h2>
        <ol className="mt-3 space-y-3">
          {copy.steps.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white">
                {index + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-0.5 text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
