import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { StoreProvider } from './state/store';
import { ModernProvider } from './modern/store';
import { Shell } from './components/shell';
import Landing from './screens/Landing';
import Console from './console/Console';
import Preflight from './preflight/Preflight';
import { M1Import, M2Recover, M3Generate, M4Test, M5Release } from './modern/Modernize';
import { RetrofitPage } from './retrofit/Retrofit';
import { RetrofitOverviewPage } from './retrofit/Overview';
import { FirmwarePage, HandoverPage, EvalPage } from './retrofit/Views';

export default function App() {
  return (
    <StoreProvider>
      <ModernProvider>
        <HashRouter>
          <Routes>
            <Route path="/about" element={<Landing />} />
            <Route path="/welcome" element={<Navigate to="/about" replace />} />
            <Route element={<Shell><Outlet /></Shell>}>
              <Route path="/" element={<Console />} />
              <Route path="/verify" element={<Navigate to="/modernize/test" replace />} />
              <Route path="/preflight" element={<Preflight />} />
              <Route path="/modernize" element={<Navigate to="/modernize/import" replace />} />
              <Route path="/modernize/import" element={<M1Import />} />
              <Route path="/modernize/recover" element={<M2Recover />} />
              <Route path="/modernize/generate" element={<M3Generate />} />
              <Route path="/modernize/test" element={<M4Test />} />
              <Route path="/modernize/release" element={<M5Release />} />
              <Route path="/modernize/retrofit" element={<RetrofitOverviewPage />} />
              <Route path="/modernize/retrofit/mapping" element={<RetrofitPage />} />
              <Route path="/modernize/retrofit/firmware" element={<FirmwarePage />} />
              <Route path="/modernize/retrofit/handover" element={<HandoverPage />} />
              <Route path="/evidence/retrofit" element={<EvalPage />} />
              <Route path="/retrofit" element={<Navigate to="/modernize/retrofit/mapping" replace />} />
              <Route path="/retrofit/firmware" element={<Navigate to="/modernize/retrofit/firmware" replace />} />
              <Route path="/retrofit/handover" element={<Navigate to="/modernize/retrofit/handover" replace />} />
              <Route path="/retrofit/eval" element={<Navigate to="/evidence/retrofit" replace />} />
              {/* Retired screens (old R1–R5 operate flow, check_rack_inlet demo) contradicted the console; their links land on the live console */}
              {['/operate/*', '/checks', '/read/*', '/find/*', '/prove/*', '/handoff'].map((p) => <Route key={p} path={p} element={<Navigate to="/" replace />} />)}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ModernProvider>
    </StoreProvider>
  );
}
