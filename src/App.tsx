import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { fetchManifest } from './engine/manifest';
import { useContextStore } from './store/contextStore';
import { BriefScreen } from './screens/BriefScreen';
import { StockScreen } from './screens/StockScreen';
import { StocksScreen } from './screens/StocksScreen';
import { PortfolioScreen } from './screens/PortfolioScreen';
import { MethodScreen } from './screens/MethodScreen';
import { ResearchScreen } from './screens/ResearchScreen';
import { ImportScreen } from './screens/ImportScreen';
import { GuidedTourScreen } from './screens/GuidedTourScreen';

export default function App() {
  const applyManifest = useContextStore((state) => state.applyManifest);
  const setDemoMode = useContextStore((state) => state.setDemoMode);
  const setCoachStep = useContextStore((state) => state.setCoachStep);

  useEffect(() => {
    let cancelled = false;
    void fetchManifest().then((manifest) => {
      if (!cancelled) applyManifest(manifest);
    });
    return () => {
      cancelled = true;
    };
  }, [applyManifest]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('demo') === '1') {
      setDemoMode(true);
      setCoachStep(0);
    }
  }, [setDemoMode, setCoachStep]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<BriefScreen />} />
          <Route path="stocks" element={<StocksScreen />} />
          <Route path="portfolio" element={<PortfolioScreen />} />
          <Route path="stock/:ticker" element={<StockScreen />} />
          <Route path="method" element={<MethodScreen />} />
          <Route path="research" element={<ResearchScreen />} />
          <Route path="tour" element={<GuidedTourScreen />} />
          <Route path="import" element={<ImportScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
