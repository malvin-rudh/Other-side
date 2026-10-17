import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../i18n';
import { useContextStore } from '../store/contextStore';

import { tourCopy, TOUR_STEP_COUNT } from '../i18n/tourCopy';

const STEP_COUNT = TOUR_STEP_COUNT;

interface CoachStepSpec {
  path: string;
  sessionDate: string;
  briefDate: string | null;
}

// Order matches the steps in i18n/tourCopy.ts.
const STEPS: readonly CoachStepSpec[] = [
  { path: '/', sessionDate: '2026-08-24', briefDate: '2026-08-26' },
  { path: '/stock/SINI', sessionDate: '2026-08-24', briefDate: null },
  { path: '/stock/SINI', sessionDate: '2026-08-24', briefDate: null },
  { path: '/stock/SINI', sessionDate: '2026-08-24', briefDate: null },
  { path: '/stock/SINI', sessionDate: '2026-08-24', briefDate: null },
  { path: '/stock/SINI', sessionDate: '2026-09-23', briefDate: null },
  { path: '/stocks', sessionDate: '2026-09-23', briefDate: null },
  { path: '/portfolio', sessionDate: '2026-09-23', briefDate: null },
  { path: '/', sessionDate: '2026-09-23', briefDate: '2026-09-24' },
];

// Steps whose coach panel docks under the screen header instead of the bottom
// corner, so it never covers the control the step is talking about.
const TOP_LEFT_STEPS = new Set([1, 7]);
const TOP_RIGHT_STEPS = new Set([0]);

export function DemoCoach() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const demoMode = useContextStore((state) => state.demoMode);
  const coachStep = useContextStore((state) => state.coachStep);
  const setCoachStep = useContextStore((state) => state.setCoachStep);
  const selectSession = useContextStore((state) => state.selectSession);
  const setBriefDate = useContextStore((state) => state.setBriefDate);
  const dockTopLeft = TOP_LEFT_STEPS.has(coachStep);
  const dockTopRight = TOP_RIGHT_STEPS.has(coachStep);
  const [dockTop, setDockTop] = useState<number | null>(null);

  useEffect(() => {
    if (!demoMode || (!dockTopLeft && !dockTopRight)) return;
    let raf2 = 0;
    const measure = () => {
      const anchor =
        document.getElementById('stock-header') ??
        document.getElementById('brief-header') ??
        document.getElementById('stock-title')?.closest('header') ??
        null;
      setDockTop(anchor ? Math.max(64, Math.ceil(anchor.getBoundingClientRect().bottom) + 8) : null);
    };
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener('resize', measure);
    };
  }, [demoMode, dockTopLeft, dockTopRight, coachStep]);

  useEffect(() => {
    if (!demoMode || coachStep < 0 || coachStep >= STEP_COUNT) return;
    const spec = STEPS[coachStep];
    if (!spec) return;
    navigate(spec.path, { replace: true });
    selectSession(spec.sessionDate);
    setBriefDate(spec.briefDate);
  }, [demoMode, coachStep, navigate, selectSession, setBriefDate]);

  useEffect(() => {
    if (!demoMode) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[role="dialog"]') !== null) return;
      setCoachStep(-1);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [demoMode, setCoachStep]);

  if (!demoMode || coachStep < 0 || coachStep >= STEP_COUNT) return null;

  const spec = STEPS[coachStep];
  if (!spec) return null;
  const copy = tourCopy(locale).steps[coachStep];
  if (!copy) return null;
  const isLast = coachStep === STEP_COUNT - 1;
  const coachStyle = dockTop !== null ? ({ '--coach-top': `${dockTop}px` } as CSSProperties) : undefined;
  const dockClass = dockTopLeft
    ? 'left-4 top-[var(--coach-top,4.5rem)]'
    : dockTopRight
      ? 'bottom-20 right-4 md:bottom-6 lg:bottom-auto lg:right-8 lg:top-[var(--coach-top,4.5rem)]'
      : 'bottom-20 right-4 md:bottom-6';

  return (
    <aside
      aria-label={t('demo.title')}
      data-demo-coach={coachStep + 1}
      style={coachStyle}
      className={`fixed z-50 w-[min(21rem,calc(100vw-2rem))] animate-panel-in rounded-xl border border-navy bg-navy p-3.5 shadow-lift ${dockClass}`}
    >
      <div aria-live="polite">
        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-brand">
          {t('demo.stepCounter', { current: String(coachStep + 1), total: String(STEP_COUNT) })}
        </p>
        <h2 className="mt-1 text-sm font-semibold text-white">{copy.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-white/70">{copy.body}</p>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setCoachStep(coachStep - 1)}
          disabled={coachStep === 0}
          className="btn btn-nav px-2.5 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t('demo.back')}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCoachStep(-1)}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            {t('demo.hide')}
          </button>
          <button
            type="button"
            onClick={() => setCoachStep(isLast ? -1 : coachStep + 1)}
            className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-navy transition-colors hover:bg-brandDeep hover:text-white"
          >
            {isLast ? t('demo.done') : t('demo.next')}
          </button>
        </div>
      </div>
    </aside>
  );
}
