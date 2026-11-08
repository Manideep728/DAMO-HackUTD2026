import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { StoreProvider } from './state/store';
import { Shell } from './components/shell';
import Checks from './screens/Checks';
import Read from './screens/Read';
import Find from './screens/Find';
import Prove from './screens/Prove';
import Handoff from './screens/Handoff';

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell>
          <Routes>
            <Route path="/" element={<Checks />} />
            <Route path="/read/:checkId" element={<Read />} />
            <Route path="/find/:checkId" element={<Find />} />
            <Route path="/prove/:checkId" element={<Prove />} />
            <Route path="/handoff" element={<Handoff />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </HashRouter>
    </StoreProvider>
  );
}
