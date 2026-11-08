import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { StoreProvider } from './state/store';
import { ModernProvider } from './modern/store';
import { Shell } from './components/shell';
import Landing from './screens/Landing';
import Preflight from './preflight/Preflight';
import Checks from './screens/Checks';
import Read from './screens/Read';
import Find from './screens/Find';
import Prove from './screens/Prove';
import Handoff from './screens/Handoff';
import { M1Import, M2Recover, M3Generate, M4Test, M5Release } from './modern/Modernize';
import { OpsAlerts, OpsInvestigate, OpsHandoff } from './modern/Operate';

export default function App() {
  return (
    <StoreProvider>
      <ModernProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/preflight" replace />} />
            <Route path="/welcome" element={<Landing />} />
            <Route element={<Shell><Outlet /></Shell>}>
              <Route path="/preflight" element={<Preflight />} />
              <Route path="/modernize" element={<Navigate to="/modernize/import" replace />} />
              <Route path="/modernize/import" element={<M1Import />} />
              <Route path="/modernize/recover" element={<M2Recover />} />
              <Route path="/modernize/generate" element={<M3Generate />} />
              <Route path="/modernize/test" element={<M4Test />} />
              <Route path="/modernize/release" element={<M5Release />} />
              <Route path="/operate" element={<OpsAlerts />} />
              <Route path="/operate/investigate" element={<OpsInvestigate />} />
              <Route path="/operate/handoff" element={<OpsHandoff />} />
              {/* Earlier check_rack_inlet demo, kept reachable but out of the main nav */}
              <Route path="/checks" element={<Checks />} />
              <Route path="/read/:checkId" element={<Read />} />
              <Route path="/find/:checkId" element={<Find />} />
              <Route path="/prove/:checkId" element={<Prove />} />
              <Route path="/handoff" element={<Handoff />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ModernProvider>
    </StoreProvider>
  );
}
