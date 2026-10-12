import { StateBlock } from '../components/StateBlock';
import { useTranslation } from '../i18n';

export function ImportScreen() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="import-title">
      <header>
        <p className="eyebrow">{t('app.pill')}</p>
        <h1 id="import-title" className="mt-1 text-2xl font-semibold tracking-tight lg:text-[2rem] lg:leading-tight">
          {t('import.title')}
        </h1>
      </header>
      <div className="card card-pad mt-5">
        <StateBlock title={t('states.unavailable')} body={<p>{t('import.pending')}</p>} />
        <p className="mt-4 text-sm leading-relaxed text-muted">{t('import.note')}</p>
      </div>
    </section>
  );
}
