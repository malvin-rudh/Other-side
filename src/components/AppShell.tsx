import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { usePublicData } from '../data/publicData';
import { useContextStore } from '../store/contextStore';
import { formatSessionDate, useTranslation } from '../i18n';
import { radarCopy } from '../i18n/radarCopy';
import { DemoCoach } from './DemoCoach';
import { Icon, type IconName } from './Icon';

const PRIMARY_PATHS = new Set(['/', '/stocks', '/portfolio']);

const railLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex items-center rounded-lg px-3 py-2 text-sm transition-colors ${
    isActive ? 'bg-white/10 font-semibold text-white' : 'text-white/65 hover:bg-white/5 hover:text-white'
  }`;

const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex h-full flex-col items-center justify-center gap-1 text-xs transition-colors ${
    isActive ? 'font-semibold text-brandDeep' : 'text-muted hover:text-ink'
  }`;

export function AppShell() {
  const { t, locale } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  // The page scrolls as a whole, so without this a new page opens at the scroll
  // position of the page it was opened from. A new page starts at the top; Back
  // and Forward return to where that page was left.
  const scrollByKey = useRef(new Map<string, number>());
  useEffect(() => {
    const key = location.key;
    const remember = () => scrollByKey.current.set(key, window.scrollY);
    window.addEventListener('scroll', remember, { passive: true });
    return () => window.removeEventListener('scroll', remember);
  }, [location.key]);
  useLayoutEffect(() => {
    const saved = navigationType === 'POP' ? scrollByKey.current.get(location.key) : undefined;
    window.scrollTo(0, saved ?? 0);
  }, [location.key, navigationType]);
  const setLocale = useContextStore((state) => state.setLocale);
  const demoMode = useContextStore((state) => state.demoMode);
  const dataThrough = useContextStore((state) => state.dataThrough);
  const selectedSessionDate = useContextStore((state) => state.selectedSessionDate);
  const viewSnapshot = useContextStore((state) => state.viewSnapshot);

  // On the brief the snapshot on screen is the one the selected morning resolves
  // to, and on research it is the worked-example session; either can differ from
  // the last session visited on the stock screen.
  const pathname = location.pathname;
  const pinnedSnapshot =
    (pathname === '/' || pathname === '/research') && viewSnapshot?.route === pathname
      ? viewSnapshot.date
      : undefined;
  // A stock's analysis page keeps the section it was opened from highlighted
  // (Brief, Live Radar or Portfolio). The origin is remembered per history
  // entry so Back and Forward keep it; a page loaded directly falls under Brief.
  const lastSection = useRef('/');
  const originByKey = useRef(new Map<string, string>());
  if (PRIMARY_PATHS.has(pathname)) lastSection.current = pathname;
  let stockOrigin: string | null = null;
  if (pathname.startsWith('/stock/')) {
    stockOrigin = originByKey.current.get(location.key) ?? lastSection.current;
    originByKey.current.set(location.key, stockOrigin);
  }
  const isPrimaryActive = (to: string, isActive: boolean) => (stockOrigin !== null ? to === stockOrigin : isActive);
  const pinnedDate = pinnedSnapshot !== undefined ? pinnedSnapshot : selectedSessionDate;
  // Pages opened from Brief, Live Radar or Portfolio (the analysis page) get a
  // back button. With no earlier page in this tab it goes to the Brief.
  const showBack = pathname.startsWith('/stock/');
  const goBack = () => (location.key !== 'default' ? navigate(-1) : navigate('/'));

  const primaryRoutes: { to: string; end: boolean; label: string; icon: IconName }[] = [
    { to: '/', end: true, label: t('nav.brief'), icon: 'brief' },
    { to: '/stocks', end: false, label: radarCopy(locale).nav, icon: 'radar' },
    { to: '/portfolio', end: false, label: t('nav.portfolio'), icon: 'portfolio' },
  ];

  // Secondary destinations: still one click away, but out of the reading path.
  // Full stock analysis is reached through contextual links instead of a
  // per-ticker nav entry.
  const secondaryRoutes: { to: string; end: boolean; label: string; icon: IconName }[] = [
    { to: '/research', end: false, label: t('nav.research'), icon: 'thesis' },
    { to: '/tour', end: false, label: t('nav.tour'), icon: 'tour' },
  ];

  // Both overflow menus share this dismiss logic; only one is ever on screen
  // because the tablet header nav and the mobile bottom bar are disjoint.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (moreRef.current !== null && !moreRef.current.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [moreOpen]);
  useEffect(() => setMoreOpen(false), [location.pathname]);

  // The replay covers the verified case's window, up to the session on screen.
  const calendar = usePublicData('SINI');
  const rangeStart = calendar.status === 'ready' ? calendar.data.defaultWindow.start : null;
  const rangeEnd = pinnedDate ?? dataThrough;
  const rangeText =
    rangeEnd === null
      ? t('badge.dataThroughPending')
      : rangeStart !== null && rangeStart <= rangeEnd
        ? t('badge.dataRange', {
            from: formatSessionDate(rangeStart, locale),
            to: formatSessionDate(rangeEnd, locale),
          })
        : t('badge.dataThrough', { date: formatSessionDate(rangeEnd, locale) });

  const replayBadge = (
    <>
      {pinnedDate ? (
        <>
          <span className="hidden min-[480px]:inline">
            {t('badge.historical')}
            {' · '}
            {rangeText}
          </span>
          <span className="min-[480px]:hidden">{t('badge.replayShort', { date: formatSessionDate(pinnedDate, locale) })}</span>
        </>
      ) : (
        <span className="hidden min-[480px]:inline">
          {t('badge.historical')}
          {' · '}
          {rangeText}
        </span>
      )}
    </>
  );

  const localeSwitch = (tone: 'rail' | 'light') => (
    <div role="group" aria-label={t('locale.label')} className="flex items-center gap-1">
      {(['en', 'id', 'zh-CN'] as const).map((code) => {
        const active = locale === code;
        const classes =
          tone === 'rail'
            ? `rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                active ? 'bg-brand text-navy' : 'text-white/65 hover:bg-white/10 hover:text-white'
              }`
            : `rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
                active ? 'bg-brand/15 text-brandDeep' : 'text-muted hover:bg-canvas hover:text-ink'
              }`;
        return (
          <button key={code} type="button" aria-pressed={active} onClick={() => setLocale(code)} className={classes}>
            {t(`locale.${code}`)}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 border-r border-white/10 bg-navy px-4 py-6 lg:flex">
        <div>
          <Link to="/" className="block text-lg font-semibold tracking-tight text-white">
            {t('app.wordmark')}
          </Link>
          <p className="mt-2 text-[11px] leading-snug text-white/55">{t('app.pill')}</p>
        </div>

        <nav aria-label="Primary" className="flex flex-col gap-1">
          {primaryRoutes.map((route) => (
            <NavLink key={route.to} to={route.to} end={route.end} className={({ isActive }) => railLinkClass({ isActive: isPrimaryActive(route.to, isActive) })}>
              {({ isActive }) => (
                <>
                  {isPrimaryActive(route.to, isActive) ? (
                    <span aria-hidden="true" className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-brand" />
                  ) : null}
                  <span className="mr-2 text-white/45">
                    <Icon name={route.icon} />
                  </span>
                  {route.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <nav aria-label={t('nav.secondaryAria')} className="flex flex-col gap-1 border-t border-white/10 pt-4">
          <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.09em] text-white/35">
            {t('nav.secondaryAria')}
          </p>
          {secondaryRoutes.map((route) => (
            <NavLink key={route.to} to={route.to} end={route.end} className={railLinkClass}>
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span aria-hidden="true" className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-brand" />
                  ) : null}
                  <span className="mr-2 text-white/45">
                    <Icon name={route.icon} />
                  </span>
                  {route.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3">
          {localeSwitch('rail')}
          <p className="text-[11px] leading-snug text-white/55">
            {t('badge.historical')}
            <br />
            {rangeText}
          </p>
          <p className="text-[11px] leading-snug text-white/40">{t('footer.line')}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 lg:h-auto lg:px-8 lg:py-3">
            <Link to="/" className="text-base font-semibold tracking-tight lg:hidden">
              {t('app.wordmark')}
            </Link>
            {showBack ? (
              <button
                type="button"
                onClick={goBack}
                aria-label={t('nav.back')}
                title={t('nav.back')}
                data-testid="back-button"
                className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-brand hover:text-brandDeep"
              >
                <Icon name="prev" className="h-4 w-4" />
                <span className="hidden sm:inline">{t('nav.back')}</span>
              </button>
            ) : null}
            <span className="chip chip-line lg:hidden">{t('app.pill')}</span>
            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <span className="chip chip-brand">
                <span aria-hidden="true">◷</span>
                {t('badge.historical')}
              </span>
              <span className={`truncate text-sm ${pinnedDate ? 'font-semibold text-ink' : 'text-muted'}`}>
                {rangeText}
              </span>
            </div>
            <span className="text-xs text-muted lg:hidden">{replayBadge}</span>
            <div className="ml-auto flex items-center gap-3">
              <nav aria-label="Primary" className="hidden items-center gap-1 md:flex lg:hidden">
                {primaryRoutes.map((route) => (
                  <NavLink
                    key={route.to}
                    to={route.to}
                    end={route.end}
                    className={({ isActive: linkActive }) =>
                      `rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        isPrimaryActive(route.to, linkActive) ? 'bg-brand/10 font-semibold text-brandDeep' : 'text-muted hover:bg-canvas hover:text-ink'
                      }`
                    }
                  >
                    {route.label}
                  </NavLink>
                ))}
                <div ref={moreRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setMoreOpen((open) => !open)}
                    aria-expanded={moreOpen}
                    aria-haspopup="menu"
                    aria-label={t('nav.moreAria')}
                    title={t('nav.more')}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                      moreOpen ? 'bg-brand/10 text-brandDeep' : 'text-muted hover:bg-canvas hover:text-ink'
                    }`}
                  >
                    <Icon name="more" />
                  </button>
                  {moreOpen ? (
                    <div
                      role="menu"
                      aria-label={t('nav.moreAria')}
                      className="absolute right-0 top-full z-30 mt-1 w-40 animate-panel-in rounded-xl border border-line bg-surface p-1 shadow-lift"
                    >
                      {secondaryRoutes.map((route) => (
                        <NavLink
                          key={route.to}
                          to={route.to}
                          end={route.end}
                          role="menuitem"
                          onClick={() => setMoreOpen(false)}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink"
                        >
                          <Icon name={route.icon} className="h-4 w-4" />
                          {route.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              </nav>
              <span className="lg:hidden">{localeSwitch('light')}</span>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:pb-10 lg:px-8 lg:pb-14 lg:pt-8">
          <Outlet />
        </main>

        <footer className="hidden border-t border-line py-4 md:block">
          <p className="mx-auto w-full max-w-6xl px-4 text-xs text-muted lg:px-8">{t('footer.line')}</p>
        </footer>
      </div>

      <div ref={moreRef} className="fixed inset-x-0 bottom-0 z-20 md:hidden">
        {moreOpen ? (
          <div
            role="menu"
            aria-label={t('nav.moreAria')}
            className="mx-3 mb-2 animate-panel-in rounded-xl border border-line bg-surface p-1 shadow-lift"
          >
            {secondaryRoutes.map((route) => (
              <NavLink
                key={route.to}
                to={route.to}
                end={route.end}
                role="menuitem"
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <Icon name={route.icon} className="h-4 w-4" />
                {route.label}
              </NavLink>
            ))}
          </div>
        ) : null}

        <nav
          aria-label={t('nav.mobileNavAria')}
          className="grid h-16 grid-cols-4 border-t border-line bg-surface"
        >
          {primaryRoutes.map((route) => (
            <NavLink key={route.to} to={route.to} end={route.end} className={({ isActive }) => mobileNavLinkClass({ isActive: isPrimaryActive(route.to, isActive) })}>
              {({ isActive }) => (
                <>
                  {isPrimaryActive(route.to, isActive) ? (
                    <span aria-hidden="true" className="absolute inset-x-6 top-0 h-0.5 rounded-b bg-brand" />
                  ) : null}
                  <Icon name={route.icon} className="h-[18px] w-[18px]" />
                  <span className="truncate px-1">{route.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`relative flex h-full flex-col items-center justify-center gap-1 text-xs transition-colors ${
              moreOpen ? 'font-semibold text-brandDeep' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon name="more" className="h-[18px] w-[18px]" />
            <span className="truncate px-1">{t('nav.more')}</span>
          </button>
        </nav>
      </div>

      {demoMode ? <DemoCoach /> : null}
    </div>
  );
}
