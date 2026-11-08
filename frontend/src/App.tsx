import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { StoreProvider } from './state/store';
import { ModernProvider } from './modern/store';
import { Shell } from './components/shell';
import Landing from './screens/Landing';
import Console from './console/Console';
import Verify from './console/Verify';
import Preflight from './preflight/Preflight';
import { M1Import, M2Recover, M3Generate, M4Test, M5Release } from './modern/Modernize';
import Setup from './retrofit/Setup';
import { RetrofitProvider, useRetrofit } from './retrofit/store';

// The retrofit setup is required first; the operations dashboard opens only after v1 is accepted and handed over.
function Home() { const { st } = useRetrofit(); return st.done ? <Console /> : <Navigate to="/setup" replace />; }

export default function App() {
  return (
    <StoreProvider>
      <ModernProvider>
        <RetrofitProvider>
        <HashRouter>
          <Routes>
            <Route path="/about" element={<Landing />} />
            <Route path="/welcome" element={<Navigate to="/about" replace />} />
            <Route element={<Shell><Outlet /></Shell>}>
              <Route path="/" element={<Home />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/preflight" element={<Preflight />} />
              <Route path="/modernize" element={<Navigate to="/modernize/import" replace />} />
              <Route path="/modernize/import" element={<M1Import />} />
              <Route path="/modernize/recover" element={<M2Recover />} />
              <Route path="/modernize/generate" element={<M3Generate />} />
              <Route path="/modernize/test" element={<M4Test />} />
              <Route path="/modernize/release" element={<M5Release />} />
              {/* Retired screens (old R1–R5 operate flow, check_rack_inlet demo) contradicted the console; their links land on the live console */}
              {['/operate/*', '/checks', '/read/*', '/find/*', '/prove/*', '/handoff'].map((p) => <Route key={p} path={p} element={<Navigate to="/" replace />} />)}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
        </RetrofitProvider>
      </ModernProvider>
    </StoreProvider>
  );
}
