import type { DataMode } from '../data/instruments';
import { useTranslation } from '../i18n';

const CHIP_CLASS: Record<DataMode, string> = {
  verified: 'chip chip-buy',
  sample: 'chip chip-unknown',
  provider: 'chip chip-brand',
};

// The data mode is always stated next to the ticker. A sample fixture must never
// be able to pass for reviewed historical data anywhere in the app.
export function DataModeChip({ mode }: { mode: DataMode }) {
  const { t } = useTranslation();
  const label =
    mode === 'verified'
      ? t('dataMode.verified')
      : mode === 'sample'
        ? t('dataMode.sample')
        : t('dataMode.provider');
  return <span className={CHIP_CLASS[mode]}>{label}</span>;
}
