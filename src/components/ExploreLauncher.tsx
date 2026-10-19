import { useNavigate } from 'react-router-dom';
import { formatSessionDate, useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';
import { Icon, type IconName } from './Icon';

// The two pinned starting points the evaluator is walked through: the snapshot
// where the positive streak passes and the main-buyer streak does not, and the
// last captured session used for the thesis and assumption shortcuts.
const CLAIM_CHECK_SESSION = '2026-08-24';
const THESIS_SESSION = '2026-09-23';

interface ExploreLauncherProps {
  // Stock keeps a one-line launcher so the first screen stays on the story; the
  // full discovery cards live on Brief and Method.
  variant?: 'full' | 'compact';
}

export function ExploreLauncher({ variant = 'full' }: ExploreLauncherProps) {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const ticker = useContextStore((state) => state.ticker);
  const demoMode = useContextStore((state) => state.demoMode);
  const setDemoMode = useContextStore((state) => state.setDemoMode);
  const setCoachStep = useContextStore((state) => state.setCoachStep);
  const selectSession = useContextStore((state) => state.selectSession);
  const setScenario = useContextStore((state) => state.setScenario);
  const requestControlFocus = useContextStore((state) => state.requestControlFocus);

  const startTour = () => {
    setDemoMode(true);
    setCoachStep(0);
  };

  const openStock = (sessionDate: string, selector: string, panel: 'flow' | null = null) => {
    // Hide the coach first so its step effect cannot re-pin another context
    // over the shortcut the evaluator just chose.
    setCoachStep(-1);
    setScenario('default');
    selectSession(sessionDate);
    requestControlFocus(selector, panel);
    navigate(`/stock/${ticker}`);
  };

  // The Claim Check example lives on the Method page, pinned to its own
  // snapshot; the shortcut goes there instead of hunting a selector the stock
  // screen no longer carries.
  const openMethod = (sessionDate: string, selector: string) => {
    setCoachStep(-1);
    setScenario('default');
    selectSession(sessionDate);
    requestControlFocus(selector, 'claim-check');
    navigate('/research');
  };

  const target = (sessionDate: string) =>
    t('explore.target', { ticker, date: formatSessionDate(sessionDate, locale) });

  const actions: { icon: IconName; label: string; hint: string; onClick: () => void }[] = [
    {
      icon: 'tour',
      label: demoMode ? t('explore.restartTour') : t('explore.tour'),
      hint: t('explore.tourHint'),
      onClick: startTour,
    },
    {
      icon: 'check',
      label: t('explore.claim'),
      hint: t('explore.claimHint', { date: formatSessionDate(CLAIM_CHECK_SESSION, locale) }),
      onClick: () => openMethod(CLAIM_CHECK_SESSION, '[data-claim-check="C12"]'),
    },
    {
      icon: 'thesis',
      label: t('explore.thesis'),
      hint: target(THESIS_SESSION),
      onClick: () => openStock(THESIS_SESSION, '#thesis-ask'),
    },
    {
      icon: 'assumption',
      label: t('explore.assumption'),
      hint: target(THESIS_SESSION),
      onClick: () => openStock(THESIS_SESSION, '[data-assume-broker]', 'flow'),
    },
  ];

  if (variant === 'compact') {
    return (
      <section
        aria-label={t('explore.title')}
        className="card flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 sm:px-5"
      >
        <h2 className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
          <Icon name="tour" className="h-4 w-4 text-brandDeep" />
          {t('explore.title')}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              title={action.hint}
              className="btn btn-quiet px-2.5 py-1 text-xs"
            >
              <Icon name={action.icon} className="h-3.5 w-3.5 text-brandDeep" />
              {action.label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label={t('explore.title')} className="card card-pad">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold tracking-tight">{t('explore.title')}</h2>
        <span className="chip chip-line">
          <Icon name="tour" className="h-3.5 w-3.5" />
          {t('badge.historical')}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">{t('explore.intro')}</p>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="card-inset flex flex-col items-start gap-1 p-3 text-left transition-colors hover:border-brand/60 hover:bg-brand/5"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Icon name={action.icon} className="h-4 w-4 text-brandDeep" />
              {action.label}
            </span>
            <span className="text-xs leading-snug text-muted">{action.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
