import { EvaluatorSettings } from '../components/EvaluatorSettings';
import { Icon } from '../components/Icon';
import { useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';

export function GuidedTourScreen() {
  const { t } = useTranslation();
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
        <p className="eyebrow">{t('nav.tour')}</p>
        <h1 id="tour-title" className="mt-1 text-2xl font-semibold tracking-tight lg:text-[2rem] lg:leading-tight">
          {t('tour.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{t('tour.intro')}</p>
        <p className="mt-2 text-xs text-mutedSoft">{t('explore.tourHint')}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={startTour} className="btn btn-primary">
            <Icon name="tour" className="h-3.5 w-3.5" />
            {demoMode ? t('explore.restartTour') : t('tour.start')}
          </button>
          {demoMode ? <span className="chip chip-line">{t('tour.running')}</span> : null}
        </div>
      </header>

      <section aria-labelledby="tour-evaluator" className="card card-pad">
        <h2 id="tour-evaluator" className="text-base font-semibold tracking-tight">
          {t('thesis.evaluatorSettings')}
        </h2>
        <p className="note mt-1">{t('thesis.evaluatorHint')}</p>
        <div className="mt-3">
          <EvaluatorSettings />
        </div>
      </section>
    </section>
  );
}
